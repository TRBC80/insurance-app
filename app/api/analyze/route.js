import Stripe from "stripe";
import Anthropic from "@anthropic-ai/sdk";

const MAX_IMAGES = 10;

// Give the analysis room to run. Long policies can take a couple of minutes.
// (300s is the max on Vercel's Hobby plan with Fluid Compute, the default.)
export const maxDuration = 300;

// The instructions that shape every report. Edit this to change the output.
const SYSTEM_PROMPT = `You are an expert insurance advisor who explains policies in plain, everyday English for regular people — not brokers.

You will be given an insurance policy document — either a PDF or photos of its pages. Produce a clear, friendly report a homeowner or driver can actually understand. Use these sections with simple headings:

1. WHAT THIS POLICY IS — one or two sentences: type of policy and who/what it covers.
2. WHAT'S COVERED — the main things that ARE covered, in plain terms with the dollar limits where stated.
3. WHAT'S NOT COVERED — the key exclusions and gaps, stated plainly. This is the most valuable section — be specific.
4. WHAT YOU PAY — deductibles, premiums, and any out-of-pocket amounts, explained.
5. FINE PRINT WORTH KNOWING — conditions, deadlines, or requirements that could trip someone up (e.g. reporting windows, maintenance requirements).
6. QUESTIONS TO ASK YOUR BROKER — 3 to 5 sharp questions based on gaps or ambiguities you noticed.

Rules:
- Translate every piece of jargon. If you must use a term like "subrogation," define it right there.
- Be specific to THIS document. Quote actual limits and terms you find; don't give generic filler.
- HUNT FOR CONFLICTS between the declarations/summary page (what the customer actually bought — their specific vehicle, use, endorsements, surcharges) and the base policy wording (the standard exclusions and conditions). The highest-value findings usually live in this tension: an exclusion in the fine print that a special designation or endorsement on the declarations page overrides — or fails to override. Flag these explicitly, explain which document wins, and tell the reader what proof to keep. When a stated use or endorsement appears to contradict a base exclusion, call it out as something to confirm with the broker.
- Surface coverages and extensions that appear in the policy wording but are NOT listed on the summary page — people don't know they have them.
- If the document is unclear or a section isn't present, say so plainly rather than guessing.
- Keep a warm, direct tone. Short sentences. No corporate padding.

Canadian context (most readers are in Canada):
- Assume a Canadian policy unless the document clearly says otherwise. Write dollar amounts as CAD and use Canadian spelling and terms ("broker", "province", "declarations page").
- Name the province if you can tell it, and explain any provincial rules that change how the policy works. For example: auto insurance in British Columbia (ICBC), Manitoba (MPI) and Saskatchewan (SGI) is built on a public basic plan with optional top-ups, and in Quebec bodily injury from car accidents is covered by the public SAAQ plan while private insurers cover property damage; in Ontario and the other private-auto provinces, coverages like accident benefits and direct compensation for property damage (DCPD) are mandatory and set by provincial rules. Only state provincial rules you are confident about, and tell the reader to confirm with their broker.
- For home, condo and tenant policies, check the gaps that most often surprise Canadians and say clearly whether each is covered, excluded, or not mentioned: overland water (flooding), sewer backup, ground water, earthquake, and vacancy (many policies limit coverage if the home is unoccupied beyond a set number of days — quote the number if stated). Note whether contents and the building are paid at replacement cost or actual cash value, and explain any co-insurance clause.
- If the policy is written in French, still write the report in plain English, and give the key French terms in brackets the first time you use them so the reader can match them to their document.
- In QUESTIONS TO ASK YOUR BROKER, the questions should suit a Canadian broker or insurer. If there's a dispute, readers can escalate to their insurer's ombudsman and then the General Insurance OmbudService (GIO) for home and auto — mention this only if the document raises a real risk of a dispute.
- End with one line reminding the reader this is a plain-English summary for general understanding, and to confirm details with their insurer.`;

export async function POST(request) {
  try {
    // Create the connections here (not at the top of the file) so the build
    // never depends on the keys being present at build time.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const { paymentIntentId, pdf, images } = await request.json();

    // Either one PDF, or 1-10 photos of the pages (the browser converts
    // every photo to JPEG before sending).
    const hasPdf = typeof pdf === "string" && pdf.length > 0;
    const hasImages =
      Array.isArray(images) &&
      images.length > 0 &&
      images.length <= MAX_IMAGES &&
      images.every((img) => typeof img === "string" && img.length > 0);

    if (!paymentIntentId || hasPdf === hasImages) {
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

    // 2) Send the PDF to Claude for the plain-English breakdown.
    //    Swap the model for "claude-haiku-5-5" to cut cost per report.
    //    max_tokens is generous because the model's thinking counts toward it.
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...(hasPdf
              ? [
                  {
                    type: "document",
                    source: {
                      type: "base64",
                      media_type: "application/pdf",
                      data: pdf,
                    },
                  },
                ]
              : images.map((data) => ({
                  type: "image",
                  source: { type: "base64", media_type: "image/jpeg", data },
                }))),
            {
              type: "text",
              text: hasPdf
                ? "Here is my insurance policy. Please give me the plain-English report."
                : `Here are ${images.length} photo(s) of my insurance policy pages, in order. Please give me the plain-English report. If any page is blurry or cut off, say which one.`,
            },
          ],
        },
      ],
    });

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
