import type { ExamId } from './exams';
export type Bilingual = { en: string; zh: string };
export const CHECKED_ON = '2026-09-29';
export const GUIDES: Record<ExamId, { format: Bilingual; scoring: Bilingual; strategy: Bilingual[]; resources: { label: string; url: string }[] }> = {
  ielts: {
    format: { en: '40 questions in 60 minutes, including answer transfer. Academic: three long texts. General Training: everyday, workplace and longer general-interest reading.', zh: '60 分钟、40 题，包含誊写时间。学术类为三篇长文；培训类从日常、工作场景过渡到较长通识文本。' },
    scoring: { en: 'Academic and General Training raw-score requirements differ. Spelling and word limits matter. These drills report accuracy, not an IELTS band.', zh: '学术类与培训类分数换算不同；拼写和字数限制影响得分。本练习报告正确率，不预测雅思分数。' },
    strategy: [
      { en: 'Find the key idea; scan for paraphrases, not only identical words.', zh: '抓题干核心信息，定位同义替换，不只找相同单词。' },
      { en: 'False/No needs a contradiction. Not Given means insufficient information. Separate facts from the writer’s views.', zh: 'False／No 必须有反证；Not Given 是信息不足。区分事实与作者观点。' },
      { en: 'Summarise a paragraph before choosing a heading. For blanks, check grammar, spelling and the word limit.', zh: '标题题先概括段意；填空题检查词性、拼写和字数。' },
    ],
    resources: [
      { label: 'Academic format & tasks', url: 'https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading' },
      { label: 'General Training format', url: 'https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-reading' },
      { label: 'Official sample questions', url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions' },
    ],
  },
  sat: {
    format: { en: '54 Reading and Writing questions in two 32-minute modules. Each 25–150-word text or pair has one question. Module 2 depends on Module 1 performance.', zh: '阅读与写作 54 题，两个模块各 32 分钟。每段 25–150 词单／双文本配单题；第二模块根据第一模块表现分流。' },
    scoring: { en: 'The section scale is 200–800. Raw accuracy cannot predict an adaptive score. Train ideas, craft, expression and Standard English conventions.', zh: '本科目为 200–800 分；正确率不能直接推算自适应分数。覆盖信息观点、语言结构、表达、英语规范四领域。' },
    strategy: [
      { en: 'Read the question, predict an answer, then eliminate choices by the exact task.', zh: '先看问题、形成答案，再按要求排除干扰项。' },
      { en: 'Check words in context; identify the logical relation before choosing a transition.', zh: '词汇放回语境验证，衔接题先说清句间逻辑。' },
      { en: 'Flag costly questions and return within the same module. Use Bluebook for official adaptive practice.', zh: '耗时题先标记，同模块内回看。完整自适应练习使用官方 Bluebook。' },
    ],
    resources: [
      { label: 'Reading and Writing format', url: 'https://satsuite.collegeboard.org/sat/whats-on-the-test/reading-writing' },
      { label: 'Official practice & question bank', url: 'https://satsuite.collegeboard.org/practice' },
      { label: 'Bluebook practice', url: 'https://bluebook.collegeboard.org/students/practice' },
    ],
  },
  toefl: {
    format: { en: 'Since January 21, 2026: Complete the Words, Read in Daily Life, Read an Academic Passage. Adaptive reading has variable length (ETS lists approximately 50 items / 30 minutes).', zh: '2026 年 1 月 21 日起：补全单词、日常阅读、学术短文。自适应阅读题量／时间可变化（ETS 列出约 50 题／30 分钟）。' },
    scoring: { en: 'Section and overall scores: 1–6, half-band steps. A comparable 0–120 overall score is also reported for a two-year transition. Mini-sets cannot predict a band.', zh: '单项与总等级为 1–6 分，0.5 分间隔；两年过渡期另提供可比较的 0–120 总分。小题组不能预测正式等级。' },
    strategy: [
      { en: 'Complete words using grammar, word families and paragraph meaning together.', zh: '补词结合句法、词形和上下文，不只根据前缀猜。' },
      { en: 'Identify the audience, purpose and required action in daily-life texts.', zh: '日常文本先找读者、目的和所需行动。' },
      { en: 'Track academic claims and examples. Use current ETS tasks, not only pre-2026 material.', zh: '学术短文抓主张和例证关系；使用新版 ETS 材料，不只刷旧题。' },
    ],
    resources: [
      { label: 'Current Reading tasks', url: 'https://www.ets.org/toefl/test-takers/ibt/about/content/reading.html' },
      { label: 'Test content and timing', url: 'https://www.ets.org/toefl/test-takers/ibt/about/content.html' },
      { label: 'Score interpretation', url: 'https://www.ets.org/toefl/test-takers/ibt/scores/understand-scores.html' },
    ],
  },
};
