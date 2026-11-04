"use client";

import { useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// Loaded once. Uses your PUBLISHABLE (safe-to-expose) test key.
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
);

const PRICE_LABEL = "$29 CAD";

// Vercel caps API-route request bodies at ~4.5 MB and base64 inflates size by
// ~33%, so we block oversized PDFs up front — before payment — with a clear
// message, rather than letting the analysis fail after the customer has paid.
const MAX_FILE_MB = 4;

// ---- helper: turn the chosen file into base64 for the API route ----
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export default function Page() {
  // step: "upload" -> "pay" -> "analyzing" -> "report" | "error"
  const [step, setStep] = useState("upload");
  const [file, setFile] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [report, setReport] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      setErrorMsg("Please choose a PDF file.");
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setErrorMsg(
        `That PDF is ${(f.size / 1024 / 1024).toFixed(1)} MB. For now, ` +
          `please use a policy under ${MAX_FILE_MB} MB — support for larger ` +
          `files is coming.`
      );
      return;
    }
    setErrorMsg("");
    setFile(f);
  };

  // Create a payment intent on the server, then show the payment form.
  const goToPayment = async () => {
    if (!file) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Could not start checkout.");
      const data = await res.json();
      setClientSecret(data.clientSecret);
      setStep("pay");
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Called by the payment form once payment succeeds.
  const runAnalysis = useCallback(
    async (paymentIntentId) => {
      setStep("analyzing");
      setErrorMsg("");
      try {
        const pdfBase64 = await fileToBase64(file);
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId, pdf: pdfBase64 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Analysis failed.");
        setReport(data.report);
        setStep("report");
      } catch (err) {
        setErrorMsg(err.message);
        setStep("error");
      }
    },
    [file]
  );

  return (
    <div className="wrap">
      <header className="site-header">
        {/* LOGO: replace this wordmark with an <img> once you have a logo.
            See the note in globals.css / README for exact steps. */}
        <span className="wordmark">
          Insurance in <span className="en">English</span>
        </span>
        <span className="header-note">Plain-English policy reviews</span>
      </header>

      {step === "upload" && (
        <UploadView
          file={file}
          onPickFile={onPickFile}
          onContinue={goToPayment}
          onSeeSample={() => setStep("sample")}
          busy={busy}
          errorMsg={errorMsg}
        />
      )}

      {step === "sample" && (
        <SampleView onBack={() => setStep("upload")} />
      )}

      {step === "pay" && clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: "flat",
              variables: {
                colorPrimary: "#1f7a6d",
                fontFamily: "Inter, sans-serif",
                borderRadius: "10px",
              },
            },
          }}
        >
          <PayView
            fileName={file?.name}
            onPaid={runAnalysis}
            onBack={() => setStep("upload")}
          />
        </Elements>
      )}

      {step === "analyzing" && <AnalyzingView />}

      {step === "report" && <ReportView report={report} />}

      {step === "error" && (
        <div className="card">
          <p className="card-title">Something went wrong</p>
          <div className="error-box">{errorMsg}</div>
          <button
            className="btn btn-teal"
            onClick={() => setStep("upload")}
          >
            Start over
          </button>
          <p className="card-sub" style={{ marginTop: 14, marginBottom: 0 }}>
            If you were charged in a real (live) session, no report was
            generated — reply to your receipt and it can be sorted out.
          </p>
        </div>
      )}

      <footer className="footer">
        Insurance in English gives plain-language summaries of insurance
        documents for general information only. It is not insurance advice,
        legal advice, or a substitute for reading your full policy or speaking
        with a licensed broker. Always confirm coverage details with your
        insurer.
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Upload screen                                                       */
/* ------------------------------------------------------------------ */
function UploadView({ file, onPickFile, onContinue, onSeeSample, busy, errorMsg }) {
  return (
    <>
      <p className="eyebrow">Insurance, decoded</p>
      <h1>
        Find out what your policy <span className="hl">actually</span> covers.
      </h1>
      <p className="lede">
        Upload your policy PDF and get a clear breakdown of what&apos;s
        covered, what&apos;s excluded, and the fine print worth knowing —
        written in plain English, not insurance-speak.
      </p>

      <div className="chips">
        <div className="chip">
          <span className="term">Deductible</span>
          <span className="arrow">→</span>
          <span className="plain">what you pay before coverage kicks in</span>
        </div>
        <div className="chip">
          <span className="term">Exclusion</span>
          <span className="arrow">→</span>
          <span className="plain">a situation your policy won&apos;t cover</span>
        </div>
        <div className="chip">
          <span className="term">Subrogation</span>
          <span className="arrow">→</span>
          <span className="plain">
            your insurer chasing whoever caused the damage
          </span>
        </div>
      </div>

      <div className="card">
        <p className="card-title">Upload your policy</p>
        <p className="card-sub">
          PDF only. Your file is read to produce your report and isn&apos;t
          stored afterward.
        </p>

        <label className={`drop ${file ? "has-file" : ""}`}>
          <input type="file" accept="application/pdf" onChange={onPickFile} />
          {file ? (
            <>
              <div className="drop-icon">📄</div>
              <div className="file-name">{file.name}</div>
              <div className="drop-hint">Tap to choose a different file</div>
            </>
          ) : (
            <>
              <div className="drop-icon">⬆️</div>
              <div className="drop-main">Choose your policy PDF</div>
              <div className="drop-hint">or tap to browse</div>
            </>
          )}
        </label>

        <p className="anchor">Less than 15 minutes of a broker&apos;s time</p>
        <div className="price-row">
          <span className="label">One report</span>
          <span className="price">
            {PRICE_LABEL} <small>/ policy</small>
          </span>
        </div>

        <button
          className="btn btn-cta"
          onClick={onContinue}
          disabled={!file || busy}
        >
          {busy ? "Starting…" : "Continue to payment"}
        </button>

        <div className="guarantee">
          🛡️ <span>Not useful? <b>Full refund, no questions.</b></span>
        </div>

        <button className="btn btn-link" onClick={onSeeSample}>
          See a sample report first →
        </button>

        {errorMsg && <div className="error-box">{errorMsg}</div>}

        <div className="trust">
          <span>Read once, not stored</span>
          <span>Ready in under a minute</span>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sample report (shown BEFORE paying — big conversion lever)          */
/* ------------------------------------------------------------------ */
function SampleView({ onBack }) {
  return (
    <div className="card">
      <div className="sample-banner">
        👀 Real sample — an actual travel-trailer policy, run through the tool
      </div>
      <SampleReportBody />
      <button className="btn btn-cta" onClick={onBack}>
        Get my report — {PRICE_LABEL}
      </button>
      <div className="guarantee">
        🛡️ <span>Not useful? <b>Full refund, no questions.</b></span>
      </div>
      <button className="btn btn-ghost" onClick={onBack}>
        ← Back
      </button>
    </div>
  );
}

/* Static example so people can see the payoff before paying.
   A real travel-trailer policy run through the tool, with all identifying
   details removed (no names, insurer, VIN, policy number, or dollar figures). */
function SampleReportBody() {
  return (
    <div className="report report-rich">
      <h4 style={{ marginTop: 4 }}>What this policy is</h4>
      <p>
        An all-risk travel trailer policy on a mid-size (~28 ft) trailer,
        insured with <b>Guaranteed Replacement Cost</b> for a full year. It&apos;s
        underwritten through a specialty insurer and sold by a broker, with a
        bank listed as lienholder — meaning they get paid first on a claim. Two
        things most people miss on their own page: the property coverage is
        actually <b>split between two insurers</b> (one leads, one follows —
        normal), and the trailer is insured as a <b>&quot;Worksite Residence,&quot;</b>{" "}
        which you pay a surcharge for. Hold onto that last one — it matters more
        than anything else here.
      </p>

      <h4>What&apos;s covered</h4>
      <p>
        All risks of direct physical loss to the trailer, up to the insured
        value, with a set deductible per claim. Because it&apos;s Guaranteed
        Replacement Cost, they&apos;ll pay to repair or replace{" "}
        <b>even if it costs more than the insured value</b> — but only if you
        meet three conditions (below). The deductible is waived on a total loss.
      </p>
      <p>
        Bundled on top: personal property, detached structures, fire-department
        charges, emergency living expense, roadside, and unit rescue &amp;
        retrieval. Plus extensions buried in the wording that{" "}
        <b>aren&apos;t on your summary page</b>: generators &amp; solar
        equipment, bicycles, golf carts, frozen-food spoilage, pet-injury vet
        bills, and lock re-keying. Free money you already paid for.
      </p>

      <h4>What&apos;s NOT covered (read twice)</h4>
      <ul>
        <li>
          <b>Slow leaks.</b> Continuous or repeated water seepage is excluded —
          only sudden, accidental water damage counts. The #1 way RV claims get
          denied.
        </li>
        <li>
          <b>Rodents and pests</b> — mice, squirrels, birds, insects. Classic
          stored-trailer denial.
        </li>
        <li>Condensation, dampness, and extremes of temperature.</li>
        <li>
          Wear, rust, corrosion, rot, mechanical breakdown — unless a covered
          event hits at the same time.
        </li>
        <li>
          <b>Business use</b> — the sharp one. The base wording says the trailer
          isn&apos;t covered if used for business or as a residence &quot;unless we
          permit it.&quot; Your declarations page <b>does</b> permit it — that&apos;s
          exactly what the &quot;Worksite Residence&quot; surcharge buys. But if an
          adjuster reads only the base wording, expect pushback.{" "}
          <b>Your declarations page is your proof — keep it with the policy.</b>
        </li>
        <li>
          High-value items (jewellery, cash, electronics) have little or no
          coverage.
        </li>
      </ul>

      <h4>What you pay</h4>
      <p>
        An annual premium split between the trailer and the liability add-on,
        with a set deductible per claim (waived on a total loss). If one event
        triggers two deductibles, you only pay the larger one. You can pay
        monthly or in full (a card fee applies to pay-in-full).
      </p>

      <h4>Fine print worth knowing</h4>
      <ul>
        <li>
          <b>Guaranteed Replacement Cost has strings:</b> the insured value had
          to equal 100% of replacement cost at the start, the trailer must be
          kept in good condition, and any upgrade that raises its value past a
          set threshold must be reported within 30 days — or you can blow the
          GRC.
        </li>
        <li>
          If you don&apos;t actually repair or replace, they only pay the
          depreciated (Actual Cash Value) amount.
        </li>
        <li>
          Change of use = notify them in writing promptly, or that part of
          coverage can be voided.
        </li>
      </ul>

      <h4>Questions to ask your broker</h4>
      <ul>
        <li>
          Does my liability coverage actually respond if someone&apos;s hurt at
          the trailer <b>in connection with my work</b>, given business
          liability is excluded? (Biggest potential gap.)
        </li>
        <li>
          Does the &quot;Worksite Residence&quot; designation fully override the
          &quot;private use only&quot; condition for a property claim?
        </li>
        <li>
          Was the insured value set to 100% of replacement cost, so my
          Guaranteed Replacement Cost is actually valid?
        </li>
        <li>How exactly do I report upgrades to keep GRC intact?</li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Payment screen                                                      */
/* ------------------------------------------------------------------ */
function PayView({ fileName, onPaid, onBack }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState("");

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setPayError("");

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required", // keep the user on this page
    });

    if (error) {
      setPayError(error.message || "Payment could not be completed.");
      setBusy(false);
      return;
    }
    if (paymentIntent && paymentIntent.status === "succeeded") {
      onPaid(paymentIntent.id);
    } else {
      setPayError("Payment did not complete. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <p className="card-title">Payment</p>
      <p className="card-sub">
        Reviewing: <strong>{fileName}</strong> · {PRICE_LABEL}
      </p>

      <PaymentElement />

      <button className="btn btn-cta" onClick={handlePay} disabled={busy}>
        {busy ? "Processing…" : `Pay ${PRICE_LABEL} & get my report`}
      </button>

      <div className="guarantee">
        🛡️ <span>Not useful? <b>Full refund, no questions.</b></span>
      </div>

      {payError && <div className="error-box">{payError}</div>}

      <button className="btn btn-ghost" onClick={onBack} disabled={busy}>
        ← Back
      </button>

      <p className="card-sub" style={{ marginTop: 10, marginBottom: 0 }}>
        Test mode: use card 4242 4242 4242 4242, any future date, any CVC.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analyzing screen                                                    */
/* ------------------------------------------------------------------ */
function AnalyzingView() {
  return (
    <div className="card center">
      <p className="card-title">Reading your policy…</p>
      <p className="card-sub">
        Working through the document and translating the jargon. This takes a
        few seconds.
      </p>
      <div className="spinner" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Report screen                                                       */
/* ------------------------------------------------------------------ */
function ReportView({ report }) {
  return (
    <div className="card">
      <p className="card-title">Your plain-English report</p>
      <p className="card-sub">
        Here&apos;s what your policy says, in language you can actually use.
      </p>
      <div className="report">{report}</div>
      <button
        className="btn btn-teal"
        onClick={() => window.print()}
        style={{ marginTop: 22 }}
      >
        Save / print report
      </button>
    </div>
  );
}
