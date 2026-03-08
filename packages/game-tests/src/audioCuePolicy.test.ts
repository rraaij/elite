import { describe, expect, it } from "vitest";
import {
	deriveAudioCueEdgeState,
	detectAudioCuesFromEdgeStates,
} from "../../game-audio/src/index.js";

interface AudioCueSnapshotSource {
	gameState: {
		views: {
			isDocked: boolean;
			ecmEnabled: boolean;
		};
		flight: {
			energy: number;
			forwardShield: number;
			aftShield: number;
			missileArmed: boolean;
			missileTargetSlotId: number | null;
			missileLockTimerMs: number;
		};
		flow: {
			laserPulseCounter: number;
			laserTemperature: number;
		};
		universe: {
			localBubbleShips: Array<{ kind: "ship" | "debris" }>;
		};
		commander: {
			trumbleCount: number;
			trumbleVisible: boolean;
		};
	};
}

interface AudioCueEdgeState {
	laserPulseCounter: number;
	missileLockReady: boolean;
	ecmEnabled: boolean;
	isDocked: boolean;
	warningActive: boolean;
	activeHostileShipCount: number;
	trumbleCount: number;
}

function createCueSnapshotSource(): AudioCueSnapshotSource {
	return {
		gameState: {
			views: {
				isDocked: false,
				ecmEnabled: false,
			},
			flight: {
				energy: 80,
				forwardShield: 90,
				aftShield: 90,
				missileArmed: false,
				missileTargetSlotId: null,
				missileLockTimerMs: 0,
			},
			flow: {
				laserPulseCounter: 0,
				laserTemperature: 20,
			},
			universe: {
				localBubbleShips: [],
			},
			commander: {
				trumbleCount: 0,
				trumbleVisible: false,
			},
		},
	};
}

function emptyEdgeState(): AudioCueEdgeState {
	return {
		laserPulseCounter: 0,
		missileLockReady: false,
		ecmEnabled: false,
		isDocked: false,
		warningActive: false,
		activeHostileShipCount: 0,
		trumbleCount: 0,
	};
}

describe("audio cue policy", () => {
	it("derives warning and lock state from simulation-like snapshot data", () => {
		const snapshot = createCueSnapshotSource();
		snapshot.gameState.flight.energy = 12;
		snapshot.gameState.flow.laserTemperature = 200;
		snapshot.gameState.flight.missileArmed = true;
		snapshot.gameState.flight.missileTargetSlotId = 3;
		snapshot.gameState.flight.missileLockTimerMs = 460;
		snapshot.gameState.universe.localBubbleShips = [{ kind: "ship" }, { kind: "debris" }];

		const edge = deriveAudioCueEdgeState(snapshot);
		expect(edge.warningActive).toBe(true);
		expect(edge.missileLockReady).toBe(true);
		expect(edge.activeHostileShipCount).toBe(1);
	});

	it("emits gameplay-critical cues on rising edges", () => {
		const previous = emptyEdgeState();
		const current: AudioCueEdgeState = {
			laserPulseCounter: 6,
			missileLockReady: true,
			ecmEnabled: true,
			isDocked: true,
			warningActive: true,
			activeHostileShipCount: 0,
			trumbleCount: 0,
		};

		const diff = detectAudioCuesFromEdgeStates(previous, current, 1000, -Infinity);
		expect(diff.cues).toEqual(["laser", "missileLock", "ecm", "warning", "dock"]);
	});

	it("emits launch cue when leaving dock", () => {
		const previous: AudioCueEdgeState = {
			...emptyEdgeState(),
			isDocked: true,
		};
		const current: AudioCueEdgeState = {
			...emptyEdgeState(),
			isDocked: false,
			trumbleCount: 0,
		};

		const diff = detectAudioCuesFromEdgeStates(previous, current, 1000, -Infinity);
		expect(diff.cues).toEqual(["launch"]);
	});

	it("throttles explosion cue with cooldown", () => {
		const previous: AudioCueEdgeState = {
			...emptyEdgeState(),
			activeHostileShipCount: 3,
		};
		const current: AudioCueEdgeState = {
			...emptyEdgeState(),
			activeHostileShipCount: 2,
			trumbleCount: 0,
		};

		const first = detectAudioCuesFromEdgeStates(previous, current, 2000, -Infinity);
		expect(first.cues).toContain("explosion");
		expect(first.nextLastExplosionCueMs).toBe(2000);

		const suppressed = detectAudioCuesFromEdgeStates(previous, current, 2100, 2000);
		expect(suppressed.cues).not.toContain("explosion");
		expect(suppressed.nextLastExplosionCueMs).toBe(2000);
	});

	it("emits trumble cue when visible trumble population grows", () => {
		const previous: AudioCueEdgeState = {
			...emptyEdgeState(),
			trumbleCount: 2,
		};
		const current: AudioCueEdgeState = {
			...emptyEdgeState(),
			trumbleCount: 3,
		};

		const diff = detectAudioCuesFromEdgeStates(previous, current, 3000, -Infinity);
		expect(diff.cues).toContain("trumble");
	});
});
