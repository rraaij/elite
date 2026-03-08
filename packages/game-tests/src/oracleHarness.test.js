import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ORACLE_SCENARIOS, runOracleScenario } from "./oracleHarness.js";

function readGoldenCapture(scenarioId) {
	const root = path.resolve(process.cwd(), "..", "..", "packages", "game-tests", "oracle");
	const file = path.join(root, `${scenarioId}.json`);
	return JSON.parse(readFileSync(file, "utf8"));
}
describe("oracle harness", () => {
	it("defines deterministic seeded scripted playthroughs", () => {
		expect(ORACLE_SCENARIOS.length).toBeGreaterThanOrEqual(2);
		for (const scenario of ORACLE_SCENARIOS) {
			expect(scenario.seed).toBeGreaterThanOrEqual(0);
			expect(scenario.totalFrames).toBeGreaterThan(60);
			expect(scenario.keyframes.length).toBeGreaterThan(0);
		}
	});
	it("matches per-frame golden outputs for all scripted scenarios", () => {
		for (const scenario of ORACLE_SCENARIOS) {
			const actual = runOracleScenario(scenario);
			const golden = readGoldenCapture(scenario.id);
			expect(actual).toEqual(golden);
		}
	});
});
