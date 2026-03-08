export { createCanvasRenderer } from "./canvasRenderer";
export type {
  CanvasRenderer,
  CanvasRendererConfig,
  CanvasRendererWireframeConfig,
} from "./canvasRenderer";

export { drawCircle, drawLine, plotPixel } from "./rasterPrimitives";
export type { PixelPlotter, RasterBounds, RasterPoint } from "./rasterPrimitives";

export { createCockpitHudModel } from "./cockpitHud";
export type {
  CockpitHudModel,
  CompassModel,
  HudBar,
  HudRect,
  IndicatorLamp,
  ScannerContact,
  ScannerModel,
} from "./cockpitHud";

export {
  createCockpitColorBehavior,
  createHudFlashState,
  resolveCockpitAlertLevel,
  resolveHudBarFillColor,
  resolveIndicatorBlinkOn,
  resolveIndicatorLampColor,
  resolveOverlayToneColor,
  resolveScannerContactColor,
} from "./cockpitColorBehavior";
export type {
  CockpitAlertLevel,
  CockpitColorBehavior,
  CockpitPalette,
  HudFlashState,
} from "./cockpitColorBehavior";

export {
  createCockpitTextLayerModel,
  createViewPresentationKey,
  createViewTransitionTracker,
  stepViewTransitionTracker,
} from "./viewTextOverlay";
export type {
  CockpitTextLayerModel,
  OverlayTextLine,
  OverlayTextTone,
  ViewTransitionFrame,
  ViewTransitionTracker,
} from "./viewTextOverlay";

export { buildCelestialScene } from "./celestialScene";
export type {
  CelestialBodyDisc,
  CelestialScene,
  CelestialSceneConfig,
  CelestialViewport,
  StarSample,
} from "./celestialScene";

export { projectWireframeScene } from "./wireframeProjection";
export type {
  ProjectedWireframeSegment,
  WireframeBlueprint,
  WireframeEdge,
  WireframeProjectionConfig,
  WireframeProjectionResult,
  WireframeShipInstance,
  WireframeVertex,
  WireframeViewport,
} from "./wireframeProjection";
