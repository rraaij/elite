import { expect, test } from "@playwright/test";

const EXPECTED_CANVAS_HASH = "6d4e8952";

test("matches deterministic visual golden hash for baseline scene", async ({ page }) => {
	test.skip(
		test.info().project.name !== "chromium",
		"Visual golden probe is enforced in chromium to reduce cross-engine raster noise.",
	);

	await page.goto("/?scenario=empty&variant=gma85-ntsc&timing=ntsc&seed=305419896&debug=0");
	await expect(page.getByText("Elite Migration Runtime")).toBeVisible();
	await page.waitForFunction(() => typeof window.__ELITE_VISUAL_GOLDEN_PROBE__ === "function");

	const probe = await page.evaluate(() => {
		const fn = window.__ELITE_VISUAL_GOLDEN_PROBE__;
		if (!fn) {
			throw new Error("Missing __ELITE_VISUAL_GOLDEN_PROBE__ hook.");
		}
		return fn();
	});

	expect(probe.tick).toBe(600);
	expect(probe.scenarioId).toBe("empty");
	expect(probe.seed).toBe(0x12345678);
	expect(probe.width).toBe(960);
	expect(probe.height).toBe(540);
	expect(probe.hash).toBe(EXPECTED_CANVAS_HASH);
});
