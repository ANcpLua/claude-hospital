import {expect, test} from "@playwright/test";

// Web Speech API isn't available in headless Chromium — smoke-test only.
test("postvisit: route renders without errors", async ({page}) => {
    await page.goto("/#/postvisit");

    const button = page.getByRole("button").first();
    await expect(button).toBeVisible();
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
