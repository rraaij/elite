import { expect, test } from "@playwright/test";

test("keeps average frame delta under budget in smoke run", async ({ page }) => {
	await page.goto("/");

	await expect(page.getByText("Elite Migration Runtime")).toBeVisible();

	// Sample requestAnimationFrame deltas from the browser runtime directly.
	const sample = await page.evaluate(async (): Promise<{ average: number; p95: number }> => {
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

	// Conservative thresholds to avoid CI noise while still detecting severe regressions.
	expect(sample.average).toBeLessThan(34);
	expect(sample.p95).toBeLessThan(50);
});
