import type { SimulationSnapshot } from "../../game-core/src/index";

/**
 * Text tone buckets used by the cockpit text layer renderer.
 */
export type OverlayTextTone = "primary" | "accent" | "warning" | "dim";

/**
 * One formatted text line with color intent + alignment hint.
 */
export interface OverlayTextLine {
	text: string;
	tone: OverlayTextTone;
	align: "left" | "right" | "center";
}

/**
 * Resolved text-layer payload for one frame.
 */
export interface CockpitTextLayerModel {
	viewLabel: string;
	phaseLabel: string;
	topLeft: OverlayTextLine[];
	topRight: OverlayTextLine[];
	bottomCenter: OverlayTextLine[];
}

/**
 * Stable key representing the currently active visual presentation state.
 *
 * We include both high-level flow phase and selected cockpit view so transition
 * effects can trigger for:
 * - docked/in-space changes
 * - cockpit view switches
 */
export function createViewPresentationKey(snapshot: SimulationSnapshot): string {
	return `${snapshot.gameState.flow.phase}:${snapshot.gameState.views.selectedView}`;
}

/**
 * Transition tracker state carried between renderer frames.
 */
export interface ViewTransitionTracker {
	currentViewKey: string | null;
	active: {
		fromViewKey: string;
		toViewKey: string;
		startTick: number;
		durationTicks: number;
	} | null;
}

/**
 * Frame-local transition information used by draw functions.
 */
export interface ViewTransitionFrame {
	active: boolean;
	fromViewKey: string | null;
	toViewKey: string;
	progress01: number;
}

/**
 * Build a fresh transition tracker.
 */
export function createViewTransitionTracker(): ViewTransitionTracker {
	return {
		currentViewKey: null,
		active: null,
	};
}

/**
 * Clamp one number into an inclusive range.
 */
function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Advance transition tracker state for the current frame.
 *
 * Rules:
 * - first frame initializes tracker without animation
 * - key changes trigger a new transition
 * - transitions auto-complete after `durationTicks`
 * - if key changes mid-transition, a new transition starts immediately
 */
export function stepViewTransitionTracker(
	tracker: ViewTransitionTracker,
	currentViewKey: string,
	tick: number,
	durationTicks = 18,
): {
	tracker: ViewTransitionTracker;
	frame: ViewTransitionFrame;
} {
	const normalizedDuration = Math.max(1, Math.floor(durationTicks));

	if (tracker.currentViewKey === null) {
		const nextTracker: ViewTransitionTracker = {
			currentViewKey,
			active: null,
		};
		return {
			tracker: nextTracker,
			frame: {
				active: false,
				fromViewKey: null,
				toViewKey: currentViewKey,
				progress01: 1,
			},
		};
	}

	let nextTracker: ViewTransitionTracker = {
		currentViewKey: tracker.currentViewKey,
		active: tracker.active ? { ...tracker.active } : null,
	};

	// Start/restart transition when the visible key changes.
	if (tracker.currentViewKey !== currentViewKey) {
		nextTracker = {
			currentViewKey,
			active: {
				fromViewKey: tracker.currentViewKey,
				toViewKey: currentViewKey,
				startTick: tick,
				durationTicks: normalizedDuration,
			},
		};
	}

	if (!nextTracker.active) {
		return {
			tracker: nextTracker,
			frame: {
				active: false,
				fromViewKey: null,
				toViewKey: nextTracker.currentViewKey ?? currentViewKey,
				progress01: 1,
			},
		};
	}

	const elapsed = tick - nextTracker.active.startTick;
	const progress01 = clamp(elapsed / nextTracker.active.durationTicks, 0, 1);
	if (progress01 >= 1) {
		nextTracker.active = null;
		return {
			tracker: nextTracker,
			frame: {
				active: false,
				fromViewKey: null,
				toViewKey: nextTracker.currentViewKey ?? currentViewKey,
				progress01: 1,
			},
		};
	}

	return {
		tracker: nextTracker,
		frame: {
			active: true,
			fromViewKey: nextTracker.active.fromViewKey,
			toViewKey: nextTracker.active.toViewKey,
			progress01,
		},
	};
}

/**
 * Human-readable label for cockpit view ids.
 */
function toViewLabel(
	selectedView: SimulationSnapshot["gameState"]["views"]["selectedView"],
): string {
	switch (selectedView) {
		case "front":
			return "FRONT VIEW";
		case "rear":
			return "REAR VIEW";
		case "left":
			return "LEFT VIEW";
		case "right":
			return "RIGHT VIEW";
		case "short-range-chart":
			return "SHORT RANGE CHART";
		case "galactic-chart":
			return "GALACTIC CHART";
		default:
			return "UNKNOWN VIEW";
	}
}

/**
 * Human-readable label for flow phase ids.
 */
function toPhaseLabel(phase: SimulationSnapshot["gameState"]["flow"]["phase"]): string {
	switch (phase) {
		case "docked":
			return "DOCKED";
		case "in-space":
			return "IN SPACE";
		case "title":
			return "TITLE";
		case "boot":
			return "BOOT";
		default:
			return "UNKNOWN";
	}
}

/**
 * Build top-left status text block.
 */
function buildTopLeftLines(snapshot: SimulationSnapshot): OverlayTextLine[] {
	return [
		{
			text: `VIEW  ${toViewLabel(snapshot.gameState.views.selectedView)}`,
			tone: "primary",
			align: "left",
		},
		{
			text: `MODE  ${toPhaseLabel(snapshot.gameState.flow.phase)}`,
			tone: "accent",
			align: "left",
		},
		{
			text: `TICK  ${snapshot.tick.toString().padStart(6, " ")}`,
			tone: "dim",
			align: "left",
		},
	];
}

/**
 * Build top-right system values text block.
 */
function buildTopRightLines(snapshot: SimulationSnapshot): OverlayTextLine[] {
	const lockTarget = snapshot.gameState.flight.missileTargetSlotId;
	const lockText = lockTarget === null ? "---" : lockTarget.toString().padStart(3, " ");
	return [
		{
			text: `SPD ${snapshot.playerSpeed.toFixed(1).padStart(6, " ")}`,
			tone: "accent",
			align: "right",
		},
		{
			text: `ENG ${snapshot.gameState.flight.energy.toFixed(1).padStart(6, " ")}`,
			tone: snapshot.gameState.flight.energy < 22 ? "warning" : "primary",
			align: "right",
		},
		{
			text: `LCK ${lockText}`,
			tone: snapshot.gameState.flight.missileArmed ? "accent" : "dim",
			align: "right",
		},
	];
}

/**
 * Build bottom-center context messages.
 */
function buildBottomCenterLines(snapshot: SimulationSnapshot): OverlayTextLine[] {
	if (snapshot.gameState.views.isDocked) {
		return [
			{
				text: "DOCKING CONTROL ACTIVE",
				tone: "accent",
				align: "center",
			},
			{
				text: "PRESS LAUNCH TO EXIT STATION",
				tone: "dim",
				align: "center",
			},
		];
	}

	if (snapshot.gameState.views.inStationSafeZone) {
		return [
			{
				text: "STATION SAFE-ZONE",
				tone: "warning",
				align: "center",
			},
			{
				text: "WEAPONS FIRE INCREASES LEGAL STATUS",
				tone: "dim",
				align: "center",
			},
		];
	}

	if (snapshot.gameState.flight.warpEngaged) {
		return [
			{
				text: "WARP DRIVE ENGAGED",
				tone: "accent",
				align: "center",
			},
			{
				text: `FUEL ${snapshot.gameState.commander.fuelTenths.toFixed(1).padStart(4, " ")} TENTHS`,
				tone: "primary",
				align: "center",
			},
		];
	}

	if (snapshot.gameState.commander.legalStatus > 0) {
		return [
			{
				text: `LEGAL ALERT ${snapshot.gameState.commander.legalStatus.toString().padStart(3, " ")}`,
				tone: "warning",
				align: "center",
			},
			{
				text: "POLICE RESPONSE PROBABILITY INCREASED",
				tone: "dim",
				align: "center",
			},
		];
	}

	return [
		{
			text: "FLIGHT SYSTEMS NOMINAL",
			tone: "primary",
			align: "center",
		},
		{
			text: "LONG RANGE SCANNER STANDBY",
			tone: "dim",
			align: "center",
		},
	];
}

/**
 * Build full text-layer model for one snapshot.
 */
export function createCockpitTextLayerModel(snapshot: SimulationSnapshot): CockpitTextLayerModel {
	return {
		viewLabel: toViewLabel(snapshot.gameState.views.selectedView),
		phaseLabel: toPhaseLabel(snapshot.gameState.flow.phase),
		topLeft: buildTopLeftLines(snapshot),
		topRight: buildTopRightLines(snapshot),
		bottomCenter: buildBottomCenterLines(snapshot),
	};
}
