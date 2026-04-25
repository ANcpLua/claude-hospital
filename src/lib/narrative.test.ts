import {describe, expect, it} from "vitest";
import {parseNarrative} from "./narrative";

describe("parseNarrative", () => {
    it("parses a valid {assessment, plan} object", () => {
        const r = parseNarrative('{"assessment":"a","plan":"b"}');
        expect(r).toEqual({assessment: "a", plan: "b"});
    });

    it("trims surrounding whitespace on both fields", () => {
        const r = parseNarrative('{"assessment":"  a  ","plan":"\\nb\\n"}');
        expect(r).toEqual({assessment: "a", plan: "b"});
    });

    it("accepts the typical Gemini multi-line response", () => {
        // Mirrors what the live `responseMimeType: application/json` path returns.
        const raw = `{
            "assessment": "Full-term 39-week infant, AGA. Stable transition.",
            "plan": "Routine newborn care; vitamin K, hep B vaccine; monitor feeding."
        }`;
        const r = parseNarrative(raw);
        expect(r?.assessment).toMatch(/Full-term/);
        expect(r?.plan).toMatch(/vitamin K/);
    });

    it("rejects non-JSON", () => {
        expect(parseNarrative("not json")).toBeNull();
        expect(parseNarrative("Assessment: a\nPlan: b")).toBeNull();
    });

    it("rejects missing fields", () => {
        expect(parseNarrative('{"assessment":"a"}')).toBeNull();
        expect(parseNarrative('{"plan":"b"}')).toBeNull();
        expect(parseNarrative("{}")).toBeNull();
    });

    it("rejects wrong field types", () => {
        expect(parseNarrative('{"assessment":1,"plan":"b"}')).toBeNull();
        expect(parseNarrative('{"assessment":"a","plan":null}')).toBeNull();
        expect(parseNarrative('{"assessment":["a"],"plan":"b"}')).toBeNull();
    });

    it("rejects null / array / primitive top-level values", () => {
        expect(parseNarrative("null")).toBeNull();
        expect(parseNarrative("[]")).toBeNull();
        expect(parseNarrative('"just a string"')).toBeNull();
        expect(parseNarrative("42")).toBeNull();
    });

    it("ignores extra fields (forward-compatible)", () => {
        const r = parseNarrative('{"assessment":"a","plan":"b","extra":"ignored"}');
        expect(r).toEqual({assessment: "a", plan: "b"});
    });
});
