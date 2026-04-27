import {expect, test} from "@playwright/test";

// Multi-turn intake is hard to drive headlessly — smoke-test only.
test("previsit: intake UI renders without errors", async ({page}) => {
    await page.goto("/#/previsit");

    const interactive = page
        .locator("textarea, input[type='text'], button[type='submit'], button[type='button']")
        .first();
    await expect(interactive).toBeVisible();
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
