// Exam catalogue for the prep area. Shared by client pages and the server generator.
// Exam names are used descriptively only; Lumina is not affiliated with the test owners.

export const EXAM_IDS = ["ielts", "toefl", "sat"] as const;
export type ExamId = (typeof EXAM_IDS)[number];
export const isExamId = (value: string): value is ExamId => (EXAM_IDS as readonly string[]).includes(value);

type Text = { en: string; zh: string };
export type ExamSection = { id: string; name: Text; available: boolean };
export type ReadingQuestionType = { id: string; name: Text; kind: "choice" | "tfng" | "completion" | "ynng" | "cloze" | "multi" | "matching"; guide: string };

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
    tagline: { en: "Academic & General Training · every Reading task family", zh: "学术类与培训类·阅读全题型专项" },
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
      { id: "multi", kind: "multi", name: { en: "Multiple answers", zh: "多项选择" }, guide: "Choose TWO letters from FIVE options or THREE letters from SEVEN options. answerIndices holds the exact 2 or 3 distinct correct indices, answerIndex=-1. One point per correct selection in any order. Explain EVERY option. Do not create overlapping or partly true options." },
      { id: "matching_info", kind: "matching", name: { en: "Matching information", zh: "段落信息匹配" }, guide: "A shared matching task. Ask which labelled paragraph contains each specific detail. Options are the server-supplied paragraph letters A,B,..., in order. Letters may be reused; set reuseOptions=true. Context must be the exact correct paragraph. At least two questions in the group." },
      { id: "heading", kind: "matching", name: { en: "Matching headings", zh: "段落标题匹配" }, guide: "A shared matching task with a pool of headings, more headings than questions. One question per different labelled original paragraph. No heading may be reused (reuseOptions=false). Test its central idea, not a minor detail. Context is the exact target paragraph and prompt identifies its letter. UI shows Roman numerals." },
      { id: "matching_features", kind: "matching", name: { en: "Matching features", zh: "特征／人物观点匹配" }, guide: "A shared matching task: pair statements with source-grounded people, periods, groups or objects. Shared options are the named features. Set reuseOptions=true when appropriate and use that rule consistently. Context includes relevant source evidence. At least two items." },
      { id: "sentence_endings", kind: "matching", name: { en: "Matching sentence endings", zh: "句子结尾匹配" }, guide: "A shared matching task. Prompt is a sentence beginning; shared options are plausible endings. More endings than questions, no reuse. Correct complete sentences must be grammatical and supported by the source, not just grammatically possible. At least two beginnings." },
      { id: "summary", kind: "completion", name: { en: "Summary completion", zh: "摘要填空" }, guide: "One shared summary task, content is a coherent paraphrased summary with {{qN}} gaps. At least two questions map to those gaps. Follow requested source-word or shared word-bank mode. Keep grammatical constraints; no answers leaked in the displayed summary." },
      { id: "notes", kind: "completion", name: { en: "Note completion", zh: "笔记填空" }, guide: "One shared notes task with concise hierarchical notes, newlines, and {{qN}} gaps. At least two questions. Follow source-word or shared word-bank mode." },
      { id: "table", kind: "completion", name: { en: "Table completion", zh: "表格填空" }, guide: "One shared table task with headers and rectangular rows. Cells contain {{qN}} gaps. At least two gaps. Follow source-word or shared word-bank mode. All completed relationships must follow the source." },
      { id: "flowchart", kind: "completion", name: { en: "Flow-chart completion", zh: "流程图填空" }, guide: "One shared flowchart task: nodes and directed edges must represent a real process from the source. At least two {{qN}} gap labels. Coordinates are a non-overlapping integer grid (x=0..3,y=0..5), connected in process order. Follow source-word or shared word-bank mode." },
      { id: "diagram", kind: "completion", name: { en: "Diagram label completion", zh: "示意图标注填空" }, guide: "One shared diagram task: nodes/edges form a labelled schematic of source-described equipment, parts or physical relationships, NOT a text-only question or a process disguised as an object. At least two {{qN}} labels. Non-overlapping integer grid (x=0..3,y=0..5). Missing labels are source words with explicit limits. Never invent physical relations." },
      { id: "short", kind: "completion", name: { en: "Short answers", zh: "简短回答" }, guide: "Ask factual questions requiring one to three words and/or a number copied from source, with an explicit wordLimit=1..3 and allowNumber flag. No blank needed." },
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
      { id: "central", kind: "choice", name: { en: "Central ideas and details", zh: "中心思想与细节" }, guide: "Test a main idea or a relevant explicitly stated detail. Do not conflate a supporting example with the main claim." },
      { id: "evidence", kind: "choice", name: { en: "Textual evidence", zh: "文本证据" }, guide: "State a source-grounded claim or hypothesis; ask which quotation or finding supports or weakens it. Four options." },
      { id: "quantitative", kind: "choice", name: { en: "Quantitative evidence", zh: "图表定量证据" }, guide: "Include a graphic of the requested kind (table/bar/line), with title, unit, series names and 2-6 rows. Each row has category label, numeric values for EVERY series, and evidence=one exact sourceId supporting all that row's values. Use ONLY numeric data explicitly in source, no invented studies or numbers. Combine the displayed data with a 25-150 word text to test support for a claim. Four plausible choices, one correct; do not merely ask arithmetic." },
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
