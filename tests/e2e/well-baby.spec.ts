import {expect, test} from "@playwright/test";

// Happy path: the WellBaby route should generate an LLM narrative on click,
// and clicking Regenerate must produce a fresh response (cache bypass).
// /api/gemini/generate is stubbed at the Playwright network boundary so the
// test runs without a Gemini key.

test("well-baby: generate then regenerate produces non-template narratives", async ({page}) => {
    let callCount = 0;
    await page.route("**/api/gemini/generate", async (route) => {
        callCount++;
        const tag = callCount === 1 ? "FIRST-CALL" : "SECOND-CALL";
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify({
                                assessment: `${tag} — Term AGA newborn delivered via SVD with Apgars 9/9 and unremarkable adaptation. Exam reveals a vigorous, well-perfused neonate with appropriate tone, normal respiratory effort, and no dysmorphic features identified on initial nursery assessment.`,
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

    // Wait for the first response to render. Content-based wait is more robust
    // than racing the transient "Drafting…" label, especially in slow CI.
    const article = page.locator("article");
    await expect(article).toContainText("FIRST-CALL", {timeout: 30_000});
    const first = (await article.textContent()) ?? "";
    expect(first).toMatch(/Assessment/);
    // The deterministic template starts with this phrase. If we see it,
    // the LLM call failed and we fell back to the template.
    expect(first).not.toMatch(/term \(AGA\) infant, svd\.\s+Uneventful transition\./);

    // Regenerate must bypass the cache — second click hits the proxy again.
    await page.getByRole("button", {name: /regenerate narrative/i}).click();
    await expect(article).toContainText("SECOND-CALL", {timeout: 30_000});
    expect(callCount).toBe(2);

    const second = (await article.textContent()) ?? "";
    expect(second).toMatch(/Assessment/);
    expect(second.length).toBeGreaterThan(200);
});
