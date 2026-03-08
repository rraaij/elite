import { describe, expect, it } from "vitest";
import { resolveMusicTrackForSnapshot } from "../../game-audio/src/index.js";

function makeSnapshot(phase: "boot" | "title" | "docked" | "in-space", isDocked: boolean) {
	return {
		gameState: {
			flow: { phase },
			views: { isDocked },
		},
	};
}

describe("music state policy", () => {
	it("uses title track during boot/title flow", () => {
		expect(resolveMusicTrackForSnapshot(makeSnapshot("boot", false))).toBe("title");
		expect(resolveMusicTrackForSnapshot(makeSnapshot("title", false))).toBe("title");
	});

	it("uses docking track while docked", () => {
		expect(resolveMusicTrackForSnapshot(makeSnapshot("docked", true))).toBe("docking");
		expect(resolveMusicTrackForSnapshot(makeSnapshot("in-space", true))).toBe("docking");
	});

	it("stops music during in-flight gameplay", () => {
		expect(resolveMusicTrackForSnapshot(makeSnapshot("in-space", false))).toBeNull();
	});
});
