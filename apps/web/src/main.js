import {
	createGameAudioEngine,
	deriveAudioCueEdgeState,
	detectAudioCuesFromEdgeStates,
	resolveMusicTrackForSnapshot,
} from "../../../packages/game-audio/src/index";
import {
	createEmptySimulation,
	createFixedStepRunner,
	deserializeSaveState,
	resolveTimingProfile,
	serializeSaveState,
} from "../../../packages/game-core/src/index";
import { DEFAULT_SCENARIOS, getScenarioById } from "../../../packages/game-data/src/index";
import { createKeyboardInput } from "../../../packages/game-input/src/index";
import { createCanvasRenderer } from "../../../packages/game-renderer/src/index";
import "./styles.css";
const SAVE_SLOT_PRIMARY_KEY = "elite.migration.save-slot-primary";
const SAVE_SLOT_BACKUP_KEY = "elite.migration.save-slot-backup";
const AUDIO_SETTINGS_KEY = "elite.migration.audio-settings-v1";
const FIRST_RUN_GUIDE_KEY = "elite.migration.first-run-guide-v1";
const AUTOSAVE_INTERVAL_MS = 15_000;
const DEFAULT_VARIANT_ID = import.meta.env.VITE_DEFAULT_VARIANT_ID || "gma85-ntsc";
const DATA_BASE_PATH = import.meta.env.VITE_DATA_BASE_PATH || "/game-data";
const ENABLE_SERVICE_WORKER = import.meta.env.PROD && import.meta.env.VITE_DISABLE_SW !== "1";
/**
 * Converts runtime JSON blueprints into renderer-ready minimal blueprints.
 *
 * The map is keyed by canonical ship id so simulation ship slots can resolve
 * geometry by `blueprintId` without repeated array scans.
 */
function buildWireframeBlueprintMap(dataPack) {
	const map = new Map();
	for (const blueprint of dataPack.ships.blueprints) {
		map.set(blueprint.shipId, {
			shipId: blueprint.shipId,
			vertices: blueprint.vertices.map((vertex) => ({
				x: vertex.x,
				y: vertex.y,
				z: vertex.z,
			})),
			edges: blueprint.edges.map((edge) => ({
				vertex1: edge.vertex1,
				vertex2: edge.vertex2,
			})),
		});
	}
	return map;
}
/**
 * Parse runtime options from query params:
 * - `scenario` selects scenario id.
 * - `variant` selects generated data-pack variant.
 * - `timing` selects `ntsc`, `pal`, or `auto` frame pacing.
 * - `seed` overrides deterministic seed.
 * - `debug=0` hides debug panel.
 */
function getRuntimeConfigFromUrl(url) {
	const fallbackScenario = DEFAULT_SCENARIOS[0];
	if (!fallbackScenario) {
		throw new Error("No default scenarios are configured.");
	}
	const scenarioIdFromQuery = url.searchParams.get("scenario") ?? "empty";
	const scenario = getScenarioById(scenarioIdFromQuery) ?? fallbackScenario;
	const variantId = url.searchParams.get("variant") ?? DEFAULT_VARIANT_ID;
	const timingFromQuery = url.searchParams.get("timing");
	const timing = timingFromQuery === "pal" || timingFromQuery === "ntsc" ? timingFromQuery : "auto";
	// Keep seed parsing explicit and resilient to malformed URLs.
	const parsedSeed = Number(url.searchParams.get("seed"));
	const seed = Number.isFinite(parsedSeed) ? parsedSeed >>> 0 : scenario.defaultSeed;
	const debug = url.searchParams.get("debug") !== "0";
	return {
		scenarioId: scenario.id,
		variantId,
		timing,
		seed,
		debug,
	};
}
/**
 * Fetches JSON with an explicit status check so data-load failures surface clearly.
 */
async function fetchJson(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to load ${url} (${response.status} ${response.statusText}).`);
	}
	return await response.json();
}
/**
 * Loads generated game-data artifacts from static files under `/game-data`.
 * We resolve unknown variants to the first available manifest entry.
 */
async function loadRuntimeData(desiredVariantId) {
	const manifest = await fetchJson(`${DATA_BASE_PATH}/manifest.json`);
	if (!manifest.variants.length) {
		throw new Error("Generated manifest has no variants.");
	}
	const match =
		manifest.variants.find((variant) => variant.variantId === desiredVariantId) ??
		manifest.variants[0];
	if (!match) {
		throw new Error("Could not resolve a variant from generated manifest.");
	}
	const dataPack = await fetchJson(`${DATA_BASE_PATH}/${match.variantId}/data-pack.json`);
	return {
		resolvedVariantId: match.variantId,
		manifest,
		dataPack,
	};
}
/**
 * Convert floating values into fixed-width debug strings for stable overlays.
 */
function fixed(value, digits = 2) {
	return value.toFixed(digits).padStart(8, " ");
}
/**
 * Map keyboard snapshot values into simulation pilot controls.
 *
 * Keeping this mapping in one function makes key-to-control behavior explicit
 * and easy to adjust as we expand the input abstraction.
 */
function mapKeyboardSnapshotToPilotControls(snapshot) {
	return {
		rollAxis: snapshot.rollAxis,
		pitchAxis: snapshot.pitchAxis,
		throttleAxis: snapshot.throttleAxis,
		warpTogglePressed: snapshot.warpTogglePressed,
		escapePodPressed: snapshot.escapePodPressed,
		fireLaserPressed: snapshot.fireLaserPressed,
		missileArmTogglePressed: snapshot.missileArmTogglePressed,
		missileFirePressed: snapshot.missileFirePressed,
		ecmTogglePressed: snapshot.ecmTogglePressed,
		dockAttemptPressed: snapshot.dockAttemptPressed,
		launchPressed: snapshot.launchPressed,
	};
}
/**
 * Resolve active timing profile for fixed-step scheduling.
 *
 * `auto` mode infers PAL/NTSC from the currently selected variant id.
 */
function resolveActiveTimingProfile(config) {
	return resolveTimingProfile(config.timing, config.variantId);
}
function clamp01(value) {
	return Math.min(1, Math.max(0, value));
}
function loadAudioSettingsFromLocalStorage() {
	const fallback = {
		masterVolume: 0.35,
		sfxVolume: 1,
		musicVolume: 0.65,
		muted: false,
	};
	const payload = window.localStorage.getItem(AUDIO_SETTINGS_KEY);
	if (!payload) {
		return fallback;
	}
	try {
		const parsed = JSON.parse(payload);
		return {
			masterVolume: clamp01(Number(parsed.masterVolume ?? fallback.masterVolume)),
			sfxVolume: clamp01(Number(parsed.sfxVolume ?? fallback.sfxVolume)),
			musicVolume: clamp01(Number(parsed.musicVolume ?? fallback.musicVolume)),
			muted: Boolean(parsed.muted ?? fallback.muted),
		};
	} catch {
		return fallback;
	}
}
function saveAudioSettingsToLocalStorage(settings) {
	window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
}
const runtimeConfig = getRuntimeConfigFromUrl(new URL(window.location.href));
const audioSettings = loadAudioSettingsFromLocalStorage();
const activeTimingProfile = resolveActiveTimingProfile(runtimeConfig);
const root = document.querySelector("#app");
if (!root) {
	throw new Error("Missing #app root element.");
}
// Build a simple panel layout so we can keep debug tools visible during migration.
const layout = document.createElement("main");
layout.className = "runtime-layout";
const canvasPanel = document.createElement("section");
canvasPanel.className = "runtime-canvas-panel";
const canvas = document.createElement("canvas");
canvas.className = "runtime-canvas";
canvasPanel.append(canvas);
const sidebar = document.createElement("aside");
sidebar.className = "runtime-sidebar";
const title = document.createElement("h1");
title.className = "runtime-title";
title.textContent = "Elite Migration Runtime";
const subtitle = document.createElement("p");
subtitle.className = "runtime-subtitle";
subtitle.textContent = "Loading generated variant data pack...";
const dataStatus = document.createElement("p");
dataStatus.className = "runtime-status";
dataStatus.textContent = "data: loading";
const variantField = document.createElement("label");
variantField.className = "runtime-field";
variantField.textContent = "Variant";
const variantSelect = document.createElement("select");
variantSelect.className = "runtime-select";
variantSelect.disabled = true;
variantField.append(variantSelect);
const timingField = document.createElement("label");
timingField.className = "runtime-field";
timingField.textContent = "Timing";
const timingSelect = document.createElement("select");
timingSelect.className = "runtime-select";
timingField.append(timingSelect);
const muteField = document.createElement("label");
muteField.className = "runtime-field";
muteField.textContent = "Audio";
const muteRow = document.createElement("div");
muteRow.className = "runtime-toggle-row";
const muteToggle = document.createElement("input");
muteToggle.className = "runtime-checkbox";
muteToggle.type = "checkbox";
muteToggle.checked = audioSettings.muted;
const muteText = document.createElement("span");
muteText.textContent = "Mute";
muteRow.append(muteToggle, muteText);
muteField.append(muteRow);
const masterVolumeField = document.createElement("label");
masterVolumeField.className = "runtime-field";
masterVolumeField.textContent = "Master Volume";
const masterVolumeRange = document.createElement("input");
masterVolumeRange.className = "runtime-range";
masterVolumeRange.type = "range";
masterVolumeRange.min = "0";
masterVolumeRange.max = "100";
masterVolumeRange.step = "1";
masterVolumeRange.value = String(Math.round(audioSettings.masterVolume * 100));
masterVolumeField.append(masterVolumeRange);
const sfxVolumeField = document.createElement("label");
sfxVolumeField.className = "runtime-field";
sfxVolumeField.textContent = "SFX Volume";
const sfxVolumeRange = document.createElement("input");
sfxVolumeRange.className = "runtime-range";
sfxVolumeRange.type = "range";
sfxVolumeRange.min = "0";
sfxVolumeRange.max = "100";
sfxVolumeRange.step = "1";
sfxVolumeRange.value = String(Math.round(audioSettings.sfxVolume * 100));
sfxVolumeField.append(sfxVolumeRange);
const musicVolumeField = document.createElement("label");
musicVolumeField.className = "runtime-field";
musicVolumeField.textContent = "Music Volume";
const musicVolumeRange = document.createElement("input");
musicVolumeRange.className = "runtime-range";
musicVolumeRange.type = "range";
musicVolumeRange.min = "0";
musicVolumeRange.max = "100";
musicVolumeRange.step = "1";
musicVolumeRange.value = String(Math.round(audioSettings.musicVolume * 100));
musicVolumeField.append(musicVolumeRange);
/**
 * Timing options are fixed and local, so we can populate them eagerly.
 */
for (const timingOption of [
	{ value: "auto", label: "Auto (by variant)" },
	{ value: "ntsc", label: "NTSC (60 Hz)" },
	{ value: "pal", label: "PAL (50 Hz)" },
]) {
	const option = document.createElement("option");
	option.value = timingOption.value;
	option.textContent = timingOption.label;
	option.selected = timingOption.value === runtimeConfig.timing;
	timingSelect.append(option);
}
const actionBar = document.createElement("div");
actionBar.className = "runtime-actions";
const saveButton = document.createElement("button");
saveButton.className = "runtime-button";
saveButton.textContent = "Save Snapshot (F6)";
const loadButton = document.createElement("button");
loadButton.className = "runtime-button";
loadButton.textContent = "Load Snapshot (F7)";
const menuButton = document.createElement("button");
menuButton.className = "runtime-button";
menuButton.textContent = "Menu (Esc)";
const pauseButton = document.createElement("button");
pauseButton.className = "runtime-button";
pauseButton.textContent = "Pause";
actionBar.append(saveButton, loadButton, menuButton, pauseButton);
const debugPanel = document.createElement("pre");
debugPanel.className = "runtime-debug";
debugPanel.hidden = !runtimeConfig.debug;
const overlay = document.createElement("section");
overlay.className = "runtime-overlay";
overlay.hidden = true;
const overlayPanel = document.createElement("div");
overlayPanel.className = "runtime-overlay-panel";
const overlayTitle = document.createElement("h2");
overlayTitle.className = "runtime-overlay-title";
overlayTitle.textContent = "Runtime Menu";
const overlayTabs = document.createElement("div");
overlayTabs.className = "runtime-overlay-tabs";
const settingsTabButton = document.createElement("button");
settingsTabButton.className = "runtime-overlay-tab";
settingsTabButton.type = "button";
settingsTabButton.textContent = "Settings";
const helpTabButton = document.createElement("button");
helpTabButton.className = "runtime-overlay-tab";
helpTabButton.type = "button";
helpTabButton.textContent = "Help";
overlayTabs.append(settingsTabButton, helpTabButton);
const settingsPane = document.createElement("div");
settingsPane.className = "runtime-overlay-pane";
const helpPane = document.createElement("div");
helpPane.className = "runtime-overlay-pane";
const helpText = document.createElement("pre");
helpText.className = "runtime-help-text";
helpText.textContent = [
	"Key Help",
	"",
	"Roll: Left / Right",
	"Pitch: Up / Down",
	"Throttle: W / S",
	"Fire Laser: Space",
	"Missile Arm: M",
	"Missile Fire: N",
	"ECM: E",
	"Warp Toggle: J",
	"Dock Attempt: D",
	"Launch: L",
	"Save Snapshot: F6",
	"Load Snapshot: F7",
	"Menu: Esc",
	"Pause: P",
].join("\n");
helpPane.append(helpText);
const overlayActions = document.createElement("div");
overlayActions.className = "runtime-overlay-actions";
const resumeButton = document.createElement("button");
resumeButton.className = "runtime-button";
resumeButton.type = "button";
resumeButton.textContent = "Resume";
const closeButton = document.createElement("button");
closeButton.className = "runtime-button";
closeButton.type = "button";
closeButton.textContent = "Close";
overlayActions.append(resumeButton, closeButton);
const onboardingCard = document.createElement("section");
onboardingCard.className = "runtime-onboarding";
const onboardingTitle = document.createElement("h3");
onboardingTitle.className = "runtime-onboarding-title";
onboardingTitle.textContent = "Quick Start";
const onboardingText = document.createElement("p");
onboardingText.className = "runtime-onboarding-text";
onboardingText.textContent =
	"Use Arrow keys to steer, W/S throttle, Space to fire, M/N for missiles, E for ECM, and Esc for menu.";
const onboardingDoneButton = document.createElement("button");
onboardingDoneButton.className = "runtime-button";
onboardingDoneButton.type = "button";
onboardingDoneButton.textContent = "Got It";
onboardingCard.append(onboardingTitle, onboardingText, onboardingDoneButton);
settingsPane.append(onboardingCard);
overlayPanel.append(overlayTitle, overlayTabs, settingsPane, helpPane, overlayActions);
overlay.append(overlayPanel);
sidebar.append(title, subtitle, dataStatus, variantField, timingField, actionBar, debugPanel);
settingsPane.append(muteField, masterVolumeField, sfxVolumeField, musicVolumeField);
layout.append(canvasPanel, sidebar);
root.append(layout);
root.append(overlay);
const simulation = createEmptySimulation({
	scenarioId: runtimeConfig.scenarioId,
	seed: runtimeConfig.seed,
});
const runner = createFixedStepRunner({
	simulation,
	stepMs: activeTimingProfile.stepMs,
	maxCatchUpSteps: activeTimingProfile.maxCatchUpSteps,
});
// Mutable blueprint map hydrated from generated data-pack JSON.
// The renderer reads through this resolver every frame so it can start rendering
// wireframes immediately after data load, without recreating renderer instance.
let wireframeBlueprintMap = new Map();
const renderer = createCanvasRenderer({
	canvas,
	wireframeScene: {
		resolveBlueprintById(blueprintId) {
			return wireframeBlueprintMap.get(blueprintId) ?? null;
		},
		modelScale: 5.5,
		nearPlaneZ: 140,
	},
});
const keyboard = createKeyboardInput(window);
const audio = createGameAudioEngine({
	initialVolume: audioSettings.masterVolume,
	initialSfxVolume: audioSettings.sfxVolume,
	initialMusicVolume: audioSettings.musicVolume,
	initialMuted: audioSettings.muted,
});
let runtimeDataContext = null;
let runtimeDataError = null;
let previousAudioState = deriveAudioCueEdgeState(simulation.snapshot());
let lastExplosionCueMs = -Infinity;
let activeMusicTrackId = null;
let menuOpen = false;
let paused = false;
let pauseFrameNowMs = null;
let activeOverlayTab = "settings";
let onboardingAcknowledged = window.localStorage.getItem(FIRST_RUN_GUIDE_KEY) === "1";
let saveStatusMessage = "save: idle";
let lastAutosaveMs = 0;
let serviceWorkerStatusMessage = ENABLE_SERVICE_WORKER
	? "sw: pending registration"
	: "sw: disabled";
const perfStats = {
	frameSamples: [],
	sampleLimit: 120,
	overBudgetFrames: 0,
	lastFps: 0,
};
function applyAudioSettings(settings) {
	audio.setMasterVolume(settings.masterVolume);
	audio.setSfxVolume(settings.sfxVolume);
	audio.setMusicVolume(settings.musicVolume);
	audio.setMuted(settings.muted);
}
applyAudioSettings(audioSettings);
function updateOverlayTabUi() {
	const settingsActive = activeOverlayTab === "settings";
	settingsPane.hidden = !settingsActive;
	helpPane.hidden = settingsActive;
	settingsTabButton.dataset.active = settingsActive ? "true" : "false";
	helpTabButton.dataset.active = settingsActive ? "false" : "true";
}
function openMenu(tab = "settings") {
	activeOverlayTab = tab;
	updateOverlayTabUi();
	menuOpen = true;
	overlay.hidden = false;
}
function closeMenu() {
	menuOpen = false;
	overlay.hidden = true;
}
function setPaused(nextPaused) {
	paused = nextPaused;
	pauseButton.textContent = paused ? "Resume" : "Pause";
	if (paused) {
		pauseFrameNowMs = performance.now();
		openMenu("settings");
	} else {
		pauseFrameNowMs = null;
		closeMenu();
	}
}
updateOverlayTabUi();
onboardingCard.hidden = onboardingAcknowledged;
async function unlockAudioAfterGesture() {
	await audio.unlock();
	window.removeEventListener("pointerdown", unlockAudioAfterGesture);
	window.removeEventListener("keydown", unlockAudioAfterGesture);
	window.removeEventListener("touchstart", unlockAudioAfterGesture);
}
window.addEventListener("pointerdown", unlockAudioAfterGesture);
window.addEventListener("keydown", unlockAudioAfterGesture);
window.addEventListener("touchstart", unlockAudioAfterGesture);
muteToggle.addEventListener("change", () => {
	audioSettings.muted = muteToggle.checked;
	audio.setMuted(audioSettings.muted);
	saveAudioSettingsToLocalStorage(audioSettings);
});
masterVolumeRange.addEventListener("input", () => {
	audioSettings.masterVolume = Number(masterVolumeRange.value) / 100;
	audio.setMasterVolume(audioSettings.masterVolume);
	saveAudioSettingsToLocalStorage(audioSettings);
});
sfxVolumeRange.addEventListener("input", () => {
	audioSettings.sfxVolume = Number(sfxVolumeRange.value) / 100;
	audio.setSfxVolume(audioSettings.sfxVolume);
	saveAudioSettingsToLocalStorage(audioSettings);
});
musicVolumeRange.addEventListener("input", () => {
	audioSettings.musicVolume = Number(musicVolumeRange.value) / 100;
	audio.setMusicVolume(audioSettings.musicVolume);
	saveAudioSettingsToLocalStorage(audioSettings);
});
settingsTabButton.addEventListener("click", () => {
	activeOverlayTab = "settings";
	updateOverlayTabUi();
});
helpTabButton.addEventListener("click", () => {
	activeOverlayTab = "help";
	updateOverlayTabUi();
});
menuButton.addEventListener("click", () => {
	if (menuOpen) {
		closeMenu();
		return;
	}
	openMenu("settings");
});
pauseButton.addEventListener("click", () => {
	setPaused(!paused);
});
resumeButton.addEventListener("click", () => {
	setPaused(false);
});
closeButton.addEventListener("click", () => {
	closeMenu();
});
onboardingDoneButton.addEventListener("click", () => {
	onboardingAcknowledged = true;
	onboardingCard.hidden = true;
	window.localStorage.setItem(FIRST_RUN_GUIDE_KEY, "1");
	closeMenu();
});
if (!onboardingAcknowledged) {
	openMenu("help");
}
if (ENABLE_SERVICE_WORKER && "serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/sw.js")
			.then(() => {
				serviceWorkerStatusMessage = "sw: registered";
			})
			.catch((error) => {
				const reason = error instanceof Error ? error.message : String(error);
				serviceWorkerStatusMessage = `sw: registration failed (${reason})`;
			});
	});
}
function syncMusicTrack(snapshot) {
	const nextTrackId = resolveMusicTrackForSnapshot(snapshot);
	if (nextTrackId === activeMusicTrackId) {
		return;
	}
	if (nextTrackId === null) {
		audio.stopMusic();
		activeMusicTrackId = null;
		return;
	}
	audio.playMusic(nextTrackId);
	activeMusicTrackId = nextTrackId;
}
/**
 * Resize canvas to panel bounds and account for browser DPI.
 * This keeps rendering crisp on both desktop and high-density screens.
 */
function resizeCanvasToPanel() {
	const bounds = canvasPanel.getBoundingClientRect();
	const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
	renderer.resize(bounds.width, bounds.height, pixelRatio);
}
window.addEventListener("resize", resizeCanvasToPanel);
resizeCanvasToPanel();
function saveSnapshotToLocalStorage(isAutosave = false) {
	try {
		const payload = serializeSaveState(simulation.snapshot());
		const previousPrimary = window.localStorage.getItem(SAVE_SLOT_PRIMARY_KEY);
		if (previousPrimary) {
			window.localStorage.setItem(SAVE_SLOT_BACKUP_KEY, previousPrimary);
		}
		window.localStorage.setItem(SAVE_SLOT_PRIMARY_KEY, payload);
		saveStatusMessage = isAutosave
			? "save: autosaved primary+backup"
			: "save: wrote primary+backup";
	} catch (error) {
		saveStatusMessage = `save: failed (${error instanceof Error ? error.message : String(error)})`;
	}
}
function tryRestoreSnapshotPayload(raw) {
	try {
		const envelope = deserializeSaveState(raw);
		simulation.restore(envelope.snapshot);
		return true;
	} catch {
		return false;
	}
}
function loadSnapshotFromLocalStorage() {
	const primaryPayload = window.localStorage.getItem(SAVE_SLOT_PRIMARY_KEY);
	const backupPayload = window.localStorage.getItem(SAVE_SLOT_BACKUP_KEY);
	if (!primaryPayload && !backupPayload) {
		saveStatusMessage = "save: no snapshot in storage";
		return;
	}
	if (primaryPayload && tryRestoreSnapshotPayload(primaryPayload)) {
		saveStatusMessage = "save: restored primary snapshot";
		return;
	}
	if (backupPayload && tryRestoreSnapshotPayload(backupPayload)) {
		saveStatusMessage = "save: restored backup snapshot (primary invalid)";
		return;
	}
	saveStatusMessage = "save: both primary and backup are invalid";
}
saveButton.addEventListener("click", () => {
	saveSnapshotToLocalStorage();
});
loadButton.addEventListener("click", loadSnapshotFromLocalStorage);
/**
 * Rebuild one URL search param then reload page.
 *
 * Full reload keeps bootstrap logic simple while startup/runtime configuration
 * remains URL-driven in this migration stage.
 */
function reloadWithUrlParam(name, value) {
	const url = new URL(window.location.href);
	url.searchParams.set(name, value);
	window.location.href = url.toString();
}
variantSelect.addEventListener("change", () => {
	const selectedVariantId = variantSelect.value;
	if (!selectedVariantId) {
		return;
	}
	reloadWithUrlParam("variant", selectedVariantId);
});
timingSelect.addEventListener("change", () => {
	const selectedTiming = timingSelect.value;
	if (selectedTiming !== "auto" && selectedTiming !== "ntsc" && selectedTiming !== "pal") {
		return;
	}
	reloadWithUrlParam("timing", selectedTiming);
});
window.addEventListener("keydown", (event) => {
	if (event.code === "F6") {
		event.preventDefault();
		saveSnapshotToLocalStorage();
	}
	if (event.code === "F7") {
		event.preventDefault();
		loadSnapshotFromLocalStorage();
	}
	if (event.code === "Escape") {
		event.preventDefault();
		if (menuOpen) {
			closeMenu();
		} else {
			openMenu("settings");
		}
	}
	if (event.code === "KeyP") {
		event.preventDefault();
		setPaused(!paused);
	}
});
/**
 * Bootstraps generated data loading and wires variant-selection UI.
 * The app can continue running with fallback simulation even if loading fails.
 */
async function initializeRuntimeDataUi() {
	try {
		runtimeDataContext = await loadRuntimeData(runtimeConfig.variantId);
		runtimeDataError = null;
		// Rebuild renderer blueprint map from the newly loaded variant pack.
		wireframeBlueprintMap = buildWireframeBlueprintMap(runtimeDataContext.dataPack);
		audio.loadMusicData({
			titleBytes: runtimeDataContext.dataPack.audio.theme.bytes,
			dockingBytes: runtimeDataContext.dataPack.audio.comudat.bytes,
		});
		syncMusicTrack(simulation.snapshot());
		variantSelect.replaceChildren();
		for (const variant of runtimeDataContext.manifest.variants) {
			const option = document.createElement("option");
			option.value = variant.variantId;
			option.textContent = `${variant.variantId} (${variant.shipBlueprintCount} ships)`;
			if (variant.variantId === runtimeDataContext.resolvedVariantId) {
				option.selected = true;
			}
			variantSelect.append(option);
		}
		variantSelect.disabled = false;
		subtitle.textContent = `Phase M5 runtime: deterministic loop + generated data packs + wireframe projection/clipping (${activeTimingProfile.label}).`;
		dataStatus.textContent = `data: loaded ${runtimeDataContext.resolvedVariantId}`;
	} catch (error) {
		runtimeDataContext = null;
		runtimeDataError = error instanceof Error ? error.message : String(error);
		wireframeBlueprintMap = new Map();
		audio.stopMusic();
		activeMusicTrackId = null;
		variantSelect.replaceChildren();
		const fallback = document.createElement("option");
		fallback.value = runtimeConfig.variantId;
		fallback.textContent = `${runtimeConfig.variantId} (unavailable)`;
		fallback.selected = true;
		variantSelect.append(fallback);
		variantSelect.disabled = true;
		subtitle.textContent = `Phase M3 runtime: data-pack load failed, running with simulation fallback (${activeTimingProfile.label}).`;
		dataStatus.textContent = "data: unavailable";
	}
}
void initializeRuntimeDataUi();
/**
 * Render debug text from runtime state. This is intentionally verbose in M2
 * to speed up migration diagnostics before real HUD systems are ported.
 */
function updateDebugPanel(nowMs, frameElapsedMs, simulatedSteps, wasClamped) {
	if (debugPanel.hidden) {
		return;
	}
	const simSnapshot = simulation.snapshot();
	const inputSnapshot = keyboard.snapshot();
	const variantSummary =
		runtimeDataContext?.manifest.variants.find(
			(variant) => variant.variantId === runtimeDataContext?.resolvedVariantId,
		) ?? null;
	debugPanel.textContent = [
		`time.nowMs         ${fixed(nowMs, 1)}`,
		`frame.elapsedMs    ${fixed(frameElapsedMs, 2)}`,
		`frame.steps        ${String(simulatedSteps).padStart(8, " ")}`,
		`frame.clamped      ${String(wasClamped).padStart(8, " ")}`,
		`frame.fps          ${fixed(perfStats.lastFps, 1)}`,
		`frame.overBudget   ${String(perfStats.overBudgetFrames).padStart(8, " ")}`,
		`save.status       ${saveStatusMessage}`,
		`sw.status         ${serviceWorkerStatusMessage}`,
		`sim.tick           ${String(simSnapshot.tick).padStart(8, " ")}`,
		`sim.simulatedMs    ${fixed(simSnapshot.simulatedMs, 2)}`,
		`sim.headingDeg     ${fixed(simSnapshot.playerHeadingDeg, 2)}`,
		`sim.speed          ${fixed(simSnapshot.playerSpeed, 2)}`,
		`sim.warpEngaged    ${String(simSnapshot.gameState.flight.warpEngaged).padStart(8, " ")}`,
		`sim.warpChargeMs   ${fixed(simSnapshot.gameState.flight.warpChargeMs, 1)}`,
		`sim.missiles       ${String(simSnapshot.gameState.flight.missileCount).padStart(8, " ")}`,
		`sim.missileArmed   ${String(simSnapshot.gameState.flight.missileArmed).padStart(8, " ")}`,
		`sim.missileLockMs  ${fixed(simSnapshot.gameState.flight.missileLockTimerMs, 1)}`,
		`sim.ecmEnabled     ${String(simSnapshot.gameState.views.ecmEnabled).padStart(8, " ")}`,
		`sim.ecmActiveMs    ${fixed(simSnapshot.gameState.flight.ecmActiveMs, 1)}`,
		`sim.laserTemp      ${String(simSnapshot.gameState.flow.laserTemperature).padStart(8, " ")}`,
		`sim.safeZone       ${String(simSnapshot.gameState.views.inStationSafeZone).padStart(8, " ")}`,
		`sim.stationDist    ${fixed(simSnapshot.gameState.flight.stationDistance, 1)}`,
		`sim.fuelTenths     ${fixed(simSnapshot.gameState.commander.fuelTenths, 1)}`,
		`sim.docked         ${String(simSnapshot.gameState.views.isDocked).padStart(8, " ")}`,
		`sim.rngState       ${String(simSnapshot.rngState).padStart(8, " ")}`,
		`sim.scenario       ${simSnapshot.scenarioId}`,
		`cfg.variant        ${runtimeConfig.variantId}`,
		`cfg.timing         ${runtimeConfig.timing}`,
		`cfg.timingResolved ${activeTimingProfile.id}`,
		`cfg.stepHz         ${fixed(activeTimingProfile.hz, 1)}`,
		`cfg.stepMs         ${fixed(activeTimingProfile.stepMs, 4)}`,
		`cfg.seed           ${runtimeConfig.seed}`,
		`data.variant       ${runtimeDataContext?.resolvedVariantId ?? "-"}`,
		`data.words         ${String(runtimeDataContext?.dataPack.words.tokenCount ?? 0).padStart(8, " ")}`,
		`data.iantok        ${String(runtimeDataContext?.dataPack.iantok.tokenCount ?? 0).padStart(8, " ")}`,
		`data.ships         ${String(runtimeDataContext?.dataPack.ships.blueprints.length ?? 0).padStart(8, " ")}`,
		`data.wireframes    ${String(wireframeBlueprintMap.size).padStart(8, " ")}`,
		`data.sprites       ${String(runtimeDataContext?.dataPack.visuals.sprites.spriteCount ?? 0).padStart(8, " ")}`,
		`data.fontGlyphs    ${String(runtimeDataContext?.dataPack.visuals.font.glyphCount ?? 0).padStart(8, " ")}`,
		`data.audioBytes    ${String(
			(runtimeDataContext?.dataPack.audio.comudat.byteLength ?? 0) +
				(runtimeDataContext?.dataPack.audio.theme.byteLength ?? 0),
		).padStart(8, " ")}`,
		`audio.master      ${fixed(audioSettings.masterVolume, 2)}`,
		`audio.sfx         ${fixed(audioSettings.sfxVolume, 2)}`,
		`audio.music       ${fixed(audioSettings.musicVolume, 2)}`,
		`audio.muted       ${String(audioSettings.muted).padStart(8, " ")}`,
		`guide.seen        ${String(onboardingAcknowledged).padStart(8, " ")}`,
		`data.padWords      ${String(variantSummary?.wordsPaddingBytes ?? 0).padStart(8, " ")}`,
		`data.iantokTail    ${String(variantSummary?.iantokTrailingPayloadBytes ?? 0).padStart(8, " ")}`,
		`data.error         ${runtimeDataError ?? "-"}`,
		`input.rollAxis     ${inputSnapshot.rollAxis}`,
		`input.pitchAxis    ${inputSnapshot.pitchAxis}`,
		`input.throttle     ${inputSnapshot.throttleAxis}`,
		`input.warpToggle   ${String(inputSnapshot.warpTogglePressed)}`,
		`input.escapePod    ${String(inputSnapshot.escapePodPressed)}`,
		`input.fireLaser    ${String(inputSnapshot.fireLaserPressed)}`,
		`input.missileArm   ${String(inputSnapshot.missileArmTogglePressed)}`,
		`input.missileFire  ${String(inputSnapshot.missileFirePressed)}`,
		`input.ecmToggle    ${String(inputSnapshot.ecmTogglePressed)}`,
		`input.dockAttempt  ${String(inputSnapshot.dockAttemptPressed)}`,
		`input.launch       ${String(inputSnapshot.launchPressed)}`,
		`input.keys         ${inputSnapshot.pressedKeys.join(", ") || "-"}`,
		"",
		"url params:",
		"?scenario=empty&variant=gma85-ntsc&timing=auto&seed=12345&debug=1",
	].join("\n");
}
/**
 * Main browser frame callback:
 * - advances fixed-step simulation,
 * - renders current snapshot,
 * - updates migration debug diagnostics.
 */
function animate(nowMs) {
	// Push latest control state into the deterministic simulation before stepping.
	if (!paused) {
		simulation.setPilotControls(mapKeyboardSnapshotToPilotControls(keyboard.snapshot()));
	}
	const frameNowMs = paused ? (pauseFrameNowMs ?? nowMs) : nowMs;
	const metrics = runner.frame(frameNowMs);
	const snapshot = simulation.snapshot();
	syncMusicTrack(snapshot);
	const elapsedMs = Math.max(0.0001, metrics.elapsedMs);
	perfStats.lastFps = 1000 / elapsedMs;
	perfStats.frameSamples.push(elapsedMs);
	if (perfStats.frameSamples.length > perfStats.sampleLimit) {
		perfStats.frameSamples.shift();
	}
	if (metrics.elapsedMs > activeTimingProfile.stepMs * 1.5) {
		perfStats.overBudgetFrames += 1;
	}
	if (!paused && nowMs - lastAutosaveMs >= AUTOSAVE_INTERVAL_MS) {
		saveSnapshotToLocalStorage(true);
		lastAutosaveMs = nowMs;
	}
	const audioState = deriveAudioCueEdgeState(snapshot);
	const cueDiff = detectAudioCuesFromEdgeStates(
		previousAudioState,
		audioState,
		nowMs,
		lastExplosionCueMs,
	);
	for (const cueId of cueDiff.cues) {
		audio.playSfx(cueId);
	}
	lastExplosionCueMs = cueDiff.nextLastExplosionCueMs;
	previousAudioState = audioState;
	renderer.render(snapshot, metrics);
	updateDebugPanel(nowMs, metrics.elapsedMs, metrics.simulatedSteps, metrics.wasClamped);
	window.requestAnimationFrame(animate);
}
window.requestAnimationFrame(animate);
// Dispose input listeners when the page unloads to keep teardown clean in tests.
window.addEventListener("beforeunload", () => {
	saveSnapshotToLocalStorage(true);
	audio.dispose();
	keyboard.dispose();
});
