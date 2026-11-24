import { MODEL, brief, toMessages, callClaude, aiReady } from "@/lib/counselor";
import { loadContext, cleanMessages, validSid, errorResponse, HttpError } from "@/lib/context";
import { saveSession } from "@/lib/sessions";

export const maxDuration = 120;

export async function POST(req) {
  let ctx, kind, sid, messages;
  try {
    if (!aiReady()) throw new HttpError(503, "The counselor isn't connected yet: the site owner needs to add an Anthropic API key.");
    const body = await req.json().catch(() => ({}));
    kind = body.kind === "joint" ? "joint" : "private";
    sid = body.sessionId;
    if (!validSid(sid)) throw new HttpError(400, "Bad session.");
    ctx = await loadContext(body.t);
    messages = cleanMessages(body.messages, kind, ctx.role);
  } catch (e) { return errorResponse(e); }

  const briefText = brief({ kind, c: ctx.c, role: ctx.role, handoffs: ctx.handoffs, joints: ctx.joints, myNotes: ctx.mine.filter((m) => m.notes) });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let text = "";
      try {
        const base = { model: MODEL, max_tokens: 8000, stream: true, system: briefText, messages: toMessages({ kind, c: ctx.c, messages }) };
        const events = await callClaude({ ...base, output_config: { effort: "low" } }, base);
        for await (const event of events) {
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            text += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        if (!text.trim()) {
          text = "I want to make sure I respond to that with care, and I wasn't able to just now. Could you say a little more about what's going on, or how you're feeling right now?";
          controller.enqueue(encoder.encode(text));
        }
        await saveSession(ctx, kind, sid, { kind, messages: [...messages, { who: "counselor", text: text.trim(), t: Date.now() }] });
      } catch (e) {
        console.error(e);
        const billing = e?.status === 403 || e?.status === 402 || /credit|billing|verification/i.test(e?.message || "");
        const msg = billing
          ? "Wren isn't switched on yet: the site owner needs to finish billing setup for the AI service."
          : "Wren lost the thread for a moment. Resend your last message.";
        controller.enqueue(encoder.encode("\u0000ERROR:" + msg));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
