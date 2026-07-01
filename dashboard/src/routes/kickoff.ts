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

const SECTIONS: Section[] = [
  {
    key: "findings",
    title: "What we already found — open by showing them this",
    help: "Walk them through the diagnostic before you ask anything. It anchors the call in evidence, not opinion.",
  },
  {
    key: "search",
    title: "How their buyers actually search",
    help: "The core input. How would you describe what makes you distinctive? When someone asks an AI to find a business like yours, what would they type? Which customers matter most? Any phrases you know your buyers use?",
  },
  {
    key: "competitors",
    title: "Competitors",
    help: "Who are your direct competitors? Anyone you especially hate losing to? Anyone AI keeps naming that surprises you?",
  },
  {
    key: "owned",
    title: "What you control",
    help: "Confirm the website, booking or lead path, Google Business Profile, key listings. Who can make website changes (your implementer)? What systems should we know about (for the schema fixes)?",
  },
  {
    key: "goals",
    title: "Goals and what success looks like",
    help: "What makes this a clear win in three months? Which queries matter most? Any competitor position you specifically want to take?",
  },
  {
    key: "wants",
    title: "What you want specifically",
    help: "Anything you are hoping we surface or fix? Any must-haves or concerns? Capture their words verbatim.",
  },
  {
    key: "logistics",
    title: "Logistics and cadence",
    help: "Who gets the monthly readout? Preferred format and cadence? Who executes the punch list? Any dates or seasonality to plan around?",
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
      "Site: princewaikiki.com\nBooking engine: ?\nGoogle Business Profile: ?\nKey listings (TripAdvisor, Expedia, ...): ?\nWho can change the site: ?",
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
    @media print{ .kx-help{color:#444} .kx-body textarea{border-color:#ccc;color:#000;background:#fff} .kx-print,.kx-save{display:none} }
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
