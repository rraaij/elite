import type { SimulationSnapshot } from "../../game-core/src/index";

/**
 * Generic rectangle used by HUD layout.
 */
export interface HudRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One normalized HUD bar value.
 */
export interface HudBar {
  key: "energy" | "forward-shield" | "aft-shield" | "fuel" | "speed" | "laser-temp";
  label: string;
  value01: number;
  color: string;
  warning: boolean;
}

/**
 * One scanner contact projected into scanner-local pixel coordinates.
 */
export interface ScannerContact {
  slotId: number;
  kind: "ship" | "debris";
  x: number;
  y: number;
  intensity: number;
}

/**
 * Scanner model data.
 */
export interface ScannerModel {
  rect: HudRect;
  contacts: ScannerContact[];
}

/**
 * Compass model data.
 */
export interface CompassModel {
  centerX: number;
  centerY: number;
  radius: number;
  needleX: number;
  needleY: number;
}

/**
 * One indicator lamp in the dashboard.
 */
export interface IndicatorLamp {
  key: "dock" | "safe" | "ecm" | "warp" | "missile";
  label: string;
  active: boolean;
  color: string;
}

/**
 * Full cockpit HUD model generated from snapshot + viewport.
 */
export interface CockpitHudModel {
  dashboardRect: HudRect;
  scanner: ScannerModel;
  compass: CompassModel;
  leftBars: HudBar[];
  rightBars: HudBar[];
  indicators: IndicatorLamp[];
}

/**
 * Clamp one number into an inclusive range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Round one number to integer pixels.
 */
function pixel(value: number): number {
  return Math.round(value);
}

/**
 * Normalize one value into [0, 1] using one max range.
 */
function normalize01(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return clamp(value / max, 0, 1);
}

/**
 * Build a stable scanner rectangle that stays centered in the lower dashboard.
 */
function buildScannerRect(width: number, dashboardRect: HudRect): HudRect {
  const scannerWidth = clamp(pixel(width * 0.3), 120, 210);
  const scannerHeight = clamp(pixel(dashboardRect.height * 0.72), 42, dashboardRect.height - 8);
  return {
    x: pixel(width * 0.5 - scannerWidth * 0.5),
    y: dashboardRect.y + 6,
    width: scannerWidth,
    height: scannerHeight,
  };
}

/**
 * Build scanner contacts from local-universe objects.
 *
 * Mapping notes:
 * - x axis comes from world x
 * - y axis comes from world z depth
 * - contacts outside nominal scanner range are clipped
 */
function buildScannerContacts(
  snapshot: SimulationSnapshot,
  scannerRect: HudRect,
): ScannerContact[] {
  const contacts: ScannerContact[] = [];
  const centerX = scannerRect.x + scannerRect.width * 0.5;
  const bottomY = scannerRect.y + scannerRect.height - 3;
  const scannerRangeX = 2600;
  const scannerRangeZ = 14_000;

  for (const ship of snapshot.gameState.universe.localBubbleShips) {
    // Ignore very distant/behind objects to keep the scanner legible.
    if (ship.position.z < -1000 || ship.position.z > 20_000) {
      continue;
    }

    const normalizedX = clamp(ship.position.x / scannerRangeX, -1, 1);
    const normalizedDepth = clamp(ship.position.z / scannerRangeZ, 0, 1);

    const x = pixel(centerX + normalizedX * (scannerRect.width * 0.46));
    const y = pixel(bottomY - normalizedDepth * (scannerRect.height * 0.88));

    contacts.push({
      slotId: ship.slotId,
      kind: ship.kind,
      x: clamp(x, scannerRect.x, scannerRect.x + scannerRect.width - 1),
      y: clamp(y, scannerRect.y, scannerRect.y + scannerRect.height - 1),
      intensity: ship.kind === "ship" ? 1 : 0.65,
    });
  }

  // Stable ordering ensures deterministic rendering + tests.
  contacts.sort((left, right) => left.slotId - right.slotId);
  return contacts;
}

/**
 * Build compass model that points to nearest front object, or station fallback.
 */
function buildCompass(snapshot: SimulationSnapshot, dashboardRect: HudRect): CompassModel {
  const radius = clamp(pixel(dashboardRect.height * 0.22), 12, 24);
  const centerX = pixel(dashboardRect.x + dashboardRect.width * 0.5);
  const centerY = pixel(dashboardRect.y + dashboardRect.height * 0.82);

  let targetX = 0;
  let targetZ = Math.max(300, snapshot.gameState.flight.stationDistance);
  let bestDepth = Number.POSITIVE_INFINITY;

  for (const ship of snapshot.gameState.universe.localBubbleShips) {
    if (ship.kind !== "ship") {
      continue;
    }
    if (ship.position.z <= 0) {
      continue;
    }
    if (ship.position.z < bestDepth) {
      bestDepth = ship.position.z;
      targetX = ship.position.x;
      targetZ = ship.position.z;
    }
  }

  // Compass uses horizontal angular displacement in player-forward space.
  const angle = Math.atan2(targetX, targetZ);
  const needleLength = radius * 0.82;
  const needleX = pixel(centerX + Math.sin(angle) * needleLength);
  const needleY = pixel(centerY - Math.cos(angle) * needleLength);

  return {
    centerX,
    centerY,
    radius,
    needleX,
    needleY,
  };
}

/**
 * Build normalized bar values for both dashboard sides.
 */
function buildBars(snapshot: SimulationSnapshot): { leftBars: HudBar[]; rightBars: HudBar[] } {
  const energy = normalize01(snapshot.gameState.flight.energy, 100);
  const forwardShield = normalize01(snapshot.gameState.flight.forwardShield, 100);
  const aftShield = normalize01(snapshot.gameState.flight.aftShield, 100);
  const fuel = normalize01(snapshot.gameState.commander.fuelTenths, 70);
  const speed = normalize01(snapshot.gameState.flight.speed, 120);
  const laserTemp = normalize01(snapshot.gameState.flow.laserTemperature, 255);

  return {
    leftBars: [
      {
        key: "energy",
        label: "ENG",
        value01: energy,
        color: "#7ee8ff",
        warning: energy < 0.22,
      },
      {
        key: "forward-shield",
        label: "FSH",
        value01: forwardShield,
        color: "#72f9b3",
        warning: forwardShield < 0.22,
      },
      {
        key: "aft-shield",
        label: "ASH",
        value01: aftShield,
        color: "#72f9b3",
        warning: aftShield < 0.22,
      },
    ],
    rightBars: [
      {
        key: "fuel",
        label: "FUL",
        value01: fuel,
        color: "#ffe27a",
        warning: fuel < 0.2,
      },
      {
        key: "speed",
        label: "SPD",
        value01: speed,
        color: "#9ec2ff",
        warning: speed > 0.9,
      },
      {
        key: "laser-temp",
        label: "TMP",
        value01: laserTemp,
        color: "#ff9d7a",
        warning: laserTemp > 0.78,
      },
    ],
  };
}

/**
 * Build indicator lamps that reflect key flight/system states.
 */
function buildIndicators(snapshot: SimulationSnapshot): IndicatorLamp[] {
  return [
    {
      key: "dock",
      label: "DOCK",
      active: snapshot.gameState.views.isDocked,
      color: "#a5ffd7",
    },
    {
      key: "safe",
      label: "SAFE",
      active: snapshot.gameState.views.inStationSafeZone,
      color: "#8fd6ff",
    },
    {
      key: "ecm",
      label: "ECM",
      active: snapshot.gameState.views.ecmEnabled,
      color: "#fff19f",
    },
    {
      key: "warp",
      label: "WARP",
      active: snapshot.gameState.flight.warpEngaged,
      color: "#cfb0ff",
    },
    {
      key: "missile",
      label: "MSL",
      active: snapshot.gameState.flight.missileArmed,
      color: "#ffb0c6",
    },
  ];
}

/**
 * Build the full cockpit HUD model from one snapshot and viewport.
 */
export function createCockpitHudModel(
  snapshot: SimulationSnapshot,
  viewport: { width: number; height: number },
): CockpitHudModel {
  const width = Math.max(1, pixel(viewport.width));
  const height = Math.max(1, pixel(viewport.height));

  const dashboardTop = pixel(height * 0.66);
  const dashboardRect: HudRect = {
    x: 0,
    y: clamp(dashboardTop, 0, height - 1),
    width,
    height: Math.max(1, height - clamp(dashboardTop, 0, height - 1)),
  };

  const scannerRect = buildScannerRect(width, dashboardRect);
  const scanner: ScannerModel = {
    rect: scannerRect,
    contacts: buildScannerContacts(snapshot, scannerRect),
  };

  return {
    dashboardRect,
    scanner,
    compass: buildCompass(snapshot, dashboardRect),
    ...buildBars(snapshot),
    indicators: buildIndicators(snapshot),
  };
}
