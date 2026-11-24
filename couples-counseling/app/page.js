"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const other = (r) => (r === "A" ? "B" : "A");
const fmt = (t) => (t ? new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const newSid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => "abcdefghijkmnpqrstuvwxyz23456789"[x % 32]).join("");
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const readToken = () => (typeof location !== "undefined" ? (location.hash.match(/^#t=([A-Za-z0-9_-]+)$/) || [])[1] || null : null);

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

function remember(token, nameA, nameB, role) {
  const list = (ls.get("cc-spaces") || []).filter((s) => s.token !== token);
  ls.set("cc-spaces", [{ token, nameA, nameB, role }, ...list].slice(0, 6));
}

async function copyText(text, setLabel) {
  try { await navigator.clipboard.writeText(text); setLabel("Copied"); }
  catch { setLabel("Select the text above to copy"); }
  setTimeout(() => setLabel(null), 1800);
}

export default function App() {
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setToken(readToken());
    sync(); setReady(true);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <div className="wrap">
      <header className="top">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); history.pushState(null, "", "/"); setToken(null); }}>
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="9.5" cy="13" r="7.5" fill="none" stroke="var(--a)" strokeWidth="2.2" /><circle cx="16.5" cy="13" r="7.5" fill="none" stroke="var(--b)" strokeWidth="2.2" /></svg>
          Couples Counseling
        </a>
        <span className="pill">Prototype</span>
      </header>
      <main className="stack" style={{ gap: 24 }}>
        {!ready ? <p className="muted">Opening…</p> : token ? <Space key={token} token={token} /> : <Home />}
      </main>
      <footer className="safety">
        <span><b>Prototype.</b> Wren is an AI guide, not a licensed therapist, and cannot handle emergencies.</span>
        <span>In danger right now: call 911. Crisis support: call or text 988. National Domestic Violence Hotline: 1-800-799-7233 or text START to 88788.</span>
      </footer>
    </div>
  );
}

/* ---------------- home ---------------- */
function Home() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [spaces, setSpaces] = useState([]);
  useEffect(() => setSpaces(ls.get("cc-spaces") || []), []);

  async function create(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try {
      const { token } = await api("/api/case", { nameA: f.get("nameA"), nameB: f.get("nameB"), emailB: f.get("emailB") });
      remember(token, f.get("nameA"), f.get("nameB"), "A");
      location.hash = "t=" + token;
    } catch (x) { setErr(x.message); setBusy(false); }
  }

  return (
    <>
      <section className="hero">
        <span className="label">Couples counseling, one turn at a time</span>
        <h1>Work on your marriage with a counselor who hears both sides.</h1>
        <p className="muted">Each of you talks privately with Wren, an AI counseling guide. At the end of your session you approve a short note for your partner. They read it, take their own session, and reply. When you&apos;re ready, sit down together for a joint session.</p>
      </section>
      <section className="steps">
        <div className="step"><b>1</b><h3>Talk privately</h3><p className="muted small">Wren asks questions and helps you put words to what&apos;s going on. Your full conversation stays private to you.</p></div>
        <div className="step"><b>2</b><h3>Share what you choose</h3><p className="muted small">Wren drafts a note for your partner. You edit it and decide what to send.</p></div>
        <div className="step"><b>3</b><h3>Pass the turn</h3><p className="muted small">Your partner gets their own private link, reads your note, and takes their turn.</p></div>
      </section>
      <form className="panel" onSubmit={create}>
        <h2>Start your couple&apos;s space</h2>
        <div className="row" style={{ alignItems: "stretch" }}>
          <label className="field">Your first name<input id="nameA" name="nameA" required maxLength={40} placeholder="e.g. Mike" /></label>
          <label className="field">Your partner&apos;s first name<input id="nameB" name="nameB" required maxLength={40} placeholder="e.g. Sarah" /></label>
        </div>
        <label className="field">Partner&apos;s email (optional, used to address the invite)<input id="emailB" name="emailB" type="email" maxLength={120} placeholder="sarah@example.com" /></label>
        <div className="row">
          <button className="primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create space"}</button>
          <span className="small muted">You&apos;ll get your own private link, and a separate invite link for your partner.</span>
        </div>
        {err && <div className="notice">{err}</div>}
      </form>
      {spaces.length > 0 && (
        <section className="stack">
          <span className="label">Your spaces on this device</span>
          {spaces.map((s) => (
            <a key={s.token} className="btn" href={"#t=" + s.token}>{s.nameA} &amp; {s.nameB} <span className="small muted">as {s.role === "A" ? s.nameA : s.nameB}</span></a>
          ))}
        </section>
      )}
    </>
  );
}

/* ---------------- couple's space ---------------- */
function Space({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [session, setSession] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api("/api/me?t=" + encodeURIComponent(token));
      if (d.rotated) {
        // Invite link opened for the first time: swap to this partner's own private link.
        ls.set("cc-new-link", d.rotated);
        history.replaceState(null, "", "/#t=" + d.rotated);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        return;
      }
      setData(d);
      remember(token, d.case.nameA, d.case.nameB, d.role);
    } catch (x) { setErr(x.message); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="notice">{err}</div>;
  if (!data) return <p className="muted">Loading your space…</p>;
  if (session) return <Session token={token} data={data} session={session} setSession={setSession} onDone={() => { setSession(null); load(); }} />;
  return <Dashboard token={token} data={data} start={(kind) => setSession({ kind, id: newSid(), messages: [], phase: "chat" })} />;
}

function Dashboard({ token, data, start }) {
  const c = data.case, me = data.role, them = other(me);
  const name = (r) => (r === "A" ? c.nameA : c.nameB);
  const myTurn = c.turn === me;
  const [copyLabel, setCopyLabel] = useState(null);
  const [copyMine, setCopyMine] = useState(null);
  const [isNew, setIsNew] = useState(false);
  useEffect(() => { if (ls.get("cc-new-link") === token) { setIsNew(true); ls.set("cc-new-link", null); } }, [token]);
  const origin = typeof location !== "undefined" ? location.origin : "";
  const myLink = `${origin}/#t=${token}`;
  const inviteLink = data.invite ? `${origin}/#t=${data.invite}` : null;
  const counts = (r) => data.handoffs.filter((h) => h.from === r).length;
  const timeline = [
    ...data.handoffs.map((h) => ({ t: h.createdAt, key: "h" + h.id, el: (
      <div className={"entry " + h.from.toLowerCase()}>
        <span className="small"><b className={"who-" + h.from.toLowerCase()}>{name(h.from)}</b> <span className="muted">shared after a private session · {fmt(h.createdAt)}</span></span>
        <div className="body">{h.summary}</div>
        {h.ask && <div className="small"><span className="label">Asking of {name(other(h.from))}</span><div className="body">{h.ask}</div></div>}
      </div>) })),
    ...data.joints.map((j) => ({ t: j.createdAt, key: "j" + j.id, el: (
      <div className="entry j">
        <span className="small"><b>Joint session</b> <span className="muted">· {fmt(j.createdAt)}</span></span>
        <div className="body">{j.summary}</div>
        {j.homework && <div className="small"><span className="label">Practice before next time</span><div className="body">{j.homework}</div></div>}
      </div>) })),
  ].sort((x, y) => y.t - x.t);
  const theirNote = data.handoffs.some((h) => h.from === them);

  return (
    <>
      {isNew && (
        <div className="panel">
          <h2>Welcome, {name(me)}</h2>
          <p className="muted">This is your own private link. Bookmark it: it&apos;s the only way back to your sessions, and your partner can&apos;t open it.</p>
          <div className="copybox">{myLink}</div>
          <div className="row"><button onClick={() => copyText(myLink, setCopyMine)}>{copyMine || "Copy my link"}</button></div>
        </div>
      )}
      <section className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>{c.nameA} &amp; {c.nameB}</h1>
          <span className={"pill" + (myTurn ? " turn" : "")}>{myTurn ? "Your turn" : "Waiting on " + name(them)}</span>
        </div>
        <div className="partners">
          {["A", "B"].map((r) => (
            <div key={r} className={"partner " + r.toLowerCase()}>
              <span className="row" style={{ gap: 8 }}><span className={"dot " + r.toLowerCase()} /><b>{name(r)}</b>{r === me && <span className="small muted">(you)</span>}</span>
              <span className="small muted">{counts(r)} note{counts(r) === 1 ? "" : "s"} shared{r === me ? ` · ${data.privateCount} private session${data.privateCount === 1 ? "" : "s"}` : ""}</span>
            </div>
          ))}
        </div>
      </section>

      {inviteLink && (
        <section className="panel">
          <h2>Invite {name(them)}</h2>
          <p className="muted small">Send {name(them)} this link{c.emailB ? ` at ${c.emailB}` : ""}. The first time they open it, it turns into their own private link and stops working for anyone else.</p>
          <div className="copybox">{inviteLink}</div>
          <div className="row"><button onClick={() => copyText(inviteLink, setCopyLabel)}>{copyLabel || "Copy invite link"}</button></div>
        </section>
      )}

      <section className="panel">
        <h2>{myTurn ? (data.handoffs.length ? `Your turn to respond to ${name(them)}` : "Start with a private session") : "Talk with Wren any time"}</h2>
        <p className="muted">{myTurn
          ? (theirNote ? `Wren has read ${name(them)}'s latest note and will bring it up gently. Nothing you say is shared unless you approve it.` : "Wren will ask about your relationship and what's been hard lately. Plan on 15 to 30 minutes.")
          : `${name(them)} has your latest note. You can still talk privately with Wren while you wait.`}</p>
        <div className="row">
          <button className="primary" disabled={!data.hasKey} onClick={() => start("private")}>Start my private session</button>
          <button disabled={!data.hasKey} onClick={() => start("joint")}>Start a joint session (same room)</button>
        </div>
        {!data.hasKey && <div className="notice">The counselor isn&apos;t connected yet. The site owner needs to add an Anthropic API key in Vercel.</div>}
        {!isNew && <details><summary className="small muted">Your private link</summary><div className="copybox" style={{ marginTop: 8 }}>{myLink}</div></details>}
      </section>

      <section className="stack">
        <span className="label">What you&apos;ve shared with each other</span>
        {timeline.length
          ? <div className="timeline">{timeline.map((x) => <div key={x.key}>{x.el}</div>)}</div>
          : <div className="empty">Nothing shared yet. When one of you finishes a private session and approves a note, it appears here for both of you.</div>}
      </section>
    </>
  );
}

/* ---------------- session ---------------- */
function Session({ token, data, session, setSession, onDone }) {
  const c = data.case, me = data.role, them = other(me);
  const name = (r) => (r === "A" ? c.nameA : c.nameB);
  const joint = session.kind === "joint";
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState(null);
  const [speaker, setSpeaker] = useState(me);
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);
  const started = useRef(false);

  const counselorTurn = useCallback(async (messages) => {
    setBusy(true); setError(null); setStreaming("");
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, kind: session.kind, sessionId: session.id, messages }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Wren lost the thread for a moment. Resend your last message."); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        const errAt = text.indexOf("\u0000ERROR");
        if (errAt !== -1) throw new Error(text.slice(errAt + 7).replace(/^:/, "") || "Wren lost the thread for a moment. Resend your last message.");
        setStreaming(text);
      }
      setSession((s) => ({ ...s, messages: [...messages, { who: "counselor", text: text.trim(), t: Date.now() }] }));
    } catch (x) { setError(x.message); }
    setStreaming(""); setBusy(false);
  }, [token, session.kind, session.id, setSession]);

  useEffect(() => { if (!started.current && session.messages.length === 0) { started.current = true; counselorTurn([]); } }, [counselorTurn, session.messages.length]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [session.messages.length, streaming]);

  function send(e) {
    e?.preventDefault();
    const text = draft.trim(); if (!text || busy) return;
    const messages = [...session.messages, { who: joint ? speaker : me, text, t: Date.now() }];
    setSession((s) => ({ ...s, messages })); setDraft("");
    counselorTurn(messages);
  }
  const retry = () => counselorTurn(session.messages);

  if (session.phase === "wrap") return <Wrap token={token} data={data} session={session} setSession={setSession} onDone={onDone} />;
  if (session.phase === "sent") return <Sent token={token} data={data} onDone={onDone} />;

  const peopleCount = session.messages.filter((m) => m.who !== "counselor").length;
  return (
    <>
      <section className="row" style={{ justifyContent: "space-between" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="label">{joint ? "Joint session" : "Private session"}</span>
          <h2>{joint ? `${c.nameA} & ${c.nameB} with Wren` : `${name(me)} with Wren`}</h2>
          <span className="small muted">{joint ? "Both of you can see this conversation. Switch the speaker before typing." : `Private to you. ${name(them)} sees only what you approve.`}</span>
        </div>
        <div className="row">
          <button disabled={busy || peopleCount < 2} onClick={() => setSession((s) => ({ ...s, phase: "wrap" }))}>Wrap up</button>
          <button className="ghost" onClick={onDone}>Leave</button>
        </div>
      </section>
      <section className="chat" aria-live="polite">
        {session.messages.map((m, i) => m.who === "counselor"
          ? <div key={i} className="msg counselor"><span className="who">Wren</span><div className="txt">{m.text}</div></div>
          : <div key={i} className={"msg " + m.who.toLowerCase() + (joint && m.who === "B" ? " joint-b" : "")}><span className="who">{name(m.who)}</span><div className="txt">{m.text}</div></div>)}
        {busy && <div className="msg counselor"><span className="who">Wren</span><div className={"txt" + (streaming ? "" : " typing")}>{streaming || "…"}</div></div>}
        {error && <div className="notice">{error} <button onClick={retry}>Retry</button></div>}
        <div ref={endRef} />
      </section>
      <form className="composer" onSubmit={send}>
        {joint && (
          <div className="row"><span className="small muted">Speaking:</span>
            <div className="seg" role="group" aria-label="Who is speaking">
              <button type="button" className="a" aria-pressed={speaker === "A"} onClick={() => setSpeaker("A")}>{c.nameA}</button>
              <button type="button" className="b" aria-pressed={speaker === "B"} onClick={() => setSpeaker("B")}>{c.nameB}</button>
            </div>
          </div>
        )}
        <div className="row">
          <textarea id="say" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Your message"
            placeholder={joint ? `${name(speaker)}, type here…` : "Type what's on your mind…"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="primary" type="submit" disabled={busy}>Send</button>
        </div>
        <span className="small muted">Enter to send · Shift+Enter for a new line · Saved automatically</span>
      </form>
    </>
  );
}

function Wrap({ token, data, session, setSession, onDone }) {
  const c = data.case, me = data.role, them = other(me);
  const name = (r) => (r === "A" ? c.nameA : c.nameB);
  const joint = session.kind === "joint";
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState("");
  const [ask, setAsk] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    api("/api/wrap", { t: token, kind: session.kind, sessionId: session.id, messages: session.messages })
      .then((d) => { setSummary(d.summary); setAsk(joint ? d.homework : d.ask); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [token, session, joint]);

  async function save() {
    if (!summary.trim()) return;
    setSaving(true); setErr(null);
    try {
      if (joint) { await api("/api/joint", { t: token, sessionId: session.id, summary, homework: ask }); onDone(); }
      else { await api("/api/share", { t: token, sessionId: session.id, summary, ask }); setSession((s) => ({ ...s, phase: "sent" })); }
    } catch (x) { setErr(x.message); setSaving(false); }
  }

  if (loading) return <section className="panel"><h2>Wren is writing up the session…</h2><p className="muted">This takes a few seconds.</p></section>;
  return (
    <section className="panel">
      <span className="label">{joint ? "Joint session summary" : `Your note to ${name(them)}`}</span>
      <h2>{joint ? "Here's what Wren took from today" : `Review before ${name(them)} sees anything`}</h2>
      <p className="muted small">{joint ? "Edit together if anything feels off. This is saved for both of you." : "Wren drafted this from your session. Change anything you like. Your full conversation is never shared."}</p>
      {failed && <div className="notice">Wren couldn&apos;t draft this automatically. Write it in your own words below.</div>}
      <label className="field">{joint ? "Summary" : "What I want you to know"}<textarea id="w-summary" rows={7} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
      <label className="field">{joint ? "Practice before next time" : "What I'm asking of you (optional)"}<textarea id="w-ask" rows={3} value={ask} onChange={(e) => setAsk(e.target.value)} /></label>
      <div className="row">
        <button className="primary" disabled={saving || !summary.trim()} onClick={save}>{joint ? "Save summary" : `Share with ${name(them)} and pass the turn`}</button>
        {!joint && <button onClick={onDone}>Keep private for now</button>}
        <button className="ghost" onClick={() => setSession((s) => ({ ...s, phase: "chat" }))}>Back to the conversation</button>
      </div>
      {err && <div className="notice">{err}</div>}
    </section>
  );
}

function Sent({ data, onDone }) {
  const c = data.case, me = data.role, them = other(me);
  const name = (r) => (r === "A" ? c.nameA : c.nameB);
  const [label, setLabel] = useState(null);
  const origin = typeof location !== "undefined" ? location.origin : "";
  const link = data.invite ? `${origin}/#t=${data.invite}` : origin;
  const to = me === "A" ? c.emailB || "" : "";
  const subject = `${name(me)} finished a counseling session`;
  const body = `Hi ${name(them)},\n\nI just finished a session with Wren and shared a note for you. When you have some quiet time, open ${data.invite ? "this link" : "your private link"}, read it, and take your turn${data.invite ? `:\n\n${link}` : "."}\n\n${name(me)}`;
  return (
    <section className="panel">
      <span className="label">Shared</span>
      <h2>It&apos;s {name(them)}&apos;s turn now</h2>
      <p className="muted">Your note is in your shared space. Let {name(them)} know it&apos;s waiting. Copy this message into an email or text:</p>
      <div className="copybox">{(to ? `To: ${to}\n` : "") + `Subject: ${subject}\n\n${body}`}</div>
      <div className="row">
        <button className="primary" onClick={() => copyText(`Subject: ${subject}\n\n${body}`, setLabel)}>{label || "Copy message"}</button>
        <a className="btn" href={`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Open in my email app</a>
        <button className="ghost" onClick={onDone}>Back to our space</button>
      </div>
      <p className="small muted">In the full version, the site would send this email for you.</p>
    </section>
  );
}
