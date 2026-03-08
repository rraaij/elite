import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ORACLE_SCENARIOS, runOracleScenario } from "./oracleHarness.js";

interface GoldenCapture {
	scenarioId: string;
	seed: number;
	totalFrames: number;
	stepMs: number;
	frames: Array<{
		frame: number;
		tick: number;
		rngState: number;
		headingDegX100: number;
		speedX100: number;
		phase: string;
		isDocked: boolean;
		stationDistanceX10: number;
		shipCount: number;
		energy: number;
		forwardShield: number;
		aftShield: number;
		missileArmed: boolean;
		ecmEnabled: boolean;
		creditsCenticredits: number;
	}>;
}

function readGoldenCapture(scenarioId: string): GoldenCapture {
	const root = path.resolve(process.cwd(), "..", "..", "packages", "game-tests", "oracle");
	const file = path.join(root, `${scenarioId}.json`);
	return JSON.parse(readFileSync(file, "utf8")) as GoldenCapture;
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
