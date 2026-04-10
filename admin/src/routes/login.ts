// GET /login + POST /login + GET /logout

import type { Env } from "../types";
import { esc, page, redirect } from "../render";
import { mintCookie, clearCookie } from "../auth";
import { loginLayout } from "../views/layout";

function loginForm(opts: { next?: string; error?: string } = {}): string {
  const err = opts.error
    ? `<div class="flash">${esc(opts.error)}</div>`
    : "";
  const next = opts.next ? `<input type="hidden" name="next" value="${esc(opts.next)}" />` : "";
  return loginLayout(
    "Sign in",
    `
<div class="login-card">
  <h1 class="brand">Never Ranked</h1>
  <div class="tag">§ Internal ops</div>
  ${err}
  <form method="POST" action="/login" class="form">
    ${next}
    <div class="field">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autofocus autocomplete="current-password" />
    </div>
    <div class="form-actions">
      <button type="submit" class="btn">Sign in →</button>
    </div>
  </form>
</div>`,
  );
}

export function showLogin(request: Request): Response {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? undefined;
  return page(loginForm({ next }));
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/") || "/";

  if (!env.ADMIN_PASSWORD) {
    return page(loginForm({ error: "Server misconfigured: ADMIN_PASSWORD not set." }), { status: 500 });
  }

  // Constant-time-ish comparison on strings of equal length
  if (
    password.length !== env.ADMIN_PASSWORD.length ||
    !timingSafeEqual(password, env.ADMIN_PASSWORD)
  ) {
    return page(loginForm({ error: "Wrong password.", next }), { status: 401 });
  }

  const cookie = await mintCookie(env.ADMIN_SECRET);
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return redirect(safeNext, { "Set-Cookie": cookie });
}

export function handleLogout(): Response {
  return redirect("/login", { "Set-Cookie": clearCookie() });
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
