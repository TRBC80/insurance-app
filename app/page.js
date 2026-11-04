"use client";

import { useState, useCallback, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import LogoMark from "./components/LogoMark";
import SiteFooter from "./components/SiteFooter";

// Loaded once. Uses your PUBLISHABLE (safe-to-expose) test key.
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
);

const PRICE_LABEL = "$29 CAD";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Vercel caps API-route request bodies at ~4.5 MB and base64 inflates size by
// ~33%, so uploads are checked up front — before payment — rather than
// letting the analysis fail after the customer has paid.
// 3 MB raw PDF -> ~4 MB once base64-encoded, safely under the cap.
const MAX_FILE_MB = 3;
// Photos are shrunk in the browser before upload. 1600px on the long edge
// keeps policy text readable (Claude downsizes anything bigger anyway).
const MAX_IMAGES = 10;
const MAX_IMAGE_EDGE = 1600;
const MAX_ENCODED_CHARS = 4_000_000;

// ---- helpers: turn chosen files into base64 for the API route ----
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

async function imageToJpegBase64(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () =>
        reject(
          new Error(`Couldn't open "${file.name}". Please use a JPG or PNG photo.`)
        );
      i.src = url;
    });
    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight)
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // flatten transparent PNGs onto white
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

const isPdf = (f) =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
const isImage = (f) =>
  (f.type || "").startsWith("image/") ||
  /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name || "");

function docSummary(doc) {
  if (!doc) return "";
  if (doc.kind === "pdf") return doc.name;
  const n = doc.pages.length;
  return `${n} photo${n === 1 ? "" : "s"} of your policy`;
}

export default function Page() {
  // step: "upload" -> "pay" -> "analyzing" -> "report" | "error" (+ "sample")
  const [step, setStep] = useState("upload");
  // doc: { kind: "pdf", name, data } | { kind: "images", pages: [{ name, data }] }
  const [doc, setDoc] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [email, setEmail] = useState("");
  const [clientSecret, setClientSecret] = useState(null);
  const [report, setReport] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // Remembered after a successful payment so a failed analysis can be
  // retried without charging the customer again.
  const [paidIntentId, setPaidIntentId] = useState(null);

  // Scroll to the top whenever the screen changes.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const onPickFiles = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // allow picking the same file again
    if (!picked.length) return;
    setErrorMsg("");

    const pdfs = picked.filter(isPdf);
    const images = picked.filter((f) => !isPdf(f) && isImage(f));

    if (picked.length !== pdfs.length + images.length) {
      setErrorMsg("Please choose a PDF, or JPG/PNG photos of your policy.");
      return;
    }
    if (pdfs.length && images.length) {
      setErrorMsg("Choose one PDF, or photos of the pages — not both at once.");
      return;
    }
    if (pdfs.length > 1) {
      setErrorMsg("Please choose just one PDF.");
      return;
    }

    setPreparing(true);
    try {
      if (pdfs.length === 1) {
        const f = pdfs[0];
        if (f.size > MAX_FILE_MB * 1024 * 1024) {
          throw new Error(
            `That PDF is ${(f.size / 1024 / 1024).toFixed(1)} MB. Please use ` +
              `one under ${MAX_FILE_MB} MB — or upload photos of the pages instead.`
          );
        }
        setDoc({ kind: "pdf", name: f.name, data: await fileToBase64(f) });
        return;
      }

      // Photos: add to any photos already chosen, so people can pick pages
      // in more than one go.
      const existing = doc?.kind === "images" ? doc.pages : [];
      if (existing.length + images.length > MAX_IMAGES) {
        throw new Error(
          `You can add up to ${MAX_IMAGES} photos. For longer policies, ` +
            `focus on the declarations/summary pages and the exclusions.`
        );
      }
      const added = [];
      for (const f of images) {
        added.push({ name: f.name, data: await imageToJpegBase64(f) });
      }
      const pages = [...existing, ...added];
      const total = pages.reduce((n, p) => n + p.data.length, 0);
      if (total > MAX_ENCODED_CHARS) {
        throw new Error(
          "Those photos are too large together. Try fewer pages, or a PDF."
        );
      }
      setDoc({ kind: "images", pages });
    } catch (err) {
      setErrorMsg(err.message || "Could not read that file.");
    } finally {
      setPreparing(false);
    }
  };

  const removePage = (index) => {
    if (doc?.kind !== "images") return;
    const pages = doc.pages.filter((_, i) => i !== index);
    setDoc(pages.length ? { kind: "images", pages } : null);
  };

  // Create a payment intent on the server, then show the payment form.
  const goToPayment = async () => {
    if (!doc) return;
    if (!EMAIL_RE.test(email.trim())) {
      setErrorMsg("Please enter a valid email so we can send your receipt.");
      return;
    }
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
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
      setPaidIntentId(paymentIntentId);
      setStep("analyzing");
      setErrorMsg("");
      try {
        const payload =
          doc.kind === "pdf"
            ? { paymentIntentId, pdf: doc.data }
            : { paymentIntentId, images: doc.pages.map((p) => p.data) };
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        // Vercel answers some failures (too large, timed out) with a plain
        // text/HTML page instead of JSON, so don't assume JSON.
        const raw = await res.text();
        let data = {};
        try {
          data = JSON.parse(raw);
        } catch {
          data = {};
        }
        if (!res.ok) {
          let msg = data.error;
          if (!msg && res.status === 413) {
            msg = "That upload was too large to send. Please try a smaller file or fewer photos.";
          } else if (!msg && res.status === 504) {
            msg = "Reading your policy took too long. Please try again.";
          } else if (!msg) {
            msg = `The analyzer had a problem (error ${res.status}). Please try again.`;
          }
          throw new Error(msg);
        }
        if (!data.report) throw new Error("The analysis came back empty. Please try again.");
        setReport(data.report);
        setStep("report");
      } catch (err) {
        setErrorMsg(err.message);
        setStep("error");
      }
    },
    [doc]
  );

  const startOver = () => {
    setPaidIntentId(null);
    setDoc(null);
    setReport("");
    setErrorMsg("");
    setStep("upload");
  };

  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          {/* LOGO: to use an image logo, drop it in /public (e.g. public/logo.png)
              and replace this button's contents with
              <img src="/logo.png" alt="Insurance in English" className="logo-img" /> */}
          <button className="brand" onClick={startOver} aria-label="Insurance in English — home">
            <LogoMark />
            <span className="wordmark">
              Insurance in <span className="en">English</span>
            </span>
          </button>
          {step === "upload" ? (
            <button className="header-link" onClick={() => setStep("sample")}>
              <span className="hide-sm">See a sample report</span>
              <span className="show-sm">Sample report</span>
            </button>
          ) : (
            <span className="header-note">Plain-English policy reviews</span>
          )}
        </div>
      </header>

      <main>
        {step === "upload" && (
          <UploadView
            doc={doc}
            preparing={preparing}
            onPickFiles={onPickFiles}
            onRemovePage={removePage}
            onClear={() => setDoc(null)}
            email={email}
            onEmailChange={(v) => {
              setEmail(v);
              setErrorMsg("");
            }}
            onContinue={goToPayment}
            onSeeSample={() => setStep("sample")}
            busy={busy}
            errorMsg={errorMsg}
          />
        )}

        {step === "sample" && (
          <div className="wrap narrow">
            <SampleView onBack={() => setStep("upload")} />
          </div>
        )}

        {step === "pay" && clientSecret && (
          <div className="wrap narrow">
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "flat",
                  variables: {
                    colorPrimary: "#1f7a6d",
                    colorText: "#14233a",
                    fontFamily: "Inter, system-ui, sans-serif",
                    borderRadius: "10px",
                  },
                },
              }}
            >
              <PayView
                summary={docSummary(doc)}
                onPaid={runAnalysis}
                onBack={() => setStep("upload")}
              />
            </Elements>
          </div>
        )}

        {step === "analyzing" && (
          <div className="wrap narrow">
            <AnalyzingView />
          </div>
        )}

        {step === "report" && (
          <div className="wrap narrow">
            <ReportView report={report} onStartOver={startOver} />
          </div>
        )}

        {step === "error" && (
          <div className="wrap narrow">
            <div className="card">
              <p className="card-title">Something went wrong</p>
              <div className="error-box">{errorMsg}</div>
              {paidIntentId && (
                <button
                  className="btn btn-cta"
                  onClick={() => runAnalysis(paidIntentId)}
                >
                  Try again — no extra charge
                </button>
              )}
              <button className="btn btn-teal" onClick={startOver}>
                Start over
              </button>
              {paidIntentId && (
                <p className="card-sub" style={{ marginTop: 14, marginBottom: 0 }}>
                  Your payment went through but no report was generated. Try
                  again above at no extra cost, or reply to your emailed
                  receipt for a refund.
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Icons (inline so there's nothing extra to load)                     */
/* ------------------------------------------------------------------ */
function Icon({ d, size = 20, stroke = 2, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {d}
    </svg>
  );
}
const IconUpload = (p) => (
  <Icon {...p} d={<><path d="M12 16V4" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></>} />
);
const IconFile = (p) => (
  <Icon {...p} d={<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>} />
);
const IconCamera = (p) => (
  <Icon {...p} d={<><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>} />
);
const IconCheck = (p) => <Icon {...p} d={<path d="m5 12.5 4.5 4.5L19 7.5" />} />;
const IconShield = (p) => (
  <Icon {...p} d={<><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>} />
);
const IconLock = (p) => (
  <Icon {...p} d={<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>} />
);
const IconClock = (p) => (
  <Icon {...p} d={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>} />
);
const IconX = (p) => <Icon {...p} d={<path d="M6 6l12 12M18 6 6 18" />} />;
const IconArrow = (p) => <Icon {...p} d={<path d="M5 12h14m-6-6 6 6-6 6" />} />;


/* ------------------------------------------------------------------ */
/* Upload (landing) screen                                             */
/* ------------------------------------------------------------------ */
function UploadView({
  doc,
  preparing,
  onPickFiles,
  onRemovePage,
  onClear,
  email,
  onEmailChange,
  onContinue,
  onSeeSample,
  busy,
  errorMsg,
}) {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-intro">
            <p className="eyebrow">Canadian insurance, decoded</p>
            <h1>
              Find out what your policy <span className="hl">actually</span>{" "}
              covers.
            </h1>
            <p className="lede">
              Upload your policy — a PDF or photos of the pages — and get a
              clear, honest breakdown of what&apos;s covered, what isn&apos;t,
              and the fine print that trips people up.
            </p>
          </div>

          <div className="hero-proof">
            <TranslateCard />

            <ul className="trust-row">
              <li><IconClock size={16} /> Ready in about a minute</li>
              <li><IconLock size={16} /> Read once, never stored</li>
              <li><IconShield size={16} /> Full refund if it&apos;s not useful</li>
            </ul>
          </div>

          <div className="hero-side">
            <UploadCard
              doc={doc}
              preparing={preparing}
              onPickFiles={onPickFiles}
              onRemovePage={onRemovePage}
              onClear={onClear}
              email={email}
              onEmailChange={onEmailChange}
              onContinue={onContinue}
              onSeeSample={onSeeSample}
              busy={busy}
              errorMsg={errorMsg}
            />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">How it works</h2>
          <ol className="steps">
            <li>
              <span className="step-num">1</span>
              <h3>Upload your policy</h3>
              <p>
                A PDF from your insurer, or snap photos of the pages with your
                phone. Home, condo, tenant, auto, RV, travel — any province.
              </p>
            </li>
            <li>
              <span className="step-num">2</span>
              <h3>We read every line</h3>
              <p>
                The declarations page, the wording, the endorsements — and
                where they contradict each other.
              </p>
            </li>
            <li>
              <span className="step-num">3</span>
              <h3>Get your plain-English report</h3>
              <p>
                What&apos;s covered, what isn&apos;t, what you&apos;ll pay, and
                the questions to ask your broker.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap">
          <h2 className="section-title">What&apos;s in your report</h2>
          <div className="contents-grid">
            {[
              ["What this policy is", "The type of policy and who or what it protects, in two sentences."],
              ["What's covered", "The main protections, with the dollar limits from your document."],
              ["What's NOT covered", "The exclusions and gaps that cause denied claims — stated plainly."],
              ["What you pay", "Deductibles, premiums, and out-of-pocket costs explained."],
              ["Fine print worth knowing", "Deadlines and conditions that could quietly void your coverage."],
              ["Questions for your broker", "3–5 sharp questions based on the gaps we found."],
            ].map(([title, body]) => (
              <div className="contents-item" key={title}>
                <span className="contents-check"><IconCheck size={16} stroke={2.5} /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="sample-cta">
            <div>
              <p className="sample-cta-title">See a real report before you pay</p>
              <p className="sample-cta-sub">
                An actual travel-trailer policy, run through the tool.
              </p>
            </div>
            <button className="btn btn-outline" onClick={onSeeSample}>
              View sample report <IconArrow size={18} />
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap faq-wrap">
          <h2 className="section-title">Questions</h2>
          <div className="faq">
            <details>
              <summary>Does it work for my province?</summary>
              <p>
                Yes — every province and territory. The report points out
                provincial rules that matter, like public auto plans in BC,
                Manitoba, Saskatchewan and Quebec. Policies written in French
                work too: you&apos;ll get the report in plain English with the
                French terms alongside.
              </p>
            </details>
            <details>
              <summary>Is this insurance advice?</summary>
              <p>
                No. It&apos;s a plain-language summary to help you understand
                what you have. For decisions about coverage, confirm with your
                insurer or a licensed broker — the report gives you the right
                questions to ask.
              </p>
            </details>
            <details>
              <summary>What happens to my document?</summary>
              <p>
                It&apos;s sent securely to be read once to write your report,
                and isn&apos;t stored afterward. We never sell it. Details are
                in our <a href="/privacy">Privacy Policy</a>.
              </p>
            </details>
            <details>
              <summary>Can I upload photos instead of a PDF?</summary>
              <p>
                Yes — up to {MAX_IMAGES} JPG or PNG photos. Lay each page flat in
                good light. The declarations (summary) page and the exclusions
                section matter most.
              </p>
            </details>
            <details>
              <summary>What if the report isn&apos;t useful?</summary>
              <p>
                Reply to your emailed receipt within 30 days and you&apos;ll get
                a full refund, no questions asked. See our{" "}
                <a href="/refunds">Refund Policy</a>.
              </p>
            </details>
          </div>
        </div>
      </section>
    </>
  );
}

/* The signature visual: a real clause, translated. */
function TranslateCard() {
  return (
    <figure className="translate">
      <div className="translate-row translate-legal">
        <span className="translate-label">Your policy says</span>
        <p>
          &ldquo;We do not insure loss caused by{" "}
          <mark>continuous or repeated seepage or leakage</mark> of water or
          steam over a period of time&hellip;&rdquo;
        </p>
      </div>
      <div className="translate-row translate-plain">
        <span className="translate-label">In plain English</span>
        <p>
          <b>Slow leaks aren&apos;t covered.</b> Only sudden water damage —
          like a burst pipe — counts. It&apos;s one of the most common reasons
          claims get denied.
        </p>
      </div>
    </figure>
  );
}

function UploadCard({
  doc,
  preparing,
  onPickFiles,
  onRemovePage,
  onClear,
  email,
  onEmailChange,
  onContinue,
  onSeeSample,
  busy,
  errorMsg,
}) {
  const canAddMore = !doc || (doc.kind === "images" && doc.pages.length < MAX_IMAGES);
  return (
    <div className="card upload-card" id="start">
      <p className="card-title">Get your report</p>
      <p className="card-sub">PDF, or photos of each page (JPG/PNG).</p>

      {doc?.kind === "pdf" ? (
        <div className="file-chip">
          <span className="file-chip-icon"><IconFile size={20} /></span>
          <span className="file-chip-name">{doc.name}</span>
          <button className="icon-btn" onClick={onClear} aria-label="Remove file">
            <IconX size={18} />
          </button>
        </div>
      ) : doc?.kind === "images" ? (
        <div className="thumbs">
          {doc.pages.map((p, i) => (
            <div className="thumb" key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/jpeg;base64,${p.data}`} alt={`Page ${i + 1}`} />
              <span className="thumb-num">{i + 1}</span>
              <button
                className="thumb-remove"
                onClick={() => onRemovePage(i)}
                aria-label={`Remove page ${i + 1}`}
              >
                <IconX size={14} stroke={2.5} />
              </button>
            </div>
          ))}
          {canAddMore && (
            <label className="thumb thumb-add">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onPickFiles}
                disabled={preparing}
              />
              <span>+</span>
              <small>Add page</small>
            </label>
          )}
        </div>
      ) : null}

      {!doc && (
        <label className={`drop ${preparing ? "is-busy" : ""}`}>
          <input
            type="file"
            accept="application/pdf,image/*"
            multiple
            onChange={onPickFiles}
            disabled={preparing}
          />
          <span className="drop-icon">
            {preparing ? <span className="spinner small" /> : <IconUpload size={22} />}
          </span>
          <span className="drop-main">
            {preparing ? "Preparing…" : "Choose your policy"}
          </span>
          <span className="drop-hint">
            <span className="nowrap"><IconFile size={14} /> PDF up to {MAX_FILE_MB} MB</span>
            <span className="dot">·</span>
            <span className="nowrap"><IconCamera size={14} /> or up to {MAX_IMAGES} photos</span>
          </span>
        </label>
      )}

      {doc?.kind === "images" && preparing && (
        <p className="card-sub" style={{ margin: "10px 0 0" }}>Preparing photos…</p>
      )}

      <label className="field">
        <span className="field-label">Email for your receipt</span>
        <input
          type="email"
          className="field-input"
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
        />
      </label>

      <div className="price-row">
        <div>
          <span className="label">One full report</span>
          <span className="anchor">Less than 15 minutes of a broker&apos;s time</span>
        </div>
        <span className="price">{PRICE_LABEL}</span>
      </div>

      <button
        className="btn btn-cta"
        onClick={onContinue}
        disabled={!doc || busy || preparing}
      >
        {busy ? "Starting…" : "Continue to payment"}
        {!busy && <IconArrow size={18} />}
      </button>

      {errorMsg && <div className="error-box">{errorMsg}</div>}

      <div className="guarantee">
        <IconShield size={16} />
        <span>Not useful? <b>Full refund, no questions.</b></span>
      </div>

      <p className="consent">
        By continuing you agree to our <a href="/terms">Terms</a> and{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <button className="btn btn-link" onClick={onSeeSample}>
        See a sample report first
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sample report (shown BEFORE paying — big conversion lever)          */
/* ------------------------------------------------------------------ */
function SampleView({ onBack }) {
  return (
    <div className="card">
      <button className="btn btn-ghost back" onClick={onBack}>
        ← Back
      </button>
      <div className="sample-banner">
        Real sample — an actual travel-trailer policy, run through the tool
      </div>
      <SampleReportBody />
      <button className="btn btn-cta" onClick={onBack}>
        Get my report — {PRICE_LABEL}
      </button>
      <div className="guarantee">
        <IconShield size={16} />
        <span>Not useful? <b>Full refund, no questions.</b></span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Payment screen                                                      */
/* ------------------------------------------------------------------ */
function PayView({ summary, onPaid, onBack }) {
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
      <button className="btn btn-ghost back" onClick={onBack} disabled={busy}>
        ← Back
      </button>
      <p className="card-title">Payment</p>
      <div className="order-summary">
        <span>
          <IconFile size={16} /> {summary}
        </span>
        <b>{PRICE_LABEL}</b>
      </div>

      <PaymentElement />

      <button className="btn btn-cta" onClick={handlePay} disabled={busy}>
        {busy ? "Processing…" : `Pay ${PRICE_LABEL} & get my report`}
      </button>

      {payError && <div className="error-box">{payError}</div>}

      <div className="guarantee">
        <IconLock size={16} />
        <span>Secure payment by Stripe · <b>Full refund if not useful</b></span>
      </div>

      {process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test") && (
        <p className="test-note">
          Test mode: use card 4242 4242 4242 4242, any future date, any CVC.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analyzing screen                                                    */
/* ------------------------------------------------------------------ */
const ANALYZING_STEPS = [
  "Reading your declarations page",
  "Checking what's covered",
  "Hunting for exclusions and gaps",
  "Translating the jargon",
  "Writing your report",
];

function AnalyzingView() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setActive((a) => Math.min(a + 1, ANALYZING_STEPS.length - 1)),
      9000
    );
    return () => clearInterval(t);
  }, []);
  return (
    <div className="card analyzing">
      <div className="spinner" />
      <p className="card-title">Reading your policy…</p>
      <p className="card-sub">This usually takes about a minute. Keep this page open.</p>
      <ul className="progress-list">
        {ANALYZING_STEPS.map((s, i) => (
          <li key={s} className={i < active ? "done" : i === active ? "active" : ""}>
            <span className="progress-dot">{i < active && <IconCheck size={12} stroke={3} />}</span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Report screen                                                       */
/* ------------------------------------------------------------------ */
function ReportView({ report, onStartOver }) {
  return (
    <div className="card report-card">
      <div className="report-head">
        <span className="report-badge"><IconCheck size={14} stroke={3} /> Report ready</span>
        <p className="card-title">Your plain-English report</p>
        <p className="card-sub">
          Here&apos;s what your policy says, in language you can actually use.
        </p>
      </div>
      <ReportMarkdown text={report} />
      <div className="report-actions">
        <button className="btn btn-teal" onClick={() => window.print()}>
          Save / print report
        </button>
        <button className="btn btn-ghost" onClick={onStartOver}>
          Review another policy
        </button>
      </div>
    </div>
  );
}

/* Minimal, safe Markdown -> React (headings, bold, bullet and numbered
   lists, paragraphs). No HTML is injected, so model output can't run code. */
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part.replace(/(^|\s)\*([^*\s][^*]*)\*/g, "$1$2")
    )
  );
}

function ReportMarkdown({ text }) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let para = [];
  let list = null; // { ordered, items }

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "p", text: para.join(" ") });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: list.ordered ? "ol" : "ul", items: list.items });
      list = null;
    }
  };

  for (const line of lines) {
    const t = line.trim();
    let m;
    if (!t) {
      flushPara();
      flushList();
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushPara();
      flushList();
    } else if ((m = t.match(/^#{1,6}\s+(.*)$/))) {
      flushPara();
      flushList();
      blocks.push({ type: "h", text: m[1].replace(/\*\*/g, "") });
    } else if ((m = t.match(/^\*\*([^*]+)\*\*:?$/))) {
      // A line that's entirely bold reads as a heading.
      flushPara();
      flushList();
      blocks.push({ type: "h", text: m[1] });
    } else if ((m = t.match(/^[-*•]\s+(.*)$/))) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(m[1]);
    } else if (
      (m = t.match(/^\d+[.)]\s+(.*)$/)) &&
      /^[A-Z0-9'’ &:,/-]{4,}$/.test(m[1].replace(/\*\*/g, "").trim())
    ) {
      // "1. WHAT THIS POLICY IS" -> section heading
      flushPara();
      flushList();
      blocks.push({ type: "h", text: m[1].replace(/\*\*/g, "") });
    } else if ((m = t.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(m[1]);
    } else {
      flushList();
      para.push(t);
    }
  }
  flushPara();
  flushList();

  return (
    <div className="report report-rich">
      {blocks.map((b, i) => {
        if (b.type === "h") return <h4 key={i}>{b.text}</h4>;
        if (b.type === "p") return <p key={i}>{renderInline(b.text)}</p>;
        const Tag = b.type;
        return (
          <Tag key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it)}</li>
            ))}
          </Tag>
        );
      })}
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

