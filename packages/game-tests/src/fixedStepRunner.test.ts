import { describe, expect, it } from "vitest";
import { createEmptySimulation, createFixedStepRunner } from "../../game-core/src/index";

describe("fixed step runner", () => {
  it("advances simulation deterministically for equal frame times", () => {
    // Two independent simulations should stay byte-for-byte equivalent
    // when fed identical frame timestamps and deterministic seeds.
    const simA = createEmptySimulation({ scenarioId: "empty", seed: 1234 });
    const simB = createEmptySimulation({ scenarioId: "empty", seed: 1234 });

    const runnerA = createFixedStepRunner({
      simulation: simA,
      stepMs: 1000 / 60,
      maxCatchUpSteps: 8,
    });
    const runnerB = createFixedStepRunner({
      simulation: simB,
      stepMs: 1000 / 60,
      maxCatchUpSteps: 8,
    });

    const frameTimes = [0, 16.67, 33.34, 50.01, 66.68, 83.35, 100.02];
    for (const time of frameTimes) {
      runnerA.frame(time);
      runnerB.frame(time);
    }

    expect(simA.snapshot()).toEqual(simB.snapshot());
  });
});
