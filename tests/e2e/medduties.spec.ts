import {expect, test} from "@playwright/test";

// Schedule generation is deterministic — LLM is opt-in via natural-language commands.
test("medduties: generate schedule produces assignments without errors", async ({page}) => {
    await page.goto("/#/medduties");

    const generate = page.getByRole("button", {name: /generate schedule/i});
    await expect(generate).toBeVisible();
    await generate.click();

    // "Equilibrium" only renders once assignments.length > 0.
    await expect(page.getByText(/equilibrium/i)).toBeVisible();
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
