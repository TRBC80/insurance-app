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
import Wordmark from "./components/Wordmark";
import { shrinkPdf } from "./lib/shrinkPdf";

// Loaded once. Uses your PUBLISHABLE (safe-to-expose) test key.
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
);

const PRICE_LABEL = "$29 CAD";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Vercel caps API-route request bodies at ~4.5 MB and base64 inflates size by
// ~33%, so uploads are checked up front — before payment — rather than
// letting the analysis fail after the customer has paid.
// PDFs up to 3 MB are sent as-is (~4 MB once base64-encoded). Bigger PDFs
// are shrunk in the browser first (text + key page images; see lib/shrinkPdf).
const DIRECT_PDF_MB = 3;
const MAX_FILE_MB = 40;
// Photos are shrunk in the browser before upload. 1600px on the long edge
// keeps contract text readable (Claude downsizes anything bigger anyway).
const MAX_IMAGES = 20;
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
  if (doc.kind === "extracted") return `${doc.name} (${doc.pageCount} pages)`;
  const n = doc.pages.length;
  return `${n} photo${n === 1 ? "" : "s"} of your paperwork`;
}

export default function Page() {
  // step: "upload" -> "pay" -> "analyzing" -> "report" | "error" (+ "sample")
  const [step, setStep] = useState("upload");
  // doc: { kind: "pdf", name, data }
  //    | { kind: "extracted", name, text, images: [{ page, data }], pageCount }
  //    | { kind: "images", pages: [{ name, data }] }
  const [doc, setDoc] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [prepLabel, setPrepLabel] = useState("");
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
      setErrorMsg("Please choose a PDF, or JPG/PNG photos of your paperwork.");
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
        if (f.size <= DIRECT_PDF_MB * 1024 * 1024) {
          setDoc({ kind: "pdf", name: f.name, data: await fileToBase64(f) });
          return;
        }
        setPrepLabel("Reading your PDF…");
        const out = await shrinkPdf(f, {
          budgetBytes: MAX_ENCODED_CHARS,
          onProgress: (done, total) =>
            setPrepLabel(`Reading page ${done} of ${total}…`),
        });
        setDoc({ kind: "extracted", name: f.name, ...out });
        return;
      }

      // Photos: add to any photos already chosen, so people can pick pages
      // in more than one go.
      const existing = doc?.kind === "images" ? doc.pages : [];
      if (existing.length + images.length > MAX_IMAGES) {
        throw new Error(
          `You can add up to ${MAX_IMAGES} photos. Focus on the bill of sale, ` +
            `the finance or lease contract, and any warranty forms.`
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
      setPrepLabel("");
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
            : doc.kind === "extracted"
              ? {
                  paymentIntentId,
                  extracted: {
                    text: doc.text,
                    images: doc.images,
                    pageCount: doc.pageCount,
                  },
                }
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
            msg = "Reading your paperwork took too long. Please try again.";
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
              <img src="/logo.png" alt="Don't Sign Yet" className="logo-img" /> */}
          <button className="brand" onClick={startOver} aria-label="Don't Sign Yet — home">
            <LogoMark />
            <Wordmark />
          </button>
          {step === "upload" ? (
            <button className="header-link" onClick={() => setStep("sample")}>
              <span className="hide-sm">See an example report</span>
              <span className="show-sm">Example</span>
            </button>
          ) : (
            <span className="header-note">Read it before you sign</span>
          )}
        </div>
      </header>

      <main>
        {step === "upload" && (
          <UploadView
            doc={doc}
            preparing={preparing}
            prepLabel={prepLabel}
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
/* Kinds of paperwork we read                                          */
/* ------------------------------------------------------------------ */
const DEAL_TYPES = [
  ["New car", <><path d="M3 16v-3l2.2-5h13.6L21 13v3z" /><circle cx="7.5" cy="16.5" r="1.8" /><circle cx="16.5" cy="16.5" r="1.8" /></>],
  ["Used car", <><path d="M3 16v-3l2.2-5h13.6L21 13v3z" /><circle cx="7.5" cy="16.5" r="1.8" /><circle cx="16.5" cy="16.5" r="1.8" /><path d="M12 4v2" /></>],
  ["Truck", <><path d="M2 16V8h11v8" /><path d="M13 11h5l3 3v2h-8" /><circle cx="6" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>],
  ["Financing", <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v.01M18 15v.01" /></>],
  ["Lease", <><path d="M4 4h12l4 4v12H4z" /><path d="M8 12h8M8 16h5" /><path d="M16 4v4h4" /></>],
  ["Trade-in", <><path d="M4 8h13l-3-3M20 16H7l3 3" /></>],
  ["Extended warranty", <><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>],
  ["Add-on packages", <><rect x="4" y="9" width="16" height="11" rx="1" /><path d="M4 13h16M12 9v11M12 9c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1" /></>],
  ["Motorcycle", <><circle cx="5.5" cy="16" r="3" /><circle cx="18.5" cy="16" r="3" /><path d="M5.5 16 9 10h5l4.5 6M14 10l2-3h2" /></>],
  ["RV & trailer", <><rect x="2" y="6" width="16" height="10" rx="2" /><path d="M18 13h4M6 9h4v3H6z" /><circle cx="8" cy="17" r="2" /></>],
  ["Boat", <><path d="M3 15h18l-2.5 4h-13z" /><path d="M12 3v12M12 4l6 9h-6" /></>],
  ["ATV & sled", <><circle cx="6" cy="16" r="3" /><circle cx="18" cy="16" r="3" /><path d="M9 16h6M7 13l2-4h6l2 4M11 9V6h3" /></>],
];

function DealTypes() {
  return (
    <div className="types-grid">
      {DEAL_TYPES.map(([label, d]) => (
        <div className="type-tile" key={label}>
          <span className="type-icon"><Icon d={d} size={26} stroke={1.8} /></span>
          <span className="type-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Upload (landing) screen                                             */
/* ------------------------------------------------------------------ */
function UploadView({
  doc,
  preparing,
  prepLabel,
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
            <p className="eyebrow">Snap it. Check it. Then sign.</p>
            <h1>
              Know what you&apos;re <span className="hl">actually</span>{" "}
              signing.
            </h1>
            <p className="lede">
              Snap photos of your bill of sale, finance or lease contract right
              there in the office. In a couple of minutes you&apos;ll know the
              real price, every fee and add-on, whether the math adds up, and
              what to ask before you sign.
            </p>
            <ul className="type-chips" aria-label="Paperwork we read">
              {["Bill of sale", "Financing", "Lease", "Trade-in", "Warranty", "Add-ons"].map((t) => (
                <li key={t}>{t}</li>
              ))}
              <li className="more">+ more</li>
            </ul>
          </div>

          <div className="hero-proof">
            <TranslateCard />

            <ul className="trust-row">
              <li><IconClock size={16} /> Ready in about two minutes</li>
              <li><IconLock size={16} /> Read once, never stored</li>
              <li><IconCheck size={16} /> Not paid by any dealer or lender</li>
            </ul>
          </div>

          <div className="hero-side">
            <UploadCard
              doc={doc}
              preparing={preparing}
              prepLabel={prepLabel}
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
              <h3>Take photos of the paperwork</h3>
              <p>
                Every page, front and back — the fine print is often on the
                back. Or upload the PDF if the dealer emailed it to you.
              </p>
            </li>
            <li>
              <span className="step-num">2</span>
              <h3>We check every line</h3>
              <p>
                The price, the fees, the add-ons, the rate and the term — and
                we redo the math to see if it adds up.
              </p>
            </li>
            <li>
              <span className="step-num">3</span>
              <h3>Ask before you sign</h3>
              <p>
                Get a plain-English report with the red flags and the exact
                questions to ask the finance manager.
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
              ["The bottom line", "What this deal is, and whether it looks clean or needs fixing — up top, so you can read it in 20 seconds."],
              ["The deal in numbers", "Price, fees, trade-in, taxes, rate, term, payment, and the total you'll really pay."],
              ["Does the math add up?", "We recalculate the deal. If the numbers don't match, you'll see exactly where."],
              ["Add-ons & fees", "Warranties, GAP, rustproofing, admin fees — which ones are optional, and which you're paying interest on."],
              ["Red flags & fine print", "Conditional financing, rolled-in negative equity, 'as is' clauses, long terms and more."],
              ["Before you sign, ask", "3–6 short, specific questions to put to the salesperson or finance manager."],
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
              <p className="sample-cta-title">See an example report first</p>
              <p className="sample-cta-sub">
                A typical used-SUV finance deal with a trade-in.
              </p>
            </div>
            <button className="btn btn-outline" onClick={onSeeSample}>
              View example report <IconArrow size={18} />
            </button>
          </div>
        </div>
      </section>

      <section className="section section-types">
        <div className="wrap">
          <h2 className="section-title">Works with any dealership deal</h2>
          <p className="section-sub">
            Cars and trucks, new or used — and the same paperwork at RV, boat
            and powersports dealers too.
          </p>
          <DealTypes />
        </div>
      </section>

      <section className="section">
        <div className="wrap faq-wrap">
          <h2 className="section-title">Questions</h2>
          <div className="faq">
            <details>
              <summary>Can I really do this at the dealership?</summary>
              <p>
                Yes — that&apos;s what it&apos;s built for. Ask for a copy of the
                paperwork to review before you sign (a reasonable request any
                dealer should allow), take photos, and give it a couple of
                minutes. In most provinces there&apos;s no cooling-off period
                once you&apos;ve signed, so before is the time to check.
              </p>
            </details>
            <details>
              <summary>How do I get good photos?</summary>
              <p>
                Lay each page flat in good light and get all four corners in
                the shot. Photograph the back of each page too, and any
                separate warranty or protection-package forms. If something is
                blurry or missing, the report will tell you which page to
                retake.
              </p>
            </details>
            <details>
              <summary>Are you connected to any dealer or lender?</summary>
              <p>
                No. We aren&apos;t paid by dealers, manufacturers, lenders or
                warranty companies, and we don&apos;t sell anything else. The
                only person paying for the report is you.
              </p>
            </details>
            <details>
              <summary>Is this legal or financial advice?</summary>
              <p>
                No. It&apos;s a plain-language review to help you understand
                what you&apos;re signing. If you have a dispute with a dealer,
                your provincial regulator (for example AMVIC in Alberta or
                OMVIC in Ontario) or a lawyer can help.
              </p>
            </details>
            <details>
              <summary>What about my personal information?</summary>
              <p>
                Your paperwork is sent securely, read once to write your report,
                and isn&apos;t stored afterward. You can cover your
                driver&apos;s licence number and date of birth before taking the
                photo — we don&apos;t need them. Don&apos;t upload a credit
                application (it can include your SIN). Details are in our{" "}
                <a href="/privacy">Privacy Policy</a>.
              </p>
            </details>
            <details>
              <summary>What if something goes wrong?</summary>
              <p>
                If the report fails or we can&apos;t read your photos, you can
                try again free or get a refund. Because every report is written
                for your contract, we can&apos;t refund a report once it&apos;s
                been delivered — so take a look at the example report first. See
                our <a href="/refunds">Refund Policy</a>.
              </p>
            </details>
          </div>
        </div>
      </section>
    </>
  );
}

/* The signature visual: a real-world contract line, translated. */
function TranslateCard() {
  return (
    <figure className="translate">
      <div className="translate-row translate-legal">
        <span className="translate-label">Your contract says</span>
        <p>
          &ldquo;This agreement is{" "}
          <mark>conditional upon acceptance by a financial institution</mark>.
          Should financing not be approved, Purchaser agrees to return the
          vehicle&hellip;&rdquo;
        </p>
      </div>
      <div className="translate-row translate-plain">
        <span className="translate-label">In plain English</span>
        <p>
          <b>Your loan isn&apos;t approved yet.</b> You could drive home today
          and get a call next week asking you to sign at a higher rate — or
          bring the car back. Ask if financing is final before you leave.
        </p>
      </div>
    </figure>
  );
}

function UploadCard({
  doc,
  preparing,
  prepLabel,
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
      <p className="card-title">Check my deal</p>
      <p className="card-sub">
        Photograph every page, front and back. Flat, in good light, all four
        corners in the shot.
      </p>

      {doc?.kind === "pdf" || doc?.kind === "extracted" ? (
        <div className="file-chip">
          <span className="file-chip-icon"><IconFile size={20} /></span>
          <span className="file-chip-name">
            {doc.name}
            {doc.kind === "extracted" && (
              <small className="file-chip-meta">{doc.pageCount} pages · ready</small>
            )}
          </span>
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
                capture="environment"
                onChange={onPickFiles}
                disabled={preparing}
              />
              <IconCamera size={22} />
              <small>Next page</small>
            </label>
          )}
        </div>
      ) : null}

      {!doc && (
        <label className={`drop drop-camera ${preparing ? "is-busy" : ""}`}>
          {/* capture="environment" opens the rear camera straight away on
              phones; on a computer it just opens the file picker. */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPickFiles}
            disabled={preparing}
          />
          <span className="drop-icon">
            {preparing ? <span className="spinner small" /> : <IconCamera size={24} />}
          </span>
          <span className="drop-main">
            {preparing ? prepLabel || "Preparing…" : "Take a photo of page 1"}
          </span>
          <span className="drop-hint">Then add each page after it</span>
        </label>
      )}

      {(!doc || doc.kind === "images") && (
        <label className={`upload-alt ${preparing ? "is-busy" : ""}`}>
          <input
            type="file"
            accept="application/pdf,image/*"
            multiple
            onChange={onPickFiles}
            disabled={preparing}
          />
          <IconUpload size={16} />
          {doc
            ? "Add photos from your camera roll"
            : `Or upload a PDF (up to ${MAX_FILE_MB} MB) or saved photos`}
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
          <span className="anchor">Less than most dealer admin fees</span>
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
        <IconLock size={16} />
        <span>Secure checkout by Stripe · <b>One-time payment</b></span>
      </div>

      <p className="consent">
        By continuing you agree to our <a href="/terms">Terms</a> and{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <button className="btn btn-link" onClick={onSeeSample}>
        See an example report first
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
        Example report — a typical used-SUV finance deal (made-up numbers)
      </div>
      <SampleReportBody />
      <button className="btn btn-cta" onClick={onBack}>
        Get my report — {PRICE_LABEL}
      </button>
      <div className="guarantee">
        <IconLock size={16} />
        <span>Secure checkout by Stripe · <b>One-time payment</b></span>
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
        <span>Secure payment by Stripe · <b>One-time, no subscription</b></span>
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
  "Reading every page",
  "Pulling out the numbers",
  "Re-doing the math",
  "Checking the fees and add-ons",
  "Looking for red flags in the fine print",
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
      <p className="card-title">Reading your contract…</p>
      <p className="card-sub">This usually takes a minute or two. Keep this page open.</p>
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
          Here&apos;s what you&apos;re being asked to sign, in plain English.
        </p>
      </div>
      <ReportMarkdown text={report} />
      <div className="report-actions">
        <button className="btn btn-teal" onClick={() => window.print()}>
          Save / print report
        </button>
        <button className="btn btn-ghost" onClick={onStartOver}>
          Check another deal
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
   A made-up but typical deal (no real dealer, buyer or vehicle) —
   labelled as an example on screen. If you swap in a real report later,
   strip names, VINs, addresses and the dealer's name first. */
function SampleReportBody() {
  return (
    <div className="report report-rich">
      <h4 style={{ marginTop: 4 }}>The bottom line</h4>
      <p>
        You&apos;re financing a used 2021 mid-size SUV for <b>84 months at
        8.99%</b>, with a trade-in that still has a loan on it. The vehicle
        price is reasonable, but the deal has <b>$6,742 of add-ons and fees</b>{" "}
        on top, <b>$3,200 of your old loan rolled in</b>, and the amount
        financed is <b>$400 higher than the numbers add up to</b>. My read:{" "}
        <b>stop and get answers first.</b>
      </p>
      <ul>
        <li>Ask what the extra $400 in the amount financed is for.</li>
        <li>Financing is &ldquo;subject to lender approval&rdquo; — confirm it&apos;s approved before you take the keys.</li>
        <li>Decide which add-ons you actually want; you&apos;re paying 8.99% interest on all of them.</li>
      </ul>

      <h4>The deal in numbers</h4>
      <ul>
        <li>Vehicle price: <b>$32,995</b></li>
        <li>Administration fee: $699</li>
        <li>Add-ons: protection package $1,995 · nitrogen tires $199 · VIN etching $399 · extended warranty $3,450</li>
        <li>Trade-in allowance: $8,000 — lien payout on the trade: $11,200</li>
        <li>GST (5%, Alberta): $1,586.85</li>
        <li>Down payment: $2,000</li>
        <li>Amount financed: <b>$42,923.85</b></li>
        <li>Rate and term: 8.99% for 84 months · payment <b>$690.39/month</b></li>
        <li>Total of payments: <b>$57,992.76</b> — cost of borrowing <b>$15,068.91</b></li>
      </ul>

      <h4>Does the math add up?</h4>
      <p>
        $32,995 + $699 fee + $6,043 add-ons = $39,737. Minus the $8,000
        trade-in, plus the $11,200 payout, plus $1,586.85 GST, minus your
        $2,000 down = <b>$42,523.85</b>. The contract says{" "}
        <b>$42,923.85 — $400 more</b>, and there&apos;s no line explaining it.
        It could be an unlisted fee or product, or a mistake. Either way, at
        8.99% over 84 months that $400 ends up costing you about $540.
      </p>
      <p>
        The payment and total of payments do match the stated rate and term.
        GST was correctly charged after the trade-in credit.
      </p>

      <h4>Add-ons &amp; fees</h4>
      <ul>
        <li>
          <b>Extended warranty ($3,450)</b> — covers repairs after the
          factory warranty runs out. Optional and usually negotiable. Check
          the deductible and what&apos;s excluded on the warranty form itself.
        </li>
        <li>
          <b>Protection package ($1,995)</b> — rustproofing plus paint and
          fabric protection. Optional. Often marked up heavily.
        </li>
        <li>
          <b>VIN etching ($399) and nitrogen ($199)</b> — low-value extras.
          Commonly pre-printed on the form; you can ask to remove them.
        </li>
        <li>
          <b>Administration fee ($699)</b> — in Alberta, advertised prices
          must include fees like this. If the online price didn&apos;t, ask
          for it to be removed.
        </li>
        <li>
          All of these are <b>rolled into the loan</b>, so you pay interest on
          them for seven years.
        </li>
      </ul>

      <h4>Red flags &amp; fine print</h4>
      <ul>
        <li>
          <b>&ldquo;Subject to lender approval.&rdquo;</b> If the lender says
          no, the dealer can ask you to sign a new deal or return the vehicle.
          Don&apos;t hand over your trade-in keys until financing is final.
        </li>
        <li>
          <b>$3,200 negative equity.</b> You owed more on your trade than
          it&apos;s worth, and that gap is now part of this loan. You&apos;ll
          likely owe more than the SUV is worth for several years.
        </li>
        <li>
          <b>84 months.</b> The same loan over 60 months would be about $891 a
          month, but would save you roughly <b>$4,500 in interest</b>.
        </li>
        <li>
          Page 2 says the vehicle was &ldquo;previously registered out of
          province.&rdquo; Ask for the vehicle history report.
        </li>
        <li>
          The back of page 1 was cut off in your photo — retake it so the
          terms on it can be checked.
        </li>
      </ul>

      <h4>Before you sign, ask</h4>
      <ul>
        <li>&ldquo;The numbers add up to $42,523.85. What&apos;s the extra $400?&rdquo;</li>
        <li>&ldquo;Is my financing approved, or still conditional? Can I have that in writing?&rdquo;</li>
        <li>&ldquo;Please take the nitrogen and VIN etching off.&rdquo;</li>
        <li>&ldquo;What would the payment be at 60 or 72 months?&rdquo;</li>
        <li>&ldquo;Can I see the vehicle history report and the full warranty terms?&rdquo;</li>
      </ul>
      <p>
        <i>This is a plain-English summary for general understanding, not
        legal or financial advice. Confirm the details with the dealer or
        lender before you sign.</i>
      </p>
    </div>
  );
}
