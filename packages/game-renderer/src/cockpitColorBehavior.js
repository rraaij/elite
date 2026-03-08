/**
 * Clamp one numeric value into an inclusive range.
 */
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
/**
 * Keep timer values in a bounded positive range.
 *
 * State model already wraps this timer, but normalizing again here keeps all
 * color behavior resilient even if snapshots are edited in tests/debug tools.
 */
function normalizeTimerMs(timerMs) {
	const wrapped = timerMs % 60_000;
	return wrapped >= 0 ? wrapped : wrapped + 60_000;
}
/**
 * Build deterministic slow/fast blink toggles from one timer value.
 */
export function createHudFlashState(timerMs) {
	const normalizedTimerMs = normalizeTimerMs(timerMs);
	// Slow cadence approximates classic alert lamp flashes.
	const slowPeriodMs = 420;
	// Fast cadence drives aggressive effects (ECM and critical danger cues).
	const fastPeriodMs = 180;
	// Pulse is a smooth triangle wave used for subtle width/alpha breathing.
	const pulsePeriodMs = 960;
	const slowOn = Math.floor(normalizedTimerMs / slowPeriodMs) % 2 === 0;
	const fastOn = Math.floor(normalizedTimerMs / fastPeriodMs) % 2 === 0;
	const pulsePhase01 = (normalizedTimerMs % pulsePeriodMs) / pulsePeriodMs;
	const pulse01 = pulsePhase01 <= 0.5 ? pulsePhase01 * 2 : (1 - pulsePhase01) * 2;
	return {
		timerMs: normalizedTimerMs,
		slowOn,
		fastOn,
		pulse01,
	};
}
/**
 * Resolve one high-level alert level from simulation state.
 *
 * Heuristic intent:
 * - `danger`: low survivability, high heat, severe legal threat, or close hostiles
 * - `caution`: active tactical systems / minor legal pressure / safe-zone constraints
 * - `nominal`: no current high-risk cues
 */
export function resolveCockpitAlertLevel(snapshot) {
	const { views, flight, commander, flow, universe } = snapshot.gameState;
	// Docked mode is treated as nominal unless legal status is already non-zero.
	if (views.isDocked) {
		return commander.legalStatus > 0 ? "caution" : "nominal";
	}
	// Critical thresholds map to red-alert cockpit treatment.
	const criticalEnergy = flight.energy <= 20;
	const criticalShield = flight.forwardShield <= 18 || flight.aftShield <= 18;
	const criticalHeat = flow.laserTemperature >= 224;
	const criticalLegal = commander.legalStatus >= 32;
	const closeHostile = universe.localBubbleShips.some(
		(ship) => ship.kind === "ship" && ship.position.z > 0 && ship.position.z < 2_800,
	);
	const depletedUnderThreat = closeHostile && flight.energy < 35;
	if (criticalEnergy || criticalShield || criticalHeat || criticalLegal || depletedUnderThreat) {
		return "danger";
	}
	// Caution covers tactical activity and mild legal/safe-zone warnings.
	const tacticalCaution =
		views.inStationSafeZone ||
		flight.warpEngaged ||
		views.ecmEnabled ||
		flight.missileArmed ||
		flow.laserTemperature >= 176;
	if (commander.legalStatus > 0 || tacticalCaution) {
		return "caution";
	}
	return "nominal";
}
/**
 * Nominal palette: blue/cyan cockpit treatment used for normal operation.
 */
const NOMINAL_PALETTE = {
	sceneBackground: "#00070f",
	horizonLine: "#24425f",
	sceneGrid: "rgba(28, 83, 120, 0.35)",
	wireframe: "#c6f6ff",
	panelFill: "rgba(3, 14, 29, 0.90)",
	panelRim: "rgba(116, 168, 222, 0.45)",
	scannerFill: "rgba(8, 26, 43, 0.88)",
	scannerFrame: "rgba(133, 192, 255, 0.40)",
	scannerGuide: "rgba(120, 177, 244, 0.20)",
	scannerShipRgb: [162, 247, 226],
	scannerDebrisRgb: [186, 209, 255],
	compassFill: "rgba(9, 23, 41, 0.90)",
	compassRing: "rgba(148, 205, 255, 0.68)",
	compassNeedle: "#a8ffe8",
	hudBarBackground: "rgba(8, 23, 43, 0.92)",
	hudBarBorder: "rgba(141, 192, 255, 0.45)",
	hudBarLabel: "#c8ecff",
	hudBarWarningOn: "#ff7d7d",
	hudBarWarningOff: "rgba(123, 60, 63, 0.78)",
	indicatorOff: "rgba(46, 64, 84, 0.80)",
	indicatorBlinkOff: "rgba(56, 77, 98, 0.82)",
	indicatorLabel: "#d6f0ff",
	overlayHeader: "rgba(4, 16, 31, 0.45)",
	overlayPrimary: "#d5f3ff",
	overlayAccent: "#91f3ff",
	overlayDim: "rgba(178, 210, 239, 0.72)",
	overlayWarningOn: "#ffad89",
	overlayWarningOff: "rgba(147, 96, 81, 0.74)",
	transitionSweep: "rgba(136, 189, 255, 0.14)",
	transitionBand: "rgba(180, 218, 255, 0.12)",
	reticle: "#8de6ff",
	headingPointer: "#4af98f",
	diagnostics: "rgba(177, 214, 243, 0.70)",
};
/**
 * Caution palette: warm amber shift used for legal/safe-zone/tactical warnings.
 */
const CAUTION_PALETTE = {
	sceneBackground: "#0e0902",
	horizonLine: "#5f4b24",
	sceneGrid: "rgba(140, 105, 38, 0.32)",
	wireframe: "#ffe7a1",
	panelFill: "rgba(33, 23, 8, 0.90)",
	panelRim: "rgba(221, 178, 107, 0.48)",
	scannerFill: "rgba(40, 24, 7, 0.88)",
	scannerFrame: "rgba(236, 198, 119, 0.42)",
	scannerGuide: "rgba(223, 175, 94, 0.23)",
	scannerShipRgb: [255, 223, 143],
	scannerDebrisRgb: [255, 194, 138],
	compassFill: "rgba(43, 29, 10, 0.90)",
	compassRing: "rgba(240, 194, 108, 0.70)",
	compassNeedle: "#ffd178",
	hudBarBackground: "rgba(38, 25, 7, 0.92)",
	hudBarBorder: "rgba(236, 190, 109, 0.48)",
	hudBarLabel: "#ffe5b2",
	hudBarWarningOn: "#ffb374",
	hudBarWarningOff: "rgba(132, 78, 47, 0.80)",
	indicatorOff: "rgba(84, 67, 46, 0.82)",
	indicatorBlinkOff: "rgba(105, 81, 52, 0.84)",
	indicatorLabel: "#ffeccc",
	overlayHeader: "rgba(29, 20, 7, 0.46)",
	overlayPrimary: "#ffeec9",
	overlayAccent: "#ffd991",
	overlayDim: "rgba(224, 196, 145, 0.74)",
	overlayWarningOn: "#ffbb7d",
	overlayWarningOff: "rgba(150, 97, 59, 0.74)",
	transitionSweep: "rgba(255, 204, 125, 0.14)",
	transitionBand: "rgba(255, 223, 160, 0.13)",
	reticle: "#ffd58a",
	headingPointer: "#ffd16a",
	diagnostics: "rgba(235, 205, 151, 0.74)",
};
/**
 * Danger palette: red/orange treatment for critical combat/ship-risk states.
 */
const DANGER_PALETTE = {
	sceneBackground: "#120303",
	horizonLine: "#612826",
	sceneGrid: "rgba(148, 56, 53, 0.34)",
	wireframe: "#ffd6cb",
	panelFill: "rgba(37, 9, 10, 0.92)",
	panelRim: "rgba(220, 112, 108, 0.50)",
	scannerFill: "rgba(47, 10, 12, 0.90)",
	scannerFrame: "rgba(238, 125, 120, 0.45)",
	scannerGuide: "rgba(202, 94, 89, 0.24)",
	scannerShipRgb: [255, 155, 139],
	scannerDebrisRgb: [255, 168, 168],
	compassFill: "rgba(42, 10, 11, 0.90)",
	compassRing: "rgba(235, 122, 118, 0.72)",
	compassNeedle: "#ff958c",
	hudBarBackground: "rgba(41, 11, 11, 0.93)",
	hudBarBorder: "rgba(214, 103, 100, 0.52)",
	hudBarLabel: "#ffd4cd",
	hudBarWarningOn: "#ff5b4d",
	hudBarWarningOff: "rgba(99, 38, 34, 0.84)",
	indicatorOff: "rgba(88, 47, 49, 0.84)",
	indicatorBlinkOff: "rgba(109, 56, 57, 0.86)",
	indicatorLabel: "#ffe5df",
	overlayHeader: "rgba(34, 8, 10, 0.48)",
	overlayPrimary: "#ffe6df",
	overlayAccent: "#ffb7ad",
	overlayDim: "rgba(220, 170, 164, 0.76)",
	overlayWarningOn: "#ff8f75",
	overlayWarningOff: "rgba(140, 76, 70, 0.78)",
	transitionSweep: "rgba(255, 137, 122, 0.16)",
	transitionBand: "rgba(255, 182, 166, 0.14)",
	reticle: "#ffb0a1",
	headingPointer: "#ff8f80",
	diagnostics: "rgba(233, 176, 168, 0.76)",
};
/**
 * Pick one static palette for an alert level.
 */
function paletteForAlertLevel(level) {
	switch (level) {
		case "caution":
			return CAUTION_PALETTE;
		case "danger":
			return DANGER_PALETTE;
		default:
			return NOMINAL_PALETTE;
	}
}
/**
 * Build the full color behavior object for one frame.
 */
export function createCockpitColorBehavior(snapshot) {
	const alertLevel = resolveCockpitAlertLevel(snapshot);
	const flash = createHudFlashState(snapshot.gameState.timers.hudFlashMs);
	const palette = paletteForAlertLevel(alertLevel);
	return {
		alertLevel,
		flash,
		palette,
	};
}
/**
 * Resolve bar fill color with warning blink behavior.
 */
export function resolveHudBarFillColor(bar, behavior) {
	if (!bar.warning) {
		return bar.color;
	}
	// Warning bars blink using the slow cadence for clear readability.
	return behavior.flash.slowOn
		? behavior.palette.hudBarWarningOn
		: behavior.palette.hudBarWarningOff;
}
/**
 * Resolve whether one indicator should currently appear "lit".
 */
export function resolveIndicatorBlinkOn(indicatorKey, behavior, missileLocked) {
	switch (indicatorKey) {
		case "dock":
			return true;
		case "safe":
			// In red-alert mode the safe lamp also blinks to avoid implying safety.
			return behavior.alertLevel === "danger" ? behavior.flash.slowOn : true;
		case "ecm":
			return behavior.flash.fastOn;
		case "warp":
			return behavior.flash.slowOn;
		case "missile":
			// Once lock is complete we keep the lamp solid; pre-lock remains blinking.
			return missileLocked ? true : behavior.flash.slowOn;
		default:
			return true;
	}
}
/**
 * Resolve final fill color for one indicator lamp.
 */
export function resolveIndicatorLampColor(indicator, behavior, missileLocked) {
	if (!indicator.active) {
		return behavior.palette.indicatorOff;
	}
	return resolveIndicatorBlinkOn(indicator.key, behavior, missileLocked)
		? indicator.color
		: behavior.palette.indicatorBlinkOff;
}
/**
 * Resolve one overlay text tone into a concrete per-frame color.
 */
export function resolveOverlayToneColor(tone, behavior) {
	switch (tone) {
		case "accent":
			return behavior.palette.overlayAccent;
		case "warning":
			// Warning text flashes with the same slow cadence as warning bars.
			return behavior.flash.slowOn
				? behavior.palette.overlayWarningOn
				: behavior.palette.overlayWarningOff;
		case "dim":
			return behavior.palette.overlayDim;
		default:
			return behavior.palette.overlayPrimary;
	}
}
/**
 * Resolve one scanner contact color with alert-sensitive alpha behavior.
 */
export function resolveScannerContactColor(contact, behavior) {
	const rgb =
		contact.kind === "ship" ? behavior.palette.scannerShipRgb : behavior.palette.scannerDebrisRgb;
	const baseAlpha = clamp(0.35 + contact.intensity * 0.65, 0.16, 1);
	// In danger mode we modulate alpha with fast blink cadence for urgency.
	const alertAlphaOffset =
		behavior.alertLevel === "danger" ? (behavior.flash.fastOn ? 0.14 : -0.14) : 0;
	const resolvedAlpha = clamp(baseAlpha + alertAlphaOffset, 0.12, 1);
	return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${resolvedAlpha.toFixed(3)})`;
}
