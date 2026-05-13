/**
 * /reddit-faq/<slug> — Reddit-aware FAQ deployment surface.
 *
 * Replaces the per-thread reply-brief surface. Extracts the questions
 * being asked on Reddit threads AI engines are citing for the client's
 * tracked queries, generates voice-matched answers from the client's
 * business profile, and emits FAQPage schema deployable to the client's
 * own domain via the existing schema_injections pipeline.
 *
 * Actions (query string):
 *   ?action=build   — generate a new draft deployment (calls Claude)
 *   ?action=deploy  — promote the latest draft to live via schema_injections
 *                     (no Claude call, just a DB flip)
 *
 * Default GET renders the latest persisted deployment + controls.
 */

import type { Env } from "../types";
import {
  buildFAQDeployment,
  deployFAQToSite,
  getLatestFAQDeployment,
} from "../reddit-faq-deployment";

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function fmtAgo(unix: number): string {
  const secs = Math.floor(Date.now() / 1000) - unix;
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

interface AuthUser {
  email: string;
  client_slug: string | null;
  role: string;
}

export async function handleRedditFaq(
  slug: string,
  user: AuthUser,
  env: Env,
  request: Request,
): Promise<Response> {
  if (user.role !== "admin" && user.client_slug !== slug) {
    return new Response("Not authorized", { status: 403 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  const ctx = await env.DB.prepare(
    `SELECT business_name, business_url, business_description
       FROM injection_configs WHERE client_slug = ?`,
  )
    .bind(slug)
    .first<{ business_name: string | null; business_url: string | null; business_description: string | null }>();

  const businessContext = {
    name: ctx?.business_name || slug,
    description: ctx?.business_description || "",
    url: ctx?.business_url || undefined,
  };

  // --- action: build ----------------------------------------------------
  if (action === "build") {
    if (!businessContext.description) {
      return new Response(
        JSON.stringify({ error: "business_description not set in injection_configs for this client" }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    try {
      const deployment = await buildFAQDeployment(env, slug, businessContext, 90);
      return new Response(JSON.stringify(deployment, null, 2), {
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: String((e as Error).message || e) }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  }

  // --- action: deploy ---------------------------------------------------
  if (action === "deploy") {
    const idParam = url.searchParams.get("id");
    const id = idParam ? parseInt(idParam, 10) : 0;
    if (!id) {
      return new Response(JSON.stringify({ error: "missing id" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    try {
      const result = await deployFAQToSite(env, slug, id);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: String((e as Error).message || e) }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  }

  // --- default GET: render --------------------------------------------
  const ctxReady = Boolean(businessContext.description);
  const latest = ctxReady ? await getLatestFAQDeployment(env, slug) : null;

  const stateLabel = latest
    ? latest.status === "deployed"
      ? `<span style="color:#7fc99a;font-weight:600">Live on site</span> · deployed ${fmtAgo(latest.deployed_at || latest.generated_at)}`
      : `<span style="color:#c5a35a;font-weight:600">Draft</span> · built ${fmtAgo(latest.generated_at)} · not yet deployed`
    : "";

  const faqsHtml = latest
    ? latest.faqs
        .map(
          (f) => `<div class="faq-entry">
            <div class="faq-q">${esc(f.question)}</div>
            <div class="faq-a">${esc(f.answer)}</div>
            <div class="faq-meta">From ${f.evidence.cluster_size} Reddit ${f.evidence.cluster_size === 1 ? "thread" : "threads"} — ${f.evidence.top_sources.map((s) => `r/${esc(s.subreddit)}`).join(", ")}</div>
          </div>`,
        )
        .join("")
    : "";

  const scriptTag = latest
    ? `<script type="application/ld+json">\n${latest.schema_json_ld}\n<\/script>`
    : "";

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Reddit FAQ deployment — ${esc(businessContext.name)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 920px; margin: 40px auto; padding: 0 24px; color: #111; line-height: 1.55; background: #fbfaf6; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 24px; max-width: 720px; }
  .card { background: #fff; border: 1px solid #e7e3d8; padding: 18px 22px; border-radius: 4px; margin-bottom: 18px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #8a7a4a; margin-bottom: 8px; }
  pre { background: #1a1814; color: #f5f1e6; padding: 16px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
  button, .btn { background: #c5a35a; color: #1a1814; border: 0; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 3px; text-decoration: none; display: inline-block; }
  button.secondary { background: transparent; color: #6a5a2a; border: 1px solid #c5a35a; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .muted { color: #888; font-size: 12px; }
  .faq-q { font-weight: 600; margin-bottom: 6px; }
  .faq-a { color: #333; margin-bottom: 6px; }
  .faq-meta { color: #999; font-size: 11px; font-family: ui-monospace, monospace; }
  .faq-entry { padding: 14px 0; border-bottom: 1px solid #f0ecdf; }
  .faq-entry:last-child { border-bottom: 0; }
  .err { color: #a33; }
  .state { font-size: 13px; margin-bottom: 14px; }
  code { background: #f0ecdf; padding: 2px 6px; border-radius: 2px; font-size: 12px; }
</style>
</head><body>
<h1>Reddit FAQ deployment — ${esc(businessContext.name)}</h1>
<div class="sub">We pull the questions being asked on Reddit threads AI engines cite for your tracked queries, generate voice-matched answers from your business profile, and deploy a FAQPage schema on your own domain. Same engines, same citation behavior, you own the source.</div>

${!ctxReady
    ? `<div class="card err">
         <strong>Business description not set.</strong> Set <code>business_description</code> in <code>injection_configs</code> for <code>${esc(slug)}</code> before building. The model uses it to write voice-matched answers.
       </div>`
    : !latest
      ? `<div class="card">
           <div class="label">Business context</div>
           <div><strong>${esc(businessContext.name)}</strong>${businessContext.url ? ` · <span class="muted">${esc(businessContext.url)}</span>` : ""}</div>
           <div class="muted" style="margin-top:6px">${esc(businessContext.description).slice(0, 280)}${businessContext.description.length > 280 ? "..." : ""}</div>
         </div>
         <div class="card">
           <div class="label">No deployment yet</div>
           <p style="margin:0 0 12px">Pulls Reddit threads cited in the last 90 days, extracts questions, clusters via Haiku, generates answers via Sonnet, renders FAQPage JSON-LD. ~30-60s, ~$0.05-0.15 in Claude calls.</p>
           <button id="build-btn">Build first FAQ deployment</button>
           <span class="muted" id="status" style="margin-left:12px"></span>
         </div>`
      : `<div class="card">
           <div class="state">${stateLabel}</div>
           <div style="display:flex;gap:8px;flex-wrap:wrap">
             ${latest.status === "draft"
               ? `<button id="deploy-btn" data-id="${latest.id}">Deploy to site</button>`
               : `<span class="btn" style="background:#7fc99a;cursor:default">Deployed</span>`}
             <button class="secondary" id="rebuild-btn">Rebuild</button>
           </div>
           <div class="muted" style="margin-top:10px">${latest.faq_count} FAQs · drawn from ${latest.source_thread_count} cited Reddit thread${latest.source_thread_count === 1 ? "" : "s"} · ${latest.schema_size_bytes} bytes</div>
           <div class="muted" id="status" style="margin-top:6px"></div>
         </div>
         <div class="card"><div class="label">Generated FAQs</div>${faqsHtml}</div>
         <div class="card">
           <div class="label">Deployable JSON-LD</div>
           <p class="muted">${latest.status === "deployed"
             ? `This block is being served to ${businessContext.url ? esc(businessContext.url) : "your domain"} via the NeverRanked snippet. Updates within the configured cache TTL.`
             : `Click <strong>Deploy to site</strong> above to publish via your installed NeverRanked snippet, or paste this into the &lt;head&gt; of the target page manually.`}</p>
           <pre>${esc(scriptTag)}</pre>
         </div>`}

<script>
const statusEl = document.getElementById('status');
const buildBtn = document.getElementById('build-btn');
const rebuildBtn = document.getElementById('rebuild-btn');
const deployBtn = document.getElementById('deploy-btn');

async function build(btn) {
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = 'Building...';
  if (statusEl) statusEl.textContent = '~30-60s, calling Claude';
  try {
    const r = await fetch('?action=build');
    const d = await r.json();
    if (d.error) {
      if (statusEl) statusEl.textContent = '';
      alert(d.error);
      btn.disabled = false;
      btn.textContent = prev;
      return;
    }
    window.location.reload();
  } catch (e) {
    alert(String(e));
    btn.disabled = false;
    btn.textContent = prev;
  }
}

async function deploy(btn) {
  if (!confirm('Deploy this FAQ schema to your site? It will be served by the NeverRanked snippet on every page where the snippet runs.')) return;
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = 'Deploying...';
  try {
    const id = btn.dataset.id;
    const r = await fetch('?action=deploy&id=' + id);
    const d = await r.json();
    if (d.error) {
      alert(d.error);
      btn.disabled = false;
      btn.textContent = prev;
      return;
    }
    window.location.reload();
  } catch (e) {
    alert(String(e));
    btn.disabled = false;
    btn.textContent = prev;
  }
}

if (buildBtn) buildBtn.addEventListener('click', () => build(buildBtn));
if (rebuildBtn) rebuildBtn.addEventListener('click', () => build(rebuildBtn));
if (deployBtn) deployBtn.addEventListener('click', () => deploy(deployBtn));
</script>
</body></html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
