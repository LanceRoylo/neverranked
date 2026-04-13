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
import { handleDomainDetail } from "./routes/domain";
import { handleAdminHome, handleAddDomain, handleAddUser, handleManualScan, handleApproveSuggestion, handleDismissSuggestion } from "./routes/admin";
import { handleCockpit } from "./routes/cockpit";
import { handleCompetitors } from "./routes/competitors";
import { handleRoadmap, handleAddRoadmapItem, handleUpdateRoadmapItem, handleAddPhase } from "./routes/roadmap";
import { handleOnboarding, handleOnboardingSubmit, handleOnboardingSkip } from "./routes/onboarding";
import { handlePublicReport, handleCreateShare } from "./routes/share";
import { handleSettings, handleUpdateEmailPrefs } from "./routes/settings";
import { handleLeads } from "./routes/leads";
import { handleCheckout, handleCheckoutSuccess, handleStripeWebhook } from "./routes/checkout";
import { cleanupAuth } from "./auth";
import { runWeeklyScans, runDailyTasks } from "./cron";
import { logEvent, hashIP } from "./analytics";
import { handleInjectScript } from "./routes/inject";
import { handleInjectAdmin, handleInjectConfig, handleInjectGenerate, handleInjectApprove, handleInjectPause, handleInjectEdit, handleInjectDelete, handleInjectPublish } from "./routes/inject-admin";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    // Stripe webhook (no auth -- verified by signature)
    if (path === "/stripe/webhook" && method === "POST") {
      return handleStripeWebhook(request, env);
    }

    // Schema injection JS (public, cached at edge)
    const injectMatch = path.match(/^\/inject\/([a-z0-9_-]+)\.js$/);
    if (injectMatch) {
      return handleInjectScript(injectMatch[1], env);
    }

    // --- Auth check ---

    const user = await getUser(request, env);

    if (path === "/logout") {
      return handleLogout(request, env);
    }

    if (!user) {
      // Track page view for public pages that fall through (unauthenticated visit)
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      ctx.waitUntil(logEvent(env, { type: "page_view", detail: { path, authed: false }, ipHash: hashIP(ip) }));
      return redirect("/login");
    }

    // Track authenticated page view
    ctx.waitUntil(logEvent(env, { type: "page_view", detail: { path }, userId: user.id }));

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

    // Domain detail
    const domainMatch = path.match(/^\/domain\/(\d+)$/);
    if (domainMatch) {
      return handleDomainDetail(Number(domainMatch[1]), user, env, url);
    }

    // Admin routes
    if (path === "/admin" && method === "GET" && user.role === "admin") {
      return handleCockpit(user, env);
    }
    if (path === "/admin/manage" && method === "GET" && user.role === "admin") {
      return handleAdminHome(user, env);
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
    const scanMatch = path.match(/^\/admin\/scan\/(\d+)$/);
    if (scanMatch && method === "POST" && user.role === "admin") {
      return handleManualScan(Number(scanMatch[1]), user, env);
    }
    const approveMatch = path.match(/^\/admin\/suggestion\/(\d+)\/approve$/);
    if (approveMatch && method === "POST" && user.role === "admin") {
      return handleApproveSuggestion(Number(approveMatch[1]), user, env);
    }
    const dismissMatch = path.match(/^\/admin\/suggestion\/(\d+)\/dismiss$/);
    if (dismissMatch && method === "POST" && user.role === "admin") {
      return handleDismissSuggestion(Number(dismissMatch[1]), user, env);
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
      const slug = user.client_slug || await getFirstClientSlug(env);
      if (slug) return redirect(`/competitors/${slug}`);
      return html(layout("Competitors", `<div class="empty"><h3>No clients yet</h3><p>Add a client domain first.</p></div>`, user));
    }
    const compMatch = path.match(/^\/competitors\/(.+)$/);
    if (compMatch) {
      const slug = decodeURIComponent(compMatch[1]);
      return handleCompetitors(slug, user, env);
    }

    // Roadmap
    if (path === "/roadmap" || path === "/roadmap/") {
      const slug = user.client_slug || await getFirstClientSlug(env);
      if (slug) return redirect(`/roadmap/${slug}`);
      return html(layout("Roadmap", `<div class="empty"><h3>No clients yet</h3><p>Add a client domain first.</p></div>`, user));
    }
    const roadmapMatch = path.match(/^\/roadmap\/([^/]+)$/);
    if (roadmapMatch && method === "GET") {
      return handleRoadmap(decodeURIComponent(roadmapMatch[1]), user, env);
    }
    const roadmapAddMatch = path.match(/^\/roadmap\/([^/]+)\/add$/);
    if (roadmapAddMatch && method === "POST" && user.role === "admin") {
      return handleAddRoadmapItem(decodeURIComponent(roadmapAddMatch[1]), request, user, env);
    }
    const roadmapUpdateMatch = path.match(/^\/roadmap\/([^/]+)\/update\/(\d+)$/);
    if (roadmapUpdateMatch && method === "POST" && user.role === "admin") {
      return handleUpdateRoadmapItem(decodeURIComponent(roadmapUpdateMatch[1]), Number(roadmapUpdateMatch[2]), request, user, env);
    }
    const phaseAddMatch = path.match(/^\/roadmap\/([^/]+)\/add-phase$/);
    if (phaseAddMatch && method === "POST" && user.role === "admin") {
      return handleAddPhase(decodeURIComponent(phaseAddMatch[1]), request, user, env);
    }

    // Settings
    if (path === "/settings" && method === "GET") {
      return handleSettings(user, env);
    }
    if (path === "/settings/emails" && method === "POST") {
      return handleUpdateEmailPrefs(request, user, env);
    }

    // 404
    return html(layout("Not Found", `
      <div class="empty">
        <h3>Page not found</h3>
        <p>This page does not exist. <a href="/" style="color:var(--gold);border-bottom:1px solid var(--gold-dim)">Go to dashboard</a></p>
      </div>
    `, user), 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Daily tasks: auth cleanup, onboarding drip emails
    ctx.waitUntil(cleanupAuth(env));
    ctx.waitUntil(runDailyTasks(env));

    // Weekly tasks: full domain scans + digest emails (Mondays only)
    const day = new Date().getUTCDay(); // 0=Sun, 1=Mon
    if (day === 1) {
      ctx.waitUntil(runWeeklyScans(env));
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
