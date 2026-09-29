// Exam catalogue for the prep area. Shared by client pages and the server generator.
// Exam names are used descriptively only; Lumina is not affiliated with the test owners.

export const EXAM_IDS = ["ielts", "toefl", "sat"] as const;
export type ExamId = (typeof EXAM_IDS)[number];
export const isExamId = (value: string): value is ExamId => (EXAM_IDS as readonly string[]).includes(value);

type Text = { en: string; zh: string };
export type ExamSection = { id: string; name: Text; available: boolean };
export type ReadingQuestionType = { id: string; name: Text; kind: "choice" | "tfng" | "completion" | "ynng" | "cloze"; guide: string };

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
      { id: "ynng", kind: "ynng", name: { en: "Yes / No / Not Given", zh: "作者观点 Y/N/NG" }, guide: "Test the writer's views, not factual truth. Yes agrees, No contradicts, Not Given means no view is stated. Never use outside knowledge." },
      { id: "heading", kind: "choice", name: { en: "Paragraph headings · skill drill", zh: "段落标题专项" }, guide: "Identify the main idea of a specified paragraph. Give four headings. Single-item skill drill, not a full matching-headings task." },
      { id: "short", kind: "completion", name: { en: "Short answers", zh: "简短回答" }, guide: "Ask a factual question, answer NO MORE THAN TWO WORDS from the passage. No blank needed." },
    ],
    passageHint: { en: "Paste an academic article of 400–1,200 words (science, history, society…).", zh: "粘贴一篇 400–1,200 词的学术类文章（科学、历史、社会等）。" },
  },
  toefl: {
    id: "toefl",
    name: "TOEFL iBT",
    tagline: { en: "2026 reading: words, daily life and academic texts", zh: "2026 新版：补全单词、日常阅读与学术短文" },
    scoreLabel: { en: "Target Reading band (1–6)", zh: "阅读目标等级（1–6）" },
    scoreRange: { min: 1, max: 6, step: 0.5, default: 5 },
    accent: "#1d4ed8",
    readingSection: "reading",
    sections: [{ id: "reading", name: { en: "Reading", zh: "阅读" }, available: true }, soon("listening", "Listening", "听力"), soon("speaking", "Speaking", "口语"), soon("writing", "Writing", "写作")],
    readingTypes: [
      { id: "complete_words", kind: "cloze", name: { en: "Complete the Words · single-gap drill", zh: "补全单词·单空专项" }, guide: "Choose one alphabetic word of 4-18 letters from the source as answerText. Write an INTACT coherent 30-70 word context containing that full target word exactly once. DO NOT insert underscores: the server masks its second half. Prompt asks for the FULL word. Single-gap drill, not the official multi-gap task. No options." },
      { id: "daily", kind: "choice", name: { en: "Read in Daily Life", zh: "日常阅读" }, guide: "Adapt source into a short ORIGINAL campus email, notice or web post. Do not invent details that determine the answer. Test purpose, action or information with four options." },
      { id: "academic", kind: "choice", name: { en: "Read an Academic Passage", zh: "学术短文" }, guide: "Use a short excerpt, roughly 150-220 words when available. Test main idea, detail, inference, vocabulary or relationships." },
      { id: "factual", kind: "choice", name: { en: "Factual information · skill", zh: "事实信息专项" }, guide: "Ask what the passage states about a specific detail. Four options, one correct." },
      { id: "negative", kind: "choice", name: { en: "Negative factual", zh: "否定事实题" }, guide: "Ask which option is NOT mentioned or NOT true according to the passage. Three options are supported by the passage, one is not." },
      { id: "vocabulary", kind: "choice", name: { en: "Vocabulary in context", zh: "词汇题" }, guide: "Quote a word or short phrase from the passage and ask which option is closest in meaning as used there." },
      { id: "inference", kind: "choice", name: { en: "Inference", zh: "推断题" }, guide: "Ask what can be inferred; the correct option must follow directly from the cited text without outside knowledge." },
      { id: "purpose", kind: "choice", name: { en: "Rhetorical purpose", zh: "修辞目的题" }, guide: "Ask why the author mentions a specific point or example." },
    ],
    passageHint: { en: "Paste a short academic text, campus message or everyday information. Select a 2026 task family or an underlying skill.", zh: "粘贴学术短文、校园通知或日常信息，选择 2026 题型或具体技能。" },
  },
  sat: {
    id: "sat",
    name: "SAT",
    tagline: { en: "Digital Reading & Writing · short texts and single questions", zh: "机考阅读与写作·短文本配单题" },
    scoreLabel: { en: "Target Reading & Writing score", zh: "阅读与写作目标分" },
    scoreRange: { min: 200, max: 800, step: 10, default: 700 },
    accent: "#7c3aed",
    readingSection: "reading-writing",
    sections: [{ id: "reading-writing", name: { en: "Reading & Writing", zh: "阅读与写作" }, available: true }, soon("math", "Math", "数学")],
    readingTypes: [
      { id: "words", kind: "choice", name: { en: "Words in context", zh: "语境词汇" }, guide: "Show a sentence from the passage with one word replaced by ____ and ask for the most logical and precise word. Four options." },
      { id: "central", kind: "choice", name: { en: "Central idea", zh: "中心思想" }, guide: "Ask which choice best states the main idea of the passage or a paragraph." },
      { id: "evidence", kind: "choice", name: { en: "Command of evidence", zh: "证据支持" }, guide: "State a claim from the passage and ask which quotation or finding best supports it." },
      { id: "structure", kind: "choice", name: { en: "Text structure & purpose", zh: "结构与目的" }, guide: "Ask about the function of a sentence or the overall structure of the text." },
      { id: "inference", kind: "choice", name: { en: "Inferences", zh: "推断" }, guide: "Choose a conclusion supported by a short text, not plausible outside knowledge." },
      { id: "cross_text", kind: "choice", name: { en: "Cross-text connections", zh: "双文本关系" }, guide: "Create Text 1 and Text 2 from source ideas, 25-150 words combined. Ask how they relate." },
      { id: "transitions", kind: "choice", name: { en: "Transitions", zh: "逻辑衔接" }, guide: "Context with one ____ replacing a transition. Four transition options, exactly one fits the logical relation." },
      { id: "boundaries", kind: "choice", name: { en: "Sentence boundaries", zh: "句界与标点" }, guide: "Context with a ____ gap. Four punctuation/sentence-boundary completions; one fits Standard English. Explain the rule." },
      { id: "form", kind: "choice", name: { en: "Form, structure and sense", zh: "语法结构" }, guide: "A ____ gap tests agreement, verb form, pronouns or modifiers. Explain the rule." },
      { id: "synthesis", kind: "choice", name: { en: "Rhetorical synthesis", zh: "笔记整合" }, guide: "Provide bullet notes grounded in the source and a writing goal. Choose the sentence meeting that goal." },
    ],
    passageHint: { en: "Paste source material. Each item uses its own 25–150-word context. This is a skill drill, not an adaptive SAT module.", zh: "粘贴素材，每题配 25–150 词独立语境。这是专项练习，不是自适应 SAT 模考。" },
  },
};

export const PASSAGE_LIMITS = { minCharacters: 100, maxCharacters: 12_000, questions: 6 } as const;
export const minimumCharacters = (exam: ExamId) => exam === 'ielts' ? 400 : exam === 'toefl' ? 160 : 100;

/** Commonly published IELTS Academic reading raw-score (out of 40) to band table, scaled. Estimate only. */
export function estimateIeltsBand(correct: number, total: number) {
  // Never extrapolate generated mini-sets into an official band.
  if (total !== 40 || !Number.isInteger(correct) || correct < 0 || correct > 40) return null;
  const raw = correct;
  const table: Array<[number, number]> = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]];
  return table.find(([minimum]) => raw >= minimum)?.[1] ?? 2;
}
