import {expect, test} from "@playwright/test";

// PostVisit's primary input is the Web Speech API, which isn't available
// in headless Chromium. Smoke target: route renders, a recording control
// is present (in either "listening" or "unsupported" state), no error
// surface visible.
test("postvisit: route renders without errors", async ({page}) => {
    await page.goto("/#/postvisit");

    // Demo description text or any interactive button.
    const button = page.getByRole("button").first();
    await expect(button).toBeVisible();
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
