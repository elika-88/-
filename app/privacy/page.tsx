import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy | Lumina" };

export default function PrivacyPage() {
  return <LegalPage current="/privacy" title="Privacy Policy" lead={`What ${LEGAL.brand} collects, why, who processes it and how you can control it. ${LEGAL.operator} (${LEGAL.country}) is responsible for this data.`}>
    <h2>What we collect</h2>
    <ul>
      <li><strong>Account details</strong>: username, email address and a hashed password.</li>
      <li><strong>Your study content</strong>: lectures, documents, YouTube links and passages you submit, and the materials generated from them.</li>
      <li><strong>Usage</strong>: how many generations you use each day, so plan limits work. Guests get an anonymous cookie for the same purpose.</li>
      <li><strong>Subscription records</strong>: plan, status, renewal date and the payment provider&apos;s subscription ID. We do not receive your card number.</li>
      <li><strong>Technical data</strong>: IP address and browser details in server logs, used for security and to fix errors.</li>
    </ul>

    <h2>Why we use it</h2>
    <p>To run the service you asked for (creating and syncing your study materials), to manage your account and subscription, to prevent abuse, and to answer support requests. We do not sell your data and do not use your content to advertise to you.</p>

    <h2>Who processes it for us</h2>
    <ul>
      <li><strong>AI model provider</strong>: your submitted text is sent to an AI model API to generate study materials.</li>
      <li><strong>Hosting and database</strong>: Vercel (hosting) and Turso (database).</li>
      <li><strong>Background jobs</strong>: Inngest runs long generations for signed-in users.</li>
      <li><strong>Email</strong>: Resend sends verification and account emails.</li>
      <li><strong>Payments</strong>: Paddle.com (card payments, as Merchant of Record) and PayPal. They process payment details under their own privacy policies.</li>
    </ul>
    <p>These providers may store data outside your country. We only share what each one needs to do its job.</p>

    <h2>Cookies and local storage</h2>
    <p>We use essential cookies to keep you signed in and to count guest usage, and browser storage to keep guest lectures and preferences on your device. We do not use advertising cookies.</p>

    <h2>How long we keep it</h2>
    <p>Account data and study content are kept until you delete them or your account. Usage counters are kept for a short period. Subscription and payment records are kept as long as tax and accounting law requires.</p>

    <h2>Your choices and rights</h2>
    <p>You can export or delete your lectures in the app and ask us to delete your account. Depending on where you live, you may also have the right to access, correct, restrict or object to processing of your data, and to complain to a data protection authority. Email {LEGAL.email} and we will reply within 30 days.</p>

    <h2>Children</h2>
    <p>{LEGAL.brand} is not intended for children under 13. If you believe a child has given us personal data, contact us and we will delete it.</p>

    <h2>Changes</h2>
    <p>We will post updates here and change the date above. For significant changes we will also notify signed-in users.</p>
  </LegalPage>;
}
