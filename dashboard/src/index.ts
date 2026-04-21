/**
 * NeverRanked Client Dashboard — Cloudflare Worker
 *
 * app.neverranked.com
 */

import type { Env } from "./types";
import { getUser } from "./auth";
import { redirect, html, layout } from "./render";
import { handleGetLogin, handlePostLogin, handleVerify, handleLogout } from "./routes/login";
import { handleHome } from "./routes/home";
import { handleDomainDetail, handleScanCompare, handleClientRescan } from "./routes/domain";
import { handleAdminHome, handleAddDomain, handleAddUser, handleManualScan, handleEditSuggestion, handleRemoveSuggestion, handleReconcileAgency, handleAdminResendOnboarding, handleClientSettings } from "./routes/admin";
import { handleCockpit, handleAutomationToggle, handleAutomationDigestToggle } from "./routes/cockpit";
import { handleEmailTestGet, handleEmailTestPost } from "./routes/admin-email-test";
import { handleAdminEmailLogGet } from "./routes/admin-email-log";
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
import { handleRoadmap, handleAddRoadmapItem, handleUpdateRoadmapItem, handleAddPhase, handleRegenerateRoadmap, handleBulkStartItems } from "./routes/roadmap";
import { handleOnboarding, handleOnboardingSubmit, handleOnboardingSkip } from "./routes/onboarding";
import { handlePublicReport, handleCreateShare } from "./routes/share";
import { handleSettings, handleUpdateEmailPrefs } from "./routes/settings";
import { handleLeads, handleLeadsJson } from "./routes/leads";
import { handleCheckout, handleCheckoutSuccess, handleStripeWebhook, handleBillingPortal } from "./routes/checkout";
import { cleanupAuth } from "./auth";
import { runWeeklyScans, runDailyTasks } from "./cron";
import { runWeeklyBackup } from "./backup";
import { logEvent, hashIP } from "./analytics";
import { handleInjectScript } from "./routes/inject";
import { handleInjectAdmin, handleInjectConfig, handleInjectGenerate, handleInjectApprove, handleInjectPause, handleInjectEdit, handleInjectDelete, handleInjectPublish } from "./routes/inject-admin";
import { handleCitations, handleAdminCitations, handleAddKeyword, handleBulkAddKeywords, handleDeleteKeyword, handleGenerateKeywords, handleManualCitationRun } from "./routes/citations";
import { handleGoogleCallback, handleAdminGsc, handleLinkProperty, handleUnlinkProperty, handleManualGscPull, handleSearchPerformance } from "./routes/gsc";
import { handleSummary } from "./routes/summary";
import { handleAlerts, handleMarkAlertRead, handleMarkAllAlertsRead } from "./routes/alerts";
import { handleLearn, handleLearnArticle } from "./routes/learn";
import { handleReport, handleReportIndex, handleSendReport } from "./routes/report";
import { handleDemoRedirect, handleDemoDomain, handleDemoCitations, handleDemoRoadmap, handleDemoPost } from "./routes/demo";
import { handleSupport, handleSupportSubmit } from "./routes/support";
import { handleScanHealth } from "./routes/scan-health";
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
    const response = await (async (): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // --- Public routes (no auth required) ---

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
    const installMatch = /^\/install\/([a-z0-9-]+)$/.exec(path);
    if (installMatch && method === "GET") {
      return handleInstallGuide(installMatch[1], request, env);
    }

    // Public shared report (no auth)
    const reportMatch = path.match(/^\/report\/([a-f0-9]{32})$/);
    if (reportMatch) {
      return handlePublicReport(reportMatch[1], env);
    }

    // Stripe checkout (no auth -- public pricing links)
    const checkoutMatch = path.match(/^\/checkout\/(audit|signal|amplify)$/);
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
      if (method === "POST") return handleStripeWebhook(request, env);
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

    // Schema injection JS (public, cached at edge)
    const injectMatch = path.match(/^\/inject\/([a-z0-9_-]+)\.js$/);
    if (injectMatch) {
      return handleInjectScript(injectMatch[1], env);
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
      }
    } catch {
      // Non-critical -- don't break routing if badge query fails
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

    // Auto-redirect non-onboarded clients to onboarding
    if (user.role === "client" && !user.onboarded) {
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
    if (path === "/admin/manage" && method === "GET" && user.role === "admin") {
      return handleAdminHome(user, env, url);
    }
    if (path === "/admin/scans" && method === "GET" && user.role === "admin") {
      return handleScanHealth(user, env);
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
    if (path === "/admin/automation/toggle" && method === "POST" && user.role === "admin") {
      return handleAutomationToggle(user, env);
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

    // Schema injection admin
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
      return handleInjectApprove(decodeURIComponent(injectApproveMatch[1]), Number(injectApproveMatch[2]), env);
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
    const roadmapBulkStartMatch = path.match(/^\/roadmap\/([^/]+)\/bulk-start$/);
    if (roadmapBulkStartMatch && method === "POST" && user.role === "admin") {
      return handleBulkStartItems(decodeURIComponent(roadmapBulkStartMatch[1]), user, env);
    }
    const phaseAddMatch = path.match(/^\/roadmap\/([^/]+)\/add-phase$/);
    if (phaseAddMatch && method === "POST" && user.role === "admin") {
      return handleAddPhase(decodeURIComponent(phaseAddMatch[1]), request, user, env);
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

    // Log + decorate the response.
    reqLog.finish(response, { user_id: _user_id_for_log });
    const decorated = new Response(response.body, response);
    decorated.headers.set("X-Request-Id", reqLog.id);
    return decorated;
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
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
