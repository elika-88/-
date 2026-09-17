import { z } from "zod";
import { INPUT_LIMITS, OutputLanguageSchema, type OutputLanguage } from "@/lib/input";
import { StudyKitSchema, type StudyKit } from "@/lib/schemas/studyMaterials";

export type SessionTab = "summary" | "keypoints" | "quiz" | "flashcards";

export type StudySession = {
  id: string;
  title: string;
  customTitle: boolean;
  lecture: string;
  outputLanguage: OutputLanguage;
  tab: SessionTab;
  kit: StudyKit | null;
  updatedAt: number;
};

export type SessionHistory = {
  version: 1;
  activeId: string | null;
  sessions: StudySession[];
};

export const STORAGE_KEY = "lumina.sessions.v1";

const SessionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(INPUT_LIMITS.maxTitleCharacters),
  customTitle: z.boolean().default(false),
  lecture: z.string().max(INPUT_LIMITS.maxCharacters),
  outputLanguage: OutputLanguageSchema,
  tab: z.enum(["summary", "keypoints", "quiz", "flashcards"]),
  kit: z.unknown().optional().transform((value): StudyKit | null => {
    const result = StudyKitSchema.safeParse(value);
    return result.success ? result.data : null;
  }),
  updatedAt: z.number().finite().nonnegative(),
});

const HistorySchema = z.object({
  version: z.literal(1),
  activeId: z.string().nullable(),
  sessions: z.array(SessionSchema).refine(
    (sessions) => new Set(sessions.map((session) => session.id)).size === sessions.length,
    "Saved lectures must have unique IDs.",
  ),
});

export function emptyHistory(): SessionHistory {
  return { version: 1, activeId: null, sessions: [] };
}

export function createSession(): StudySession {
  return {
    id: crypto.randomUUID(),
    title: "",
    customTitle: false,
    lecture: "",
    outputLanguage: "auto",
    tab: "summary",
    kit: null,
    updatedAt: Date.now(),
  };
}

export function parseHistory(raw: string | null): SessionHistory {
  if (raw === null) return emptyHistory();
  const history = HistorySchema.parse(JSON.parse(raw));
  return {
    version: 1,
    activeId: history.sessions.some((session) => session.id === history.activeId)
      ? history.activeId
      : null,
    sessions: history.sessions,
  };
}

function persistKit(kit: StudyKit): StudyKit {
  const evidence = (items: StudyKit["overview"]["evidence"]) =>
    items.map(({ segmentId, quote }) => ({ segmentId, quote }));

  return {
    runId: kit.runId,
    lectureTitle: kit.lectureTitle,
    overview: { id: kit.overview.id, text: kit.overview.text, evidence: evidence(kit.overview.evidence) },
    summary: kit.summary.map(({ id, title, text, topicIds, evidence: items }) => ({
      id, title, text, topicIds: [...topicIds], evidence: evidence(items),
    })),
    keyPoints: kit.keyPoints.map(({ id, text, topicId, importance, evidence: items }) => ({
      id, text, topicId, importance, evidence: evidence(items),
    })),
    quiz: kit.quiz.map(({ id, question, options, correctAnswer, explanation, topicId, kind, evidence: items }) => ({
      id, question, options: [...options], correctAnswer, explanation, topicId, kind, evidence: evidence(items),
    })),
    flashcards: kit.flashcards.map(({ id, front, back, topicId, evidence: items }) => ({
      id, front, back, topicId, evidence: evidence(items),
    })),
    limitations: [...kit.limitations],
    source: {
      text: kit.source.text,
      segments: kit.source.segments.map(({ id, text, start, end }) => ({ id, text, start, end })),
      wordCount: kit.source.wordCount,
    },
    topics: kit.topics.map(({ id, title, evidence: items }) => ({ id, title, evidence: evidence(items) })),
    verification: {
      items: kit.verification.items.map(({ itemId, status, reason, evidence: items }) => ({
        itemId, status, reason, evidence: evidence(items),
      })),
      supportedItems: kit.verification.supportedItems,
      totalItems: kit.verification.totalItems,
      representedTopics: kit.verification.representedTopics,
      totalTopics: kit.verification.totalTopics,
      reviewedAt: kit.verification.reviewedAt,
    },
  };
}

export function serializeHistory(history: SessionHistory): string {
  const validated = HistorySchema.parse(history);
  // Whitelist persisted fields so connection settings cannot enter lecture history.
  return JSON.stringify({
    version: 1,
    activeId: validated.sessions.some((session) => session.id === validated.activeId)
      ? validated.activeId
      : null,
    sessions: validated.sessions.map((session) => ({
      id: session.id,
      title: session.title,
      customTitle: session.customTitle,
      lecture: session.lecture,
      outputLanguage: session.outputLanguage,
      tab: session.tab,
      kit: session.kit === null ? null : persistKit(session.kit),
      updatedAt: session.updatedAt,
    })),
  });
}
