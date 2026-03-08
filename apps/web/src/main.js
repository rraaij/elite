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
const SAVE_SLOT_KEY = "elite.migration.save-slot-1";
const DEFAULT_VARIANT_ID = "gma85-ntsc";
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
	const manifest = await fetchJson("/game-data/manifest.json");
	if (!manifest.variants.length) {
		throw new Error("Generated manifest has no variants.");
	}
	const match =
		manifest.variants.find((variant) => variant.variantId === desiredVariantId) ??
		manifest.variants[0];
	if (!match) {
		throw new Error("Could not resolve a variant from generated manifest.");
	}
	const dataPack = await fetchJson(`/game-data/${match.variantId}/data-pack.json`);
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
const runtimeConfig = getRuntimeConfigFromUrl(new URL(window.location.href));
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
actionBar.append(saveButton, loadButton);
const debugPanel = document.createElement("pre");
debugPanel.className = "runtime-debug";
debugPanel.hidden = !runtimeConfig.debug;
sidebar.append(title, subtitle, dataStatus, variantField, timingField, actionBar, debugPanel);
layout.append(canvasPanel, sidebar);
root.append(layout);
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
let runtimeDataContext = null;
let runtimeDataError = null;
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
/**
 * Save-state stub used in M2:
 * stores a serialized simulation snapshot in localStorage.
 */
function saveSnapshotToLocalStorage() {
	const payload = serializeSaveState(simulation.snapshot());
	window.localStorage.setItem(SAVE_SLOT_KEY, payload);
}
/**
 * Load-state stub used in M2:
 * reads the payload back and restores simulation state.
 */
function loadSnapshotFromLocalStorage() {
	const payload = window.localStorage.getItem(SAVE_SLOT_KEY);
	if (!payload) {
		return;
	}
	const envelope = deserializeSaveState(payload);
	simulation.restore(envelope.snapshot);
}
saveButton.addEventListener("click", saveSnapshotToLocalStorage);
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
	simulation.setPilotControls(mapKeyboardSnapshotToPilotControls(keyboard.snapshot()));
	const metrics = runner.frame(nowMs);
	const snapshot = simulation.snapshot();
	renderer.render(snapshot, metrics);
	updateDebugPanel(nowMs, metrics.elapsedMs, metrics.simulatedSteps, metrics.wasClamped);
	window.requestAnimationFrame(animate);
}
window.requestAnimationFrame(animate);
// Dispose input listeners when the page unloads to keep teardown clean in tests.
window.addEventListener("beforeunload", () => {
	keyboard.dispose();
});
