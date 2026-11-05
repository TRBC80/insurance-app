import LegalPage from "../components/LegalPage";
import { SITE } from "../site";

export const metadata = { title: `Refund Policy — ${SITE.name}` };

export default function Refunds() {
  const email = SITE.contactEmail;
  return (
    <LegalPage title="Refund Policy">
      <p className="legal-lede">
        Every report is written for your specific policy, so we don&apos;t
        offer refunds once a report has been delivered. If something goes wrong
        on our side, we&apos;ll make it right.
      </p>

      <h2>When you&apos;ll get a refund</h2>
      <ul>
        <li>
          <b>The report failed.</b> You paid but no report was produced. The
          site offers a free retry first; if that doesn&apos;t work, you&apos;re
          refunded in full.
        </li>
        <li>
          <b>We couldn&apos;t read your document.</b> For example, the report
          says the pages were unreadable or the file wasn&apos;t an insurance
          policy we could analyze.
        </li>
        <li>
          <b>You were charged more than once</b> for the same report.
        </li>
      </ul>

      <h2>When we can&apos;t refund</h2>
      <p>
        Once a report has been delivered, it isn&apos;t refundable — including
        if you change your mind or disagree with how your policy has been
        summarized. You can see a{" "}
        <a href="/">sample report</a> before you buy so you know exactly what
        you&apos;ll get.
      </p>

      <h2>How to ask</h2>
      <p>
        Email <a href={`mailto:${email}`}>{email}</a> (or reply to your
        receipt) within 30 days of your purchase, with the email address you
        paid with and a short description of what went wrong.
      </p>

      <h2>How refunds are paid</h2>
      <p>
        Approved refunds go back to the card or payment method you used, in
        Canadian dollars, and usually appear within 5–10 business days
        depending on your bank.
      </p>

      <p>
        Nothing in this policy limits any rights you have under consumer
        protection laws that apply to you.
      </p>
    </LegalPage>
  );
}
