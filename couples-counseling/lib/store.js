import { put, get, list, del } from "@vercel/blob";
import { randomBytes } from "crypto";

// All data lives in a PRIVATE Vercel Blob store. Nothing is publicly readable;
// every read goes through these API routes, which check the partner's secret link token.
const opts = { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" };

export const newId = (bytes = 9) => randomBytes(bytes).toString("base64url");

export async function readJson(path) {
  const res = await get(path, { access: "private", useCache: false });
  if (!res || !res.stream) return null;
  return JSON.parse(await new Response(res.stream).text());
}
export async function writeJson(path, data) {
  await put(path, JSON.stringify(data), opts);
}
export async function removeJson(path) {
  try { await del(path); } catch {}
}
export async function readAll(prefix) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const docs = await Promise.all(out.map((b) => readJson(b.pathname).catch(() => null)));
  return docs.filter(Boolean);
}

// token -> { caseId, role, invite }
export async function resolveToken(token) {
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return readJson(`tokens/${token}.json`);
}
