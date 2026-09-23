"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSettings } from "@/lib/i18n/SettingsContext";
import styles from "./not-found.module.css";

const copy = {
  en: {
    title: "Page not found",
    description: "This link doesn’t lead to a page in Lumina. Check the address or return to your study workspace.",
    action: "Return to workspace",
    home: "Lumina home",
  },
  zh: {
    title: "页面未找到",
    description: "这个链接无法打开 Lumina 页面。请检查网址，或返回学习工作区。",
    action: "返回学习工作区",
    home: "Lumina 首页",
  },
  ru: {
    title: "Страница не найдена",
    description: "Эта ссылка не ведёт на страницу Lumina. Проверьте адрес или вернитесь к учебным материалам.",
    action: "Вернуться к материалам",
    home: "Главная Lumina",
  },
  kk: {
    title: "Бет табылмады",
    description: "Бұл сілтеме Lumina бетіне апармайды. Мекенжайды тексеріңіз немесе оқу кеңістігіне оралыңыз.",
    action: "Оқу кеңістігіне оралу",
    home: "Lumina басты беті",
  },
} as const;

export default function NotFound() {
  const { language } = useSettings();
  const content = copy[language];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label={content.home}>
          <Image src="/brand/lumina-logo.png" alt="" width={32} height={32} priority />
          <span>Lumina</span>
        </Link>
      </header>

      <main className={styles.main}>
        <div className={styles.content}>
          <span className={styles.code} aria-hidden="true">404</span>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
          <Link href="/" className={styles.action}>
            <span>{content.action}</span>
            <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
      </main>
    </div>
  );
}
