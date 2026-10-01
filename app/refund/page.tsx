import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Refund Policy | Lumina" };

export default function RefundPage() {
  const days = LEGAL.refundDays;
  return <LegalPage current="/refund" title="Refund Policy" lead={`If ${LEGAL.brand} is not right for you, you can get your money back within ${days} days of any payment.`}>
    <h2>{days}-day refund</h2>
    <p>You can ask for a full refund within {days} days of a payment, whether it is a new subscription or a renewal, monthly or yearly. You do not need to give a reason. When we refund a payment, the subscription it paid for is cancelled and the account returns to the Free plan.</p>

    <h2>After {days} days</h2>
    <p>Payments older than {days} days are not refundable, except where the law requires it or where a serious fault on our side prevented you from using the service. You can still cancel at any time to stop future renewals, and you keep your plan until the end of the paid period.</p>

    <h2>How to ask for a refund</h2>
    <ul>
      <li><strong>Paid by card</strong>: card orders are processed by Paddle.com, our Merchant of Record. Reply to your Paddle receipt email, use <a href="https://paddle.net" rel="noopener noreferrer">paddle.net</a> to find your order, or email us and we will arrange it with Paddle.</li>
      <li><strong>Paid with PayPal</strong>: email {LEGAL.email} with the email address of your {LEGAL.brand} account. We refund to your PayPal account.</li>
    </ul>
    <p>We process refund requests within 5 business days. The money usually appears within 5 to 10 business days, depending on your bank or PayPal.</p>

    <h2>Cancelling without a refund</h2>
    <p>To stop renewals only, cancel on the <Link href="/pricing">Plans page</Link> or from your receipt email. See the <Link href="/terms">Terms of Service</Link> for details.</p>

    <h2>Your legal rights</h2>
    <p>This policy adds to, and does not limit, any rights you have under consumer law where you live.</p>
  </LegalPage>;
}
