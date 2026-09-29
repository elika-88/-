import { z } from "zod";
import { EXAMS, EXAM_IDS, PASSAGE_LIMITS, minimumCharacters } from "./exams";
import { ReadingTaskSchema, ReadingGraphicSchema, TASK_TYPES, sourceSupportIssue } from './tasks';

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
  optionReasons: z.array(z.string().max(1200)).max(12).optional(),
  strategy: z.string().max(1200).optional(),
  wordLimit: z.number().int().min(0).max(3).optional(),
  allowNumber: z.boolean().optional(),
  answerIndices: z.array(z.number().int().min(0).max(11)).max(3).optional(),
  taskId: z.string().nullable().optional(),
  graphic: ReadingGraphicSchema.nullable().optional(),
});
export type ReadingQuestion = z.infer<typeof ReadingQuestionSchema>;

export const ReadingSetSchema = z.strictObject({
  title: z.string(),
  questions: z.array(ReadingQuestionSchema).min(1).max(12),
  tasks: z.array(ReadingTaskSchema).max(3).optional(),
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
  completionMode: z.enum(['source','bank']).optional(),
  graphicKind: z.enum(['table','bar','line']).optional(),
}).superRefine((value, ctx) => {
  if (value.passage.length < minimumCharacters(value.exam)) ctx.addIssue({code:'custom',path:['passage'],message:'Passage is too short for this exam.'});
  if (new Set(value.types).size !== value.types.length || value.types.some(id => !EXAMS[value.exam].readingTypes.some(t=>t.id===id))) ctx.addIssue({code:'custom',path:['types'],message:'Select one to three distinct supported types.'});
  const needed=value.types.reduce((sum,id)=>sum+(TASK_TYPES[id]?2:1),0);
  if(needed>(value.count??6))ctx.addIssue({code:'custom',path:['count'],message:'Choose more questions: each shared task needs at least two items.'});
  const sourceIssue=sourceSupportIssue(value.exam,value.passage,value.types,value.count??6);
  if(sourceIssue)ctx.addIssue({code:'custom',path:['passage'],message:sourceIssue});
});
export type PrepGenerateRequest = z.infer<typeof PrepGenerateRequestSchema>;

export const PrepGenerateResponseSchema = z.strictObject({
  set: ReadingSetSchema,
});

// Separate provider contract: every field required for strict structured output.
export const ProviderReadingSetSchema = ReadingSetSchema.extend({ questions: z.array(ReadingQuestionSchema.extend({
  context: z.string(), optionReasons: z.array(z.string()), strategy: z.string(), wordLimit: z.number().int(),
  allowNumber:z.boolean(),answerIndices:z.array(z.number().int()),taskId:z.string().nullable(),graphic:ReadingGraphicSchema.nullable(),
})).min(4).max(8),tasks:z.array(ReadingTaskSchema).max(3) });
