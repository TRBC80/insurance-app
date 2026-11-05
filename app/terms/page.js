import LegalPage from "../components/LegalPage";
import { SITE } from "../site";

export const metadata = { title: `Terms of Service — ${SITE.name}` };

export default function Terms() {
  const email = SITE.contactEmail;
  const law = SITE.province
    ? `the laws of the Province of ${SITE.province} and the federal laws of Canada that apply there`
    : "the laws of Canada and of the province in which we are based";
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms apply when you use insuranceinenglish.com, run by{" "}
        {SITE.legalName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By uploading a
        document or buying a report, you agree to them.
      </p>

      <h2>What we provide</h2>
      <p>
        You upload an insurance policy (a PDF or photos of its pages) and, after
        payment, receive a plain-English summary written by an AI model,
        covering what the policy appears to cover and exclude, what you pay,
        notable conditions, and questions to ask your broker.
      </p>

      <h2>This is not insurance or legal advice</h2>
      <p>
        Your report is general information to help you understand your
        document. We are not an insurer, broker or agent, and we&apos;re not
        licensed to give insurance or legal advice. The report doesn&apos;t
        change your policy, guarantee coverage, or predict how a claim will be
        decided — only your insurer decides that, based on your full policy.
        Before making decisions about coverage or claims, confirm the details
        with your insurer or a licensed broker.
      </p>

      <h2>Accuracy</h2>
      <p>
        Reports are produced by AI and can contain mistakes or miss things,
        especially if pages are missing, blurry or out of order. Always check
        anything important against your actual policy wording.
      </p>

      <h2>Price and payment</h2>
      <ul>
        <li>The price is shown before you pay, in Canadian dollars (CAD).</li>
        <li>Payment is processed by Stripe. One payment buys one report for the document you uploaded.</li>
        <li>
          If something goes wrong after you pay and no report is produced, you
          can try again at no extra charge, or ask for a refund.
        </li>
        <li>
          Your report is shown once in your browser and isn&apos;t stored by
          us — save or print it before leaving the page.
        </li>
      </ul>

      <h2>Refunds</h2>
      <p>
        See our <a href="/refunds">Refund Policy</a>. In short: if a report
        fails or your document can&apos;t be read, you can retry free or get a
        refund. Reports that have been delivered aren&apos;t refundable.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Only upload documents you&apos;re entitled to share — your own policy, or one you have permission to use.</li>
        <li>Don&apos;t misuse the service, attempt to break it, or use it to process other people&apos;s information without their consent.</li>
      </ul>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, we aren&apos;t liable for losses arising
        from decisions you make based on a report, including denied claims or
        coverage gaps, and our total liability to you is limited to the amount
        you paid for the report concerned. Nothing in these terms limits rights
        you have under consumer protection laws that can&apos;t be waived.
      </p>

      <h2>Privacy</h2>
      <p>
        How we handle your information is described in our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Changes and governing law</h2>
      <p>
        We may update these terms; the date at the top shows the latest
        version. These terms are governed by {law}.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email <a href={`mailto:${email}`}>{email}</a>.
      </p>
    </LegalPage>
  );
}
