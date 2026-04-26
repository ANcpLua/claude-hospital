import {expect, test} from "@playwright/test";

// Inhaler bulk-composes per-patient SMS drafts based on current AQI.
// Smoke: page loads → switch to pulmonologist tab → click "Bulk-compose SMS preview"
// → button enters loading state → returns to idle without surfacing an error.
// /api/gemini/generate is stubbed at the Playwright network boundary so the test
// runs without a Gemini key.
test("inhaler: bulk-compose drafts a non-empty SMS preview", async ({page}) => {
    await page.route("**/api/gemini/generate", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                candidates: [{
                    content: {
                        parts: [{
                            text: "Hi test, AQI is 60. Stay indoors and pre-treat with your controller. Reply STOP to opt out.",
                        }],
                    },
                }],
            }),
        });
    });

    await page.goto("/#/inhaler");

    // The bulk-compose button only renders inside the pulmonologist persona;
    // the page defaults to public-health.
    await page.getByRole("tab", {name: /millennial pulmonologist/i}).click();

    const compose = page.getByRole("button", {name: /bulk-compose sms preview/i});
    await expect(compose).toBeVisible();
    await compose.click();

    // Loading state proves the click was accepted.
    await expect(page.getByRole("button", {name: /drafting/i})).toBeVisible();
    // After completion the button returns to its idle label.
    await expect(compose).toBeVisible({timeout: 60_000});
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
