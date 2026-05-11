/**
 * POST /free/signup
 *
 * Email + domain capture for the free monitoring tier. Creates a
 * free_users row if neither the email nor domain is already
 * registered, then sends a magic link the user can click to
 * confirm and access their /free dashboard.
 *
 * Response shape is intentionally identical for "newly created"
 * and "already exists" cases to avoid email/domain enumeration.
 *
 * Spec: content/strategy/free-monitoring-tier.md
 */

import type { Env } from "../types";
import { html, layout, esc } from "../render";
import {
  createFreeMagicLink,
  generateUnsubToken,
  normalizeDomain,
  normalizeEmail,
} from "../free-auth";
import { sendFreeMagicLinkEmail } from "../email";

function signupErrorPage(message: string): string {
  return layout("Free score signup", `
    <div style="max-width:440px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>Almost</em></h1>
      <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">${esc(message)}</p>
      <a href="/free/signup" class="btn btn-ghost">Try again</a>
    </div>
  `);
}

function checkEmailPage(domain: string): string {
  return layout("Check your email", `
    <div style="max-width:440px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>Check your email</em></h1>
      <p style="color:var(--text-faint);margin-bottom:24px;font-size:13px">
        We sent a confirmation link. Click it and your weekly AEO score for <strong>${esc(domain)}</strong> starts arriving Mondays.
      </p>
      <p style="color:var(--text-faint);margin-bottom:32px;font-size:12px">
        Link expires in 15 minutes. If you do not see it, check spam.
      </p>
    </div>
  `);
}

export async function handleFreeSignup(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const rawEmail = (formData.get("email") as string) || "";
  const rawDomain = (formData.get("domain") as string) || "";

  const email = normalizeEmail(rawEmail);
  if (!email) {
    return html(signupErrorPage("That email does not look valid. Try again."), 400);
  }

  const domain = normalizeDomain(rawDomain);
  if (!domain) {
    return html(signupErrorPage("That domain does not look valid. Use a real website, like yourcompany.com."), 400);
  }

  const now = Math.floor(Date.now() / 1000);

  // If a free_user already exists for this email, fall through and
  // resend a magic link (lets returning users re-auth without an
  // error). If the domain is taken by a different email, reject.
  const existingByEmail = await env.DB.prepare(
    "SELECT id, domain FROM free_users WHERE email = ?"
  ).bind(email).first<{ id: number; domain: string }>();

  if (!existingByEmail) {
    const domainTaken = await env.DB.prepare(
      "SELECT 1 FROM free_users WHERE domain = ?"
    ).bind(domain).first();
    if (domainTaken) {
      // Don't reveal which email owns it. Identical UX to success
      // case prevents enumeration.
      return html(checkEmailPage(domain));
    }

    await env.DB.prepare(
      `INSERT INTO free_users (email, domain, created_at, email_alerts, public_history, unsub_token)
       VALUES (?, ?, ?, 1, 0, ?)`
    ).bind(email, domain, now, generateUnsubToken()).run();
  }

  const token = await createFreeMagicLink(email, env);
  if (token) {
    await sendFreeMagicLinkEmail(email, token, domain, env);
  } else {
    console.log(`Free magic link not created for ${email} (rate limited)`);
  }

  return html(checkEmailPage(domain));
}

/** GET /free/signup -- render the signup form. */
export async function handleFreeSignupGet(_request: Request, _env: Env): Promise<Response> {
  return html(layout("Free weekly AEO score", `
    <div style="max-width:440px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>Free weekly AEO score</em></h1>
      <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
        One domain. Every Monday. Plus an alert if your score drops materially during the week. No card required.
      </p>
      <form method="POST" action="/free/signup">
        <div class="form-group" style="text-align:left">
          <label for="domain">Your website</label>
          <input type="text" id="domain" name="domain" required placeholder="yourcompany.com" autofocus>
        </div>
        <div class="form-group" style="text-align:left">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" required placeholder="you@company.com">
        </div>
        <button type="submit" class="btn" style="width:100%;justify-content:center">
          Start tracking
        </button>
      </form>
      <p style="margin-top:24px;font-size:11px;color:var(--text-faint)">
        We email a confirmation link. One domain per account. Citation tracking, deployment, and full history are paid features.
      </p>
    </div>
  `));
}
