import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LEGAL, LEGAL_PAGES } from "@/lib/legal";
import styles from "./legal.module.css";

// Shared shell for the Terms, Refund and Privacy pages: plain, readable, linkable.
export function LegalPage({ title, lead, current, children }: { title: string; lead: string; current: string; children: React.ReactNode }) {
  return <main className={styles.page}>
    <div className={styles.top}>
      <Link href="/" className={styles.back}><ArrowLeft size={16} aria-hidden="true" />Back to Lumina</Link>
      <span className={styles.brand}><Image src="/brand/lumina-logo.png" alt="" width={24} height={24} />{LEGAL.brand}</span>
    </div>
    <article className={styles.doc}>
      <p className={styles.eyebrow}>Legal</p>
      <h1>{title}</h1>
      <p className={styles.lead}>{lead}</p>
      <p className={styles.meta}>Last updated {LEGAL.updated}</p>
      {children}
    </article>
    <LegalLinks current={current} />
  </main>;
}

export function LegalLinks({ current, className }: { current?: string; className?: string }) {
  return <nav className={`${styles.links} ${className ?? ""}`} aria-label="Legal">
    {LEGAL_PAGES.map((page) => <Link key={page.href} href={page.href} aria-current={page.href === current ? "page" : undefined}>{page.label}</Link>)}
    <span>© 2026 {LEGAL.operator}</span>
  </nav>;
}
