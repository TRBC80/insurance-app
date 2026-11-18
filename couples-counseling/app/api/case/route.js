import { writeJson, newId } from "@/lib/store";
import { errorResponse, HttpError } from "@/lib/context";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const clean = (s, n) => String(s || "").trim().slice(0, n);
    const nameA = clean(body.nameA, 40), nameB = clean(body.nameB, 40), emailB = clean(body.emailB, 120);
    if (!nameA || !nameB) throw new HttpError(400, "Enter both first names.");
    const caseId = newId(9), tokenA = newId(18), inviteB = newId(18);
    await Promise.all([
      writeJson(`cases/${caseId}/case.json`, { nameA, nameB, emailB, turn: "A", createdAt: Date.now(), inviteB, claimedB: false }),
      writeJson(`tokens/${tokenA}.json`, { caseId, role: "A" }),
      writeJson(`tokens/${inviteB}.json`, { caseId, role: "B", invite: true }),
    ]);
    return Response.json({ token: tokenA });
  } catch (e) { return errorResponse(e); }
}
