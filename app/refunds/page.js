import LegalPage from "../components/LegalPage";
import { SITE } from "../site";

export const metadata = { title: `Refund Policy — ${SITE.name}` };

export default function Refunds() {
  const email = SITE.contactEmail;
  return (
    <LegalPage title="Refund Policy">
      <p className="legal-lede">
        <b>Not useful? Full refund, no questions asked.</b>
      </p>

      <h2>How to get a refund</h2>
      <p>
        Reply to your emailed receipt, or email{" "}
        <a href={`mailto:${email}`}>{email}</a> with the email address you paid
        with. You don&apos;t need to give a reason.
      </p>

      <h2>When</h2>
      <p>
        Ask within 30 days of your purchase. If the analysis failed after you
        paid and you didn&apos;t get a report, you&apos;re always entitled to a
        refund.
      </p>

      <h2>How it&apos;s paid</h2>
      <p>
        Refunds go back to the card or payment method you used, in Canadian
        dollars. Once we&apos;ve processed it, it usually appears within 5–10
        business days, depending on your bank.
      </p>

      <h2>Failed reports</h2>
      <p>
        If something goes wrong after payment, the site offers a free retry
        using the same payment — you&apos;re never charged twice for one
        report.
      </p>
    </LegalPage>
  );
}
