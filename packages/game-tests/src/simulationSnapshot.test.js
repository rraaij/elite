import { describe, expect, it } from "vitest";
import { createEmptySimulation } from "../../game-core/src/index";

describe("simulation snapshots", () => {
	it("emits canonical schema v2 snapshots with game state", () => {
		const simulation = createEmptySimulation({ scenarioId: "empty", seed: 1234 });
		simulation.step(16.67);
		const snapshot = simulation.snapshot();
		expect(snapshot.schemaVersion).toBe(2);
		expect(snapshot.gameState.schemaVersion).toBe(1);
		expect(snapshot.gameState.scenarioId).toBe("empty");
		expect(snapshot.tick).toBe(1);
	});
	it("restores legacy schema v1 snapshots via upgrade path", () => {
		const simulation = createEmptySimulation({ scenarioId: "empty", seed: 999 });
		const legacySnapshot = {
			schemaVersion: 1,
			scenarioId: "legacy-scenario",
			seed: 42,
			rngState: 0x1234_5678,
			tick: 88,
			simulatedMs: 1466.8,
			playerHeadingDeg: 271.25,
			playerSpeed: 17.5,
		};
		simulation.restore(legacySnapshot);
		const upgraded = simulation.snapshot();
		expect(upgraded.schemaVersion).toBe(2);
		expect(upgraded.scenarioId).toBe("legacy-scenario");
		expect(upgraded.tick).toBe(88);
		expect(upgraded.simulatedMs).toBeCloseTo(1466.8, 5);
		expect(upgraded.playerHeadingDeg).toBeCloseTo(271.25, 5);
		expect(upgraded.playerSpeed).toBeCloseTo(17.5, 5);
		expect(upgraded.gameState.scenarioId).toBe("legacy-scenario");
		expect(upgraded.gameState.timers.frameTicks).toBe(88);
	});
	it("restores canonical schema v2 snapshots exactly", () => {
		const simulation = createEmptySimulation({ scenarioId: "empty", seed: 55 });
		simulation.step(16.67);
		simulation.step(16.67);
		const snapshot = simulation.snapshot();
		const clone = createEmptySimulation({ scenarioId: "other", seed: 1 });
		clone.restore(snapshot);
		const restored = clone.snapshot();
		expect(restored).toEqual(snapshot);
	});
	it("applies pilot controls with edge-triggered warp toggle", () => {
		const simulation = createEmptySimulation({ scenarioId: "empty", seed: 700 });
		simulation.setPilotControls({
			rollAxis: 1,
			pitchAxis: 1,
			throttleAxis: 1,
			warpTogglePressed: true,
			escapePodPressed: false,
			fireLaserPressed: false,
			missileArmTogglePressed: false,
			missileFirePressed: false,
			ecmTogglePressed: false,
			dockAttemptPressed: false,
			launchPressed: false,
		});
		simulation.step(16.67);
		const first = simulation.snapshot();
		expect(first.gameState.flight.warpEngaged).toBe(true);
		// Keep button held; warp should remain enabled, not toggle repeatedly.
		simulation.setPilotControls({
			rollAxis: 0,
			pitchAxis: 0,
			throttleAxis: 0,
			warpTogglePressed: true,
			escapePodPressed: false,
			fireLaserPressed: false,
			missileArmTogglePressed: false,
			missileFirePressed: false,
			ecmTogglePressed: false,
			dockAttemptPressed: false,
			launchPressed: false,
		});
		simulation.step(16.67);
		simulation.step(16.67);
		const held = simulation.snapshot();
		expect(held.gameState.flight.warpEngaged).toBe(true);
		// Release then press again to toggle warp off.
		simulation.setPilotControls({
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
		});
		simulation.step(16.67);
		simulation.setPilotControls({
			rollAxis: 0,
			pitchAxis: 0,
			throttleAxis: 0,
			warpTogglePressed: true,
			escapePodPressed: false,
			fireLaserPressed: false,
			missileArmTogglePressed: false,
			missileFirePressed: false,
			ecmTogglePressed: false,
			dockAttemptPressed: false,
			launchPressed: false,
		});
		simulation.step(16.67);
		const toggledOff = simulation.snapshot();
		expect(toggledOff.gameState.flight.warpEngaged).toBe(false);
	});
	it("applies edge-triggered missile and ECM toggles", () => {
		const simulation = createEmptySimulation({ scenarioId: "empty", seed: 701 });
		simulation.setPilotControls({
			rollAxis: 0,
			pitchAxis: 0,
			throttleAxis: 0,
			warpTogglePressed: false,
			escapePodPressed: false,
			fireLaserPressed: false,
			missileArmTogglePressed: true,
			missileFirePressed: false,
			ecmTogglePressed: true,
			dockAttemptPressed: false,
			launchPressed: false,
		});
		simulation.step(16.67);
		const first = simulation.snapshot();
		expect(first.gameState.flight.missileArmed).toBe(true);
		expect(first.gameState.views.ecmEnabled).toBe(true);
		// Hold both keys: should not retrigger toggles.
		simulation.step(16.67);
		const held = simulation.snapshot();
		expect(held.gameState.flight.missileArmed).toBe(true);
		expect(held.gameState.views.ecmEnabled).toBe(true);
		// Release then press again to toggle both off.
		simulation.setPilotControls({
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
		});
		simulation.step(16.67);
		simulation.setPilotControls({
			rollAxis: 0,
			pitchAxis: 0,
			throttleAxis: 0,
			warpTogglePressed: false,
			escapePodPressed: false,
			fireLaserPressed: false,
			missileArmTogglePressed: true,
			missileFirePressed: false,
			ecmTogglePressed: true,
			dockAttemptPressed: false,
			launchPressed: false,
		});
		simulation.step(16.67);
		const toggledOff = simulation.snapshot();
		expect(toggledOff.gameState.flight.missileArmed).toBe(false);
		expect(toggledOff.gameState.views.ecmEnabled).toBe(false);
	});
	it("applies launch and dock transitions through pilot controls", () => {
		const simulation = createEmptySimulation({ scenarioId: "empty", seed: 702 });
		const dockedSnapshot = simulation.snapshot();
		dockedSnapshot.gameState.views.isDocked = true;
		dockedSnapshot.gameState.views.inStationSafeZone = true;
		dockedSnapshot.gameState.flight.stationDistance = 0;
		dockedSnapshot.gameState.flow.phase = "docked";
		dockedSnapshot.gameState.flow.currentEntryPoint = "MLOOP";
		simulation.restore(dockedSnapshot);
		simulation.setPilotControls({
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
			launchPressed: true,
		});
		simulation.step(16.67);
		const launched = simulation.snapshot();
		expect(launched.gameState.views.isDocked).toBe(false);
		const nearStation = simulation.snapshot();
		nearStation.gameState.views.isDocked = false;
		nearStation.gameState.views.inStationSafeZone = true;
		nearStation.gameState.flight.stationDistance = 120;
		nearStation.gameState.flight.speed = 8;
		simulation.restore(nearStation);
		simulation.setPilotControls({
			rollAxis: 0,
			pitchAxis: 0,
			throttleAxis: 0,
			warpTogglePressed: false,
			escapePodPressed: false,
			fireLaserPressed: false,
			missileArmTogglePressed: false,
			missileFirePressed: false,
			ecmTogglePressed: false,
			dockAttemptPressed: true,
			launchPressed: false,
		});
		simulation.step(16.67);
		const docked = simulation.snapshot();
		expect(docked.gameState.views.isDocked).toBe(true);
		expect(docked.gameState.views.inStationSafeZone).toBe(true);
	});
});
