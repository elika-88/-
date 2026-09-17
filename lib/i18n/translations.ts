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
  adminConsole: string;
  backToStudy: string;
  signOut: string;
  management: string;
  aiRelayTab: string;
  userDirTab: string;
  auditLogsTab: string;
  gatewayUrl: string;
  gatewayUrlDesc: string;
  apiKeyLabel: string;
  apiKeyDesc: string;
  activeInVault: string;
  unset: string;
  modelLabel: string;
  modelDesc: string;
  protocolLabel: string;
  protocolDesc: string;
  saveChangesBtn: string;
  searchUsers: string;
  totalUsers: string;
  noUsersYet: string;
  noLogsYet: string;
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
    adminConsole: "Admin Console",
    backToStudy: "Study Workspace",
    signOut: "Sign out",
    management: "Management",
    aiRelayTab: "AI Relay & Model",
    userDirTab: "User Directory",
    auditLogsTab: "Audit Logs",
    gatewayUrl: "Gateway Base URL",
    gatewayUrlDesc: "Custom relay, reverse proxy or official OpenAI endpoint.",
    apiKeyLabel: "Authorization API Key",
    apiKeyDesc: "Encrypted with AES-256-GCM in server database.",
    activeInVault: "Active in Vault ✓",
    unset: "Unset",
    modelLabel: "Model Identifier",
    modelDesc: "Supports gpt-5.5, gpt-4o, or upstream custom models.",
    protocolLabel: "Transmission Protocol",
    protocolDesc: "Chat Completions is recommended for third-party proxy relays.",
    saveChangesBtn: "Save Changes",
    searchUsers: "Search users by name or email...",
    totalUsers: "Total accounts",
    noUsersYet: "No users registered yet.",
    noLogsYet: "No audit logs recorded yet.",
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
    adminConsole: "系统管理后台",
    backToStudy: "学习工作台",
    signOut: "退出登录",
    management: "系统管理",
    aiRelayTab: "模型与中转站",
    userDirTab: "用户目录",
    auditLogsTab: "操作审计日志",
    gatewayUrl: "接口网关地址 (Base URL)",
    gatewayUrlDesc: "支持第三方中转站、反向代理或 OpenAI 官方地址。",
    apiKeyLabel: "授权 API 密钥",
    apiKeyDesc: "已在服务端使用 AES-256-GCM 高度加密存储。",
    activeInVault: "安全库已激活 ✓",
    unset: "未设置",
    modelLabel: "模型标识 (Model ID)",
    modelDesc: "支持 gpt-5.5, gpt-4o 或自定义大模型名称。",
    protocolLabel: "传输协议规范",
    protocolDesc: "对于第三方中转站，强烈推荐使用 Chat Completions 模式。",
    saveChangesBtn: "保存配置",
    searchUsers: "输入用户名或邮箱过滤...",
    totalUsers: "用户总数",
    noUsersYet: "暂无注册用户。",
    noLogsYet: "暂无操作审计日志。",
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
    adminConsole: "Панель администратора",
    backToStudy: "Рабочая область",
    signOut: "Выйти",
    management: "Управление",
    aiRelayTab: "ИИ Шлюз и Модель",
    userDirTab: "Пользователи",
    auditLogsTab: "Журнал аудита",
    gatewayUrl: "Базовый URL шлюза",
    gatewayUrlDesc: "Сторонний прокси, реле или официальный OpenAI URL.",
    apiKeyLabel: "Ключ API авторизации",
    apiKeyDesc: "Зашифровано с помощью AES-256-GCM в базе данных.",
    activeInVault: "Активен в хранилище ✓",
    unset: "Не установлен",
    modelLabel: "Идентификатор модели",
    modelDesc: "Поддерживает gpt-5.5, gpt-4o или пользовательские модели.",
    protocolLabel: "Протокол передачи",
    protocolDesc: "Рекомендуется Chat Completions для сторонних шлюзов.",
    saveChangesBtn: "Сохранить",
    searchUsers: "Поиск пользователей...",
    totalUsers: "Всего аккаунтов",
    noUsersYet: "Пока нет зарегистрированных пользователей.",
    noLogsYet: "Логов пока нет.",
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
    adminConsole: "Әкімшілік басқару панелі",
    backToStudy: "Жұмыс кеңістігі",
    signOut: "Шығу",
    management: "Басқару",
    aiRelayTab: "ЖИ шлюзі және Модель",
    userDirTab: "Пайдаланушылар тізімі",
    auditLogsTab: "Аудит журналдары",
    gatewayUrl: "Шлюздің негізгі мекенжайы (Base URL)",
    gatewayUrlDesc: "Үшінші тарап проксиі немесе ресми OpenAI түйіні.",
    apiKeyLabel: "Авторизациялық API кілті",
    apiKeyDesc: "Деректер қорында AES-256-GCM арқылы шифрланған.",
    activeInVault: "Қоймада белсенді ✓",
    unset: "Орнатылмаған",
    modelLabel: "Модель идентификаторы",
    modelDesc: "gpt-5.5, gpt-4o немесе өзге модельдерді қолдайды.",
    protocolLabel: "Тасымалдау хаттамасы",
    protocolDesc: "Үшінші тарап шлюздері үшін Chat Completions ұсынылады.",
    saveChangesBtn: "Сақтау",
    searchUsers: "Пайдаланушыны іздеу...",
    totalUsers: "Барлық тіркелгілер",
    noUsersYet: "Тіркелген пайдаланушылар жоқ.",
    noLogsYet: "Аудит журналдары әлі жоқ.",
  }
};
