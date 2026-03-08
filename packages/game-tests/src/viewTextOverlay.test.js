import { describe, expect, it } from "vitest";
import { createEmptySimulation } from "../../game-core/src/index";
import {
	createCockpitTextLayerModel,
	createViewPresentationKey,
	createViewTransitionTracker,
	stepViewTransitionTracker,
} from "../../game-renderer/src/index";

/**
 * Build one mutable simulation snapshot for overlay tests.
 */
function createOverlaySnapshot() {
	const simulation = createEmptySimulation({ scenarioId: "empty", seed: 2222 });
	simulation.step(16.67);
	return simulation.snapshot();
}
describe("view text overlay model", () => {
	it("builds presentation key from phase and selected view", () => {
		const snapshot = createOverlaySnapshot();
		snapshot.gameState.flow.phase = "in-space";
		snapshot.gameState.views.selectedView = "front";
		expect(createViewPresentationKey(snapshot)).toBe("in-space:front");
	});
	it("builds docked message set when docked", () => {
		const snapshot = createOverlaySnapshot();
		snapshot.gameState.views.isDocked = true;
		snapshot.gameState.flow.phase = "docked";
		const model = createCockpitTextLayerModel(snapshot);
		expect(model.bottomCenter[0]?.text).toContain("DOCKING CONTROL ACTIVE");
		expect(model.phaseLabel).toBe("DOCKED");
	});
	it("builds safe-zone warning message when in station safe-zone", () => {
		const snapshot = createOverlaySnapshot();
		snapshot.gameState.views.isDocked = false;
		snapshot.gameState.views.inStationSafeZone = true;
		const model = createCockpitTextLayerModel(snapshot);
		expect(model.bottomCenter[0]?.tone).toBe("warning");
		expect(model.bottomCenter[0]?.text).toContain("SAFE-ZONE");
	});
	it("builds warp message when warp is engaged", () => {
		const snapshot = createOverlaySnapshot();
		snapshot.gameState.views.isDocked = false;
		snapshot.gameState.views.inStationSafeZone = false;
		snapshot.gameState.flight.warpEngaged = true;
		const model = createCockpitTextLayerModel(snapshot);
		expect(model.bottomCenter[0]?.text).toContain("WARP DRIVE ENGAGED");
	});
	it("builds legal alert when commander legal status is non-zero", () => {
		const snapshot = createOverlaySnapshot();
		snapshot.gameState.views.isDocked = false;
		snapshot.gameState.views.inStationSafeZone = false;
		snapshot.gameState.flight.warpEngaged = false;
		snapshot.gameState.commander.legalStatus = 9;
		const model = createCockpitTextLayerModel(snapshot);
		expect(model.bottomCenter[0]?.text).toContain("LEGAL ALERT");
		expect(model.bottomCenter[0]?.tone).toBe("warning");
	});
});
describe("view transition tracker", () => {
	it("initializes without an active transition", () => {
		const tracker = createViewTransitionTracker();
		const step = stepViewTransitionTracker(tracker, "in-space:front", 10, 20);
		expect(step.frame.active).toBe(false);
		expect(step.frame.progress01).toBe(1);
		expect(step.tracker.currentViewKey).toBe("in-space:front");
	});
	it("starts a transition when view key changes", () => {
		const tracker0 = createViewTransitionTracker();
		const step0 = stepViewTransitionTracker(tracker0, "in-space:front", 10, 20);
		const step1 = stepViewTransitionTracker(step0.tracker, "in-space:rear", 11, 20);
		expect(step1.frame.active).toBe(true);
		expect(step1.frame.fromViewKey).toBe("in-space:front");
		expect(step1.frame.toViewKey).toBe("in-space:rear");
		expect(step1.frame.progress01).toBe(0);
	});
	it("completes transition after duration ticks", () => {
		const tracker0 = createViewTransitionTracker();
		const step0 = stepViewTransitionTracker(tracker0, "in-space:front", 20, 12);
		const step1 = stepViewTransitionTracker(step0.tracker, "docked:front", 21, 12);
		const step2 = stepViewTransitionTracker(step1.tracker, "docked:front", 35, 12);
		expect(step2.frame.active).toBe(false);
		expect(step2.frame.toViewKey).toBe("docked:front");
		expect(step2.frame.progress01).toBe(1);
	});
	it("restarts transition if key changes mid-flight", () => {
		const tracker0 = createViewTransitionTracker();
		const step0 = stepViewTransitionTracker(tracker0, "in-space:front", 100, 20);
		const step1 = stepViewTransitionTracker(step0.tracker, "in-space:rear", 101, 20);
		const step2 = stepViewTransitionTracker(step1.tracker, "docked:front", 105, 20);
		expect(step2.frame.active).toBe(true);
		expect(step2.frame.fromViewKey).toBe("in-space:rear");
		expect(step2.frame.toViewKey).toBe("docked:front");
	});
});
