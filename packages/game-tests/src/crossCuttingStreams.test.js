import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function collectFilesRecursive(root, extension) {
	const output = [];
	const stack = [root];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		for (const entry of readdirSync(current)) {
			const resolved = path.join(current, entry);
			const stats = statSync(resolved);
			if (stats.isDirectory()) {
				stack.push(resolved);
				continue;
			}
			if (resolved.endsWith(extension)) {
				output.push(resolved);
			}
		}
	}
	return output.sort();
}
function toRepoRoot() {
	// `vitest` runs in `packages/game-tests`, so `../..` resolves to repo root.
	return path.resolve(process.cwd(), "..", "..");
}
function toRepoRelative(absPath) {
	return path.relative(toRepoRoot(), absPath).replaceAll("\\", "/");
}
describe("cross-cutting streams", () => {
	it("X1 parity coverage: all required subsystem parity suites exist", () => {
		const testRoot = path.resolve(toRepoRoot(), "packages/game-tests/src");
		const requiredSuites = [
			"audioCuePolicy.test.ts",
			"musicParser.test.ts",
			"musicStatePolicy.test.ts",
			"byteMath.test.ts",
			"dorndRng.test.ts",
			"stateModel.test.ts",
			"fixedStepRunner.test.ts",
			"simulationSnapshot.test.ts",
			"replayBaseline.test.ts",
			"timingProfiles.test.ts",
			"tokenExpansion.test.ts",
			"saveState.test.ts",
			"legacyCommanderImport.test.ts",
			"rasterPrimitives.test.ts",
			"wireframeProjection.test.ts",
			"celestialScene.test.ts",
			"cockpitHud.test.ts",
			"cockpitColorBehavior.test.ts",
			"viewTextOverlay.test.ts",
			"missionTextRenderer.test.ts",
		];
		for (const suite of requiredSuites) {
			const fullPath = path.join(testRoot, suite);
			expect(
				statSync(fullPath).isFile(),
				`Missing required parity suite: ${toRepoRelative(fullPath)}`,
			).toBe(true);
			const text = readFileSync(fullPath, "utf8");
			expect(
				/\b(it|test)\s*\(/.test(text),
				`Suite has no test cases: ${toRepoRelative(fullPath)}`,
			).toBe(true);
		}
	});
	it("X2 variant abstraction: variant ids are confined to variant-aware modules", () => {
		const repoRoot = toRepoRoot();
		const variantPatterns = ["gma85-ntsc", "gma86-pal", "source-disk-build", "source-disk-files"];
		const scanRoots = [
			"apps/web/src",
			"packages/game-core/src",
			"packages/game-renderer/src",
			"packages/game-audio/src",
			"packages/game-input/src",
		].map((segment) => path.resolve(repoRoot, segment));
		const allowedLiteralFiles = new Set([
			"apps/web/src/main.ts",
			"packages/game-core/src/timingProfiles.ts",
		]);
		const hits = [];
		for (const scanRoot of scanRoots) {
			for (const file of collectFilesRecursive(scanRoot, ".ts")) {
				const relative = toRepoRelative(file);
				if (allowedLiteralFiles.has(relative)) {
					continue;
				}
				const text = readFileSync(file, "utf8");
				const lines = text.split("\n");
				for (let index = 0; index < lines.length; index += 1) {
					const line = lines[index];
					if (!line) {
						continue;
					}
					for (const pattern of variantPatterns) {
						if (line.includes(pattern)) {
							hits.push({
								file: relative,
								pattern,
								line: index + 1,
							});
						}
					}
				}
			}
		}
		expect(hits).toEqual([]);
	});
});
