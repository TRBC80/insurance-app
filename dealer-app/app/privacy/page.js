import LegalPage from "../components/LegalPage";
import { SITE } from "../site";

export const metadata = { title: `Privacy Policy — ${SITE.name}` };

export default function Privacy() {
  const email = SITE.contactEmail;
  return (
    <LegalPage title="Privacy Policy">
      <p>
        {SITE.legalName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) runs
        {SITE.domain}. Vehicle contracts are personal, so we keep
        what we collect to the minimum needed to produce your report. This
        policy explains what we collect, why, who we share it with, and your
        rights under Canada&apos;s privacy laws, including PIPEDA.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>We read your document once to write your report. We don&apos;t keep a copy.</li>
        <li>We don&apos;t keep your report either — save or print it before you leave the page.</li>
        <li>We never see your card number; Stripe handles payment.</li>
        <li>We never sell your information.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Your contract</b> (photos or a PDF of its pages). Dealership
          paperwork usually contains your name, address, driver&apos;s licence
          number, vehicle details, and financial information such as your
          loan amount and payments. If you can, cover your driver&apos;s
          licence number and date of birth before you take the photo — we
          don&apos;t need them.
        </li>
        <li>
          <b>Your email address</b>, so Stripe can send your receipt and we can
          handle refunds or questions.
        </li>
        <li>
          <b>Payment details</b>, which you enter directly into Stripe&apos;s
          secure form. We receive only a payment confirmation, the amount, and
          the email you gave — never your full card number.
        </li>
        <li>
          <b>Basic technical information</b> such as your IP address, browser
          type and approximate location, which our hosting provider records
          automatically to run and protect the site.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To produce your plain-English report.</li>
        <li>To take payment, send your receipt, and process refunds.</li>
        <li>To prevent fraud and keep the service working.</li>
        <li>To answer you when you contact us.</li>
      </ul>
      <p>
        We don&apos;t use your document or report for marketing, and we
        don&apos;t use them to train AI models.
      </p>

      <h2>Who we share it with</h2>
      <p>
        We use a small number of service providers to run the site. They
        process your information only on our behalf and under their own
        security and privacy commitments:
      </p>
      <ul>
        <li>
          <b>Anthropic</b> (United States) — the AI model that reads your
          document and writes the report. Anthropic does not train its models
          on this data, and may keep it for a limited period under its
          commercial terms (currently up to 30 days) for safety and abuse
          monitoring before deleting it.
        </li>
        <li>
          <b>Stripe</b> (Canada and United States) — payment processing and
          receipts.
        </li>
        <li>
          <b>Vercel</b> (United States) — website hosting.
        </li>
        <li>
          <b>Google Fonts</b> — serves the site&apos;s typefaces, which means
          Google receives your IP address when the page loads.
        </li>
      </ul>
      <p>
        Because these providers are located outside Canada, your information
        may be processed in the United States and be subject to the laws
        there, including lawful access by authorities. We may also disclose
        information if required by law.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          <b>Your document and report:</b> not stored by us. They exist only in
          your browser and briefly on our server while the report is written.
        </li>
        <li>
          <b>Payment records</b> (email, amount, date): kept in Stripe for as
          long as needed for accounting, tax and refund purposes — generally
          up to seven years, as Canadian tax rules require.
        </li>
        <li>
          <b>Server logs:</b> kept by our host for a short period for security
          and troubleshooting.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We don&apos;t use advertising or analytics cookies. Stripe&apos;s
        payment form may set cookies needed to prevent fraud.
      </p>

      <h2>Security</h2>
      <p>
        Everything is sent over encrypted connections (HTTPS). Payment is
        handled by Stripe, a PCI-DSS Level 1 certified provider. No system is
        perfectly secure, but we limit what we keep so there is little to
        expose.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see the personal information we hold about you, ask us
        to correct it, or withdraw your consent (which may mean we can&apos;t
        provide the service). Email{" "}
        <a href={`mailto:${email}`}>{email}</a> and we&apos;ll respond within
        30 days. If you&apos;re not satisfied with our answer, you can contact
        the{" "}
        <a href="https://www.priv.gc.ca" target="_blank" rel="noreferrer">
          Office of the Privacy Commissioner of Canada
        </a>
        , or your provincial privacy commissioner.
      </p>

      <h2>Privacy contact</h2>
      <p>
        Our privacy officer is responsible for this policy and can be reached
        at <a href={`mailto:${email}`}>{email}</a>.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we&apos;ll update the date at the top of this
        page. Significant changes will be highlighted on the site.
      </p>
    </LegalPage>
  );
}
