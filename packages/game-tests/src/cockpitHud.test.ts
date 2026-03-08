import { describe, expect, it } from "vitest";
import { createEmptySimulation } from "../../game-core/src/index";
import { createCockpitHudModel } from "../../game-renderer/src/index";

/**
 * Create a mutable snapshot seed for HUD tests.
 */
function createHudTestSnapshot() {
	const simulation = createEmptySimulation({ scenarioId: "empty", seed: 12345 });
	simulation.step(16.67);
	return simulation.snapshot();
}

describe("cockpit HUD model", () => {
	it("builds dashboard/scanner layout within viewport bounds", () => {
		const snapshot = createHudTestSnapshot();
		const model = createCockpitHudModel(snapshot, { width: 320, height: 200 });

		expect(model.dashboardRect.y).toBeGreaterThanOrEqual(0);
		expect(model.dashboardRect.y).toBeLessThan(200);
		expect(model.dashboardRect.height).toBeGreaterThan(0);

		expect(model.scanner.rect.x).toBeGreaterThanOrEqual(0);
		expect(model.scanner.rect.y).toBeGreaterThanOrEqual(0);
		expect(model.scanner.rect.x + model.scanner.rect.width).toBeLessThanOrEqual(320);
		expect(model.scanner.rect.y + model.scanner.rect.height).toBeLessThanOrEqual(200);
	});

	it("normalizes bars and raises warning flags for stressed systems", () => {
		const snapshot = createHudTestSnapshot();
		snapshot.gameState.flight.energy = 9;
		snapshot.gameState.flight.forwardShield = 14;
		snapshot.gameState.flight.aftShield = 13;
		snapshot.gameState.commander.fuelTenths = 5;
		snapshot.gameState.flight.speed = 118;
		snapshot.gameState.flow.laserTemperature = 245;

		const model = createCockpitHudModel(snapshot, { width: 320, height: 200 });

		const energyBar = model.leftBars.find((bar) => bar.key === "energy");
		const fuelBar = model.rightBars.find((bar) => bar.key === "fuel");
		const tempBar = model.rightBars.find((bar) => bar.key === "laser-temp");

		expect(energyBar?.value01 ?? 0).toBeGreaterThan(0);
		expect(energyBar?.warning).toBe(true);
		expect(fuelBar?.warning).toBe(true);
		expect(tempBar?.warning).toBe(true);
	});

	it("maps local ships into clipped scanner contacts", () => {
		const snapshot = createHudTestSnapshot();
		snapshot.gameState.universe.localBubbleShips = [
			{
				slotId: 2,
				kind: "ship",
				blueprintId: 11,
				flags: 0,
				hullStrength: 50,
				ageMs: 0,
				ttlMs: null,
				position: { x: 3400, y: 0, z: 9000 },
				velocity: { x: 0, y: 0, z: 0 },
			},
			{
				slotId: 3,
				kind: "debris",
				blueprintId: 11,
				flags: 0,
				hullStrength: 1,
				ageMs: 0,
				ttlMs: 1000,
				position: { x: -3400, y: 0, z: 1200 },
				velocity: { x: 0, y: 0, z: 0 },
			},
		];

		const model = createCockpitHudModel(snapshot, { width: 320, height: 200 });
		expect(model.scanner.contacts).toHaveLength(2);

		const rect = model.scanner.rect;
		expect(
			model.scanner.contacts.every(
				(contact) =>
					contact.x >= rect.x &&
					contact.x < rect.x + rect.width &&
					contact.y >= rect.y &&
					contact.y < rect.y + rect.height,
			),
		).toBe(true);
	});

	it("points compass needle toward nearest front ship", () => {
		const snapshot = createHudTestSnapshot();
		snapshot.gameState.universe.localBubbleShips = [
			{
				slotId: 8,
				kind: "ship",
				blueprintId: 11,
				flags: 0,
				hullStrength: 50,
				ageMs: 0,
				ttlMs: null,
				position: { x: 900, y: 0, z: 1400 },
				velocity: { x: 0, y: 0, z: 0 },
			},
		];

		const model = createCockpitHudModel(snapshot, { width: 320, height: 200 });
		expect(model.compass.needleX).toBeGreaterThan(model.compass.centerX);
	});

	it("reflects indicator states from simulation flags", () => {
		const snapshot = createHudTestSnapshot();
		snapshot.gameState.views.isDocked = true;
		snapshot.gameState.views.inStationSafeZone = true;
		snapshot.gameState.views.ecmEnabled = true;
		snapshot.gameState.flight.warpEngaged = true;
		snapshot.gameState.flight.missileArmed = true;

		const model = createCockpitHudModel(snapshot, { width: 320, height: 200 });
		const activeKeys = model.indicators.filter((lamp) => lamp.active).map((lamp) => lamp.key);

		expect(activeKeys).toEqual(["dock", "safe", "ecm", "warp", "missile"]);
	});
});
