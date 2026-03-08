import { describe, expect, it } from "vitest";
import {
	acknowledgeMissionMessages,
	cloneCanonicalGameState,
	createCanonicalGameState,
	getCargoFreeTons,
	getCargoUsedTons,
	getCombatRankName,
	getEquipmentDefinitions,
	getMissionProgressLabel,
	runDeath2EntryPoint,
	runResetEntryPoint,
	stepCanonicalGameState,
	tryBuyCommodity,
	tryPurchaseEquipment,
	trySellCommodity,
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
		expect(state.universe.hyperspaceJumps).toBe(0);
		expect(state.commander.killCount).toBe(0);
		expect(state.commander.missionProgressStage).toBe(0);
		expect(state.commander.missionsCompletedCount).toBe(0);
		expect(state.commander.missionBriefingPending).toBe(false);
		expect(state.commander.missionDebriefPending).toBe(false);
		expect(state.commander.cargoHoldCapacityTons).toBe(20);
		expect(state.commander.cargoTonsByCommodity).toHaveLength(
			state.universe.market.commodities.length,
		);
		expect(state.universe.market.pricesCenticredits).toHaveLength(
			state.universe.market.commodities.length,
		);
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
	it("auto-transitions hyperspace after sustained high warp and updates system seeds", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = false;
		state.views.inWitchspace = false;
		state.commander.fuelTenths = 40;
		state.flight.warpEngaged = true;
		state.flight.warpChargeMs = 4_000;
		state.flight.speed = 90;
		state.universe.targetSystemSeed = [0x1111, 0x2222, 0x3333];
		state.universe.localBubbleShips.push({
			slotId: 9,
			kind: "ship",
			blueprintId: 11,
			aiRole: "pirate",
			hostilityLevel: 80,
			flags: 0,
			hullStrength: 50,
			lastDamagedByPlayer: false,
			ageMs: 0,
			ttlMs: null,
			position: { x: 0, y: 0, z: 2000 },
			velocity: { x: 0, y: 0, z: -1 },
		});
		const previousCurrentSeed = [...state.universe.currentSystemSeed];
		const previousTargetSeed = [...state.universe.targetSystemSeed];
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 77,
		});
		expect(state.universe.currentSystemSeed).toEqual(previousTargetSeed);
		expect(state.universe.targetSystemSeed).not.toEqual(previousTargetSeed);
		expect(state.universe.currentSystemSeed).not.toEqual(previousCurrentSeed);
		expect(state.universe.hyperspaceJumps).toBe(1);
		expect(state.commander.fuelTenths).toBeLessThan(40);
		expect(state.flight.warpEngaged).toBe(false);
		expect(state.universe.localBubbleShips).toHaveLength(0);
	});
	it("does not hyperspace jump when sustained warp has insufficient fuel", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = false;
		state.views.inWitchspace = false;
		state.commander.fuelTenths = 6;
		state.flight.warpEngaged = true;
		state.flight.warpChargeMs = 4_100;
		state.flight.speed = 92;
		const seedBefore = [...state.universe.currentSystemSeed];
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 88,
		});
		expect(state.universe.currentSystemSeed).toEqual(seedBefore);
		expect(state.universe.hyperspaceJumps).toBe(0);
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
	it("buys and sells docked market commodities with cargo/credit accounting", () => {
		const state = createCanonicalGameState("empty");
		runResetEntryPoint(state);
		const commodityIndex = 0;
		const unitPrice = state.universe.market.pricesCenticredits[commodityIndex] ?? 0;
		const availableBefore = state.universe.market.availableTons[commodityIndex] ?? 0;
		const creditsBefore = state.commander.creditsCenticredits;
		expect(tryBuyCommodity(state, commodityIndex, 2)).toBe(true);
		expect(state.commander.cargoTonsByCommodity[commodityIndex]).toBe(2);
		expect(state.universe.market.availableTons[commodityIndex]).toBe(availableBefore - 2);
		expect(state.commander.creditsCenticredits).toBe(creditsBefore - unitPrice * 2);
		expect(getCargoUsedTons(state.commander)).toBe(2);
		expect(getCargoFreeTons(state.commander)).toBe(state.commander.cargoHoldCapacityTons - 2);
		expect(trySellCommodity(state, commodityIndex, 1)).toBe(true);
		expect(state.commander.cargoTonsByCommodity[commodityIndex]).toBe(1);
		expect(state.universe.market.availableTons[commodityIndex]).toBe(availableBefore - 1);
		expect(state.commander.creditsCenticredits).toBe(creditsBefore - unitPrice);
	});
	it("rejects market trading when in-space or over cargo capacity", () => {
		const state = createCanonicalGameState("empty");
		runResetEntryPoint(state);
		const commodityIndex = 0;
		const freeTons = getCargoFreeTons(state.commander);
		state.universe.market.availableTons[commodityIndex] = freeTons + 1;
		expect(tryBuyCommodity(state, commodityIndex, freeTons)).toBe(true);
		expect(tryBuyCommodity(state, commodityIndex, 1)).toBe(false);
		state.views.isDocked = false;
		expect(trySellCommodity(state, commodityIndex, 1)).toBe(false);
	});
	it("purchases equipment once while docked and applies cargo-bay expansion", () => {
		const state = createCanonicalGameState("empty");
		runResetEntryPoint(state);
		const extraCargoBay = getEquipmentDefinitions().find(
			(definition) => definition.key === "extraCargoBay",
		);
		expect(extraCargoBay).toBeDefined();
		if (!extraCargoBay) {
			return;
		}
		const creditsBefore = state.commander.creditsCenticredits;
		expect(tryPurchaseEquipment(state, extraCargoBay.id)).toBe(true);
		expect(state.commander.equipment.extraCargoBay).toBe(true);
		expect(state.commander.cargoHoldCapacityTons).toBe(35);
		expect(state.commander.creditsCenticredits).toBe(
			creditsBefore - extraCargoBay.priceCenticredits,
		);
		expect(tryPurchaseEquipment(state, extraCargoBay.id)).toBe(false);
	});
	it("docking computer widens docking envelope and assists speed", () => {
		const state = createCanonicalGameState("empty");
		runResetEntryPoint(state);
		const dockingComputer = getEquipmentDefinitions().find(
			(definition) => definition.key === "dockingComputer",
		);
		expect(dockingComputer).toBeDefined();
		if (!dockingComputer) {
			return;
		}
		state.commander.creditsCenticredits = 200_000;
		expect(tryPurchaseEquipment(state, dockingComputer.id)).toBe(true);
		expect(state.commander.equipment.dockingComputer).toBe(true);
		state.views.isDocked = false;
		state.views.inStationSafeZone = true;
		state.flight.stationDistance = 600;
		state.flight.speed = 20;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 44,
			requestDockAttempt: true,
		});
		expect(state.views.isDocked).toBe(true);
		expect(state.flight.speed).toBe(0);
	});
	it("energy unit and fuel scoops change recharge behavior when installed", () => {
		const baseState = createCanonicalGameState("empty");
		const equippedState = createCanonicalGameState("empty");
		runResetEntryPoint(baseState);
		runResetEntryPoint(equippedState);
		const energyUnit = getEquipmentDefinitions().find(
			(definition) => definition.key === "energyUnit",
		);
		const fuelScoops = getEquipmentDefinitions().find(
			(definition) => definition.key === "fuelScoops",
		);
		expect(energyUnit).toBeDefined();
		expect(fuelScoops).toBeDefined();
		if (!energyUnit || !fuelScoops) {
			return;
		}
		equippedState.commander.creditsCenticredits = 200_000;
		expect(tryPurchaseEquipment(equippedState, energyUnit.id)).toBe(true);
		expect(tryPurchaseEquipment(equippedState, fuelScoops.id)).toBe(true);
		baseState.flight.energy = 20;
		equippedState.flight.energy = 20;
		baseState.commander.fuelTenths = 30;
		equippedState.commander.fuelTenths = 30;
		baseState.views.isDocked = false;
		equippedState.views.isDocked = false;
		baseState.views.inStationSafeZone = false;
		equippedState.views.inStationSafeZone = false;
		baseState.flight.speed = 20;
		equippedState.flight.speed = 20;
		for (let index = 0; index < 60; index += 1) {
			stepCanonicalGameState(baseState, {
				stepMs: 16.67,
				headingJitter: 0,
				speedJitter: 0,
				spawnRoll: 91,
			});
			stepCanonicalGameState(equippedState, {
				stepMs: 16.67,
				headingJitter: 0,
				speedJitter: 0,
				spawnRoll: 91,
			});
		}
		expect(equippedState.flight.energy).toBeGreaterThan(baseState.flight.energy);
		expect(equippedState.commander.fuelTenths).toBeGreaterThan(baseState.commander.fuelTenths);
	});
	it("tracks player kill progression and updates combat rank", () => {
		const state = createCanonicalGameState("empty");
		state.universe.localBubbleShips.push({
			slotId: 311,
			kind: "ship",
			blueprintId: 24,
			flags: 0,
			hullStrength: 4,
			ageMs: 0,
			ttlMs: null,
			position: { x: 0, y: 0, z: 1400 },
			velocity: { x: 0, y: 0, z: -2 },
		});
		const pointsBefore = state.commander.combatRankPoints;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 18,
			requestFireLaser: true,
		});
		expect(state.commander.killCount).toBe(1);
		expect(state.commander.combatRankPoints).toBeGreaterThan(pointsBefore);
		expect(getCombatRankName(state.commander.combatRankPoints)).not.toBe("");
	});
	it("advances mission progression from offer to completion", () => {
		const state = createCanonicalGameState("empty");
		runResetEntryPoint(state);
		state.commander.combatRankPoints = 10;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 10,
		});
		expect(state.commander.missionProgressStage).toBe(1);
		expect(getMissionProgressLabel(state.commander.missionProgressStage)).toBe("Mission offered");
		expect(state.commander.missionBriefingPending).toBe(true);
		expect(state.commander.missionBriefingId).toBe(1);
		expect(acknowledgeMissionMessages(state)).toBe(true);
		expect(state.commander.missionBriefingPending).toBe(false);
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 10,
			requestLaunch: true,
		});
		expect(state.commander.missionProgressStage).toBe(2);
		state.commander.killCount = 3;
		state.views.isDocked = true;
		state.flow.phase = "docked";
		state.flight.stationDistance = 0;
		const pointsBeforeCompletion = state.commander.combatRankPoints;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 11,
		});
		expect(state.commander.missionProgressStage).toBe(3);
		expect(state.commander.missionsCompletedCount).toBe(1);
		expect(state.commander.combatRankPoints).toBe(pointsBeforeCompletion + 5);
		expect(getMissionProgressLabel(state.commander.missionProgressStage)).toBe("Mission complete");
		expect(state.commander.missionDebriefPending).toBe(true);
		expect(state.commander.missionDebriefId).toBe(1);
		expect(acknowledgeMissionMessages(state)).toBe(true);
		expect(state.commander.missionDebriefPending).toBe(false);
	});
	it("tags spawned ships with deterministic AI roles and hostility", () => {
		const state = createCanonicalGameState("empty");
		state.views.inStationSafeZone = false;
		state.timers.spawnCountdownMs = 0;
		state.commander.legalStatus = 0;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 0,
		});
		const ship = state.universe.localBubbleShips.find((candidate) => candidate.kind === "ship");
		expect(ship?.aiRole).toBe("pirate");
		expect((ship?.hostilityLevel ?? 0) > 50).toBe(true);
	});
	it("spawns police response in station safe-zone for high legal status", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = false;
		state.views.inStationSafeZone = true;
		state.flight.stationDistance = 600;
		state.commander.legalStatus = 60;
		state.timers.spawnCountdownMs = 0;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 17,
		});
		const policeShip = state.universe.localBubbleShips.find(
			(ship) => ship.kind === "ship" && ship.aiRole === "police",
		);
		expect(policeShip).toBeDefined();
		expect((policeShip?.hostilityLevel ?? 0) >= 50).toBe(true);
	});
	it("applies evasive lock-break behavior for armed hostile missile targets", () => {
		const state = createCanonicalGameState("empty");
		state.universe.localBubbleShips.push({
			slotId: 401,
			kind: "ship",
			blueprintId: 24,
			aiRole: "pirate",
			hostilityLevel: 80,
			flags: 0,
			hullStrength: 90,
			lastDamagedByPlayer: false,
			ageMs: 0,
			ttlMs: null,
			position: { x: 20, y: -10, z: 2600 },
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
		expect(state.flight.missileTargetSlotId).toBe(401);
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 0,
		});
		expect(state.flight.missileArmed).toBe(true);
		expect(state.flight.missileTargetSlotId).toBeNull();
		expect(state.flight.missileLockTimerMs).toBe(0);
	});
	it("applies role-based lateral combat maneuvers for hostile ships", () => {
		const state = createCanonicalGameState("empty");
		state.views.inStationSafeZone = false;
		state.universe.localBubbleShips.push({
			slotId: 402,
			kind: "ship",
			blueprintId: 16,
			aiRole: "bounty-hunter",
			hostilityLevel: 85,
			flags: 0,
			hullStrength: 70,
			lastDamagedByPlayer: false,
			ageMs: 0,
			ttlMs: null,
			position: { x: -120, y: 40, z: 3200 },
			velocity: { x: 0, y: 0, z: -4 },
		});
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 33,
		});
		const ship = state.universe.localBubbleShips.find((candidate) => candidate.slotId === 402);
		expect(Math.abs(ship?.velocity.x ?? 0)).toBeGreaterThan(0);
		expect(Math.abs(ship?.velocity.y ?? 0)).toBeGreaterThan(0);
	});
	it("enters witchspace during warp anomalies and spawns witchspace raiders", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = false;
		state.views.inStationSafeZone = false;
		state.flight.stationDistance = 4_800;
		state.timers.spawnCountdownMs = 0;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 0x2a,
			requestWarpToggle: true,
		});
		expect(state.views.inWitchspace).toBe(true);
		expect(state.universe.specialEncounters.witchspaceEncounters).toBe(1);
		state.timers.spawnCountdownMs = 0;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 0x11,
		});
		const raider = state.universe.localBubbleShips.find(
			(ship) => ship.kind === "ship" && ship.specialEncounterType === "witchspace-raider",
		);
		expect(raider).toBeDefined();
	});
	it("spawns and resolves Constrictor/Cougar special encounters", () => {
		const state = createCanonicalGameState("empty");
		state.views.isDocked = false;
		state.views.inStationSafeZone = false;
		state.views.inWitchspace = false;
		state.commander.missionProgressStage = 2;
		state.commander.killCount = 5;
		state.timers.spawnCountdownMs = 0;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 0x07,
		});
		const constrictor = state.universe.localBubbleShips.find(
			(ship) => ship.kind === "ship" && ship.specialEncounterType === "constrictor",
		);
		expect(constrictor).toBeDefined();
		expect(state.universe.specialEncounters.constrictorSpawned).toBe(true);
		if (constrictor) {
			constrictor.hullStrength = 0;
			constrictor.lastDamagedByPlayer = true;
		}
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 0x20,
		});
		expect(state.universe.specialEncounters.constrictorDestroyed).toBe(true);
		state.timers.spawnCountdownMs = 0;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 0x12,
		});
		const cougar = state.universe.localBubbleShips.find(
			(ship) => ship.kind === "ship" && ship.specialEncounterType === "cougar",
		);
		expect(cougar).toBeDefined();
		expect(state.universe.specialEncounters.cougarSpawned).toBe(true);
	});
	it("triggers special mission debrief when cougar objective is completed", () => {
		const state = createCanonicalGameState("empty");
		runResetEntryPoint(state);
		state.commander.missionProgressStage = 3;
		state.universe.specialEncounters.cougarDestroyed = true;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 5,
		});
		expect(state.commander.missionProgressStage).toBe(4);
		expect(state.commander.missionDebriefPending).toBe(true);
		expect(state.commander.missionDebriefId).toBe(2);
	});
	it("advances Trumble lifecycle and visibility hooks deterministically", () => {
		const state = createCanonicalGameState("empty");
		runResetEntryPoint(state);
		state.commander.missionProgressStage = 3;
		state.commander.cargoTonsByCommodity[0] = 2;
		// Tick to first deterministic acquisition gate.
		for (let index = 0; index < 600; index += 1) {
			stepCanonicalGameState(state, {
				stepMs: 16.67,
				headingJitter: 0,
				speedJitter: 0,
				spawnRoll: 9,
			});
		}
		expect(state.commander.trumbleCount).toBeGreaterThan(0);
		expect(state.commander.trumbleVisible).toBe(true);
		const countAfterAcquire = state.commander.trumbleCount;
		// Continue docked ticks; food cargo should accelerate growth.
		for (let index = 0; index < 360; index += 1) {
			stepCanonicalGameState(state, {
				stepMs: 16.67,
				headingJitter: 0,
				speedJitter: 0,
				spawnRoll: 9,
			});
		}
		expect(state.commander.trumbleCount).toBeGreaterThanOrEqual(countAfterAcquire + 1);
		// Witchspace hides Trumble render hook while active.
		state.views.inWitchspace = true;
		stepCanonicalGameState(state, {
			stepMs: 16.67,
			headingJitter: 0,
			speedJitter: 0,
			spawnRoll: 9,
		});
		expect(state.commander.trumbleVisible).toBe(false);
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
