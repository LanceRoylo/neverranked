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
 * Default GET renders the latest persisted deployment + controls in
 * the dashboard shell.
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";
import {
  buildFAQDeployment,
  deployFAQToSite,
  getLatestFAQDeployment,
} from "../reddit-faq-deployment";

function fmtAgo(unix: number): string {
  const secs = Math.floor(Date.now() / 1000) - unix;
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export async function handleRedditFaq(
  slug: string,
  user: User,
  env: Env,
  request: Request,
): Promise<Response> {
  if (user.role !== "admin" && user.client_slug !== slug) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
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
      : latest.status === "no_faq_passed"
        ? `<span style="color:var(--red);font-weight:600">No FAQs passed quality checks</span> · last attempt ${fmtAgo(latest.generated_at)}`
        : `<span style="color:var(--gold);font-weight:600">Draft</span> · built ${fmtAgo(latest.generated_at)} · auto-deploy pending`
    : "";

  const faqsHtml = latest
    ? latest.faqs
        .map(
          (f) => `<div style="padding:14px 0;border-bottom:1px solid var(--line)">
            <div style="font-weight:600;color:var(--text);margin-bottom:6px">${esc(f.question)}</div>
            <div style="color:var(--text-mute);margin-bottom:6px;line-height:1.55">${esc(f.answer)}</div>
            <div style="color:var(--text-faint);font-size:11px;font-family:var(--mono)">From ${f.evidence.cluster_size} Reddit ${f.evidence.cluster_size === 1 ? "thread" : "threads"} — ${f.evidence.top_sources.map((s) => `r/${esc(s.subreddit)}`).join(", ")}</div>
          </div>`,
        )
        .join("")
    : "";

  const scriptTag = latest
    ? `<script type="application/ld+json">\n${latest.schema_json_ld}\n<\/script>`
    : "";

  const cardStyle = "margin-bottom:18px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px";
  const labelStyle = "font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:0.15em;color:var(--gold);margin-bottom:10px";
  // No button styles — primary actions (build, deploy) are automatic.

  const body = `
    <div style="margin-bottom:24px">
      <h1>Reddit FAQ deployment <em>${esc(businessContext.name)}</em></h1>
      <p style="color:var(--text-mute);margin-top:8px;max-width:760px;line-height:1.6">
        We pull the questions being asked on Reddit threads AI engines cite for your tracked queries, generate voice-matched answers from your business profile, and deploy a FAQPage schema on your own domain. Same engines, same citation behavior, you own the source.
      </p>
    </div>

    ${!ctxReady
      ? `<div style="${cardStyle};border-color:var(--red)">
           <strong style="color:var(--red)">Business description not set.</strong>
           <p style="color:var(--text-mute);margin-top:8px">Set <code>business_description</code> in <code>injection_configs</code> for <code>${esc(slug)}</code> before building. The model uses it to write voice-matched answers.</p>
         </div>`
      : !latest
        ? `<div style="${cardStyle}">
             <div style="${labelStyle}">Business context</div>
             <div style="color:var(--text)"><strong>${esc(businessContext.name)}</strong>${businessContext.url ? ` <span style="color:var(--text-faint)">· ${esc(businessContext.url)}</span>` : ""}</div>
             <div style="color:var(--text-mute);margin-top:6px;font-size:13px;line-height:1.5">${esc(businessContext.description).slice(0, 320)}${businessContext.description.length > 320 ? "..." : ""}</div>
           </div>
           <div style="${cardStyle}" id="auto-build-card">
             <div style="${labelStyle}">Building your FAQ deployment</div>
             <p style="color:var(--text-mute);margin:0 0 14px;line-height:1.55">Pulling the Reddit threads AI engines cited for your tracked queries in the last 90 days, clustering the questions, generating voice-matched answers. Usually 30 to 60 seconds. This page refreshes automatically when the build is ready.</p>
             <div style="display:flex;align-items:center;gap:10px">
               <div style="width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--gold);border-radius:50%;animation:rfq-spin 1s linear infinite"></div>
               <span style="color:var(--text-faint);font-size:12px" id="status">Working...</span>
             </div>
             <style>@keyframes rfq-spin { to { transform: rotate(360deg); } }</style>
           </div>`
        : latest.status === "no_faq_passed"
        ? `<div style="${cardStyle}">
             <div style="font-size:13px;margin-bottom:14px">${stateLabel}</div>
             <p style="color:var(--text-mute);line-height:1.6;margin:0 0 14px">The build ran across ${latest.source_thread_count} cited Reddit thread${latest.source_thread_count === 1 ? "" : "s"}, but every generated answer was filtered out by our quality grader (either off-topic for the business or made claims not supported by the business description).</p>
             <p style="color:var(--text-mute);line-height:1.6;margin:0">Most often this means the business description in <code>injection_configs</code> needs more specificity. Add more detail about services, audience, and what makes the business distinctive, and the next build will have more to work with. The system rebuilds weekly on Mondays.</p>
           </div>`
        : `<div style="${cardStyle}">
             <div style="font-size:13px;margin-bottom:14px">${stateLabel}</div>
             <div style="color:var(--text-faint);font-size:12px;font-family:var(--mono)">${latest.faq_count} FAQs · drawn from ${latest.source_thread_count} cited Reddit thread${latest.source_thread_count === 1 ? "" : "s"} · ${latest.schema_size_bytes} bytes</div>
           </div>
           <div style="${cardStyle}">
             <div style="${labelStyle}">Generated FAQs</div>
             ${faqsHtml}
           </div>
           <div style="${cardStyle}">
             <div style="${labelStyle}">Deployable JSON-LD</div>
             <p style="color:var(--text-mute);font-size:12px;margin:0 0 12px">${latest.status === "deployed"
               ? `Live now via the NeverRanked snippet on ${businessContext.url ? esc(businessContext.url) : "your domain"}. Updates within the configured cache TTL.`
               : `Build complete. Auto-deploy did not complete on this attempt — the page will pick up the deployed status once the snippet refreshes, or the Monday cron will redeploy.`}</p>
             <pre style="background:#1a1814;color:#f5f1e6;padding:16px;border-radius:4px;overflow-x:auto;font-size:12px;line-height:1.5;font-family:var(--mono);white-space:pre-wrap;word-break:break-word">${esc(scriptTag)}</pre>
           </div>`}

    <script>
      // Auto-fire the build when no deployment exists yet. The page
      // renders the build card on first visit, kicks off the work,
      // then reloads to the deployed view when done.
      const statusEl = document.getElementById('status');
      const autoCard = document.getElementById('auto-build-card');

      async function runBuild() {
        const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
        try {
          setStatus('Pulling Reddit threads, calling Claude, grading output...');
          const r = await fetch('?action=build');
          const d = await r.json();
          if (d.error) {
            if (autoCard) {
              autoCard.innerHTML = '<div style="color:var(--red);font-weight:600;margin-bottom:8px">Build failed</div><div style="color:var(--text-mute);font-size:13px">' + (d.error.replace(/</g,'&lt;')) + '</div>';
            }
            return;
          }
          window.location.reload();
        } catch (e) {
          if (autoCard) {
            autoCard.innerHTML = '<div style="color:var(--red);font-weight:600;margin-bottom:8px">Build failed</div><div style="color:var(--text-mute);font-size:13px">' + String(e).replace(/</g,'&lt;') + '</div>';
          }
        }
      }

      if (autoCard) runBuild();
    </script>
  `;

  return html(layout(`Reddit FAQ — ${businessContext.name}`, body, user, slug));
}
