import { readJson, writeJson, removeJson, newId, resolveToken } from "@/lib/store";
import { loadContext, errorResponse, HttpError } from "@/lib/context";
import { aiReady } from "@/lib/counselor";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const token = new URL(req.url).searchParams.get("t");
    const t = await resolveToken(token);
    if (!t) throw new HttpError(404, "This link isn't valid. Ask your partner to send it again.");

    // First open of an invite link: swap it for a fresh private link, so the person
    // who sent the invite can't use it to read the other partner's sessions.
    if (t.invite) {
      const path = `cases/${t.caseId}/case.json`;
      const c = await readJson(path);
      if (!c) throw new HttpError(404, "This couple's space no longer exists.");
      const fresh = newId(18);
      await writeJson(`tokens/${fresh}.json`, { caseId: t.caseId, role: t.role });
      await writeJson(path, { ...c, inviteB: null, claimedB: true });
      await removeJson(`tokens/${token}.json`);
      return Response.json({ rotated: fresh });
    }

    const ctx = await loadContext(token);
    const { c, role } = ctx;
    return Response.json({
      role,
      case: { nameA: c.nameA, nameB: c.nameB, emailB: role === "A" ? c.emailB : "", turn: c.turn, claimedB: c.claimedB },
      invite: role === "A" && !c.claimedB ? c.inviteB : null,
      handoffs: ctx.handoffs.map(({ id, from, summary, ask, createdAt }) => ({ id, from, summary, ask, createdAt })),
      joints: ctx.joints.map(({ id, summary, homework, createdAt }) => ({ id, summary, homework, createdAt })),
      privateCount: ctx.mine.length,
      hasKey: aiReady(),
    });
  } catch (e) { return errorResponse(e); }
}
