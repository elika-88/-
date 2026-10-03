"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useSettings } from "@/lib/i18n/SettingsContext";
import type { SupportedLanguage } from "@/lib/i18n/translations";
import { useAuthCopy } from "@/lib/i18n/auth";

const LANGUAGES: { value: SupportedLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ru", label: "Русский" },
  { value: "kk", label: "Қазақша" },
];

/** Shared frame for the account pages: back link, language switch and brand. */
export function AuthShell({ children }: { children: ReactNode }) {
  const { language, setLanguage } = useSettings();
  const { a } = useAuthCopy();
  return <main className="gpt-auth-page">
    <div className="account-top">
      <Link href="/" className="account-back"><ArrowLeft size={16} aria-hidden="true" />{a.back}</Link>
      <label className="account-lang"><span className="sr-only">{a.languageLabel}</span>
        <select value={language} onChange={(event) => setLanguage(event.target.value as SupportedLanguage)} aria-label={a.languageLabel}>
          {LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
    </div>
    <div className="gpt-auth-box">
      <p className="account-brand">
        <Image src="/brand/lumina-logo.png" alt="" width={42} height={42} priority />
        <span>Lumina</span>
      </p>
      {children}
    </div>
  </main>;
}
