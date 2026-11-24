import Anthropic from "@anthropic-ai/sdk";
import { getVercelOidcToken } from "@vercel/oidc";

// Two ways to reach Claude:
// 1. ANTHROPIC_API_KEY set  -> call Anthropic directly.
// 2. Otherwise, on Vercel   -> go through Vercel AI Gateway, signed in automatically with the
//    deployment's OIDC token (billed to the Vercel team's AI Gateway credits; no key needed).
const direct = Boolean(process.env.ANTHROPIC_API_KEY);
export const MODEL = direct ? "claude-opus-5-5" : "anthropic/claude-opus-5.5";
export const aiReady = () => direct || Boolean(process.env.AI_GATEWAY_API_KEY) || Boolean(process.env.VERCEL);

export async function getClient() {
  if (direct) return new Anthropic();
  const apiKey = process.env.AI_GATEWAY_API_KEY || (await getVercelOidcToken());
  return new Anthropic({ apiKey, baseURL: "https://ai-gateway.vercel.sh" });
}

const fmt = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const other = (r) => (r === "A" ? "B" : "A");

export function brief({ kind, c, role, handoffs, joints, myNotes }) {
  const name = (r) => (r === "A" ? c.nameA : c.nameB);
  const notes = handoffs.length
    ? handoffs.map((h) => `- ${name(h.from)} shared (${fmt(h.createdAt)}): ${h.summary}${h.ask ? `\n  Asked of ${name(other(h.from))}: ${h.ask}` : ""}`).join("\n")
    : "(none yet)";
  const jointText = joints.length
    ? joints.map((j) => `- Joint session (${fmt(j.createdAt)}): ${j.summary}${j.homework ? ` Practice: ${j.homework}` : ""}`).join("\n")
    : "(none yet)";

  const common = `You are Wren, an AI couples-counseling guide. You draw on Gottman Method and Emotionally Focused Therapy ideas: curiosity, reflecting the feelings and needs beneath complaints, spotting pursue/withdraw cycles, telling criticism from complaint, noticing repair attempts. You are warm, plain-spoken and neutral: you never take sides, diagnose, or declare who is right. You are not a licensed therapist; say so if asked, and suggest a licensed couples therapist when issues go beyond a guide (an affair in crisis, addiction, severe depression).

Style: 2 to 5 sentences per reply. Ask ONE question at a time. Reflect back what you heard before asking the next thing. No lists, headings or bold. Use first names.

SAFETY FIRST: If anyone mentions physical violence, threats, feeling afraid of their partner, being controlled (money, phone, who they see), forced sex, or thoughts of self-harm, set the counseling agenda aside. Respond with care, ask whether they are safe right now, and give: 911 for immediate danger, 988 for crisis support, National Domestic Violence Hotline 1-800-799-7233 (or text START to 88788). In that situation do NOT encourage joint sessions or sharing notes with the partner, because that can increase risk.

The couple: ${c.nameA} and ${c.nameB}.
Notes they have chosen to share with each other, oldest first:
${notes}
Joint sessions so far:
${jointText}`;

  if (kind === "joint") {
    return `${common}

This is a JOINT session: ${c.nameA} and ${c.nameB} are in the same room sharing one screen. Each message is labeled with who typed it. Address them by name, keep airtime balanced (if one has spoken several times in a row, invite the other), slow down escalation, and help each speak about their own feelings and needs rather than accusing. Start by setting one ground rule: one person speaks at a time, and the other reflects back what they heard before responding. Never reveal anything from private sessions beyond the shared notes above.`;
  }
  const me = name(role), them = name(other(role));
  const mine = myNotes.length ? myNotes.map((n) => `- ${fmt(n.createdAt)}: ${n.notes}`).join("\n") : "(this is their first session)";
  return `${common}

This is a PRIVATE session with ${me} only. ${them} cannot see this conversation. Everything here is confidential unless ${me} approves a summary at the end. You know ${them}'s side ONLY through the shared notes above: never invent or imply anything else about what ${them} said or feels.
Your private notes from ${me}'s earlier sessions:
${mine}

In a first session, start by understanding the relationship (how long together, kids, what made them seek help, what has been hardest lately). If ${them} has shared a note that ${me} has not responded to yet, bring it up gently early on and ask how it landed. Help ${me} understand their own feelings and also get curious about ${them}'s experience. Near a natural stopping point, mention they can press "Wrap up" to draft a note for ${them}.`;
}

// Turn stored messages into an alternating user/assistant list that ends on a user turn.
export function toMessages({ kind, c, briefText, messages, finalUser }) {
  const name = (r) => (r === "A" ? c.nameA : c.nameB);
  const out = [{ role: "user", content: "Please begin the session now with a short, warm opening and your first question." }];
  for (const m of messages) {
    const role = m.who === "counselor" ? "assistant" : "user";
    const content = m.who === "counselor" ? m.text : kind === "joint" ? `[${name(m.who)}]: ${m.text}` : m.text;
    const last = out[out.length - 1];
    if (last.role === role) last.content += "\n\n" + content;
    else out.push({ role, content });
  }
  if (finalUser) {
    const last = out[out.length - 1];
    if (last.role === "user") last.content += "\n\n" + finalUser;
    else out.push({ role: "user", content: finalUser });
  }
  return out;
}

// On Vercel AI Gateway the free tier doesn't include every model, so try the best one first
// and step down to the next Claude model when the gateway says the model isn't available.
const GATEWAY_MODELS = ["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-5.5", "anthropic/claude-haiku-5.5"];
let gatewayStart = 0; // remembers the first model that worked, per server instance

const modelUnavailable = (e) => e?.status === 403 && /free tier|not have access|no_providers_available/i.test(e?.message || "");

// Send the full request first (refusal fallback on direct Anthropic, effort, structured output).
// If the endpoint rejects an option it doesn't support, retry once with only the basics.
async function callOnce(client, full, basic, extra) {
  try {
    return await client.beta.messages.create({ ...full, ...extra });
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) {
      console.warn("Retrying with basic request:", e.message);
      return client.messages.create(basic);
    }
    throw e;
  }
}

export async function callClaude(full, basic) {
  const client = await getClient();
  if (direct) return callOnce(client, full, basic, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  let lastErr;
  for (let i = gatewayStart; i < GATEWAY_MODELS.length; i++) {
    const model = GATEWAY_MODELS[i];
    try {
      const res = await callOnce(client, { ...full, model }, { ...basic, model }, {});
      gatewayStart = i;
      return res;
    } catch (e) {
      lastErr = e;
      if (!modelUnavailable(e)) throw e;
      console.warn(`${model} not available on this plan; trying the next model.`);
    }
  }
  gatewayStart = 0;
  throw lastErr;
}
