// Exam catalogue for the prep area. Shared by client pages and the server generator.
// Exam names are used descriptively only; Lumina is not affiliated with the test owners.

export const EXAM_IDS = ["ielts", "toefl", "sat"] as const;
export type ExamId = (typeof EXAM_IDS)[number];
export const isExamId = (value: string): value is ExamId => (EXAM_IDS as readonly string[]).includes(value);

type Text = { en: string; zh: string };
export type ExamSection = { id: string; name: Text; available: boolean };
export type ReadingQuestionType = { id: string; name: Text; kind: "choice" | "tfng" | "completion"; guide: string };

export type Exam = {
  id: ExamId;
  name: string;
  tagline: Text;
  scoreLabel: Text;
  scoreRange: { min: number; max: number; step: number; default: number };
  accent: string;
  sections: ExamSection[];
  readingSection: string;
  readingTypes: ReadingQuestionType[];
  passageHint: Text;
};

const soon = (id: string, en: string, zh: string): ExamSection => ({ id, name: { en, zh }, available: false });

export const EXAMS: Record<ExamId, Exam> = {
  ielts: {
    id: "ielts",
    name: "IELTS",
    tagline: { en: "Academic reading and more, band 0–9", zh: "学术类阅读等，0–9 分制" },
    scoreLabel: { en: "Target band", zh: "目标分数" },
    scoreRange: { min: 4, max: 9, step: 0.5, default: 7 },
    accent: "#c2410c",
    readingSection: "reading",
    sections: [{ id: "reading", name: { en: "Reading", zh: "阅读" }, available: true }, soon("writing", "Writing", "写作"), soon("listening", "Listening", "听力"), soon("speaking", "Speaking", "口语")],
    readingTypes: [
      { id: "tfng", kind: "tfng", name: { en: "True / False / Not Given", zh: "判断题 T/F/NG" }, guide: "A factual statement about the passage. Answer True if the passage confirms it, False if the passage contradicts it, Not Given if the passage does not say. Paraphrase; do not copy sentences." },
      { id: "mcq", kind: "choice", name: { en: "Multiple choice", zh: "单项选择" }, guide: "IELTS-style question with four options (A-D), exactly one correct, testing detail or main idea." },
      { id: "completion", kind: "completion", name: { en: "Sentence completion", zh: "句子填空" }, guide: "A sentence paraphrasing the passage with one blank shown as ____. The answer is NO MORE THAN TWO WORDS copied exactly from the passage." },
    ],
    passageHint: { en: "Paste an academic article of 400–1,200 words (science, history, society…).", zh: "粘贴一篇 400–1,200 词的学术类文章（科学、历史、社会等）。" },
  },
  toefl: {
    id: "toefl",
    name: "TOEFL iBT",
    tagline: { en: "Academic English for university, score 0–120", zh: "大学学术英语，0–120 分" },
    scoreLabel: { en: "Target score", zh: "目标分数" },
    scoreRange: { min: 60, max: 120, step: 1, default: 100 },
    accent: "#1d4ed8",
    readingSection: "reading",
    sections: [{ id: "reading", name: { en: "Reading", zh: "阅读" }, available: true }, soon("listening", "Listening", "听力"), soon("speaking", "Speaking", "口语"), soon("writing", "Writing", "写作")],
    readingTypes: [
      { id: "factual", kind: "choice", name: { en: "Factual information", zh: "事实信息题" }, guide: "Ask what the passage states about a specific detail. Four options, one correct." },
      { id: "negative", kind: "choice", name: { en: "Negative factual", zh: "否定事实题" }, guide: "Ask which option is NOT mentioned or NOT true according to the passage. Three options are supported by the passage, one is not." },
      { id: "vocabulary", kind: "choice", name: { en: "Vocabulary in context", zh: "词汇题" }, guide: "Quote a word or short phrase from the passage and ask which option is closest in meaning as used there." },
      { id: "inference", kind: "choice", name: { en: "Inference", zh: "推断题" }, guide: "Ask what can be inferred; the correct option must follow directly from the cited text without outside knowledge." },
      { id: "purpose", kind: "choice", name: { en: "Rhetorical purpose", zh: "修辞目的题" }, guide: "Ask why the author mentions a specific point or example." },
    ],
    passageHint: { en: "Paste an academic passage of about 500–800 words.", zh: "粘贴一篇约 500–800 词的学术文章。" },
  },
  sat: {
    id: "sat",
    name: "SAT",
    tagline: { en: "Digital SAT, score 400–1600", zh: "机考 SAT，400–1600 分" },
    scoreLabel: { en: "Target score", zh: "目标分数" },
    scoreRange: { min: 800, max: 1600, step: 10, default: 1450 },
    accent: "#7c3aed",
    readingSection: "reading-writing",
    sections: [{ id: "reading-writing", name: { en: "Reading & Writing", zh: "阅读与写作" }, available: true }, soon("math", "Math", "数学")],
    readingTypes: [
      { id: "words", kind: "choice", name: { en: "Words in context", zh: "语境词汇" }, guide: "Show a sentence from the passage with one word replaced by ____ and ask for the most logical and precise word. Four options." },
      { id: "central", kind: "choice", name: { en: "Central idea", zh: "中心思想" }, guide: "Ask which choice best states the main idea of the passage or a paragraph." },
      { id: "evidence", kind: "choice", name: { en: "Command of evidence", zh: "证据支持" }, guide: "State a claim from the passage and ask which quotation or finding best supports it." },
      { id: "structure", kind: "choice", name: { en: "Text structure & purpose", zh: "结构与目的" }, guide: "Ask about the function of a sentence or the overall structure of the text." },
    ],
    passageHint: { en: "Paste a passage of 150–800 words (literature, science, history, social studies).", zh: "粘贴一篇 150–800 词的文章（文学、科学、历史、社会等）。" },
  },
};

export const PASSAGE_LIMITS = { minCharacters: 600, maxCharacters: 12_000, questions: 8 } as const;

/** Commonly published IELTS Academic reading raw-score (out of 40) to band table, scaled. Estimate only. */
export function estimateIeltsBand(correct: number, total: number) {
  if (!total) return null;
  const raw = Math.round((correct / total) * 40);
  const table: Array<[number, number]> = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]];
  return table.find(([minimum]) => raw >= minimum)?.[1] ?? 2;
}
