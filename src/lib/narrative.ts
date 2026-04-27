export interface NarrativeSections {
    readonly assessment: string;
    readonly plan: string;
}

export const NARRATIVE_SYSTEM = `You are a neonatology assistant drafting the Assessment and Plan sections of a well-baby nursery note. You will receive structured inputs as JSON. Reply with ONLY a JSON object {"assessment": string, "plan": string}. Never invent numbers that aren't in the input. If any input is abnormal, name it explicitly and briefly say why. Max 120 words total across both fields.`;

export function parseNarrative(raw: string): NarrativeSections | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.assessment !== "string" || typeof obj.plan !== "string") return null;
    return {assessment: obj.assessment.trim(), plan: obj.plan.trim()};
}
