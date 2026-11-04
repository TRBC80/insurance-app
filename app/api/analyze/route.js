import Stripe from "stripe";
import Anthropic from "@anthropic-ai/sdk";

// Give the analysis room to run. Long policies can take a couple of minutes.
// (300s is the max on Vercel's Hobby plan with Fluid Compute, the default.)
export const maxDuration = 300;

// The instructions that shape every report. Edit this to change the output.
const SYSTEM_PROMPT = `You are an expert insurance advisor who explains policies in plain, everyday English for regular people — not brokers.

You will be given an insurance policy document. Produce a clear, friendly report a homeowner or driver can actually understand. Use these sections with simple headings:

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
- End with one line reminding the reader this is a plain-English summary for general understanding, and to confirm details with their insurer.`;

export async function POST(request) {
  try {
    // Create the connections here (not at the top of the file) so the build
    // never depends on the keys being present at build time.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const { paymentIntentId, pdf } = await request.json();

    if (!paymentIntentId || !pdf) {
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
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdf,
              },
            },
            {
              type: "text",
              text: "Here is my insurance policy. Please give me the plain-English report.",
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
