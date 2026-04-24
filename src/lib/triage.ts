import {extractJson} from "./extract";

type TriageUrgency = "urgent" | "routine" | "self-care";

export interface TriageResult {
    readonly urgency: TriageUrgency;
    readonly reason: string;
    readonly suggestedNextStep: string;
}

const SYSTEM = `You are a clinical triage assistant. Read the patient's complaint and classify urgency. "urgent" = needs immediate evaluation today (chest pain, severe shortness of breath, focal weakness, syncope, severe bleeding, suicidal ideation, anaphylaxis). "routine" = should be seen within days, but not an emergency. "self-care" = can be self-managed with general advice. Respond as JSON: {"urgency":"urgent"|"routine"|"self-care","reason":string,"suggestedNextStep":string}.`;

const URGENT_PATTERNS: ReadonlyArray<RegExp> = [
    /\bchest pain\b/i,
    /\bcrushing\b/i,
    /\bcan'?t breathe\b/i,
    /\bshortness of breath\b/i,
    /\bsudden.*(weakness|numbness)\b/i,
    /\bsuicidal\b/i,
    /\bpassed out\b/i,
    /\banaphylaxis\b/i,
    /\bbleeding heavily\b/i,
    /\bworst headache\b/i,
];

const SELF_CARE_PATTERNS: ReadonlyArray<RegExp> = [
    /\bjust a question\b/i,
    /\bgeneral advice\b/i,
    /\bdiet\b/i,
];

function deterministicTriage(complaint: string): TriageResult {
    if (URGENT_PATTERNS.some((p) => p.test(complaint))) {
        return {
            urgency: "urgent",
            reason: "Symptoms suggest a possible cardiac or neurological emergency.",
            suggestedNextStep: "Call the office now or go to the nearest ED.",
        };
    }
    if (SELF_CARE_PATTERNS.some((p) => p.test(complaint)) && complaint.length < 60) {
        return {
            urgency: "self-care",
            reason: "Question can be addressed with general guidance.",
            suggestedNextStep: "Review the recommendation handout or chat with the post-visit assistant.",
        };
    }
    if (/\b(swollen|puffy|edema|ankle)\b/i.test(complaint)) {
        return {
            urgency: "routine",
            reason: "Likely medication-related side effect; non-urgent unless rapidly progressing.",
            suggestedNextStep: "Phone check-in within the next few business days.",
        };
    }
    return {
        urgency: "routine",
        reason: "Symptom warrants clinical review but is not immediately dangerous.",
        suggestedNextStep: "Phone check-in within 5 business days.",
    };
}

function validateTriage(raw: unknown): TriageResult | null {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const urgencyRaw = typeof r.urgency === "string" ? r.urgency.toLowerCase() : "";
    if (urgencyRaw !== "urgent" && urgencyRaw !== "routine" && urgencyRaw !== "self-care") return null;
    const reason = typeof r.reason === "string" ? r.reason : "";
    const next =
        typeof r.suggestedNextStep === "string"
            ? r.suggestedNextStep
            : typeof r.next_step === "string"
                ? r.next_step
                : "";
    if (!reason || !next) return null;
    return {urgency: urgencyRaw, reason, suggestedNextStep: next};
}

export async function triage(complaint: string): Promise<TriageResult> {
    const text = complaint.trim();
    if (!text) {
        return {
            urgency: "self-care",
            reason: "No complaint entered.",
            suggestedNextStep: "Describe what you're feeling, then send again.",
        };
    }
    // Urgent safety net must never be overridden by the LLM.
    if (URGENT_PATTERNS.some((p) => p.test(text))) {
        return deterministicTriage(text);
    }
    const r = await extractJson<TriageResult>({
        system: SYSTEM,
        user: text,
        validate: validateTriage,
        maxTokens: 220,
    });
    return r.ok ? r.value : deterministicTriage(text);
}
