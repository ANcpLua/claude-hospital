import {expect, test} from "@playwright/test";

// Happy path: the WellBaby route should generate an LLM narrative on click,
// and clicking Regenerate must produce a fresh response (cache bypass).
// /api/gemini/generate is stubbed at the Playwright network boundary so the
// test runs without a Gemini key.

test("well-baby: generate then regenerate produces non-template narratives", async ({page}) => {
    await page.route("**/api/gemini/generate", async (route) => {
        // Tiny delay so React 19 doesn't batch the loading→ready transition into
        // a single render — the test asserts the "Drafting…" label is visible.
        await new Promise((resolve) => setTimeout(resolve, 100));
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify({
                                assessment: "Term AGA newborn delivered via SVD with Apgars 9/9 and unremarkable adaptation. Exam reveals a vigorous, well-perfused neonate with appropriate tone, normal respiratory effort, and no dysmorphic features identified on initial nursery assessment.",
                                plan: "Routine nursery care: vitamin K IM and erythromycin eye prophylaxis, hepatitis B vaccine prior to discharge. Continue ad-lib breastfeeding with lactation support. Monitor weight, voids, and stools daily. Standard newborn metabolic and hearing screens before discharge.",
                            }),
                        }],
                    },
                }],
            }),
        });
    });

    await page.goto("/#/well-baby");

    // Clear any prior cached narrative so the first click always hits the LLM.
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const generate = page.getByRole("button", {name: /^generate narrative/i});
    await expect(generate).toBeVisible();
    await generate.click();

    // Loading state proves the click was accepted.
    await expect(page.getByRole("button", {name: /drafting/i})).toBeVisible();
    await expect(page.getByRole("button", {name: /regenerate narrative/i})).toBeVisible({
        timeout: 30_000,
    });

    const article = page.locator("article");
    const first = (await article.textContent()) ?? "";
    expect(first).toMatch(/Assessment/);
    // The deterministic template starts with this exact phrase. If we see it,
    // the LLM call failed and we fell back to the template.
    expect(first).not.toMatch(/term \(AGA\) infant, svd\.\s+Uneventful transition\./);

    // Regenerate must bypass the cache — same inputs, fresh call.
    await page.getByRole("button", {name: /regenerate narrative/i}).click();
    await expect(page.getByRole("button", {name: /drafting/i})).toBeVisible();
    await expect(page.getByRole("button", {name: /regenerate narrative/i})).toBeVisible({
        timeout: 30_000,
    });

    const second = (await article.textContent()) ?? "";
    expect(second).toMatch(/Assessment/);
    expect(second.length).toBeGreaterThan(200);

    // No error surfaced.
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
