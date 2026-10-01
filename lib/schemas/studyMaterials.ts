import { z } from "zod";

const IdSchema = z.string().min(1).max(100);
const TextSchema = z.string().min(1);

export const EvidenceSchema = z.strictObject({
  segmentId: IdSchema,
  quote: TextSchema,
});
const EvidenceListSchema = z.array(EvidenceSchema).min(1);

export const SourceSegmentSchema = z.strictObject({
  id: IdSchema,
  text: TextSchema,
  start: z.number().int().min(0),
  end: z.number().int().min(1),
});

export const TopicSchema = z.strictObject({
  id: IdSchema,
  title: TextSchema,
  evidence: EvidenceListSchema,
});

export const ClaimSchema = z.strictObject({
  id: IdSchema,
  text: TextSchema,
  evidence: EvidenceListSchema,
});

export const AnalysisSchema = z.strictObject({
  title: TextSchema,
  language: TextSchema,
  sufficient: z.boolean(),
  insufficiencyReason: z.string().nullable(),
  topics: z.array(TopicSchema),
  concepts: z.array(z.strictObject({
    term: TextSchema,
    definition: TextSchema,
    evidence: EvidenceListSchema,
  })),
  relationships: z.array(ClaimSchema),
  ambiguities: z.array(ClaimSchema),
});

export const SummarySectionSchema = ClaimSchema.extend({
  title: TextSchema,
  topicIds: z.array(IdSchema).min(1),
});

export const KeyPointSchema = ClaimSchema.extend({
  topicId: IdSchema,
  importance: z.enum(["high", "medium"]),
});

export const QuizQuestionSchema = z.strictObject({
  id: IdSchema,
  question: TextSchema,
  options: z.array(TextSchema).length(4),
  correctAnswer: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  explanation: TextSchema,
  topicId: IdSchema,
  kind: z.enum(["recall", "understanding", "comparison", "reasoning"]),
  evidence: EvidenceListSchema,
});

export const FlashcardSchema = z.strictObject({
  id: IdSchema,
  front: TextSchema,
  back: TextSchema,
  topicId: IdSchema,
  evidence: EvidenceListSchema,
});

export const ReviewItemSchema = z.strictObject({
  itemId: IdSchema,
  status: z.enum(["supported", "partially_supported", "unsupported"]),
  reason: TextSchema,
  evidence: z.array(EvidenceSchema),
});

// These plain schemas are compatible with Structured Outputs. Semantic grounding
// is a separate pipeline check; successful parsing does not verify factual claims.
export const VerificationResponseSchema = z.strictObject({ items: z.array(ReviewItemSchema).min(1) });

export const GeneratedMaterialsSchema = z.strictObject({
  lectureTitle: TextSchema,
  overview: ClaimSchema,
  summary: z.array(SummarySectionSchema).min(1),
  keyPoints: z.array(KeyPointSchema).min(1),
  quiz: z.array(QuizQuestionSchema).min(1).max(15),
  flashcards: z.array(FlashcardSchema).min(1).max(20),
  limitations: z.array(TextSchema),
});

export const StudyKitSchema = GeneratedMaterialsSchema.extend({
  runId: z.uuid(),
  source: z.strictObject({
    text: TextSchema,
    segments: z.array(SourceSegmentSchema).min(1),
    wordCount: z.number().int().min(0),
  }),
  topics: z.array(TopicSchema).min(1),
  verification: z.strictObject({
    items: z.array(ReviewItemSchema).min(1),
    supportedItems: z.number().int().min(0),
    totalItems: z.number().int().min(1),
    representedTopics: z.number().int().min(0),
    totalTopics: z.number().int().min(1),
    reviewedAt: z.iso.datetime(),
  }),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type SourceSegment = z.infer<typeof SourceSegmentSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
export type SummarySection = z.infer<typeof SummarySectionSchema>;
export type KeyPoint = z.infer<typeof KeyPointSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export type VerificationResponse = z.infer<typeof VerificationResponseSchema>;
export type GeneratedMaterials = z.infer<typeof GeneratedMaterialsSchema>;
export type StudyKit = z.infer<typeof StudyKitSchema>;
