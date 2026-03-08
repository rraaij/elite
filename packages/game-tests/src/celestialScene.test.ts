import { describe, expect, it } from "vitest";
import { buildCelestialScene } from "../../game-renderer/src/index";

/**
 * Base config helper used by multiple tests.
 */
function createBaseConfig() {
  return {
    viewport: {
      width: 320,
      height: 200,
    },
    rngState: 0x5a7c_1d2e,
    tick: 600,
    headingDeg: 90,
    speed: 24,
    stationDistance: 1800,
  };
}

describe("celestial scene generation", () => {
  it("is deterministic for identical inputs", () => {
    const config = createBaseConfig();

    const sceneA = buildCelestialScene(config);
    const sceneB = buildCelestialScene(config);

    expect(sceneA).toEqual(sceneB);
  });

  it("keeps all stars within viewport bounds", () => {
    const config = createBaseConfig();
    const scene = buildCelestialScene(config);

    expect(scene.stars.length).toBeGreaterThanOrEqual(64);
    expect(scene.stars.length).toBeLessThanOrEqual(220);
    expect(
      scene.stars.every(
        (star) =>
          star.x >= 0 &&
          star.y >= 0 &&
          star.x < config.viewport.width &&
          star.y < config.viewport.height,
      ),
    ).toBe(true);
  });

  it("changes starfield positions when heading changes", () => {
    const base = createBaseConfig();
    const sceneA = buildCelestialScene({
      ...base,
      headingDeg: 0,
    });
    const sceneB = buildCelestialScene({
      ...base,
      headingDeg: 180,
    });

    const changedStarCount = sceneA.stars.reduce((count, star, index) => {
      const counterpart = sceneB.stars[index];
      if (!counterpart) {
        return count;
      }
      return star.x !== counterpart.x || star.y !== counterpart.y ? count + 1 : count;
    }, 0);

    expect(changedStarCount).toBeGreaterThan(10);
  });

  it("changes star brightness over time for twinkle behavior", () => {
    const base = createBaseConfig();
    const sceneA = buildCelestialScene({
      ...base,
      tick: 300,
    });
    const sceneB = buildCelestialScene({
      ...base,
      tick: 420,
    });

    const changedBrightnessCount = sceneA.stars.reduce((count, star, index) => {
      const counterpart = sceneB.stars[index];
      if (!counterpart) {
        return count;
      }
      return Math.abs(star.brightness - counterpart.brightness) > 0.001 ? count + 1 : count;
    }, 0);

    expect(changedBrightnessCount).toBeGreaterThan(10);
  });

  it("grows apparent planet size as station distance decreases", () => {
    const base = createBaseConfig();
    const farScene = buildCelestialScene({
      ...base,
      stationDistance: 5000,
    });
    const nearScene = buildCelestialScene({
      ...base,
      stationDistance: 200,
    });

    expect(nearScene.planet.radius).toBeGreaterThan(farScene.planet.radius);
  });

  it("produces valid sun and planet discs for tiny viewports", () => {
    const scene = buildCelestialScene({
      ...createBaseConfig(),
      viewport: {
        width: 40,
        height: 30,
      },
    });

    expect(scene.planet.radius).toBeGreaterThan(0);
    expect(scene.sun.radius).toBeGreaterThan(0);
    expect(scene.planet.centerX).toBeGreaterThan(-scene.planet.radius);
    expect(scene.sun.centerY).toBeLessThan(30 + scene.sun.radius);
  });
});
