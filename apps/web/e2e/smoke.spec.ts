import { expect, test } from "@playwright/test";

test("loads the migration app shell", async ({ page }) => {
  await page.goto("/");

  // A single stable heading gives us a lightweight end-to-end smoke signal.
  await expect(page.getByText("Elite Migration Runtime")).toBeVisible();
});
