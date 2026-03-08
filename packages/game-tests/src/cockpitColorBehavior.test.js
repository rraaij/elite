import { describe, expect, it } from "vitest";
import { createEmptySimulation } from "../../game-core/src/index";
import {
	createCockpitColorBehavior,
	createHudFlashState,
	resolveCockpitAlertLevel,
	resolveIndicatorBlinkOn,
	resolveIndicatorLampColor,
	resolveOverlayToneColor,
} from "../../game-renderer/src/index";

/**
 * Build a mutable snapshot seed for color/flash behavior tests.
 */
function createColorSnapshot() {
	const simulation = createEmptySimulation({ scenarioId: "empty", seed: 5678 });
	simulation.step(16.67);
	return simulation.snapshot();
}
describe("cockpit color behavior", () => {
	it("produces deterministic slow/fast flash cadence from timer value", () => {
		// Initial phase: both channels are lit.
		const phase0 = createHudFlashState(0);
		// Mid-fast-period: slow stays lit while fast channel toggles off.
		const phase1 = createHudFlashState(210);
		// After slow period boundary: slow channel toggles off as well.
		const phase2 = createHudFlashState(430);
		expect(phase0.slowOn).toBe(true);
		expect(phase0.fastOn).toBe(true);
		expect(phase1.slowOn).toBe(true);
		expect(phase1.fastOn).toBe(false);
		expect(phase2.slowOn).toBe(false);
	});
	it("maps flight/legal risk into nominal/caution/danger alert levels", () => {
		const nominal = createColorSnapshot();
		nominal.gameState.commander.legalStatus = 0;
		nominal.gameState.flight.energy = 80;
		nominal.gameState.flight.forwardShield = 90;
		nominal.gameState.flight.aftShield = 90;
		nominal.gameState.flow.laserTemperature = 20;
		expect(resolveCockpitAlertLevel(nominal)).toBe("nominal");
		const caution = createColorSnapshot();
		caution.gameState.commander.legalStatus = 4;
		expect(resolveCockpitAlertLevel(caution)).toBe("caution");
		const danger = createColorSnapshot();
		danger.gameState.flight.energy = 11;
		danger.gameState.flight.forwardShield = 12;
		danger.gameState.flow.laserTemperature = 240;
		expect(resolveCockpitAlertLevel(danger)).toBe("danger");
	});
	it("blinks warp/ecm/missile indicators using cadence and lock state", () => {
		const snapshot = createColorSnapshot();
		snapshot.gameState.flight.warpEngaged = true;
		snapshot.gameState.views.ecmEnabled = true;
		snapshot.gameState.flight.missileArmed = true;
		snapshot.gameState.timers.hudFlashMs = 0;
		const behavior0 = createCockpitColorBehavior(snapshot);
		expect(resolveIndicatorBlinkOn("warp", behavior0, false)).toBe(true);
		expect(resolveIndicatorBlinkOn("ecm", behavior0, false)).toBe(true);
		expect(resolveIndicatorBlinkOn("missile", behavior0, false)).toBe(true);
		// Move to a phase where slow blink is off but fast blink is on.
		snapshot.gameState.timers.hudFlashMs = 460;
		const behavior1 = createCockpitColorBehavior(snapshot);
		expect(resolveIndicatorBlinkOn("warp", behavior1, false)).toBe(false);
		expect(resolveIndicatorBlinkOn("ecm", behavior1, false)).toBe(true);
		expect(resolveIndicatorBlinkOn("missile", behavior1, false)).toBe(false);
		// Locked missile should remain steady regardless of slow blink state.
		expect(resolveIndicatorBlinkOn("missile", behavior1, true)).toBe(true);
	});
	it("dims warning text and blinking indicator color when flash phase is off", () => {
		const snapshot = createColorSnapshot();
		snapshot.gameState.flight.energy = 9;
		snapshot.gameState.timers.hudFlashMs = 0;
		const behaviorOn = createCockpitColorBehavior(snapshot);
		const warningOn = resolveOverlayToneColor("warning", behaviorOn);
		snapshot.gameState.timers.hudFlashMs = 460;
		const behaviorOff = createCockpitColorBehavior(snapshot);
		const warningOff = resolveOverlayToneColor("warning", behaviorOff);
		expect(warningOn).not.toBe(warningOff);
		const missileLamp = {
			key: "missile",
			label: "MSL",
			active: true,
			color: "#ffb0c6",
		};
		const lampOn = resolveIndicatorLampColor(missileLamp, behaviorOn, false);
		const lampOff = resolveIndicatorLampColor(missileLamp, behaviorOff, false);
		expect(lampOn).toBe(missileLamp.color);
		expect(lampOff).toBe(behaviorOff.palette.indicatorBlinkOff);
	});
});
