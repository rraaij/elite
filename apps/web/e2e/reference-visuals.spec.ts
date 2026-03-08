import { expect, test } from "@playwright/test";

const EXPECTED_SCENE_HASHES: Record<string, string> = {
	title: "33be055f",
	cockpit: "6d4e8952",
	charts: "4fdc78de",
	combat: "9739fd0c",
};

test("matches deterministic reference visual hashes", async ({ page }) => {
	test.skip(
		test.info().project.name !== "chromium",
		"Reference visual hashes are enforced in chromium to reduce cross-engine raster noise.",
	);

	await page.goto("/?scenario=empty&variant=gma85-ntsc&timing=ntsc&seed=305419896&debug=0");
	await expect(page.getByText("Elite Migration Runtime")).toBeVisible();
	await page.waitForFunction(() => typeof window.__ELITE_REFERENCE_VISUAL_PROBE__ === "function");

	const probe = await page.evaluate(() => {
		const fn = window.__ELITE_REFERENCE_VISUAL_PROBE__;
		if (!fn) {
			throw new Error("Missing __ELITE_REFERENCE_VISUAL_PROBE__ hook.");
		}
		return fn();
	});
	expect(probe.seed).toBe(0x12345678);
	for (const scene of probe.scenes) {
		expect(scene.width).toBe(960);
		expect(scene.height).toBe(540);
		expect(scene.hash).toBe(EXPECTED_SCENE_HASHES[scene.sceneId]);
	}
});
