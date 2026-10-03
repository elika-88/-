"use client";

import type { SupportedLanguage } from "./translations";
import { useSettings } from "./SettingsContext";

// Text for the sign-in, sign-up, email verification and password reset pages.
// English is the canonical wording (used by the e2e tests).

export type AuthCopy = {
  back: string;
  languageLabel: string;
  pleaseWait: string;
  // sign in / sign up
  signInTitle: string;
  signUpTitle: string;
  signInLead: string;
  signUpLead: string;
  username: string;
  usernameOrEmail: string;
  usernameHint: string;
  email: string;
  password: string;
  showPassword: string;
  hidePassword: string;
  forgot: string;
  agree: [string, string, string, string, string];
  createAccount: string;
  signIn: string;
  haveAccount: string;
  newHere: string;
  checkInboxTitle: string;
  checkInboxText: string;
  backToSignIn: string;
  // verify
  verifyTitle: string;
  verifyOpening: string;
  verifyInvalid: string;
  registerAgain: string;
  verifyLead: string;
  passwordHint: string;
  confirmPassword: string;
  verifySubmit: string;
  mismatch: string;
  // forgot / reset
  forgotTitle: string;
  forgotLead: string;
  sendLink: string;
  sentTitle: string;
  sentText: string;
  resetTitle: string;
  resetLead: string;
  resetInvalid: string;
  requestNewLink: string;
  newPassword: string;
  resetSubmit: string;
  // errors by server code
  errors: Record<string, string>;
  genericError: string;
};

const en: AuthCopy = {
  back: "Back to study",
  languageLabel: "Language",
  pleaseWait: "Please wait",
  signInTitle: "Welcome back",
  signUpTitle: "Create an account",
  signInLead: "Sign in to save lectures to your account and continue on another device. Guest history is imported only when you choose.",
  signUpLead: "Enter your username and email. We’ll send a link to finish setting up your account.",
  username: "Username",
  usernameOrEmail: "Username or email",
  usernameHint: "3–32 letters, numbers, underscores or hyphens.",
  email: "Email",
  password: "Password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  forgot: "Forgot password?",
  agree: ["By creating an account you agree to the ", "Terms of Service", " and ", "Privacy Policy", "."],
  createAccount: "Create account",
  signIn: "Sign in",
  haveAccount: "Already have an account? ",
  newHere: "New to Lumina? ",
  checkInboxTitle: "Check your inbox",
  checkInboxText: "If this address can be registered, you’ll receive a link to verify it and set your password. The link expires in 30 minutes.",
  backToSignIn: "Back to sign in",
  verifyTitle: "Verify your email",
  verifyOpening: "Opening verification link…",
  verifyInvalid: "This verification link is invalid.",
  registerAgain: "Register again",
  verifyLead: "Choose a password to finish creating your account.",
  passwordHint: "Use at least 8 characters.",
  confirmPassword: "Confirm password",
  verifySubmit: "Verify and create account",
  mismatch: "Passwords do not match.",
  forgotTitle: "Reset your password",
  forgotLead: "Enter the email you signed up with. We’ll send a link to choose a new password.",
  sendLink: "Send reset link",
  sentTitle: "Check your inbox",
  sentText: "If an account uses this email, you’ll receive a link to choose a new password. The link expires in 30 minutes. Check your spam folder if it doesn’t arrive.",
  resetTitle: "Choose a new password",
  resetLead: "Your new password signs you out on your other devices.",
  resetInvalid: "This reset link is invalid.",
  requestNewLink: "Request a new link",
  newPassword: "New password",
  resetSubmit: "Save new password",
  errors: {
    INVALID_CREDENTIALS: "Incorrect username, email, or password.",
    RATE_LIMITED: "Too many attempts. Please try again later.",
    EMAIL_UNAVAILABLE: "We couldn’t send the email right now. Try again later.",
    INVALID_VERIFICATION: "This verification link is invalid or expired. Register again.",
    INVALID_RESET: "This reset link is invalid or expired. Request a new one.",
    INVALID_REQUEST: "Check the details and try again.",
    INVALID_ORIGIN: "This request could not be verified. Reload the page and try again.",
    UNAVAILABLE: "The account service is temporarily unavailable.",
  },
  genericError: "Connection failed. Try again.",
};

const zh: AuthCopy = {
  back: "返回学习",
  languageLabel: "语言",
  pleaseWait: "请稍候",
  signInTitle: "欢迎回来",
  signUpTitle: "创建账号",
  signInLead: "登录后，讲稿会保存到你的账号，换设备也能继续。访客记录只有在你选择时才会导入。",
  signUpLead: "填写用户名和邮箱，我们会发一个链接，帮你完成账号设置。",
  username: "用户名",
  usernameOrEmail: "用户名或邮箱",
  usernameHint: "3–32 位字母、数字、下划线或连字符。",
  email: "邮箱",
  password: "密码",
  showPassword: "显示密码",
  hidePassword: "隐藏密码",
  forgot: "忘记密码？",
  agree: ["创建账号即表示你同意", "服务条款", "和", "隐私政策", "。"],
  createAccount: "创建账号",
  signIn: "登录",
  haveAccount: "已有账号？",
  newHere: "第一次使用 Lumina？",
  checkInboxTitle: "请查收邮件",
  checkInboxText: "如果这个邮箱可以注册，你会收到一封邮件，用来验证邮箱并设置密码。链接 30 分钟内有效。",
  backToSignIn: "返回登录",
  verifyTitle: "验证邮箱",
  verifyOpening: "正在打开验证链接…",
  verifyInvalid: "这个验证链接无效。",
  registerAgain: "重新注册",
  verifyLead: "设置密码，完成账号创建。",
  passwordHint: "至少 8 个字符。",
  confirmPassword: "确认密码",
  verifySubmit: "验证并创建账号",
  mismatch: "两次输入的密码不一致。",
  forgotTitle: "重置密码",
  forgotLead: "输入注册时用的邮箱，我们会发一个链接，用来设置新密码。",
  sendLink: "发送重置链接",
  sentTitle: "请查收邮件",
  sentText: "如果有账号使用这个邮箱，你会收到一个设置新密码的链接，30 分钟内有效。没收到的话，看看垃圾邮件文件夹。",
  resetTitle: "设置新密码",
  resetLead: "设置新密码后，其他设备上的登录会退出。",
  resetInvalid: "这个重置链接无效。",
  requestNewLink: "重新获取链接",
  newPassword: "新密码",
  resetSubmit: "保存新密码",
  errors: {
    INVALID_CREDENTIALS: "用户名、邮箱或密码不正确。",
    RATE_LIMITED: "尝试次数太多，请稍后再试。",
    EMAIL_UNAVAILABLE: "暂时无法发送邮件，请稍后再试。",
    INVALID_VERIFICATION: "验证链接无效或已过期，请重新注册。",
    INVALID_RESET: "重置链接无效或已过期，请重新获取。",
    INVALID_REQUEST: "请检查填写的信息后重试。",
    INVALID_ORIGIN: "无法验证这次请求，请刷新页面后重试。",
    UNAVAILABLE: "账号服务暂时不可用。",
  },
  genericError: "连接失败，请重试。",
};

const ru: AuthCopy = {
  back: "Назад к учёбе",
  languageLabel: "Язык",
  pleaseWait: "Подождите",
  signInTitle: "С возвращением",
  signUpTitle: "Создать аккаунт",
  signInLead: "Войдите, чтобы сохранять лекции в аккаунте и продолжать на другом устройстве. Гостевые лекции импортируются только по вашему выбору.",
  signUpLead: "Укажите имя пользователя и почту. Мы пришлём ссылку, чтобы завершить настройку аккаунта.",
  username: "Имя пользователя",
  usernameOrEmail: "Имя пользователя или почта",
  usernameHint: "3–32 буквы, цифры, подчёркивания или дефисы.",
  email: "Почта",
  password: "Пароль",
  showPassword: "Показать пароль",
  hidePassword: "Скрыть пароль",
  forgot: "Забыли пароль?",
  agree: ["Создавая аккаунт, вы принимаете ", "Условия использования", " и ", "Политику конфиденциальности", "."],
  createAccount: "Создать аккаунт",
  signIn: "Войти",
  haveAccount: "Уже есть аккаунт? ",
  newHere: "Впервые в Lumina? ",
  checkInboxTitle: "Проверьте почту",
  checkInboxText: "Если этот адрес можно зарегистрировать, вы получите ссылку, чтобы подтвердить его и задать пароль. Ссылка действует 30 минут.",
  backToSignIn: "Вернуться ко входу",
  verifyTitle: "Подтвердите почту",
  verifyOpening: "Открываем ссылку…",
  verifyInvalid: "Ссылка для подтверждения недействительна.",
  registerAgain: "Зарегистрироваться снова",
  verifyLead: "Задайте пароль, чтобы завершить создание аккаунта.",
  passwordHint: "Не меньше 8 символов.",
  confirmPassword: "Повторите пароль",
  verifySubmit: "Подтвердить и создать аккаунт",
  mismatch: "Пароли не совпадают.",
  forgotTitle: "Сброс пароля",
  forgotLead: "Укажите почту, с которой регистрировались. Мы пришлём ссылку для нового пароля.",
  sendLink: "Отправить ссылку",
  sentTitle: "Проверьте почту",
  sentText: "Если с этой почтой есть аккаунт, вы получите ссылку для нового пароля. Она действует 30 минут. Если письма нет, проверьте папку «Спам».",
  resetTitle: "Новый пароль",
  resetLead: "После смены пароля вы выйдете из аккаунта на других устройствах.",
  resetInvalid: "Ссылка для сброса недействительна.",
  requestNewLink: "Запросить новую ссылку",
  newPassword: "Новый пароль",
  resetSubmit: "Сохранить пароль",
  errors: {
    INVALID_CREDENTIALS: "Неверное имя пользователя, почта или пароль.",
    RATE_LIMITED: "Слишком много попыток. Попробуйте позже.",
    EMAIL_UNAVAILABLE: "Не удалось отправить письмо. Попробуйте позже.",
    INVALID_VERIFICATION: "Ссылка недействительна или устарела. Зарегистрируйтесь снова.",
    INVALID_RESET: "Ссылка для сброса недействительна или устарела. Запросите новую.",
    INVALID_REQUEST: "Проверьте данные и попробуйте снова.",
    INVALID_ORIGIN: "Не удалось проверить запрос. Обновите страницу и попробуйте снова.",
    UNAVAILABLE: "Сервис аккаунтов временно недоступен.",
  },
  genericError: "Ошибка соединения. Попробуйте снова.",
};

const kk: AuthCopy = {
  back: "Оқуға оралу",
  languageLabel: "Тіл",
  pleaseWait: "Күте тұрыңыз",
  signInTitle: "Қайта қош келдіңіз",
  signUpTitle: "Аккаунт ашу",
  signInLead: "Кірсеңіз, дәрістер аккаунтыңызда сақталады және басқа құрылғыда жалғастыра аласыз. Қонақ дәрістері тек өзіңіз таңдағанда импортталады.",
  signUpLead: "Пайдаланушы аты мен поштаңызды енгізіңіз. Аккаунтты баптауды аяқтау үшін сілтеме жібереміз.",
  username: "Пайдаланушы аты",
  usernameOrEmail: "Пайдаланушы аты немесе пошта",
  usernameHint: "3–32 әріп, сан, астын сызу немесе сызықша.",
  email: "Пошта",
  password: "Құпиясөз",
  showPassword: "Құпиясөзді көрсету",
  hidePassword: "Құпиясөзді жасыру",
  forgot: "Құпиясөзді ұмыттыңыз ба?",
  agree: ["Аккаунт ашу арқылы сіз ", "Пайдалану шарттарымен", " және ", "Құпиялық саясатымен", " келісесіз."],
  createAccount: "Аккаунт ашу",
  signIn: "Кіру",
  haveAccount: "Аккаунтыңыз бар ма? ",
  newHere: "Lumina-да алғаш рет пе? ",
  checkInboxTitle: "Поштаңызды тексеріңіз",
  checkInboxText: "Бұл мекенжайды тіркеуге болса, оны растап, құпиясөз орнатуға арналған сілтеме келеді. Сілтеме 30 минут жарамды.",
  backToSignIn: "Кіруге оралу",
  verifyTitle: "Поштаны растау",
  verifyOpening: "Растау сілтемесі ашылуда…",
  verifyInvalid: "Бұл растау сілтемесі жарамсыз.",
  registerAgain: "Қайта тіркелу",
  verifyLead: "Аккаунт ашуды аяқтау үшін құпиясөз орнатыңыз.",
  passwordHint: "Кемінде 8 таңба.",
  confirmPassword: "Құпиясөзді қайталаңыз",
  verifySubmit: "Растау және аккаунт ашу",
  mismatch: "Құпиясөздер сәйкес емес.",
  forgotTitle: "Құпиясөзді қалпына келтіру",
  forgotLead: "Тіркелген поштаңызды енгізіңіз. Жаңа құпиясөз орнатуға сілтеме жібереміз.",
  sendLink: "Сілтеме жіберу",
  sentTitle: "Поштаңызды тексеріңіз",
  sentText: "Бұл поштамен аккаунт болса, жаңа құпиясөз орнатуға сілтеме келеді. Ол 30 минут жарамды. Хат келмесе, «Спам» қалтасын тексеріңіз.",
  resetTitle: "Жаңа құпиясөз",
  resetLead: "Жаңа құпиясөз орнатқанда басқа құрылғылардағы кіру тоқтатылады.",
  resetInvalid: "Бұл қалпына келтіру сілтемесі жарамсыз.",
  requestNewLink: "Жаңа сілтеме алу",
  newPassword: "Жаңа құпиясөз",
  resetSubmit: "Құпиясөзді сақтау",
  errors: {
    INVALID_CREDENTIALS: "Пайдаланушы аты, пошта немесе құпиясөз қате.",
    RATE_LIMITED: "Әрекет тым көп. Кейінірек қайталап көріңіз.",
    EMAIL_UNAVAILABLE: "Хатты қазір жіберу мүмкін болмады. Кейінірек қайталап көріңіз.",
    INVALID_VERIFICATION: "Растау сілтемесі жарамсыз немесе мерзімі өткен. Қайта тіркеліңіз.",
    INVALID_RESET: "Қалпына келтіру сілтемесі жарамсыз немесе мерзімі өткен. Жаңасын алыңыз.",
    INVALID_REQUEST: "Деректерді тексеріп, қайталап көріңіз.",
    INVALID_ORIGIN: "Сұрауды растау мүмкін болмады. Бетті жаңартып, қайталап көріңіз.",
    UNAVAILABLE: "Аккаунт қызметі уақытша қолжетімсіз.",
  },
  genericError: "Байланыс қатесі. Қайталап көріңіз.",
};

export const authCopy: Record<SupportedLanguage, AuthCopy> = { en, zh, ru, kk };

export function useAuthCopy() {
  const { language } = useSettings();
  return { a: authCopy[language] ?? en, language };
}

/** Prefer our translated message for known server error codes. */
export function authErrorText(copy: AuthCopy, body: { error?: unknown; code?: unknown } | null) {
  // English keeps the server's own wording; other languages use the translation for the code.
  if (copy === en) return typeof body?.error === "string" ? body.error : copy.genericError;
  const code = typeof body?.code === "string" ? body.code : "";
  return copy.errors[code] ?? copy.genericError;
}
