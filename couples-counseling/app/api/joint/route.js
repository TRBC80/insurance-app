import { loadContext, validSid, errorResponse, HttpError } from "@/lib/context";
import { saveSession } from "@/lib/sessions";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!validSid(body.sessionId)) throw new HttpError(400, "Bad session.");
    const summary = String(body.summary || "").trim().slice(0, 4000);
    const homework = String(body.homework || "").trim().slice(0, 1000);
    if (!summary) throw new HttpError(400, "Write a summary first.");
    const ctx = await loadContext(body.t);
    await saveSession(ctx, "joint", body.sessionId, { summary, homework });
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
