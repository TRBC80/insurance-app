import { readJson, writeJson } from "@/lib/store";
import { loadContext, validSid, errorResponse, HttpError, other } from "@/lib/context";
import { saveSession } from "@/lib/sessions";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!validSid(body.sessionId)) throw new HttpError(400, "Bad session.");
    const summary = String(body.summary || "").trim().slice(0, 4000);
    const ask = String(body.ask || "").trim().slice(0, 1000);
    if (!summary) throw new HttpError(400, "Write something to share first.");
    const ctx = await loadContext(body.t);
    await writeJson(`${ctx.base}/handoffs/${body.sessionId}.json`, { id: body.sessionId, from: ctx.role, summary, ask, createdAt: Date.now() });
    const c = await readJson(`${ctx.base}/case.json`);
    await writeJson(`${ctx.base}/case.json`, { ...c, turn: other(ctx.role), updatedAt: Date.now() });
    await saveSession(ctx, "private", body.sessionId, { shared: true });
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
