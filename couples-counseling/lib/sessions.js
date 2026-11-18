import { readJson, writeJson } from "./store";

export const sessionPath = (ctx, kind, sid) =>
  kind === "joint" ? `${ctx.base}/joint/${sid}.json` : `${ctx.base}/private/${ctx.role}/${sid}.json`;

export async function saveSession(ctx, kind, sid, patch) {
  const path = sessionPath(ctx, kind, sid);
  const prev = (await readJson(path)) || { id: sid, createdAt: Date.now() };
  const next = { ...prev, ...patch, id: sid, updatedAt: Date.now() };
  await writeJson(path, next);
  return next;
}
