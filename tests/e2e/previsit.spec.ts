import {expect, test} from "@playwright/test";

// PreVisit's full LLM flow ("Draft doctor summary") is gated behind a
// completed multi-turn intake conversation that's hard to drive headlessly.
// Smoke target: page renders without crashing, an interactive control is
// present, no error surface is visible.
test("previsit: intake UI renders without errors", async ({page}) => {
    await page.goto("/#/previsit");

    // Some interactive control exists (textarea, input, or send button).
    const interactive = page
        .locator("textarea, input[type='text'], button[type='submit'], button[type='button']")
        .first();
    await expect(interactive).toBeVisible();
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
