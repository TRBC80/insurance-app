import Stripe from "stripe";
import Anthropic from "@anthropic-ai/sdk";

const MAX_IMAGES = 20;
const MAX_TEXT_CHARS = 3_800_000;

// Give the analysis room to run. Long contracts can take a couple of minutes.
// (300s is the max on Vercel's Hobby plan with Fluid Compute, the default.)
export const maxDuration = 300;

// The instructions that shape every report. Edit this to change the output.
const SYSTEM_PROMPT = `You review vehicle dealership paperwork for the buyer and explain it in plain, everyday English. The reader is usually sitting at the dealership right now, about to sign, reading on a phone. Lead with what matters most and keep it easy to scan.

You will get photos or a PDF of dealership paperwork. It may be a bill of sale, buyer's order or purchase agreement; a finance contract (conditional sales contract / retail instalment contract); a lease agreement; a trade-in appraisal; an extended warranty or "protection package" contract; or several of these. Pages may be missing or partly cut off.

Use these sections with simple headings:

1. THE BOTTOM LINE — two to four sentences: what this deal is (cash purchase, finance or lease; the vehicle; new or used), and your overall read: "looks clean", "a few things to fix before signing", or "stop and get answers first". Then the top one to three things to deal with before signing, as bullets.
2. THE DEAL IN NUMBERS — vehicle price, each fee, each add-on, trade-in allowance and any lien payout on the trade, down payment, rebates, taxes, amount financed, interest rate (APR), term, payment and how often, total of payments, and total cost of borrowing. For a lease: agreed value (capitalized cost), residual / buyout, lease rate or money factor, kilometre allowance and the per-km overage charge, and amount due at signing. Quote figures exactly as written. If a figure isn't on the pages, say "not shown".
3. DOES THE MATH ADD UP? — check it yourself: price + fees + add-ons − trade-in allowance + lien payout + taxes − down payment − rebates should equal the amount financed; payment × number of payments should equal the total of payments; the payment should roughly match the rate and term. Show the arithmetic briefly. Flag any gap, even a small one, and say what could explain it (an unlisted fee or product, a tax difference, rounding). If figures are missing, say which ones stopped you checking.
4. ADD-ONS & FEES — every extra: extended warranty, GAP or "loan protection", creditor life/disability insurance, rustproofing, paint/fabric/undercoating protection, nitrogen in the tires, VIN etching or theft-deterrent, tire & rim, key replacement, administration / documentation fees, "dealer prep", freight and PDI, security or tracking devices. For each, say in one line what it is, whether it is normally optional and negotiable, and whether it appears to be rolled into the loan (so interest is paid on it). Point out products that are pre-printed or presented as required.
5. RED FLAGS & FINE PRINT — things in these pages such as: financing "subject to lender approval" or conditional/spot-delivery terms that let the dealer change the deal or take the car back after you drive away; negative equity from the trade rolled into the new loan; an "as is" sale; vehicle history disclosures (prior accident or damage, salvage/rebuilt, out-of-province, former rental, taxi or police use, odometer issues); a rate higher than what the buyer was likely quoted; long terms (84 months or more) and how much extra interest they cost; balloon payments or prepayment penalties; blank spaces or "TBD" figures; bi-weekly vs monthly payment confusion; acknowledgements that the buyer "was offered and declined" something; warranty start dates; arbitration or waiver clauses. Only raise what is actually on (or conspicuously missing from) these pages.
6. BEFORE YOU SIGN, ASK — three to six short, direct things to say to the salesperson or finance manager, each tied to something on the page, including anything to have removed or put in writing.

Rules:
- Translate jargon on the spot.
- Be specific to THIS document. Quote figures. No generic filler.
- Don't accuse the dealer of wrongdoing. Say what the document says and why it matters, and separate "normal" from "worth questioning".
- If a page is blurry, cut off or seems to be missing (common with photos — the back of a contract, or "page 2 of 3"), say which, say what you couldn't check, and tell the reader to photograph it.
- If the document isn't vehicle dealership paperwork, say so plainly.
- Write for a phone screen: short paragraphs, bullets, bold the key number or phrase. Do not use tables.

Canadian context (most readers are in Canada):
- Assume Canada unless the document says otherwise. Dollar amounts in CAD; Canadian spelling.
- Name the province if you can tell it. Check that the tax charged looks right for that province and whether it was charged on the price after the trade-in credit; only state tax rates you are confident about, and say when the reader should confirm.
- Several provinces require dealers to advertise all-in prices that include fees other than taxes (and in some provinces licensing), for example Ontario (OMVIC), Alberta (AMVIC) and British Columbia (Vehicle Sales Authority of BC). If an administration or similar fee is added on top of an advertised price, tell the reader they can ask for it to be removed and can raise it with their provincial regulator. Only name rules you are confident about.
- In most provinces there is no general cooling-off period for buying a vehicle from a dealer: once it's signed it's usually binding. Make clear that now — before signing — is the time to ask.
- Finance and lease contracts must disclose the cost of borrowing (APR and total cost of credit) under provincial consumer protection law; flag it if that disclosure is missing.
- If the paperwork is in French, still write in plain English, and give the key French terms in brackets the first time you use them so the reader can match them to the document.
- End with one line reminding the reader this is a plain-English summary for general understanding, not legal or financial advice, and to confirm details with the dealer or lender before signing.`;

// Build the message content for whichever upload type we received.
function buildContent({ hasPdf, hasExtracted, pdf, images, extracted }) {
  const image = (data) => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data },
  });

  if (hasPdf) {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdf },
      },
      {
        type: "text",
        text: "Here is my dealership paperwork. Please give me the plain-English review before I sign.",
      },
    ];
  }

  if (hasExtracted) {
    const pageImages = extracted.images.flatMap((img) => [
      { type: "text", text: `Image of page ${img.page}:` },
      image(img.data),
    ]);
    return [
      ...pageImages,
      {
        type: "document",
        source: { type: "text", media_type: "text/plain", data: extracted.text },
        title: "Full contract text (extracted from the PDF)",
      },
      {
        type: "text",
        text:
          `Here is my dealership paperwork (${extracted.pageCount} pages). The text of every page was extracted ` +
          "from the PDF; images are included for the first pages (usually the deal summary) and for " +
          "any scanned pages, because tables and layout can be lost in extraction. Use both. " +
          "Please give me the plain-English review before I sign.",
      },
    ];
  }

  return [
    ...images.map(image),
    {
      type: "text",
      text: `Here are ${images.length} photo(s) of my dealership paperwork, in the order I took them. Please give me the plain-English review before I sign. If any page is blurry, cut off or looks like it's missing, say which one.`,
    },
  ];
}

export async function POST(request) {
  try {
    // Create the connections here (not at the top of the file) so the build
    // never depends on the keys being present at build time.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const { paymentIntentId, pdf, images, extracted } = await request.json();

    // Exactly one of:
    //  - pdf: a small PDF, sent as-is
    //  - images: 1-20 photos of the pages (converted to JPEG in the browser)
    //  - extracted: a large PDF shrunk in the browser to its text plus
    //    JPEG images of key/scanned pages ({ text, images: [{ page, data }], pageCount })
    const hasPdf = typeof pdf === "string" && pdf.length > 0;
    const hasImages =
      Array.isArray(images) &&
      images.length > 0 &&
      images.length <= MAX_IMAGES &&
      images.every((img) => typeof img === "string" && img.length > 0);
    const hasExtracted =
      extracted &&
      typeof extracted.text === "string" &&
      extracted.text.length > 0 &&
      extracted.text.length <= MAX_TEXT_CHARS &&
      Array.isArray(extracted.images) &&
      extracted.images.length <= MAX_IMAGES &&
      extracted.images.every(
        (img) =>
          img &&
          Number.isInteger(img.page) &&
          typeof img.data === "string" &&
          img.data.length > 0
      );

    if (!paymentIntentId || [hasPdf, hasImages, hasExtracted].filter(Boolean).length !== 1) {
      return Response.json({ error: "Missing information." }, { status: 400 });
    }

    // 1) Verify the payment actually succeeded before doing any paid work.
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") {
      return Response.json(
        { error: "Payment not confirmed." },
        { status: 402 }
      );
    }

    // One payment = one report. Stops a paid payment ID being replayed for
    // unlimited free reports.
    if (intent.metadata?.report_delivered === "true") {
      return Response.json(
        { error: "A report was already generated for this payment." },
        { status: 409 }
      );
    }

    // 2) Send the paperwork to Claude for the plain-English review.
    //    Streaming avoids HTTP timeouts on long contracts; finalMessage()
    //    waits for the whole reply. Opus 5.5 thinks before answering, which
    //    matters here because the report re-checks the deal's arithmetic.
    //    "fallbacks: default" re-runs the request on another model if this
    //    one declines, instead of failing the paid report.
    const message = await anthropic.beta.messages
      .stream({
        model: "claude-opus-5-5",
        max_tokens: 32000,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildContent({ hasPdf, hasExtracted, pdf, images, extracted }),
          },
        ],
      })
      .finalMessage();

    if (message.stop_reason === "refusal") {
      return Response.json(
        { error: "This document couldn't be analyzed. Please contact us for a refund." },
        { status: 422 }
      );
    }

    const report = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    if (!report.trim()) {
      return Response.json(
        { error: "The analysis came back empty. Please try again." },
        { status: 502 }
      );
    }

    // Mark this payment as used only once a report actually exists, so a
    // failed analysis can still be retried with the same payment.
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: { report_delivered: "true" },
    });

    return Response.json({ report });
  } catch (err) {
    console.error("analyze error:", err);
    return Response.json(
      { error: "Could not analyze the document. Please try again." },
      { status: 500 }
    );
  }
}
