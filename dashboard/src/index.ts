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
import { cleanupAuth } from "./auth";

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

    // --- Auth check ---

    const user = await getUser(request, env);

    if (path === "/logout") {
      return handleLogout(request, env);
    }

    if (!user) {
      return redirect("/login");
    }

    // --- Authenticated routes ---

    // Home
    if (path === "/" || path === "") {
      return handleHome(user, env);
    }

    // Domain detail (Phase 1b)
    // const domainMatch = path.match(/^\/domain\/(\d+)$/);
    // if (domainMatch) { ... }

    // Competitors (Phase 1e)
    // if (path === "/competitors") { ... }

    // Roadmap (Phase 1f)
    // if (path === "/roadmap") { ... }

    // Admin routes (Phase 1b)
    // if (path.startsWith("/admin") && user.role === "admin") { ... }

    // 404
    return html(layout("Not Found", `
      <div class="empty">
        <h3>Page not found</h3>
        <p>This page does not exist. <a href="/" style="color:var(--gold);border-bottom:1px solid var(--gold-dim)">Go to dashboard</a></p>
      </div>
    `, user), 404);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Phase 1c: Weekly scans will run here
    ctx.waitUntil(cleanupAuth(env));
  },
};
