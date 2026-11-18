import { client, MODEL, brief, toMessages, withFallback, fallbackParams } from "@/lib/counselor";
import { loadContext, cleanMessages, validSid, errorResponse, HttpError, other } from "@/lib/context";
import { saveSession } from "@/lib/sessions";

export const maxDuration = 120;

const str = { type: "string" };
const schemas = {
  private: { type: "object", properties: { notes: str, summary: str, ask: str }, required: ["notes", "summary", "ask"], additionalProperties: false },
  joint: { type: "object", properties: { summary: str, homework: str }, required: ["summary", "homework"], additionalProperties: false },
};

export async function POST(req) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "The counselor isn't connected yet.");
    const body = await req.json().catch(() => ({}));
    const kind = body.kind === "joint" ? "joint" : "private";
    if (!validSid(body.sessionId)) throw new HttpError(400, "Bad session.");
    const ctx = await loadContext(body.t);
    const messages = cleanMessages(body.messages, kind, ctx.role);
    const name = (r) => (r === "A" ? ctx.c.nameA : ctx.c.nameB);
    const me = name(ctx.role), them = name(other(ctx.role));

    const ask = kind === "joint"
      ? `The session is ending. Write "summary": a 4-6 sentence neutral summary, addressed to both of them, of what each partner expressed and any agreements. Write "homework": one small, concrete thing to practice before the next session.`
      : `The session is ending. Fill in three fields.
"notes": your private notes for yourself for next time (themes, feelings, patterns, open threads), 3-5 sentences.
"summary": a draft note FROM ${me} TO ${them}, in first person as ${me}, 3-6 sentences. Share feelings and needs, not accusations or a list of complaints. Include only what ${me} would plausibly be comfortable sharing; leave out anything that sounded confidential and anything about safety concerns.
"ask": one specific, gentle request ${me} is making of ${them}, first person, one sentence. Empty string if none came up.`;

    const res = await withFallback((fb) => client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: brief({ kind, c: ctx.c, role: ctx.role, handoffs: ctx.handoffs, joints: ctx.joints, myNotes: ctx.mine.filter((m) => m.notes) }),
      output_config: { effort: "medium", format: { type: "json_schema", schema: schemas[kind] } },
      messages: toMessages({ kind, c: ctx.c, messages, finalUser: ask }),
      ...fallbackParams(fb),
    }));
    const textBlock = res.content.find((b) => b.type === "text");
    let draft = {};
    try { draft = JSON.parse(textBlock?.text || "{}"); } catch {}
    if (kind === "private") await saveSession(ctx, kind, body.sessionId, { kind, messages, notes: draft.notes || "" });
    else await saveSession(ctx, kind, body.sessionId, { kind, messages });
    return Response.json({ summary: draft.summary || "", ask: draft.ask || "", homework: draft.homework || "" });
  } catch (e) { return errorResponse(e); }
}
