import { readJson, readAll, resolveToken } from "./store";

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function errorResponse(e) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong on our side. Try again in a moment." }, { status: 500 });
}

export async function loadContext(token) {
  const t = await resolveToken(token);
  if (!t || t.invite) throw new HttpError(404, "This link isn't valid. Ask your partner to send it again.");
  const base = `cases/${t.caseId}`;
  const [c, handoffs, joints, mine] = await Promise.all([
    readJson(`${base}/case.json`),
    readAll(`${base}/handoffs/`),
    readAll(`${base}/joint/`),
    readAll(`${base}/private/${t.role}/`),
  ]);
  if (!c) throw new HttpError(404, "This couple's space no longer exists.");
  const byTime = (a, b) => a.createdAt - b.createdAt;
  return {
    caseId: t.caseId, role: t.role, base, c,
    handoffs: handoffs.sort(byTime),
    joints: joints.filter((j) => j.summary).sort(byTime),
    mine: mine.sort(byTime),
  };
}

const ROLES = new Set(["A", "B", "counselor"]);
export function cleanMessages(raw, kind, role) {
  if (!Array.isArray(raw) || raw.length > 160) throw new HttpError(400, "This session is too long. Wrap up and start a new one.");
  return raw.map((m) => {
    const who = String(m?.who || "");
    const text = String(m?.text || "").slice(0, 6000);
    if (!ROLES.has(who)) throw new HttpError(400, "Bad message.");
    if (kind === "private" && who !== "counselor" && who !== role) throw new HttpError(400, "Bad message.");
    return { who, text, t: Number(m?.t) || Date.now() };
  });
}
export const validSid = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(s);
export const other = (r) => (r === "A" ? "B" : "A");
