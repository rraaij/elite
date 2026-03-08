export type AudioCueId =
	| "laser"
	| "missileLock"
	| "explosion"
	| "ecm"
	| "warning"
	| "dock"
	| "launch";

export type MusicTrackId = "title" | "docking";

export interface AudioCueSnapshotSource {
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
			localBubbleShips: Array<{
				kind: "ship" | "debris";
			}>;
		};
	};
}

export interface AudioCueEdgeState {
	laserPulseCounter: number;
	missileLockReady: boolean;
	ecmEnabled: boolean;
	isDocked: boolean;
	warningActive: boolean;
	activeHostileShipCount: number;
}

export interface AudioCueDiffResult {
	cues: AudioCueId[];
	nextLastExplosionCueMs: number;
}

export interface LegacyMusicFrame {
	voiceBytes: [number, number, number];
	gateByte: number;
	mixByte: number;
}

export interface ParsedLegacyMusicTrack {
	trackId: MusicTrackId;
	frameOffset: number;
	tickMs: number;
	frames: LegacyMusicFrame[];
}

export interface GameMusicData {
	titleBytes: readonly number[];
	dockingBytes: readonly number[];
}

export interface MusicTrackSnapshotSource {
	gameState: {
		views: {
			isDocked: boolean;
		};
		flow: {
			phase: "boot" | "title" | "docked" | "in-space";
		};
	};
}

export interface GameAudioEngine {
	unlock(): Promise<void>;
	setMasterVolume(volume: number): void;
	setSfxVolume(volume: number): void;
	setMusicVolume(volume: number): void;
	setMuted(muted: boolean): void;
	playSfx(cueId: AudioCueId): void;
	loadMusicData(data: GameMusicData): void;
	playMusic(trackId: MusicTrackId): void;
	stopMusic(): void;
	stopAll(): void;
	dispose(): void;
}

export interface CreateGameAudioEngineOptions {
	initialVolume?: number;
	initialSfxVolume?: number;
	initialMusicVolume?: number;
	initialMuted?: boolean;
	audioContext?: AudioContext;
	maxConcurrentVoices?: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

interface SfxStepDefinition {
	durationMs: number;
	frequencyHz: number;
	gain: number;
	type?: OscillatorType;
}

interface SfxCueDefinition {
	priority: number;
	maxSimultaneous: number;
	steps: readonly SfxStepDefinition[];
}

const DEFAULT_SFX_TYPE: OscillatorType = "square";
const EXPLOSION_COOLDOWN_MS = 140;
const LEGACY_MUSIC_FRAME_BYTES = 5;
const THEME_HEADER_BYTES = 16;
const LEGACY_MUSIC_TICK_MS_MIN = 50;
const LEGACY_MUSIC_TICK_MS_MAX = 220;

export function resolveWarningActive(snapshot: AudioCueSnapshotSource): boolean {
	const { flight, views, flow } = snapshot.gameState;
	return (
		flight.energy < 22 ||
		flight.forwardShield < 22 ||
		flight.aftShield < 22 ||
		flow.laserTemperature >= 176 ||
		flight.missileArmed ||
		views.ecmEnabled
	);
}

export function deriveAudioCueEdgeState(snapshot: AudioCueSnapshotSource): AudioCueEdgeState {
	const missileLockReady =
		snapshot.gameState.flight.missileArmed &&
		snapshot.gameState.flight.missileTargetSlotId !== null &&
		snapshot.gameState.flight.missileLockTimerMs >= 450;

	return {
		laserPulseCounter: snapshot.gameState.flow.laserPulseCounter,
		missileLockReady,
		ecmEnabled: snapshot.gameState.views.ecmEnabled,
		isDocked: snapshot.gameState.views.isDocked,
		warningActive: resolveWarningActive(snapshot),
		activeHostileShipCount: snapshot.gameState.universe.localBubbleShips.filter(
			(ship) => ship.kind === "ship",
		).length,
	};
}

export function detectAudioCuesFromEdgeStates(
	previous: AudioCueEdgeState,
	current: AudioCueEdgeState,
	nowMs: number,
	lastExplosionCueMs: number,
): AudioCueDiffResult {
	const cues: AudioCueId[] = [];

	if (current.laserPulseCounter > previous.laserPulseCounter && current.laserPulseCounter > 0) {
		cues.push("laser");
	}
	if (!previous.missileLockReady && current.missileLockReady) {
		cues.push("missileLock");
	}
	if (!previous.ecmEnabled && current.ecmEnabled) {
		cues.push("ecm");
	}
	if (!previous.warningActive && current.warningActive) {
		cues.push("warning");
	}
	if (!previous.isDocked && current.isDocked) {
		cues.push("dock");
	}
	if (previous.isDocked && !current.isDocked) {
		cues.push("launch");
	}

	let nextLastExplosionCueMs = lastExplosionCueMs;
	if (
		current.activeHostileShipCount < previous.activeHostileShipCount &&
		nowMs - lastExplosionCueMs > EXPLOSION_COOLDOWN_MS
	) {
		cues.push("explosion");
		nextLastExplosionCueMs = nowMs;
	}

	return {
		cues,
		nextLastExplosionCueMs,
	};
}

/**
 * Parse one legacy music blob into a frame stream.
 *
 * Current heuristic:
 * - title (`theme`) uses a 16-byte metadata header before 5-byte frames.
 * - docking (`comudat`) starts frames at byte 0.
 */
export function parseLegacyMusicTrack(
	trackId: MusicTrackId,
	bytes: readonly number[],
): ParsedLegacyMusicTrack {
	const frameOffset = trackId === "title" ? THEME_HEADER_BYTES : 0;
	const available = Math.max(0, bytes.length - frameOffset);
	const frameCount = Math.floor(available / LEGACY_MUSIC_FRAME_BYTES);
	const tempoSeed = bytes[4] ?? 32;
	const tickMs = Math.max(
		LEGACY_MUSIC_TICK_MS_MIN,
		Math.min(LEGACY_MUSIC_TICK_MS_MAX, tempoSeed * 4),
	);

	const frames: LegacyMusicFrame[] = [];
	for (let index = 0; index < frameCount; index += 1) {
		const frameStart = frameOffset + index * LEGACY_MUSIC_FRAME_BYTES;
		const b0 = bytes[frameStart] ?? 0;
		const b1 = bytes[frameStart + 1] ?? 0;
		const b2 = bytes[frameStart + 2] ?? 0;
		const b3 = bytes[frameStart + 3] ?? 0;
		const b4 = bytes[frameStart + 4] ?? 0;
		frames.push({
			voiceBytes: [b0, b1, b2],
			gateByte: b3,
			mixByte: b4,
		});
	}

	return {
		trackId,
		frameOffset,
		tickMs,
		frames,
	};
}

function voiceByteToFrequencyHz(value: number): number {
	const midi = 24 + (value % 72);
	return 440 * 2 ** ((midi - 69) / 12);
}

export function resolveMusicTrackForSnapshot(
	snapshot: MusicTrackSnapshotSource,
): MusicTrackId | null {
	if (snapshot.gameState.flow.phase === "boot" || snapshot.gameState.flow.phase === "title") {
		return "title";
	}
	if (snapshot.gameState.views.isDocked || snapshot.gameState.flow.phase === "docked") {
		return "docking";
	}
	return null;
}

const SFX_TABLE: Record<AudioCueId, SfxCueDefinition> = {
	laser: {
		priority: 6,
		maxSimultaneous: 2,
		steps: [
			{ durationMs: 24, frequencyHz: 1500, gain: 0.16, type: "sawtooth" },
			{ durationMs: 38, frequencyHz: 1120, gain: 0.11, type: "sawtooth" },
			{ durationMs: 44, frequencyHz: 860, gain: 0.06, type: "triangle" },
		],
	},
	missileLock: {
		priority: 8,
		maxSimultaneous: 1,
		steps: [
			{ durationMs: 52, frequencyHz: 780, gain: 0.1, type: "square" },
			{ durationMs: 52, frequencyHz: 980, gain: 0.12, type: "square" },
			{ durationMs: 52, frequencyHz: 1220, gain: 0.12, type: "square" },
		],
	},
	explosion: {
		priority: 9,
		maxSimultaneous: 2,
		steps: [
			{ durationMs: 60, frequencyHz: 180, gain: 0.18, type: "sawtooth" },
			{ durationMs: 90, frequencyHz: 120, gain: 0.13, type: "triangle" },
			{ durationMs: 120, frequencyHz: 82, gain: 0.06, type: "triangle" },
		],
	},
	ecm: {
		priority: 10,
		maxSimultaneous: 1,
		steps: [
			{ durationMs: 90, frequencyHz: 620, gain: 0.13, type: "square" },
			{ durationMs: 90, frequencyHz: 940, gain: 0.12, type: "square" },
			{ durationMs: 90, frequencyHz: 700, gain: 0.11, type: "square" },
		],
	},
	warning: {
		priority: 7,
		maxSimultaneous: 1,
		steps: [
			{ durationMs: 80, frequencyHz: 510, gain: 0.1, type: "square" },
			{ durationMs: 60, frequencyHz: 420, gain: 0.08, type: "square" },
		],
	},
	dock: {
		priority: 5,
		maxSimultaneous: 1,
		steps: [
			{ durationMs: 75, frequencyHz: 420, gain: 0.08, type: "triangle" },
			{ durationMs: 75, frequencyHz: 530, gain: 0.08, type: "triangle" },
		],
	},
	launch: {
		priority: 5,
		maxSimultaneous: 1,
		steps: [
			{ durationMs: 90, frequencyHz: 460, gain: 0.08, type: "triangle" },
			{ durationMs: 120, frequencyHz: 360, gain: 0.07, type: "triangle" },
		],
	},
};

interface ActiveCuePlayback {
	id: number;
	cueId: AudioCueId;
	priority: number;
	oscillator: OscillatorNode;
	gainNode: GainNode;
	startedAt: number;
}

interface MusicVoiceRuntime {
	oscillator: OscillatorNode;
	gainNode: GainNode;
}

export function createGameAudioEngine(options: CreateGameAudioEngineOptions = {}): GameAudioEngine {
	let disposed = false;
	let masterVolume = clamp01(options.initialVolume ?? 1);
	let sfxVolume = clamp01(options.initialSfxVolume ?? 1);
	let musicVolume = clamp01(options.initialMusicVolume ?? 0.65);
	let muted = options.initialMuted ?? false;
	const maxConcurrentVoices = Math.max(1, Math.floor(options.maxConcurrentVoices ?? 4));
	const audioContext =
		options.audioContext ??
		(typeof window !== "undefined" && "AudioContext" in window ? new AudioContext() : null);
	const mixerGainNode = audioContext?.createGain() ?? null;
	if (mixerGainNode && audioContext) {
		mixerGainNode.gain.value = muted ? 0 : masterVolume;
		mixerGainNode.connect(audioContext.destination);
	}
	const musicBusNode = audioContext?.createGain() ?? null;
	if (musicBusNode && mixerGainNode) {
		musicBusNode.gain.value = musicVolume * 0.3;
		musicBusNode.connect(mixerGainNode);
	}

	let nextPlaybackId = 1;
	const activeVoices: ActiveCuePlayback[] = [];
	let loadedMusicTracks: Record<MusicTrackId, ParsedLegacyMusicTrack> | null = null;
	let activeMusicTrackId: MusicTrackId | null = null;
	let activeMusicFrameIndex = 0;
	let musicTimer: ReturnType<typeof setInterval> | null = null;
	const musicVoices: MusicVoiceRuntime[] = [];

	function stopVoice(playback: ActiveCuePlayback): void {
		playback.oscillator.onended = null;
		playback.oscillator.stop();
		playback.oscillator.disconnect();
		playback.gainNode.disconnect();
		const index = activeVoices.findIndex((voice) => voice.id === playback.id);
		if (index >= 0) {
			activeVoices.splice(index, 1);
		}
	}

	function stopAllVoices(): void {
		while (activeVoices.length > 0) {
			const playback = activeVoices[0];
			if (!playback) {
				break;
			}
			stopVoice(playback);
		}
	}

	function updateMasterGain(): void {
		if (mixerGainNode && audioContext) {
			mixerGainNode.gain.setValueAtTime(muted ? 0 : masterVolume, audioContext.currentTime);
		}
	}

	function updateMusicBusGain(): void {
		if (musicBusNode && audioContext) {
			musicBusNode.gain.setValueAtTime(musicVolume * 0.3, audioContext.currentTime);
		}
	}

	function stopMusicPlayback(): void {
		if (musicTimer) {
			clearInterval(musicTimer);
			musicTimer = null;
		}
		activeMusicTrackId = null;
		activeMusicFrameIndex = 0;

		for (const voice of musicVoices) {
			voice.gainNode.gain.setValueAtTime(0, audioContext?.currentTime ?? 0);
		}
	}

	function ensureMusicVoices(): void {
		if (!audioContext || !musicBusNode || musicVoices.length > 0) {
			return;
		}

		const voiceWaveforms: OscillatorType[] = ["triangle", "square", "sawtooth"];
		for (const waveform of voiceWaveforms) {
			const oscillator = audioContext.createOscillator();
			const gainNode = audioContext.createGain();
			oscillator.type = waveform;
			oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
			gainNode.gain.setValueAtTime(0, audioContext.currentTime);
			oscillator.connect(gainNode);
			gainNode.connect(musicBusNode);
			oscillator.start();
			musicVoices.push({ oscillator, gainNode });
		}
	}

	function renderMusicFrame(track: ParsedLegacyMusicTrack, frameIndex: number): void {
		if (!audioContext || musicVoices.length === 0 || track.frames.length === 0) {
			return;
		}

		const frame = track.frames[frameIndex % track.frames.length];
		if (!frame) {
			return;
		}

		const gate = clamp01(frame.gateByte / 255);
		const mix = clamp01(frame.mixByte / 255);
		const mixScale = 0.12 + mix * 0.3;
		const now = audioContext.currentTime;

		for (let voiceIndex = 0; voiceIndex < musicVoices.length; voiceIndex += 1) {
			const voice = musicVoices[voiceIndex];
			if (!voice) {
				continue;
			}
			const byte = frame.voiceBytes[voiceIndex] ?? 0;
			if (byte <= 2) {
				voice.gainNode.gain.setTargetAtTime(0, now, 0.012);
				continue;
			}

			const hz = voiceByteToFrequencyHz(byte);
			voice.oscillator.frequency.setTargetAtTime(hz, now, 0.005);
			voice.gainNode.gain.setTargetAtTime(gate * mixScale, now, 0.01);
		}
	}

	async function unlock(): Promise<void> {
		if (!audioContext || audioContext.state !== "suspended") {
			return;
		}
		try {
			await audioContext.resume();
		} catch {
			// The app retries unlock on later user gestures.
		}
	}

	function loadMusicData(data: GameMusicData): void {
		loadedMusicTracks = {
			title: parseLegacyMusicTrack("title", data.titleBytes),
			docking: parseLegacyMusicTrack("docking", data.dockingBytes),
		};
	}

	function playMusic(trackId: MusicTrackId): void {
		if (!audioContext || !loadedMusicTracks) {
			return;
		}
		const track = loadedMusicTracks[trackId];
		if (!track || track.frames.length === 0) {
			return;
		}
		if (activeMusicTrackId === trackId && musicTimer) {
			return;
		}

		ensureMusicVoices();
		stopMusicPlayback();
		activeMusicTrackId = trackId;
		activeMusicFrameIndex = 0;
		renderMusicFrame(track, activeMusicFrameIndex);
		musicTimer = setInterval(() => {
			if (!activeMusicTrackId || !loadedMusicTracks) {
				return;
			}
			const activeTrack = loadedMusicTracks[activeMusicTrackId];
			if (!activeTrack || activeTrack.frames.length === 0) {
				return;
			}
			activeMusicFrameIndex = (activeMusicFrameIndex + 1) % activeTrack.frames.length;
			renderMusicFrame(activeTrack, activeMusicFrameIndex);
		}, track.tickMs);
	}

	function playCue(cueId: AudioCueId): void {
		if (!audioContext || !mixerGainNode) {
			return;
		}

		const cue = SFX_TABLE[cueId];
		if (!cue) {
			return;
		}

		const concurrentForCue = activeVoices.filter((voice) => voice.cueId === cueId).length;
		if (concurrentForCue >= cue.maxSimultaneous) {
			return;
		}

		if (activeVoices.length >= maxConcurrentVoices) {
			const weakestVoice = [...activeVoices].sort((left, right) => {
				if (left.priority !== right.priority) {
					return left.priority - right.priority;
				}
				return left.startedAt - right.startedAt;
			})[0];

			if (!weakestVoice || weakestVoice.priority > cue.priority) {
				return;
			}
			stopVoice(weakestVoice);
		}

		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();
		oscillator.connect(gainNode);
		gainNode.connect(mixerGainNode);

		const startTime = audioContext.currentTime + 0.001;
		let cursorTime = startTime;
		gainNode.gain.setValueAtTime(0, startTime);

		for (const step of cue.steps) {
			const nextTime = cursorTime + step.durationMs / 1000;
			oscillator.type = step.type ?? DEFAULT_SFX_TYPE;
			oscillator.frequency.setValueAtTime(step.frequencyHz, cursorTime);
			gainNode.gain.linearRampToValueAtTime(clamp01(step.gain) * sfxVolume, cursorTime + 0.005);
			gainNode.gain.setValueAtTime(clamp01(step.gain) * sfxVolume, nextTime);
			cursorTime = nextTime;
		}

		gainNode.gain.linearRampToValueAtTime(0, cursorTime + 0.018);
		oscillator.start(startTime);
		oscillator.stop(cursorTime + 0.02);

		const playback: ActiveCuePlayback = {
			id: nextPlaybackId,
			cueId,
			priority: cue.priority,
			oscillator,
			gainNode,
			startedAt: startTime,
		};
		nextPlaybackId += 1;
		activeVoices.push(playback);
		oscillator.onended = () => {
			const index = activeVoices.findIndex((voice) => voice.id === playback.id);
			if (index >= 0) {
				activeVoices.splice(index, 1);
			}
			oscillator.disconnect();
			gainNode.disconnect();
		};
	}

	return {
		unlock,
		setMasterVolume(volume: number): void {
			masterVolume = clamp01(volume);
			updateMasterGain();
		},
		setSfxVolume(volume: number): void {
			sfxVolume = clamp01(volume);
		},
		setMusicVolume(volume: number): void {
			musicVolume = clamp01(volume);
			updateMusicBusGain();
		},
		setMuted(nextMuted: boolean): void {
			muted = nextMuted;
			updateMasterGain();
		},
		playSfx(cueId: AudioCueId): void {
			if (disposed || muted || masterVolume <= 0 || sfxVolume <= 0) {
				return;
			}
			playCue(cueId);
		},
		loadMusicData(data: GameMusicData): void {
			loadMusicData(data);
		},
		playMusic(trackId: MusicTrackId): void {
			if (disposed || muted || masterVolume <= 0 || musicVolume <= 0) {
				return;
			}
			playMusic(trackId);
		},
		stopMusic(): void {
			stopMusicPlayback();
		},
		stopAll(): void {
			stopAllVoices();
			stopMusicPlayback();
		},
		dispose(): void {
			stopAllVoices();
			stopMusicPlayback();
			for (const voice of musicVoices) {
				voice.oscillator.stop();
				voice.oscillator.disconnect();
				voice.gainNode.disconnect();
			}
			musicVoices.length = 0;
			musicBusNode?.disconnect();
			mixerGainNode?.disconnect();
			disposed = true;
		},
	};
}
