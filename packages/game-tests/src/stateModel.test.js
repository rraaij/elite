import { describe, expect, it } from "vitest";
import {
	cloneCanonicalGameState,
	createCanonicalGameState,
	runDeath2EntryPoint,
	runResetEntryPoint,
	stepCanonicalGameState,
} from "../../game-core/src/index";

describe("canonical game state model", () => {
	it("creates a stable initial state shape", () => {
		const state = createCanonicalGameState("empty");
		expect(state.schemaVersion).toBe(1);
		expect(state.scenarioId).toBe("empty");
		expect(state.commander.name).toBe("JAMESON");
		expect(state.views.selectedView).toBe("front");
		expect(state.universe.localBubbleShips).toEqual([]);
		expect(state.timers.frameTicks).toBe(0);
		expect(state.flow.beginCount).toBe(1);
		expect(state.flow.tt170Count).toBe(1);
		expect(state.flow.resetCount).toBe(1);
		expect(state.flow.res2Count).toBe(1);
		expect(state.flow.death2Count).toBe(1);
		expect(state.flow.br1Count).toBe(1);
		expect(state.flow.stackResetCount).toBe(2);
		expect(state.flow.autoLaunchedFromTitle).toBe(true);
		expect(state.flow.currentEntryPoint).toBe("TT100");
		expect(state.flow.phase).toBe("in-space");
		expect(state.views.isDocked).toBe(false);
	});
	it("steps deterministically for identical inputs", () => {
		const stateA = createCanonicalGameState("empty");
		const stateB = createCanonicalGameState("empty");
		const inputs = [
			{ stepMs: 16.67, headingJitter: 1, speedJitter: -1, spawnRoll: 42 },
			{ stepMs: 16.67, headingJitter: -2, speedJitter: 0, spawnRoll: 99 },
			{ stepMs: 16.67, headingJitter: 2, speedJitter: 1, spawnRoll: 17 },
		];
		for (const input of inputs) {
			stepCanonicalGameState(stateA, input);
			stepCanonicalGameState(stateB, input);
		}
		expect(stateA).toEqual(stateB);
	});
	it("applies manual roll, pitch and throttle controls", () => {
		const state = createCanonicalGameState("empty");
		const speedBefore = state.flight.speed;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 11,
			controlRollAxis: 1,
			controlPitchAxis: 1,
			controlThrottleAxis: 1,
		});
		expect(state.flight.rollRate).toBeGreaterThan(0);
		expect(state.flight.pitchRate).toBeGreaterThan(0);
		expect(state.flight.speed).toBeGreaterThan(speedBefore);
	});
	it("toggles warp and drains fuel while engaged", () => {
		const state = createCanonicalGameState("empty");
		const fuelBefore = state.commander.fuelTenths;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 13,
			requestWarpToggle: true,
		});
		expect(state.flight.warpEngaged).toBe(true);
		for (let index = 0; index < 40; index += 1) {
			stepCanonicalGameState(state, {
				stepMs: 16.67,
				headingJitter: 0,
				speedJitter: 0,
				spawnRoll: 99,
			});
		}
		expect(state.flight.speed).toBeGreaterThan(40);
		expect(state.commander.fuelTenths).toBeLessThan(fuelBefore);
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 42,
			requestWarpToggle: true,
		});
		expect(state.flight.warpEngaged).toBe(false);
	});
	it("escape pod request docks and resets space objects", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = false;
		state.universe.localBubbleShips.push({
			slotId: 88,
			kind: "ship",
			blueprintId: 24,
			flags: 0,
			hullStrength: 60,
			ageMs: 0,
			ttlMs: null,
			position: { x: 10, y: 10, z: 1000 },
			velocity: { x: 0, y: 0, z: -3 },
		});
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 5,
			requestEscapePod: true,
		});
		expect(state.views.isDocked).toBe(true);
		expect(state.flight.speed).toBe(0);
		expect(state.flight.warpEngaged).toBe(false);
		expect(state.universe.localBubbleShips).toHaveLength(0);
		expect(state.flow.currentEntryPoint).toBe("RESET");
	});
	it("laser fire heats laser and damages a front target ship", () => {
		const state = createCanonicalGameState("empty");
		state.universe.localBubbleShips.push({
			slotId: 41,
			kind: "ship",
			blueprintId: 11,
			flags: 0,
			hullStrength: 60,
			ageMs: 0,
			ttlMs: null,
			position: { x: 0, y: 0, z: 3200 },
			velocity: { x: 0, y: 0, z: -2 },
		});
		const energyBefore = state.flight.energy;
		const laserTempBefore = state.flow.laserTemperature;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 18,
			requestFireLaser: true,
		});
		const targetAfter = state.universe.localBubbleShips.find((ship) => ship.slotId === 41);
		expect(state.flow.laserTemperature).toBeGreaterThan(laserTempBefore);
		expect(state.flight.energy).toBeLessThan(energyBefore);
		expect(targetAfter?.hullStrength ?? 0).toBeLessThan(60);
	});
	it("missile arming, locking and firing reduces missile count and target hull", () => {
		const state = createCanonicalGameState("empty");
		state.universe.localBubbleShips.push({
			slotId: 91,
			kind: "ship",
			blueprintId: 24,
			flags: 0,
			hullStrength: 90,
			ageMs: 0,
			ttlMs: null,
			position: { x: 10, y: -20, z: 2800 },
			velocity: { x: 0, y: 0, z: -2 },
		});
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 19,
			requestMissileArmToggle: true,
		});
		expect(state.flight.missileArmed).toBe(true);
		expect(state.flight.missileTargetSlotId).not.toBeNull();
		for (let index = 0; index < 30; index += 1) {
			stepCanonicalGameState(state, {
				stepMs: 16.67,
				headingJitter: 0,
				speedJitter: 0,
				spawnRoll: 19,
			});
		}
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 22,
			requestMissileFire: true,
		});
		const targetAfter = state.universe.localBubbleShips.find((ship) => ship.slotId === 91);
		expect(state.flight.missileCount).toBe(2);
		expect(state.flight.missileArmed).toBe(false);
		expect(targetAfter?.hullStrength ?? 0).toBeLessThan(90);
	});
	it("ECM toggle enables drain and can be toggled off again", () => {
		const state = createCanonicalGameState("empty");
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 9,
			requestEcmToggle: true,
		});
		expect(state.views.ecmEnabled).toBe(true);
		const energyAfterEnable = state.flight.energy;
		for (let index = 0; index < 20; index += 1) {
			stepCanonicalGameState(state, {
				stepMs: 16.67,
				headingJitter: 0,
				speedJitter: 0,
				spawnRoll: 9,
			});
		}
		expect(state.flight.ecmActiveMs).toBeGreaterThan(0);
		expect(state.flight.energy).toBeLessThan(energyAfterEnable);
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 9,
			requestEcmToggle: true,
		});
		expect(state.views.ecmEnabled).toBe(false);
	});
	it("incoming hostile damage can trigger DEATH2 transition when energy is depleted", () => {
		const state = createCanonicalGameState("empty");
		state.universe.localBubbleShips.push({
			slotId: 66,
			kind: "ship",
			blueprintId: 16,
			flags: 0,
			hullStrength: 40,
			ageMs: 0,
			ttlMs: null,
			position: { x: 0, y: 0, z: 2200 },
			velocity: { x: 0, y: 0, z: -1 },
		});
		state.flight.forwardShield = 0;
		state.flight.aftShield = 0;
		state.flight.energy = 1;
		// spawnRoll = 0 guarantees one hostile damage event in this placeholder model.
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 0,
		});
		expect(state.views.isDocked).toBe(true);
		expect(state.flow.phase).toBe("title");
		expect(state.flow.currentEntryPoint).toBe("BR1");
	});
	it("docks successfully when requested inside the safe zone at low speed", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = false;
		state.views.inStationSafeZone = true;
		state.flight.stationDistance = 120;
		state.flight.speed = 8;
		state.universe.localBubbleShips.push({
			slotId: 150,
			kind: "ship",
			blueprintId: 11,
			flags: 0,
			hullStrength: 45,
			ageMs: 0,
			ttlMs: null,
			position: { x: 0, y: 0, z: 500 },
			velocity: { x: 0, y: 0, z: -1 },
		});
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 27,
			requestDockAttempt: true,
		});
		expect(state.views.isDocked).toBe(true);
		expect(state.views.inStationSafeZone).toBe(true);
		expect(state.flight.stationDistance).toBe(0);
		expect(state.flight.speed).toBe(0);
		expect(state.universe.localBubbleShips).toHaveLength(0);
		expect(state.flow.phase).toBe("docked");
	});
	it("launch request transitions from docked to in-space in safe-zone bounds", () => {
		const state = createCanonicalGameState("empty");
		runResetEntryPoint(state);
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 12,
			requestLaunch: true,
		});
		expect(state.views.isDocked).toBe(false);
		expect(state.views.inStationSafeZone).toBe(true);
		expect(state.flight.stationDistance).toBeGreaterThan(0);
		expect(state.flight.stationDistance).toBeLessThanOrEqual(700);
		expect(state.flight.speed).toBe(8);
		expect(state.flow.phase).toBe("in-space");
	});
	it("safe-zone mechanics suppress hostile hits and random spawning", () => {
		const safeState = createCanonicalGameState("empty");
		const unsafeState = createCanonicalGameState("empty");
		const sharedShip = {
			slotId: 202,
			kind: "ship",
			blueprintId: 16,
			flags: 0,
			hullStrength: 60,
			ageMs: 0,
			ttlMs: null,
			position: { x: 0, y: 0, z: 2000 },
			velocity: { x: 0, y: 0, z: -1 },
		};
		safeState.universe.localBubbleShips.push({ ...sharedShip });
		unsafeState.universe.localBubbleShips.push({ ...sharedShip });
		safeState.views.inStationSafeZone = true;
		safeState.flight.stationDistance = 600;
		safeState.flight.forwardShield = 0;
		safeState.flight.aftShield = 0;
		safeState.flight.energy = 20;
		safeState.timers.spawnCountdownMs = 0;
		unsafeState.views.inStationSafeZone = false;
		unsafeState.flight.stationDistance = 4_000;
		unsafeState.flight.forwardShield = 0;
		unsafeState.flight.aftShield = 0;
		unsafeState.flight.energy = 20;
		unsafeState.timers.spawnCountdownMs = 0;
		stepCanonicalGameState(safeState, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 0,
		});
		stepCanonicalGameState(unsafeState, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 0,
		});
		expect(safeState.universe.localBubbleShips.length).toBe(1);
		expect(unsafeState.universe.localBubbleShips.length).toBeGreaterThan(1);
		expect(unsafeState.flight.energy).toBeLessThan(safeState.flight.energy - 1);
	});
	it("spawns and advances placeholder ships when spawn timer elapses", () => {
		const state = createCanonicalGameState("empty");
		state.timers.spawnCountdownMs = 0;
		stepCanonicalGameState(state, {
			stepMs: 33.33,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 7,
		});
		expect(state.universe.localBubbleShips.length).toBe(1);
		expect(state.universe.nextShipSlotId).toBe(2);
		const ship = state.universe.localBubbleShips[0];
		expect(ship).toBeDefined();
		expect(ship?.slotId).toBe(1);
		expect(ship?.blueprintId).toBeGreaterThan(0);
		expect(state.timers.spawnCountdownMs).toBeGreaterThan(0);
	});
	it("creates debris fragments when ship hull reaches zero", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = false;
		state.universe.localBubbleShips.push({
			slotId: 77,
			kind: "ship",
			blueprintId: 11,
			flags: 0,
			hullStrength: 0,
			ageMs: 0,
			ttlMs: null,
			position: { x: 10, y: 20, z: 4000 },
			velocity: { x: 0, y: 0, z: -5 },
		});
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 64,
		});
		const debris = state.universe.localBubbleShips.filter((ship) => ship.kind === "debris");
		expect(debris.length).toBeGreaterThan(0);
		expect(state.universe.localBubbleShips.some((ship) => ship.slotId === 77)).toBe(false);
		expect(debris.every((ship) => ship.ttlMs !== null)).toBe(true);
	});
	it("uses docked loop path without spawning in-space ships", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = true;
		state.flow.phase = "docked";
		state.flow.currentEntryPoint = "MLOOP";
		state.flow.mainLoopCounter = 0;
		state.timers.spawnCountdownMs = 0;
		stepCanonicalGameState(state, {
			stepMs: 33.33,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 200,
		});
		expect(state.universe.localBubbleShips).toHaveLength(0);
		expect(state.flow.phase).toBe("docked");
		expect(state.flow.currentEntryPoint).toBe("MLOOP");
		expect(state.flow.mainLoopCounter).toBe(255);
	});
	it("runs TT100 prelude then MLOOP tail when in-space", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = false;
		state.flow.phase = "in-space";
		state.flow.mainLoopCounter = 0;
		state.flow.messageDelayCounter = 1;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 1,
			speedJitter: 0,
			spawnRoll: 33,
		});
		expect(state.flow.phase).toBe("in-space");
		expect(state.flow.currentEntryPoint).toBe("MLOOP");
		expect(state.flow.mainLoopCounter).toBe(255);
		expect(state.flow.messageDelayCounter).toBe(0);
	});
	it("clone helper deep-copies nested structures", () => {
		const original = createCanonicalGameState("empty");
		const cloned = cloneCanonicalGameState(original);
		cloned.commander.name = "TEST";
		cloned.universe.localBubbleShips.push({
			slotId: 99,
			kind: "ship",
			blueprintId: 11,
			flags: 0,
			hullStrength: 50,
			ageMs: 0,
			ttlMs: null,
			position: { x: 1, y: 2, z: 3 },
			velocity: { x: 4, y: 5, z: 6 },
		});
		expect(original.commander.name).toBe("JAMESON");
		expect(original.universe.localBubbleShips).toHaveLength(0);
	});
	it("RESET equivalent recharges and docks the ship", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = false;
		state.flight.energy = 13;
		state.flight.forwardShield = 21;
		state.flight.aftShield = 34;
		state.universe.localBubbleShips.push({
			slotId: 99,
			kind: "ship",
			blueprintId: 11,
			flags: 0,
			hullStrength: 50,
			ageMs: 0,
			ttlMs: null,
			position: { x: 1, y: 2, z: 3 },
			velocity: { x: 4, y: 5, z: 6 },
		});
		runResetEntryPoint(state);
		expect(state.views.isDocked).toBe(true);
		expect(state.flight.energy).toBe(100);
		expect(state.flight.forwardShield).toBe(100);
		expect(state.flight.aftShield).toBe(100);
		expect(state.universe.localBubbleShips).toHaveLength(0);
		expect(state.flow.currentEntryPoint).toBe("RESET");
		expect(state.flow.phase).toBe("docked");
	});
	it("DEATH2 equivalent returns to title flow and bumps counters", () => {
		const state = createCanonicalGameState("empty");
		const stackResetsBefore = state.flow.stackResetCount;
		const death2Before = state.flow.death2Count;
		const res2Before = state.flow.res2Count;
		const br1Before = state.flow.br1Count;
		state.views.isDocked = false;
		state.flow.phase = "in-space";
		state.universe.localBubbleShips.push({
			slotId: 7,
			kind: "ship",
			blueprintId: 24,
			flags: 0,
			hullStrength: 60,
			ageMs: 0,
			ttlMs: null,
			position: { x: 2, y: 4, z: 6 },
			velocity: { x: 1, y: 1, z: -1 },
		});
		runDeath2EntryPoint(state);
		expect(state.views.isDocked).toBe(true);
		expect(state.flow.phase).toBe("title");
		expect(state.flow.currentEntryPoint).toBe("BR1");
		expect(state.universe.localBubbleShips).toHaveLength(0);
		expect(state.flow.stackResetCount).toBe(stackResetsBefore + 1);
		expect(state.flow.death2Count).toBe(death2Before + 1);
		expect(state.flow.res2Count).toBe(res2Before + 1);
		expect(state.flow.br1Count).toBe(br1Before + 1);
	});
});
