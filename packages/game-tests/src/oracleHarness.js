import { createEmptySimulation } from "../../game-core/src/index.js";

function createDefaultPilotControls() {
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
function captureFrame(frame, snapshot) {
	return {
		frame,
		tick: snapshot.tick,
		rngState: snapshot.rngState,
		headingDegX100: Math.round(snapshot.playerHeadingDeg * 100),
		speedX100: Math.round(snapshot.playerSpeed * 100),
		phase: snapshot.gameState.flow.phase,
		isDocked: snapshot.gameState.views.isDocked,
		stationDistanceX10: Math.round(snapshot.gameState.flight.stationDistance * 10),
		shipCount: snapshot.gameState.universe.localBubbleShips.length,
		energy: snapshot.gameState.flight.energy,
		forwardShield: snapshot.gameState.flight.forwardShield,
		aftShield: snapshot.gameState.flight.aftShield,
		missileArmed: snapshot.gameState.flight.missileArmed,
		ecmEnabled: snapshot.gameState.views.ecmEnabled,
		creditsCenticredits: snapshot.gameState.commander.creditsCenticredits,
	};
}
export const ORACLE_SCENARIOS = [
	{
		id: "seed-12345678-flight-combat-cycle",
		seed: 0x12345678,
		totalFrames: 600,
		stepMs: 16.67,
		keyframes: [
			{ frame: 0, updates: { throttleAxis: 1, rollAxis: 0.3, pitchAxis: 0.1 } },
			{ frame: 2, updates: { warpTogglePressed: true } },
			{ frame: 3, updates: { warpTogglePressed: false } },
			{ frame: 60, updates: { throttleAxis: 0, rollAxis: 0, pitchAxis: 0 } },
			{ frame: 80, updates: { missileArmTogglePressed: true } },
			{ frame: 81, updates: { missileArmTogglePressed: false } },
			{ frame: 110, updates: { fireLaserPressed: true } },
			{ frame: 160, updates: { fireLaserPressed: false } },
			{ frame: 200, updates: { ecmTogglePressed: true } },
			{ frame: 201, updates: { ecmTogglePressed: false } },
			{ frame: 260, updates: { dockAttemptPressed: true } },
			{ frame: 261, updates: { dockAttemptPressed: false } },
			{ frame: 330, updates: { launchPressed: true } },
			{ frame: 331, updates: { launchPressed: false } },
		],
	},
	{
		id: "seed-0badc0de-docked-market-ops",
		seed: 0x0badc0de,
		totalFrames: 420,
		stepMs: 16.67,
		keyframes: [
			{ frame: 0, updates: { launchPressed: true } },
			{ frame: 1, updates: { launchPressed: false } },
			{ frame: 18, updates: { throttleAxis: 1, rollAxis: -0.25, pitchAxis: 0.2 } },
			{ frame: 70, updates: { throttleAxis: 0, rollAxis: 0, pitchAxis: 0 } },
			{ frame: 72, updates: { warpTogglePressed: true } },
			{ frame: 73, updates: { warpTogglePressed: false } },
			{ frame: 110, updates: { warpTogglePressed: true } },
			{ frame: 111, updates: { warpTogglePressed: false } },
			{ frame: 130, updates: { fireLaserPressed: true } },
			{ frame: 134, updates: { fireLaserPressed: false } },
			{ frame: 180, updates: { dockAttemptPressed: true } },
			{ frame: 181, updates: { dockAttemptPressed: false } },
			{ frame: 230, updates: { launchPressed: true } },
			{ frame: 231, updates: { launchPressed: false } },
		],
	},
];
export function runOracleScenario(scenario) {
	const simulation = createEmptySimulation({
		scenarioId: "empty",
		seed: scenario.seed,
	});
	const controls = createDefaultPilotControls();
	const frameToUpdate = new Map();
	for (const keyframe of scenario.keyframes) {
		frameToUpdate.set(keyframe.frame, keyframe.updates);
	}
	const frames = [];
	for (let frame = 0; frame < scenario.totalFrames; frame += 1) {
		const updates = frameToUpdate.get(frame);
		if (updates) {
			Object.assign(controls, updates);
		}
		simulation.setPilotControls(controls);
		simulation.step(scenario.stepMs);
		frames.push(captureFrame(frame, simulation.snapshot()));
	}
	return {
		scenarioId: scenario.id,
		seed: scenario.seed,
		totalFrames: scenario.totalFrames,
		stepMs: scenario.stepMs,
		frames,
	};
}
