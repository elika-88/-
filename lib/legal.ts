// Legal details shown on /terms, /refund and /privacy.
// Paddle's domain review requires the seller's legal name in the Terms, so replace every
// value in [brackets] before submitting the site for review or turning on card payments.
export const LEGAL = {
  brand: "Lumina",
  website: "https://lectorai.tech",
  /** Full name of the individual entrepreneur, exactly as registered. */
  operator: "[Full legal name of the individual entrepreneur]",
  /** Individual identification number (ИИН / IIN) or BIN. */
  registration: "[IIN / BIN]",
  country: "Republic of Kazakhstan",
  address: "[Registered address, city, Kazakhstan]",
  email: "[support email address]",
  updated: "1 October 2026",
  refundDays: 14,
} as const;

export const LEGAL_PAGES = [
  { href: "/terms", label: "Terms", labelZh: "服务条款" },
  { href: "/refund", label: "Refund policy", labelZh: "退款政策" },
  { href: "/privacy", label: "Privacy", labelZh: "隐私政策" },
] as const;
