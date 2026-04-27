import {expect, test} from "@playwright/test";

// /api/gemini/generate is stubbed so the test runs without a Gemini key.
test("postpartum: generate patient view streams a non-empty summary", async ({page}) => {
    await page.route("**/api/gemini/generate", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                candidates: [{
                    content: {
                        parts: [{
                            text: "Sarah returned to the ED several times after delivery for fever and abdominal pain. The team identified a retained placental fragment and treated it with antibiotics and a D&C. Watch for fevers above 38°C, foul-smelling discharge, or worsening pain — those warrant an immediate return.\n\nSources: n01, n07, n14",
                        }],
                    },
                }],
            }),
        });
    });

    await page.goto("/#/postpartum");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const generate = page.getByRole("button", {name: /generate with gemini/i});
    await expect(generate).toBeVisible();
    await generate.click();

    // SourceChips only renders when status flips to "ready" with parsed note ids.
    // (Page header uses text-rose-700 — don't grep on that class.)
    await expect(page.getByRole("button", {name: /^n\d{2}$/}).first()).toBeVisible({timeout: 30_000});
    await expect(page.getByText(/sources didn't parse/i)).toHaveCount(0);
});
