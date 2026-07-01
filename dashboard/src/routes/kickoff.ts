/**
 * Route: /admin/kickoff/<slug>  (admin only)
 *
 * A guided kickoff-meeting worksheet. The admin opens it on their laptop
 * during the call, reads each prompt aloud, and types the customer's answers
 * into the note boxes. Every field auto-saves to kickoff_notes. Reusable for
 * any client; pre-filled per client where we already have a diagnostic.
 *
 * The captured answers are the raw material for the ongoing keyword + cohort
 * configuration (how their buyers search, who their competitors are, etc.).
 */
import type { Env, User } from "../types";
import { layout, html, esc } from "../render";

type Section = { key: string; title: string; help: string };

// The kickoff PRESENTS what we determine (the queries, who AI names, the punch
// list) and only ASKS for the business context that helps us PRIORITIZE and
// INTERPRET. It never asks the customer to supply the research we produce, and
// it never invites out-of-scope custom work.
const SECTIONS: Section[] = [
  {
    key: "findings",
    title: "What we already found — open by showing them this",
    help: "Present the diagnostic first. You are showing them what AI says about them today. This is the reason they are here, so lead with it. Do not ask them for it.",
  },
  {
    key: "priorities",
    title: "What matters most to their business",
    help: "We already map the questions their buyers ask AI. This is only about which of those matter most to THEM, and what a clear win looks like in three months. Which parts of the business do they most want to grow? Which customers or bookings are most valuable? It points a set we already measure at what they care about.",
  },
  {
    key: "competitive_frame",
    title: "Their competitive frame",
    help: "We measure who AI actually names, and you will show them. This is their view, for context: who they consider their real competitive set and who they most want to outrank. It frames how we report the cohort. Do not ask them who AI names; that is ours to show.",
  },
  {
    key: "owned",
    title: "Who can act on the punch list",
    help: "We hand a prioritized punch list and their side executes it, so the fixes have to be things they can actually change. What we need: who controls the website, and whether it is even theirs to change (a locked corporate or brand template takes some fixes off the table, and we steer to what they can control instead). The booking and lead path we detect from the scan; we only confirm it so the reservation-schema fix points at the right place.",
  },
  {
    key: "scope",
    title: "Set the scope so nothing drifts",
    help: "Reinforce what they get and what they do not. Every month: the measurement plus a prioritized punch list. We do not make the changes or take on custom work; their team or agency executes. If they ask for something outside that, note it here and hold the line.",
  },
  {
    key: "logistics",
    title: "Who gets access",
    help: "Every name you add gets their own login: the cockpit, Atlas, and the monthly readout by email. Real access, not a forward. Who should be on the account (Joy and Heather to start)? Cadence is monthly and the format is fixed, so there is nothing to configure here beyond the people.",
  },
];

// Per-client pre-fills so you walk in armed. Every other slug starts blank.
const PREFILL: Record<string, Record<string, string>> = {
  "prince-waikiki": {
    findings:
      'Named in only 7 of 20 checks. 0 of 4 on "best hotel in Waikiki." 0 of 5 in Claude\'s model layer.\n' +
      'Most closable win: "upscale, not beachfront, great dining" — your own differentiator, missed by 3 of 4 tools.\n' +
      "Agent-readiness 0/F: no ReserveAction, the booking schema hotels need.",
    owned:
      "Who controls princewaikiki.com and can make site changes: ?\nIs it theirs to change, or a brand/corporate template: ?\nBooking path (we detect it from the scan, just confirm): ?",
    logistics:
      "Readout recipients: Joy Tomita Anderson (janderson@princewaikiki.com), Heather Labra (Director of Marketing)\nCadence: monthly\nTrial: 3 months, then month to month",
  },
};

async function loadAnswers(env: Env, slug: string): Promise<Record<string, string>> {
  const row = await env.DB.prepare(
    "SELECT answers_json FROM kickoff_notes WHERE client_slug = ?"
  ).bind(slug).first<{ answers_json: string }>();
  if (row && row.answers_json) {
    try { return (JSON.parse(row.answers_json) as Record<string, string>) || {}; } catch { return {}; }
  }
  return {};
}

export async function handleKickoff(request: Request, env: Env, user: User, slug: string): Promise<Response> {
  if (!user || user.role !== "admin") return html(layout("Forbidden", "<p>Admins only.</p>", user), 403);

  const cust = await env.DB.prepare(
    "SELECT name FROM customers WHERE client_slug = ?"
  ).bind(slug).first<{ name: string }>();
  const name = cust?.name || slug;

  const saved = await loadAnswers(env, slug);
  const pre = PREFILL[slug] || {};

  const shareToken = await ensureShareToken(env, slug);
  const shareUrl = new URL(request.url).origin + "/kickoff-intake/" + shareToken;
  const custRow = await env.DB.prepare(
    "SELECT customer_json FROM kickoff_notes WHERE client_slug = ?"
  ).bind(slug).first<{ customer_json: string | null }>();
  let custAns: Record<string, string> = {};
  if (custRow && custRow.customer_json) { try { custAns = JSON.parse(custRow.customer_json); } catch { custAns = {}; } }
  const hasCust = CUSTOMER_SECTIONS.some((s) => (custAns[s.key] || "").trim());
  const custPreHtml = hasCust
    ? `<div class="kx-cust"><div class="kx-cust-label">Their pre-read</div>${CUSTOMER_SECTIONS.filter((s) => (custAns[s.key] || "").trim()).map((s) => `<div class="kx-cust-row"><b>${esc(s.title)}</b><span>${esc(custAns[s.key])}</span></div>`).join("")}</div>`
    : "";

  const sectionsHtml = SECTIONS.map((s, i) => {
    const val = saved[s.key] !== undefined ? saved[s.key] : (pre[s.key] || "");
    return `
    <section class="kx-sec">
      <div class="kx-n">${i + 1}</div>
      <div class="kx-body">
        <h2>${esc(s.title)}</h2>
        <p class="kx-help">${esc(s.help)}</p>
        <textarea data-key="${esc(s.key)}" rows="5" placeholder="Type their answer...">${esc(val)}</textarea>
      </div>
    </section>`;
  }).join("");

  const body = `
  <style>
    .kx-wrap{max-width:820px;margin:0 auto;padding:8px 4px 80px}
    .kx-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid #211e18;padding-bottom:14px;margin-bottom:8px;flex-wrap:wrap}
    .kx-top h1{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:24px;margin:0}
    .kx-top .cat{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-top:2px}
    .kx-save{font-family:var(--mono);font-size:11px;color:var(--dim)}
    .kx-lead{color:var(--soft);font-size:14px;line-height:1.6;margin:14px 2px 20px}
    .kx-sec{display:flex;gap:16px;padding:22px 0;border-bottom:1px solid #211e18}
    .kx-n{font-family:var(--mono);font-size:12px;color:var(--gold);flex:none;width:22px;text-align:right;padding-top:4px}
    .kx-body{flex:1;min-width:0}
    .kx-body h2{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:18px;margin:0 0 6px}
    .kx-help{color:var(--dim);font-size:13px;line-height:1.6;margin:0 0 12px}
    .kx-body textarea{width:100%;box-sizing:border-box;background:#0b0b0c;border:1px solid #2a2a2e;border-radius:6px;color:var(--text);font-family:var(--mono);font-size:13px;line-height:1.6;padding:11px 13px;resize:vertical}
    .kx-body textarea:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(212,197,150,.1)}
    .kx-print{font-family:var(--mono);font-size:11px;color:var(--gold);text-decoration:none;border:1px solid var(--gold-dim,#4a3d18);border-radius:4px;padding:6px 12px;letter-spacing:.06em;text-transform:uppercase}
    .kx-share{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 2px 22px;padding:12px 14px;border:1px solid #211e18;border-radius:8px;background:#111114}
    .kx-share-label{font-family:var(--mono);font-size:11px;color:var(--dim);white-space:nowrap}
    .kx-share-row{display:flex;gap:8px;flex:1;min-width:220px}
    .kx-share-row input{flex:1;min-width:0;background:#0b0b0c;border:1px solid #2a2a2e;border-radius:5px;color:var(--soft);font-family:var(--mono);font-size:11px;padding:7px 10px}
    .kx-share-row button{background:var(--gold);color:#1a1500;border:none;border-radius:5px;font-family:var(--mono);font-size:11px;padding:0 14px;cursor:pointer}
    .kx-cust{margin:0 2px 24px;padding:14px 16px;border:1px solid rgba(212,197,150,.25);border-radius:8px;background:rgba(212,197,150,.04)}
    .kx-cust-label{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:10px}
    .kx-cust-row{margin-bottom:10px;font-size:13px;color:var(--soft);line-height:1.55}
    .kx-cust-row b{display:block;color:var(--text);font-weight:400;font-family:var(--mono);font-size:11px;margin-bottom:2px}
    .kx-cust-row span{white-space:pre-wrap}
    @media print{ .kx-help{color:#444} .kx-body textarea{border-color:#ccc;color:#000;background:#fff} .kx-print,.kx-save,.kx-share{display:none} }
  </style>
  <div class="kx-wrap">
    <div class="kx-top">
      <div><h1>Kickoff &mdash; ${esc(name)}</h1><div class="cat">Guided intake</div></div>
      <div style="display:flex;gap:14px;align-items:center">
        <span class="kx-save" id="kx-status">Auto-saves as you type</span>
        <a href="#" class="kx-print" onclick="window.print();return false">Print</a>
      </div>
    </div>
    <p class="kx-lead">Read each prompt aloud and type their answer in the box below it. Everything auto-saves. When you are done, these answers feed the keyword and cohort setup.</p>
    <div class="kx-share">
      <span class="kx-share-label">Pre-read link (optional, send before the call)</span>
      <span class="kx-share-row"><input id="kx-share-url" readonly value="${esc(shareUrl)}"><button type="button" id="kx-copy">Copy</button></span>
    </div>
    ${custPreHtml}
    ${sectionsHtml}
  </div>
  <script>
    (function(){
      var status = document.getElementById('kx-status');
      var boxes = Array.prototype.slice.call(document.querySelectorAll('textarea[data-key]'));
      var t = null;
      function collect(){ var o = {}; boxes.forEach(function(b){ o[b.getAttribute('data-key')] = b.value; }); return o; }
      function save(){
        status.textContent = 'Saving...';
        fetch(location.pathname, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(collect()) })
          .then(function(r){
            if (r.ok){ status.textContent = 'Saved ' + new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); }
            else { status.textContent = 'Save failed, retrying'; setTimeout(save, 3000); }
          })
          .catch(function(){ status.textContent = 'Offline, will retry'; setTimeout(save, 3000); });
      }
      boxes.forEach(function(b){
        b.addEventListener('input', function(){ clearTimeout(t); status.textContent = 'Editing...'; t = setTimeout(save, 900); });
        b.addEventListener('blur', function(){ clearTimeout(t); save(); });
      });
      var copyBtn = document.getElementById('kx-copy');
      if (copyBtn) copyBtn.addEventListener('click', function(){ var u = document.getElementById('kx-share-url'); u.select(); if (navigator.clipboard) navigator.clipboard.writeText(u.value); copyBtn.textContent = 'Copied'; setTimeout(function(){ copyBtn.textContent = 'Copy'; }, 1500); });
    })();
  </script>`;

  return html(layout("Kickoff — " + name, body, user), 200);
}

export async function handleKickoffSave(request: Request, env: Env, user: User, slug: string): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const answers: Record<string, string> = {};
  try {
    const posted = (await request.json()) as Record<string, unknown>;
    for (const s of SECTIONS) {
      const v = posted[s.key];
      if (typeof v === "string") answers[s.key] = v.slice(0, 8000);
    }
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO kickoff_notes (client_slug, answers_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(client_slug) DO UPDATE SET answers_json = excluded.answers_json, updated_at = excluded.updated_at`
  ).bind(slug, JSON.stringify(answers), now).run();
  return new Response(JSON.stringify({ ok: true, savedAt: now }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ── Shareable customer pre-read ────────────────────────────────────────────
// A token the customer opens (no login) to answer a few questions before the
// call. Customer-facing phrasing: it asks only what THEY can usefully answer
// (priorities, competitors, who executes, who gets access), never the research
// we produce, and never opens the door to custom work.
const CUSTOMER_SECTIONS: Section[] = [
  {
    key: "priorities",
    title: "What would make this worth it?",
    help: "What are you hoping to learn from how AI describes your business, and what would make this obviously worth it in a few months? Which parts of the business do you most want to grow?",
  },
  {
    key: "competitive_frame",
    title: "Who are your main competitors?",
    help: "The businesses you most want to win against when someone is deciding between you and them.",
  },
  {
    key: "owned",
    title: "Who can update your website?",
    help: "The person or partner on your side who can make changes to the site, so the fixes we hand over go to the right hands.",
  },
  {
    key: "logistics",
    title: "Who should get your monthly readout?",
    help: "Name and email for each person who should have access to the cockpit and the monthly readout.",
  },
];

async function ensureShareToken(env: Env, slug: string): Promise<string> {
  const row = await env.DB.prepare(
    "SELECT share_token FROM kickoff_notes WHERE client_slug = ?"
  ).bind(slug).first<{ share_token: string | null }>();
  if (row && row.share_token) return row.share_token;
  const token = crypto.randomUUID().replace(/-/g, "");
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO kickoff_notes (client_slug, answers_json, updated_at, share_token) VALUES (?, '{}', ?, ?)
     ON CONFLICT(client_slug) DO UPDATE SET share_token = COALESCE(kickoff_notes.share_token, excluded.share_token)`
  ).bind(slug, now, token).run();
  const check = await env.DB.prepare(
    "SELECT share_token FROM kickoff_notes WHERE client_slug = ?"
  ).bind(slug).first<{ share_token: string }>();
  return check!.share_token;
}

export async function handleKickoffIntake(request: Request, env: Env, token: string): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT client_slug, customer_json FROM kickoff_notes WHERE share_token = ?"
  ).bind(token).first<{ client_slug: string; customer_json: string | null }>();
  if (!row) return html(layout("Not found", "<div style='max-width:520px;margin:80px auto;text-align:center'><h1>This link is not valid.</h1></div>"), 404);

  if (request.method === "POST") {
    const answers: Record<string, string> = {};
    try {
      const posted = (await request.json()) as Record<string, unknown>;
      for (const s of CUSTOMER_SECTIONS) {
        const v = posted[s.key];
        if (typeof v === "string") answers[s.key] = v.slice(0, 8000);
      }
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    await env.DB.prepare(
      "UPDATE kickoff_notes SET customer_json = ?, updated_at = ? WHERE share_token = ?"
    ).bind(JSON.stringify(answers), new Date().toISOString(), token).run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const cust = await env.DB.prepare(
    "SELECT name FROM customers WHERE client_slug = ?"
  ).bind(row.client_slug).first<{ name: string }>();
  const name = cust?.name || "your business";
  let saved: Record<string, string> = {};
  if (row.customer_json) { try { saved = JSON.parse(row.customer_json); } catch { saved = {}; } }

  const secHtml = CUSTOMER_SECTIONS.map((s) => `
    <section class="kx-sec"><div class="kx-body">
      <h2>${esc(s.title)}</h2>
      <p class="kx-help">${esc(s.help)}</p>
      <textarea data-key="${esc(s.key)}" rows="4" placeholder="Type your answer...">${esc(saved[s.key] || "")}</textarea>
    </div></section>`).join("");

  const body = `
  <style>
    body{background:#0b0b0c}
    .kx-wrap{max-width:680px;margin:0 auto;padding:44px 22px 90px}
    .kx-head{font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 6px;color:#e8e8ea}
    .kx-eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#d4c596;margin-bottom:22px}
    .kx-lead{color:#b9b9bd;font-size:15px;line-height:1.65;margin:0 0 26px}
    .kx-sec{padding:20px 0;border-bottom:1px solid #211e18}
    .kx-body h2{font-family:Georgia,serif;font-weight:400;font-size:19px;margin:0 0 6px;color:#e8e8ea}
    .kx-help{color:#828289;font-size:13px;line-height:1.6;margin:0 0 12px}
    .kx-body textarea{width:100%;box-sizing:border-box;background:#111114;border:1px solid #2a2a2e;border-radius:6px;color:#e8e8ea;font-family:Georgia,serif;font-size:15px;line-height:1.6;padding:12px 14px;resize:vertical}
    .kx-body textarea:focus{outline:none;border-color:#d4c596;box-shadow:0 0 0 3px rgba(212,197,150,.1)}
    .kx-status{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#828289;margin-top:24px}
  </style>
  <div class="kx-wrap">
    <div class="kx-eyebrow">NeverRanked</div>
    <h1 class="kx-head">A few questions before we meet</h1>
    <p class="kx-lead">This helps us point the research at what matters to ${esc(name)}. It takes a couple of minutes, and your answers save as you type. There are no wrong answers, and you can leave any blank.</p>
    ${secHtml}
    <div class="kx-status" id="kx-status">Your answers save automatically</div>
  </div>
  <script>
    (function(){
      var status=document.getElementById('kx-status');
      var boxes=Array.prototype.slice.call(document.querySelectorAll('textarea[data-key]'));
      var t=null;
      function collect(){var o={};boxes.forEach(function(b){o[b.getAttribute('data-key')]=b.value;});return o;}
      function save(){status.textContent='Saving...';fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(collect())}).then(function(r){status.textContent=r.ok?'Saved':'Save failed, retrying';if(!r.ok)setTimeout(save,3000);}).catch(function(){status.textContent='Offline, will retry';setTimeout(save,3000);});}
      boxes.forEach(function(b){b.addEventListener('input',function(){clearTimeout(t);status.textContent='Editing...';t=setTimeout(save,900);});b.addEventListener('blur',save);});
    })();
  </script>`;
  return html(layout("A few questions — " + name, body), 200);
}
