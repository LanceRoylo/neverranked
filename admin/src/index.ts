// Never Ranked Admin Worker — entry point + router
// One file, one switch, no framework. Auth is middleware: protected routes check the cookie
// before dispatching; /login, /logout, and /api/intake are the only public routes.

import type { Env } from "./types";
import { isAuthenticated, redirectToLogin } from "./auth";
import { page, redirect } from "./render";

import { showLogin, handleLogin, handleLogout } from "./routes/login";
import { showHome } from "./routes/home";
import { showClientsList } from "./routes/clients";
import { showClientNew, handleClientCreate } from "./routes/client-new";
import { showClientDetail, handleClientUpdate } from "./routes/client-detail";
import {
  showIntakeList,
  handleIntakeConvert,
  handleIntakeStatus,
} from "./routes/intake";
import { handleApiIntake } from "./routes/api-intake";
import { showBilling } from "./routes/billing";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err) {
      console.error("Unhandled error:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      return page(
        `<!doctype html><meta charset="utf-8"><title>Error</title>
         <style>body{background:#121212;color:#fbf8ef;font-family:ui-monospace,monospace;padding:40px}</style>
         <h1>§ 500 — Something broke.</h1>
         <pre>${escapeText(message)}</pre>
         <p><a href="/" style="color:#e8c767">← Home</a></p>`,
        { status: 500 },
      );
    }
  },
};

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  // ---------- public routes ----------
  if (path === "/api/intake") {
    return handleApiIntake(request, env);
  }
  if (path === "/login") {
    if (method === "GET") return showLogin(request);
    if (method === "POST") return handleLogin(request, env);
    return new Response("Method not allowed", { status: 405 });
  }
  if (path === "/logout" && method === "GET") {
    return handleLogout();
  }

  // ---------- auth gate ----------
  const authed = await isAuthenticated(request, env);
  if (!authed) return redirectToLogin(request);

  // ---------- protected routes ----------
  if (path === "/" && method === "GET") {
    return showHome(request, env);
  }

  if (path === "/billing" && method === "GET") {
    return showBilling(request, env);
  }

  if (path === "/clients") {
    if (method === "GET") return showClientsList(request, env);
    if (method === "POST") return handleClientCreate(request, env);
  }

  if (path === "/clients/new" && method === "GET") {
    return showClientNew();
  }

  // /clients/:slug (GET = detail, POST = update)
  const clientMatch = /^\/clients\/([^/]+)$/.exec(path);
  if (clientMatch) {
    const slug = decodeURIComponent(clientMatch[1]);
    if (method === "GET") return showClientDetail(request, env, slug);
    if (method === "POST") return handleClientUpdate(request, env, slug);
  }

  if (path === "/intake" && method === "GET") {
    return showIntakeList(request, env);
  }

  // /intake/:id/convert and /intake/:id/status
  const intakeConvert = /^\/intake\/(\d+)\/convert$/.exec(path);
  if (intakeConvert && method === "POST") {
    return handleIntakeConvert(request, env, parseInt(intakeConvert[1], 10));
  }
  const intakeStatus = /^\/intake\/(\d+)\/status$/.exec(path);
  if (intakeStatus && method === "POST") {
    return handleIntakeStatus(request, env, parseInt(intakeStatus[1], 10));
  }

  return page(
    `<!doctype html><meta charset="utf-8"><title>Not found</title>
     <style>body{background:#121212;color:#fbf8ef;font-family:ui-monospace,monospace;padding:40px}
     a{color:#e8c767}</style>
     <h1>§ 404 — Route not found.</h1>
     <p><code>${escapeText(method)} ${escapeText(path)}</code></p>
     <p><a href="/">← Home</a></p>`,
    { status: 404 },
  );
}
