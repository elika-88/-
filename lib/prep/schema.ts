import { z } from "zod";
import { EXAM_IDS, PASSAGE_LIMITS, QUESTION_COUNTS } from "./exams";

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
  questions: z.array(ReadingQuestionSchema).min(1).max(16),
});
export type ReadingSet = z.infer<typeof ReadingSetSchema>;

export const PrepGenerateRequestSchema = z.strictObject({
  exam: z.enum(EXAM_IDS),
  passage: z.string().trim().min(PASSAGE_LIMITS.minCharacters).max(PASSAGE_LIMITS.maxCharacters),
  types: z.array(z.string().min(1).max(40)).min(1).max(8),
  count: z.union([z.literal(QUESTION_COUNTS[0]), z.literal(QUESTION_COUNTS[1]), z.literal(QUESTION_COUNTS[2])]).default(10),
  explanationLanguage: z.enum(["en", "zh"]),
});
export type PrepGenerateRequest = z.infer<typeof PrepGenerateRequestSchema>;

export const PrepGenerateResponseSchema = z.strictObject({
  set: ReadingSetSchema,
});

export const PREP_STAGES = ["reading", "writing", "checking", "complete"] as const;
export type PrepStage = (typeof PREP_STAGES)[number];
export type PrepStreamEvent =
  | { type: "stage"; stage: PrepStage; attempt: number }
  | { type: "result"; set: ReadingSet }
  | { type: "error"; error: { code: string; message: string; retryable: boolean } };
