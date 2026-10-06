/**
 * Dashboard — Login routes
 */

import type { Env, User } from "../types";
import { layout, html, redirect, esc } from "../render";
import { createMagicLink, verifyMagicLink, deleteSession, sessionCookie, clearCookie } from "../auth";
import { sendMagicLinkEmail } from "../email";
import { resolveAgencyForEmail } from "../agency";

/**
 * Where to send someone after they sign in. Same-origin paths only, so a
 * crafted link can never bounce a client to another site.
 *
 * Added 2026-10-05. A client clicking their readout link while signed out was
 * sent to /login with no memory of where they were going, signed in, and
 * landed on the dashboard home, so the readout they were told about needed a
 * second trip back to the email. The first readout of the first paying client
 * had already sat unopened for ten days.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.startsWith("/login") || raw.startsWith("/auth/") || raw.startsWith("/logout")) return null;
  return raw.length > 300 ? null : raw;
}

function loginPage(error?: string, next?: string | null): string {
  return layout("Sign in", `
    <div style="max-width:400px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>Sign in</em></h1>
      <p style="color:var(--text-faint);margin-bottom:40px;font-size:13px">
        Enter your email and we will send you a sign-in link.
      </p>
      ${error ? `<div class="flash flash-error">${esc(error)}</div>` : ''}
      <form method="POST" action="/login">
        ${next ? `<input type="hidden" name="next" value="${esc(next)}">` : ""}
        <div class="form-group" style="text-align:left">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" required placeholder="you@company.com" autofocus>
        </div>
        <button type="submit" class="btn" style="width:100%;justify-content:center">
          Send sign-in link
        </button>
      </form>
      <p style="margin-top:32px;font-size:11px;color:var(--text-faint)">
        <a href="https://neverranked.com" style="color:var(--text-mute);border-bottom:1px solid var(--line)">Back to neverranked.com</a>
      </p>
    </div>
  `);
}

function checkEmailPage(): string {
  return layout("Check your email", `
    <div style="max-width:400px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>Check your email</em></h1>
      <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
        If an account exists for that email, we sent a sign-in link. It expires in 15 minutes.
      </p>
      <a href="/login" class="btn btn-ghost" style="display:inline-flex">
        Try a different email
      </a>
    </div>
  `);
}

function linkExpiredPage(): string {
  return layout("Link expired", `
    <div style="max-width:400px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>Link expired</em></h1>
      <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
        This sign-in link has expired or has already been used. Request a new one.
      </p>
      <a href="/login" class="btn">
        Request new link
      </a>
    </div>
  `);
}

export async function handleGetLogin(request: Request, _env: Env): Promise<Response> {
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  return html(loginPage(undefined, next));
}

export async function handlePostLogin(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const email = (formData.get("email") as string || "").trim().toLowerCase();
  const next = safeNextPath(formData.get("next") as string | null);

  if (!email || !email.includes("@")) {
    return html(loginPage("Please enter a valid email address.", next), 400);
  }

  // Always show "check email" page (no user enumeration)
  const token = await createMagicLink(email, env);
  if (token) {
    // Resolve agency for white-label branding (returns null for direct/admin users).
    const agency = await resolveAgencyForEmail(env, { email });
    const sent = await sendMagicLinkEmail(email, token, env, agency, next);
    if (!sent) {
      console.log(`Magic link send returned false for ${email} (token created in DB but email did not deliver)`);
    }
  } else {
    console.log(`Magic link not created for ${email} (user not found or rate limited)`);
  }

  return html(checkEmailPage());
}

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (!token || token.length !== 64) {
    return html(linkExpiredPage(), 400);
  }

  const result = await verifyMagicLink(token, env);
  if (!result) {
    return html(linkExpiredPage(), 400);
  }

  // Honor ?next=<path> so callers can drop newly-verified users on a
  // specific page (e.g. Pulse welcome → /onboard/pulse). Defense:
  // only allow same-origin paths to prevent open-redirect via the
  // magic link.
  const rawNext = url.searchParams.get("next") || "/";
  const safeNext = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  return new Response(null, {
    status: 302,
    headers: {
      Location: safeNext,
      "Set-Cookie": sessionCookie(result.sessionToken),
    },
  });
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  await deleteSession(request, env);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login",
      "Set-Cookie": clearCookie(),
    },
  });
}
