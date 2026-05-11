/**
 * NeverRanked Client Dashboard — Cloudflare Worker
 *
 * app.neverranked.com
 */

import type { Env } from "./types";
import { getUser } from "./auth";
import { scanDomain as scanDomainImported } from "./scanner";
import { redirect, html, layout, esc as escHtml } from "./render";
import { handleGetLogin, handlePostLogin, handleVerify, handleLogout } from "./routes/login";
import { handleHome } from "./routes/home";
import { handleDomainDetail, handleScanCompare, handleClientRescan } from "./routes/domain";
import { handleAdminHome, handleAddDomain, handleAddUser, handleManualScan, handleCronTestScan, handleEditSuggestion, handleRemoveSuggestion, handleReconcileAgency, handleAdminResendOnboarding, handleClientSettings, handleAdminTrialReset } from "./routes/admin";
import { handleCockpit, handleAutomationToggle, handleAutomationDigestToggle } from "./routes/cockpit";
import { handleEmailTestGet, handleEmailTestPost } from "./routes/admin-email-test";
import { handleAdminEmailLogGet } from "./routes/admin-email-log";
import { handleAdminFreeCheckStats } from "./routes/admin-free-check";
import { handleAdminNpsGet, handleAdminExitGet } from "./routes/admin-signals";
import { handleCancelFlowGet, handleCancelFlowPost } from "./routes/cancel-flow";
import { handleNpsPost, handleNpsDismiss } from "./routes/nps";
import { handleInstallIndex, handleInstallGuide } from "./routes/install-guides";
import { handleChangelog } from "./routes/changelog";
import { startRequestLog } from "./log";
import {
  handle2faSettingsGet,
  handle2faEnrollPost,
  handle2faVerifyPost,
  handle2faDisablePost,
  handle2faChallengeGet,
  handle2faChallengePost,
  handleAdminReset2fa,
} from "./routes/two-factor";
import { handleInbox, handleInboxAgencyAppAction, handleInboxSuggestionAction, handleInboxAlertDismiss } from "./routes/inbox";
import { handleCompetitors, handleAddCompetitorFromPage, handleRemoveCompetitorFromPage, handleReorderCompetitors } from "./routes/competitors";
import { handleTrust } from "./routes/trust";
import { handleReddit } from "./routes/reddit";
import { handleBriefGenerate, handleBriefView } from "./routes/reddit-briefs";
import { handleBenchmark } from "./routes/benchmark";
import { recomputeIndustryBenchmarks } from "./industry-benchmarks";
import { backfillRedditCitations, maybeAddRedditRoadmapItems } from "./reddit-citations";
import { handleRoadmap, handleAddRoadmapItem, handleUpdateRoadmapItem, handleAddPhase, handleRegenerateRoadmap, handleBulkStartItems, handleRefreshRoadmap } from "./routes/roadmap";
import { handleVoicePage, handleVoiceSampleCreate, handleVoiceSampleDelete, handleVoiceBuildProfile } from "./routes/voice";
import { handleDraftsList, handleDraftDetail, handleDraftCreate, handleDraftSave, handleDraftStatus, handleDraftDelete, handleDraftDownload, handleDraftGenerate, handleDraftCreateAndGenerate, handleDraftRevert, handleDraftPublish } from "./routes/drafts";
import { handlePublishingGet, handlePublishingSave, handlePublishingTest, handlePublishingDelete, handlePublishingRestrictions, handlePublishingUnpause } from "./routes/publishing";
import { handleCalendarGet, handleCalendarAdd, handleCalendarSkip } from "./routes/calendar";
import { handleContentReviewList, handleContentReviewClear } from "./routes/content-review";
import { handleOnboarding, handleOnboardingSubmit, handleOnboardingSkip } from "./routes/onboarding";
import { handlePublicReport, handleCreateShare } from "./routes/share";
import { handleSettings, handleUpdateEmailPrefs } from "./routes/settings";
import { handleLeads, handleLeadsJson } from "./routes/leads";
import { handleCheckout, handleCheckoutSuccess, handleStripeWebhook, handleBillingPortal, handlePulseWaitlist } from "./routes/checkout";
import { cleanupAuth } from "./auth";
import { runWeeklyScans, runDailyTasks } from "./cron";
import { runWeeklyBackup } from "./backup";
import { logEvent, hashIP } from "./analytics";
import { handleInjectScript, handleInjectJson } from "./routes/inject";
import { handleInjectAdmin, handleInjectConfig, handleInjectGenerate, handleInjectApprove, handleInjectPause, handleInjectEdit, handleInjectDelete, handleInjectPublish } from "./routes/inject-admin";
import { handleCitations, handleAdminCitations, handleAddKeyword, handleBulkAddKeywords, handleDeleteKeyword, handleGenerateKeywords, handleManualCitationRun, handleManualKeywordRun } from "./routes/citations";
import { handleGoogleCallback, handleAdminGsc, handleLinkProperty, handleUnlinkProperty, handleManualGscPull, handleSearchPerformance } from "./routes/gsc";
import { handleSummary } from "./routes/summary";
import { handleAlerts, handleMarkAlertRead, handleMarkAllAlertsRead, handleAlertClickThrough } from "./routes/alerts";
import { handleLearn, handleLearnArticle } from "./routes/learn";
import { handleReport, handleReportIndex, handleSendReport } from "./routes/report";
import { handleDemoRedirect, handleDemoDomain, handleDemoCitations, handleDemoRoadmap, handleDemoPost } from "./routes/demo";
import { handleSupport, handleSupportSubmit } from "./routes/support";
import { handleScanHealth } from "./routes/scan-health";
import { handleBotAnalytics } from "./routes/bot-analytics";
import { handleEngagement } from "./routes/engagement";
import { handleAgencyDashboard, handleAgencyClientsCsv, handleAgencyClientsJson } from "./routes/agency";
import { handleAgencySettingsGet, handleAgencySettingsPost, handleAgencyAsset } from "./routes/agency-settings";
import { handleAgencyBillingGet, handleAgencyBillingActivate, handleAgencyBillingSuccess } from "./routes/agency-billing";
import {
  handleAgencyInvitesGet,
  handleInviteTeammate,
  handleInviteClient,
  handleInviteResend,
  handleInviteRevoke,
  handleInviteAccept,
} from "./routes/agency-invites";
import { handleAgencyPauseClient, handleAgencyResumeClient, handleAgencyResendSnippet } from "./routes/agency-clients";
import { handleAgencyAddClientGet, handleAgencyAddClientPost } from "./routes/agency-add-client";
import { getBrandingContext, getAgency } from "./agency";

// Cloudflare Workflows requires the class to be a named export of the
// Worker entrypoint module so the runtime can instantiate it.
export { ScanDomainWorkflow } from "./workflows/scan-domain";
export { WeeklyExtrasWorkflow } from "./workflows/weekly-extras";
export { SendDigestWorkflow } from "./workflows/send-digest";
export { CitationKeywordWorkflow } from "./workflows/citation-keyword";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Per-request structured access log: one JSON line at the end with
    // method, path, status, duration_ms, country, truncated UA, IP
    // prefix, and (when known) the authenticated user_id. Pipe wrangler
    // tail through jq to filter by any field.
    const reqLog = startRequestLog(request);
    let _user_id_for_log: number | undefined;

    // Wrap routing in an IIFE so every existing `return X` becomes
    // "return X from the IIFE", which we then log + decorate before
    // returning to Cloudflare. No invasive change to the routing body.
    let response: Response;
    try {
    response = await (async (): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // --- Public routes (no auth required) ---

    // Cold-email open tracking pixel. Replaces the previous local
    // ngrok-fronted endpoint that broke when ngrok killed free static
    // subdomains. Verifies the HMAC token (so this can't be spammed by
    // anyone fabricating a URL), writes one row to email_opens, and
    // returns the standard 1x1 GIF. Always returns the GIF -- even on
    // verification failure -- so an attacker can't probe valid IDs by
    // observing different responses. Cache headers prevent any client
    // from caching the pixel and missing repeat opens.
    {
      const trackMatch = path.match(/^\/track\/open\/(\d+)\/([a-f0-9]{8,32})$/);
      if (trackMatch && method === "GET") {
        const prospectId = parseInt(trackMatch[1], 10);
        const token = trackMatch[2];
        const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

        const verify = async (): Promise<boolean> => {
          const secret = (env as any).OUTREACH_UNSUBSCRIBE_SECRET || "";
          if (!secret) return false;
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw",
            enc.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
          );
          const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(prospectId)));
          const hex = Array.from(new Uint8Array(sig))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
            .slice(0, 16);
          // Constant-time comparison so a malicious sender can't byte-walk
          // their way to a valid token.
          if (hex.length !== token.length) return false;
          let diff = 0;
          for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ token.charCodeAt(i);
          return diff === 0;
        };

        ctx.waitUntil((async () => {
          try {
            const ok = await verify();
            if (!ok) return;
            const ua = request.headers.get("User-Agent") || "";
            const rawIp = request.headers.get("CF-Connecting-IP") || "";
            let ipHash = "";
            if (rawIp) {
              const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawIp));
              ipHash = Array.from(new Uint8Array(buf))
                .slice(0, 6)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            }
            await env.DB.prepare(
              `INSERT INTO email_opens (prospect_id, token, opened_at, ip_hash, ua, vertical)
               VALUES (?, ?, ?, ?, ?, NULL)`,
            ).bind(prospectId, token, Math.floor(Date.now() / 1000), ipHash || null, ua.slice(0, 200) || null).run();
          } catch (e) {
            console.log(`[track/open] failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        })());

        return new Response(PIXEL, {
          headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
          },
        });
      }
    }

    // Manual audit-delivery trigger. ADMIN_SECRET-gated. Mirrors the
    // automatic flow that fires on Stripe checkout completion, but
    // callable on demand -- useful for testing the full pipeline
    // without a real checkout, and for re-firing delivery if something
    // failed mid-pipeline. Generates synchronously (waits ~60s) so the
    // caller knows when the audit is delivered. Returns the audit URL.
    if (path === "/admin/deliver-audit" && method === "POST") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { "content-type": "application/json" },
        });
      }
      let body: { email?: string; brand?: string; domain?: string; client_slug?: string; customer_name?: string };
      try { body = await request.json() as typeof body; } catch {
        return new Response(JSON.stringify({ error: "invalid JSON body" }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      if (!body.email || !body.brand || !body.domain) {
        return new Response(JSON.stringify({ error: "email, brand, domain are required" }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      const clientSlug = body.client_slug || body.domain.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi, "-").toLowerCase();
      try {
        const { generateAndStoreAudit, sendAuditDeliveryEmail } = await import("./audit-delivery");
        const generated = await generateAndStoreAudit(env, {
          email: body.email,
          brand: body.brand,
          domain: body.domain,
          clientSlug,
          customerName: body.customer_name,
        });
        // Also send the email by default so the manual trigger mirrors
        // the automatic flow exactly. Caller can pass ?skipEmail=1 if
        // they only want to (re)generate without re-emailing.
        const skipEmail = url.searchParams.get("skipEmail") === "1";
        let emailResult: { ok: boolean; error?: string } = { ok: true };
        if (!skipEmail) {
          emailResult = await sendAuditDeliveryEmail(env, {
            email: body.email,
            brand: body.brand,
            domain: body.domain,
            clientSlug,
            customerName: body.customer_name,
            auditUrl: generated.url,
          });
        }
        return new Response(JSON.stringify({
          ok: true,
          token: generated.token,
          url: generated.url,
          email_sent: !skipEmail && emailResult.ok,
          email_error: emailResult.error,
        }, null, 2), { headers: { "content-type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false, error: e instanceof Error ? e.message : String(e),
        }), { status: 500, headers: { "content-type": "application/json" } });
      }
    }

    // Audit viewer. Customer-facing public route that retrieves a
    // saved audit deliverable from KV by its HMAC token. The token is
    // derived per-customer (HMAC of email + client_slug) and embedded
    // in the post-checkout email link. Tokens are not guessable from
    // either the email or the slug alone.
    {
      const viewMatch = path.match(/^\/audit\/view\/([a-f0-9]{16,32})$/);
      if (viewMatch && method === "GET") {
        const token = viewMatch[1];
        const html = await env.LEADS.get(`audit:${token}`);
        if (!html) {
          return new Response(
            `<!DOCTYPE html><html><body style="font-family:system-ui;padding:48px;background:#0c0c0c;color:#e8e6df">
            <h1 style="color:#c9a84c;font-family:Georgia,serif;font-style:italic">Audit not found</h1>
            <p>This link may have expired (audits live for 1 year) or the token is invalid. If you believe this is an error, reply to your delivery email and we'll regenerate it.</p>
            </body></html>`,
            { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "private, max-age=300",
            "x-content-type-options": "nosniff",
          },
        });
      }
    }

    // $750 audit deliverable generator. Public route gated by
    // ADMIN_SECRET so Lance (or a deploy script) can hit it without
    // dashboard auth, but it's not scrape-able by random visitors.
    // Returns a complete HTML scaffold for a customer audit, with the
    // entity graph + action priority bar pre-rendered live and prose
    // sections marked as editable so Lance can save-as, customize,
    // and send/print.
    if (path === "/audit-template" && method === "GET") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { "content-type": "application/json" },
        });
      }
      const brand = url.searchParams.get("brand") || "";
      const domain = url.searchParams.get("domain") || "";
      const customerName = url.searchParams.get("name") || "";
      if (!brand || !domain) {
        return new Response(JSON.stringify({ error: "?brand= and ?domain= required" }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      const { buildAuditTemplate } = await import("./audit-template");
      const html = await buildAuditTemplate(env, { brand, domain, customer_name: customerName });
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    // Public iframe-friendly embed of the entity-graph audit visual.
    // No auth -- the data is derivable from public sources (Wikipedia,
    // Wikidata, the customer's own homepage HTML). Used in pitch URLs
    // and the marketing site so prospects can see their entity score
    // without logging in. Rate limiting via CF edge controls abuse.
    if (path === "/embed/entity-audit" && method === "GET") {
      const brand = url.searchParams.get("brand") || "";
      const domain = url.searchParams.get("domain") || "";
      const fresh = url.searchParams.get("fresh") === "1";
      if (!brand) {
        return new Response("brand= required", { status: 400 });
      }
      // Cache the rendered HTML in KV. A live audit takes 3-5s
      // (Wikidata + Wikipedia + on-page fetch + DataForSEO). For an
      // iframe in a pitch URL that's a 3-5 second blank rectangle the
      // prospect interprets as broken. 24h TTL means the first viewer
      // pays the cost, all subsequent viewers get instant load.
      // Bypass with ?fresh=1 for testing.
      const cacheKey = `embed-entity-audit:${brand.toLowerCase().trim()}:${domain.toLowerCase().trim()}`;
      const cachedHtml = fresh ? null : await env.LEADS.get(cacheKey);
      if (cachedHtml) {
        return new Response(cachedHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=1800, s-maxage=1800",
            "x-content-type-options": "nosniff",
            "x-cache": "HIT",
          },
        });
      }
      const { auditEntityGraphPartial } = await import("./entity-graph");
      const { renderEntityAuditCard } = await import("./entity-graph-render");
      const audit = await auditEntityGraphPartial(env, brand, domain);
      // Iframe-tuned shell: transparent body so the parent page's
      // background shows through, no min-height fill, tighter padding.
      // Cache 30 minutes so a popular pitch URL doesn't re-run the
      // audit on every viewer's page load.
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Entity audit · ${brand}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;padding:0;background:#0c0c0c}
  body > div{padding:24px !important;max-width:100% !important}
</style>
<script>
  // Iframe context: make backgrounds transparent so host page bg
  // shows through. Top-level page: keep the dark bg so the embed
  // URL works both as iframe content and as a standalone link.
  if (window.self !== window.top) {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    var d = document.body.firstElementChild;
    if (d) d.style.background = "transparent";
  }
</script>
</head><body>${renderEntityAuditCard(audit)}</body></html>`;
      // Persist the rendered HTML to KV for 24h. Fire-and-forget via
      // waitUntil so the response isn't blocked.
      ctx.waitUntil(
        env.LEADS.put(cacheKey, html, { expirationTtl: 24 * 60 * 60 })
          .catch((e) => console.log(`[embed-cache] put failed: ${e}`)),
      );
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=1800, s-maxage=1800",
          "x-content-type-options": "nosniff",
          "x-cache": "MISS",
        },
      });
    }

    // Entity graph audit — HTML visual viewer. Public route gated by
    // ADMIN_SECRET, returns the full styled HTML card (gauge + signal
    // grid). This is the customer-facing visual that turns the JSON
    // audit into something a prospect can grasp at a glance. Format
    // override: ?format=json returns the raw audit instead.
    if (path === "/api/admin/entity-audit-card" && method === "GET") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { "content-type": "application/json" },
        });
      }
      const brand = url.searchParams.get("brand") || "";
      const domain = url.searchParams.get("domain") || "";
      if (!brand) {
        return new Response(JSON.stringify({ error: "?brand= required" }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      const { auditEntityGraphPartial } = await import("./entity-graph");
      const { renderEntityAuditCard } = await import("./entity-graph-render");
      const audit = await auditEntityGraphPartial(env, brand, domain);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Entity audit — ${brand}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0c0c0c}</style>
</head><body>${renderEntityAuditCard(audit)}</body></html>`;
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // Entity graph audit (chapter 1: Wikidata + Wikipedia signals).
    // Public route gated by ADMIN_SECRET so we can call it from the
    // outreach pipeline + curl it for testing without the dashboard
    // session-auth dance. Returns the partial audit JSON; future
    // chapters fill in the remaining 6 signals.
    if (path === "/api/admin/entity-audit" && method === "GET") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { "content-type": "application/json" },
        });
      }
      const brand = url.searchParams.get("brand") || "";
      const domain = url.searchParams.get("domain") || "";
      if (!brand) {
        return new Response(JSON.stringify({ error: "?brand= required" }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      const { auditEntityGraphPartial } = await import("./entity-graph");
      const result = await auditEntityGraphPartial(env, brand, domain);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    // Recent email-opens feed for the local outreach server. Public
    // route gated by ADMIN_SECRET (not session auth), mirroring the
    // pattern on check.neverranked.com/api/admin/recent-events. The
    // local poller hits this every 60s and reconciles into its own
    // SQLite prospects table.
    if (path === "/api/admin/recent-opens" && method === "GET") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { "content-type": "application/json" },
        });
      }
      const since = parseInt(
        url.searchParams.get("since") || String(Math.floor(Date.now() / 1000) - 86400),
        10,
      );
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 1000);
      const rows = (await env.DB.prepare(
        `SELECT prospect_id, opened_at, ip_hash, ua
           FROM email_opens
          WHERE opened_at >= ?
          ORDER BY opened_at DESC
          LIMIT ?`,
      ).bind(since, limit).all()).results;
      return new Response(JSON.stringify({ since, count: rows.length, opens: rows }, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    if (path === "/login" && method === "GET") {
      return handleGetLogin(request, env);
    }
    if (path === "/login" && method === "POST") {
      return handlePostLogin(request, env);
    }
    if (path === "/auth/verify" && method === "GET") {
      return handleVerify(request, env);
    }
    if (path === "/auth/invite" && method === "GET") {
      return handleInviteAccept(request, env);
    }

    // 2FA routes (the gate above lets these through even when 2FA is required)
    // Note: GET 2fa-challenge needs auth; covered after the auth check below.

    // Public install guides -- forwardable, indexable for SEO
    if (path === "/install" && method === "GET") {
      return handleInstallIndex(request, env);
    }
    // Public changelog -- trust signal, indexable
    if (path === "/changelog" && method === "GET") {
      return handleChangelog(request, env);
    }

    // Public Weekly AEO Brief: archive list + per-brief detail.
    // Indexable, no auth, JSON-LD Article schema on detail pages.
    if (path === "/weekly" || path === "/weekly/") {
      const { handleWeeklyList } = await import("./routes/weekly");
      return handleWeeklyList(env);
    }
    const weeklyDetailMatch = path.match(/^\/weekly\/([a-z0-9-]+)$/);
    if (weeklyDetailMatch && method === "GET") {
      const { handleWeeklyDetail } = await import("./routes/weekly");
      return handleWeeklyDetail(weeklyDetailMatch[1], env);
    }
    const installMatch = /^\/install\/([a-z0-9-]+)$/.exec(path);
    if (installMatch && method === "GET") {
      return handleInstallGuide(installMatch[1], request, env);
    }

    // Public health endpoint for the Hawaii Theatre Event cron.
    // Read-only counts and timestamps. Used by the scheduled
    // verifier so it doesn't need an admin session or D1 token.
    if (path === "/health/htc-events" && method === "GET") {
      const slug = "hawaii-theatre";
      const eventRow = await env.DB.prepare(
        "SELECT COUNT(*) AS n, MAX(approved_at) AS last_refresh_at " +
        "FROM schema_injections WHERE client_slug = ? AND schema_type = 'Event' AND status = 'approved'"
      ).bind(slug).first<{ n: number; last_refresh_at: number | null }>();
      const since = Math.floor(Date.now() / 1000) - 7 * 86400;
      const alertRow = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM admin_alerts WHERE client_slug = ? " +
        "AND type IN ('htc_events_fetch_failed', 'htc_events_parser_drift') AND created_at > ?"
      ).bind(slug, since).first<{ n: number }>();
      const now = Math.floor(Date.now() / 1000);
      const lastAt = eventRow?.last_refresh_at ?? null;
      const ageHours = lastAt ? Math.round((now - lastAt) / 3600 * 10) / 10 : null;
      const body = {
        client_slug: slug,
        served_event_count: eventRow?.n ?? 0,
        last_refresh_at: lastAt,
        last_refresh_age_hours: ageHours,
        recent_alerts_7d: alertRow?.n ?? 0,
        snippet_url: "https://app.neverranked.com/inject/hawaii-theatre.js",
        source_page: "https://www.hawaiitheatre.com/upcoming-events/",
        checked_at: now,
      };
      return new Response(JSON.stringify(body, null, 2), {
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=60, s-maxage=60",
        },
      });
    }

    // Public shared report (no auth)
    const reportMatch = path.match(/^\/report\/([a-f0-9]{32})$/);
    if (reportMatch) {
      return handlePublicReport(reportMatch[1], env);
    }

    // Pitch tracking pixel (no auth, returns 1x1 GIF either way).
    // Embedded on every /pitch/* page on the marketing site so we can
    // see who has actually opened a private pitch URL.
    const pitchTrackMatch = path.match(/^\/track\/pitch\/([a-z0-9-]{1,80})$/);
    if (pitchTrackMatch && method === "GET") {
      const { handleTrackPitch } = await import("./routes/track-pitch");
      return handleTrackPitch(pitchTrackMatch[1], request, env);
    }

    // Stripe checkout (no auth -- public pricing links)
    // Pulse waitlist POST — must come BEFORE the general /checkout/<plan>
    // matcher so the form submit doesn't fall through to handleCheckout.
    if (path === "/checkout/pulse/waitlist" && method === "POST") {
      return handlePulseWaitlist(request, env);
    }
    const checkoutMatch = path.match(/^\/checkout\/(audit|pulse|signal|amplify)$/);
    if (checkoutMatch && method === "GET") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      ctx.waitUntil(logEvent(env, { type: "checkout_view", detail: { plan: checkoutMatch[1] }, ipHash: hashIP(ip) }));
      return handleCheckout(checkoutMatch[1], request, env);
    }
    if (path === "/checkout/success" && method === "GET") {
      return handleCheckoutSuccess(request, env);
    }

    // Digest unsubscribe (no auth -- token-based)
    if (path === "/digest/unsubscribe" && method === "GET") {
      const token = url.searchParams.get("token") || "";
      try {
        // Pad base64 back
        const padded = token + "=".repeat((4 - token.length % 4) % 4);
        const decoded = atob(padded);
        const [userId, email] = decoded.split(":", 2);
        if (userId && email) {
          await env.DB.prepare("UPDATE users SET email_digest = 0 WHERE id = ? AND email = ?").bind(Number(userId), email).run();
        }
      } catch {}
      return html(`
        <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Unsubscribed</title></head>
        <body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif;color:#fbf8ef;display:flex;align-items:center;justify-content:center;min-height:100vh">
          <div style="text-align:center;max-width:400px;padding:40px 20px">
            <div style="font-family:Georgia,serif;font-size:20px;font-style:italic;color:#e8c767;margin-bottom:24px">Never Ranked</div>
            <h2 style="font-family:Georgia,serif;font-weight:400;font-size:18px;margin:0 0 12px">You've been unsubscribed</h2>
            <p style="font-size:14px;color:#888888;line-height:1.6;margin:0 0 24px">You won't receive weekly digest emails anymore. You can re-enable them anytime from your dashboard settings.</p>
            <a href="https://app.neverranked.com/settings" style="display:inline-block;padding:12px 28px;background:#e8c767;color:#080808;font-family:monospace;font-size:12px;letter-spacing:.05em;text-decoration:none;border-radius:2px">Go to settings</a>
          </div>
        </body></html>
      `);
    }

    // Stripe webhook (no auth -- verified by signature). Non-POST methods
    // return 405 explicitly so probes and health checks don't fall
    // through to the auth middleware and get a confusing /login redirect.
    if (path === "/stripe/webhook") {
      if (method === "POST") return handleStripeWebhook(request, env, ctx);
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "Allow": "POST", "Content-Type": "text/plain" },
      });
    }

    // Demo mode (public, no auth)
    if (path === "/demo" || path === "/demo/") {
      return handleDemoRedirect();
    }
    if (path === "/demo/domain") {
      return method === "POST" ? handleDemoPost() : handleDemoDomain();
    }
    if (path === "/demo/citations") {
      return method === "POST" ? handleDemoPost() : handleDemoCitations();
    }
    if (path === "/demo/roadmap") {
      return method === "POST" ? handleDemoPost() : handleDemoRoadmap();
    }
    if (path.startsWith("/demo/") && method === "POST") {
      return handleDemoPost();
    }

    // Schema injection JS (public, cached at edge). We pass the
    // request + ctx so the handler can fire-and-forget bot-analytics
    // logging without blocking the response.
    const injectMatch = path.match(/^\/inject\/([a-z0-9_-]+)\.js$/);
    if (injectMatch) {
      return handleInjectScript(injectMatch[1], env, request, ctx);
    }
    const injectJsonMatch = path.match(/^\/inject\/([a-z0-9_-]+)\.json$/);
    if (injectJsonMatch) {
      return handleInjectJson(injectJsonMatch[1], env);
    }

    // Admin API: leads JSON for the outreach repo to pull warm-fuel.
    // Auth via X-Admin-Secret header so we can call this from the
    // localhost outreach tool without a browser session.
    if (path === "/api/admin/leads.json" && method === "GET") {
      return handleLeadsJson(request, env);
    }



    // Agency assets (logos). Public on purpose -- these are what
    // branded client pages render in the topbar. Path and filename
    // patterns are locked down inside the handler.
    //
    // We match the broader /_assets/agency/* prefix first so any path
    // under it terminates at this route (returning 404 if the slug or
    // filename doesn't fit our pattern) instead of falling through to
    // the auth middleware and giving a misleading /login redirect on
    // bad casing or bad filenames.
    if (path.startsWith("/_assets/agency/")) {
      const assetMatch = path.match(/^\/_assets\/agency\/([a-z0-9][a-z0-9-]*)\/([^/]+)$/);
      if (assetMatch) {
        return handleAgencyAsset(assetMatch[1], assetMatch[2], env);
      }
      return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }

    // Public agency application (no auth). Prospects land here from
    // outreach replies or from neverranked.com.
    if (path === "/agency/apply" && method === "GET") {
      const { handleAgencyApplyGet } = await import("./routes/agency-apply");
      return handleAgencyApplyGet();
    }
    if (path === "/agency/apply" && method === "POST") {
      const { handleAgencyApplyPost } = await import("./routes/agency-apply");
      return handleAgencyApplyPost(request, env);
    }

    // --- Auth check ---

    const user = await getUser(request, env);
    if (user) _user_id_for_log = user.id;

    if (path === "/logout") {
      return handleLogout(request, env);
    }

    if (!user) {
      // Track page view for public pages that fall through (unauthenticated visit)
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      ctx.waitUntil(logEvent(env, { type: "page_view", detail: { path, authed: false }, ipHash: hashIP(ip) }));
      return redirect("/login");
    }

    // 2FA gate. Two enforcement modes:
    //   1. User has 2FA enabled -> require totp_verified=1 on session
    //      before reaching anything except /auth/2fa-challenge or /logout
    //   2. User has admin role but hasn't enrolled -> force them to
    //      /settings/2fa to enroll. Admin-protected routes also check
    //      this so a partially-enrolled admin can't bypass.
    const is2faPath = path === "/auth/2fa-challenge"
      || path === "/settings/2fa"
      || path.startsWith("/settings/2fa/")
      || path === "/logout";
    if (!is2faPath) {
      if (user.totp_enabled_at && !user.totp_verified) {
        return redirect("/auth/2fa-challenge?next=" + encodeURIComponent(path));
      }
      if (user.role === "admin" && !user.totp_enabled_at) {
        return redirect("/settings/2fa");
      }
    }

    // Compute branding once per request. Route handlers don't need to
    // thread it through layout() calls -- render.ts reads it off
    // user._branding as a fallback. We scope the slug to the path we
    // can trust (the user's own client_slug) so that an agency_admin
    // viewing multiple clients always sees their own agency branding.
    try {
      user._branding = await getBrandingContext(env, user, user.client_slug);
    } catch {
      // Branding is cosmetic -- don't fail the request if the lookup errors.
    }

    // Track authenticated page view
    ctx.waitUntil(logEvent(env, { type: "page_view", detail: { path }, userId: user.id }));
    // Engagement tracking (DB-backed, for admin reports)
    if (method === "GET") {
      const pvNow = Math.floor(Date.now() / 1000);
      ctx.waitUntil(
        env.DB.prepare("INSERT INTO page_views (user_id, client_slug, path, created_at) VALUES (?, ?, ?, ?)")
          .bind(user.id, user.client_slug || null, path, pvNow).run().catch(() => {})
      );
    }

    // Compute nav badges (lightweight counts for notification dots)
    try {
      if (user.role === "client" && user.client_slug) {
        const alertCount = await env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM admin_alerts WHERE client_slug = ? AND read_at IS NULL"
        ).bind(user.client_slug).first<{ cnt: number }>();
        user._alertCount = alertCount?.cnt || 0;

        const rmCount = await env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM roadmap_items WHERE client_slug = ? AND status = 'in_progress'"
        ).bind(user.client_slug).first<{ cnt: number }>();
        user._roadmapInProgress = rmCount?.cnt || 0;
      } else if (user.role === "admin") {
        const alertCount = await env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM admin_alerts WHERE read_at IS NULL"
        ).first<{ cnt: number }>();
        user._alertCount = alertCount?.cnt || 0;
        // NVI pending count: reports awaiting Lance's review before
        // customer delivery. Surfaces as a badge on the NVI Inbox
        // sidebar item so manual review is visible without opening
        // the page first.
        const nviPending = await env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM nvi_reports WHERE status = 'pending'"
        ).first<{ cnt: number }>();
        user._nviPending = nviPending?.cnt || 0;
      }
    } catch {
      // Non-critical -- don't break routing if badge query fails
    }

    // Parse a client slug from the URL when present (e.g. "and-scene"
    // from /roadmap/and-scene). Used by middleware-computed surfaces
    // -- pulse, activity feed, autonomy panel -- so an admin previewing
    // a specific client's page sees that client's data scope.
    {
      const segs = path.split("/").filter(Boolean);
      // Path shapes we care about: /<page>/<slug>[/...]. Skip API and admin routes.
      if (segs.length >= 2 && !["api", "admin", "agency", "auth", "logout", "login"].includes(segs[0])) {
        const candidate = segs[1];
        if (/^[a-z0-9-]+$/.test(candidate) && candidate.length >= 2 && candidate.length <= 64) {
          user._contextSlug = candidate;
        }
      }
    }

    // System pulse — three-state heartbeat surfaced in the topbar so
    // the dashboard never reads as standing still. Per-client by
    // default, aggregated for admin scope. Failure is non-fatal.
    try {
      const { computePulse } = await import("./system-pulse");
      const pulse = await computePulse(user, env);
      if (pulse) user._pulse = pulse;
    } catch {
      // Non-critical
    }

    // --- Authenticated routes ---

    // Onboarding
    if (path === "/onboarding" && method === "GET") {
      return handleOnboarding(user, env);
    }
    if (path === "/onboarding" && method === "POST") {
      return handleOnboardingSubmit(request, user, env);
    }
    if (path === "/onboarding/skip") {
      return handleOnboardingSkip(user, env);
    }
    // Pulse self-serve onboarding -- generates 10 prompts, customer
    // edits + saves, first citation run kicks off in the background.
    if (path === "/onboard/pulse" && (method === "GET" || method === "POST")) {
      const { handleOnboardPulse } = await import("./routes/onboard-pulse");
      return handleOnboardPulse(request, env, user);
    }

    // Getting Started checklist dismissal / reopen. Dismiss hides the
    // card on the home Dashboard; reset clears it so the card shows
    // again (triggered from the "Getting started" avatar-menu link).
    if (path === "/onboarding/checklist/dismiss" && method === "POST") {
      await env.DB.prepare(
        "UPDATE users SET checklist_dismissed_at = ? WHERE id = ?",
      ).bind(Math.floor(Date.now() / 1000), user.id).run();
      const referer = request.headers.get("Referer");
      return redirect(referer && referer.startsWith(new URL(request.url).origin) ? referer : "/");
    }
    if (path === "/onboarding/checklist/reset" && (method === "GET" || method === "POST")) {
      await env.DB.prepare(
        "UPDATE users SET checklist_dismissed_at = NULL WHERE id = ?",
      ).bind(user.id).run();
      return redirect(user.role === "agency_admin" ? "/agency" : "/");
    }

    // Auto-mark active clients as onboarded. If a client user has a
    // monitored domain with at least one scan, they have already passed
    // the productive bootstrap — the onboarded flag is just a stale
    // bookkeeping bit. Flip it forward instead of trapping them in the
    // onboarding flow. (Reported by Hawaii Theatre on 2026-05-07: the
    // unset flag was redirecting every menu click to /onboarding.)
    if (user.role === "client" && !user.onboarded && user.client_slug) {
      const hasActive = await env.DB.prepare(
        `SELECT 1 FROM domains d
            JOIN scan_results sr ON sr.domain_id = d.id
            WHERE d.client_slug = ? AND d.is_competitor = 0 AND d.active = 1
            LIMIT 1`
      ).bind(user.client_slug).first<{ 1: number }>();
      if (hasActive) {
        await env.DB.prepare(
          "UPDATE users SET onboarded = 1 WHERE id = ? AND onboarded = 0"
        ).bind(user.id).run().catch(() => {});
        user.onboarded = 1;
      }
    }

    // Auto-redirect non-onboarded clients to /onboarding, but never
    // block the user-control surfaces (settings, support, billing,
    // team management, logout). A client who can't complete onboarding
    // for any reason should still be able to reach the screens that
    // unblock them.
    const allowDuringOnboarding =
      path === "/settings" ||
      path.startsWith("/settings/") ||
      path === "/support" ||
      path.startsWith("/billing/") ||
      path === "/team" ||
      path.startsWith("/team/") ||
      path === "/learn" ||
      path.startsWith("/learn/") ||
      path === "/agency/invites/teammate" ||
      path === "/agency/invites/client";
    if (user.role === "client" && !user.onboarded && !allowDuringOnboarding) {
      return redirect("/onboarding");
    }

    // Home -- single-domain clients skip straight to their report
    if (path === "/" || path === "") {
      // Agency admins land on their own agency dashboard, not the
      // direct-client home (which has no meaning for them). Pending
      // agencies without a subscription get pushed straight to billing
      // so the first session after approval lands on the activation CTA.
      if (user.role === "agency_admin") {
        if (user.agency_id) {
          const agency = await getAgency(env, user.agency_id);
          if (agency && agency.status === "pending" && !agency.stripe_subscription_id) {
            return redirect("/agency/billing");
          }
        }
        return redirect("/agency");
      }
      if (user.role === "client" && user.client_slug) {
        const clientDomains = (await env.DB.prepare(
          "SELECT id FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1"
        ).bind(user.client_slug).all<{ id: number }>()).results;
        if (clientDomains.length === 1) {
          return redirect(`/domain/${clientDomains[0].id}`);
        }
      }
      return handleHome(user, env);
    }

    // Agency dashboard (agency_admin lands here; admin can preview via ?agency=slug)
    if (path === "/agency" && method === "GET") {
      return handleAgencyDashboard(user, env, url);
    }
    if (path === "/agency/clients.csv" && method === "GET") {
      return handleAgencyClientsCsv(user, env, url);
    }
    if (path === "/agency/clients.json" && method === "GET") {
      return handleAgencyClientsJson(user, env, url);
    }
    if (path === "/agency/clients/new" && method === "GET") {
      return handleAgencyAddClientGet(user, env, url);
    }
    if (path === "/agency/clients/new" && method === "POST") {
      return handleAgencyAddClientPost(request, user, env);
    }
    if (path === "/agency/settings" && method === "GET") {
      return handleAgencySettingsGet(user, env, url);
    }
    if (path === "/agency/settings" && method === "POST") {
      return handleAgencySettingsPost(request, user, env);
    }
    if (path === "/agency/billing" && method === "GET") {
      return handleAgencyBillingGet(user, env, url);
    }
    if (path === "/agency/billing/activate" && method === "POST") {
      return handleAgencyBillingActivate(request, user, env);
    }
    if (path === "/agency/billing/success" && method === "GET") {
      return handleAgencyBillingSuccess(user, env, url);
    }

    // Agency invites (teammate / client)
    if (path === "/agency/invites" && method === "GET") {
      return handleAgencyInvitesGet(user, env, url);
    }
    if (path === "/agency/invites/teammate" && method === "POST") {
      return handleInviteTeammate(request, user, env);
    }
    if (path === "/agency/invites/client" && method === "POST") {
      return handleInviteClient(request, user, env);
    }
    const inviteResendMatch = /^\/agency\/invites\/(\d+)\/resend$/.exec(path);
    if (inviteResendMatch && method === "POST") {
      return handleInviteResend(Number(inviteResendMatch[1]), user, env);
    }
    const inviteRevokeMatch = /^\/agency\/invites\/(\d+)\/revoke$/.exec(path);
    if (inviteRevokeMatch && method === "POST") {
      return handleInviteRevoke(Number(inviteRevokeMatch[1]), user, env);
    }
    const clientPauseMatch = /^\/agency\/clients\/(\d+)\/pause$/.exec(path);
    if (clientPauseMatch && method === "POST") {
      return handleAgencyPauseClient(Number(clientPauseMatch[1]), user, env);
    }
    const clientResumeMatch = /^\/agency\/clients\/(\d+)\/resume$/.exec(path);
    if (clientResumeMatch && method === "POST") {
      return handleAgencyResumeClient(Number(clientResumeMatch[1]), user, env);
    }
    const resendSnippetMatch = /^\/agency\/clients\/(\d+)\/resend-snippet$/.exec(path);
    if (resendSnippetMatch && method === "POST") {
      return handleAgencyResendSnippet(Number(resendSnippetMatch[1]), user, env);
    }

    // Domain detail
    const domainCompareMatch = path.match(/^\/domain\/(\d+)\/compare$/);
    if (domainCompareMatch) {
      return handleScanCompare(Number(domainCompareMatch[1]), user, env, url);
    }
    const domainRescanMatch = path.match(/^\/domain\/(\d+)\/rescan$/);
    if (domainRescanMatch && method === "POST") {
      return handleClientRescan(Number(domainRescanMatch[1]), user, env);
    }
    const domainMatch = path.match(/^\/domain\/(\d+)$/);
    if (domainMatch) {
      return handleDomainDetail(Number(domainMatch[1]), user, env, url);
    }

    // Admin routes
    if (path === "/admin" && method === "GET" && user.role === "admin") {
      return handleCockpit(user, env);
    }

    // View-as-client toggle. Available to admin/agency_admin (checked
    // via real_role since `role` may have already been downgraded by
    // a prior toggle). Flips the nr_view_as_client cookie. We bounce
    // back to the referrer so the toggle is invisible plumbing -- the
    // page just re-renders in the new mode.
    if (path === "/admin/view-as-client/toggle" && method === "POST") {
      const realRole = user.real_role || user.role;
      if (realRole !== "admin" && realRole !== "agency_admin") {
        return new Response("Forbidden", { status: 403 });
      }
      const cookie = request.headers.get("Cookie") || "";
      const isOn = cookie.includes("nr_view_as_client=1");
      const referer = request.headers.get("Referer") || "/";
      const setCookie = isOn
        ? "nr_view_as_client=; Path=/; Max-Age=0; SameSite=Lax"
        : "nr_view_as_client=1; Path=/; Max-Age=7200; SameSite=Lax; Secure";
      return new Response(null, {
        status: 303,
        headers: { Location: referer, "Set-Cookie": setCookie },
      });
    }

    // Weekly AEO Brief admin: list, detail, approve, reject, regenerate
    if (path === "/admin/weekly-brief" && method === "GET" && user.role === "admin") {
      const { handleAdminBriefList } = await import("./routes/weekly");
      return handleAdminBriefList(user, env);
    }
    if (path === "/admin/weekly-brief/regenerate" && method === "POST" && user.role === "admin") {
      const { handleAdminBriefRegenerate } = await import("./routes/weekly");
      return handleAdminBriefRegenerate(env, request);
    }
    const weeklyAdminViewMatch = path.match(/^\/admin\/weekly-brief\/(\d+)$/);
    if (weeklyAdminViewMatch && method === "GET" && user.role === "admin") {
      const { handleAdminBriefView } = await import("./routes/weekly");
      return handleAdminBriefView(parseInt(weeklyAdminViewMatch[1], 10), user, env);
    }
    const weeklyAdminApproveMatch = path.match(/^\/admin\/weekly-brief\/(\d+)\/approve$/);
    if (weeklyAdminApproveMatch && method === "POST" && user.role === "admin") {
      const { handleAdminBriefApprove } = await import("./routes/weekly");
      return handleAdminBriefApprove(parseInt(weeklyAdminApproveMatch[1], 10), user, env);
    }
    const weeklyAdminRejectMatch = path.match(/^\/admin\/weekly-brief\/(\d+)\/reject$/);
    if (weeklyAdminRejectMatch && method === "POST" && user.role === "admin") {
      const { handleAdminBriefReject } = await import("./routes/weekly");
      return handleAdminBriefReject(parseInt(weeklyAdminRejectMatch[1], 10), user, env);
    }

    // Admin inbox -- the founder's "what needs my attention" surface
    if (path === "/admin/inbox" && method === "GET" && user.role === "admin") {
      const { handleInboxList } = await import("./routes/admin-inbox");
      return handleInboxList(user, env, url);
    }
    // Plan management — assign Pulse/Signal/Amplify per client + see usage
    if (path === "/admin/plans" && (method === "GET" || method === "POST") && user.role === "admin") {
      const { handleAdminPlans } = await import("./routes/admin-plans");
      return handleAdminPlans(request, env, user);
    }
    // Pitches tracker — pulls from pitch/_meta/log.md in the marketing repo
    if (path === "/admin/pitches" && method === "GET" && user.role === "admin") {
      const { handlePitches } = await import("./routes/admin-pitches");
      return handlePitches(user, env);
    }
    // Schema variant impact viewer -- A/B test results per client.
    const variantsMatch = path.match(/^\/admin\/variants\/([a-z0-9-]+)$/);
    if (variantsMatch && method === "GET" && user.role === "admin") {
      const { handleAdminVariants } = await import("./routes/admin-variants");
      return handleAdminVariants(decodeURIComponent(variantsMatch[1]), user, env);
    }
    const inboxDetailMatch = path.match(/^\/admin\/inbox\/(\d+)$/);
    if (inboxDetailMatch && method === "GET" && user.role === "admin") {
      const { handleInboxDetail } = await import("./routes/admin-inbox");
      return handleInboxDetail(parseInt(inboxDetailMatch[1], 10), user, env);
    }
    const inboxActionMatch = path.match(/^\/admin\/inbox\/(\d+)\/(approve|reject|resolve|snooze)$/);
    if (inboxActionMatch && method === "POST" && user.role === "admin") {
      const { handleInboxAction } = await import("./routes/admin-inbox");
      return handleInboxAction(
        parseInt(inboxActionMatch[1], 10),
        inboxActionMatch[2] as "approve" | "reject" | "resolve" | "snooze",
        user, env, request,
      );
    }
    if (path === "/admin/manage" && method === "GET" && user.role === "admin") {
      return handleAdminHome(user, env, url);
    }
    if (path === "/admin/scans" && method === "GET" && user.role === "admin") {
      return handleScanHealth(user, env);
    }

    // Admin: recent request errors. Surfaces any 500 captured by the
    // global error handler. Filter by ?id=<request_id> to look up a
    // specific error a customer reported.
    if (path === "/admin/recent-errors" && method === "GET" && user.role === "admin") {
      const reqIdFilter = url.searchParams.get("id");
      const d1Rows = reqIdFilter
        ? (await env.DB.prepare(
            "SELECT * FROM request_errors WHERE request_id = ? ORDER BY created_at DESC LIMIT 50"
          ).bind(reqIdFilter).all()).results
        : (await env.DB.prepare(
            "SELECT * FROM request_errors ORDER BY created_at DESC LIMIT 100"
          ).all()).results;
      // Merge KV fallback rows (when D1 INSERT failed at error time).
      const kvList = await env.LEADS.list({ prefix: "request_error:", limit: 200 });
      const kvRows: Array<Record<string, unknown>> = [];
      for (const k of kvList.keys) {
        const raw = await env.LEADS.get(k.name);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (!reqIdFilter || parsed.request_id === reqIdFilter) {
            kvRows.push({ ...parsed, _source: "kv-fallback" });
          }
        } catch {}
      }
      const rows = [...d1Rows, ...kvRows]
        .sort((a, b) => (b.created_at as number) - (a.created_at as number))
        .slice(0, 100);
      const items = (rows as Array<Record<string, unknown>>).map(r => `
        <div style="padding:14px 18px;border:1px solid var(--line);border-radius:4px;margin-bottom:12px;font-family:var(--mono);font-size:12px;line-height:1.6">
          <div style="display:flex;justify-content:space-between;color:var(--text-mute)">
            <span style="color:var(--gold)">${escHtml(String(r.request_id))}</span>
            <span>${new Date((r.created_at as number) * 1000).toLocaleString()}</span>
          </div>
          <div style="color:var(--text);margin-top:6px"><strong>${escHtml(String(r.method))}</strong> ${escHtml(String(r.path))}${r.user_id ? ` · user ${r.user_id}` : ''}</div>
          <div style="color:var(--err);margin-top:8px;white-space:pre-wrap;word-break:break-all">${escHtml(String(r.message))}</div>
          ${r.stack ? `<details style="margin-top:8px"><summary style="cursor:pointer;color:var(--text-faint)">stack</summary><pre style="white-space:pre-wrap;font-size:11px;color:var(--text-faint);margin:8px 0 0">${escHtml(String(r.stack))}</pre></details>` : ''}
          ${r.user_agent ? `<div style="color:var(--text-faint);margin-top:6px;font-size:11px">UA: ${escHtml(String(r.user_agent))}</div>` : ''}
        </div>
      `).join("");
      const body = `
        <div style="margin-bottom:32px">
          <div class="label" style="margin-bottom:8px"><a href="/admin" style="color:var(--text-mute)">Admin</a></div>
          <h1><em>Recent errors</em></h1>
          <p style="color:var(--text-faint);font-size:13px;margin-top:8px">Most recent ${reqIdFilter ? `request id "${escHtml(reqIdFilter)}"` : '100 captured 500s'}. <a href="/admin/recent-errors" style="color:var(--gold)">show all</a></p>
        </div>
        ${rows.length === 0 ? '<div class="empty"><h3>No errors captured</h3><p style="color:var(--text-faint)">The error capture is still alive though — anything that 500s from now on lands here.</p></div>' : items}
      `;
      return html(layout("Recent errors", body, user));
    }
    // Admin: issue a fresh magic link for a given email and return the
    // direct URL. Bypasses email entirely -- useful for verifying
    // dashboard render after a checkout test, OR for one-off ops
    // when a magic link expires before a customer can click it.
    const adminMagicLinkMatch = path.match(/^\/admin\/magic-link\/(.+)$/);
    if (adminMagicLinkMatch && method === "GET" && user.role === "admin") {
      try {
        const targetEmail = decodeURIComponent(adminMagicLinkMatch[1]).trim().toLowerCase();
        const { createMagicLink } = await import("./auth");
        const token = await createMagicLink(targetEmail, env, 72 * 60 * 60);
        if (!token) {
          return new Response(JSON.stringify({ error: "could not create magic link", reason: "user not found OR rate limited (3 emails per 15min)" }, null, 2), { status: 400, headers: { "content-type": "application/json" } });
        }
        const origin = env.DASHBOARD_ORIGIN || "https://app.neverranked.com";
        return new Response(JSON.stringify({
          email: targetEmail,
          login_url: `${origin}/auth/verify?token=${token}`,
          ttl_hours: 72,
        }, null, 2), { headers: { "content-type": "application/json" } });
      } catch (e: unknown) {
        return new Response(JSON.stringify({ error: "magic link issuance failed", detail: e instanceof Error ? e.message : String(e) }, null, 2), { status: 500, headers: { "content-type": "application/json" } });
      }
    }

    // Resend deliverability check: echoes ADMIN_EMAIL (so we know which
    // inbox to check), and queries Resend for the most recent emails
    // sent. Read-only, admin-only. Useful for verifying the welcome
    // email + admin notification actually got accepted by Resend
    // without requiring inbox access.
    if (path === "/admin/email-health" && method === "GET" && user.role === "admin") {
      try {
        if (!env.RESEND_API_KEY) {
          return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }, null, 2), { status: 500, headers: { "content-type": "application/json" } });
        }
        const adminEmail = env.ADMIN_EMAIL || "(ADMIN_EMAIL secret not set)";
        // Resend's API for listing emails. Returns the most recent 100.
        // We surface the last 15 so you can see the audit-test-001
        // welcome + admin notification side-by-side.
        const resp = await fetch("https://api.resend.com/emails?limit=15", {
          headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}` },
        });
        const body = await resp.json() as Record<string, unknown>;
        const items = Array.isArray(body.data) ? (body.data as Array<Record<string, unknown>>) : [];
        // Real send test: attempt to send a tiny diagnostic email to
        // ADMIN_EMAIL using the same code path as the webhook. This
        // bypasses the silent-401 problem -- we capture the actual
        // response body so we know whether sending works at all.
        const testSendResp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "NeverRanked <reports@neverranked.com>",
            to: [adminEmail],
            subject: "Email health diagnostic (smoke test)",
            html: "<p>This is a diagnostic email triggered by /admin/email-health. If you received it, Resend send is working.</p>",
          }),
        });
        const testSendBody = await testSendResp.json() as Record<string, unknown>;
        return new Response(JSON.stringify({
          admin_email_target: adminEmail,
          resend_api_status: resp.status,
          resend_api_error: body.error || null,
          test_send_status: testSendResp.status,
          test_send_body: testSendBody,
          recent_emails: items.map(e => ({
            id: e.id,
            to: e.to,
            from: e.from,
            subject: e.subject,
            status: e.last_event,
            created_at: e.created_at,
          })),
        }, null, 2), { headers: { "content-type": "application/json" } });
      } catch (e: unknown) {
        return new Response(JSON.stringify({ error: "email health check failed", detail: e instanceof Error ? e.message : String(e) }, null, 2), { status: 500, headers: { "content-type": "application/json" } });
      }
    }

    // Billing health check: pings Stripe to verify the three price IDs
    // are active, the webhook endpoint is registered + receiving events,
    // and the secret keys all work. Hit /admin/billing-health to get a
    // structured JSON report. Read-only -- never modifies Stripe state.
    if (path === "/admin/billing-health" && method === "GET" && user.role === "admin") {
      try {
        if (!env.STRIPE_SECRET_KEY) {
          return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not set" }, null, 2), { status: 500, headers: { "content-type": "application/json" } });
        }
        // Source of truth for plan price IDs is the PLANS config in
        // routes/checkout.ts. The previous PRICE_IDS constant here
        // drifted when audit was bumped from $500 to $750 and when
        // pulse was added -- the diagnostic was reporting stale and
        // incomplete data. Importing PLANS keeps a single source.
        const { PLANS } = await import("./routes/checkout");
        const PRICE_IDS: Record<string, string> = {};
        for (const [planName, planCfg] of Object.entries(PLANS)) {
          PRICE_IDS[planName] = planCfg.priceId;
        }
        const sk = env.STRIPE_SECRET_KEY;
        const stripeFetch = async (path: string) => {
          const r = await fetch(`https://api.stripe.com/v1${path}`, {
            headers: { "Authorization": `Bearer ${sk}` },
          });
          return r.json();
        };
        const prices: Record<string, unknown> = {};
        for (const [plan, id] of Object.entries(PRICE_IDS)) {
          const p = await stripeFetch(`/prices/${id}`) as Record<string, unknown>;
          prices[plan] = {
            id: p.id,
            active: p.active,
            unit_amount: p.unit_amount,
            currency: p.currency,
            recurring: p.recurring,
            error: p.error || null,
          };
        }
        const couponsResp = await stripeFetch(`/coupons?limit=20`) as Record<string, unknown>;
        const couponsRaw = Array.isArray(couponsResp.data) ? couponsResp.data as Array<Record<string, unknown>> : [];
        const coupons_100_off = couponsRaw
          .filter(c => c.percent_off === 100 && c.valid)
          .map(c => ({ id: c.id, name: c.name, duration: c.duration, max_redemptions: c.max_redemptions, times_redeemed: c.times_redeemed, valid: c.valid }));
        const promoCodesResp = await stripeFetch(`/promotion_codes?limit=20&active=true`) as Record<string, unknown>;
        const promoRaw = Array.isArray(promoCodesResp.data) ? promoCodesResp.data as Array<Record<string, unknown>> : [];
        const promo_codes_100_off = promoRaw
          .filter(p => {
            const c = p.coupon as Record<string, unknown> | undefined;
            return c?.percent_off === 100 && p.active;
          })
          .map(p => ({ code: p.code, coupon_id: (p.coupon as Record<string, unknown>)?.id, max_redemptions: p.max_redemptions, times_redeemed: p.times_redeemed }));
        const endpoints = await stripeFetch(`/webhook_endpoints?limit=10`) as Record<string, unknown>;
        const eps = Array.isArray(endpoints.data) ? (endpoints.data as Array<Record<string, unknown>>) : [];
        const ourEndpoint = eps.find(e => typeof e.url === "string" && (e.url as string).includes("neverranked.com/stripe/webhook"));
        return new Response(JSON.stringify({
          stripe_secret_key_works: !endpoints.error,
          stripe_secret_key_error: endpoints.error || null,
          prices,
          webhook_endpoint_registered: !!ourEndpoint,
          webhook_endpoint: ourEndpoint ? {
            url: ourEndpoint.url,
            status: ourEndpoint.status,
            enabled_events: ourEndpoint.enabled_events,
          } : null,
          all_endpoints_count: eps.length,
          coupons_100_off,
          promo_codes_100_off,
        }, null, 2), { headers: { "content-type": "application/json" } });
      } catch (e: unknown) {
        return new Response(JSON.stringify({ error: "billing health check failed", detail: e instanceof Error ? e.message : String(e) }, null, 2), { status: 500, headers: { "content-type": "application/json" } });
      }
    }

    // Phase 4A diagnostic: trigger a fresh scan on a domain and return
    // the authority signals it produced. Useful for verifying the
    // trust-profile + author detection end-to-end without waiting for
    // the daily cron. Admin-only.
    const authorityVerifyMatch = path.match(/^\/admin\/authority-verify\/(\d+)$/);
    if (authorityVerifyMatch && method === "GET" && user.role === "admin") {
      try {
        const domainId = Number(authorityVerifyMatch[1]);
        const dom = await env.DB.prepare("SELECT * FROM domains WHERE id = ?").bind(domainId).first<{ id: number; domain: string; client_slug: string }>();
        if (!dom) return new Response(JSON.stringify({ error: "domain not found" }), { status: 404, headers: { "content-type": "application/json" } });
        const scanUrl = `https://${dom.domain}/`;
        const scan = await scanDomainImported(dom.id, scanUrl, "manual", env);
        const signals = scan ? JSON.parse(scan.signals_json || "{}") : null;
        const trust = await env.DB.prepare("SELECT platform, url, last_seen_at FROM trust_profiles WHERE client_slug = ? ORDER BY last_seen_at DESC").bind(dom.client_slug).all();
        const cov = await env.DB.prepare("SELECT * FROM author_coverage WHERE client_slug = ?").bind(dom.client_slug).first();
        return new Response(JSON.stringify({
          domain: dom.domain,
          client_slug: dom.client_slug,
          scan_error: scan?.error ?? null,
          signals_extracted: signals ? {
            trust_profile_links: signals.trust_profile_links ?? null,
            author_meta: signals.author_meta ?? null,
            has_person_schema: signals.has_person_schema ?? null,
          } : null,
          trust_profiles_after: trust.results,
          author_coverage_after: cov,
        }, null, 2), { headers: { "content-type": "application/json" } });
      } catch (e: unknown) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack || ""}` : String(e);
        return new Response(JSON.stringify({ error: "verify failed", detail: msg }, null, 2), { status: 500, headers: { "content-type": "application/json" } });
      }
    }
    // Prompt discovery: customer-accessible review surface for
    // AI-generated prompt suggestions awaiting one-click accept/dismiss.
    if (path === "/discover" || path === "/discover/") {
      if (user.client_slug) return redirect(`/discover/${user.client_slug}`);
      return renderClientPicker("Discover prompts", "discover", user, env);
    }
    const discoverGenMatch = path.match(/^\/discover\/([^/]+)\/generate$/);
    if (discoverGenMatch && method === "POST") {
      const { handleDiscoverGenerate } = await import("./routes/discover");
      return handleDiscoverGenerate(decodeURIComponent(discoverGenMatch[1]), user, env);
    }
    const discoverActionMatch = path.match(/^\/discover\/([^/]+)\/(\d+)\/(accept|dismiss)$/);
    if (discoverActionMatch && method === "POST") {
      const { handleDiscoverAction } = await import("./routes/discover");
      return handleDiscoverAction(
        decodeURIComponent(discoverActionMatch[1]),
        parseInt(discoverActionMatch[2], 10),
        discoverActionMatch[3] as "accept" | "dismiss",
        user, env,
      );
    }
    const discoverListMatch = path.match(/^\/discover\/([^/]+)$/);
    if (discoverListMatch && method === "GET") {
      const { handleDiscoverList } = await import("./routes/discover");
      return handleDiscoverList(decodeURIComponent(discoverListMatch[1]), user, env);
    }

    // AI referrer tracking ingest. Public endpoint hit by the inject
    // snippet from the customer's site when document.referrer is an AI
    // engine. Authenticated by snippet_token (looked up to slug). No CORS
    // restriction -- snippet fires from arbitrary customer origins.
    const refTrackMatch = path.match(/^\/track\/referral\/([a-f0-9]{16,32})$/);
    if (refTrackMatch && method === "POST") {
      const token = refTrackMatch[1];
      const lookup = await env.DB.prepare(
        "SELECT client_slug FROM injection_configs WHERE snippet_token = ? LIMIT 1",
      ).bind(token).first<{ client_slug: string }>();
      if (!lookup) {
        return new Response("", { status: 204, headers: { "access-control-allow-origin": "*" } });
      }
      let body: { h?: string; p?: string };
      try {
        body = await request.json() as { h?: string; p?: string };
      } catch {
        return new Response("", { status: 204, headers: { "access-control-allow-origin": "*" } });
      }
      const { classifyAiReferrer, logReferrerHit } = await import("./referrer-tracking");
      const engine = classifyAiReferrer(body.h ?? null);
      if (engine && body.h) {
        const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for");
        ctx.waitUntil(logReferrerHit(env, {
          clientSlug: lookup.client_slug,
          engine,
          referrerHost: body.h.toLowerCase().slice(0, 120),
          landingPath: body.p ?? null,
          ip,
        }));
      }
      // Always 204 so the beacon/sendBeacon caller doesn't surface errors.
      return new Response("", { status: 204, headers: { "access-control-allow-origin": "*" } });
    }

    // Bot analytics: /bots/:slug -- shows AI + search bot fetches
    // of the schema injection script for this client. Available to
    // anyone with canAccessClient on the slug (admin, agency, the
    // client themselves). The handler does its own access check.
    if ((path === "/bots" || path === "/bots/") && method === "GET") {
      if (user.client_slug) return redirect(`/bots/${user.client_slug}`);
      return renderClientPicker("Bot analytics", "bots", user, env);
    }
    const botsMatch = path.match(/^\/bots\/([a-z0-9_-]+)$/);
    if (botsMatch && method === "GET") {
      return handleBotAnalytics(botsMatch[1], user, env);
    }
    if (path === "/admin/engagement" && method === "GET" && user.role === "admin") {
      return handleEngagement(user, env);
    }
    if (path === "/admin/alerts/read-all" && method === "POST" && user.role === "admin") {
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare("UPDATE admin_alerts SET read_at = ? WHERE read_at IS NULL").bind(now).run();
      return redirect("/admin");
    }
    // Alert action: mark roadmap item done + dismiss alert
    const alertCompleteMatch = path.match(/^\/admin\/alert\/(\d+)\/complete$/);
    if (alertCompleteMatch && method === "POST" && user.role === "admin") {
      const alertId = Number(alertCompleteMatch[1]);
      const now = Math.floor(Date.now() / 1000);
      const alert = await env.DB.prepare("SELECT * FROM admin_alerts WHERE id = ?").bind(alertId).first<{ id: number; roadmap_item_id: number | null }>();
      if (alert) {
        const stmts = [
          env.DB.prepare("UPDATE admin_alerts SET read_at = ? WHERE id = ?").bind(now, alertId),
        ];
        if (alert.roadmap_item_id) {
          stmts.push(
            env.DB.prepare("UPDATE roadmap_items SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?").bind(now, now, alert.roadmap_item_id)
          );
        }
        await env.DB.batch(stmts);
      }
      return redirect("/admin");
    }
    // Alert action: dismiss (mark as read, no roadmap change)
    const alertDismissMatch = path.match(/^\/admin\/alert\/(\d+)\/dismiss$/);
    if (alertDismissMatch && method === "POST" && user.role === "admin") {
      const alertId = Number(alertDismissMatch[1]);
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare("UPDATE admin_alerts SET read_at = ? WHERE id = ?").bind(now, alertId).run();
      return redirect("/admin");
    }
    if (path === "/admin/domain" && method === "POST" && user.role === "admin") {
      return handleAddDomain(request, user, env);
    }
    if (path === "/admin/users" && method === "POST" && user.role === "admin") {
      return handleAddUser(request, user, env);
    }
    if (path === "/admin/client-settings" && method === "POST" && user.role === "admin") {
      return handleClientSettings(request, user, env);
    }
    const reset2faMatch = path.match(/^\/admin\/users\/(\d+)\/reset-2fa$/);
    if (reset2faMatch && method === "POST" && user.role === "admin") {
      return handleAdminReset2fa(Number(reset2faMatch[1]), user, env);
    }
    const resendOnboardingMatch = path.match(/^\/admin\/users\/(\d+)\/resend-onboarding$/);
    if (resendOnboardingMatch && method === "POST" && user.role === "admin") {
      return handleAdminResendOnboarding(Number(resendOnboardingMatch[1]), user, env);
    }
    const scanMatch = path.match(/^\/admin\/scan\/(\d+)$/);
    if (scanMatch && method === "POST" && user.role === "admin") {
      return handleManualScan(Number(scanMatch[1]), user, env);
    }
    const cronTestMatch = path.match(/^\/admin\/scan\/(\d+)\/as-cron$/);
    if (cronTestMatch && method === "POST" && user.role === "admin") {
      return handleCronTestScan(Number(cronTestMatch[1]), user, env);
    }
    const editMatch = path.match(/^\/admin\/suggestion\/(\d+)\/edit$/);
    if (editMatch && method === "POST" && user.role === "admin") {
      return handleEditSuggestion(Number(editMatch[1]), request, user, env);
    }
    const removeMatch = path.match(/^\/admin\/suggestion\/(\d+)\/remove$/);
    if (removeMatch && method === "POST" && user.role === "admin") {
      return handleRemoveSuggestion(Number(removeMatch[1]), user, env);
    }
    const reconcileMatch = path.match(/^\/admin\/agencies\/(\d+)\/reconcile$/);
    if (reconcileMatch && method === "POST" && user.role === "admin") {
      return handleReconcileAgency(Number(reconcileMatch[1]), user, env);
    }
    const trialResetMatch = path.match(/^\/admin\/agencies\/(\d+)\/trial-reset$/);
    if (trialResetMatch && method === "POST" && user.role === "admin") {
      return handleAdminTrialReset(Number(trialResetMatch[1]), env);
    }
    if (path === "/admin/automation/toggle" && method === "POST" && user.role === "admin") {
      return handleAutomationToggle(user, env);
    }
    // Manually fire the 7am morning summary on demand. Useful for
    // verifying the channel works without waiting for the cron, and
    // for re-sending after a code change.
    if (path === "/admin/morning-summary/send-now" && method === "GET" && user.role === "admin") {
      const { sendInboxMorningSummary } = await import("./admin-inbox");
      try {
        await sendInboxMorningSummary(env);
        return new Response(JSON.stringify({ ok: true, note: "Sent. Check ADMIN_EMAIL inbox." }, null, 2), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }, null, 2), {
          status: 500, headers: { "content-type": "application/json" },
        });
      }
    }
    if (path === "/admin/email-test" && method === "GET" && user.role === "admin") {
      return handleEmailTestGet(user, env, url);
    }
    if (path === "/admin/email-test" && method === "POST" && user.role === "admin") {
      return handleEmailTestPost(request, user, env);
    }
    if (path === "/admin/email-log" && method === "GET" && user.role === "admin") {
      return handleAdminEmailLogGet(user, env, url);
    }
    if (path === "/admin/nps" && method === "GET" && user.role === "admin") {
      return handleAdminNpsGet(user, env);
    }
    if (path === "/admin/exit" && method === "GET" && user.role === "admin") {
      return handleAdminExitGet(user, env);
    }
    if (path === "/admin/automation/digest" && method === "POST" && user.role === "admin") {
      return handleAutomationDigestToggle(user, env);
    }

    // Curated admin inbox (Day 11 brick 2)
    if (path === "/admin/inbox" && method === "GET" && user.role === "admin") {
      return handleInbox(user, env);
    }
    const inboxAgencyAppMatch = path.match(/^\/admin\/inbox\/agency-app\/(\d+)\/(approve|deny)$/);
    if (inboxAgencyAppMatch && method === "POST" && user.role === "admin") {
      return handleInboxAgencyAppAction(Number(inboxAgencyAppMatch[1]), inboxAgencyAppMatch[2] as "approve" | "deny", user, env);
    }
    const inboxSuggestionMatch = path.match(/^\/admin\/inbox\/suggestion\/(\d+)\/(approve|deny)$/);
    if (inboxSuggestionMatch && method === "POST" && user.role === "admin") {
      return handleInboxSuggestionAction(Number(inboxSuggestionMatch[1]), inboxSuggestionMatch[2] as "approve" | "deny", user, env);
    }
    const inboxAlertMatch = path.match(/^\/admin\/inbox\/alert\/(\d+)\/dismiss$/);
    if (inboxAlertMatch && method === "POST" && user.role === "admin") {
      return handleInboxAlertDismiss(Number(inboxAlertMatch[1]), user, env);
    }

    // Leads (admin only)
    if (path === "/admin/leads" && method === "GET" && user.role === "admin") {
      return handleLeads(user, env);
    }

    if (path === "/admin/free-check" && method === "GET" && user.role === "admin") {
      return handleAdminFreeCheckStats(user, env, url);
    }

    // Schema injection admin
    if ((path === "/admin/inject" || path === "/admin/inject/") && method === "GET" && user.role === "admin") {
      return renderClientPicker("Schema injection (admin)", "admin/inject", user, env);
    }
    const injectAdminMatch = path.match(/^\/admin\/inject\/([^/]+)$/);
    if (injectAdminMatch && method === "GET" && user.role === "admin") {
      return handleInjectAdmin(decodeURIComponent(injectAdminMatch[1]), user, env);
    }
    const injectConfigMatch = path.match(/^\/admin\/inject\/([^/]+)\/config$/);
    if (injectConfigMatch && method === "POST" && user.role === "admin") {
      return handleInjectConfig(decodeURIComponent(injectConfigMatch[1]), request, env);
    }
    const injectGenerateMatch = path.match(/^\/admin\/inject\/([^/]+)\/generate\/(\w+)$/);
    if (injectGenerateMatch && method === "POST" && user.role === "admin") {
      return handleInjectGenerate(decodeURIComponent(injectGenerateMatch[1]), injectGenerateMatch[2], env);
    }
    const injectApproveMatch = path.match(/^\/admin\/inject\/([^/]+)\/approve\/(\d+)$/);
    if (injectApproveMatch && method === "POST" && user.role === "admin") {
      return handleInjectApprove(decodeURIComponent(injectApproveMatch[1]), Number(injectApproveMatch[2]), env, request);
    }
    const injectPauseMatch = path.match(/^\/admin\/inject\/([^/]+)\/pause\/(\d+)$/);
    if (injectPauseMatch && method === "POST" && user.role === "admin") {
      return handleInjectPause(decodeURIComponent(injectPauseMatch[1]), Number(injectPauseMatch[2]), env);
    }
    const injectEditMatch = path.match(/^\/admin\/inject\/([^/]+)\/edit\/(\d+)$/);
    if (injectEditMatch && method === "POST" && user.role === "admin") {
      return handleInjectEdit(decodeURIComponent(injectEditMatch[1]), Number(injectEditMatch[2]), request, env);
    }
    const injectDeleteMatch = path.match(/^\/admin\/inject\/([^/]+)\/delete\/(\d+)$/);
    if (injectDeleteMatch && method === "POST" && user.role === "admin") {
      return handleInjectDelete(decodeURIComponent(injectDeleteMatch[1]), Number(injectDeleteMatch[2]), env);
    }
    const injectPublishMatch = path.match(/^\/admin\/inject\/([^/]+)\/publish$/);
    if (injectPublishMatch && method === "POST" && user.role === "admin") {
      return handleInjectPublish(decodeURIComponent(injectPublishMatch[1]), env);
    }

    // Share report
    const shareMatch = path.match(/^\/domain\/(\d+)\/share$/);
    if (shareMatch && method === "POST") {
      const { token } = await handleCreateShare(Number(shareMatch[1]), user.id, env);
      const shareUrl = `${url.origin}/report/${token}`;
      ctx.waitUntil(logEvent(env, { type: "report_shared", detail: { domainId: Number(shareMatch[1]) }, userId: user.id }));
      return redirect(`/domain/${shareMatch[1]}?shared=${encodeURIComponent(shareUrl)}`);
    }

    // Competitors
    if (path === "/competitors" || path === "/competitors/") {
      if (user.client_slug) return redirect(`/competitors/${user.client_slug}`);
      return renderClientPicker("Competitors", "competitors", user, env);
    }
    const compAddMatch = path.match(/^\/competitors\/([^/]+)\/add$/);
    if (compAddMatch && method === "POST") {
      return handleAddCompetitorFromPage(decodeURIComponent(compAddMatch[1]), request, user, env);
    }
    const compRemoveMatch = path.match(/^\/competitors\/([^/]+)\/remove$/);
    if (compRemoveMatch && method === "POST") {
      return handleRemoveCompetitorFromPage(decodeURIComponent(compRemoveMatch[1]), request, user, env);
    }
    const compReorderMatch = path.match(/^\/competitors\/([^/]+)\/reorder$/);
    if (compReorderMatch && method === "POST") {
      return handleReorderCompetitors(decodeURIComponent(compReorderMatch[1]), request, user, env);
    }
    const compMatch = path.match(/^\/competitors\/([^/]+)$/);
    if (compMatch) {
      const slug = decodeURIComponent(compMatch[1]);
      return handleCompetitors(slug, user, env);
    }

    // Industry benchmark (Phase 6A)
    if (path === "/benchmark" || path === "/benchmark/") {
      if (user.client_slug) return redirect(`/benchmark/${user.client_slug}`);
      return renderClientPicker("Industry benchmark", "benchmark", user, env);
    }
    const benchmarkMatch = path.match(/^\/benchmark\/([^/]+)$/);
    if (benchmarkMatch && method === "GET") {
      return handleBenchmark(decodeURIComponent(benchmarkMatch[1]), user, env);
    }
    // Phase 6A admin: trigger an immediate benchmark recompute
    // without waiting for the nightly cron.
    if (path === "/admin/benchmark-recompute" && method === "GET" && user.role === "admin") {
      const r = await recomputeIndustryBenchmarks(env);
      return new Response(JSON.stringify(r, null, 2), { headers: { "content-type": "application/json" } });
    }
    // Manually trigger the Hawaii Theatre Center upcoming-events
    // re-scrape without waiting for the daily cron.
    if (path === "/admin/htc-events-refresh" && method === "GET" && user.role === "admin") {
      const { refreshHawaiiTheatreEvents } = await import("./htc-events-cron");
      const r = await refreshHawaiiTheatreEvents(env);
      return new Response(JSON.stringify(r, null, 2), { headers: { "content-type": "application/json" } });
    }
    // Manual trigger for the roadmap reconciler. Runs against one
    // client when ?slug=... is supplied, otherwise across all clients
    // with approved schema_injections.
    if (path === "/admin/roadmap-reconcile" && method === "GET" && user.role === "admin") {
      const slug = url.searchParams.get("slug");
      const { reconcileAllRoadmaps, reconcileRoadmapForClient } = await import("./roadmap-reconciler");
      const r = slug
        ? { client: slug, ...(await reconcileRoadmapForClient(slug, env)) }
        : await reconcileAllRoadmaps(env);
      return new Response(JSON.stringify(r, null, 2), { headers: { "content-type": "application/json" } });
    }
    // Force-regenerate the roadmap for a client from their latest
    // scan. Use this when a client is missing items entirely (Phase
    // exists but no items) -- the reconciler will mark schema items
    // done in the same daily cycle, or via /admin/roadmap-reconcile.
    // GET-method shortcut for ad-hoc admin scans (the form-POST
    // version still works). Useful when triggering from other tools.
    const scanNowMatch = path.match(/^\/admin\/scan-now\/(\d+)$/);
    if (scanNowMatch && method === "GET" && user.role === "admin") {
      return handleManualScan(Number(scanNowMatch[1]), user, env);
    }
    if (path === "/admin/roadmap-regenerate" && method === "GET" && user.role === "admin") {
      const slug = url.searchParams.get("slug");
      if (!slug) return new Response(JSON.stringify({ error: "missing ?slug=" }, null, 2), {
        status: 400, headers: { "content-type": "application/json" }
      });
      const { regenerateRoadmap } = await import("./auto-provision");
      const r = await regenerateRoadmap(slug, env);
      return new Response(JSON.stringify({ client: slug, ...r }, null, 2), {
        headers: { "content-type": "application/json" }
      });
    }
    // Generate a FAQPage draft from a customer's page content.
    // Inserted as 'pending' so the customer reviews before live.
    if (path === "/admin/generate-faq" && method === "GET" && user.role === "admin") {
      const slug = url.searchParams.get("slug");
      const sourceUrl = url.searchParams.get("url");
      if (!slug || !sourceUrl) {
        return new Response(JSON.stringify({ error: "missing ?slug= and ?url=" }, null, 2), {
          status: 400, headers: { "content-type": "application/json" }
        });
      }
      const { generateFaqForPage } = await import("./faq-generator");
      const r = await generateFaqForPage(slug, sourceUrl, env);
      return new Response(JSON.stringify(r, null, 2), { headers: { "content-type": "application/json" } });
    }
    // Re-grade every schema_injection for a client. Useful as a
    // one-shot backfill when rows were inserted via raw SQL and
    // bypassed the grade path (e.g. the early Hawaii Theatre
    // Event deploys). Idempotent.
    // NVI report HTML preview. Renders the report template at the
    // current state of the data so we can iterate on the design and
    // see real numbers before wiring Cloudflare Browser Rendering for
    // the actual PDF. Same template will feed PDF generation later.
    const nviPreviewMatch = path.match(/^\/admin\/nvi\/preview\/(\d+)$/);
    if (nviPreviewMatch && method === "GET" && user.role === "admin") {
      const id = parseInt(nviPreviewMatch[1], 10);
      const { loadReportContext, buildNviReportHtml } = await import("./nvi/template");
      const ctx = await loadReportContext(env, id);
      if (!ctx) return new Response("Report not found", { status: 404 });
      const html = buildNviReportHtml(ctx);
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    // NVI inbox + actions
    if (path === "/admin/nvi" && method === "GET" && user.role === "admin") {
      const { handleNviInbox } = await import("./routes/admin-nvi");
      return handleNviInbox(user, env, url);
    }
    const nviApproveMatch = path.match(/^\/admin\/nvi\/approve\/(\d+)$/);
    if (nviApproveMatch && method === "POST" && user.role === "admin") {
      const { handleNviApprove } = await import("./routes/admin-nvi");
      return handleNviApprove(parseInt(nviApproveMatch[1], 10), user, env);
    }
    const nviRenderMatch = path.match(/^\/admin\/nvi\/render\/(\d+)$/);
    if (nviRenderMatch && method === "POST" && user.role === "admin") {
      const { handleNviRender } = await import("./routes/admin-nvi");
      return handleNviRender(parseInt(nviRenderMatch[1], 10), user, env);
    }
    const nviSendMatch = path.match(/^\/admin\/nvi\/send\/(\d+)$/);
    if (nviSendMatch && method === "POST" && user.role === "admin") {
      const { handleNviSend } = await import("./routes/admin-nvi");
      return handleNviSend(parseInt(nviSendMatch[1], 10), user, env);
    }
    const nviPdfMatch = path.match(/^\/admin\/nvi\/pdf\/(\d+)$/);
    if (nviPdfMatch && method === "GET" && user.role === "admin") {
      const { handleNviPdfDownload } = await import("./routes/admin-nvi");
      return handleNviPdfDownload(parseInt(nviPdfMatch[1], 10), user, env);
    }
    const nviRunMatch = path.match(/^\/admin\/nvi\/run\/([a-z0-9-]+)$/);
    if (nviRunMatch && method === "POST" && user.role === "admin") {
      const { handleNviRunNow } = await import("./routes/admin-nvi");
      return handleNviRunNow(nviRunMatch[1], user, env, ctx);
    }
    // GET form for the run-now endpoint (so admin can hit a URL
    // directly from the browser without needing a form submit).
    if (nviRunMatch && method === "GET" && user.role === "admin") {
      const { handleNviRunNow } = await import("./routes/admin-nvi");
      return handleNviRunNow(nviRunMatch[1], user, env, ctx);
    }

    // One-shot DataForSEO smoke test. Hits the AIO endpoint with one
    // keyword, returns the parsed result. Does NOT write to DB. Lets
    // an admin verify credentials + parsing without waiting for the
    // weekly cron. Costs ~$0.01 of DataForSEO credit per call.
    if (path === "/admin/dataforseo-test" && method === "GET" && user.role === "admin") {
      const keyword = url.searchParams.get("q") || "best honolulu theatre";
      const debug = url.searchParams.get("debug") === "1";
      if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
        return new Response(JSON.stringify({
          ok: false,
          reason: "DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set as Wrangler secrets"
        }, null, 2), { status: 500, headers: { "content-type": "application/json" } });
      }

      // Debug mode: hit DataForSEO directly + return the raw response
      // so we can see exactly what they're returning. Bypasses our
      // parser to isolate whether the issue is the request, the API,
      // or our parsing.
      if (debug) {
        const auth = "Basic " + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);
        const body = [{
          keyword,
          language_code: "en",
          location_code: 2840,
          device: "desktop",
          depth: 10,
          load_async_ai_overview: true,
        }];
        const resp = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
          method: "POST",
          headers: { "Authorization": auth, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const raw = await resp.text();
        let parsed: any = null;
        try { parsed = JSON.parse(raw); } catch { /* keep raw */ }
        const itemTypes = parsed?.tasks?.[0]?.result?.[0]?.item_types || [];
        const items = parsed?.tasks?.[0]?.result?.[0]?.items || [];
        const aioItem = items.find((it: any) => it?.type === "ai_overview");
        return new Response(JSON.stringify({
          http_status: resp.status,
          dfs_status_code: parsed?.status_code,
          dfs_status_message: parsed?.status_message,
          task_status_code: parsed?.tasks?.[0]?.status_code,
          task_status_message: parsed?.tasks?.[0]?.status_message,
          cost: parsed?.cost,
          item_types_returned: itemTypes,
          items_count: items.length,
          ai_overview_item_present: Boolean(aioItem),
          ai_overview_item_keys: aioItem ? Object.keys(aioItem) : [],
          ai_overview_item_preview: aioItem || null,
          first_few_items: items.slice(0, 3).map((it: any) => ({ type: it?.type, has_text: Boolean(it?.text), has_markdown: Boolean(it?.markdown) })),
        }, null, 2), { headers: { "content-type": "application/json" } });
      }

      try {
        const { queryGoogleAIO } = await import("./citations-google-aio");
        const result = await queryGoogleAIO(keyword, env);
        return new Response(JSON.stringify({
          ok: true,
          keyword,
          aio_present: result.text.length > 0 || result.urls.length > 0,
          text_preview: result.text.slice(0, 400),
          text_length: result.text.length,
          url_count: result.urls.length,
          urls: result.urls.slice(0, 8),
          entity_count: result.entities.length,
          entities: result.entities.slice(0, 8),
          note: result.text.length === 0 && result.urls.length === 0
            ? "No AIO rendered for this query. Re-run with &debug=1 to see the raw DataForSEO response and confirm whether the issue is upstream (no AIO returned) or our parser."
            : "AIO data parsed successfully. Integration is working.",
        }, null, 2), { headers: { "content-type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false,
          reason: `${e}`,
        }, null, 2), { status: 500, headers: { "content-type": "application/json" } });
      }
    }

    if (path === "/admin/regrade-all" && method === "GET" && user.role === "admin") {
      const slug = url.searchParams.get("slug");
      if (!slug) return new Response(JSON.stringify({ error: "missing ?slug=" }, null, 2), {
        status: 400, headers: { "content-type": "application/json" }
      });
      const { gradeSchema } = await import("../../packages/aeo-analyzer/src/schema-grader");
      const rows = (await env.DB.prepare(
        "SELECT id, schema_type, json_ld FROM schema_injections WHERE client_slug = ?"
      ).bind(slug).all<{ id: number; schema_type: string; json_ld: string }>()).results;
      const summary: Array<{ id: number; schema_type: string; score: number }> = [];
      const now = Math.floor(Date.now() / 1000);
      for (const r of rows) {
        const grade = gradeSchema(r.json_ld);
        await env.DB.prepare(
          "UPDATE schema_injections SET quality_score = ?, quality_issues = ?, quality_graded_at = ? WHERE id = ?"
        ).bind(grade.score, JSON.stringify(grade.issues), now, r.id).run();
        summary.push({ id: r.id, schema_type: r.schema_type, score: grade.score });
      }
      return new Response(JSON.stringify({ slug, regraded: summary.length, rows: summary }, null, 2), {
        headers: { "content-type": "application/json" }
      });
    }
    // Generate BreadcrumbList drafts from a customer's homepage
    // navigation. One breadcrumb per top-level section, derived
    // deterministically from the page HTML (no LLM cost). All
    // inserts are 'pending' for review.
    if (path === "/admin/generate-breadcrumbs" && method === "GET" && user.role === "admin") {
      const slug = url.searchParams.get("slug");
      const homepageUrl = url.searchParams.get("url");
      if (!slug || !homepageUrl) {
        return new Response(JSON.stringify({ error: "missing ?slug= and ?url=" }, null, 2), {
          status: 400, headers: { "content-type": "application/json" }
        });
      }
      const { generateBreadcrumbsForSite } = await import("./breadcrumb-generator");
      const r = await generateBreadcrumbsForSite(slug, homepageUrl, env);
      return new Response(JSON.stringify(r, null, 2), { headers: { "content-type": "application/json" } });
    }
    // Generate Article schemas from a sitemap. Discovers article-
    // like URLs (paths matching /blog/, /news/, /YYYY/MM/, etc.),
    // fetches each, extracts metadata, and inserts as 'pending'
    // for review. No auto-trigger -- run manually for blog-heavy
    // clients via this endpoint.
    // Generate Person schemas from a customer's About/Team/Leadership
    // page. Pulls named individuals + links them to a verifiable
    // identity hook (LinkedIn, bio page). Inserted as 'pending' for
    // review before live -- people are factual claims that could
    // embarrass us if wrong.
    if (path === "/admin/generate-people" && method === "GET" && user.role === "admin") {
      const slug = url.searchParams.get("slug");
      const sourceUrl = url.searchParams.get("url");
      if (!slug || !sourceUrl) {
        return new Response(JSON.stringify({ error: "missing ?slug= and ?url=" }, null, 2), {
          status: 400, headers: { "content-type": "application/json" }
        });
      }
      const { generatePersonsForPage } = await import("./person-generator");
      const r = await generatePersonsForPage(slug, sourceUrl, env);
      return new Response(JSON.stringify(r, null, 2), { headers: { "content-type": "application/json" } });
    }
    if (path === "/admin/generate-articles" && method === "GET" && user.role === "admin") {
      const slug = url.searchParams.get("slug");
      const sitemapUrl = url.searchParams.get("sitemap");
      if (!slug || !sitemapUrl) {
        return new Response(JSON.stringify({ error: "missing ?slug= and ?sitemap=" }, null, 2), {
          status: 400, headers: { "content-type": "application/json" }
        });
      }
      const { generateArticlesFromSitemap } = await import("./article-generator");
      const r = await generateArticlesFromSitemap(slug, sitemapUrl, env);
      return new Response(JSON.stringify(r, null, 2), { headers: { "content-type": "application/json" } });
    }
    // HowTo generator: extract a step-by-step procedure from one page.
    if (path === "/admin/generate-howto" && method === "GET" && user.role === "admin") {
      const slug = url.searchParams.get("slug");
      const sourceUrl = url.searchParams.get("url");
      if (!slug || !sourceUrl) {
        return new Response(JSON.stringify({ error: "missing ?slug= and ?url=" }, null, 2), {
          status: 400, headers: { "content-type": "application/json" }
        });
      }
      const { generateHowToForPage } = await import("./howto-generator");
      const r = await generateHowToForPage(slug, sourceUrl, env);
      return new Response(JSON.stringify(r, null, 2), { headers: { "content-type": "application/json" } });
    }
    // Service generator: extract distinct services from a services page.
    if (path === "/admin/generate-services" && method === "GET" && user.role === "admin") {
      const slug = url.searchParams.get("slug");
      const sourceUrl = url.searchParams.get("url");
      if (!slug || !sourceUrl) {
        return new Response(JSON.stringify({ error: "missing ?slug= and ?url=" }, null, 2), {
          status: 400, headers: { "content-type": "application/json" }
        });
      }
      const { generateServicesForPage } = await import("./service-generator");
      const r = await generateServicesForPage(slug, sourceUrl, env);
      return new Response(JSON.stringify(r, null, 2), { headers: { "content-type": "application/json" } });
    }
    // llms.txt generator: returns the suggested llms.txt body for a client.
    // Customer copies it into the root of their site (next to robots.txt).
    if (path === "/admin/llms-txt" && method === "GET" && user.role === "admin") {
      const slug = url.searchParams.get("slug");
      if (!slug) {
        return new Response(JSON.stringify({ error: "missing ?slug=" }, null, 2), {
          status: 400, headers: { "content-type": "application/json" }
        });
      }
      const { generateLlmsTxt } = await import("./llms-txt-generator");
      const r = await generateLlmsTxt(slug, env);
      if (!r.ok) {
        return new Response(JSON.stringify(r, null, 2), {
          status: 400, headers: { "content-type": "application/json" }
        });
      }
      // Plain text so the customer can save the response body directly.
      return new Response(r.content!, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-page-count": String(r.pageCount ?? 0),
        }
      });
    }

    // Reddit presence (Phase 5)
    if (path === "/reddit" || path === "/reddit/") {
      if (user.client_slug) return redirect(`/reddit/${user.client_slug}`);
      return renderClientPicker("Reddit presence", "reddit", user, env);
    }
    // Phase 5B: brief routes -- must come BEFORE the general /reddit/<slug>
    // matcher so /reddit/<slug>/brief and /reddit/<slug>/brief/<id> resolve.
    const briefGenMatch = path.match(/^\/reddit\/([^/]+)\/brief$/);
    if (briefGenMatch && method === "POST") {
      return handleBriefGenerate(decodeURIComponent(briefGenMatch[1]), user, env, request);
    }
    const briefViewMatch = path.match(/^\/reddit\/([^/]+)\/brief\/(\d+)$/);
    if (briefViewMatch && method === "GET") {
      return handleBriefView(decodeURIComponent(briefViewMatch[1]), parseInt(briefViewMatch[2], 10), user, env);
    }
    const redditMatch = path.match(/^\/reddit\/([^/]+)$/);
    if (redditMatch && method === "GET") {
      return handleReddit(decodeURIComponent(redditMatch[1]), user, env);
    }
    // Phase 5 admin: backfill reddit_citations from historical
    // citation_runs (one-shot, called once per client after first
    // deploy). Idempotent.
    const redditBackfillMatch = path.match(/^\/admin\/reddit-backfill\/([^/]+)$/);
    if (redditBackfillMatch && method === "GET" && user.role === "admin") {
      const slug = decodeURIComponent(redditBackfillMatch[1]);
      const result = await backfillRedditCitations(slug, 90, env);
      const added = await maybeAddRedditRoadmapItems(slug, env);
      return new Response(JSON.stringify({ slug, ...result, roadmap_items_added: added }, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    // Dry-run: exercises the Reddit thread fetcher against any thread URL
    // and returns the parsed snapshot as JSON. Confirms whether Cloudflare
    // Workers can reach Reddit at all (Reddit sometimes throttles or blocks
    // CF shared egress IPs). Hit this once with a known thread URL before
    // relying on the brief generator for real Amplify clients.
    if (path === "/admin/reddit-fetch-test" && method === "GET" && user.role === "admin") {
      const threadUrl = url.searchParams.get("url") || "";
      if (!/^https?:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/comments\/[^/]+/i.test(threadUrl)) {
        return new Response(JSON.stringify({ error: "missing_or_invalid_url", hint: "?url=https://www.reddit.com/r/<sub>/comments/<id>/..." }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      try {
        const { fetchRedditThread } = await import("./reddit-briefs");
        const snapshot = await fetchRedditThread(threadUrl);
        return new Response(JSON.stringify({ ok: true, snapshot }, null, 2), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2), {
          status: 502, headers: { "content-type": "application/json" },
        });
      }
    }

    // Admin: manually backfill sentiment scoring for one client. Daily
    // cron handles 100 unscored runs per pass automatically -- this is
    // for forcing a complete catch-up on demand. ?days=N controls window
    // (default 90).
    const sentimentBackfillMatch = path.match(/^\/admin\/sentiment-backfill\/([^/]+)$/);
    if (sentimentBackfillMatch && method === "GET" && user.role === "admin") {
      const slug = decodeURIComponent(sentimentBackfillMatch[1]);
      const days = parseInt(url.searchParams.get("days") || "90", 10);
      const { backfillSentimentForClient } = await import("./sentiment-scorer");
      const result = await backfillSentimentForClient(env, slug, days);
      return new Response(JSON.stringify({ slug, days, ...result }, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    // Conversation-depth backfill: same shape as sentiment-backfill above.
    // /admin/depth-backfill/<slug>?days=90 drains all unscored client-cited
    // runs for that slug right now instead of waiting for the daily cron.
    // Useful after shipping the depth migration (which scores rows from
    // scratch) or when re-prompting the model with an updated SYSTEM
    // prompt.
    const depthBackfillMatch = path.match(/^\/admin\/depth-backfill\/([^/]+)$/);
    if (depthBackfillMatch && method === "GET" && user.role === "admin") {
      const slug = decodeURIComponent(depthBackfillMatch[1]);
      const days = parseInt(url.searchParams.get("days") || "90", 10);
      const { backfillDepthForClient } = await import("./conversation-depth");
      const result = await backfillDepthForClient(env, slug, days);
      return new Response(JSON.stringify({ slug, days, ...result }, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    // Conversation-depth stats viewer. Returns formatted HTML if the
    // browser asked for HTML, else JSON for programmatic access. The
    // HTML view is the operator-facing rendering of what the depth
    // scorer produces -- framing distribution, competitive position,
    // prominence class, top competitors named, and a sample of the
    // most recent scored runs with the AI's actual phrasing.
    const depthStatsMatch = path.match(/^\/admin\/depth-stats\/([^/]+)$/);
    if (depthStatsMatch && method === "GET" && user.role === "admin") {
      const slug = decodeURIComponent(depthStatsMatch[1]);
      const days = parseInt(url.searchParams.get("days") || "90", 10);
      const wantsJson = url.searchParams.get("format") === "json"
        || (request.headers.get("accept") || "").includes("application/json");
      const { getDepthRollup } = await import("./conversation-depth");
      const rollup = await getDepthRollup(env, slug, days);
      const recent = (await env.DB.prepare(
        `SELECT cr.engine, cr.run_at, cr.framing, cr.framing_phrase,
                cr.competitive_position, cr.prominence_class,
                cr.competitors_mentioned, cr.depth_reason, ck.keyword
           FROM citation_runs cr
           JOIN citation_keywords ck ON ck.id = cr.keyword_id
          WHERE ck.client_slug = ?
            AND cr.client_cited = 1
            AND cr.framing IS NOT NULL
          ORDER BY cr.run_at DESC LIMIT 20`,
      ).bind(slug).all()).results as Array<{
        engine: string; run_at: number; framing: string; framing_phrase: string;
        competitive_position: string; prominence_class: string;
        competitors_mentioned: string; depth_reason: string; keyword: string;
      }>;

      if (wantsJson) {
        return new Response(JSON.stringify({ slug, days, rollup, recent }, null, 2), {
          headers: { "content-type": "application/json" },
        });
      }

      // ---- HTML viewer ----
      const escHtml = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
      }[c]!));

      const ENGINE_LABEL: Record<string, string> = {
        openai: "ChatGPT", anthropic: "Claude", perplexity: "Perplexity",
        gemini: "Gemini", google_ai_overview: "Google AIO", bing: "Microsoft Copilot",
      };

      const total = rollup.total || 0;
      const pct = (n: number) => total ? Math.round((n / total) * 100) : 0;

      const framingBars = Object.entries(rollup.by_framing)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `<tr><td>${escHtml(k)}</td><td style="text-align:right">${n}</td><td style="text-align:right;color:#888">${pct(n)}%</td></tr>`)
        .join("");

      const positionBars = Object.entries(rollup.by_position)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `<tr><td>${escHtml(k)}</td><td style="text-align:right">${n}</td><td style="text-align:right;color:#888">${pct(n)}%</td></tr>`)
        .join("");

      const prominenceBars = Object.entries(rollup.by_prominence)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `<tr><td>${escHtml(k)}</td><td style="text-align:right">${n}</td><td style="text-align:right;color:#888">${pct(n)}%</td></tr>`)
        .join("");

      const competitorsList = rollup.top_competitors.length
        ? rollup.top_competitors.map((c) =>
            `<tr><td>${escHtml(c.name)}</td><td style="text-align:right">${c.count}</td></tr>`,
          ).join("")
        : `<tr><td colspan="2" style="color:#888">(none)</td></tr>`;

      const recentRows = recent.length
        ? recent.map((r) => {
            let comps: string[] = [];
            try { comps = JSON.parse(r.competitors_mentioned || "[]"); } catch {}
            const dt = new Date(r.run_at * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
            return `<tr>
              <td style="color:#888;font-size:11px;white-space:nowrap">${dt}</td>
              <td>${escHtml(ENGINE_LABEL[r.engine] || r.engine)}</td>
              <td><b>${escHtml(r.framing)}</b><br><span style="color:#888;font-size:11px;font-style:italic">${escHtml(r.framing_phrase || "(no phrase)")}</span></td>
              <td>${escHtml(r.competitive_position)}<br><span style="color:#888;font-size:11px">${escHtml(r.prominence_class)}</span></td>
              <td style="font-size:11px">${comps.length ? comps.map(escHtml).join(", ") : "<span style=\"color:#888\">(none)</span>"}</td>
              <td style="font-size:11px;color:#aaa">${escHtml(r.depth_reason || "")}</td>
            </tr>`;
          }).join("")
        : `<tr><td colspan="6" style="color:#888;text-align:center;padding:24px">No depth-scored runs yet. The daily cron at 17:00 UTC will drain the backlog.</td></tr>`;

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Depth: ${escHtml(slug)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0c0c0c; color: #e8e6df; margin: 0; padding: 24px; }
  h1 { font-weight: 500; letter-spacing: -0.02em; margin: 0 0 4px; }
  .meta { color: #888; font-size: 12px; margin-bottom: 32px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-bottom: 32px; }
  .card { background: rgba(255,255,255,.02); border: 1px solid #222; border-radius: 6px; padding: 18px 20px; }
  .card h2 { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #c9a84c; margin: 0 0 12px; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 6px 8px; border-bottom: 1px solid #1a1a1a; vertical-align: top; }
  th { padding: 8px; text-align: left; font-weight: 500; color: #888; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; border-bottom: 1px solid #2a2a2a; }
  .total { color: #c9a84c; font-size: 24px; font-weight: 500; }
  .recent table { font-size: 12px; }
</style></head><body>
<h1>Conversation depth: ${escHtml(slug)}</h1>
<div class="meta">last ${days} days · ${total} client-cited runs scored · <a style="color:#c9a84c" href="/admin/depth-backfill/${escHtml(slug)}?days=${days}">force backfill now</a> · <a style="color:#c9a84c" href="/admin/depth-stats/${escHtml(slug)}?format=json&days=${days}">JSON</a></div>

<div class="grid">
  <div class="card">
    <h2>Framing</h2>
    <table>${framingBars || `<tr><td colspan="3" style="color:#888">No data yet</td></tr>`}</table>
  </div>
  <div class="card">
    <h2>Competitive position</h2>
    <table>${positionBars || `<tr><td colspan="3" style="color:#888">No data yet</td></tr>`}</table>
  </div>
  <div class="card">
    <h2>Prominence</h2>
    <table>${prominenceBars || `<tr><td colspan="3" style="color:#888">No data yet</td></tr>`}</table>
  </div>
  <div class="card">
    <h2>Top competitors named alongside</h2>
    <table>${competitorsList}</table>
  </div>
</div>

<div class="card recent">
  <h2>Recent scored runs (latest 20)</h2>
  <table>
    <thead><tr><th>When</th><th>Engine</th><th>Framing / Phrase</th><th>Position / Prominence</th><th>Competitors</th><th>Why</th></tr></thead>
    <tbody>${recentRows}</tbody>
  </table>
</div>
</body></html>`;

      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // Dry-run: returns what the Gemini coverage report email WOULD say
    // right now. Doesn't send, doesn't mark the flag. Safe to hit any
    // time -- both before May 12 (preview the format) and after (re-run
    // the query to see fresh numbers).
    if (path === "/admin/gemini-coverage-preview" && method === "GET" && user.role === "admin") {
      const { previewGeminiCoverage } = await import("./gemini-coverage-report");
      const preview = await previewGeminiCoverage(env);
      return new Response(JSON.stringify(preview, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    // Phase 5B prep: resolve Gemini grounding-redirect URLs in historical
    // citation_runs.cited_urls. After resolution, re-runs reddit
    // extraction so any reddit threads hidden behind opaque tokens get
    // surfaced. Idempotent: already-resolved URLs pass through unchanged.
    // ?days=N (default 90) controls the lookback window.
    const geminiResolveMatch = path.match(/^\/admin\/gemini-resolve\/([^/]+)$/);
    if (geminiResolveMatch && method === "GET" && user.role === "admin") {
      const slug = decodeURIComponent(geminiResolveMatch[1]);
      const days = parseInt(url.searchParams.get("days") || "90", 10);
      const { resolveGroundingUrls, isGroundingRedirect } = await import("./gemini-resolver");
      const since = Math.floor(Date.now() / 1000) - days * 86400;
      const runs = (await env.DB.prepare(
        `SELECT cr.id, cr.cited_urls
           FROM citation_runs cr
           JOIN citation_keywords ck ON ck.id = cr.keyword_id
           WHERE ck.client_slug = ? AND cr.engine = 'gemini' AND cr.run_at >= ?`
      ).bind(slug, since).all<{ id: number; cited_urls: string }>()).results;

      let runsScanned = 0;
      let runsUpdated = 0;
      let urlsResolved = 0;
      for (const r of runs) {
        runsScanned++;
        let raw: unknown = [];
        try { raw = JSON.parse(r.cited_urls || "[]"); } catch { continue; }
        if (!Array.isArray(raw)) continue;
        const before = (raw as unknown[]).filter((u): u is string => typeof u === "string");
        const hasRedirect = before.some(isGroundingRedirect);
        if (!hasRedirect) continue;
        const after = await resolveGroundingUrls(before);
        const changed = after.some((u, i) => u !== before[i]);
        if (!changed) continue;
        urlsResolved += after.filter((u, i) => u !== before[i]).length;
        await env.DB.prepare(
          "UPDATE citation_runs SET cited_urls = ? WHERE id = ?"
        ).bind(JSON.stringify(after), r.id).run();
        runsUpdated++;
      }

      // Re-run reddit extraction so any newly-visible reddit URLs get
      // ingested into reddit_citations + roadmap.
      const reddit = await backfillRedditCitations(slug, days, env);
      const roadmapAdded = await maybeAddRedditRoadmapItems(slug, env);

      return new Response(JSON.stringify({
        slug, days, runsScanned, runsUpdated, urlsResolved,
        reddit_backfill: reddit, reddit_roadmap_items_added: roadmapAdded,
      }, null, 2), { headers: { "content-type": "application/json" } });
    }

    // Trust / authority signals (Phase 4A)
    if (path === "/trust" || path === "/trust/") {
      if (user.client_slug) return redirect(`/trust/${user.client_slug}`);
      return renderClientPicker("Authority signals", "trust", user, env);
    }
    const trustMatch = path.match(/^\/trust\/([^/]+)$/);
    if (trustMatch && method === "GET") {
      return handleTrust(decodeURIComponent(trustMatch[1]), user, env);
    }

    // Roadmap
    if (path === "/roadmap" || path === "/roadmap/") {
      if (user.client_slug) return redirect(`/roadmap/${user.client_slug}`);
      return renderClientPicker("Roadmap", "roadmap", user, env);
    }
    const roadmapMatch = path.match(/^\/roadmap\/([^/]+)$/);
    if (roadmapMatch && method === "GET") {
      return handleRoadmap(decodeURIComponent(roadmapMatch[1]), user, env, url);
    }
    const roadmapAddMatch = path.match(/^\/roadmap\/([^/]+)\/add$/);
    if (roadmapAddMatch && method === "POST" && user.role === "admin") {
      return handleAddRoadmapItem(decodeURIComponent(roadmapAddMatch[1]), request, user, env);
    }
    const roadmapUpdateMatch = path.match(/^\/roadmap\/([^/]+)\/update\/(\d+)$/);
    if (roadmapUpdateMatch && method === "POST") {
      return handleUpdateRoadmapItem(decodeURIComponent(roadmapUpdateMatch[1]), Number(roadmapUpdateMatch[2]), request, user, env);
    }
    const roadmapRegenMatch = path.match(/^\/roadmap\/([^/]+)\/regenerate$/);
    if (roadmapRegenMatch && method === "POST" && user.role === "admin") {
      return handleRegenerateRoadmap(decodeURIComponent(roadmapRegenMatch[1]), user, env);
    }
    const roadmapRefreshMatch = path.match(/^\/roadmap\/([^/]+)\/refresh$/);
    if (roadmapRefreshMatch && method === "POST") {
      return handleRefreshRoadmap(decodeURIComponent(roadmapRefreshMatch[1]), user, env);
    }
    const roadmapBulkStartMatch = path.match(/^\/roadmap\/([^/]+)\/bulk-start$/);
    if (roadmapBulkStartMatch && method === "POST" && user.role === "admin") {
      return handleBulkStartItems(decodeURIComponent(roadmapBulkStartMatch[1]), user, env);
    }
    const phaseAddMatch = path.match(/^\/roadmap\/([^/]+)\/add-phase$/);
    if (phaseAddMatch && method === "POST" && user.role === "admin") {
      return handleAddPhase(decodeURIComponent(phaseAddMatch[1]), request, user, env);
    }

    // ---------- Voice (writing samples + fingerprint) ----------
    if ((path === "/voice" || path === "/voice/") && method === "GET") {
      if (user.client_slug) return redirect(`/voice/${user.client_slug}`);
      return renderClientPicker("Voice", "voice", user, env);
    }
    const voiceMatch = path.match(/^\/voice\/([^/]+?)\/?$/);
    if (voiceMatch && method === "GET") {
      return handleVoicePage(decodeURIComponent(voiceMatch[1]), user, env, url);
    }
    const voiceSampleCreateMatch = path.match(/^\/voice\/([^/]+)\/sample$/);
    if (voiceSampleCreateMatch && method === "POST") {
      return handleVoiceSampleCreate(decodeURIComponent(voiceSampleCreateMatch[1]), request, user, env);
    }
    const voiceBuildMatch = path.match(/^\/voice\/([^/]+)\/build$/);
    if (voiceBuildMatch && method === "POST") {
      return handleVoiceBuildProfile(decodeURIComponent(voiceBuildMatch[1]), user, env);
    }
    const voiceSampleDeleteMatch = path.match(/^\/voice\/([^/]+)\/sample\/(\d+)\/delete$/);
    if (voiceSampleDeleteMatch && method === "POST") {
      return handleVoiceSampleDelete(decodeURIComponent(voiceSampleDeleteMatch[1]), Number(voiceSampleDeleteMatch[2]), user, env);
    }

    // ---------- Drafts (content drafting + editor + export) ----------
    if ((path === "/drafts" || path === "/drafts/") && method === "GET") {
      if (user.client_slug) return redirect(`/drafts/${user.client_slug}`);
      return renderClientPicker("Drafts", "drafts", user, env);
    }
    const draftsListMatch = path.match(/^\/drafts\/([^/]+?)\/?$/);
    if (draftsListMatch && method === "GET") {
      return handleDraftsList(decodeURIComponent(draftsListMatch[1]), user, env);
    }
    const draftsNewMatch = path.match(/^\/drafts\/([^/]+)\/new$/);
    if (draftsNewMatch && method === "POST") {
      return handleDraftCreate(decodeURIComponent(draftsNewMatch[1]), request, user, env);
    }
    const draftsNewGenMatch = path.match(/^\/drafts\/([^/]+)\/new-generated$/);
    if (draftsNewGenMatch && method === "POST") {
      return handleDraftCreateAndGenerate(decodeURIComponent(draftsNewGenMatch[1]), request, user, env);
    }
    const draftGenerateMatch = path.match(/^\/drafts\/([^/]+)\/(\d+)\/generate$/);
    if (draftGenerateMatch && method === "POST") {
      return handleDraftGenerate(decodeURIComponent(draftGenerateMatch[1]), Number(draftGenerateMatch[2]), request, user, env);
    }
    const draftRevertMatch = path.match(/^\/drafts\/([^/]+)\/(\d+)\/revert\/(\d+)$/);
    if (draftRevertMatch && method === "POST") {
      return handleDraftRevert(decodeURIComponent(draftRevertMatch[1]), Number(draftRevertMatch[2]), Number(draftRevertMatch[3]), user, env);
    }
    const draftDownloadMatch = path.match(/^\/drafts\/([^/]+)\/(\d+)\/download\.(md|html)$/);
    if (draftDownloadMatch && method === "GET") {
      return handleDraftDownload(decodeURIComponent(draftDownloadMatch[1]), Number(draftDownloadMatch[2]), draftDownloadMatch[3] as "md" | "html", user, env);
    }
    const draftSaveMatch = path.match(/^\/drafts\/([^/]+)\/(\d+)\/save$/);
    if (draftSaveMatch && method === "POST") {
      return handleDraftSave(decodeURIComponent(draftSaveMatch[1]), Number(draftSaveMatch[2]), request, user, env);
    }
    const draftStatusMatch = path.match(/^\/drafts\/([^/]+)\/(\d+)\/status$/);
    if (draftStatusMatch && method === "POST") {
      return handleDraftStatus(decodeURIComponent(draftStatusMatch[1]), Number(draftStatusMatch[2]), request, user, env);
    }
    const draftPublishMatch = path.match(/^\/drafts\/([^/]+)\/(\d+)\/publish$/);
    if (draftPublishMatch && method === "POST") {
      return handleDraftPublish(decodeURIComponent(draftPublishMatch[1]), Number(draftPublishMatch[2]), user, env);
    }
    const draftDeleteMatch = path.match(/^\/drafts\/([^/]+)\/(\d+)\/delete$/);
    if (draftDeleteMatch && method === "POST") {
      return handleDraftDelete(decodeURIComponent(draftDeleteMatch[1]), Number(draftDeleteMatch[2]), user, env);
    }
    const draftDetailMatch = path.match(/^\/drafts\/([^/]+)\/(\d+)$/);
    if (draftDetailMatch && method === "GET") {
      return handleDraftDetail(decodeURIComponent(draftDetailMatch[1]), Number(draftDetailMatch[2]), user, env, url);
    }

    // ---------- Content calendar + publishing settings ----------
    if ((path === "/calendar" || path === "/calendar/") && method === "GET") {
      if (user.client_slug) return redirect(`/calendar/${user.client_slug}`);
      return renderClientPicker("Calendar", "calendar", user, env);
    }
    const calendarMatch = path.match(/^\/calendar\/([^/]+?)\/?$/);
    if (calendarMatch && method === "GET") {
      return handleCalendarGet(decodeURIComponent(calendarMatch[1]), user, env);
    }
    const calendarAddMatch = path.match(/^\/calendar\/([^/]+)\/add$/);
    if (calendarAddMatch && method === "POST") {
      return handleCalendarAdd(decodeURIComponent(calendarAddMatch[1]), request, user, env);
    }
    const calendarSkipMatch = path.match(/^\/calendar\/([^/]+)\/skip\/(\d+)$/);
    if (calendarSkipMatch && method === "POST") {
      return handleCalendarSkip(decodeURIComponent(calendarSkipMatch[1]), Number(calendarSkipMatch[2]), user, env);
    }

    if ((path === "/publishing" || path === "/publishing/") && method === "GET") {
      if (user.client_slug) return redirect(`/publishing/${user.client_slug}`);
      return renderClientPicker("Publishing", "publishing", user, env);
    }
    const pubGetMatch = path.match(/^\/publishing\/([^/]+?)\/?$/);
    if (pubGetMatch && method === "GET") {
      return handlePublishingGet(decodeURIComponent(pubGetMatch[1]), user, env);
    }
    const pubSaveMatch = path.match(/^\/publishing\/([^/]+)\/save$/);
    if (pubSaveMatch && method === "POST") {
      return handlePublishingSave(decodeURIComponent(pubSaveMatch[1]), request, user, env);
    }
    const pubTestMatch = path.match(/^\/publishing\/([^/]+)\/test$/);
    if (pubTestMatch && method === "POST") {
      return handlePublishingTest(decodeURIComponent(pubTestMatch[1]), user, env);
    }
    const pubDeleteMatch = path.match(/^\/publishing\/([^/]+)\/delete$/);
    if (pubDeleteMatch && method === "POST") {
      return handlePublishingDelete(decodeURIComponent(pubDeleteMatch[1]), user, env);
    }
    const pubRestrictionsMatch = path.match(/^\/publishing\/([^/]+)\/restrictions$/);
    if (pubRestrictionsMatch && method === "POST") {
      return handlePublishingRestrictions(decodeURIComponent(pubRestrictionsMatch[1]), request, user, env);
    }
    const pubUnpauseMatch = path.match(/^\/publishing\/([^/]+)\/unpause$/);
    if (pubUnpauseMatch && method === "POST") {
      return handlePublishingUnpause(decodeURIComponent(pubUnpauseMatch[1]), user, env);
    }

    // ---------- Ops content review queue (admin only) ----------
    if (path === "/admin/content-review" && method === "GET" && user.role === "admin") {
      return handleContentReviewList(user, env);
    }
    const reviewClearMatch = path.match(/^\/admin\/content-review\/(\d+)\/clear$/);
    if (reviewClearMatch && method === "POST" && user.role === "admin") {
      return handleContentReviewClear(Number(reviewClearMatch[1]), user, env);
    }

    // Citations -- redirect or pick client
    if ((path === "/citations" || path === "/citations/") && method === "GET") {
      if (user.client_slug) return redirect(`/citations/${user.client_slug}`);
      return renderClientPicker("Citations", "citations", user, env);
    }
    // Citations -- client view
    const citationsMatch = path.match(/^\/citations\/([^/]+?)\/?$/);
    if (citationsMatch && method === "GET") {
      return handleCitations(decodeURIComponent(citationsMatch[1]), user, env);
    }

    // Citations -- admin keyword management
    if ((path === "/admin/citations" || path === "/admin/citations/") && method === "GET" && user.role === "admin") {
      return renderClientPicker("Keyword management (admin)", "admin/citations", user, env);
    }
    const citationsAdminMatch = path.match(/^\/admin\/citations\/([^/]+?)\/?$/);
    if (citationsAdminMatch && method === "GET" && user.role === "admin") {
      return handleAdminCitations(decodeURIComponent(citationsAdminMatch[1]), user, env, url);
    }
    const citationsAddMatch = path.match(/^\/admin\/citations\/([^/]+)\/add$/);
    if (citationsAddMatch && method === "POST" && user.role === "admin") {
      return handleAddKeyword(decodeURIComponent(citationsAddMatch[1]), request, env);
    }
    const citationsBulkMatch = path.match(/^\/admin\/citations\/([^/]+)\/bulk$/);
    if (citationsBulkMatch && method === "POST" && user.role === "admin") {
      return handleBulkAddKeywords(decodeURIComponent(citationsBulkMatch[1]), request, env);
    }
    const citationsDeleteMatch = path.match(/^\/admin\/citations\/([^/]+)\/delete\/(\d+)$/);
    if (citationsDeleteMatch && method === "POST" && user.role === "admin") {
      return handleDeleteKeyword(decodeURIComponent(citationsDeleteMatch[1]), Number(citationsDeleteMatch[2]), env);
    }
    const citationsGenerateMatch = path.match(/^\/admin\/citations\/([^/]+)\/generate$/);
    if (citationsGenerateMatch && method === "POST" && user.role === "admin") {
      return handleGenerateKeywords(decodeURIComponent(citationsGenerateMatch[1]), request, env);
    }
    const citationsRunMatch = path.match(/^\/admin\/citations\/([^/]+)\/run$/);
    if (citationsRunMatch && method === "POST" && user.role === "admin") {
      return handleManualCitationRun(decodeURIComponent(citationsRunMatch[1]), env, ctx);
    }
    const citationsKwRunMatch = path.match(/^\/admin\/citations\/([^/]+)\/keyword\/(\d+)\/run$/);
    if (citationsKwRunMatch && method === "POST" && user.role === "admin") {
      return handleManualKeywordRun(
        decodeURIComponent(citationsKwRunMatch[1]),
        parseInt(citationsKwRunMatch[2], 10),
        env,
        ctx
      );
    }

    // Manual reconciler trigger -- runs the enhanced roadmap
    // reconciler against one client (or all if no slug given) and
    // returns the result counts. Accepts GET for quick browser-bar
    // testing (the action is server-side state mutation but it's
    // idempotent and admin-gated, so the GET-side-effect concern is
    // minimal here). POST also accepted for scripted callers.
    const reconcilerMatch = path.match(/^\/admin\/reconciler\/([^/]+)?\/?run$/);
    if (path === "/admin/reconciler/run" && (method === "POST" || method === "GET") && user.role === "admin") {
      const { reconcileAllRoadmaps } = await import("./roadmap-reconciler");
      const result = await reconcileAllRoadmaps(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (reconcilerMatch && reconcilerMatch[1] && (method === "POST" || method === "GET") && user.role === "admin") {
      const { reconcileRoadmapForClient } = await import("./roadmap-reconciler");
      const r = await reconcileRoadmapForClient(decodeURIComponent(reconcilerMatch[1]), env);
      return new Response(JSON.stringify(r, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // GSC service-account setup status page. Shows whether the
    // GSC_SERVICE_ACCOUNT_JSON secret is set, displays the service
    // account email to grant in each GSC property, and a button to
    // test the connection. Migration path from user-OAuth to
    // service-account auth so we stop having GSC die every 7-14 days.
    if (path === "/admin/gsc/service-account" && method === "GET" && user.role === "admin") {
      const { isServiceAccountConfigured, getServiceAccountEmail, getServiceAccountToken } =
        await import("./gsc-service-account");
      const configured = isServiceAccountConfigured(env);
      const email = getServiceAccountEmail(env);
      let testResult: { ok: boolean; detail: string } | null = null;
      if (url.searchParams.get("test") === "1" && configured) {
        try {
          const tok = await getServiceAccountToken(env);
          testResult = tok
            ? { ok: true, detail: `Got access token (length ${tok.length}). Service account is working.` }
            : { ok: false, detail: "Token returned null without throwing -- check JSON shape." };
        } catch (e) {
          testResult = { ok: false, detail: String(e).slice(0, 400) };
        }
      }
      const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>GSC service account</title>
<style>
  body { font-family: ui-monospace, monospace; background: #0e0e10; color: #d9d9d9; padding: 32px; max-width: 760px; margin: 0 auto; line-height: 1.5; }
  h1 { color: #e8c767; margin: 0 0 8px; font-family: Georgia, serif; font-weight: 400; font-size: 28px; }
  h2 { color: #e8c767; font-family: Georgia, serif; font-weight: 400; font-size: 18px; margin: 32px 0 12px; }
  code { background: #1a1a1c; padding: 2px 6px; border-radius: 3px; color: #e8c767; font-size: 12px; }
  pre { background: #1a1a1c; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 11px; }
  .row { background: rgba(255,255,255,.03); padding: 16px; border-radius: 4px; margin: 12px 0; }
  .ok { color: #5ec76a; }
  .bad { color: #c0392b; }
  .pending { color: #888; }
  .btn { display: inline-block; background: #e8c767; color: #0e0e10; padding: 8px 16px; border-radius: 3px; text-decoration: none; font-size: 12px; margin-right: 8px; }
  .btn-ghost { background: transparent; color: #888; border: 1px solid #2a2a2c; }
  ol { padding-left: 24px; }
  ol li { margin-bottom: 12px; }
  .copy-row { display: flex; align-items: center; gap: 8px; }
</style>
</head><body>
<h1>GSC service-account auth</h1>
<p style="color:#888;font-size:13px">Replaces user-OAuth for Google Search Console. Once set up, GSC never needs re-auth again.</p>

<h2>Status</h2>
<div class="row">
  ${configured
    ? `<div class="ok">✓ GSC_SERVICE_ACCOUNT_JSON secret is set</div>
       ${email ? `<div style="margin-top:8px">Service account email: <code>${email}</code>
         <button onclick="navigator.clipboard.writeText('${email}').then(()=>{this.textContent='Copied';setTimeout(()=>this.textContent='Copy',1200)})" class="btn btn-ghost" style="margin-left:8px">Copy</button>
       </div>` : `<div class="bad">Email could not be parsed from the JSON. Check the secret format.</div>`}
       ${testResult ? `<div style="margin-top:16px;padding:12px;background:#0a0a0c;border-radius:3px" class="${testResult.ok ? "ok" : "bad"}">${testResult.ok ? "✓" : "✗"} ${testResult.detail}</div>` : ""}
       <div style="margin-top:16px">
         <a href="/admin/gsc/service-account?test=1" class="btn">Test connection</a>
         <a href="/admin/gsc" class="btn btn-ghost">Back to GSC admin</a>
       </div>`
    : `<div class="pending">○ GSC_SERVICE_ACCOUNT_JSON secret is not set yet</div>
       <div style="margin-top:8px;color:#888;font-size:13px">Follow the setup steps below to configure.</div>`
  }
</div>

<h2>Setup (one-time)</h2>
<ol>
  <li><strong>Create a service account in GCP.</strong> Open <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" style="color:#e8c767">IAM → Service Accounts</a> in the NeverRanked project. Click "+ Create Service Account". Name it something like <code>gsc-reader</code>. Grant role: leave empty (no project-level role needed; permission is granted per-GSC-property below). Click "Done".</li>
  <li><strong>Create a JSON key.</strong> Click the service account you just made → "Keys" tab → "Add Key" → "Create new key" → "JSON" → "Create". A JSON file downloads to your machine.</li>
  <li><strong>Store the key as a Worker secret.</strong> In Terminal, in the dashboard directory, run:<br>
    <pre>cd /Users/lanceroylo/Desktop/neverranked/dashboard
npx wrangler secret put GSC_SERVICE_ACCOUNT_JSON</pre>
    When it prompts, paste the entire contents of the JSON file (open it in a text editor, Cmd+A, Cmd+C, paste into the prompt, hit Enter).</li>
  <li><strong>Refresh this page.</strong> The status above should flip to "✓ secret is set" and show the service account email. Copy it.</li>
  <li><strong>Grant the email access in each GSC property.</strong> For each domain you track:
    <ul style="margin-top:6px">
      <li>Open <a href="https://search.google.com/search-console" target="_blank" style="color:#e8c767">Google Search Console</a></li>
      <li>Select the property (e.g. <code>sc-domain:neverranked.com</code>)</li>
      <li>Click "Settings" (gear icon, left sidebar)</li>
      <li>Click "Users and permissions"</li>
      <li>Click "Add user"</li>
      <li>Paste the service account email</li>
      <li>Permission: select "Restricted" (read-only) or "Owner". Either works -- "Restricted" is the principle-of-least-privilege choice</li>
      <li>Click "Add"</li>
    </ul>
  </li>
  <li><strong>Test.</strong> Click "Test connection" above. You should see "✓ Got access token...". Then go to <code>/admin/gsc</code> and click "Pull latest data now" to verify end-to-end.</li>
</ol>

<h2>Why this matters</h2>
<p style="color:#aaa;font-size:13px;line-height:1.6">
The user-OAuth path requires periodic re-authentication. Google's OAuth consent screen has two modes -- "Testing" and "Production" -- and our app is in Testing because moving to Production requires Google's $15k third-party security verification (the <code>webmasters.readonly</code> scope is "restricted"). In Testing mode, refresh tokens expire after 7 days, so the integration silently dies every week.
</p>
<p style="color:#aaa;font-size:13px;line-height:1.6">
Service accounts don't have this problem. They use a private key (the JSON file) signed server-side -- no user consent flow, no refresh tokens, no expiry. One-time setup, works indefinitely.
</p>
<p style="color:#aaa;font-size:13px;line-height:1.6">
Once verified working, the user-OAuth path becomes vestigial. The legacy code stays in <code>dashboard/src/gsc.ts</code> as a fallback during migration but can be removed entirely once all customers have granted the service account email.
</p>

</body></html>`;
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Citation scan status API (polling endpoint for admin)
    const citationStatusMatch = path.match(/^\/api\/citation-status\/([^/]+?)\/?$/);
    if (citationStatusMatch && method === "GET" && user.role === "admin") {
      const statusSlug = decodeURIComponent(citationStatusMatch[1]);
      const tenMinAgo = Math.floor(Date.now() / 1000) - 600;
      const recent = await env.DB.prepare(
        "SELECT created_at FROM citation_snapshots WHERE client_slug = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1"
      ).bind(statusSlug, tenMinAgo).first<{ created_at: number }>();
      return new Response(JSON.stringify({ done: !!recent }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Google Search Console
    if (path === "/auth/google/callback" && method === "GET") {
      return handleGoogleCallback(request, user, env);
    }
    if ((path === "/admin/gsc" || path === "/admin/gsc/") && method === "GET" && user.role === "admin") {
      return handleAdminGsc(user, env, url);
    }
    if (path === "/admin/gsc/link" && method === "POST" && user.role === "admin") {
      return handleLinkProperty(request, env);
    }
    const gscUnlinkMatch = path.match(/^\/admin\/gsc\/unlink\/(\d+)$/);
    if (gscUnlinkMatch && method === "POST" && user.role === "admin") {
      return handleUnlinkProperty(parseInt(gscUnlinkMatch[1]), env);
    }
    if (path === "/admin/gsc/pull" && method === "POST" && user.role === "admin") {
      return handleManualGscPull(env, ctx);
    }
    if (path === "/api/gsc-status" && method === "GET" && user.role === "admin") {
      const twoMinAgo = Math.floor(Date.now() / 1000) - 120;
      const recent = await env.DB.prepare(
        "SELECT created_at FROM gsc_snapshots WHERE created_at > ? ORDER BY created_at DESC LIMIT 1"
      ).bind(twoMinAgo).first<{ created_at: number }>();
      return new Response(JSON.stringify({ done: !!recent }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    // Search performance -- client picker for admin, direct for client
    if ((path === "/search" || path === "/search/") && method === "GET") {
      if (user.client_slug) return redirect("/search/" + user.client_slug);
      return renderClientPicker("Search Performance", "search", user, env);
    }
    const searchMatch = path.match(/^\/search\/([^/]+?)\/?$/);
    if (searchMatch && method === "GET") {
      return handleSearchPerformance(decodeURIComponent(searchMatch[1]), user, env, url);
    }

    // Weekly summary
    if ((path === "/summary" || path === "/summary/") && method === "GET") {
      if (user.client_slug) return redirect("/summary/" + user.client_slug);
      return renderClientPicker("Weekly Summary", "summary", user, env);
    }
    const summaryMatch = path.match(/^\/summary\/([^/]+?)\/?$/);
    if (summaryMatch && method === "GET") {
      return handleSummary(decodeURIComponent(summaryMatch[1]), user, env);
    }

    // Settings
    if (path === "/settings" && method === "GET") {
      return handleSettings(user, env, undefined, url);
    }
    if (path === "/settings/emails" && method === "POST") {
      return handleUpdateEmailPrefs(request, user, env);
    }

    // Team management for direct retail clients (non-agency).
    if (path === "/team" && method === "GET") {
      const { handleTeamGet } = await import("./routes/client-team");
      return handleTeamGet(user, env, url);
    }
    if (path === "/team/invite" && method === "POST") {
      const { handleTeamInvite } = await import("./routes/client-team");
      return handleTeamInvite(request, user, env);
    }
    const teamResendMatch = path.match(/^\/team\/invite\/(\d+)\/resend$/);
    if (teamResendMatch && method === "POST") {
      const { handleTeamInviteResend } = await import("./routes/client-team");
      return handleTeamInviteResend(Number(teamResendMatch[1]), user, env);
    }
    const teamRevokeMatch = path.match(/^\/team\/invite\/(\d+)\/revoke$/);
    if (teamRevokeMatch && method === "POST") {
      const { handleTeamInviteRevoke } = await import("./routes/client-team");
      return handleTeamInviteRevoke(Number(teamRevokeMatch[1]), user, env);
    }

    // Support
    if (path === "/support" && method === "GET") {
      return handleSupport(user, env, url);
    }
    if (path === "/support" && method === "POST") {
      return handleSupportSubmit(request, user, env);
    }

    // Knowledge base
    if (path === "/learn" && method === "GET") {
      return handleLearn(user);
    }
    const learnMatch = path.match(/^\/learn\/([a-z0-9-]+)$/);
    if (learnMatch && method === "GET") {
      return handleLearnArticle(learnMatch[1], user);
    }

    // Alerts
    if (path === "/alerts" && method === "GET") {
      return handleAlerts(user, env);
    }
    const alertReadMatch = path.match(/^\/alerts\/read\/(\d+)$/);
    if (alertReadMatch && method === "POST") {
      return handleMarkAlertRead(Number(alertReadMatch[1]), user, env);
    }
    // Click-through: mark read AND redirect in one request.
    const alertClickMatch = path.match(/^\/alerts\/click\/(\d+)$/);
    if (alertClickMatch && method === "GET") {
      return handleAlertClickThrough(Number(alertClickMatch[1]), user, env, url);
    }
    if (path === "/alerts/read-all" && method === "POST") {
      return handleMarkAllAlertsRead(user, env);
    }

    // Monthly reports
    const reportMonthMatch = path.match(/^\/report\/([^/]+)\/(\d{4}-\d{2})$/);
    if (reportMonthMatch && method === "GET") {
      return handleReport(decodeURIComponent(reportMonthMatch[1]), reportMonthMatch[2], user, env);
    }
    const reportSendMatch = path.match(/^\/report\/([^/]+)\/(\d{4}-\d{2})\/send$/);
    if (reportSendMatch && method === "POST" && user.role === "admin") {
      return handleSendReport(decodeURIComponent(reportSendMatch[1]), reportSendMatch[2], user, env);
    }
    const reportIndexMatch = path.match(/^\/report\/([^/]+)\/?$/);
    if (reportIndexMatch && method === "GET") {
      return handleReportIndex(decodeURIComponent(reportIndexMatch[1]), user, env);
    }
    if ((path === "/report" || path === "/report/") && method === "GET") {
      if (user.client_slug) return redirect(`/report/${user.client_slug}`);
      return renderClientPicker("Reports", "report", user, env);
    }

    // Billing portal
    if (path === "/billing/portal" && method === "POST") {
      return handleBillingPortal(user, request, env);
    }

    // 2FA settings + enrollment + challenge -- accessible even when
    // 2FA is required (the gate above lets these through).
    if (path === "/settings/2fa" && method === "GET") {
      return handle2faSettingsGet(user, env, url);
    }
    if (path === "/settings/2fa/enroll" && method === "POST") {
      return handle2faEnrollPost(user, env);
    }
    if (path === "/settings/2fa/verify" && method === "POST") {
      return handle2faVerifyPost(request, user, env);
    }
    if (path === "/settings/2fa/disable" && method === "POST") {
      return handle2faDisablePost(request, user, env);
    }
    if (path === "/auth/2fa-challenge" && method === "GET") {
      return handle2faChallengeGet(user, env, url);
    }
    if (path === "/auth/2fa-challenge" && method === "POST") {
      return handle2faChallengePost(request, user, env);
    }
    if (path === "/settings/cancel" && method === "GET") {
      return handleCancelFlowGet(user, env, url);
    }
    if (path === "/settings/cancel" && method === "POST") {
      return handleCancelFlowPost(request, user, env);
    }
    if (path === "/nps" && method === "POST") {
      return handleNpsPost(request, user, env);
    }
    if (path === "/nps/dismiss" && method === "POST") {
      return handleNpsDismiss(request, user, env);
    }

    // 404
    return html(layout("Not Found", `
      <div class="empty">
        <h3>Page not found</h3>
        <p>This page does not exist. <a href="/" style="color:var(--gold);border-bottom:1px solid var(--gold-dim)">Go to dashboard</a></p>
      </div>
    `, user), 404);
    })();
    } catch (err) {
      // Uncaught error inside any route handler. Persist it via
      // ctx.waitUntil (so the worker isn't torn down before the write
      // completes), with KV as a fallback if D1 itself fails.
      const errMessage = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error && err.stack ? err.stack : null;
      console.error("[request-error]", reqLog.id, errMessage, errStack);
      const errPath = new URL(request.url).pathname;
      const errMethod = request.method;
      const errUserAgent = (request.headers.get("User-Agent") || "").slice(0, 500);
      const errIp = request.headers.get("CF-Connecting-IP") || "";
      const errIpPrefix = errIp.split(".").slice(0, 2).join(".") || errIp.split(":").slice(0, 2).join(":");
      const errUserId = _user_id_for_log ?? null;
      const errReqId = reqLog.id;
      const errCreated = Math.floor(Date.now() / 1000);

      ctx.waitUntil((async () => {
        // Primary: D1 insert
        try {
          await env.DB.prepare(
            `INSERT INTO request_errors
               (request_id, path, method, user_id, message, stack, user_agent, ip_prefix, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            errReqId,
            errPath,
            errMethod,
            errUserId,
            errMessage.slice(0, 2000),
            errStack ? errStack.slice(0, 4000) : null,
            errUserAgent,
            errIpPrefix,
            errCreated,
          ).run();
          return;
        } catch (d1Err) {
          console.error("[request-error-D1-FAILED]", errReqId, String(d1Err));
        }
        // Fallback: KV write under a discoverable key. Read these via
        // /admin/recent-errors which checks both sources.
        try {
          const fallback: Record<string, unknown> = {
            request_id: errReqId,
            path: errPath,
            method: errMethod,
            user_id: errUserId,
            message: errMessage,
            stack: errStack,
            user_agent: errUserAgent,
            ip_prefix: errIpPrefix,
            created_at: errCreated,
          };
          await (env as { LEADS?: KVNamespace }).LEADS?.put(
            `request_error:${errCreated}:${errReqId}`,
            JSON.stringify(fallback),
            { expirationTtl: 30 * 24 * 60 * 60 }, // 30 days
          );
        } catch (kvErr) {
          console.error("[request-error-KV-FAILED]", errReqId, String(kvErr));
        }
      })());
      response = new Response(`<!doctype html>
<html><head><meta charset="utf-8"><title>Something went wrong</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#0e0d0a;color:#fbf8ef;margin:0;padding:80px 24px;text-align:center}main{max-width:480px;margin:0 auto}h1{font-family:'Playfair Display',Georgia,serif;font-style:italic;color:#c9a84c;font-weight:400;font-size:32pt;margin:0 0 16px}p{color:#b0b0a8;line-height:1.6;margin:0 0 16px;font-size:14px}code{font-family:'DM Mono',monospace;background:#1a1815;padding:4px 10px;border-radius:3px;color:#e8c767;font-size:12px;display:inline-block;margin:8px 0}.btn{display:inline-block;margin-top:24px;padding:10px 24px;background:#c9a84c;color:#080808;text-decoration:none;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.06em;border-radius:2px}a{color:#c9a84c}</style>
</head><body><main>
<h1>Something went wrong</h1>
<p>An unexpected error occurred while loading this page. The team has been notified automatically.</p>
<p>If this keeps happening, email <a href="mailto:lance@neverranked.com">lance@neverranked.com</a> and quote this request ID:</p>
<code>${reqLog.id}</code>
<p style="margin-top:32px"><a class="btn" href="/">Back to dashboard</a></p>
</main></body></html>`, {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Log + decorate the response.
    reqLog.finish(response, { user_id: _user_id_for_log });
    const decorated = new Response(response.body, response);
    decorated.headers.set("X-Request-Id", reqLog.id);
    return decorated;
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Two cron triggers in wrangler.jsonc -- route by hour:
    //   06:00 UTC = daily tasks (drips, sweeps, backfills, weekly scans on Mon)
    //   17:00 UTC = 7am Pacific/Honolulu = founder inbox morning summary
    const hour = new Date(event.scheduledTime ?? Date.now()).getUTCHours();

    if (hour === 17) {
      ctx.waitUntil((async () => {
        try {
          const { sendInboxMorningSummary, backfillContentDraftsToInbox } = await import("./admin-inbox");
          // Backfill is idempotent (UNIQUE constraint) -- safe to call every morning.
          // Once existing in_review drafts are surfaced, this is a no-op.
          await backfillContentDraftsToInbox(env);
          await sendInboxMorningSummary(env);
        } catch (e) {
          console.log(`[cron 17:00] inbox morning summary failed: ${e instanceof Error ? e.message : e}`);
        }

        // Thursday-only: generate the Weekly AEO Brief draft for last week.
        // Lance reviews + approves via /admin/weekly-brief/<id>; on approval
        // it publishes to /weekly/<slug>. Idempotent -- if a draft already
        // exists for this week the generator returns the existing id.
        const day = new Date(event.scheduledTime ?? Date.now()).getUTCDay();
        if (day === 4) {
          try {
            const { generateWeeklyBrief } = await import("./weekly-brief-generator");
            const result = await generateWeeklyBrief(env);
            console.log(`[cron 17:00 Thu] weekly brief: ${JSON.stringify(result)}`);
          } catch (e) {
            console.log(`[cron 17:00 Thu] weekly brief generation failed: ${e instanceof Error ? e.message : e}`);
          }
        }
      })());
      return;
    }

    // Daily tasks: auth cleanup, onboarding drip emails
    ctx.waitUntil(cleanupAuth(env));
    ctx.waitUntil(runDailyTasks(env));

    // Weekly tasks: full domain scans + digest emails (Mondays only)
    const day = new Date().getUTCDay(); // 0=Sun, 1=Mon
    if (day === 1) {
      ctx.waitUntil(runWeeklyScans(env));
      ctx.waitUntil(runWeeklyBackup(env));
    }
  },
};

/** Get first client slug for admin users who don't have one */
async function getFirstClientSlug(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT DISTINCT client_slug FROM domains WHERE active = 1 AND is_competitor = 0 ORDER BY client_slug LIMIT 1"
  ).first<{ client_slug: string }>();
  return row?.client_slug || null;
}

/** Render a client picker page for admin users hitting a bare slug-dependent route */
async function renderClientPicker(title: string, basePath: string, user: import("./types").User, env: Env): Promise<Response> {
  const slugs = (await env.DB.prepare(
    "SELECT DISTINCT client_slug FROM domains WHERE active = 1 AND is_competitor = 0 ORDER BY client_slug"
  ).all<{ client_slug: string }>()).results;

  if (slugs.length === 0) {
    return html(layout(title, `<div class="empty"><h3>No clients yet</h3><p>Add a client domain first.</p></div>`, user));
  }

  if (slugs.length === 1) {
    return redirect(`/${basePath}/${slugs[0].client_slug}`);
  }

  const cards = slugs.map(s => `
    <a href="/${basePath}/${s.client_slug}" class="card" style="display:block;padding:20px 24px;text-decoration:none;transition:border-color .3s">
      <div style="font-family:var(--serif);font-size:18px;font-style:italic;color:var(--text)">${s.client_slug}</div>
      <div style="font-size:12px;color:var(--text-faint);margin-top:4px">View ${title.toLowerCase()}</div>
    </a>
  `).join("");

  const body = `
    <div class="section-header">
      <h1>${title}</h1>
      <div class="section-sub">Select a client</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;max-width:480px">
      ${cards}
    </div>
  `;

  return html(layout(title, body, user));
}
