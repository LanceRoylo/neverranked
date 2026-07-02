/**
 * Atlas Chat — /c/<slug>/atlas
 *
 * The data-interpretation layer of the customer dashboard. Answers a
 * paying customer's questions about their own AI-citation measurement.
 * Refuses prescriptive questions (which live in the monthly memo).
 *
 * Two routes:
 *   GET  /c/<slug>/atlas          — render the live chat surface
 *   POST /c/<slug>/atlas/message  — accept a message, return Atlas's reply
 *
 * The full behavioral contract is in lib/atlas-system-prompt.ts (and the
 * design doc at repo root /atlas-system-prompt.md). This file is the
 * orchestration: auth, context load, LLM call, grader, flag-it, persist.
 *
 * Auth mirrors customer-view.ts: getUser + slug ownership check. Admins
 * can view any slug; customers only their own.
 */

import type { Env } from "../types";
import { getUser } from "../auth";
import { redirect, esc } from "../render";
import { buildAtlasContext, packContextForPrompt } from "../lib/atlas-context";
import { askAtlas, type AtlasTurn } from "../lib/atlas-llm";
import { gradeAtlasResponse, buildRedraftNote } from "../lib/atlas-grader";
import { createAlert } from "../admin-alerts";
import { sendViaResend, logEmailDelivery } from "../email";

const LANCE_EMAIL = "Lance@hi.neverranked.com";
const HISTORY_TURNS = 20; // last N messages loaded into context
const FLAG_CONFIRM = "Flagged. Lance typically responds within 24 hours.";

// ── Auth ─────────────────────────────────────────────────────────────

function userCanView(user: { role?: string; client_slug?: string }, slug: string): boolean {
  if (user.role === "admin") return true;
  if (user.client_slug === slug) return true;
  return false;
}

// ── Flag-it detection ────────────────────────────────────────────────

// Matches a customer's intent to escalate the prior question to Lance.
// Deliberately narrow: must be a short, flag-intent message, not any
// message that happens to contain "flag".
const FLAG_RE = /^\s*(?:yes,?\s*)?(?:please\s*)?(?:flag (?:it|this|that)|send (?:it )?to lance|escalate (?:it|this)|ask lance)\b/i;

function isFlagIt(message: string): boolean {
  return FLAG_RE.test(message.trim());
}

// ── Persistence ──────────────────────────────────────────────────────

async function loadHistory(env: Env, slug: string): Promise<AtlasTurn[]> {
  const rows = await env.DB.prepare(
    `SELECT role, content FROM atlas_messages
      WHERE client_slug = ? AND role IN ('user','assistant')
      ORDER BY id DESC LIMIT ?`
  )
    .bind(slug, HISTORY_TURNS)
    .all<{ role: "user" | "assistant"; content: string }>();
  return rows.results.reverse();
}

async function saveMessage(
  env: Env,
  slug: string,
  role: "user" | "assistant",
  content: string,
  opts: {
    graderVerdict?: string | null;
    graderReason?: string | null;
    flaggedAt?: number | null;
    modelUsage?: unknown;
  } = {}
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO atlas_messages
       (client_slug, role, content, grader_verdict, grader_reason, flagged_at, model_usage, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      slug,
      role,
      content,
      opts.graderVerdict ?? null,
      opts.graderReason ?? null,
      opts.flaggedAt ?? null,
      opts.modelUsage ? JSON.stringify(opts.modelUsage) : null,
      Math.floor(Date.now() / 1000)
    )
    .run();
}

// ── Flag-it handler ──────────────────────────────────────────────────

async function handleFlag(
  env: Env,
  slug: string,
  customerName: string,
  flagMessage: string
): Promise<void> {
  // The question being escalated is the most recent prior user turn;
  // Atlas's punt is the most recent assistant turn. Pull both for the
  // email so Lance has full context.
  const recent = await env.DB.prepare(
    `SELECT role, content FROM atlas_messages
      WHERE client_slug = ? AND role IN ('user','assistant')
      ORDER BY id DESC LIMIT 4`
  )
    .bind(slug)
    .all<{ role: string; content: string }>();
  const rows = recent.results;
  const priorUser = rows.find((r) => r.role === "user");
  const priorAssistant = rows.find((r) => r.role === "assistant");

  const now = Math.floor(Date.now() / 1000);

  // Persist the flag-it user turn with flagged_at set so the admin inbox
  // can find unresolved flags.
  await saveMessage(env, slug, "user", flagMessage, { flaggedAt: now });

  // Admin alert (surfaces in the admin inbox). Force-fresh (no dedup
  // window) so every flag lands.
  await createAlert(env, {
    clientSlug: slug,
    type: "atlas_flag",
    title: `${customerName} flagged an Atlas question for you`,
    detail: [
      `Question: ${priorUser?.content ?? "(not found)"}`,
      ``,
      `Atlas replied: ${priorAssistant?.content ?? "(not found)"}`,
      ``,
      `Dashboard: /c/${slug}/atlas`,
    ].join("\n"),
  });

  // Email Lance directly. Best-effort: a send failure must not break the
  // customer's flag confirmation (the admin alert already captured it).
  try {
    if (env.RESEND_API_KEY) {
      const resp = await sendViaResend(env, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "NeverRanked Atlas <scores@neverranked.com>",
          to: LANCE_EMAIL,
          reply_to: LANCE_EMAIL,
          subject: `Atlas flag from ${customerName}`,
          text: [
            `${customerName} flagged a question for you via Atlas.`,
            ``,
            `Their question:`,
            priorUser?.content ?? "(not found)",
            ``,
            `Atlas replied:`,
            priorAssistant?.content ?? "(not found)",
            ``,
            `Open their dashboard: https://app.neverranked.com/c/${slug}/atlas`,
          ].join("\n"),
        }),
        // Admin-only notification to the operator's own inbox. Allowed
        // through the global customer-email pause. See sendViaResend.
      }, { internal: true });
      await logEmailDelivery(env, {
        email: LANCE_EMAIL,
        type: "atlas_flag",
        status: resp.ok ? "queued" : "failed",
        statusCode: resp.status,
      });
    }
  } catch (e) {
    console.log(`[atlas] flag email failed: ${e}`);
  }

  // Persist the confirmation as Atlas's reply.
  await saveMessage(env, slug, "assistant", FLAG_CONFIRM, { graderVerdict: "flag-confirm" });
}

// ── Core ask handler (context + LLM + grader + retry) ────────────────

async function handleAsk(
  env: Env,
  slug: string,
  userMessage: string
): Promise<{ reply: string; verdict: string }> {
  const now = new Date();
  const [ctx, history] = await Promise.all([
    buildAtlasContext(env, slug),
    loadHistory(env, slug),
  ]);
  const packedContext = packContextForPrompt(ctx);

  // Persist the user turn first so it's in history for any follow-up.
  await saveMessage(env, slug, "user", userMessage);

  // First attempt.
  let result = await askAtlas(env, { packedContext, history, userMessage, now });
  let grade = gradeAtlasResponse(result.text);
  let verdict: string = grade.ok ? "pass" : "pass-redraft";

  // One grader-driven redraft if the first attempt fails.
  if (!grade.ok) {
    const note = buildRedraftNote(grade);
    result = await askAtlas(env, {
      packedContext,
      history,
      userMessage,
      now,
      extraSystemNote: note,
    });
    grade = gradeAtlasResponse(result.text);
    if (!grade.ok) {
      // Second failure: fall back to Punt 5 rather than ship bad output.
      verdict = "punt-fallback";
      const fallback =
        "I don't have a clean answer to that from the measurement data. " +
        "The data covers your locked question set, your registered cohort, and your 7-AI-tool history. " +
        "If you want Lance to look into it, reply 'flag it'.";
      await saveMessage(env, slug, "assistant", fallback, {
        graderVerdict: "punt-fallback",
        graderReason: grade.reason,
        modelUsage: result.usage,
      });
      return { reply: fallback, verdict };
    }
  }

  await saveMessage(env, slug, "assistant", result.text, {
    graderVerdict: verdict,
    graderReason: grade.ok ? null : grade.reason,
    modelUsage: result.usage,
  });
  return { reply: result.text, verdict };
}

// ── POST /c/<slug>/atlas/message ─────────────────────────────────────

export async function handleAtlasMessage(
  request: Request,
  env: Env,
  slug: string
): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  if (!userCanView(user as any, slug)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  let body: { message?: string };
  try {
    body = (await request.json()) as { message?: string };
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return new Response(JSON.stringify({ error: "empty" }), { status: 400 });
  if (message.length > 2000) {
    return new Response(JSON.stringify({ error: "too_long" }), { status: 400 });
  }

  // Confirm the customer exists (gives us their name and guards typos).
  const customer = await env.DB.prepare(
    `SELECT name, status FROM customers WHERE client_slug = ?`
  )
    .bind(slug)
    .first<{ name: string; status: string }>();
  if (!customer) {
    return new Response(JSON.stringify({ error: "no_customer" }), { status: 404 });
  }

  try {
    if (isFlagIt(message)) {
      await handleFlag(env, slug, customer.name, message);
      return new Response(JSON.stringify({ reply: FLAG_CONFIRM, flagged: true }), {
        headers: { "content-type": "application/json" },
      });
    }
    const { reply, verdict } = await handleAsk(env, slug, message);
    return new Response(JSON.stringify({ reply, verdict }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.log(`[atlas] message handler error for ${slug}: ${e}`);
    const reply =
      "Something went wrong on my end fetching your data. Try again in a moment. " +
      "If it keeps happening, reply 'flag it' and Lance will take a look.";
    // Persist the error reply so the question (saved before the model call) is
    // not left orphaned without an answer on the next page load.
    try { await saveMessage(env, slug, "assistant", reply, { graderVerdict: "error" }); } catch { /* best-effort */ }
    return new Response(
      JSON.stringify({ error: "internal", reply }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

// ── GET /c/<slug>/atlas ──────────────────────────────────────────────

export async function handleAtlasChat(
  request: Request,
  env: Env,
  slug: string
): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return redirect("/login?next=" + encodeURIComponent(`/c/${slug}/atlas`));
  if (!userCanView(user as any, slug)) {
    return new Response("Forbidden", { status: 403 });
  }

  const customer = await env.DB.prepare(
    `SELECT name, category_label FROM customers WHERE client_slug = ?`
  )
    .bind(slug)
    .first<{ name: string; category_label: string | null }>();
  if (!customer) return new Response("Not found", { status: 404 });

  const history = await loadHistory(env, slug);

  return new Response(renderAtlasChat(slug, customer.name, customer.category_label, history), {
    status: 200,
    headers: { "content-type": "text/html;charset=utf-8" },
  });
}

// ── HTML render ──────────────────────────────────────────────────────

export function renderAtlasChat(
  slug: string,
  customerName: string,
  categoryLabel: string | null,
  history: AtlasTurn[]
): string {
  // SECURITY: this JSON is embedded inside an inline <script> block below.
  // JSON.stringify does NOT escape "<", ">" or "&", so a stored message
  // containing "</script>" would close the tag and execute attacker HTML/JS
  // in the viewer's session (including an admin opening a customer's chat).
  // Escape script-breaking characters as unicode sequences, which are valid
  // JSON and inert in HTML. Applied to every JSON-in-script embed here.
  const jsonForScript = (v: unknown): string =>
    JSON.stringify(v)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");
  const historyJson = jsonForScript(
    history.map((t) => ({ role: t.role, content: t.content }))
  );
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Atlas &middot; ${esc(customerName)}</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0b0b0c;
    --panel: #131316;
    --panel-light: #1a1a1d;
    --gold: #d4c596;
    --gold-bright: #e8c767;
    --gold-dim: #4a3d18;
    --text: #e8e8ea;
    --soft: #b9b9bd;
    --dim: #828289;
    --hair: #5a5a60;
    --mono: ui-monospace, "SF Mono", Menlo, monospace;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); height: 100%; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    color: var(--text);
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
  }
  header {
    border-bottom: 1px solid #211e18;
    padding: 18px 24px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-shrink: 0;
  }
  header .brand { font-size: 18px; color: var(--gold); letter-spacing: 0.01em; }
  header .who { font-size: 13px; color: var(--dim); font-family: var(--mono); }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 28px 24px 12px;
  }
  .thread { max-width: 720px; margin: 0 auto; }
  .msg { margin-bottom: 22px; line-height: 1.6; font-size: 16px; }
  .msg .role {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 6px;
  }
  .msg.user .role { color: var(--soft); }
  .msg.atlas { padding-left: 16px; border-left: 1px solid var(--gold-dim); }
  .msg.atlas .role { color: var(--gold); }
  .msg .body { white-space: pre-wrap; color: var(--text); font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
  .msg.user .body { color: var(--soft); }
  .empty-hint {
    max-width: 720px; margin: 0 auto; color: var(--dim);
    font-size: 15px; line-height: 1.7;
  }
  .empty-hint code {
    font-family: var(--mono); font-size: 13px; color: var(--gold);
    background: var(--panel); padding: 2px 6px; border-radius: 4px;
  }
  .suggest {
    display: block; margin: 8px 0; width: 100%; text-align: left;
    border: 1px solid var(--gold-dim); background: var(--panel); color: var(--soft);
    font-family: var(--mono); font-size: 13px; padding: 10px 14px; border-radius: 8px;
    cursor: pointer; transition: border-color 140ms var(--ease-out), background 140ms var(--ease-out);
  }
  .suggest:hover, .suggest:focus-visible { border-color: var(--gold); background: var(--panel-light); outline: none; }
  .suggest:focus-visible { box-shadow: 0 0 0 3px rgba(212,197,150,0.12); }
  footer {
    border-top: 1px solid #211e18;
    padding: 16px 24px 22px;
    flex-shrink: 0;
  }
  .inputwrap { max-width: 720px; margin: 0 auto; display: flex; gap: 10px; }
  textarea {
    flex: 1;
    background: var(--panel);
    border: 1px solid #2a2a2e;
    border-radius: 8px;
    color: var(--text);
    font-family: Georgia, serif;
    font-size: 16px;
    padding: 12px 14px;
    resize: none;
    line-height: 1.5;
    max-height: 160px;
  }
  textarea:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(212,197,150,0.12); }
  button {
    background: var(--gold);
    color: #1a1500;
    border: none;
    border-radius: 8px;
    font-family: var(--mono);
    font-size: 13px;
    letter-spacing: 0.04em;
    padding: 0 20px;
    min-height: 44px;
    cursor: pointer;
    transition: background 160ms var(--ease-out), transform 160ms var(--ease-out), opacity 160ms var(--ease-out);
  }
  button:hover:not(:disabled) { background: var(--gold-bright); }
  button:active:not(:disabled) { transform: scale(0.97); }
  button:focus-visible { outline: 1px solid var(--gold-bright); outline-offset: 2px; }
  button:disabled { opacity: 0.4; cursor: default; }
  .thinking { color: var(--dim); font-family: var(--mono); font-size: 13px; animation: atlas-breathe 1.4s var(--ease-out) infinite; }
  @keyframes atlas-breathe { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    button { transition: none; } button:active { transform: none; }
    .thinking { animation: none; opacity: 0.7; }
  }
  .disclaimer {
    max-width: 720px; margin: 10px auto 0; color: var(--dim);
    font-size: 11px; font-family: var(--mono); text-align: center;
  }
</style>
</head>
<body>
  <header>
    <span class="brand">Atlas</span>
    <span class="who">${esc(customerName)}${categoryLabel ? " &middot; " + esc(categoryLabel) : ""}</span>
  </header>
  <div class="scroll" id="scroll">
    <div class="thread" id="thread" role="log" aria-live="polite" aria-atomic="false"></div>
    <div class="empty-hint" id="hint" style="display:none">
      <div style="margin-bottom:14px">Ask about your measurement data. For example:</div>
      <button class="suggest" data-q="How many mentions did I have last week?">How many mentions did I have last week?</button>
      <button class="suggest" data-q="Which AI tool cites me most?">Which AI tool cites me most?</button>
      <button class="suggest" data-q="Who are the top firms in my cohort?">Who are the top firms in my cohort?</button>
      <button class="suggest" data-q="Which questions do not mention me at all?">Which questions do not mention me at all?</button>
      <div style="margin-top:16px">Atlas answers what the data shows. It won&rsquo;t tell you what to do. Prioritization lives in your monthly memo.</div>
    </div>
  </div>
  <footer>
    <div class="inputwrap">
      <textarea id="input" rows="1" placeholder="Ask about your data..." aria-label="Ask Atlas about your measurement data" autofocus></textarea>
      <button id="send">Send</button>
    </div>
    <div class="disclaimer">Atlas reports your measurement data. It does not give recommendations.</div>
  </footer>
<script>
  const SLUG = ${jsonForScript(slug)};
  const thread = document.getElementById('thread');
  const hint = document.getElementById('hint');
  const scroll = document.getElementById('scroll');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  let history = ${historyJson};
  let busy = false;

  function msgEl(m) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (m.role === 'user' ? 'user' : 'atlas');
    const role = document.createElement('div');
    role.className = 'role';
    role.textContent = m.role === 'user' ? 'You' : 'Atlas';
    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = m.content;
    wrap.appendChild(role); wrap.appendChild(body);
    return wrap;
  }
  // First paint only: render the full server history. New turns are appended
  // one at a time so the live region announces only the new message, not the
  // whole thread, and prior messages are never torn down and rebuilt.
  function renderAll() {
    thread.innerHTML = '';
    hint.style.display = history.length === 0 ? 'block' : 'none';
    for (const m of history) thread.appendChild(msgEl(m));
  }
  function appendMsg(m) { hint.style.display = 'none'; thread.appendChild(msgEl(m)); }

  function scrollToEnd() { scroll.scrollTop = scroll.scrollHeight; }
  function setSendState() { send.disabled = busy || input.value.trim() === ''; }

  let slowTimer = null;
  function addThinking() {
    const wrap = document.createElement('div');
    wrap.className = 'msg atlas'; wrap.id = 'thinking';
    wrap.innerHTML = '<div class="role">Atlas</div><div class="thinking" role="status">reading your data...</div>';
    thread.appendChild(wrap); scrollToEnd();
    slowTimer = setTimeout(function () {
      const t = document.querySelector('#thinking .thinking');
      if (t) t.textContent = 'still reading...';
    }, 6000);
  }
  function removeThinking() {
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
    const t = document.getElementById('thinking'); if (t) t.remove();
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    input.value = ''; input.style.height = 'auto';
    const userTurn = { role: 'user', content: text };
    history.push(userTurn); appendMsg(userTurn);
    send.textContent = 'Sending'; setSendState();
    scrollToEnd(); addThinking(); scroll.setAttribute('aria-busy', 'true');
    const ctrl = new AbortController();
    const abortTimer = setTimeout(function () { ctrl.abort(); }, 45000);
    try {
      const resp = await fetch('/c/' + SLUG + '/atlas/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: ctrl.signal,
      });
      const data = await resp.json().catch(function () { return {}; });
      removeThinking();
      let reply = data.reply;
      if (!resp.ok && !reply) {
        reply = data.error === 'too_long'
          ? 'That question is longer than I can take in one message. Trim it and send again.'
          : "I could not reach your data just now. Try again in a moment, or reply 'flag it' and Lance will look.";
      }
      const atlasTurn = { role: 'assistant', content: reply || "I could not reach your data just now. Try again in a moment." };
      history.push(atlasTurn); appendMsg(atlasTurn); scrollToEnd();
    } catch (e) {
      removeThinking();
      const msg = (e && e.name === 'AbortError')
        ? "That took longer than expected. Try again, or reply 'flag it' and Lance will look."
        : "I could not reach your data just now. Try again in a moment, or reply 'flag it' and Lance will look.";
      const atlasTurn = { role: 'assistant', content: msg };
      history.push(atlasTurn); appendMsg(atlasTurn); scrollToEnd();
    } finally {
      clearTimeout(abortTimer);
      scroll.removeAttribute('aria-busy');
      busy = false; send.textContent = 'Send'; setSendState(); input.focus();
    }
  }

  send.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(160, input.scrollHeight) + 'px';
    setSendState();
  });
  document.querySelectorAll('.suggest').forEach(function (b) {
    b.addEventListener('click', function () { input.value = b.getAttribute('data-q'); setSendState(); submit(); });
  });

  renderAll(); setSendState(); scrollToEnd();
</script>
</body>
</html>`;
}
