import { describe, expect, it } from "vitest";
import {
	createEmptySimulation,
	type PilotControlState,
	type SimulationSnapshot,
} from "../../game-core/src/index";

/**
 * Fixed replay timing used for M4 deterministic baseline checks.
 * Keeping this value explicit makes it easy to compare test traces to
 * browser runtime traces, which currently run on the same fixed step.
 */
const REPLAY_STEP_MS = 16.67;

/**
 * Replay length long enough to exercise:
 * - flight controls
 * - warp toggling
 * - missile/laser/ECM transitions
 * - docking and launch attempts
 */
const REPLAY_TOTAL_FRAMES = 600;

/**
 * Single canonical seed for baseline replay checks.
 * If we ever change this seed, expected baseline digests must be regenerated.
 */
const REPLAY_SEED = 0x1a2b3c4d;

/**
 * Tick where the restore/continue determinism check snapshots state.
 * Tick 300 sits near the middle of the replay so both halves are non-trivial.
 */
const RESTORE_TICK = 300;

/**
 * Scripted replay checkpoints.
 * We only assert digest values at these ticks to keep expectations compact
 * while still catching regressions across the whole replay.
 */
const REPLAY_CHECKPOINT_TICKS = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600] as const;

/**
 * Replay keyframes.
 * Each keyframe mutates one or more control values; values persist until
 * another keyframe overwrites them.
 */
const REPLAY_KEYFRAMES: ReadonlyArray<{
	frame: number;
	updates: Partial<PilotControlState>;
}> = [
	{ frame: 0, updates: { throttleAxis: 1, rollAxis: 0.3, pitchAxis: 0.1 } },
	{ frame: 2, updates: { warpTogglePressed: true } },
	{ frame: 3, updates: { warpTogglePressed: false } },
	{ frame: 40, updates: { warpTogglePressed: true } },
	{ frame: 41, updates: { warpTogglePressed: false } },
	{ frame: 60, updates: { throttleAxis: 0, rollAxis: 0, pitchAxis: 0 } },
	{ frame: 70, updates: { missileArmTogglePressed: true } },
	{ frame: 71, updates: { missileArmTogglePressed: false } },
	{ frame: 90, updates: { fireLaserPressed: true } },
	{ frame: 120, updates: { missileFirePressed: true } },
	{ frame: 121, updates: { missileFirePressed: false } },
	{ frame: 130, updates: { fireLaserPressed: false } },
	{ frame: 150, updates: { ecmTogglePressed: true } },
	{ frame: 151, updates: { ecmTogglePressed: false } },
	{ frame: 190, updates: { ecmTogglePressed: true } },
	{ frame: 191, updates: { ecmTogglePressed: false } },
	{ frame: 220, updates: { throttleAxis: -1 } },
	{ frame: 300, updates: { dockAttemptPressed: true } },
	{ frame: 301, updates: { dockAttemptPressed: false } },
	{ frame: 360, updates: { dockAttemptPressed: true } },
	{ frame: 361, updates: { dockAttemptPressed: false } },
	{ frame: 420, updates: { dockAttemptPressed: true } },
	{ frame: 421, updates: { dockAttemptPressed: false } },
	{ frame: 500, updates: { launchPressed: true } },
	{ frame: 501, updates: { launchPressed: false } },
	{ frame: 520, updates: { throttleAxis: 0.4, rollAxis: -0.25, pitchAxis: -0.15 } },
] as const;

/**
 * Baseline digest checkpoints for the scripted replay.
 * Populated after first baseline capture.
 */
const EXPECTED_CHECKPOINT_DIGESTS: ReadonlyArray<{ tick: number; digest: string }> = [
	{ tick: 60, digest: "87bd4a14" },
	{ tick: 120, digest: "172bb19f" },
	{ tick: 180, digest: "df70ba54" },
	{ tick: 240, digest: "861d4df8" },
	{ tick: 300, digest: "dcd425e4" },
	{ tick: 360, digest: "97c70f68" },
	{ tick: 420, digest: "fcbfd9d5" },
	{ tick: 480, digest: "bf210b5a" },
	{ tick: 540, digest: "08bce03a" },
	{ tick: 600, digest: "eddb1cf5" },
] as const;

/**
 * Final digest for the full scripted replay.
 */
const EXPECTED_FINAL_DIGEST = "eddb1cf5";

function createNeutralControls(): PilotControlState {
	return {
		rollAxis: 0,
		pitchAxis: 0,
		throttleAxis: 0,
		warpTogglePressed: false,
		escapePodPressed: false,
		fireLaserPressed: false,
		missileArmTogglePressed: false,
		missileFirePressed: false,
		ecmTogglePressed: false,
		dockAttemptPressed: false,
		launchPressed: false,
	};
}

/**
 * Build fast frame -> updates lookup once for replay loops.
 */
function createKeyframeLookup(): Map<number, Partial<PilotControlState>> {
	const lookup = new Map<number, Partial<PilotControlState>>();
	for (const keyframe of REPLAY_KEYFRAMES) {
		lookup.set(keyframe.frame, keyframe.updates);
	}
	return lookup;
}

/**
 * Round floating-point values before hashing to avoid tiny formatting noise
 * from becoming digest churn.
 */
function round(value: number, places = 6): number {
	return Number(value.toFixed(places));
}

/**
 * Build a compact, stable replay projection to hash.
 * We include enough state to catch meaningful behavior drift without hashing
 * the entire snapshot payload verbatim.
 */
function projectSnapshot(snapshot: SimulationSnapshot): Record<string, unknown> {
	const gameState = snapshot.gameState;
	return {
		tick: snapshot.tick,
		rngState: snapshot.rngState >>> 0,
		headingDeg: round(gameState.flight.headingDeg),
		speed: round(gameState.flight.speed),
		energy: round(gameState.flight.energy),
		forwardShield: round(gameState.flight.forwardShield),
		aftShield: round(gameState.flight.aftShield),
		missileCount: gameState.flight.missileCount,
		missileArmed: gameState.flight.missileArmed,
		missileTargetSlotId: gameState.flight.missileTargetSlotId,
		missileLockTimerMs: round(gameState.flight.missileLockTimerMs),
		ecmEnabled: gameState.views.ecmEnabled,
		ecmActiveMs: round(gameState.flight.ecmActiveMs),
		isDocked: gameState.views.isDocked,
		inStationSafeZone: gameState.views.inStationSafeZone,
		stationDistance: round(gameState.flight.stationDistance),
		legalStatus: gameState.commander.legalStatus,
		phase: gameState.flow.phase,
		entryPoint: gameState.flow.currentEntryPoint,
		objectCount: gameState.universe.localBubbleShips.length,
		ships: gameState.universe.localBubbleShips
			.map((ship) => ({
				slotId: ship.slotId,
				kind: ship.kind,
				hullStrength: round(ship.hullStrength),
				z: round(ship.position.z),
			}))
			.sort((left, right) => left.slotId - right.slotId),
	};
}

/**
 * Tiny deterministic hash for replay projections.
 * FNV-1a keeps expectations concise while still being sensitive to drift.
 */
function hashFNV1a32(text: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, "0");
}

/**
 * Compute one digest from a simulation snapshot projection.
 */
function digestSnapshot(snapshot: SimulationSnapshot): string {
	return hashFNV1a32(JSON.stringify(projectSnapshot(snapshot)));
}

interface ReplayRunResult {
	checkpointDigests: Array<{ tick: number; digest: string }>;
	finalDigest: string;
	finalSnapshot: SimulationSnapshot;
	controlsAfterRun: PilotControlState;
	restoreSnapshot: SimulationSnapshot | null;
}

/**
 * Run the scripted replay for one frame range.
 *
 * `startFrame`/`endFrame` use zero-based frame indices where frame 0 yields
 * tick 1 after one simulation step.
 */
function runReplayRange(options: {
	simulation: ReturnType<typeof createEmptySimulation>;
	controls: PilotControlState;
	startFrame: number;
	endFrame: number;
	captureRestoreTick?: number;
	includeCheckpointDigests: boolean;
	checkpointDigestTarget: Array<{ tick: number; digest: string }>;
}): SimulationSnapshot | null {
	const keyframeLookup = createKeyframeLookup();
	const checkpointSet = new Set<number>(REPLAY_CHECKPOINT_TICKS);
	let restoreSnapshot: SimulationSnapshot | null = null;

	for (let frame = options.startFrame; frame < options.endFrame; frame += 1) {
		const updates = keyframeLookup.get(frame);
		if (updates) {
			Object.assign(options.controls, updates);
		}

		options.simulation.setPilotControls(options.controls);
		options.simulation.step(REPLAY_STEP_MS);

		const tick = frame + 1;
		const snapshot = options.simulation.snapshot();

		if (options.captureRestoreTick !== undefined && tick === options.captureRestoreTick) {
			restoreSnapshot = snapshot;
		}

		if (options.includeCheckpointDigests && checkpointSet.has(tick)) {
			options.checkpointDigestTarget.push({
				tick,
				digest: digestSnapshot(snapshot),
			});
		}
	}

	return restoreSnapshot;
}

/**
 * Run the full scripted replay and optionally capture one restore snapshot.
 */
function runScriptedReplay(captureRestoreTick?: number): ReplayRunResult {
	const simulation = createEmptySimulation({
		scenarioId: "empty",
		seed: REPLAY_SEED,
	});
	const controls = createNeutralControls();
	const checkpointDigests: Array<{ tick: number; digest: string }> = [];
	const replayOptions: Parameters<typeof runReplayRange>[0] = {
		simulation,
		controls,
		startFrame: 0,
		endFrame: REPLAY_TOTAL_FRAMES,
		includeCheckpointDigests: true,
		checkpointDigestTarget: checkpointDigests,
	};

	if (captureRestoreTick !== undefined) {
		replayOptions.captureRestoreTick = captureRestoreTick;
	}

	const restoreSnapshot = runReplayRange(replayOptions);

	return {
		checkpointDigests,
		finalDigest: digestSnapshot(simulation.snapshot()),
		finalSnapshot: simulation.snapshot(),
		controlsAfterRun: { ...controls },
		restoreSnapshot,
	};
}

describe("deterministic replay baseline", () => {
	it("matches scripted checkpoint and final digests", () => {
		const replay = runScriptedReplay();

		if (process.env.PRINT_REPLAY_BASELINE === "1") {
			// Development helper to refresh digest constants when intended behavior changes.
			// This log is intentionally structured so it can be copied directly.
			console.log("REPLAY_CHECKPOINT_DIGESTS:", JSON.stringify(replay.checkpointDigests, null, 2));
			console.log("REPLAY_FINAL_DIGEST:", replay.finalDigest);
		}

		expect(replay.checkpointDigests).toEqual(EXPECTED_CHECKPOINT_DIGESTS);
		expect(replay.finalDigest).toBe(EXPECTED_FINAL_DIGEST);
	});

	it("restores at midpoint and preserves replay outcome", () => {
		const baseSimulation = createEmptySimulation({
			scenarioId: "empty",
			seed: REPLAY_SEED,
		});
		const baseControls = createNeutralControls();
		const baseCheckpointDigests: Array<{ tick: number; digest: string }> = [];

		const restoreSnapshot = runReplayRange({
			simulation: baseSimulation,
			controls: baseControls,
			startFrame: 0,
			endFrame: RESTORE_TICK,
			captureRestoreTick: RESTORE_TICK,
			includeCheckpointDigests: false,
			checkpointDigestTarget: baseCheckpointDigests,
		});

		if (!restoreSnapshot) {
			throw new Error("Expected midpoint restore snapshot to be captured.");
		}

		// Persist controls exactly as they stood at the restore boundary.
		const controlsAtRestoreBoundary = { ...baseControls };

		// Continue baseline simulation from the restore boundary.
		runReplayRange({
			simulation: baseSimulation,
			controls: baseControls,
			startFrame: RESTORE_TICK,
			endFrame: REPLAY_TOTAL_FRAMES,
			includeCheckpointDigests: false,
			checkpointDigestTarget: baseCheckpointDigests,
		});

		const restoredSimulation = createEmptySimulation({
			scenarioId: "empty",
			seed: 1,
		});
		restoredSimulation.restore(restoreSnapshot);

		// Resume controls from the same persisted state at the restore boundary.
		const restoredControls = { ...controlsAtRestoreBoundary };
		runReplayRange({
			simulation: restoredSimulation,
			controls: restoredControls,
			startFrame: RESTORE_TICK,
			endFrame: REPLAY_TOTAL_FRAMES,
			includeCheckpointDigests: false,
			checkpointDigestTarget: [],
		});

		expect(restoredSimulation.snapshot()).toEqual(baseSimulation.snapshot());
		expect(digestSnapshot(restoredSimulation.snapshot())).toBe(
			digestSnapshot(baseSimulation.snapshot()),
		);
	});

	it("produces identical output across independent full runs", () => {
		const firstRun = runScriptedReplay();
		const secondRun = runScriptedReplay();

		expect(secondRun.checkpointDigests).toEqual(firstRun.checkpointDigests);
		expect(secondRun.finalDigest).toBe(firstRun.finalDigest);
		expect(secondRun.finalSnapshot).toEqual(firstRun.finalSnapshot);
	});
});
