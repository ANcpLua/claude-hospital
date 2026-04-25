import {expect, test} from "@playwright/test";

// MedDuties — schedule generation is deterministic (no LLM on the happy
// path; LLM is opt-in via natural-language commands). Smoke: render →
// click "Generate schedule" → assignments appear.
test("medduties: generate schedule produces assignments without errors", async ({page}) => {
    await page.goto("/#/medduties");

    const generate = page.getByRole("button", {name: /generate schedule/i});
    await expect(generate).toBeVisible();
    await generate.click();

    // The "Equilibrium · shifts per doctor" section only renders once
    // assignments.length > 0 — proves the schedule was built.
    await expect(page.getByText(/equilibrium/i)).toBeVisible();
    await expect(page.locator("p.text-rose-700")).toHaveCount(0);
});
