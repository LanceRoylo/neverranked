/**
 * /reddit-faq/<slug> — surfaces the FAQ deployment built from the
 * client's Reddit citation surface. Replaces the per-thread reply-brief
 * surface with a deployable FAQPage schema for the client's own domain.
 */

import type { Env } from "../types";
import { buildFAQDeployment } from "../reddit-faq-deployment";

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
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

  // Fetch business context from injection_configs
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

  // Default: render the build page (no automatic build — Claude calls cost money).
  const ctxReady = Boolean(businessContext.description);
  const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Reddit FAQ deployment — ${esc(businessContext.name)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 880px; margin: 40px auto; padding: 0 24px; color: #111; line-height: 1.55; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 28px; }
  .card { background: #f8f7f4; border: 1px solid #e7e3d8; padding: 18px 22px; border-radius: 4px; margin-bottom: 18px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #8a7a4a; margin-bottom: 8px; }
  pre { background: #1a1814; color: #f5f1e6; padding: 16px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
  button { background: #c5a35a; color: #1a1814; border: 0; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 3px; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .muted { color: #888; font-size: 12px; }
  .faq-q { font-weight: 600; margin-bottom: 6px; }
  .faq-a { color: #333; margin-bottom: 6px; }
  .faq-meta { color: #999; font-size: 11px; font-family: ui-monospace, monospace; }
  .faq-entry { padding: 12px 0; border-bottom: 1px solid #e7e3d8; }
  .err { color: #a33; }
</style>
</head><body>
<h1>Reddit FAQ deployment — ${esc(businessContext.name)}</h1>
<div class="sub">Extract the questions being asked on Reddit threads AI engines cite for your tracked queries, generate voice-matched answers, deploy as FAQPage schema on your own domain.</div>

${ctxReady
    ? `<div class="card">
         <div class="label">Business context</div>
         <div><strong>${esc(businessContext.name)}</strong>${businessContext.url ? ` · <span class="muted">${esc(businessContext.url)}</span>` : ""}</div>
         <div class="muted" style="margin-top:6px">${esc(businessContext.description).slice(0, 280)}${businessContext.description.length > 280 ? "..." : ""}</div>
       </div>
       <div class="card">
         <div class="label">Build</div>
         <p style="margin:0 0 12px">Pulls Reddit threads cited in the last 90 days, extracts questions, clusters via Haiku, generates answers via Sonnet, renders FAQPage JSON-LD. ~30-60s, ~$0.05-0.15 in Claude calls.</p>
         <button id="build-btn">Build FAQ deployment</button>
         <span class="muted" id="status" style="margin-left:12px"></span>
       </div>
       <div id="result"></div>`
    : `<div class="card err">
         <strong>Business description not set.</strong> Set <code>business_description</code> in <code>injection_configs</code> for <code>${esc(slug)}</code> before building. The model uses it to write voice-matched answers.
       </div>`}

<script>
const btn = document.getElementById('build-btn');
const statusEl = document.getElementById('status');
const result = document.getElementById('result');
if (btn) btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.textContent = 'Building... (30-60s)';
  try {
    const r = await fetch('?action=build');
    const d = await r.json();
    if (d.error) {
      statusEl.textContent = '';
      result.innerHTML = '<div class="card err">' + d.error + '</div>';
      btn.disabled = false;
      return;
    }
    statusEl.textContent = d.faq_count + ' FAQs generated · ' + d.schema_size_bytes + ' bytes';
    const faqHtml = d.faqs.map(f => '<div class="faq-entry"><div class="faq-q">' + escapeHtml(f.question) + '</div><div class="faq-a">' + escapeHtml(f.answer) + '</div><div class="faq-meta">' + f.evidence.cluster_size + ' Reddit ' + (f.evidence.cluster_size === 1 ? 'thread' : 'threads') + ' — ' + f.evidence.top_sources.map(s => 'r/' + escapeHtml(s.subreddit)).join(', ') + '</div></div>').join('');
    const tag = '<script type="application/ld+json">\\n' + d.schema_json_ld + '\\n<\\/script>';
    result.innerHTML = '<div class="card"><div class="label">Generated FAQs</div>' + faqHtml + '</div><div class="card"><div class="label">Deployable JSON-LD</div><p class="muted">Paste this into the &lt;head&gt; of the target page on ${esc(businessContext.url || "your domain")}.</p><pre>' + escapeHtml(tag) + '</pre></div>';
    btn.disabled = false;
  } catch (e) {
    statusEl.textContent = '';
    result.innerHTML = '<div class="card err">' + String(e) + '</div>';
    btn.disabled = false;
  }
});
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
</script>
</body></html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
