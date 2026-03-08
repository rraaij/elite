/**
 * Canonical simulation state model for the migration.
 *
 * This structure intentionally captures the core domains we need to port:
 * - commander progression state
 * - local universe ship state
 * - view/mode flags
 * - timer buckets
 * - flight dynamics state
 *
 * Even while gameplay is still partial, centralizing this model now prevents
 * subsystem state from scattering across ad-hoc module variables later.
 */

export interface Vector3 {
	x: number;
	y: number;
	z: number;
}

export interface CommanderState {
	name: string;
	creditsCenticredits: number;
	fuelTenths: number;
	legalStatus: number;
	combatRankPoints: number;
}

export type CockpitView =
	| "front"
	| "rear"
	| "left"
	| "right"
	| "short-range-chart"
	| "galactic-chart";

export interface ViewFlagsState {
	isDocked: boolean;
	inWitchspace: boolean;
	inStationSafeZone: boolean;
	dockingComputerEnabled: boolean;
	ecmEnabled: boolean;
	selectedView: CockpitView;
}

export interface FlightState {
	headingDeg: number;
	speed: number;
	rollRate: number;
	pitchRate: number;
	warpEngaged: boolean;
	warpChargeMs: number;
	warpFuelAccumulatorMs: number;
	missileCount: number;
	missileArmed: boolean;
	missileTargetSlotId: number | null;
	missileLockTimerMs: number;
	ecmActiveMs: number;
	stationDistance: number;
	energy: number;
	forwardShield: number;
	aftShield: number;
}

export type LocalUniverseObjectKind = "ship" | "debris";

export interface LocalUniverseShipState {
	slotId: number;
	kind: LocalUniverseObjectKind;
	blueprintId: number;
	flags: number;
	hullStrength: number;
	ageMs: number;
	ttlMs: number | null;
	position: Vector3;
	velocity: Vector3;
}

export interface UniverseState {
	galaxyNumber: number;
	currentSystemSeed: [number, number, number];
	targetSystemSeed: [number, number, number];
	localBubbleShips: LocalUniverseShipState[];
	nextShipSlotId: number;
}

export interface TimerState {
	frameTicks: number;
	missionTicks: number;
	spawnCountdownMs: number;
	hudFlashMs: number;
}

/**
 * The original assembly exposes key entry points that shape startup and loop
 * flow. We keep symbolic names here so TypeScript state can be reasoned about
 * against the same conceptual labels.
 */
export type LegacyEntryPoint =
	| "BEGIN"
	| "TT170"
	| "RESET"
	| "RES2"
	| "DEATH2"
	| "BR1"
	| "TT100"
	| "MLOOP";

/**
 * High-level runtime phase used by the browser migration runtime.
 */
export type RuntimeFlowPhase = "boot" | "title" | "docked" | "in-space";

/**
 * Control-flow mirrors of startup/reset and loop state.
 *
 * These fields are intentionally explicit so we can build parity tests around
 * startup and loop behavior before every gameplay subsystem is fully ported.
 */
export interface ControlFlowState {
	phase: RuntimeFlowPhase;
	currentEntryPoint: LegacyEntryPoint;
	stackPointer: number;
	stackResetCount: number;
	beginCount: number;
	tt170Count: number;
	resetCount: number;
	res2Count: number;
	death2Count: number;
	br1Count: number;
	mainLoopCounter: number;
	messageDelayCounter: number;
	laserPulseCounter: number;
	laserTemperature: number;
	autoLaunchedFromTitle: boolean;
}

export interface CanonicalGameState {
	schemaVersion: 1;
	scenarioId: string;
	commander: CommanderState;
	views: ViewFlagsState;
	flight: FlightState;
	universe: UniverseState;
	timers: TimerState;
	flow: ControlFlowState;
}

export interface CanonicalStateStepInput {
	stepMs: number;
	headingJitter: number;
	speedJitter: number;
	spawnRoll: number;
	controlRollAxis?: number;
	controlPitchAxis?: number;
	controlThrottleAxis?: number;
	requestWarpToggle?: boolean;
	requestEscapePod?: boolean;
	requestFireLaser?: boolean;
	requestMissileArmToggle?: boolean;
	requestMissileFire?: boolean;
	requestEcmToggle?: boolean;
	requestDockAttempt?: boolean;
	requestLaunch?: boolean;
}

interface StartupSequenceOptions {
	autoLaunchFromTitle: boolean;
}

/**
 * Clamp a numeric value into an inclusive range.
 */
function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Wrap one number to unsigned 8-bit range.
 */
function wrapUint8(value: number): number {
	return value & 0xff;
}

/**
 * Normalize heading to [0, 360) so telemetry and rendering stay stable.
 */
function normalizeHeading(angleDeg: number): number {
	const wrapped = angleDeg % 360;
	return wrapped >= 0 ? wrapped : wrapped + 360;
}

/**
 * Creates initial commander state with conservative defaults that map to a
 * "new game" profile while we continue porting canonical save formats.
 */
function createInitialCommanderState(): CommanderState {
	return {
		name: "JAMESON",
		// Store credits as centicredits for deterministic integer math.
		creditsCenticredits: 10_000,
		fuelTenths: 70,
		legalStatus: 0,
		combatRankPoints: 0,
	};
}

/**
 * Creates initial view/mode flags.
 */
function createInitialViewFlagsState(): ViewFlagsState {
	return {
		isDocked: false,
		inWitchspace: false,
		inStationSafeZone: false,
		dockingComputerEnabled: false,
		ecmEnabled: false,
		selectedView: "front",
	};
}

/**
 * Creates initial flight state. Values are intentionally bounded and simple
 * while the full flight model is still being ported.
 */
function createInitialFlightState(): FlightState {
	return {
		headingDeg: 0,
		speed: 8,
		rollRate: 0,
		pitchRate: 0,
		warpEngaged: false,
		warpChargeMs: 0,
		warpFuelAccumulatorMs: 0,
		missileCount: 3,
		missileArmed: false,
		missileTargetSlotId: null,
		missileLockTimerMs: 0,
		ecmActiveMs: 0,
		stationDistance: 4_800,
		energy: 100,
		forwardShield: 100,
		aftShield: 100,
	};
}

/**
 * Creates initial universe state. Seeds are placeholders for now but keep the
 * expected data shape so galaxy/system logic can plug in incrementally.
 */
function createInitialUniverseState(): UniverseState {
	return {
		galaxyNumber: 0,
		currentSystemSeed: [0x5a4a, 0x0248, 0xb753],
		targetSystemSeed: [0x5a4a, 0x0248, 0xb753],
		localBubbleShips: [],
		nextShipSlotId: 1,
	};
}

/**
 * Creates initial timer buckets.
 */
function createInitialTimerState(): TimerState {
	return {
		frameTicks: 0,
		missionTicks: 0,
		spawnCountdownMs: 900,
		hudFlashMs: 0,
	};
}

/**
 * Creates initial control-flow state before BEGIN is executed.
 */
function createInitialControlFlowState(): ControlFlowState {
	return {
		phase: "boot",
		currentEntryPoint: "BEGIN",
		stackPointer: 0xff,
		stackResetCount: 0,
		beginCount: 0,
		tt170Count: 0,
		resetCount: 0,
		res2Count: 0,
		death2Count: 0,
		br1Count: 0,
		mainLoopCounter: 0,
		messageDelayCounter: 0,
		laserPulseCounter: 0,
		laserTemperature: 0,
		autoLaunchedFromTitle: false,
	};
}

/**
 * TT170/DEATH2 both reset the 6502 stack pointer to $01FF.
 * We track only the low byte because the modeled machine stack page is fixed.
 */
function resetStackPointer(flow: ControlFlowState): void {
	flow.stackPointer = 0xff;
	flow.stackResetCount += 1;
}

/**
 * Shared state resets from RESET and RES2.
 */
function clearFlightAndUniverseWorkspaces(state: CanonicalGameState): void {
	state.views.inWitchspace = false;
	state.views.inStationSafeZone = false;
	state.views.dockingComputerEnabled = false;
	state.views.ecmEnabled = false;
	state.views.selectedView = "front";

	state.universe.localBubbleShips = [];
	state.universe.nextShipSlotId = 1;

	state.flight.rollRate = 0;
	state.flight.pitchRate = 0;
	state.flight.speed = 3;
	state.flight.warpEngaged = false;
	state.flight.warpChargeMs = 0;
	state.flight.warpFuelAccumulatorMs = 0;
	state.flight.missileArmed = false;
	state.flight.missileTargetSlotId = null;
	state.flight.missileLockTimerMs = 0;
	state.flight.ecmActiveMs = 0;
	state.flight.stationDistance = 4_800;

	state.timers.spawnCountdownMs = 900;
	state.timers.hudFlashMs = 0;

	state.flow.mainLoopCounter = 0;
	state.flow.messageDelayCounter = 0;
	state.flow.laserPulseCounter = 0;
	state.flow.laserTemperature = 0;
}

/**
 * Equivalent of BEGIN: initialize configuration defaults and commander context.
 *
 * In the migration runtime this is mostly bookkeeping and flow tracking, as
 * canonical commander defaults are created by `createInitialCommanderState`.
 */
export function runBeginEntryPoint(state: CanonicalGameState): void {
	state.flow.currentEntryPoint = "BEGIN";
	state.flow.phase = "boot";
	state.flow.beginCount += 1;
}

/**
 * Equivalent of RESET: docked flag, shield/energy refill and workspace reset.
 */
export function runResetEntryPoint(state: CanonicalGameState): void {
	state.flow.currentEntryPoint = "RESET";
	state.flow.phase = "docked";
	state.flow.resetCount += 1;

	state.views.isDocked = true;
	state.views.inStationSafeZone = true;

	state.flight.energy = 100;
	state.flight.forwardShield = 100;
	state.flight.aftShield = 100;
	state.flight.stationDistance = 0;

	clearFlightAndUniverseWorkspaces(state);

	// Reset clears most workspaces, but in docked mode we pin station distance
	// and safe-zone state explicitly.
	state.views.inStationSafeZone = true;
	state.flight.stationDistance = 0;
}

/**
 * Equivalent of RES2: reset transient flight workspaces and scanner context.
 */
export function runRes2EntryPoint(state: CanonicalGameState): void {
	state.flow.currentEntryPoint = "RES2";
	state.flow.res2Count += 1;

	clearFlightAndUniverseWorkspaces(state);
	state.views.inStationSafeZone = false;
	state.flight.stationDistance = 4_800;
}

/**
 * Equivalent of TT170: reset stack and run RESET.
 */
export function runTt170EntryPoint(state: CanonicalGameState): void {
	state.flow.currentEntryPoint = "TT170";
	state.flow.tt170Count += 1;
	resetStackPointer(state.flow);
	runResetEntryPoint(state);
}

/**
 * Equivalent of DEATH2: reset stack, run RES2, then jump to title flow (BR1).
 */
export function runDeath2EntryPoint(state: CanonicalGameState): void {
	state.flow.currentEntryPoint = "DEATH2";
	state.flow.death2Count += 1;
	resetStackPointer(state.flow);

	runRes2EntryPoint(state);

	// After DEATH2 the original code falls through to title/startup flow (BR1).
	state.views.isDocked = true;
	state.flow.phase = "title";
	state.flow.currentEntryPoint = "BR1";
	state.flow.br1Count += 1;
}

/**
 * Runs the startup chain:
 * BEGIN -> TT170 -> RESET -> DEATH2 -> BR1 (title path)
 *
 * `autoLaunchFromTitle` is a migration-only convenience that keeps the default
 * web runtime in-space, so existing deterministic movement diagnostics continue
 * to run without requiring title/menu input flows yet.
 */
export function runStartupSequence(
	state: CanonicalGameState,
	options?: Partial<StartupSequenceOptions>,
): void {
	const autoLaunchFromTitle = options?.autoLaunchFromTitle ?? true;

	runBeginEntryPoint(state);
	runTt170EntryPoint(state);
	runDeath2EntryPoint(state);

	if (autoLaunchFromTitle) {
		state.flow.autoLaunchedFromTitle = true;
		state.views.isDocked = false;
		state.views.inStationSafeZone = false;
		state.flight.stationDistance = 4_800;
		state.flow.phase = "in-space";
		state.flow.currentEntryPoint = "TT100";
	} else {
		state.flow.autoLaunchedFromTitle = false;
	}
}

/**
 * Creates the canonical game state root object for one scenario.
 */
export function createCanonicalGameState(scenarioId: string): CanonicalGameState {
	const state: CanonicalGameState = {
		schemaVersion: 1,
		scenarioId,
		commander: createInitialCommanderState(),
		views: createInitialViewFlagsState(),
		flight: createInitialFlightState(),
		universe: createInitialUniverseState(),
		timers: createInitialTimerState(),
		flow: createInitialControlFlowState(),
	};

	// Execute startup entry-point equivalents once during state creation.
	runStartupSequence(state, { autoLaunchFromTitle: true });

	return state;
}

/**
 * Deep clone utility for canonical state.
 * We keep this explicit instead of using JSON serialization so number fields
 * and tuple shapes remain under direct type-checked control.
 */
export function cloneCanonicalGameState(state: CanonicalGameState): CanonicalGameState {
	return {
		schemaVersion: state.schemaVersion,
		scenarioId: state.scenarioId,
		commander: {
			...state.commander,
		},
		views: {
			...state.views,
		},
		flight: {
			...state.flight,
		},
		universe: {
			galaxyNumber: state.universe.galaxyNumber,
			currentSystemSeed: [...state.universe.currentSystemSeed] as [number, number, number],
			targetSystemSeed: [...state.universe.targetSystemSeed] as [number, number, number],
			localBubbleShips: state.universe.localBubbleShips.map((ship) => ({
				slotId: ship.slotId,
				kind: ship.kind,
				blueprintId: ship.blueprintId,
				flags: ship.flags,
				hullStrength: ship.hullStrength,
				ageMs: ship.ageMs,
				ttlMs: ship.ttlMs,
				position: { ...ship.position },
				velocity: { ...ship.velocity },
			})),
			nextShipSlotId: state.universe.nextShipSlotId,
		},
		timers: {
			...state.timers,
		},
		flow: {
			phase: state.flow.phase,
			currentEntryPoint: state.flow.currentEntryPoint,
			stackPointer: state.flow.stackPointer,
			stackResetCount: state.flow.stackResetCount,
			beginCount: state.flow.beginCount,
			tt170Count: state.flow.tt170Count,
			resetCount: state.flow.resetCount,
			res2Count: state.flow.res2Count,
			death2Count: state.flow.death2Count,
			br1Count: state.flow.br1Count,
			mainLoopCounter: state.flow.mainLoopCounter,
			messageDelayCounter: state.flow.messageDelayCounter,
			laserPulseCounter: state.flow.laserPulseCounter,
			laserTemperature: state.flow.laserTemperature,
			autoLaunchedFromTitle: state.flow.autoLaunchedFromTitle,
		},
	};
}

/**
 * Spawns one lightweight placeholder ship into the local bubble.
 *
 * This gives the canonical model a concrete ship-block list early in migration,
 * while detailed spawn logic from NWSHP/NWSTARS is still pending.
 */
function spawnPlaceholderShip(state: CanonicalGameState, spawnRoll: number): void {
	const slotId = state.universe.nextShipSlotId;
	state.universe.nextShipSlotId += 1;

	// Cycle through a small subset of known ship blueprint IDs for visual variety.
	const blueprintCycle = [11, 12, 16, 17, 19, 24];
	const blueprintId = blueprintCycle[spawnRoll % blueprintCycle.length] ?? 11;

	const ship: LocalUniverseShipState = {
		slotId,
		kind: "ship",
		blueprintId,
		flags: spawnRoll & 0b111,
		hullStrength: 50 + (spawnRoll & 0x1f),
		ageMs: 0,
		ttlMs: null,
		position: {
			x: (spawnRoll & 0x0f) * 64 - 480,
			y: ((spawnRoll >> 4) & 0x0f) * 40 - 300,
			z: 10_000 + (spawnRoll & 0x3f) * 32,
		},
		velocity: {
			x: ((spawnRoll & 0b11) - 1) * 6,
			y: (((spawnRoll >> 2) & 0b11) - 1) * 4,
			z: -40 - (spawnRoll & 0x0f),
		},
	};

	state.universe.localBubbleShips.push(ship);
}

/**
 * Hard cap on local bubble object count while we are still in placeholder mode.
 *
 * This prevents unbounded growth if spawn/destruction logic diverges during
 * migration before the full NWSHP object allocation semantics are ported.
 */
const MAX_LOCAL_BUBBLE_OBJECTS = 24;

/**
 * Build one debris fragment from a destroyed ship.
 */
function createDebrisFragment(
	state: CanonicalGameState,
	sourceShip: LocalUniverseShipState,
	spreadSeed: number,
): LocalUniverseShipState {
	const slotId = state.universe.nextShipSlotId;
	state.universe.nextShipSlotId += 1;

	const xImpulse = ((spreadSeed & 0b111) - 3) * 2;
	const yImpulse = (((spreadSeed >> 3) & 0b111) - 3) * 2;
	const zImpulse = -15 - ((spreadSeed >> 6) & 0b11) * 8;

	return {
		slotId,
		kind: "debris",
		blueprintId: sourceShip.blueprintId,
		flags: sourceShip.flags | 0b1000_0000,
		hullStrength: 1,
		ageMs: 0,
		ttlMs: 1200 + (spreadSeed & 0x3f) * 25,
		position: {
			x: sourceShip.position.x,
			y: sourceShip.position.y,
			z: sourceShip.position.z,
		},
		velocity: {
			x: sourceShip.velocity.x + xImpulse,
			y: sourceShip.velocity.y + yImpulse,
			z: sourceShip.velocity.z + zImpulse,
		},
	};
}

/**
 * Create a deterministic debris cloud after ship destruction.
 */
function createDebrisCloud(
	state: CanonicalGameState,
	sourceShip: LocalUniverseShipState,
	destructionRoll: number,
): LocalUniverseShipState[] {
	// Keep fragment count modest so placeholder simulation remains lightweight.
	const fragmentCount = 2 + (destructionRoll & 0b1);
	const fragments: LocalUniverseShipState[] = [];

	for (let index = 0; index < fragmentCount; index += 1) {
		const spreadSeed = (destructionRoll + index * 37) & 0xff;
		fragments.push(createDebrisFragment(state, sourceShip, spreadSeed));
	}

	return fragments;
}

/**
 * Resolve one ship by slot id from the local bubble.
 */
function findShipBySlotId(
	state: CanonicalGameState,
	slotId: number | null,
): LocalUniverseShipState | null {
	if (slotId === null) {
		return null;
	}

	const ship = state.universe.localBubbleShips.find(
		(candidate) => candidate.slotId === slotId && candidate.kind === "ship",
	);

	return ship ?? null;
}

/**
 * Picks one front-facing combat target in the local bubble.
 *
 * This is a deterministic placeholder for the much richer visibility/targeting
 * logic in the original game. We intentionally keep it simple:
 * - only ships (not debris)
 * - in front of player (z > 0)
 * - roughly within cockpit forward cone bounds
 * - nearest by z depth wins
 */
function selectFrontCombatTarget(state: CanonicalGameState): LocalUniverseShipState | null {
	let bestTarget: LocalUniverseShipState | null = null;
	let bestDepth = Number.POSITIVE_INFINITY;

	for (const ship of state.universe.localBubbleShips) {
		if (ship.kind !== "ship") {
			continue;
		}

		if (ship.position.z <= 0) {
			continue;
		}

		if (Math.abs(ship.position.x) > 1400 || Math.abs(ship.position.y) > 900) {
			continue;
		}

		if (ship.position.z < bestDepth) {
			bestDepth = ship.position.z;
			bestTarget = ship;
		}
	}

	return bestTarget;
}

/**
 * Approximate station-safe-zone bounds for migration placeholder logic.
 */
const STATION_SAFE_ZONE_DISTANCE = 1_800;
const STATION_DOCKING_DISTANCE = 260;
const STATION_LAUNCH_DISTANCE = 700;

/**
 * Advance station distance and update safe-zone flag while in space.
 *
 * We model a simple forward approach: higher ship speed reduces the distance to
 * station over time. This gives deterministic, testable docking behavior while
 * full spatial/orientation docking math is still pending.
 */
function updateStationProximity(state: CanonicalGameState, stepMs: number): void {
	if (state.views.isDocked) {
		state.flight.stationDistance = 0;
		state.views.inStationSafeZone = true;
		return;
	}

	// Convert speed into a deterministic approach rate.
	const approachRatePerSecond = state.flight.speed * 22;
	const distanceDelta = approachRatePerSecond * (stepMs / 1000);
	state.flight.stationDistance = Math.max(0, state.flight.stationDistance - distanceDelta);
	state.views.inStationSafeZone = state.flight.stationDistance <= STATION_SAFE_ZONE_DISTANCE;
}

/**
 * Attempt to dock at station when requested.
 *
 * Returns true if docking succeeded and transitioned the state to docked mode.
 */
function applyDockAttempt(state: CanonicalGameState, requestDockAttempt: boolean): boolean {
	if (!requestDockAttempt || state.views.isDocked) {
		return false;
	}

	if (!state.views.inStationSafeZone) {
		return false;
	}

	if (state.flight.stationDistance > STATION_DOCKING_DISTANCE) {
		return false;
	}

	// Docking too fast causes a shield scrape and aborts docking this step.
	if (state.flight.speed > 12) {
		state.flight.forwardShield = clamp(state.flight.forwardShield - 14, 0, 100);
		state.flight.aftShield = clamp(state.flight.aftShield - 8, 0, 100);
		return false;
	}

	state.views.isDocked = true;
	state.views.inStationSafeZone = true;
	state.flow.phase = "docked";
	state.flow.currentEntryPoint = "MLOOP";

	state.flight.speed = 0;
	state.flight.warpEngaged = false;
	state.flight.warpChargeMs = 0;
	state.flight.warpFuelAccumulatorMs = 0;
	state.flight.stationDistance = 0;

	state.flight.missileArmed = false;
	state.flight.missileTargetSlotId = null;
	state.flight.missileLockTimerMs = 0;
	state.views.ecmEnabled = false;
	state.flight.ecmActiveMs = 0;

	// Reset local bubble around station after successful docking.
	state.universe.localBubbleShips = [];
	state.timers.spawnCountdownMs = 900;

	return true;
}

/**
 * Launch transition from docked mode into in-space mode.
 *
 * Returns true if launch occurred.
 */
function applyLaunchTransition(state: CanonicalGameState, requestLaunch: boolean): boolean {
	if (!requestLaunch || !state.views.isDocked) {
		return false;
	}

	state.views.isDocked = false;
	state.views.inStationSafeZone = true;
	state.flow.phase = "in-space";
	state.flow.currentEntryPoint = "TT100";

	state.flight.speed = 8;
	state.flight.rollRate = 0;
	state.flight.pitchRate = 0;
	state.flight.stationDistance = STATION_LAUNCH_DISTANCE;
	state.flight.missileArmed = false;
	state.flight.missileTargetSlotId = null;
	state.flight.missileLockTimerMs = 0;
	state.views.ecmEnabled = false;
	state.flight.ecmActiveMs = 0;

	return true;
}

/**
 * Apply one laser pulse if allowed.
 *
 * Laser behavior in this migration slice:
 * - gated by pulse counter + overheat
 * - drains energy per pulse
 * - damages one front target if available
 */
function applyLaserCombat(
	state: CanonicalGameState,
	requestFireLaser: boolean,
	combatRoll: number,
): void {
	if (!requestFireLaser) {
		return;
	}

	if (state.flow.laserPulseCounter > 0) {
		return;
	}

	if (state.flow.laserTemperature >= 224) {
		return;
	}

	if (state.flight.energy <= 0.5) {
		return;
	}

	state.flow.laserPulseCounter = 6;
	state.flow.laserTemperature = clamp(state.flow.laserTemperature + 22, 0, 255);
	state.flight.energy = clamp(state.flight.energy - 0.65, 0, 100);

	// Firing in the station safe zone is considered illegal and increases status.
	if (state.views.inStationSafeZone) {
		state.commander.legalStatus = clamp(state.commander.legalStatus + 1, 0, 255);
	}

	const target = selectFrontCombatTarget(state);
	if (!target) {
		return;
	}

	const baseDamage = 10 + (combatRoll & 0x07);
	const controlBonus = Math.floor(
		(Math.abs(state.flight.rollRate) + Math.abs(state.flight.pitchRate)) * 1.5,
	);
	const laserDamage = baseDamage + controlBonus;
	target.hullStrength = Math.max(0, target.hullStrength - laserDamage);
}

/**
 * Update missile arming/locking and optionally fire one missile.
 *
 * Lock behavior:
 * - arming picks a front target if available
 * - lock timer grows while target remains valid
 * - firing requires lock timer threshold
 */
function applyMissileCombat(
	state: CanonicalGameState,
	stepMs: number,
	requestMissileArmToggle: boolean,
	requestMissileFire: boolean,
	combatRoll: number,
): void {
	if (requestMissileArmToggle) {
		if (state.flight.missileArmed) {
			state.flight.missileArmed = false;
			state.flight.missileTargetSlotId = null;
			state.flight.missileLockTimerMs = 0;
		} else if (state.flight.missileCount > 0) {
			state.flight.missileArmed = true;
			const candidate = selectFrontCombatTarget(state);
			state.flight.missileTargetSlotId = candidate?.slotId ?? null;
			state.flight.missileLockTimerMs = 0;
		}
	}

	if (!state.flight.missileArmed) {
		state.flight.missileTargetSlotId = null;
		state.flight.missileLockTimerMs = 0;
		return;
	}

	// Refresh target if previous slot disappeared.
	let target = findShipBySlotId(state, state.flight.missileTargetSlotId);
	if (!target) {
		target = selectFrontCombatTarget(state);
		state.flight.missileTargetSlotId = target?.slotId ?? null;
		state.flight.missileLockTimerMs = 0;
	} else {
		state.flight.missileLockTimerMs += stepMs;
	}

	// We need a target and lock time before missile launch can occur.
	const hasLock = state.flight.missileLockTimerMs >= 450;
	if (!requestMissileFire || !target || !hasLock || state.flight.missileCount <= 0) {
		return;
	}

	state.flight.missileCount -= 1;
	state.flight.missileArmed = false;
	state.flight.missileTargetSlotId = null;
	state.flight.missileLockTimerMs = 0;

	const missileDamage = 64 + (combatRoll & 0x0f);
	target.hullStrength = Math.max(0, target.hullStrength - missileDamage);

	// Missile launches inside the safe zone are heavily illegal.
	if (state.views.inStationSafeZone) {
		state.commander.legalStatus = clamp(state.commander.legalStatus + 4, 0, 255);
	}
}

/**
 * Handle ECM toggles and energy drain.
 */
function applyEcmState(state: CanonicalGameState, stepMs: number, requestEcmToggle: boolean): void {
	if (requestEcmToggle) {
		if (state.views.ecmEnabled) {
			state.views.ecmEnabled = false;
			state.flight.ecmActiveMs = 0;
		} else if (state.flight.energy > 2) {
			state.views.ecmEnabled = true;
			state.flight.ecmActiveMs = 0;
		}
	}

	if (!state.views.ecmEnabled) {
		state.flight.ecmActiveMs = 0;
		return;
	}

	state.flight.ecmActiveMs += stepMs;
	const drain = 0.14 * (stepMs / 16.67);
	state.flight.energy = clamp(state.flight.energy - drain, 0, 100);

	// Auto-shutdown ECM once energy is effectively exhausted.
	if (state.flight.energy <= 0.5) {
		state.views.ecmEnabled = false;
		state.flight.ecmActiveMs = 0;
	}
}

/**
 * Apply incoming hostile fire to shields and energy.
 *
 * For this migration stage, incoming damage is probabilistic but deterministic:
 * given the same step sequence and combat roll stream, damage timing is stable.
 *
 * Returns `true` if damage depletes energy and we transitioned via DEATH2.
 */
function applyIncomingHostileDamage(state: CanonicalGameState, combatRoll: number): boolean {
	if (state.views.inStationSafeZone) {
		return false;
	}

	const hasHostiles = state.universe.localBubbleShips.some((ship) => ship.kind === "ship");
	if (!hasHostiles) {
		return false;
	}

	// Roughly 1 in 32 in-space steps apply one hostile hit.
	if ((combatRoll & 0x1f) !== 0) {
		return false;
	}

	const shieldDamage = 4 + (combatRoll & 0x07);
	const hitsAftShield = (combatRoll & 0x40) !== 0;

	if (hitsAftShield) {
		state.flight.aftShield -= shieldDamage;
		if (state.flight.aftShield < 0) {
			state.flight.energy = clamp(state.flight.energy + state.flight.aftShield, 0, 100);
			state.flight.aftShield = 0;
		}
	} else {
		state.flight.forwardShield -= shieldDamage;
		if (state.flight.forwardShield < 0) {
			state.flight.energy = clamp(state.flight.energy + state.flight.forwardShield, 0, 100);
			state.flight.forwardShield = 0;
		}
	}

	if (state.flight.energy > 0) {
		return false;
	}

	runDeath2EntryPoint(state);
	return true;
}

/**
 * Advances local-universe objects and resolves destruction/debris lifecycle.
 */
function advanceLocalShipsAndResolve(
	state: CanonicalGameState,
	stepMs: number,
	destructionRoll: number,
): void {
	const dtSeconds = stepMs / 1000;
	const survivors: LocalUniverseShipState[] = [];
	const debrisQueue: LocalUniverseShipState[] = [];

	for (const ship of state.universe.localBubbleShips) {
		ship.ageMs += stepMs;
		ship.position.x += ship.velocity.x * dtSeconds;
		ship.position.y += ship.velocity.y * dtSeconds;
		ship.position.z += ship.velocity.z * dtSeconds;

		if (ship.kind === "ship" && ship.hullStrength <= 0) {
			const combinedCount = survivors.length + debrisQueue.length;
			if (combinedCount < MAX_LOCAL_BUBBLE_OBJECTS) {
				const cloudSeed = (destructionRoll + ship.slotId) & 0xff;
				const debrisCloud = createDebrisCloud(state, ship, cloudSeed);
				for (const fragment of debrisCloud) {
					if (survivors.length + debrisQueue.length >= MAX_LOCAL_BUBBLE_OBJECTS) {
						break;
					}
					debrisQueue.push(fragment);
				}
			}
			continue;
		}

		if (ship.kind === "debris" && ship.ttlMs !== null && ship.ageMs >= ship.ttlMs) {
			continue;
		}

		// Cull objects that have clearly left the local bubble bounds.
		if (ship.position.z <= -3000 || ship.position.z >= 20_000) {
			continue;
		}

		survivors.push(ship);
	}

	state.universe.localBubbleShips = [...survivors, ...debrisQueue].slice(
		0,
		MAX_LOCAL_BUBBLE_OBJECTS,
	);
}

/**
 * Minimal MLOOP equivalent:
 * - cool down laser temperature
 * - cool down laser pulse counter
 * - when docked, trickle-recharge shields and energy
 */
function stepMloopTail(state: CanonicalGameState, stepMs: number): void {
	state.flow.currentEntryPoint = "MLOOP";

	if (state.flow.laserTemperature > 0) {
		state.flow.laserTemperature = Math.max(0, state.flow.laserTemperature - 1);
	}

	if (state.flow.laserPulseCounter > 0) {
		state.flow.laserPulseCounter = Math.max(0, state.flow.laserPulseCounter - 2);
	}

	if (state.views.isDocked) {
		const rechargeScale = stepMs / 16.67;
		state.flight.energy = clamp(state.flight.energy + 0.08 * rechargeScale, 0, 100);
		state.flight.forwardShield = clamp(state.flight.forwardShield + 0.12 * rechargeScale, 0, 100);
		state.flight.aftShield = clamp(state.flight.aftShield + 0.12 * rechargeScale, 0, 100);
	}
}

/**
 * Minimal TT100 equivalent prelude:
 * - decrement in-flight message delay counter
 * - decrement 8-bit main loop counter
 */
function stepTt100Prelude(state: CanonicalGameState): void {
	state.flow.currentEntryPoint = "TT100";
	state.flow.messageDelayCounter = clamp(state.flow.messageDelayCounter - 1, 0, 255);
	state.flow.mainLoopCounter = wrapUint8(state.flow.mainLoopCounter - 1);
}

/**
 * Normalize one optional control axis into [-1, 1].
 *
 * The browser input layer already emits -1/0/1, but we clamp here too so tests
 * and future input sources cannot accidentally push unstable values.
 */
function normalizeControlAxis(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0;
	}

	return clamp(value, -1, 1);
}

/**
 * Apply manual flight controls and deterministic jitter to roll/pitch/speed.
 *
 * The core idea here is:
 * - control input should have first-order influence over motion
 * - RNG jitter remains present as low-amplitude "background noise"
 * - behavior remains deterministic for equal inputs and seeds
 */
function applyFlightControlDynamics(
	state: CanonicalGameState,
	stepMs: number,
	headingJitter: number,
	speedJitter: number,
	controlRollAxis: number,
	controlPitchAxis: number,
	controlThrottleAxis: number,
): void {
	const stepScale = stepMs / 16.67;

	// Roll and pitch controls drive angular rates directly. Jitter is intentionally
	// small so input remains dominant while preserving legacy-style variation.
	state.flight.rollRate = clamp(
		state.flight.rollRate + controlRollAxis * 0.22 * stepScale + headingJitter * 0.05,
		-3,
		3,
	);
	state.flight.pitchRate = clamp(
		state.flight.pitchRate + controlPitchAxis * 0.2 * stepScale + speedJitter * 0.04,
		-2,
		2,
	);

	// Heading change uses integrated roll rate for smoother steering response.
	state.flight.headingDeg = normalizeHeading(
		state.flight.headingDeg + state.flight.rollRate * 0.72 + headingJitter * 0.12,
	);

	// Throttle input pushes speed up/down each step.
	// Non-warp flight remains in a conservative range; warp is handled separately.
	const maxCruiseSpeed = state.flight.warpEngaged ? 120 : 40;
	state.flight.speed = clamp(
		state.flight.speed + controlThrottleAxis * 0.45 * stepScale + speedJitter * 0.05,
		0,
		maxCruiseSpeed,
	);
}

/**
 * Handle warp toggle and update warp progression.
 *
 * Warp is intentionally modeled as:
 * - explicit toggle
 * - short "charge-up" phase
 * - speed boost while engaged
 * - discrete fuel drain in tenths to keep commander fuel math integer-stable
 */
function applyWarpState(
	state: CanonicalGameState,
	stepMs: number,
	requestWarpToggle: boolean,
): void {
	if (requestWarpToggle) {
		state.flight.warpEngaged = !state.flight.warpEngaged;

		// Reset ramp/accumulator whenever warp state changes to keep transitions
		// deterministic and easy to reason about.
		state.flight.warpChargeMs = 0;
		state.flight.warpFuelAccumulatorMs = 0;
	}

	if (!state.flight.warpEngaged) {
		return;
	}

	state.flight.warpChargeMs += stepMs;

	// Ramp up warp acceleration over ~2 seconds for a visible transition.
	const warpRamp = clamp(state.flight.warpChargeMs / 2000, 0, 1);
	const stepScale = stepMs / 16.67;
	const warpAcceleration = 0.8 + warpRamp * 0.9;
	state.flight.speed = clamp(state.flight.speed + warpAcceleration * stepScale, 0, 120);

	// Drain one fuel tenth every 300ms while warp is active.
	state.flight.warpFuelAccumulatorMs += stepMs;
	while (state.flight.warpFuelAccumulatorMs >= 300) {
		state.flight.warpFuelAccumulatorMs -= 300;
		state.commander.fuelTenths = Math.max(0, state.commander.fuelTenths - 1);
	}

	// Auto-drop warp when fuel is exhausted.
	if (state.commander.fuelTenths <= 0) {
		state.flight.warpEngaged = false;
		state.flight.warpChargeMs = 0;
		state.flight.warpFuelAccumulatorMs = 0;
		state.flight.speed = clamp(state.flight.speed, 0, 40);
	}
}

/**
 * Handle one-step escape pod transition.
 *
 * We model this as an emergency reset to docked state. This gives us a concrete
 * deterministic state transition now, while richer post-eject flows can be
 * layered in later migration phases.
 */
function applyEscapePodTransition(state: CanonicalGameState, requestEscapePod: boolean): boolean {
	if (!requestEscapePod || state.views.isDocked) {
		return false;
	}

	// Reset ship/universe workspaces using the startup/reset parity path.
	runResetEntryPoint(state);

	// Escape pod sequence ends active flight immediately.
	state.flight.speed = 0;
	state.flight.warpEngaged = false;
	state.flight.warpChargeMs = 0;
	state.flight.warpFuelAccumulatorMs = 0;

	return true;
}

/**
 * Advances canonical state by one fixed simulation step.
 *
 * This does not attempt full gameplay parity yet; it establishes stable,
 * deterministic domain transitions using the canonical state structure.
 */
export function stepCanonicalGameState(
	state: CanonicalGameState,
	input: CanonicalStateStepInput,
): void {
	const { stepMs, headingJitter, speedJitter, spawnRoll } = input;
	const controlRollAxis = normalizeControlAxis(input.controlRollAxis);
	const controlPitchAxis = normalizeControlAxis(input.controlPitchAxis);
	const controlThrottleAxis = normalizeControlAxis(input.controlThrottleAxis);
	const requestWarpToggle = input.requestWarpToggle === true;
	const requestEscapePod = input.requestEscapePod === true;
	const requestFireLaser = input.requestFireLaser === true;
	const requestMissileArmToggle = input.requestMissileArmToggle === true;
	const requestMissileFire = input.requestMissileFire === true;
	const requestEcmToggle = input.requestEcmToggle === true;
	const requestDockAttempt = input.requestDockAttempt === true;
	const requestLaunch = input.requestLaunch === true;

	// Advance global timers that later subsystems depend on.
	state.timers.frameTicks += 1;
	state.timers.missionTicks += 1;
	state.timers.spawnCountdownMs -= stepMs;
	state.timers.hudFlashMs += stepMs;

	// Launch transition has priority while docked.
	if (applyLaunchTransition(state, requestLaunch)) {
		if (state.timers.hudFlashMs >= 60_000) {
			state.timers.hudFlashMs -= 60_000;
		}
		return;
	}

	// Escape pod transition takes precedence and immediately exits this step.
	if (applyEscapePodTransition(state, requestEscapePod)) {
		if (state.timers.hudFlashMs >= 60_000) {
			state.timers.hudFlashMs -= 60_000;
		}
		return;
	}

	// Docked flow currently only runs the minimal MLOOP equivalent.
	if (state.views.isDocked) {
		state.flow.phase = "docked";
		state.views.inStationSafeZone = true;
		state.flight.stationDistance = 0;
		state.flow.mainLoopCounter = wrapUint8(state.flow.mainLoopCounter - 1);
		stepMloopTail(state, stepMs);

		if (state.timers.hudFlashMs >= 60_000) {
			state.timers.hudFlashMs -= 60_000;
		}
		return;
	}

	state.flow.phase = "in-space";
	stepTt100Prelude(state);

	// Apply manual controls first, then warp transitions.
	applyFlightControlDynamics(
		state,
		stepMs,
		headingJitter,
		speedJitter,
		controlRollAxis,
		controlPitchAxis,
		controlThrottleAxis,
	);
	applyWarpState(state, stepMs, requestWarpToggle);
	updateStationProximity(state, stepMs);

	// Docking transition exits in-space flow immediately on success.
	if (applyDockAttempt(state, requestDockAttempt)) {
		if (state.timers.hudFlashMs >= 60_000) {
			state.timers.hudFlashMs -= 60_000;
		}
		return;
	}

	applyEcmState(state, stepMs, requestEcmToggle);
	applyLaserCombat(state, requestFireLaser, spawnRoll & 0xff);
	applyMissileCombat(state, stepMs, requestMissileArmToggle, requestMissileFire, spawnRoll & 0xff);

	// Very early "energy usage" placeholder so timers/flight state interact.
	const pseudoDrain = state.flight.speed > 30 ? 0.03 : 0.01;
	state.flight.energy = clamp(state.flight.energy - pseudoDrain * (stepMs / 16.67), 0, 100);

	// Spawn placeholder ships at deterministic intervals.
	const activeShipCount = state.universe.localBubbleShips.filter(
		(ship) => ship.kind === "ship",
	).length;
	if (!state.views.inStationSafeZone && state.timers.spawnCountdownMs <= 0 && activeShipCount < 6) {
		spawnPlaceholderShip(state, spawnRoll & 0xff);
		state.timers.spawnCountdownMs = 850 + (spawnRoll & 0x7f) * 12;
	}

	// Apply incoming hostile damage before resolving object destruction/culling.
	if (applyIncomingHostileDamage(state, spawnRoll & 0xff)) {
		if (state.timers.hudFlashMs >= 60_000) {
			state.timers.hudFlashMs -= 60_000;
		}
		return;
	}

	advanceLocalShipsAndResolve(state, stepMs, spawnRoll & 0xff);
	stepMloopTail(state, stepMs);

	// Keep HUD timer bounded to avoid unbounded floating-point growth.
	if (state.timers.hudFlashMs >= 60_000) {
		state.timers.hudFlashMs -= 60_000;
	}
}
