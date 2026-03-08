import { expect, test } from "@playwright/test";

const EXPECTED_HASH = "b65ab03d";

test("determinism probe hash stays stable", async ({ page }) => {
	await page.goto("/?debug=0");

	await expect(page.getByText("Elite Migration Runtime")).toBeVisible();
	await page.waitForFunction(() => typeof window.__ELITE_DETERMINISM_PROBE__ === "function");

	const probe = await page.evaluate(() => {
		const fn = window.__ELITE_DETERMINISM_PROBE__;
		if (!fn) {
			throw new Error("Missing __ELITE_DETERMINISM_PROBE__ hook.");
		}
		return fn();
	});

	expect(probe.tick).toBe(600);
	expect(probe.scenarioId).toBe("empty");
	expect(probe.seed).toBe(0x12345678);
	expect(probe.hash).toBe(EXPECTED_HASH);
});
