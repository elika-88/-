export type SupportedLanguage = "en" | "zh" | "ru" | "kk";

export type Translations = {
  newLecture: string;
  searchPlaceholder: string;
  recent: string;
  noMatching: string;
  noSaved: string;
  untitled: string;
  options: string;
  rename: string;
  delete: string;
  guestUser: string;
  signInOrRegister: string;
  savedLocally: string;
  settingsTitle: string;
  generalTab: string;
  appearanceTab: string;
  studyModelTab: string;
  aboutTab: string;
  themeLabel: string;
  themeDesc: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  langLabel: string;
  langDesc: string;
  buildTitle: string;
  lectureTitleLabel: string;
  optional: string;
  lectureTextLabel: string;
  words: string;
  outputLanguageLabel: string;
  matchLecture: string;
  generateBtn: string;
  generatingBtn: string;
  regenerateBtn: string;
  cancelBtn: string;
  noMaterialsTitle: string;
  summaryTab: string;
  keyPointsTab: string;
  quizTab: string;
  flashcardsTab: string;
  saveChanges: string;
  close: string;
  autoSaveLabel: string;
  autoSaveDesc: string;
  soundEffectsLabel: string;
  soundEffectsDesc: string;
  fontSizeLabel: string;
  fontSizeDesc: string;
  fontNormal: string;
  fontLarge: string;
  fontCompact: string;
  exportDataLabel: string;
  exportDataDesc: string;
  exportBtn: string;
  clearAllHistory: string;
  clearAllHistoryDesc: string;
  clearBtn: string;
  versionLabel: string;
  licenseLabel: string;
};

export const translations: Record<SupportedLanguage, Translations> = {
  en: {
    newLecture: "New lecture",
    searchPlaceholder: "Search lectures...",
    recent: "Recent",
    noMatching: "No matching lectures",
    noSaved: "No saved lectures yet",
    untitled: "Untitled lecture",
    options: "Options",
    rename: "Rename",
    delete: "Delete",
    guestUser: "Guest User",
    signInOrRegister: "Sign in or register",
    savedLocally: "Saved locally on device",
    settingsTitle: "Settings",
    generalTab: "General",
    appearanceTab: "Appearance",
    studyModelTab: "Learning & Data",
    aboutTab: "About",
    themeLabel: "Theme",
    themeDesc: "Customize how Lumina looks on your device",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    langLabel: "Language",
    langDesc: "Choose your preferred interface language",
    buildTitle: "Build your study materials",
    lectureTitleLabel: "Lecture title",
    optional: "(optional)",
    lectureTextLabel: "Lecture text",
    words: "words",
    outputLanguageLabel: "Output language",
    matchLecture: "Match lecture",
    generateBtn: "Generate materials",
    generatingBtn: "Generating",
    regenerateBtn: "Regenerate materials",
    cancelBtn: "Cancel",
    noMaterialsTitle: "No study materials yet",
    summaryTab: "Summary",
    keyPointsTab: "Key points",
    quizTab: "Quiz",
    flashcardsTab: "Flashcards",
    saveChanges: "Done",
    close: "Close",
    autoSaveLabel: "Auto-save drafts",
    autoSaveDesc: "Automatically retain lecture drafts in browser memory",
    soundEffectsLabel: "Interactive sounds",
    soundEffectsDesc: "Play soft feedback tones when flipping cards or answering quizzes",
    fontSizeLabel: "Content font size",
    fontSizeDesc: "Adjust text scale for reading summaries and study cards",
    fontNormal: "Default",
    fontLarge: "Comfortable",
    fontCompact: "Compact",
    exportDataLabel: "Export study sessions",
    exportDataDesc: "Download all your lecture kits as a JSON backup file",
    exportBtn: "Export JSON",
    clearAllHistory: "Delete all saved data",
    clearAllHistoryDesc: "Permanently erase local history and learning materials",
    clearBtn: "Clear all",
    versionLabel: "Lumina AI Study Kit v1.2.0",
    licenseLabel: "MIT Open Source License · Built for Students & Educators",
  },
  zh: {
    newLecture: "新讲座",
    searchPlaceholder: "搜索讲座...",
    recent: "最近记录",
    noMatching: "未找到匹配的讲座",
    noSaved: "暂无保存的讲座",
    untitled: "未命名讲座",
    options: "选项",
    rename: "重命名",
    delete: "删除",
    guestUser: "访客用户",
    signInOrRegister: "登录或注册账号",
    savedLocally: "已保存在本地设备",
    settingsTitle: "设置",
    generalTab: "通用",
    appearanceTab: "外观",
    studyModelTab: "学习与数据",
    aboutTab: "关于",
    themeLabel: "主题模式",
    themeDesc: "自定义 Lumina 在您设备上的视觉呈现",
    themeLight: "浅色明亮",
    themeDark: "深色夜间",
    themeSystem: "跟随系统",
    langLabel: "界面语言",
    langDesc: "选择您习惯的操作语言",
    buildTitle: "生成专属学习材料",
    lectureTitleLabel: "讲座标题",
    optional: "(可选)",
    lectureTextLabel: "讲座正文",
    words: "词",
    outputLanguageLabel: "生成语言",
    matchLecture: "匹配讲座原文",
    generateBtn: "生成学习资料",
    generatingBtn: "正在生成中",
    regenerateBtn: "重新生成资料",
    cancelBtn: "取消",
    noMaterialsTitle: "暂无学习材料",
    summaryTab: "摘要总结",
    keyPointsTab: "核心要点",
    quizTab: "测试习题",
    flashcardsTab: "记忆闪卡",
    saveChanges: "完成",
    close: "关闭",
    autoSaveLabel: "自动保存草稿",
    autoSaveDesc: "在输入内容时自动实时保存在浏览器中",
    soundEffectsLabel: "操作音效反馈",
    soundEffectsDesc: "在翻转闪卡或提交测验时提供柔和的声音反馈",
    fontSizeLabel: "正文字体大小",
    fontSizeDesc: "调节讲座内容与闪卡文字的阅读字号",
    fontNormal: "标准",
    fontLarge: "放大舒适",
    fontCompact: "紧凑",
    exportDataLabel: "导出全部数据",
    exportDataDesc: "将当前所有已保存的讲座与学习包下载为 JSON 备份",
    exportBtn: "导出备份",
    clearAllHistory: "清除本地所有记录",
    clearAllHistoryDesc: "彻底清空此浏览器中存储的讲座与答题记录",
    clearBtn: "清空全部",
    versionLabel: "Lumina AI 智能讲座研学系统 v1.2.0",
    licenseLabel: "MIT 开源协议 · 专为高效学习与备考设计",
  },
  ru: {
    newLecture: "Новая лекция",
    searchPlaceholder: "Поиск лекций...",
    recent: "Недавние",
    noMatching: "Лекции не найдены",
    noSaved: "Нет сохраненных лекций",
    untitled: "Лекция без названия",
    options: "Опции",
    rename: "Переименовать",
    delete: "Удалить",
    guestUser: "Гость",
    signInOrRegister: "Войти или создать аккаунт",
    savedLocally: "Сохранено локально на устройстве",
    settingsTitle: "Настройки",
    generalTab: "Основные",
    appearanceTab: "Внешний вид",
    studyModelTab: "Обучение и данные",
    aboutTab: "О приложении",
    themeLabel: "Тема оформления",
    themeDesc: "Настройте внешний вид Lumina на вашем устройстве",
    themeLight: "Светлая",
    themeDark: "Темная",
    themeSystem: "Системная",
    langLabel: "Язык интерфейса",
    langDesc: "Выберите предпочитаемый язык системы",
    buildTitle: "Создание учебных материалов",
    lectureTitleLabel: "Название лекции",
    optional: "(необязательно)",
    lectureTextLabel: "Текст лекции",
    words: "слов",
    outputLanguageLabel: "Язык генерации",
    matchLecture: "Как в лекции",
    generateBtn: "Сгенерировать материалы",
    generatingBtn: "Генерация...",
    regenerateBtn: "Сгенерировать заново",
    cancelBtn: "Отмена",
    noMaterialsTitle: "Учебных материалов пока нет",
    summaryTab: "Краткое содержание",
    keyPointsTab: "Ключевые моменты",
    quizTab: "Тест",
    flashcardsTab: "Карточки",
    saveChanges: "Готово",
    close: "Закрыть",
    autoSaveLabel: "Автосохранение черновиков",
    autoSaveDesc: "Автоматически сохранять текст лекции в браузере",
    soundEffectsLabel: "Звуковые эффекты",
    soundEffectsDesc: "Воспроизводить мягкий звук при перевороте карточек",
    fontSizeLabel: "Размер шрифта",
    fontSizeDesc: "Масштаб текста для комфортного чтения материалов",
    fontNormal: "Обычный",
    fontLarge: "Увеличенный",
    fontCompact: "Компактный",
    exportDataLabel: "Экспорт данных",
    exportDataDesc: "Скачать все сохраненные материалы в формате JSON",
    exportBtn: "Экспорт JSON",
    clearAllHistory: "Очистить локальную историю",
    clearAllHistoryDesc: "Удалить все сохраненные лекции из браузера",
    clearBtn: "Очистить все",
    versionLabel: "Lumina AI Study Kit v1.2.0",
    licenseLabel: "Лицензия MIT · Создано для студентов и преподавателей",
  },
  kk: {
    newLecture: "Жаңа дәріс",
    searchPlaceholder: "Дәрістерді іздеу...",
    recent: "Жақында қаралғандар",
    noMatching: "Сәйкес дәрістер табылмады",
    noSaved: "Сақталған дәрістер жоқ",
    untitled: "Атаусыз дәріс",
    options: "Опциялар",
    rename: "Атын өзгерту",
    delete: "Жою",
    guestUser: "Қонақ пайдаланушы",
    signInOrRegister: "Кіру немесе тіркелу",
    savedLocally: "Құрылғыда жергілікті сақталған",
    settingsTitle: "Баптаулар",
    generalTab: "Жалпы",
    appearanceTab: "Сыртқы көрініс",
    studyModelTab: "Оқу және деректер",
    aboutTab: "Бағдарлама туралы",
    themeLabel: "Тақырып түрі",
    themeDesc: "Lumina-ның құрылғыңыздағы сыртқы көрінісін баптаңыз",
    themeLight: "Ашық түсті",
    themeDark: "Қараңғы түсті",
    themeSystem: "Жүйелік",
    langLabel: "Интерфейс тілі",
    langDesc: "Қолайлы тілді таңдаңыз",
    buildTitle: "Оқу материалдарын жасау",
    lectureTitleLabel: "Дәріс атауы",
    optional: "(міндетті емес)",
    lectureTextLabel: "Дәріс мәтіні",
    words: "сөз",
    outputLanguageLabel: "Генерация тілі",
    matchLecture: "Дәріс тіліне сәйкес",
    generateBtn: "Материалдарды жасау",
    generatingBtn: "Жасалуда...",
    regenerateBtn: "Қайта генерациялау",
    cancelBtn: "Бас тарту",
    noMaterialsTitle: "Оқу материалдары әлі жоқ",
    summaryTab: "Қысқаша мазмұны",
    keyPointsTab: "Негізгі тұстар",
    quizTab: "Тест сұрақтары",
    flashcardsTab: "Флэш-карталар",
    saveChanges: "Дайын",
    close: "Жабу",
    autoSaveLabel: "Нобайларды автоматты сақтау",
    autoSaveDesc: "Мәтінді браузер жадында автоматты түрде сақтау",
    soundEffectsLabel: "Дыбыстық кері байланыс",
    soundEffectsDesc: "Карточкаларды аударғанда дыбыстық белгі беру",
    fontSizeLabel: "Қаріп өлшемі",
    fontSizeDesc: "Ыңғайлы оқу үшін мәтін өлшемін баптау",
    fontNormal: "Қалыпты",
    fontLarge: "Үлкенірек",
    fontCompact: "Ықшам",
    exportDataLabel: "Деректерді экспорттау",
    exportDataDesc: "Барлық оқу материалдарын JSON файлы түрінде жүктеп алу",
    exportBtn: "Экспорттау",
    clearAllHistory: "Барлық деректерді өшіру",
    clearAllHistoryDesc: "Осы құрылғыдағы барлық сақталған деректерді толық тазарту",
    clearBtn: "Барлығын өшіру",
    versionLabel: "Lumina AI Study Kit v1.2.0",
    licenseLabel: "MIT ашық лицензиясы · Студенттер мен оқытушыларға арналған",
  }
};
