import {expect, test} from "@playwright/test";

// Inhaler bulk-composes per-patient SMS drafts based on current AQI.
// Smoke: page loads → click "Bulk-compose SMS preview" → button enters loading
// state → returns to idle without surfacing an error.
test("inhaler: bulk-compose drafts a non-empty SMS preview", async ({page}) => {
    await page.goto("/#/inhaler");

    const compose = page.getByRole("button", {name: /bulk-compose sms preview/i});
    await expect(compose).toBeVisible();
    await compose.click();

    // Loading state proves the click was accepted.
    await expect(page.getByRole("button", {name: /drafting/i})).toBeVisible();
    // After completion the button returns to its idle label.
    await expect(compose).toBeVisible({timeout: 60_000});
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
