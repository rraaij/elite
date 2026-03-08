import type { FrameMetrics, SimulationSnapshot } from "../../game-core/src/index";
import {
  drawCircle,
  drawLine,
  plotPixel,
  type PixelPlotter,
  type RasterBounds,
} from "./rasterPrimitives";
import {
  createCockpitHudModel,
  type CockpitHudModel,
  type HudBar,
  type IndicatorLamp,
  type ScannerContact,
} from "./cockpitHud";
import {
  createCockpitTextLayerModel,
  createViewPresentationKey,
  createViewTransitionTracker,
  stepViewTransitionTracker,
  type CockpitTextLayerModel,
  type OverlayTextLine,
  type ViewTransitionFrame,
  type ViewTransitionTracker,
} from "./viewTextOverlay";
import {
  createCockpitColorBehavior,
  resolveHudBarFillColor,
  resolveIndicatorLampColor,
  resolveOverlayToneColor,
  resolveScannerContactColor,
  type CockpitColorBehavior,
} from "./cockpitColorBehavior";
import { buildCelestialScene, type CelestialBodyDisc, type StarSample } from "./celestialScene";
import {
  projectWireframeScene,
  type WireframeBlueprint,
  type WireframeShipInstance,
} from "./wireframeProjection";

/**
 * Optional wireframe scene settings consumed by the canvas renderer.
 *
 * The resolver indirection allows the app to load data packs asynchronously
 * while keeping the renderer long-lived.
 */
export interface CanvasRendererWireframeConfig {
  resolveBlueprintById(blueprintId: number): WireframeBlueprint | null;
  modelScale?: number;
  nearPlaneZ?: number;
  focalLengthPx?: number;
}

export interface CanvasRendererConfig {
  canvas: HTMLCanvasElement;
  wireframeScene?: CanvasRendererWireframeConfig;
}

export interface CanvasRenderer {
  resize(width: number, height: number, pixelRatio: number): void;
  render(snapshot: SimulationSnapshot, frameMetrics: FrameMetrics): void;
}

/**
 * Convert one floating coordinate to integer raster space.
 *
 * Rounding here keeps line endpoints symmetric around the center reticle.
 */
function toRasterCoordinate(value: number): number {
  return Math.round(value);
}

/**
 * Clamp one number into an inclusive range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Build a draw target bounds object for primitive clipping.
 */
function toRasterBounds(width: number, height: number): RasterBounds {
  return {
    width,
    height,
  };
}

/**
 * Build a plot callback that writes one pixel into the canvas.
 *
 * Primitives handle clipping and integer stepping, so this callback can stay
 * as a minimal direct `fillRect` write.
 */
function createCanvasPlotter(ctx: CanvasRenderingContext2D): PixelPlotter {
  return (x: number, y: number): void => {
    ctx.fillRect(x, y, 1, 1);
  };
}

/**
 * Draw one filled disc via horizontal scanlines.
 *
 * Using line primitives here keeps drawing behavior aligned with the same
 * software-style raster path as other geometry in this migration stage.
 */
function drawFilledDisc(
  rasterBounds: RasterBounds,
  plotter: PixelPlotter,
  centerX: number,
  centerY: number,
  radius: number,
): void {
  if (radius <= 0) {
    plotPixel(rasterBounds, centerX, centerY, plotter);
    return;
  }

  const radiusSquared = radius * radius;
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    const spanSquared = radiusSquared - offsetY * offsetY;
    if (spanSquared < 0) {
      continue;
    }

    const spanX = Math.floor(Math.sqrt(spanSquared));
    drawLine(
      rasterBounds,
      { x: centerX - spanX, y: centerY + offsetY },
      { x: centerX + spanX, y: centerY + offsetY },
      plotter,
    );
  }
}

/**
 * Draw one deterministic star sample.
 */
function drawStarSample(
  ctx: CanvasRenderingContext2D,
  rasterBounds: RasterBounds,
  plotter: PixelPlotter,
  star: StarSample,
): void {
  const alpha = (0.2 + star.brightness * 0.8).toFixed(3);
  ctx.fillStyle = `rgba(212, 235, 255, ${alpha})`;

  if (star.size === 1) {
    plotPixel(rasterBounds, star.x, star.y, plotter);
    return;
  }

  // Larger stars get a tiny sparkle cross so depth cues are visible.
  drawLine(rasterBounds, { x: star.x - 1, y: star.y }, { x: star.x + 1, y: star.y }, plotter);
  drawLine(rasterBounds, { x: star.x, y: star.y - 1 }, { x: star.x, y: star.y + 1 }, plotter);
}

/**
 * Draw all star samples for the current frame.
 */
function drawStarfield(
  ctx: CanvasRenderingContext2D,
  rasterBounds: RasterBounds,
  plotter: PixelPlotter,
  stars: readonly StarSample[],
): void {
  for (const star of stars) {
    drawStarSample(ctx, rasterBounds, plotter, star);
  }
}

/**
 * Draw one celestial disc (planet or sun) with simple layered styling.
 */
function drawCelestialDisc(
  ctx: CanvasRenderingContext2D,
  rasterBounds: RasterBounds,
  plotter: PixelPlotter,
  disc: CelestialBodyDisc,
): void {
  if (disc.kind === "sun") {
    // Outer glow.
    ctx.fillStyle = "rgba(255, 187, 94, 0.32)";
    drawFilledDisc(rasterBounds, plotter, disc.centerX, disc.centerY, disc.radius + 4);

    // Core body.
    ctx.fillStyle = "rgba(255, 225, 152, 0.88)";
    drawFilledDisc(rasterBounds, plotter, disc.centerX, disc.centerY, disc.radius);

    // Bright hotspot to give a simple volumetric feel.
    ctx.fillStyle = "rgba(255, 248, 214, 0.92)";
    drawFilledDisc(
      rasterBounds,
      plotter,
      disc.centerX - Math.floor(disc.radius * 0.25),
      disc.centerY - Math.floor(disc.radius * 0.2),
      Math.max(2, Math.floor(disc.radius * 0.42)),
    );

    // Corona rings.
    ctx.fillStyle = "rgba(255, 219, 146, 0.68)";
    drawCircle(rasterBounds, { x: disc.centerX, y: disc.centerY }, disc.radius + 2, plotter);
    drawCircle(rasterBounds, { x: disc.centerX, y: disc.centerY }, disc.radius + 6, plotter);
    return;
  }

  // Planet base tone.
  ctx.fillStyle = "rgba(76, 136, 194, 0.84)";
  drawFilledDisc(rasterBounds, plotter, disc.centerX, disc.centerY, disc.radius);

  // Terminator shadow on the right hemisphere.
  ctx.fillStyle = "rgba(17, 34, 76, 0.36)";
  for (let offsetX = 0; offsetX <= disc.radius; offsetX += 1) {
    const spanSquared = disc.radius * disc.radius - offsetX * offsetX;
    if (spanSquared < 0) {
      continue;
    }

    const spanY = Math.floor(Math.sqrt(spanSquared));
    const x = disc.centerX + offsetX;
    drawLine(rasterBounds, { x, y: disc.centerY - spanY }, { x, y: disc.centerY + spanY }, plotter);
  }

  // Atmosphere rim + subtle secondary ring.
  ctx.fillStyle = "rgba(153, 215, 255, 0.72)";
  drawCircle(rasterBounds, { x: disc.centerX, y: disc.centerY }, disc.radius, plotter);
  drawCircle(rasterBounds, { x: disc.centerX, y: disc.centerY }, disc.radius + 3, plotter);
}

/**
 * Draw deterministic starfield + planet/sun discs for the current frame.
 */
function drawCelestialBackdrop(
  ctx: CanvasRenderingContext2D,
  rasterBounds: RasterBounds,
  plotter: PixelPlotter,
  snapshot: SimulationSnapshot,
): void {
  const scene = buildCelestialScene({
    viewport: {
      width: rasterBounds.width,
      height: rasterBounds.height,
    },
    rngState: snapshot.rngState,
    tick: snapshot.tick,
    headingDeg: snapshot.playerHeadingDeg,
    speed: snapshot.playerSpeed,
    stationDistance: snapshot.gameState.flight.stationDistance,
  });

  drawStarfield(ctx, rasterBounds, plotter, scene.stars);
  drawCelestialDisc(ctx, rasterBounds, plotter, scene.sun);
  drawCelestialDisc(ctx, rasterBounds, plotter, scene.planet);
}

/**
 * Convert simulation local-universe objects into projection ship instances.
 *
 * We preserve slot ids and blueprint ids so projected segment metadata can
 * remain deterministic frame-to-frame.
 */
function toWireframeShipInstances(snapshot: SimulationSnapshot): WireframeShipInstance[] {
  return snapshot.gameState.universe.localBubbleShips.map((ship) => ({
    slotId: ship.slotId,
    kind: ship.kind,
    blueprintId: ship.blueprintId,
    position: {
      x: ship.position.x,
      y: ship.position.y,
      z: ship.position.z,
    },
  }));
}

/**
 * Draw projected wireframe segments using software line primitive.
 */
function drawProjectedSegments(
  rasterBounds: RasterBounds,
  plotPixel: PixelPlotter,
  snapshot: SimulationSnapshot,
  wireframeConfig: CanvasRendererWireframeConfig,
): void {
  const projection = projectWireframeScene({
    ships: toWireframeShipInstances(snapshot),
    headingDeg: snapshot.playerHeadingDeg,
    viewport: {
      width: rasterBounds.width,
      height: rasterBounds.height,
      nearPlaneZ: wireframeConfig.nearPlaneZ ?? 140,
      focalLengthPx:
        wireframeConfig.focalLengthPx ?? Math.min(rasterBounds.width, rasterBounds.height) * 0.52,
      centerX: rasterBounds.width * 0.5,
      centerY: rasterBounds.height * 0.42,
    },
    modelScale: wireframeConfig.modelScale ?? 5.5,
    // Use an arrow wrapper so lint can guarantee no accidental `this` binding.
    resolveBlueprintById: (blueprintId: number): WireframeBlueprint | null =>
      wireframeConfig.resolveBlueprintById(blueprintId),
  });

  for (const segment of projection.segments) {
    drawLine(
      rasterBounds,
      { x: segment.x0, y: segment.y0 },
      { x: segment.x1, y: segment.y1 },
      plotPixel,
    );
  }
}

/**
 * Draw one normalized dashboard bar with label.
 */
function drawHudBar(
  ctx: CanvasRenderingContext2D,
  bar: HudBar,
  colorBehavior: CockpitColorBehavior,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const innerWidth = Math.max(0, Math.floor((width - 2) * bar.value01));

  // Cockpit background tone shifts with global alert level.
  ctx.fillStyle = colorBehavior.palette.hudBarBackground;
  ctx.fillRect(x, y, width, height);

  // Warning bars blink; nominal bars keep their category color.
  ctx.fillStyle = resolveHudBarFillColor(bar, colorBehavior);
  ctx.fillRect(x + 1, y + 1, innerWidth, Math.max(1, height - 2));

  ctx.strokeStyle = colorBehavior.palette.hudBarBorder;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  ctx.fillStyle = colorBehavior.palette.hudBarLabel;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText(bar.label, x, y - 3);
}

/**
 * Draw left/right bar stacks in the dashboard.
 */
function drawHudBars(
  ctx: CanvasRenderingContext2D,
  hudModel: CockpitHudModel,
  colorBehavior: CockpitColorBehavior,
): void {
  const barWidth = clamp(Math.floor(hudModel.dashboardRect.width * 0.14), 74, 140);
  const barHeight = 12;
  const gap = 16;
  const startY = hudModel.dashboardRect.y + 20;
  const leftX = 14;
  const rightX = hudModel.dashboardRect.width - barWidth - 14;

  for (let index = 0; index < hudModel.leftBars.length; index += 1) {
    const bar = hudModel.leftBars[index];
    if (!bar) {
      continue;
    }
    drawHudBar(ctx, bar, colorBehavior, leftX, startY + index * gap, barWidth, barHeight);
  }

  for (let index = 0; index < hudModel.rightBars.length; index += 1) {
    const bar = hudModel.rightBars[index];
    if (!bar) {
      continue;
    }
    drawHudBar(ctx, bar, colorBehavior, rightX, startY + index * gap, barWidth, barHeight);
  }
}

/**
 * Draw one scanner contact blip.
 */
function drawScannerContact(
  ctx: CanvasRenderingContext2D,
  rasterBounds: RasterBounds,
  plotter: PixelPlotter,
  contact: ScannerContact,
  colorBehavior: CockpitColorBehavior,
): void {
  ctx.fillStyle = resolveScannerContactColor(contact, colorBehavior);

  plotPixel(rasterBounds, contact.x, contact.y, plotter);
  drawLine(
    rasterBounds,
    { x: contact.x - 1, y: contact.y },
    { x: contact.x + 1, y: contact.y },
    plotter,
  );
}

/**
 * Draw short-range scanner frame, grid, and contacts.
 */
function drawScanner(
  ctx: CanvasRenderingContext2D,
  rasterBounds: RasterBounds,
  plotter: PixelPlotter,
  hudModel: CockpitHudModel,
  colorBehavior: CockpitColorBehavior,
): void {
  const scanner = hudModel.scanner;
  const rect = scanner.rect;

  ctx.fillStyle = colorBehavior.palette.scannerFill;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.fillStyle = colorBehavior.palette.scannerFrame;
  drawLine(
    rasterBounds,
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width - 1, y: rect.y },
    plotter,
  );
  drawLine(
    rasterBounds,
    { x: rect.x, y: rect.y + rect.height - 1 },
    { x: rect.x + rect.width - 1, y: rect.y + rect.height - 1 },
    plotter,
  );
  drawLine(
    rasterBounds,
    { x: rect.x, y: rect.y },
    { x: rect.x, y: rect.y + rect.height - 1 },
    plotter,
  );
  drawLine(
    rasterBounds,
    { x: rect.x + rect.width - 1, y: rect.y },
    { x: rect.x + rect.width - 1, y: rect.y + rect.height - 1 },
    plotter,
  );

  // Scanner centerline and depth guide.
  const centerX = Math.floor(rect.x + rect.width * 0.5);
  const centerY = Math.floor(rect.y + rect.height * 0.5);
  ctx.fillStyle = colorBehavior.palette.scannerGuide;
  drawLine(
    rasterBounds,
    { x: rect.x + 1, y: centerY },
    { x: rect.x + rect.width - 2, y: centerY },
    plotter,
  );
  drawLine(
    rasterBounds,
    { x: centerX, y: rect.y + 1 },
    { x: centerX, y: rect.y + rect.height - 2 },
    plotter,
  );

  for (const contact of scanner.contacts) {
    drawScannerContact(ctx, rasterBounds, plotter, contact, colorBehavior);
  }

  ctx.fillStyle = colorBehavior.palette.hudBarLabel;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText("SCAN", rect.x + 4, rect.y + 11);
}

/**
 * Draw compass ring and target needle.
 */
function drawCompass(
  ctx: CanvasRenderingContext2D,
  rasterBounds: RasterBounds,
  plotter: PixelPlotter,
  hudModel: CockpitHudModel,
  colorBehavior: CockpitColorBehavior,
): void {
  const compass = hudModel.compass;

  ctx.fillStyle = colorBehavior.palette.compassFill;
  drawFilledDisc(
    rasterBounds,
    plotter,
    compass.centerX,
    compass.centerY,
    Math.max(2, compass.radius - 1),
  );

  ctx.fillStyle = colorBehavior.palette.compassRing;
  drawCircle(rasterBounds, { x: compass.centerX, y: compass.centerY }, compass.radius, plotter);
  drawCircle(
    rasterBounds,
    { x: compass.centerX, y: compass.centerY },
    Math.max(1, compass.radius - 4),
    plotter,
  );

  ctx.fillStyle = colorBehavior.palette.compassNeedle;
  drawLine(
    rasterBounds,
    { x: compass.centerX, y: compass.centerY },
    { x: compass.needleX, y: compass.needleY },
    plotter,
  );
  plotPixel(rasterBounds, compass.needleX, compass.needleY, plotter);

  ctx.fillStyle = colorBehavior.palette.hudBarLabel;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText("CMP", compass.centerX - compass.radius + 1, compass.centerY - compass.radius - 3);
}

/**
 * Draw dashboard indicator lamps.
 */
function drawIndicators(
  ctx: CanvasRenderingContext2D,
  indicators: readonly IndicatorLamp[],
  panelWidth: number,
  baseY: number,
  snapshot: SimulationSnapshot,
  colorBehavior: CockpitColorBehavior,
): void {
  const lampWidth = 32;
  const lampHeight = 10;
  const gap = 8;
  const totalWidth = indicators.length * lampWidth + Math.max(0, indicators.length - 1) * gap;
  let x = Math.floor((panelWidth - totalWidth) * 0.5);
  const missileLocked =
    snapshot.gameState.flight.missileTargetSlotId !== null &&
    snapshot.gameState.flight.missileLockTimerMs >= 450;

  for (const indicator of indicators) {
    ctx.fillStyle = resolveIndicatorLampColor(indicator, colorBehavior, missileLocked);
    ctx.fillRect(x, baseY, lampWidth, lampHeight);
    ctx.strokeStyle = colorBehavior.palette.hudBarBorder;
    ctx.strokeRect(x + 0.5, baseY + 0.5, lampWidth - 1, lampHeight - 1);

    ctx.fillStyle = colorBehavior.palette.indicatorLabel;
    ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(indicator.label, x + 4, baseY + 8);

    x += lampWidth + gap;
  }
}

/**
 * Draw one block of text lines with alignment-aware placement.
 */
function drawOverlayLines(
  ctx: CanvasRenderingContext2D,
  lines: readonly OverlayTextLine[],
  colorBehavior: CockpitColorBehavior,
  anchorX: number,
  startY: number,
  lineHeight: number,
): void {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    const y = startY + index * lineHeight;
    ctx.fillStyle = resolveOverlayToneColor(line.tone, colorBehavior);
    ctx.textAlign = line.align;
    ctx.fillText(line.text, anchorX, y);
  }
}

/**
 * Convert one transition key into a human-readable title.
 *
 * Transition keys are serialized as `${phase}:${view}` and view ids may contain
 * hyphens. This helper keeps the transition label rendering centralized.
 */
function formatTransitionViewKey(viewKey: string): string {
  const [phasePart, ...viewParts] = viewKey.split(":");
  const phase = (phasePart ?? "unknown").replace(/-/g, " ").toUpperCase();
  const view = viewParts.join(":").replace(/-/g, " ").toUpperCase();
  return `${view} / ${phase}`;
}

/**
 * Resolve title crossfade RGB by alert state.
 *
 * We keep this local instead of parsing CSS strings so crossfade draw calls can
 * build deterministic RGBA values without introducing extra color parsers.
 */
function overlayTitleRgb(
  alertLevel: CockpitColorBehavior["alertLevel"],
): readonly [number, number, number] {
  switch (alertLevel) {
    case "caution":
      return [255, 236, 201];
    case "danger":
      return [255, 230, 223];
    case "nominal":
    default:
      return [213, 243, 255];
  }
}

/**
 * Draw animated transition bands for mixed-view changes.
 */
function drawMixedViewTransitionOverlay(
  ctx: CanvasRenderingContext2D,
  rasterBounds: RasterBounds,
  transitionFrame: ViewTransitionFrame,
  colorBehavior: CockpitColorBehavior,
): void {
  if (!transitionFrame.active) {
    return;
  }

  const viewportTopHeight = Math.floor(rasterBounds.height * 0.64);
  const progress = transitionFrame.progress01;
  // Tie sweep width to pulse so transition animation feels less static.
  const pulseScale = 0.85 + colorBehavior.flash.pulse01 * 0.35;
  const sweepWidth = Math.max(26, Math.floor(rasterBounds.width * 0.1 * pulseScale));
  const sweepX = Math.floor((rasterBounds.width + sweepWidth * 2) * progress - sweepWidth);

  // Core sweep panel.
  ctx.fillStyle = colorBehavior.palette.transitionSweep;
  ctx.fillRect(sweepX - sweepWidth, 0, sweepWidth, viewportTopHeight);

  // Lightweight scanline banding makes the transition feel intentional.
  ctx.fillStyle = colorBehavior.palette.transitionBand;
  const bandHeight = 6;
  for (let y = 0; y < viewportTopHeight; y += bandHeight * 2) {
    ctx.fillRect(sweepX - sweepWidth, y, sweepWidth, bandHeight);
  }
}

/**
 * Draw text-layer overlays, including mixed-view transition labels.
 */
function drawCockpitTextLayers(
  ctx: CanvasRenderingContext2D,
  rasterBounds: RasterBounds,
  textLayerModel: CockpitTextLayerModel,
  transitionFrame: ViewTransitionFrame,
  colorBehavior: CockpitColorBehavior,
): void {
  const topPanelHeight = Math.floor(rasterBounds.height * 0.14);
  const dashboardTop = Math.floor(rasterBounds.height * 0.66);
  const bottomMessageY = dashboardTop - 24;

  // Header strip improves text contrast over starfield/wireframe content.
  ctx.fillStyle = colorBehavior.palette.overlayHeader;
  ctx.fillRect(0, 0, rasterBounds.width, topPanelHeight);

  // Base typography settings for compact cockpit text.
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.textBaseline = "alphabetic";

  drawOverlayLines(ctx, textLayerModel.topLeft, colorBehavior, 12, 18, 14);
  drawOverlayLines(ctx, textLayerModel.topRight, colorBehavior, rasterBounds.width - 12, 18, 14);

  // Primary view title in the upper center.
  const currentTitle = `${textLayerModel.viewLabel} / ${textLayerModel.phaseLabel}`;
  ctx.textAlign = "center";

  if (!transitionFrame.active || transitionFrame.fromViewKey === null) {
    ctx.fillStyle = colorBehavior.palette.overlayPrimary;
    ctx.fillText(currentTitle, Math.floor(rasterBounds.width * 0.5), 18);
  } else {
    // Crossfade previous and next labels during transition.
    const progress = transitionFrame.progress01;
    const previousTitle = formatTransitionViewKey(transitionFrame.fromViewKey);
    const currentAlpha = clamp(progress, 0, 1);
    const previousAlpha = clamp(1 - progress, 0, 1);
    const slideOffset = Math.floor((0.5 - progress) * 20);
    const titleRgb = overlayTitleRgb(colorBehavior.alertLevel);

    ctx.fillStyle = `rgba(${titleRgb[0]}, ${titleRgb[1]}, ${titleRgb[2]}, ${previousAlpha.toFixed(
      3,
    )})`;
    ctx.fillText(previousTitle, Math.floor(rasterBounds.width * 0.5) - slideOffset, 18);

    ctx.fillStyle = `rgba(${titleRgb[0]}, ${titleRgb[1]}, ${titleRgb[2]}, ${currentAlpha.toFixed(
      3,
    )})`;
    ctx.fillText(currentTitle, Math.floor(rasterBounds.width * 0.5) + 12 - slideOffset, 18);
  }

  // Bottom-center contextual text sits just above the dashboard.
  drawOverlayLines(
    ctx,
    textLayerModel.bottomCenter,
    colorBehavior,
    Math.floor(rasterBounds.width * 0.5),
    bottomMessageY,
    13,
  );
}

/**
 * Draw the full cockpit HUD layer for bars, compass, scanner, and lamps.
 */
function drawCockpitHud(
  ctx: CanvasRenderingContext2D,
  rasterBounds: RasterBounds,
  plotter: PixelPlotter,
  snapshot: SimulationSnapshot,
  colorBehavior: CockpitColorBehavior,
): void {
  const hudModel = createCockpitHudModel(snapshot, {
    width: rasterBounds.width,
    height: rasterBounds.height,
  });

  const panel = hudModel.dashboardRect;
  ctx.fillStyle = colorBehavior.palette.panelFill;
  ctx.fillRect(panel.x, panel.y, panel.width, panel.height);

  // Top rim line helps visually separate the viewport from instrument panel.
  ctx.fillStyle = colorBehavior.palette.panelRim;
  drawLine(
    rasterBounds,
    { x: panel.x, y: panel.y },
    { x: panel.x + panel.width - 1, y: panel.y },
    plotter,
  );

  drawScanner(ctx, rasterBounds, plotter, hudModel, colorBehavior);
  drawCompass(ctx, rasterBounds, plotter, hudModel, colorBehavior);
  drawHudBars(ctx, hudModel, colorBehavior);
  drawIndicators(
    ctx,
    hudModel.indicators,
    panel.width,
    panel.y + panel.height - 14,
    snapshot,
    colorBehavior,
  );
}

/**
 * Basic canvas renderer for migration slice S1/S2.
 * This intentionally draws a minimal diagnostic scene while simulation
 * and data conversion work continues in parallel.
 */
export function createCanvasRenderer(config: CanvasRendererConfig): CanvasRenderer {
  const { canvas, wireframeScene } = config;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context could not be created.");
  }

  const ctx = context;
  let logicalWidth = 0;
  let logicalHeight = 0;
  let viewTransitionTracker: ViewTransitionTracker = createViewTransitionTracker();

  return {
    resize(width: number, height: number, pixelRatio: number): void {
      // Keep a logical size separate from backing store to support HiDPI displays.
      logicalWidth = Math.max(1, Math.floor(width));
      logicalHeight = Math.max(1, Math.floor(height));

      canvas.width = Math.max(1, Math.floor(logicalWidth * pixelRatio));
      canvas.height = Math.max(1, Math.floor(logicalHeight * pixelRatio));
      canvas.style.width = `${logicalWidth}px`;
      canvas.style.height = `${logicalHeight}px`;

      // Reset transform every resize so drawing units remain in CSS pixels.
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.imageSmoothingEnabled = false;
    },

    render(snapshot: SimulationSnapshot, frameMetrics: FrameMetrics): void {
      if (logicalWidth <= 0 || logicalHeight <= 0) {
        return;
      }

      // Render geometric overlays via software-style primitives.
      const rasterBounds = toRasterBounds(logicalWidth, logicalHeight);
      const plotPixel = createCanvasPlotter(ctx);
      const horizonY = toRasterCoordinate(logicalHeight * 0.65);
      const colorBehavior = createCockpitColorBehavior(snapshot);

      // Scene background tint now reacts to alert level.
      ctx.fillStyle = colorBehavior.palette.sceneBackground;
      ctx.fillRect(0, 0, logicalWidth, logicalHeight);

      // Resolve text-layer model + view transition state before drawing.
      const textLayerModel = createCockpitTextLayerModel(snapshot);
      const transitionStep = stepViewTransitionTracker(
        viewTransitionTracker,
        createViewPresentationKey(snapshot),
        snapshot.tick,
        20,
      );
      viewTransitionTracker = transitionStep.tracker;

      // Draw stars + planet + sun before cockpit overlays.
      drawCelestialBackdrop(ctx, rasterBounds, plotPixel, snapshot);

      // Horizon line gives orientation cues and now runs through line primitive.
      ctx.fillStyle = colorBehavior.palette.horizonLine;
      drawLine(
        rasterBounds,
        { x: 0, y: horizonY },
        { x: logicalWidth - 1, y: horizonY },
        plotPixel,
      );

      // Draw a simple scanner-like grid to make deterministic motion obvious.
      ctx.fillStyle = colorBehavior.palette.sceneGrid;
      for (let x = 0; x < logicalWidth; x += 40) {
        drawLine(rasterBounds, { x, y: horizonY }, { x, y: logicalHeight - 1 }, plotPixel);
      }

      // Draw local-universe ship wireframes when blueprint data is available.
      if (wireframeScene) {
        ctx.fillStyle = colorBehavior.palette.wireframe;
        drawProjectedSegments(rasterBounds, plotPixel, snapshot, wireframeScene);
      }

      // Transition band overlay sits between scene geometry and cockpit panel.
      drawMixedViewTransitionOverlay(ctx, rasterBounds, transitionStep.frame, colorBehavior);

      // Cockpit instruments occupy the lower dashboard region.
      drawCockpitHud(ctx, rasterBounds, plotPixel, snapshot, colorBehavior);

      // Center reticle hints where future wireframe projection will live.
      const centerX = toRasterCoordinate(logicalWidth * 0.5);
      const centerY = toRasterCoordinate(logicalHeight * 0.42);
      ctx.fillStyle = colorBehavior.palette.reticle;
      drawLine(
        rasterBounds,
        { x: centerX - 10, y: centerY },
        { x: centerX + 10, y: centerY },
        plotPixel,
      );
      drawLine(
        rasterBounds,
        { x: centerX, y: centerY - 10 },
        { x: centerX, y: centerY + 10 },
        plotPixel,
      );
      drawCircle(rasterBounds, { x: centerX, y: centerY }, 8, plotPixel);

      // Heading indicator rotates as simulation state changes each fixed step.
      const headingRadians = (snapshot.playerHeadingDeg * Math.PI) / 180;
      const pointerLength = 54;
      const pointerX = toRasterCoordinate(centerX + Math.cos(headingRadians) * pointerLength);
      const pointerY = toRasterCoordinate(centerY + Math.sin(headingRadians) * pointerLength);
      ctx.fillStyle = colorBehavior.palette.headingPointer;
      drawLine(rasterBounds, { x: centerX, y: centerY }, { x: pointerX, y: pointerY }, plotPixel);

      // Draw textual cockpit overlays as the top-most layer.
      drawCockpitTextLayers(ctx, rasterBounds, textLayerModel, transitionStep.frame, colorBehavior);

      // Keep one compact step counter visible for deterministic loop diagnostics.
      ctx.fillStyle = colorBehavior.palette.diagnostics;
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`STEPS ${frameMetrics.simulatedSteps}`, 8, rasterBounds.height - 6);
    },
  };
}
