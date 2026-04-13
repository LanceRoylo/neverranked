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
import { handleCompetitors } from "./routes/competitors";
import { handleRoadmap, handleAddRoadmapItem, handleUpdateRoadmapItem, handleAddPhase } from "./routes/roadmap";
import { handleOnboarding, handleOnboardingSubmit, handleOnboardingSkip } from "./routes/onboarding";
import { handlePublicReport, handleCreateShare } from "./routes/share";
import { handleSettings, handleUpdateEmailPrefs } from "./routes/settings";
import { handleLeads } from "./routes/leads";
import { cleanupAuth } from "./auth";
import { runWeeklyScans } from "./cron";

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

    // --- Auth check ---

    const user = await getUser(request, env);

    if (path === "/logout") {
      return handleLogout(request, env);
    }

    if (!user) {
      return redirect("/login");
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

    // Home
    if (path === "/" || path === "") {
      return handleHome(user, env);
    }

    // Domain detail
    const domainMatch = path.match(/^\/domain\/(\d+)$/);
    if (domainMatch) {
      return handleDomainDetail(Number(domainMatch[1]), user, env, url);
    }

    // Admin routes
    if (path === "/admin" && method === "GET" && user.role === "admin") {
      return handleAdminHome(user, env);
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

    // Share report
    const shareMatch = path.match(/^\/domain\/(\d+)\/share$/);
    if (shareMatch && method === "POST") {
      const { token } = await handleCreateShare(Number(shareMatch[1]), user.id, env);
      const shareUrl = `${url.origin}/report/${token}`;
      return redirect(`/domain/${shareMatch[1]}?shared=${encodeURIComponent(shareUrl)}`);
    }

    // Competitors
    const compMatch = path.match(/^\/competitors\/(.+)$/);
    if (compMatch) {
      const slug = decodeURIComponent(compMatch[1]);
      return handleCompetitors(slug, user, env);
    }

    // Roadmap
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

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupAuth(env));
    ctx.waitUntil(runWeeklyScans(env));
  },
};
