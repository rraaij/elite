import { createDeterministicRng } from "./random";
import {
	cloneCanonicalGameState,
	createCanonicalGameState,
	stepCanonicalGameState,
} from "./stateModel";

/**
 * Normalize heading into [0, 360) so debug output and tests stay readable.
 */
function normalizeHeading(angleDeg) {
	const wrapped = angleDeg % 360;
	return wrapped >= 0 ? wrapped : wrapped + 360;
}
/**
 * Clamp one value into an inclusive numeric range.
 */
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
/**
 * Builds one external snapshot from internal mutable state.
 * This always deep-clones canonical game state to preserve immutability.
 */
function toExternalSnapshot(state) {
	return {
		schemaVersion: 2,
		scenarioId: state.scenarioId,
		seed: state.seed >>> 0,
		rngState: state.rngState >>> 0,
		tick: state.tick,
		simulatedMs: state.simulatedMs,
		playerHeadingDeg: state.gameState.flight.headingDeg,
		playerSpeed: state.gameState.flight.speed,
		gameState: cloneCanonicalGameState(state.gameState),
	};
}
/**
 * Clamp one control axis to [-1, 1].
 */
function normalizeControlAxis(value) {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.min(1, Math.max(-1, value));
}
/**
 * Creates a default neutral control state.
 */
function createNeutralPilotControls() {
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
 * Converts an old M2 snapshot into canonical game state.
 */
function canonicalStateFromLegacySnapshot(snapshot) {
	const gameState = createCanonicalGameState(snapshot.scenarioId);
	gameState.flight.headingDeg = normalizeHeading(snapshot.playerHeadingDeg);
	gameState.flight.speed = clamp(snapshot.playerSpeed, 0, 40);
	gameState.timers.frameTicks = snapshot.tick;
	gameState.timers.missionTicks = snapshot.tick;
	return gameState;
}
/**
 * Minimal deterministic simulation used during migration.
 *
 * This version stores and steps a canonical domain model so subsystem ports can
 * add fidelity incrementally without changing snapshot contract shape again.
 */
export function createEmptySimulation(config) {
	const rng = createDeterministicRng(config.seed);
	// State is mutable internally but only exposed via defensive snapshots.
	const state = {
		schemaVersion: 2,
		scenarioId: config.scenarioId,
		seed: config.seed >>> 0,
		rngState: rng.getState(),
		tick: 0,
		simulatedMs: 0,
		gameState: createCanonicalGameState(config.scenarioId),
		pilotControls: createNeutralPilotControls(),
		previousWarpTogglePressed: false,
		previousEscapePodPressed: false,
		previousMissileArmTogglePressed: false,
		previousMissileFirePressed: false,
		previousEcmTogglePressed: false,
		previousDockAttemptPressed: false,
		previousLaunchPressed: false,
	};
	return {
		setPilotControls(controls) {
			// Normalize control payload here so state-model logic can assume bounded inputs.
			state.pilotControls = {
				rollAxis: normalizeControlAxis(controls.rollAxis),
				pitchAxis: normalizeControlAxis(controls.pitchAxis),
				throttleAxis: normalizeControlAxis(controls.throttleAxis),
				warpTogglePressed: controls.warpTogglePressed,
				escapePodPressed: controls.escapePodPressed,
				fireLaserPressed: controls.fireLaserPressed,
				missileArmTogglePressed: controls.missileArmTogglePressed,
				missileFirePressed: controls.missileFirePressed,
				ecmTogglePressed: controls.ecmTogglePressed,
				dockAttemptPressed: controls.dockAttemptPressed,
				launchPressed: controls.launchPressed,
			};
		},
		step(stepMs) {
			// Keep deterministic RNG taps explicit for reproducible replay traces.
			const headingJitter = Number((rng.nextUint32() & 0xff) % 5) - 2;
			const speedJitter = Number((rng.nextUint32() & 0xff) % 3) - 1;
			const spawnRoll = Number(rng.nextUint32() & 0xff);
			const requestWarpToggle =
				state.pilotControls.warpTogglePressed && !state.previousWarpTogglePressed;
			const requestEscapePod =
				state.pilotControls.escapePodPressed && !state.previousEscapePodPressed;
			const requestMissileArmToggle =
				state.pilotControls.missileArmTogglePressed && !state.previousMissileArmTogglePressed;
			const requestMissileFire =
				state.pilotControls.missileFirePressed && !state.previousMissileFirePressed;
			const requestEcmToggle =
				state.pilotControls.ecmTogglePressed && !state.previousEcmTogglePressed;
			const requestDockAttempt =
				state.pilotControls.dockAttemptPressed && !state.previousDockAttemptPressed;
			const requestLaunch = state.pilotControls.launchPressed && !state.previousLaunchPressed;
			stepCanonicalGameState(state.gameState, {
				stepMs,
				headingJitter,
				speedJitter,
				spawnRoll,
				controlRollAxis: state.pilotControls.rollAxis,
				controlPitchAxis: state.pilotControls.pitchAxis,
				controlThrottleAxis: state.pilotControls.throttleAxis,
				requestWarpToggle,
				requestEscapePod,
				requestFireLaser: state.pilotControls.fireLaserPressed,
				requestMissileArmToggle,
				requestMissileFire,
				requestEcmToggle,
				requestDockAttempt,
				requestLaunch,
			});
			// Capture current button level after processing edge-trigger transitions.
			state.previousWarpTogglePressed = state.pilotControls.warpTogglePressed;
			state.previousEscapePodPressed = state.pilotControls.escapePodPressed;
			state.previousMissileArmTogglePressed = state.pilotControls.missileArmTogglePressed;
			state.previousMissileFirePressed = state.pilotControls.missileFirePressed;
			state.previousEcmTogglePressed = state.pilotControls.ecmTogglePressed;
			state.previousDockAttemptPressed = state.pilotControls.dockAttemptPressed;
			state.previousLaunchPressed = state.pilotControls.launchPressed;
			state.tick += 1;
			state.simulatedMs += stepMs;
			state.rngState = rng.getState();
		},
		snapshot() {
			return toExternalSnapshot(state);
		},
		restore(snapshot) {
			if (snapshot.schemaVersion === 1) {
				// Upgrade legacy snapshots into canonical state on load.
				state.schemaVersion = 2;
				state.scenarioId = snapshot.scenarioId;
				state.seed = snapshot.seed >>> 0;
				state.tick = snapshot.tick;
				state.simulatedMs = snapshot.simulatedMs;
				state.rngState = snapshot.rngState >>> 0;
				state.gameState = canonicalStateFromLegacySnapshot(snapshot);
				state.pilotControls = createNeutralPilotControls();
				state.previousWarpTogglePressed = false;
				state.previousEscapePodPressed = false;
				state.previousMissileArmTogglePressed = false;
				state.previousMissileFirePressed = false;
				state.previousEcmTogglePressed = false;
				state.previousDockAttemptPressed = false;
				state.previousLaunchPressed = false;
				rng.setState(state.rngState);
				return;
			}
			state.schemaVersion = 2;
			state.scenarioId = snapshot.scenarioId;
			state.seed = snapshot.seed >>> 0;
			state.tick = snapshot.tick;
			state.simulatedMs = snapshot.simulatedMs;
			state.rngState = snapshot.rngState >>> 0;
			state.gameState = cloneCanonicalGameState(snapshot.gameState);
			state.pilotControls = createNeutralPilotControls();
			state.previousWarpTogglePressed = false;
			state.previousEscapePodPressed = false;
			state.previousMissileArmTogglePressed = false;
			state.previousMissileFirePressed = false;
			state.previousEcmTogglePressed = false;
			state.previousDockAttemptPressed = false;
			state.previousLaunchPressed = false;
			// Keep RNG stream aligned to restored state so future steps remain deterministic.
			rng.setState(state.rngState);
		},
	};
}
