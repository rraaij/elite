import { expect, test } from "@playwright/test";

test("supports remapping menu toggle key from settings", async ({ page }) => {
	await page.goto("/");

	await expect(page.getByText("Runtime Menu")).toBeVisible();

	const menuBindButton = page.getByRole("button", { name: "Bind Menu Toggle" });
	await expect(menuBindButton).toBeVisible();
	await expect(menuBindButton).toHaveText("ESCAPE");

	await menuBindButton.click();
	await expect(menuBindButton).toHaveText("Press Key...");

	await page.keyboard.press("KeyQ");
	await expect(menuBindButton).toHaveText("Q");

	// Persisted mapping should survive reload.
	await page.reload();
	await expect(page.getByText("Runtime Menu")).toBeVisible();
	await expect(page.getByRole("button", { name: "Bind Menu Toggle" })).toHaveText("Q");

	// Old default binding should no longer toggle the menu.
	await page.keyboard.press("Escape");
	await expect(page.getByText("Runtime Menu")).toBeVisible();
});
