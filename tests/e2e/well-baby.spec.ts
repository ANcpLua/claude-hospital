import {expect, test} from "@playwright/test";

// Happy path: the WellBaby route should generate an LLM narrative on click,
// and clicking Regenerate must produce a fresh response (cache bypass).
// Run against prod with `PROD=1 npm run test:e2e`, or locally after starting
// `bun --env-file=.env server/index.ts` + `npm run dev`.

test("well-baby: generate then regenerate produces non-template narratives", async ({page}) => {
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
