/**
 * Deterministic celestial-scene generation for migration phase M5.1.3.
 *
 * This module intentionally contains only pure math helpers. The renderer can
 * call these functions every frame and then decide how to draw the resulting
 * stars/discs with any raster backend.
 */

/**
 * Viewport dimensions used by scene generation.
 */
export interface CelestialViewport {
  width: number;
  height: number;
}

/**
 * One generated star sample.
 */
export interface StarSample {
  x: number;
  y: number;
  brightness: number;
  size: 1 | 2;
}

/**
 * One generated circular body (planet or sun).
 */
export interface CelestialBodyDisc {
  kind: "planet" | "sun";
  centerX: number;
  centerY: number;
  radius: number;
}

/**
 * Input values sampled from simulation state.
 */
export interface CelestialSceneConfig {
  viewport: CelestialViewport;
  rngState: number;
  tick: number;
  headingDeg: number;
  speed: number;
  stationDistance: number;
}

/**
 * Full generated scene output used by the renderer.
 */
export interface CelestialScene {
  stars: StarSample[];
  planet: CelestialBodyDisc;
  sun: CelestialBodyDisc;
}

/**
 * Clamp one number into an inclusive range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Wrap one coordinate into [0, span) with deterministic behavior.
 */
function wrap(value: number, span: number): number {
  if (span <= 0) {
    return 0;
  }
  const wrapped = value % span;
  return wrapped >= 0 ? wrapped : wrapped + span;
}

/**
 * Deterministic 32-bit integer mixer.
 *
 * This is a compact avalanche-style hash that gives good bit diffusion for
 * procedural generation while remaining deterministic across JS engines.
 */
function mixUint32(input: number): number {
  let value = input >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

/**
 * Convert one 32-bit integer into normalized [0, 1] float.
 */
function unitFloatFromUint32(input: number): number {
  return (input >>> 0) / 0xffff_ffff;
}

/**
 * Normalize viewport dimensions so downstream math has safe bounds.
 */
function normalizeViewport(viewport: CelestialViewport): CelestialViewport {
  return {
    width: Math.max(1, Math.floor(viewport.width)),
    height: Math.max(1, Math.floor(viewport.height)),
  };
}

/**
 * Compute deterministic star count from viewport area.
 *
 * We keep this bounded so small screens still look alive and large screens do
 * not explode linearly in point count.
 */
function computeStarCount(viewport: CelestialViewport): number {
  const area = viewport.width * viewport.height;
  return clamp(Math.round(area / 900), 64, 220);
}

/**
 * Build one deterministic star sample.
 *
 * Star motion model:
 * - per-star base position comes from hashed seed/index
 * - heading applies lateral drift
 * - speed + tick apply forward parallax drift
 * - twinkle is a small sinusoidal brightness modulation
 */
function buildStarSample(
  config: CelestialSceneConfig,
  viewport: CelestialViewport,
  starIndex: number,
): StarSample {
  const headingRadians = (config.headingDeg * Math.PI) / 180;
  const starSeed = mixUint32(config.rngState ^ Math.imul(starIndex + 1, 0x9e37_79b9));
  const xSeed = mixUint32(starSeed ^ 0xa5a5_1f1f);
  const ySeed = mixUint32(starSeed ^ 0x5bd1_e995);
  const depthSeed = mixUint32(starSeed ^ 0x27d4_eb2d);
  const twinkleSeed = mixUint32(starSeed ^ 0x1656_67b1);

  const baseX = unitFloatFromUint32(xSeed) * viewport.width;
  const baseY = unitFloatFromUint32(ySeed) * viewport.height;

  // Depth class controls parallax amount; lower class -> brighter/larger stars.
  const depthClass = ((depthSeed >>> 29) & 0b111) + 1;
  const depthFactor = (9 - depthClass) / 8;

  const headingDriftX = Math.sin(headingRadians) * depthClass * 2.7;
  const headingDriftY = Math.cos(headingRadians * 0.7) * depthClass * 0.9;
  const speedDrift = config.speed * (config.tick / 60) * (0.018 / depthClass);

  const x = Math.floor(
    wrap(
      baseX + headingDriftX + speedDrift + Math.sin(config.tick * 0.012 + starIndex * 0.61) * 1.6,
      viewport.width,
    ),
  );
  const y = Math.floor(
    wrap(
      baseY + headingDriftY + Math.cos(config.tick * 0.009 + starIndex * 0.47) * 1.2,
      viewport.height,
    ),
  );

  const baseBrightness = 0.35 + depthFactor * 0.6;
  const twinklePhase = (twinkleSeed & 0xffff) / 0xffff;
  const twinkle = 0.88 + Math.sin(config.tick * 0.018 + twinklePhase * Math.PI * 2) * 0.12;
  const brightness = clamp(baseBrightness * twinkle, 0.2, 1);

  return {
    x,
    y,
    brightness,
    size: brightness > 0.78 && depthClass <= 3 ? 2 : 1,
  };
}

/**
 * Build one deterministic planet disc.
 */
function buildPlanetDisc(
  config: CelestialSceneConfig,
  viewport: CelestialViewport,
): CelestialBodyDisc {
  const minDimension = Math.min(viewport.width, viewport.height);
  const distanceFactor = 1 - clamp(config.stationDistance / 5000, 0, 1);
  const baseRadius = minDimension * (0.08 + distanceFactor * 0.08);
  const pulse = Math.sin(config.tick * 0.005 + (config.rngState & 0xff) * 0.01) * 1.5;
  const radius = Math.max(10, Math.round(baseRadius + pulse));

  const orbitPhase = ((mixUint32(config.rngState ^ 0x11ab_42cd) & 0xffff) / 0xffff) * Math.PI * 2;
  const headingRadians = (config.headingDeg * Math.PI) / 180;
  const centerX = Math.round(
    viewport.width * 0.24 + Math.cos(orbitPhase + headingRadians * 0.35) * viewport.width * 0.08,
  );
  const centerY = Math.round(
    viewport.height * 0.3 +
      Math.sin(orbitPhase * 0.8 + config.tick * 0.0015) * viewport.height * 0.06,
  );

  return {
    kind: "planet",
    centerX: clamp(centerX, -radius + 2, viewport.width + radius - 2),
    centerY: clamp(centerY, -radius + 2, viewport.height + radius - 2),
    radius,
  };
}

/**
 * Build one deterministic sun disc.
 */
function buildSunDisc(
  config: CelestialSceneConfig,
  viewport: CelestialViewport,
): CelestialBodyDisc {
  const minDimension = Math.min(viewport.width, viewport.height);
  const baseRadius = minDimension * 0.055;
  const pulse = Math.sin(config.tick * 0.007 + ((config.rngState >>> 8) & 0xff) * 0.02) * 2.2;
  const radius = Math.max(8, Math.round(baseRadius + pulse));

  const orbitPhase = ((mixUint32(config.rngState ^ 0x98f1_2cd7) & 0xffff) / 0xffff) * Math.PI * 2;
  const headingRadians = (config.headingDeg * Math.PI) / 180;
  const centerX = Math.round(
    viewport.width * 0.77 + Math.cos(orbitPhase - headingRadians * 0.2) * viewport.width * 0.09,
  );
  const centerY = Math.round(
    viewport.height * 0.2 +
      Math.sin(orbitPhase * 1.1 + config.tick * 0.0018) * viewport.height * 0.05,
  );

  return {
    kind: "sun",
    centerX: clamp(centerX, -radius + 2, viewport.width + radius - 2),
    centerY: clamp(centerY, -radius + 2, viewport.height + radius - 2),
    radius,
  };
}

/**
 * Generate deterministic stars + planet/sun descriptors for one frame.
 */
export function buildCelestialScene(config: CelestialSceneConfig): CelestialScene {
  const viewport = normalizeViewport(config.viewport);
  const starCount = computeStarCount(viewport);
  const stars: StarSample[] = [];

  for (let starIndex = 0; starIndex < starCount; starIndex += 1) {
    stars.push(buildStarSample(config, viewport, starIndex));
  }

  return {
    stars,
    planet: buildPlanetDisc(config, viewport),
    sun: buildSunDisc(config, viewport),
  };
}
