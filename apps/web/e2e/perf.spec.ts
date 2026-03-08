import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function sampleFrameDeltaStats(page: Page) {
	await page.goto("/");

	await expect(page.getByText("Elite Migration Runtime")).toBeVisible();

	// Sample requestAnimationFrame deltas from the browser runtime directly.
	return page.evaluate(async (): Promise<{ average: number; p95: number }> => {
		const deltas: number[] = [];
		let previous: number | null = null;
		const sampleFrames = 180;

		await new Promise<void>((resolve) => {
			const step = (timestamp: number): void => {
				if (previous !== null) {
					deltas.push(timestamp - previous);
				}
				previous = timestamp;
				if (deltas.length >= sampleFrames) {
					resolve();
					return;
				}
				window.requestAnimationFrame(step);
			};

			window.requestAnimationFrame(step);
		});

		const sorted = [...deltas].sort((a, b) => a - b);
		const average = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
		const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? average;
		return { average, p95 };
	});
}

test("keeps desktop average frame delta under budget in smoke run", async ({ page }) => {
	test.skip(
		test.info().project.name !== "chromium",
		"Desktop perf threshold gate is enforced in chromium to reduce cross-engine CI noise.",
	);

	const sample = await sampleFrameDeltaStats(page);

	// Conservative thresholds to avoid CI noise while still detecting severe regressions.
	expect(sample.average).toBeLessThan(34);
	expect(sample.p95).toBeLessThan(50);
});

test("keeps mobile average frame delta under budget in smoke run", async ({ page }) => {
	test.skip(
		test.info().project.name !== "mobile-chrome",
		"Mobile perf threshold gate is enforced in mobile-chrome to avoid cross-engine noise.",
	);

	const sample = await sampleFrameDeltaStats(page);

	// Mobile emulation has less strict thresholds than desktop but still catches regressions.
	expect(sample.average).toBeLessThan(45);
	expect(sample.p95).toBeLessThan(65);
});
