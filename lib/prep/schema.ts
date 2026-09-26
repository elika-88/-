import { z } from "zod";
import { EXAM_IDS, PASSAGE_LIMITS } from "./exams";

export const TFNG_OPTIONS = ["True", "False", "Not Given"] as const;

// Shape requested from the model. Strict objects + no optional fields keep it valid for structured outputs.
export const ReadingQuestionSchema = z.strictObject({
  id: z.string(),
  type: z.string(),
  prompt: z.string(),
  options: z.array(z.string()),
  answerIndex: z.number().int(),
  answerText: z.string(),
  explanation: z.string(),
  evidence: z.array(z.string()),
});
export type ReadingQuestion = z.infer<typeof ReadingQuestionSchema>;

export const ReadingSetSchema = z.strictObject({
  title: z.string(),
  questions: z.array(ReadingQuestionSchema).min(1).max(12),
});
export type ReadingSet = z.infer<typeof ReadingSetSchema>;

export const PrepGenerateRequestSchema = z.strictObject({
  exam: z.enum(EXAM_IDS),
  passage: z.string().trim().min(PASSAGE_LIMITS.minCharacters).max(PASSAGE_LIMITS.maxCharacters),
  types: z.array(z.string().min(1).max(40)).min(1).max(6),
  explanationLanguage: z.enum(["en", "zh"]),
});
export type PrepGenerateRequest = z.infer<typeof PrepGenerateRequestSchema>;

export const PrepGenerateResponseSchema = z.strictObject({
  set: ReadingSetSchema,
});
