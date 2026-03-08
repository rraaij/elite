import { describe, expect, it } from "vitest";
import {
  projectWireframeScene,
  type WireframeBlueprint,
  type WireframeShipInstance,
} from "../../game-renderer/src/index";

/**
 * Build one minimal blueprint with one edge.
 */
function createSingleEdgeBlueprint(
  shipId: number,
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
): WireframeBlueprint {
  return {
    shipId,
    vertices: [start, end],
    edges: [{ vertex1: 0, vertex2: 1 }],
  };
}

/**
 * Build a deterministic blueprint resolver from array inputs.
 */
function createBlueprintResolver(
  blueprints: readonly WireframeBlueprint[],
): (blueprintId: number) => WireframeBlueprint | null {
  const map = new Map<number, WireframeBlueprint>();
  for (const blueprint of blueprints) {
    map.set(blueprint.shipId, blueprint);
  }

  return (blueprintId: number): WireframeBlueprint | null => map.get(blueprintId) ?? null;
}

describe("wireframe projection pipeline", () => {
  it("projects a front-facing edge with perspective scaling", () => {
    const blueprint = createSingleEdgeBlueprint(1, { x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });

    const ships: WireframeShipInstance[] = [
      {
        slotId: 1,
        kind: "ship",
        blueprintId: 1,
        position: { x: 0, y: 0, z: 200 },
      },
    ];

    const result = projectWireframeScene({
      ships,
      headingDeg: 0,
      modelScale: 1,
      resolveBlueprintById: createBlueprintResolver([blueprint]),
      viewport: {
        width: 200,
        height: 100,
        focalLengthPx: 100,
        nearPlaneZ: 50,
      },
    });

    expect(result.segments).toHaveLength(1);
    const segment = result.segments[0];
    expect(segment).toBeDefined();
    expect(segment?.x0 ?? 0).toBeCloseTo(95, 4);
    expect(segment?.x1 ?? 0).toBeCloseTo(105, 4);
    expect(segment?.y0 ?? 0).toBeCloseTo(50, 4);
    expect(segment?.y1 ?? 0).toBeCloseTo(50, 4);
    expect(result.diagnostics.edgesCulledByNearPlane).toBe(0);
    expect(result.diagnostics.edgesCulledByViewport).toBe(0);
  });

  it("clips crossing edges against the near plane", () => {
    const blueprint = createSingleEdgeBlueprint(
      2,
      { x: -20, y: 0, z: -20 },
      { x: 20, y: 0, z: 20 },
    );

    const result = projectWireframeScene({
      ships: [
        {
          slotId: 5,
          kind: "ship",
          blueprintId: 2,
          position: { x: 0, y: 0, z: 5 },
        },
      ],
      headingDeg: 0,
      modelScale: 1,
      resolveBlueprintById: createBlueprintResolver([blueprint]),
      viewport: {
        width: 300,
        height: 200,
        focalLengthPx: 100,
        nearPlaneZ: 10,
      },
    });

    expect(result.segments).toHaveLength(1);
    const segment = result.segments[0];
    expect(segment).toBeDefined();
    expect(segment?.x0 ?? 0).toBeCloseTo(200, 4);
    expect(segment?.x1 ?? 0).toBeCloseTo(230, 4);
    expect(segment?.y0 ?? 0).toBeCloseTo(100, 4);
    expect(segment?.y1 ?? 0).toBeCloseTo(100, 4);
    expect(result.diagnostics.edgesCulledByNearPlane).toBe(0);
  });

  it("rejects segments fully behind the near plane", () => {
    const blueprint = createSingleEdgeBlueprint(
      3,
      { x: -20, y: 0, z: -30 },
      { x: 20, y: 0, z: -20 },
    );

    const result = projectWireframeScene({
      ships: [
        {
          slotId: 9,
          kind: "ship",
          blueprintId: 3,
          position: { x: 0, y: 0, z: 0 },
        },
      ],
      headingDeg: 0,
      modelScale: 1,
      resolveBlueprintById: createBlueprintResolver([blueprint]),
      viewport: {
        width: 120,
        height: 80,
        focalLengthPx: 80,
        nearPlaneZ: 10,
      },
    });

    expect(result.segments).toHaveLength(0);
    expect(result.diagnostics.edgesCulledByNearPlane).toBe(1);
  });

  it("clips projected segments to viewport edges", () => {
    const blueprint = createSingleEdgeBlueprint(
      4,
      { x: -200, y: 0, z: 100 },
      { x: 200, y: 0, z: 100 },
    );

    const result = projectWireframeScene({
      ships: [
        {
          slotId: 2,
          kind: "ship",
          blueprintId: 4,
          position: { x: 0, y: 0, z: 0 },
        },
      ],
      headingDeg: 0,
      modelScale: 1,
      resolveBlueprintById: createBlueprintResolver([blueprint]),
      viewport: {
        width: 100,
        height: 100,
        focalLengthPx: 100,
        nearPlaneZ: 10,
      },
    });

    expect(result.segments).toHaveLength(1);
    const segment = result.segments[0];
    expect(segment).toBeDefined();
    expect(segment?.x0 ?? -1).toBeCloseTo(0, 4);
    expect(segment?.x1 ?? -1).toBeCloseTo(99, 4);
    expect(segment?.y0 ?? -1).toBeCloseTo(50, 4);
    expect(segment?.y1 ?? -1).toBeCloseTo(50, 4);
  });

  it("emits segments in deterministic slot-id order", () => {
    const blueprint = createSingleEdgeBlueprint(5, { x: -5, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });

    const result = projectWireframeScene({
      ships: [
        {
          slotId: 9,
          kind: "ship",
          blueprintId: 5,
          position: { x: 20, y: 0, z: 140 },
        },
        {
          slotId: 2,
          kind: "ship",
          blueprintId: 5,
          position: { x: -20, y: 0, z: 140 },
        },
      ],
      headingDeg: 0,
      modelScale: 1,
      resolveBlueprintById: createBlueprintResolver([blueprint]),
      viewport: {
        width: 200,
        height: 120,
        focalLengthPx: 100,
        nearPlaneZ: 10,
      },
    });

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.slotId).toBe(2);
    expect(result.segments[1]?.slotId).toBe(9);
  });
});
