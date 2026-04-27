import {expect, test} from "@playwright/test";

// /api/gemini/generate is stubbed so the test runs without a Gemini key.
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

    // Bulk-compose button only renders inside the pulmonologist persona.
    await page.getByRole("tab", {name: /millennial pulmonologist/i}).click();

    const compose = page.getByRole("button", {name: /bulk-compose sms preview/i});
    await expect(compose).toBeVisible();
    await compose.click();

    await expect(page.getByRole("button", {name: /drafting/i})).toBeVisible();
    await expect(compose).toBeVisible({timeout: 60_000});
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
