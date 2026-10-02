"use client";

import type { GenerationStage } from "@/lib/contracts/generation";
import type { GenerationClientErrorCode } from "@/lib/client/generationStream";
import type { QuizQuestion } from "@/lib/schemas/studyMaterials";
import type { OutputLanguage } from "@/lib/input";
import type { SupportedLanguage } from "./translations";
import { useSettings } from "./SettingsContext";

// Interface text for the study workspace (composer, study materials, quiz, flashcards,
// source viewer). The English strings are the canonical wording used by the e2e tests.

type ErrorMessages = Record<GenerationClientErrorCode, string>;

export type WorkspaceCopy = {
  numberLocale: string;
  verifyUnavailable: string;
  verifyChecking: string;
  stages: Record<GenerationStage, string>;
  attempt: (stage: string, attempt: number, max: number) => string;
  sending: string;
  ready: string;
  canceled: string;
  extracting: string;
  extractInvalidResponse: string;
  extractFailed: string;
  extractInvalid: string;
  imported: string;
  pasteYoutubeFirst: string;
  lectureHistory: string;
  openSidebar: string;
  examPrep: string;
  plans: string;
  newLecture: string;
  heading: string;
  intro: string;
  titleLabel: string;
  titlePlaceholder: string;
  textLabel: string;
  textPlaceholder: string;
  count: (words: string, characters: string, max: string) => string;
  cancel: string;
  importing: string;
  savingLecture: string;
  checkingTasks: string;
  generating: string;
  regenerate: string;
  generate: string;
  dropToImport: string;
  importSource: string;
  orImportFrom: string;
  aFile: string;
  youtubeLabel: string;
  youtubePlaceholder: string;
  importCaptions: string;
  importCaptionsTitle: string;
  stillHere: string;
  signInOrCreate: string;
  seePlans: string;
  syncAccount: string;
  guestWorkspace: string;
  stale: string;
  emptyTitle: string;
  emptyLead: string;
  emptyItems: { summary: [string, string]; keyPoints: [string, string]; quiz: [string, string]; flashcards: [string, string] };
  emptyFoot: string;
  deleteTitle: string;
  renameTitle: string;
  deleteAccount: string;
  deleteDevice: string;
  titleLabelPlain: string;
  delete: string;
  save: string;
  errors: ErrorMessages;
  dashboard: {
    label: string;
    eyebrow: string;
    supported: (a: number, b: number) => string;
    covered: (a: number, b: number) => string;
    note: string;
    tabsLabel: string;
    tabs: { summary: string; keypoints: string; quiz: string; flashcards: string };
    overview: string;
    keyTakeaways: string;
    points: (n: number) => string;
    essential: string;
    limitations: (n: number) => string;
  };
  quiz: {
    kinds: Record<QuizQuestion["kind"], string>;
    none: string;
    complete: string;
    scoreLine: (correct: number, incorrect: number) => string;
    revisit: (topics: string) => string;
    tryAgain: string;
    reviewMissed: string;
    questionOf: (i: number, n: number) => string;
    progressLabel: string;
    correctAnswer: string;
    incorrectAnswer: string;
    correctAnswerIs: (letter: string) => string;
    previous: string;
    seeResults: string;
    nextQuestion: string;
    check: string;
    tip: (n: number) => string;
  };
  flashcards: {
    missedOnly: string;
    cards: (n: number) => string;
    reviewCard: string;
    answerAria: (back: string) => string;
    questionAria: (front: string) => string;
    question: string;
    answer: string;
    previousCard: string;
    nextCard: string;
    keys: string;
    noneMissed: string;
    none: string;
    showAll: string;
  };
  source: {
    view: (n: number) => string;
    eyebrow: string;
    title: string;
    close: string;
    citations: string;
    item: (i: number) => string;
    notLocated: string;
  };
  outputLanguage: string;
  outputOptions: Record<OutputLanguage, string>;
};

const en: WorkspaceCopy = {
  numberLocale: "en-US",
  verifyUnavailable: "Account verification is unavailable. Your lectures are hidden until your account can be checked.",
  verifyChecking: "Checking your account before opening lectures…",
  stages: {
    validating: "Validating lecture", analyzing: "Analyzing lecture", generating: "Generating study materials",
    verifying: "Checking source evidence", correcting: "Refining study materials", complete: "Receiving final result",
  },
  attempt: (stage, attempt, max) => `${stage}: attempt ${attempt} of ${max}`,
  sending: "Sending lecture",
  ready: "Study materials ready.",
  canceled: "Generation canceled.",
  extracting: "Extracting course content",
  extractInvalidResponse: "The server returned an invalid response while extracting this course. Try again shortly.",
  extractFailed: "Course content could not be extracted.",
  extractInvalid: "The extracted course content was invalid.",
  imported: "Course content imported. Review it, then generate materials.",
  pasteYoutubeFirst: "Paste a YouTube link first.",
  lectureHistory: "Lecture history",
  openSidebar: "Open sidebar",
  examPrep: "Exam prep",
  plans: "Plans",
  newLecture: "New lecture",
  heading: "What are you studying today?",
  intro: "Paste a lecture or import a file. Lumina turns it into a summary, key points, a quiz and flashcards, each linked back to the original text.",
  titleLabel: "Lecture title (optional)",
  titlePlaceholder: "Untitled lecture",
  textLabel: "Lecture text",
  textPlaceholder: "Paste lecture notes, a transcript or an article here. At least a few paragraphs works best.",
  count: (words, characters, max) => `${words} words · ${characters} / ${max}`,
  cancel: "Cancel",
  importing: "Importing",
  savingLecture: "Saving lecture",
  checkingTasks: "Checking tasks",
  generating: "Generating",
  regenerate: "Regenerate materials",
  generate: "Generate materials",
  dropToImport: "Drop to import this file",
  importSource: "Import course source",
  orImportFrom: "Or import from",
  aFile: "A file",
  youtubeLabel: "YouTube video link",
  youtubePlaceholder: "A YouTube link with captions",
  importCaptions: "Import captions",
  importCaptionsTitle: "Import YouTube captions",
  stillHere: " Your lecture is still here. Try generating again.",
  signInOrCreate: "Sign in or create an account",
  seePlans: "See plans",
  syncAccount: "Your lectures sync with your account",
  guestWorkspace: "Guest workspace · saved on this device only",
  stale: "These materials are from the previous version of this lecture. Regenerate to update them.",
  emptyTitle: "No study materials yet",
  emptyLead: "Here is what you will get once you generate:",
  emptyItems: {
    summary: ["Summary", "An overview and the main sections in plain language."],
    keyPoints: ["Key points", "The ideas worth remembering, marked by importance."],
    quiz: ["Quiz", "Multiple-choice questions with explanations."],
    flashcards: ["Flashcards", "Cards to flip, with a review mode for mistakes."],
  },
  emptyFoot: "Every item links to the sentence it came from, so you can check it.",
  deleteTitle: "Delete lecture?",
  renameTitle: "Rename lecture",
  deleteAccount: "This deletes the lecture and its study materials from your account on all devices. If syncing fails, the deletion remains pending until you retry.",
  deleteDevice: "This removes the lecture and its study materials from this device.",
  titleLabelPlain: "Lecture title",
  delete: "Delete",
  save: "Save",
  errors: {
    LOGIN_REQUIRED: "Sign in to generate study materials. Your lecture is still saved in this browser.",
    BACKGROUND_REQUIRED: "Reload your workspace and generate from your saved course.",
    INVALID_ORIGIN: "This request could not be verified. Reload the page and try again.",
    INVALID_REQUEST: "The request could not be accepted. Check the lecture and try again.",
    INVALID_PROVIDER_CONFIG: "API connection settings must be configured on the server.",
    UNSUPPORTED_MEDIA_TYPE: "The server could not read this request format.",
    EMPTY_INPUT: "Enter lecture text before generating study materials.",
    INPUT_TOO_SHORT: "The lecture needs at least 80 words and 300 non-whitespace characters.",
    INPUT_TOO_LONG: "The lecture exceeds the supported input size.",
    INSUFFICIENT_CONTENT: "The lecture does not contain enough information to generate study materials.",
    SERVER_CONFIG: "The AI connection is unavailable. Check the server URL, API key, and model access.",
    RATE_LIMITED: "The AI service is busy. Try again later.",
    UPSTREAM_FAILURE: "The AI service could not complete the request.",
    MODEL_REFUSAL: "The AI service could not generate materials for this lecture.",
    INVALID_OUTPUT: "The AI response did not contain valid study materials.",
    VERIFICATION_FAILED: "The generated materials could not be verified against the lecture.",
    TIMEOUT: "Generation took too long. Try again later.",
    NOT_IMPLEMENTED: "The backend generation service is not available yet.",
    PLAN_LIMIT: "You have reached today's generation limit.",
    PRO_REQUIRED: "This needs Lumina Pro.",
    NETWORK_ERROR: "The server could not be reached. Check your connection and try again.",
    INVALID_RESPONSE: "The server returned an invalid response. No materials were saved.",
    STREAM_INTERRUPTED: "Generation ended before a complete result arrived. Try again.",
  },
  dashboard: {
    label: "Study materials",
    eyebrow: "YOUR STUDY MATERIALS",
    supported: (a, b) => `${a} / ${b} items supported`,
    covered: (a, b) => `${a} / ${b} topics covered`,
    note: "AI review results. Confirm important details against the lecture source.",
    tabsLabel: "Study material type",
    tabs: { summary: "Summary", keypoints: "Key Points", quiz: "Quiz", flashcards: "Flashcards" },
    overview: "Overview",
    keyTakeaways: "Key takeaways",
    points: (n) => `${n} points`,
    essential: "Essential",
    limitations: (n) => `Limitations and review notes (${n})`,
  },
  quiz: {
    kinds: { recall: "Recall", understanding: "Understanding", comparison: "Comparison", reasoning: "Reasoning" },
    none: "No quiz questions in these materials.",
    complete: "Quiz complete",
    scoreLine: (c, i) => `${c} correct, ${i} incorrect`,
    revisit: (topics) => `Topics to revisit: ${topics}`,
    tryAgain: "Try again",
    reviewMissed: "Review missed topics",
    questionOf: (i, n) => `Question ${i} of ${n}`,
    progressLabel: "Quiz progress",
    correctAnswer: "Correct answer",
    incorrectAnswer: "Incorrect answer",
    correctAnswerIs: (letter) => `Correct answer: ${letter}`,
    previous: "Previous",
    seeResults: "See results",
    nextQuestion: "Next question",
    check: "Check answer",
    tip: (n) => `Tip: press 1–${n} to choose, then Check answer`,
  },
  flashcards: {
    missedOnly: "Missed topics only",
    cards: (n) => `${n} cards`,
    reviewCard: "Review card",
    answerAria: (back) => `Answer: ${back}. Show question`,
    questionAria: (front) => `Question: ${front}. Show answer`,
    question: "QUESTION",
    answer: "ANSWER",
    previousCard: "Previous card",
    nextCard: "Next card",
    keys: "Space to flip · ← → to move between cards",
    noneMissed: "No flashcards match your missed topics yet.",
    none: "No flashcards in these materials.",
    showAll: "Show all cards",
  },
  source: {
    view: (n) => `View source${n > 1 ? ` (${n})` : ""}`,
    eyebrow: "LECTURE SOURCE",
    title: "Lecture source",
    close: "Close source",
    citations: "Source citations",
    item: (i) => `Source ${i}`,
    notLocated: "This citation could not be located exactly. Check it against the full lecture below.",
  },
  outputLanguage: "Output language",
  outputOptions: { auto: "Match lecture", en: "English", zh: "中文 (Chinese)", ru: "Русский (Russian)" },
};

const zh: WorkspaceCopy = {
  numberLocale: "zh-CN",
  verifyUnavailable: "暂时无法验证账号。在账号验证通过之前，你的讲稿会先隐藏。",
  verifyChecking: "正在验证账号，稍后打开你的讲稿…",
  stages: {
    validating: "检查讲稿", analyzing: "分析讲稿", generating: "生成学习材料",
    verifying: "核对原文出处", correcting: "修订学习材料", complete: "接收最终结果",
  },
  attempt: (stage, attempt, max) => `${stage}：第 ${attempt} 次尝试，共 ${max} 次`,
  sending: "正在发送讲稿",
  ready: "学习材料已生成。",
  canceled: "已取消生成。",
  extracting: "正在提取课程内容",
  extractInvalidResponse: "提取课程内容时服务器返回了无效响应，请稍后重试。",
  extractFailed: "无法提取课程内容。",
  extractInvalid: "提取到的课程内容无效。",
  imported: "课程内容已导入。检查无误后即可生成学习材料。",
  pasteYoutubeFirst: "请先粘贴 YouTube 链接。",
  lectureHistory: "讲稿历史",
  openSidebar: "打开侧边栏",
  examPrep: "备考专区",
  plans: "会员方案",
  newLecture: "新讲稿",
  heading: "今天想学点什么？",
  intro: "粘贴讲稿或导入文件，Lumina 会生成摘要、要点、测验和闪卡，每一条都能追溯到原文。",
  titleLabel: "讲稿标题（可选）",
  titlePlaceholder: "未命名讲稿",
  textLabel: "讲稿正文",
  textPlaceholder: "在这里粘贴课堂笔记、录音文字稿或文章。内容至少有几段，效果最好。",
  count: (words, characters, max) => `${words} 词 · ${characters} / ${max}`,
  cancel: "取消",
  importing: "正在导入",
  savingLecture: "正在保存讲稿",
  checkingTasks: "正在检查任务",
  generating: "正在生成",
  regenerate: "重新生成",
  generate: "生成学习材料",
  dropToImport: "松开即可导入此文件",
  importSource: "导入课程来源",
  orImportFrom: "或者从这里导入",
  aFile: "文件",
  youtubeLabel: "YouTube 视频链接",
  youtubePlaceholder: "带字幕的 YouTube 链接",
  importCaptions: "导入字幕",
  importCaptionsTitle: "导入 YouTube 字幕",
  stillHere: " 你的讲稿还在，可以再试一次。",
  signInOrCreate: "登录或注册账号",
  seePlans: "查看会员方案",
  syncAccount: "讲稿会同步到你的账号",
  guestWorkspace: "访客模式 · 只保存在这台设备上",
  stale: "这些学习材料基于讲稿的旧版本，重新生成即可更新。",
  emptyTitle: "还没有学习材料",
  emptyLead: "生成后你会得到：",
  emptyItems: {
    summary: ["摘要", "用通俗的语言概括全文和主要章节。"],
    keyPoints: ["要点", "值得记住的知识点，按重要程度标注。"],
    quiz: ["测验", "带解析的选择题。"],
    flashcards: ["闪卡", "可翻面的记忆卡片，并能专门复习做错的内容。"],
  },
  emptyFoot: "每一条都链接到原文中的句子，方便你核对。",
  deleteTitle: "删除这篇讲稿？",
  renameTitle: "重命名讲稿",
  deleteAccount: "这会从你的账号中删除这篇讲稿及其学习材料，所有设备都会同步删除。如果同步失败，删除会一直等待，直到你重试。",
  deleteDevice: "这会从这台设备上删除这篇讲稿及其学习材料。",
  titleLabelPlain: "讲稿标题",
  delete: "删除",
  save: "保存",
  errors: {
    LOGIN_REQUIRED: "登录后才能生成学习材料。你的讲稿仍保存在这个浏览器里。",
    BACKGROUND_REQUIRED: "请刷新页面，从已保存的讲稿重新生成。",
    INVALID_ORIGIN: "无法验证这次请求。请刷新页面后重试。",
    INVALID_REQUEST: "请求无法被接受。请检查讲稿后重试。",
    INVALID_PROVIDER_CONFIG: "服务器尚未配置 AI 接口。",
    UNSUPPORTED_MEDIA_TYPE: "服务器无法读取这种请求格式。",
    EMPTY_INPUT: "请先输入讲稿内容，再生成学习材料。",
    INPUT_TOO_SHORT: "讲稿至少需要 80 个词、300 个非空白字符。",
    INPUT_TOO_LONG: "讲稿超出了支持的长度。",
    INSUFFICIENT_CONTENT: "讲稿的信息量不足，无法生成学习材料。",
    SERVER_CONFIG: "AI 服务暂时无法连接。请检查服务器地址、API 密钥和模型权限。",
    RATE_LIMITED: "AI 服务繁忙，请稍后再试。",
    UPSTREAM_FAILURE: "AI 服务未能完成这次请求。",
    MODEL_REFUSAL: "AI 服务无法为这篇讲稿生成学习材料。",
    INVALID_OUTPUT: "AI 返回的内容不是有效的学习材料。",
    VERIFICATION_FAILED: "生成的材料无法与讲稿原文核对一致。",
    TIMEOUT: "生成时间过长，请稍后再试。",
    NOT_IMPLEMENTED: "后台生成服务暂未开放。",
    PLAN_LIMIT: "今天的生成次数已用完。",
    PRO_REQUIRED: "此功能需要 Lumina Pro 会员。",
    NETWORK_ERROR: "无法连接服务器。请检查网络后重试。",
    INVALID_RESPONSE: "服务器返回了无效结果，未保存任何材料。",
    STREAM_INTERRUPTED: "生成在完成前中断了，请重试。",
  },
  dashboard: {
    label: "学习材料",
    eyebrow: "你的学习材料",
    supported: (a, b) => `${a} / ${b} 条有原文依据`,
    covered: (a, b) => `覆盖 ${a} / ${b} 个主题`,
    note: "以上为 AI 核对结果，重要内容请对照讲稿原文确认。",
    tabsLabel: "学习材料类型",
    tabs: { summary: "摘要", keypoints: "要点", quiz: "测验", flashcards: "闪卡" },
    overview: "概览",
    keyTakeaways: "核心要点",
    points: (n) => `${n} 条`,
    essential: "重点",
    limitations: (n) => `局限与核对说明（${n}）`,
  },
  quiz: {
    kinds: { recall: "记忆", understanding: "理解", comparison: "比较", reasoning: "推理" },
    none: "这份材料里没有测验题。",
    complete: "测验完成",
    scoreLine: (c, i) => `答对 ${c} 题，答错 ${i} 题`,
    revisit: (topics) => `建议复习的主题：${topics}`,
    tryAgain: "再做一次",
    reviewMissed: "复习做错的主题",
    questionOf: (i, n) => `第 ${i} 题，共 ${n} 题`,
    progressLabel: "测验进度",
    correctAnswer: "回答正确",
    incorrectAnswer: "回答错误",
    correctAnswerIs: (letter) => `正确答案：${letter}`,
    previous: "上一题",
    seeResults: "查看结果",
    nextQuestion: "下一题",
    check: "提交答案",
    tip: (n) => `提示：按 1–${n} 选择选项，再点“提交答案”`,
  },
  flashcards: {
    missedOnly: "只看做错的主题",
    cards: (n) => `${n} 张卡片`,
    reviewCard: "复习卡片",
    answerAria: (back) => `答案：${back}。显示问题`,
    questionAria: (front) => `问题：${front}。显示答案`,
    question: "问题",
    answer: "答案",
    previousCard: "上一张",
    nextCard: "下一张",
    keys: "空格键翻面 · ← → 切换卡片",
    noneMissed: "还没有与做错主题对应的闪卡。",
    none: "这份材料里没有闪卡。",
    showAll: "显示全部卡片",
  },
  source: {
    view: (n) => `查看原文${n > 1 ? `（${n}）` : ""}`,
    eyebrow: "讲稿原文",
    title: "讲稿原文",
    close: "关闭原文",
    citations: "原文引用",
    item: (i) => `出处 ${i}`,
    notLocated: "没能在原文中精确定位这条引用，请对照下方的完整讲稿核对。",
  },
  outputLanguage: "输出语言",
  outputOptions: { auto: "与讲稿一致", en: "English", zh: "中文", ru: "Русский" },
};

const ru: WorkspaceCopy = {
  numberLocale: "ru-RU",
  verifyUnavailable: "Не удаётся проверить аккаунт. Лекции скрыты, пока проверка не пройдёт.",
  verifyChecking: "Проверяем аккаунт перед открытием лекций…",
  stages: {
    validating: "Проверка лекции", analyzing: "Анализ лекции", generating: "Создание учебных материалов",
    verifying: "Сверка с источником", correcting: "Уточнение материалов", complete: "Получение результата",
  },
  attempt: (stage, attempt, max) => `${stage}: попытка ${attempt} из ${max}`,
  sending: "Отправка лекции",
  ready: "Учебные материалы готовы.",
  canceled: "Создание отменено.",
  extracting: "Извлечение содержимого курса",
  extractInvalidResponse: "Сервер вернул некорректный ответ при извлечении курса. Попробуйте чуть позже.",
  extractFailed: "Не удалось извлечь содержимое курса.",
  extractInvalid: "Извлечённое содержимое курса некорректно.",
  imported: "Содержимое курса импортировано. Проверьте его и создайте материалы.",
  pasteYoutubeFirst: "Сначала вставьте ссылку на YouTube.",
  lectureHistory: "История лекций",
  openSidebar: "Открыть боковую панель",
  examPrep: "Подготовка к экзаменам",
  plans: "Тарифы",
  newLecture: "Новая лекция",
  heading: "Что вы изучаете сегодня?",
  intro: "Вставьте лекцию или импортируйте файл. Lumina создаст конспект, ключевые идеи, тест и карточки — каждый пункт со ссылкой на исходный текст.",
  titleLabel: "Название лекции (необязательно)",
  titlePlaceholder: "Лекция без названия",
  textLabel: "Текст лекции",
  textPlaceholder: "Вставьте сюда конспект, расшифровку или статью. Лучше всего — хотя бы несколько абзацев.",
  count: (words, characters, max) => `${words} слов · ${characters} / ${max}`,
  cancel: "Отмена",
  importing: "Импорт",
  savingLecture: "Сохранение лекции",
  checkingTasks: "Проверка задач",
  generating: "Создание",
  regenerate: "Создать заново",
  generate: "Создать материалы",
  dropToImport: "Отпустите, чтобы импортировать файл",
  importSource: "Импорт источника курса",
  orImportFrom: "Или импортируйте",
  aFile: "Файл",
  youtubeLabel: "Ссылка на видео YouTube",
  youtubePlaceholder: "Ссылка на YouTube с субтитрами",
  importCaptions: "Импортировать субтитры",
  importCaptionsTitle: "Импортировать субтитры YouTube",
  stillHere: " Ваша лекция сохранена. Попробуйте ещё раз.",
  signInOrCreate: "Войдите или создайте аккаунт",
  seePlans: "Посмотреть тарифы",
  syncAccount: "Лекции синхронизируются с вашим аккаунтом",
  guestWorkspace: "Гостевой режим · сохраняется только на этом устройстве",
  stale: "Эти материалы созданы по предыдущей версии лекции. Создайте их заново, чтобы обновить.",
  emptyTitle: "Учебных материалов пока нет",
  emptyLead: "Вот что вы получите после создания:",
  emptyItems: {
    summary: ["Конспект", "Обзор и основные разделы простым языком."],
    keyPoints: ["Ключевые идеи", "То, что стоит запомнить, с пометкой важности."],
    quiz: ["Тест", "Вопросы с вариантами ответов и пояснениями."],
    flashcards: ["Карточки", "Карточки с переворотом и режимом повторения ошибок."],
  },
  emptyFoot: "Каждый пункт ссылается на предложение из лекции, чтобы его можно было проверить.",
  deleteTitle: "Удалить лекцию?",
  renameTitle: "Переименовать лекцию",
  deleteAccount: "Лекция и её материалы будут удалены из аккаунта на всех устройствах. Если синхронизация не удастся, удаление дождётся повторной попытки.",
  deleteDevice: "Лекция и её материалы будут удалены с этого устройства.",
  titleLabelPlain: "Название лекции",
  delete: "Удалить",
  save: "Сохранить",
  errors: {
    LOGIN_REQUIRED: "Войдите, чтобы создавать учебные материалы. Лекция сохранена в этом браузере.",
    BACKGROUND_REQUIRED: "Обновите страницу и создайте материалы из сохранённой лекции.",
    INVALID_ORIGIN: "Не удалось проверить запрос. Обновите страницу и попробуйте снова.",
    INVALID_REQUEST: "Запрос не принят. Проверьте лекцию и попробуйте снова.",
    INVALID_PROVIDER_CONFIG: "Подключение к ИИ не настроено на сервере.",
    UNSUPPORTED_MEDIA_TYPE: "Сервер не может прочитать этот формат запроса.",
    EMPTY_INPUT: "Введите текст лекции перед созданием материалов.",
    INPUT_TOO_SHORT: "В лекции должно быть не меньше 80 слов и 300 непробельных символов.",
    INPUT_TOO_LONG: "Лекция превышает допустимый размер.",
    INSUFFICIENT_CONTENT: "В лекции недостаточно информации для создания материалов.",
    SERVER_CONFIG: "Подключение к ИИ недоступно. Проверьте адрес сервера, ключ API и доступ к модели.",
    RATE_LIMITED: "Сервис ИИ перегружен. Попробуйте позже.",
    UPSTREAM_FAILURE: "Сервис ИИ не смог выполнить запрос.",
    MODEL_REFUSAL: "Сервис ИИ не смог создать материалы для этой лекции.",
    INVALID_OUTPUT: "Ответ ИИ не содержит корректных учебных материалов.",
    VERIFICATION_FAILED: "Не удалось сверить созданные материалы с лекцией.",
    TIMEOUT: "Создание заняло слишком много времени. Попробуйте позже.",
    NOT_IMPLEMENTED: "Серверная генерация пока недоступна.",
    PLAN_LIMIT: "Дневной лимит создания исчерпан.",
    PRO_REQUIRED: "Для этого нужен Lumina Pro.",
    NETWORK_ERROR: "Сервер недоступен. Проверьте подключение и попробуйте снова.",
    INVALID_RESPONSE: "Сервер вернул некорректный ответ. Материалы не сохранены.",
    STREAM_INTERRUPTED: "Создание прервалось до получения полного результата. Попробуйте снова.",
  },
  dashboard: {
    label: "Учебные материалы",
    eyebrow: "ВАШИ УЧЕБНЫЕ МАТЕРИАЛЫ",
    supported: (a, b) => `${a} / ${b} пунктов подтверждены`,
    covered: (a, b) => `${a} / ${b} тем охвачено`,
    note: "Результаты проверки ИИ. Важные детали сверяйте с текстом лекции.",
    tabsLabel: "Тип учебных материалов",
    tabs: { summary: "Конспект", keypoints: "Ключевые идеи", quiz: "Тест", flashcards: "Карточки" },
    overview: "Обзор",
    keyTakeaways: "Главное",
    points: (n) => `Пунктов: ${n}`,
    essential: "Важно",
    limitations: (n) => `Ограничения и замечания проверки (${n})`,
  },
  quiz: {
    kinds: { recall: "Запоминание", understanding: "Понимание", comparison: "Сравнение", reasoning: "Рассуждение" },
    none: "В этих материалах нет вопросов теста.",
    complete: "Тест завершён",
    scoreLine: (c, i) => `Верно: ${c}, неверно: ${i}`,
    revisit: (topics) => `Темы для повторения: ${topics}`,
    tryAgain: "Пройти снова",
    reviewMissed: "Повторить ошибки",
    questionOf: (i, n) => `Вопрос ${i} из ${n}`,
    progressLabel: "Прогресс теста",
    correctAnswer: "Верный ответ",
    incorrectAnswer: "Неверный ответ",
    correctAnswerIs: (letter) => `Верный ответ: ${letter}`,
    previous: "Назад",
    seeResults: "Результаты",
    nextQuestion: "Следующий вопрос",
    check: "Проверить ответ",
    tip: (n) => `Подсказка: нажмите 1–${n}, чтобы выбрать, затем «Проверить ответ»`,
  },
  flashcards: {
    missedOnly: "Только темы с ошибками",
    cards: (n) => `Карточек: ${n}`,
    reviewCard: "Карточка для повторения",
    answerAria: (back) => `Ответ: ${back}. Показать вопрос`,
    questionAria: (front) => `Вопрос: ${front}. Показать ответ`,
    question: "ВОПРОС",
    answer: "ОТВЕТ",
    previousCard: "Предыдущая карточка",
    nextCard: "Следующая карточка",
    keys: "Пробел — перевернуть · ← → — листать карточки",
    noneMissed: "Пока нет карточек по темам с ошибками.",
    none: "В этих материалах нет карточек.",
    showAll: "Показать все карточки",
  },
  source: {
    view: (n) => `Источник${n > 1 ? ` (${n})` : ""}`,
    eyebrow: "ТЕКСТ ЛЕКЦИИ",
    title: "Текст лекции",
    close: "Закрыть источник",
    citations: "Цитаты из источника",
    item: (i) => `Источник ${i}`,
    notLocated: "Не удалось точно найти эту цитату. Сверьте её с полным текстом лекции ниже.",
  },
  outputLanguage: "Язык материалов",
  outputOptions: { auto: "Как в лекции", en: "English", zh: "中文", ru: "Русский" },
};

const kk: WorkspaceCopy = {
  numberLocale: "kk-KZ",
  verifyUnavailable: "Аккаунтты тексеру мүмкін емес. Тексеру өткенше дәрістеріңіз жасырын тұрады.",
  verifyChecking: "Дәрістерді ашпас бұрын аккаунтыңызды тексеріп жатырмыз…",
  stages: {
    validating: "Дәрісті тексеру", analyzing: "Дәрісті талдау", generating: "Оқу материалдарын жасау",
    verifying: "Дереккөзбен салыстыру", correcting: "Материалдарды нақтылау", complete: "Нәтижені алу",
  },
  attempt: (stage, attempt, max) => `${stage}: ${max} әрекеттің ${attempt}-сі`,
  sending: "Дәріс жіберілуде",
  ready: "Оқу материалдары дайын.",
  canceled: "Жасау тоқтатылды.",
  extracting: "Курс мазмұны алынуда",
  extractInvalidResponse: "Курсты алу кезінде сервер жарамсыз жауап берді. Сәлден кейін қайталап көріңіз.",
  extractFailed: "Курс мазмұнын алу мүмкін болмады.",
  extractInvalid: "Алынған курс мазмұны жарамсыз.",
  imported: "Курс мазмұны импортталды. Тексеріп шығып, материалдарды жасаңыз.",
  pasteYoutubeFirst: "Алдымен YouTube сілтемесін қойыңыз.",
  lectureHistory: "Дәрістер тарихы",
  openSidebar: "Бүйір панелін ашу",
  examPrep: "Емтиханға дайындық",
  plans: "Тарифтер",
  newLecture: "Жаңа дәріс",
  heading: "Бүгін не оқисыз?",
  intro: "Дәрісті қойыңыз немесе файл импорттаңыз. Lumina одан қысқаша мазмұн, негізгі ойлар, тест және карточкалар жасайды — әрқайсысы бастапқы мәтінге сілтейді.",
  titleLabel: "Дәріс атауы (міндетті емес)",
  titlePlaceholder: "Атаусыз дәріс",
  textLabel: "Дәріс мәтіні",
  textPlaceholder: "Конспектіні, жазбаны немесе мақаланы осында қойыңыз. Кемінде бірнеше абзац болса жақсы.",
  count: (words, characters, max) => `${words} сөз · ${characters} / ${max}`,
  cancel: "Бас тарту",
  importing: "Импорттау",
  savingLecture: "Дәріс сақталуда",
  checkingTasks: "Тапсырмалар тексерілуде",
  generating: "Жасалуда",
  regenerate: "Қайта жасау",
  generate: "Материалдарды жасау",
  dropToImport: "Файлды импорттау үшін осында тастаңыз",
  importSource: "Курс дереккөзін импорттау",
  orImportFrom: "Немесе импорттаңыз",
  aFile: "Файл",
  youtubeLabel: "YouTube бейне сілтемесі",
  youtubePlaceholder: "Субтитрі бар YouTube сілтемесі",
  importCaptions: "Субтитрді импорттау",
  importCaptionsTitle: "YouTube субтитрін импорттау",
  stillHere: " Дәрісіңіз сақталған. Қайта жасап көріңіз.",
  signInOrCreate: "Кіріңіз немесе аккаунт ашыңыз",
  seePlans: "Тарифтерді қарау",
  syncAccount: "Дәрістеріңіз аккаунтпен синхрондалады",
  guestWorkspace: "Қонақ режимі · тек осы құрылғыда сақталады",
  stale: "Бұл материалдар дәрістің алдыңғы нұсқасы бойынша жасалған. Жаңарту үшін қайта жасаңыз.",
  emptyTitle: "Әзірге оқу материалдары жоқ",
  emptyLead: "Жасағаннан кейін мыналарды аласыз:",
  emptyItems: {
    summary: ["Қысқаша мазмұн", "Шолу және негізгі бөлімдер қарапайым тілмен."],
    keyPoints: ["Негізгі ойлар", "Есте сақтауға тұрарлық ойлар, маңыздылығы белгіленген."],
    quiz: ["Тест", "Түсіндірмесі бар таңдау сұрақтары."],
    flashcards: ["Карточкалар", "Аударылатын карточкалар және қателерді қайталау режимі."],
  },
  emptyFoot: "Әр тармақ дәрістегі сөйлемге сілтейді, сондықтан оны тексере аласыз.",
  deleteTitle: "Дәрісті жою керек пе?",
  renameTitle: "Дәрістің атын өзгерту",
  deleteAccount: "Дәріс пен оның материалдары аккаунтыңыздан барлық құрылғыда жойылады. Синхрондау сәтсіз болса, жою қайталағанша күтеді.",
  deleteDevice: "Дәріс пен оның материалдары осы құрылғыдан жойылады.",
  titleLabelPlain: "Дәріс атауы",
  delete: "Жою",
  save: "Сақтау",
  errors: {
    LOGIN_REQUIRED: "Оқу материалдарын жасау үшін кіріңіз. Дәрісіңіз осы браузерде сақталған.",
    BACKGROUND_REQUIRED: "Бетті жаңартып, сақталған дәрістен қайта жасаңыз.",
    INVALID_ORIGIN: "Сұрауды растау мүмкін болмады. Бетті жаңартып, қайталап көріңіз.",
    INVALID_REQUEST: "Сұрау қабылданбады. Дәрісті тексеріп, қайталап көріңіз.",
    INVALID_PROVIDER_CONFIG: "Серверде ЖИ қосылымы бапталмаған.",
    UNSUPPORTED_MEDIA_TYPE: "Сервер бұл сұрау пішімін оқи алмайды.",
    EMPTY_INPUT: "Материал жасамас бұрын дәріс мәтінін енгізіңіз.",
    INPUT_TOO_SHORT: "Дәрісте кемінде 80 сөз және бос орынсыз 300 таңба болуы керек.",
    INPUT_TOO_LONG: "Дәріс рұқсат етілген көлемнен асып кетті.",
    INSUFFICIENT_CONTENT: "Дәрісте материал жасауға ақпарат жеткіліксіз.",
    SERVER_CONFIG: "ЖИ қосылымы қолжетімсіз. Сервер мекенжайын, API кілтін және модельге рұқсатты тексеріңіз.",
    RATE_LIMITED: "ЖИ қызметі бос емес. Кейінірек қайталап көріңіз.",
    UPSTREAM_FAILURE: "ЖИ қызметі сұрауды орындай алмады.",
    MODEL_REFUSAL: "ЖИ қызметі бұл дәріс үшін материал жасай алмады.",
    INVALID_OUTPUT: "ЖИ жауабында жарамды оқу материалдары жоқ.",
    VERIFICATION_FAILED: "Жасалған материалдарды дәріспен салыстырып растау мүмкін болмады.",
    TIMEOUT: "Жасау тым ұзаққа созылды. Кейінірек қайталап көріңіз.",
    NOT_IMPLEMENTED: "Серверлік жасау қызметі әлі қолжетімсіз.",
    PLAN_LIMIT: "Бүгінгі жасау лимиті таусылды.",
    PRO_REQUIRED: "Бұл үшін Lumina Pro қажет.",
    NETWORK_ERROR: "Серверге қосылу мүмкін емес. Байланысты тексеріп, қайталап көріңіз.",
    INVALID_RESPONSE: "Сервер жарамсыз жауап берді. Материалдар сақталмады.",
    STREAM_INTERRUPTED: "Толық нәтиже келмей тұрып жасау үзілді. Қайталап көріңіз.",
  },
  dashboard: {
    label: "Оқу материалдары",
    eyebrow: "СІЗДІҢ ОҚУ МАТЕРИАЛДАРЫҢЫЗ",
    supported: (a, b) => `${a} / ${b} тармақ расталды`,
    covered: (a, b) => `${a} / ${b} тақырып қамтылды`,
    note: "ЖИ тексеруінің нәтижесі. Маңызды мәліметтерді дәріс мәтінімен салыстырыңыз.",
    tabsLabel: "Оқу материалының түрі",
    tabs: { summary: "Қысқаша мазмұн", keypoints: "Негізгі ойлар", quiz: "Тест", flashcards: "Карточкалар" },
    overview: "Шолу",
    keyTakeaways: "Басты ойлар",
    points: (n) => `${n} тармақ`,
    essential: "Маңызды",
    limitations: (n) => `Шектеулер мен тексеру ескертпелері (${n})`,
  },
  quiz: {
    kinds: { recall: "Есте сақтау", understanding: "Түсіну", comparison: "Салыстыру", reasoning: "Пайымдау" },
    none: "Бұл материалдарда тест сұрақтары жоқ.",
    complete: "Тест аяқталды",
    scoreLine: (c, i) => `Дұрыс: ${c}, қате: ${i}`,
    revisit: (topics) => `Қайталайтын тақырыптар: ${topics}`,
    tryAgain: "Қайта өту",
    reviewMissed: "Қателерді қайталау",
    questionOf: (i, n) => `${n} сұрақтың ${i}-сі`,
    progressLabel: "Тест барысы",
    correctAnswer: "Дұрыс жауап",
    incorrectAnswer: "Қате жауап",
    correctAnswerIs: (letter) => `Дұрыс жауап: ${letter}`,
    previous: "Артқа",
    seeResults: "Нәтижені көру",
    nextQuestion: "Келесі сұрақ",
    check: "Жауапты тексеру",
    tip: (n) => `Кеңес: таңдау үшін 1–${n} пернесін басып, «Жауапты тексеру» түймесін басыңыз`,
  },
  flashcards: {
    missedOnly: "Тек қате кеткен тақырыптар",
    cards: (n) => `${n} карточка`,
    reviewCard: "Қайталау карточкасы",
    answerAria: (back) => `Жауап: ${back}. Сұрақты көрсету`,
    questionAria: (front) => `Сұрақ: ${front}. Жауапты көрсету`,
    question: "СҰРАҚ",
    answer: "ЖАУАП",
    previousCard: "Алдыңғы карточка",
    nextCard: "Келесі карточка",
    keys: "Бос орын — аудару · ← → — карточкалар арасында жылжу",
    noneMissed: "Қате кеткен тақырыптарға сай карточка әзірге жоқ.",
    none: "Бұл материалдарда карточкалар жоқ.",
    showAll: "Барлық карточканы көрсету",
  },
  source: {
    view: (n) => `Дереккөз${n > 1 ? ` (${n})` : ""}`,
    eyebrow: "ДӘРІС МӘТІНІ",
    title: "Дәріс мәтіні",
    close: "Дереккөзді жабу",
    citations: "Дереккөз дәйексөздері",
    item: (i) => `Дереккөз ${i}`,
    notLocated: "Бұл дәйексөзді дәл табу мүмкін болмады. Төмендегі толық дәріс мәтінімен салыстырыңыз.",
  },
  outputLanguage: "Материал тілі",
  outputOptions: { auto: "Дәріс тілінде", en: "English", zh: "中文", ru: "Русский" },
};

export const workspaceCopy: Record<SupportedLanguage, WorkspaceCopy> = { en, zh, ru, kk };

export function useWorkspaceCopy(): WorkspaceCopy {
  const { language } = useSettings();
  return workspaceCopy[language] ?? en;
}

/** Localized text for a generation error; plan errors keep the server's specific wording in English. */
export function generationErrorText(copy: WorkspaceCopy, error: { code: GenerationClientErrorCode; message: string }) {
  if (copy === en) return error.message;
  return copy.errors[error.code] ?? error.message;
}
