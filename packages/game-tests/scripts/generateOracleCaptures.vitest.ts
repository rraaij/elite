import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { ORACLE_SCENARIOS, runOracleScenario } from "../src/oracleHarness.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const oracleDir = path.join(root, "oracle");

describe("oracle capture generator", () => {
	it("writes deterministic per-frame golden captures", () => {
		mkdirSync(oracleDir, { recursive: true });
		for (const scenario of ORACLE_SCENARIOS) {
			const capture = runOracleScenario(scenario);
			const outputPath = path.join(oracleDir, `${scenario.id}.json`);
			writeFileSync(outputPath, `${JSON.stringify(capture, null, 2)}\n`, "utf8");
		}
	});
});
