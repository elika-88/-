import { describe, expect, it } from "vitest";
import { countWords, INPUT_LIMITS, normalizeLectureText, validateGenerationInput, validateLecture } from "@/lib/input";

describe("shared input validation", () => {
  it.each(["", " \n\t "])("rejects empty input %j", (text) => {
    expect(validateLecture(text)?.code).toBe("EMPTY_INPUT");
  });

  it("requires both sufficient content and enough words", () => {
    expect(validateLecture("a ".repeat(80))?.code).toBe("INPUT_TOO_SHORT");
    expect(validateLecture("a".repeat(400))?.code).toBe("INPUT_TOO_SHORT");
    expect(validateLecture("evidence ".repeat(79))?.code).toBe("INPUT_TOO_SHORT");
    expect(validateLecture("evidence ".repeat(80))).toBeNull();
  });

  it("counts Russian and Chinese word units without relying on spaces", () => {
    expect(countWords("Лекция объясняет обучение.")).toBe(3);
    expect(countWords("学生学习知识。")).toBeGreaterThan(1);
    expect(countWords("123 + !!! \n")).toBe(1);
    expect(validateLecture("学生学习知识，老师解释概念。".repeat(40))).toBeNull();
  });

  it("checks the maximum including whitespace, before segmentation", () => {
    expect(validateLecture(" ".repeat(INPUT_LIMITS.maxCharacters + 1))?.code).toBe("INPUT_TOO_LONG");
    expect(validateLecture("word ".repeat(12_000))).toBeNull();
  });

  it("preserves source whitespace and accepts an optional empty title", () => {
    const input = { title: "", lecture: `\n${"evidence ".repeat(80)}\n`, outputLanguage: "auto" };
    expect(validateGenerationInput(input)).toEqual({ success: true, data: input });
  });

  it("normalizes HTML entities left in imported transcripts", () => {
    expect(normalizeLectureText("AI&nbsp;&nbsp;models &amp; safety&#160;research &amp;nbsp;today\u00a0now"))
      .toBe("AI models & safety research today now");
    expect(validateGenerationInput({ title: "", lecture: "evidence&nbsp;&nbsp;".repeat(80), outputLanguage: "auto" }))
      .toMatchObject({ success: true, data: { lecture: "evidence ".repeat(80) } });
  });

  it.each([
    null,
    { lecture: "evidence ".repeat(80) },
    { title: "", lecture: 123, outputLanguage: "auto" },
    { title: "", lecture: "evidence ".repeat(80), outputLanguage: "xx" },
    { title: "", lecture: "evidence ".repeat(80), outputLanguage: "auto", apiKey: "not-allowed" },
    { title: "x".repeat(201), lecture: "evidence ".repeat(80), outputLanguage: "auto" },
  ])("rejects malformed requests without coercion", (input) => {
    expect(validateGenerationInput(input)).toMatchObject({ success: false, error: { code: "INVALID_REQUEST" } });
  });
});
