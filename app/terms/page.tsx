import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import styles from "@/components/legal/legal.module.css";
import { LEGAL } from "@/lib/legal";
import { PLAN_PRICES } from "@/lib/billing/plans";

export const metadata: Metadata = { title: "Terms of Service | Lumina" };

export default function TermsPage() {
  const p = PLAN_PRICES;
  return <LegalPage current="/terms" title="Terms of Service" lead={`These terms govern your use of ${LEGAL.brand} at ${LEGAL.website}. By creating an account or buying a plan you agree to them.`}>
    <div className={styles.card}>
      <p><strong>Service provider:</strong> {LEGAL.operator}, individual entrepreneur, {LEGAL.country}</p>
      <p><strong>Registration number:</strong> {LEGAL.registration}</p>
      <p><strong>Address:</strong> {LEGAL.address}</p>
      <p><strong>Contact:</strong> {LEGAL.email}</p>
    </div>

    <h2>1. The service</h2>
    <p>{LEGAL.brand} is an online study tool. You paste or import a lecture, notes, a document or video captions, and {LEGAL.brand} uses AI to create a summary, key points, a quiz and flashcards linked to the source text. Pro members can also create SAT, IELTS and TOEFL style reading practice from passages they provide.</p>
    <p>Study materials are generated automatically and can contain mistakes. Check important facts against your original material. Exam practice questions are original material written for practice; {LEGAL.brand} is not affiliated with or endorsed by College Board, IDP, the British Council, Cambridge or ETS, and estimated scores are not official results.</p>

    <h2>2. Accounts</h2>
    <p>You can use the free plan as a guest or with an account. You must give a valid email address, keep your password private and be at least 13 years old (or the minimum age required where you live). You are responsible for activity on your account.</p>

    <h2>3. Plans and prices</h2>
    <ul>
      <li><strong>Free</strong>: a limited number of generations per day.</li>
      <li><strong>Basic</strong>: US${p.basic.monthly} per month or US${p.basic.yearly} per year. Higher daily limits and longer lectures; does not include exam prep.</li>
      <li><strong>Pro</strong>: US${p.pro.monthly} per month or US${p.pro.yearly} per year. Everything in Basic plus exam prep.</li>
    </ul>
    <p>Current limits are listed on the <Link href="/pricing">Plans page</Link>. Taxes may be added at checkout depending on where you live. We may change prices for future billing periods; we will tell you at least 14 days before a change applies to your subscription.</p>

    <h2>4. Payments and renewal</h2>
    <p>Paid plans are subscriptions that renew automatically at the end of each monthly or yearly period until you cancel.</p>
    <ul>
      <li><strong>Card payments</strong> are processed by our online reseller Paddle.com. Paddle.com is the Merchant of Record for those orders and also handles customer service inquiries and returns for them. Paddle&apos;s buyer terms apply to those purchases.</li>
      <li><strong>PayPal payments</strong> are collected by {LEGAL.operator} through PayPal.</li>
    </ul>
    <p>We never see or store your full card number.</p>

    <h2>5. Cancelling</h2>
    <p>You can cancel at any time on the Plans page, in your PayPal account (PayPal subscriptions), from your Paddle receipt email (card subscriptions), or by contacting us. Cancelling stops the next renewal; you keep your plan until the end of the period you have paid for. Refunds are described in our <Link href="/refund">Refund Policy</Link>.</p>

    <h2>6. Your content</h2>
    <p>You keep all rights to the lectures and documents you upload and to the materials generated from them. You give us permission to store and process that content only to provide the service to you. Only upload content you have the right to use. Do not upload other people&apos;s personal data without a lawful basis.</p>

    <h2>7. Acceptable use</h2>
    <p>Do not misuse the service: no attempts to break or overload it, to get around plan limits, to resell access, to scrape it automatically, or to use it for anything illegal. We may suspend accounts that do.</p>

    <h2>8. Availability</h2>
    <p>We work to keep {LEGAL.brand} available but cannot promise uninterrupted service. We may change or remove features; if a change materially reduces a paid plan, you can cancel and ask for a pro-rata refund of the unused period.</p>

    <h2>9. Liability</h2>
    <p>The service is provided as is. To the extent the law allows, we are not liable for indirect losses, for decisions you make based on generated material, or for exam results. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits rights you have under consumer protection law.</p>

    <h2>10. Ending the agreement</h2>
    <p>You can stop using {LEGAL.brand} at any time and ask us to delete your account. We may end or suspend access for serious or repeated breaches of these terms.</p>

    <h2>11. Law and changes</h2>
    <p>These terms are governed by the laws of the {LEGAL.country}, without affecting mandatory consumer rights in your country of residence. We may update these terms; for material changes we will notify you by email or in the app before they take effect.</p>

    <h2>12. Contact</h2>
    <p>Questions about these terms: {LEGAL.email}.</p>
  </LegalPage>;
}
