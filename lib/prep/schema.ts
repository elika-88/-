import { z } from "zod";
import { EXAMS, EXAM_IDS, PASSAGE_LIMITS, minimumCharacters } from "./exams";

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
  context: z.string().max(5000).optional(),
  optionReasons: z.array(z.string().max(1200)).max(4).optional(),
  strategy: z.string().max(1200).optional(),
  wordLimit: z.number().int().min(0).max(2).optional(),
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
  types: z.array(z.string().min(1).max(40)).min(1).max(3),
  explanationLanguage: z.enum(["en", "zh"]),
  track: z.enum(['academic', 'general']).optional(),
  difficulty: z.enum(['foundation', 'standard', 'stretch']).optional(),
  count: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional(),
}).superRefine((value, ctx) => {
  if (value.passage.length < minimumCharacters(value.exam)) ctx.addIssue({code:'custom',path:['passage'],message:'Passage is too short for this exam.'});
  if (new Set(value.types).size !== value.types.length || value.types.some(id => !EXAMS[value.exam].readingTypes.some(t=>t.id===id))) ctx.addIssue({code:'custom',path:['types'],message:'Select one to three distinct supported types.'});
});
export type PrepGenerateRequest = z.infer<typeof PrepGenerateRequestSchema>;

export const PrepGenerateResponseSchema = z.strictObject({
  set: ReadingSetSchema,
});

// Separate provider contract: every field required for strict structured output.
export const ProviderReadingSetSchema = ReadingSetSchema.extend({ questions: z.array(ReadingQuestionSchema.extend({
  context: z.string(), optionReasons: z.array(z.string()), strategy: z.string(), wordLimit: z.number().int(),
})).min(4).max(8) });
