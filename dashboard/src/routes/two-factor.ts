/**
 * Dashboard -- Two-factor authentication routes
 *
 * Routes:
 *   GET  /settings/2fa            -> status + enroll/disable controls
 *   POST /settings/2fa/enroll     -> generate secret + show QR + recovery codes (pending verify)
 *   POST /settings/2fa/verify     -> first TOTP after enroll, flips totp_enabled_at
 *   POST /settings/2fa/disable    -> requires current TOTP, clears all 2fa columns
 *   GET  /auth/2fa-challenge      -> form shown after magic-link if user has 2fa
 *   POST /auth/2fa-challenge      -> verify TOTP or recovery code, mark session totp_verified=1
 *
 * The challenge route is the second factor for ALL users with
 * 2fa enabled. Admin role is also FORCED through enrollment via
 * the auth gate in index.ts.
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";
import { generateSecret, provisioningUri, totpVerify, generateRecoveryCodes, consumeRecoveryCode } from "../totp";

const ISSUER = "Never Ranked";

function buildQrUrl(uri: string): string {
  // Google Charts is gone; use api.qrserver.com (free, no auth, simple).
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(uri)}`;
}

function getSessionToken(request: Request): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/nr_app=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// GET /settings/2fa
// ---------------------------------------------------------------------------

export async function handle2faSettingsGet(user: User, env: Env, url: URL): Promise<Response> {
  const flash = url.searchParams.get("flash");
  const errorMsg = url.searchParams.get("error");
  const flashBlock = flash
    ? `<div class="flash">${esc(flash)}</div>`
    : errorMsg
    ? `<div class="flash flash-error">${esc(errorMsg)}</div>`
    : "";

  const enrolled = !!user.totp_enabled_at;
  const enrolledAt = user.totp_enabled_at
    ? new Date(user.totp_enabled_at * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  const isAdminUnenrolled = user.role === "admin" && !enrolled;

  const body = `
    <div class="section-header">
      <h1>Two-factor <em>authentication</em></h1>
      <p class="section-sub">Adds a second factor (a code from your phone) on top of magic-link sign-in. Required for admin accounts.</p>
    </div>

    ${flashBlock}

    ${isAdminUnenrolled ? `
      <div class="flash flash-warning" style="margin-bottom:16px">
        Your account has admin role. Enroll in 2FA below to keep accessing /admin/* routes.
      </div>
    ` : ""}

    <div class="card" style="max-width:560px">
      ${enrolled ? `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
          <div>
            <h3 style="margin:0 0 4px">2FA is on</h3>
            <p class="muted" style="font-size:13px;margin:0">Enrolled ${esc(enrolledAt!)}.</p>
          </div>
          <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--green);border-radius:999px;font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--green)"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green)"></span> Active</span>
        </div>

        <form method="POST" action="/settings/2fa/disable" style="margin-top:24px;padding-top:24px;border-top:1px solid var(--line)" onsubmit="return confirm('Disable 2FA on this account? You will need a current 6-digit code to confirm.');">
          <h4 style="margin:0 0 8px">Disable 2FA</h4>
          <p class="muted" style="font-size:12px;margin:0 0 12px">Enter a current code from your authenticator app to confirm.</p>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <input type="text" name="code" required maxlength="6" pattern="[0-9]{6}" placeholder="000000" autocomplete="one-time-code" inputmode="numeric" style="font-family:var(--mono);width:120px;letter-spacing:.3em;text-align:center">
            <button type="submit" class="btn btn-ghost" style="color:var(--red)">Disable 2FA</button>
          </div>
        </form>
      ` : `
        <h3 style="margin:0 0 12px">Set up 2FA</h3>
        <p style="color:var(--text-faint);font-size:13px;line-height:1.7;margin-bottom:18px">
          You'll need an authenticator app (Google Authenticator, 1Password, Authy, or your iOS/macOS Passwords app).
          Click below to generate a secret and scan it.
        </p>
        <form method="POST" action="/settings/2fa/enroll">
          <button type="submit" class="btn">Start enrollment</button>
        </form>
      `}
    </div>
  `;

  return html(layout("Two-factor authentication", body, user));
}

// ---------------------------------------------------------------------------
// POST /settings/2fa/enroll
// ---------------------------------------------------------------------------

export async function handle2faEnrollPost(user: User, env: Env): Promise<Response> {
  // Generate a fresh secret + recovery codes. We persist them now
  // (totp_enabled_at stays NULL until /verify confirms a working code)
  // so the user can re-load the verify page if they navigate away.
  const secret = generateSecret();
  const recovery = generateRecoveryCodes();
  await env.DB.prepare(
    "UPDATE users SET totp_secret = ?, totp_recovery_codes = ?, totp_enabled_at = NULL WHERE id = ?"
  ).bind(secret, JSON.stringify(recovery), user.id).run();

  const uri = provisioningUri({ secret, account: user.email, issuer: ISSUER });
  const qrUrl = buildQrUrl(uri);

  const recoveryHtml = recovery.map((c) =>
    `<div style="font-family:var(--mono);font-size:13px;padding:6px 0;border-bottom:1px solid var(--line)">${esc(c)}</div>`
  ).join("");

  const body = `
    <div class="section-header">
      <h1>Scan to <em>enroll</em></h1>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;max-width:840px">
      <div class="card">
        <h3 style="margin-top:0">1. Scan with your authenticator app</h3>
        <div style="text-align:center;padding:14px;background:#fff;border-radius:6px;margin:10px 0 16px">
          <img src="${esc(qrUrl)}" alt="2FA QR code" width="240" height="240" style="display:block;margin:0 auto">
        </div>
        <p class="muted" style="font-size:12px;margin:0 0 8px">Or enter this key manually:</p>
        <code style="display:block;padding:10px 12px;background:var(--bg-edge);border-radius:3px;font-family:var(--mono);font-size:12px;word-break:break-all">${esc(secret)}</code>
      </div>

      <div class="card">
        <h3 style="margin-top:0">2. Save your recovery codes</h3>
        <p class="muted" style="font-size:12px;margin:0 0 12px">If you lose your authenticator, each code can be used ONCE to sign in. Save these somewhere safe (a password manager, printed sheet, etc).</p>
        <div style="padding:10px 14px;background:var(--bg-edge);border-radius:3px;margin-bottom:14px">
          ${recoveryHtml}
        </div>
        <p class="muted" style="font-size:11px;margin:0">These won't be shown again. We'll only display them once.</p>
      </div>
    </div>

    <div class="card" style="margin-top:18px;max-width:560px">
      <h3 style="margin-top:0">3. Enter a code from the app</h3>
      <p class="muted" style="font-size:12px;margin:0 0 14px">Type the 6-digit code your authenticator is showing right now.</p>
      <form method="POST" action="/settings/2fa/verify" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="text" name="code" required maxlength="6" pattern="[0-9]{6}" placeholder="000000" autocomplete="one-time-code" inputmode="numeric" autofocus style="font-family:var(--mono);width:140px;letter-spacing:.4em;text-align:center;font-size:18px">
        <button type="submit" class="btn">Verify and enable</button>
        <a href="/settings/2fa" class="btn btn-ghost">Cancel</a>
      </form>
    </div>
  `;

  return html(layout("Enroll 2FA", body, user));
}

// ---------------------------------------------------------------------------
// POST /settings/2fa/verify
// ---------------------------------------------------------------------------

export async function handle2faVerifyPost(request: Request, user: User, env: Env): Promise<Response> {
  if (!user.totp_secret) return redirect("/settings/2fa?error=" + encodeURIComponent("Start enrollment first."));

  const form = await request.formData();
  const code = (form.get("code") as string || "").trim();
  const ok = await totpVerify(user.totp_secret, code);
  if (!ok) {
    return redirect("/settings/2fa?error=" + encodeURIComponent("That code didn't match. Try the next one your app shows."));
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE users SET totp_enabled_at = ? WHERE id = ?"
  ).bind(now, user.id).run();
  // Mark current session as verified so the user doesn't have to
  // re-enter immediately.
  const sessionToken = getSessionToken(request);
  if (sessionToken) {
    await env.DB.prepare(
      "UPDATE sessions SET totp_verified = 1 WHERE id = ?"
    ).bind(sessionToken).run();
  }

  return redirect("/settings/2fa?flash=" + encodeURIComponent("Two-factor authentication is on. You'll be prompted for a code on each new sign-in."));
}

// ---------------------------------------------------------------------------
// POST /settings/2fa/disable
// ---------------------------------------------------------------------------

export async function handle2faDisablePost(request: Request, user: User, env: Env): Promise<Response> {
  if (!user.totp_secret || !user.totp_enabled_at) {
    return redirect("/settings/2fa?error=" + encodeURIComponent("2FA is not currently enabled."));
  }
  const form = await request.formData();
  const code = (form.get("code") as string || "").trim();
  const ok = await totpVerify(user.totp_secret, code);
  if (!ok) {
    return redirect("/settings/2fa?error=" + encodeURIComponent("That code didn't match. 2FA stays on."));
  }
  await env.DB.prepare(
    "UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_recovery_codes = NULL WHERE id = ?"
  ).bind(user.id).run();
  return redirect("/settings/2fa?flash=" + encodeURIComponent("2FA disabled. Your account is now protected only by magic-link sign-in."));
}

// ---------------------------------------------------------------------------
// GET /auth/2fa-challenge
// ---------------------------------------------------------------------------

export async function handle2faChallengeGet(user: User | null, env: Env, url: URL): Promise<Response> {
  if (!user) return redirect("/login");
  if (!user.totp_enabled_at) return redirect("/");
  const errorMsg = url.searchParams.get("error");
  const next = url.searchParams.get("next") || "/";

  const body = `
    <div style="max-width:400px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>One more step</em></h1>
      <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
        Enter the 6-digit code from your authenticator app for ${esc(user.email)}.
      </p>
      ${errorMsg ? `<div class="flash flash-error" style="margin-bottom:16px">${esc(errorMsg)}</div>` : ""}
      <form method="POST" action="/auth/2fa-challenge" style="display:flex;flex-direction:column;gap:14px">
        <input type="hidden" name="next" value="${esc(next)}">
        <input type="text" name="code" required maxlength="6" pattern="[0-9]{6}" placeholder="000000" autocomplete="one-time-code" inputmode="numeric" autofocus
               style="font-family:var(--mono);font-size:22px;letter-spacing:.4em;text-align:center;padding:14px">
        <button type="submit" class="btn" style="width:100%;justify-content:center">Verify</button>
        <details style="margin-top:6px;text-align:left">
          <summary style="cursor:pointer;font-size:12px;color:var(--text-faint);text-align:center">Lost your authenticator? Use a recovery code</summary>
          <div style="margin-top:10px">
            <input type="text" name="recovery_code" maxlength="14" placeholder="xxxx-xxx-xxx"
                   style="font-family:var(--mono);width:100%;text-align:center;letter-spacing:.1em">
            <p class="muted" style="font-size:11px;margin-top:6px;text-align:center">A recovery code can be entered above (in place of the 6-digit code). Each works once.</p>
          </div>
        </details>
      </form>
    </div>
  `;
  return html(layout("Two-factor", body, user));
}

// ---------------------------------------------------------------------------
// POST /auth/2fa-challenge
// ---------------------------------------------------------------------------

export async function handle2faChallengePost(request: Request, user: User | null, env: Env): Promise<Response> {
  if (!user) return redirect("/login");
  if (!user.totp_secret || !user.totp_enabled_at) return redirect("/");

  const form = await request.formData();
  const code = (form.get("code") as string || "").trim();
  const recoveryCode = (form.get("recovery_code") as string || "").trim();
  const next = (form.get("next") as string || "/").trim();
  // Only allow same-origin destinations.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  let verified = false;

  // Path 1: TOTP code
  if (code) {
    verified = await totpVerify(user.totp_secret, code);
  }

  // Path 2: recovery code
  if (!verified && recoveryCode && user.totp_recovery_codes) {
    try {
      const codes: string[] = JSON.parse(user.totp_recovery_codes);
      const remaining = consumeRecoveryCode(codes, recoveryCode);
      if (remaining !== null) {
        verified = true;
        await env.DB.prepare(
          "UPDATE users SET totp_recovery_codes = ? WHERE id = ?"
        ).bind(JSON.stringify(remaining), user.id).run();
      }
    } catch {
      // Bad JSON in DB; treat as no codes available.
    }
  }

  if (!verified) {
    return redirect("/auth/2fa-challenge?error=" + encodeURIComponent("That code didn't match.") + "&next=" + encodeURIComponent(safeNext));
  }

  // Mark session verified.
  const sessionToken = getSessionToken(request);
  if (sessionToken) {
    await env.DB.prepare(
      "UPDATE sessions SET totp_verified = 1 WHERE id = ?"
    ).bind(sessionToken).run();
  }

  return redirect(safeNext);
}
