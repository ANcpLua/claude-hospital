import {expect, test} from "@playwright/test";

// Postpartum collapses 25 synthetic notes into a patient-readable summary
// or ID consult via streaming Gemini. Smoke: idle → click → streamed body.
test("postpartum: generate patient view streams a non-empty summary", async ({page}) => {
    await page.goto("/#/postpartum");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const generate = page.getByRole("button", {name: /generate with gemini/i});
    await expect(generate).toBeVisible();
    await generate.click();

    // SummaryBody renders (status leaves "idle") within Gemini's response window.
    // We assert the source-citation chips appear, which only happens when the
    // streamed text has been fully parsed into rendered + sources.
    await expect(page.getByText(/sources?:/i)).toBeVisible({timeout: 30_000});
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
