/**
 * GET /free/unsubscribe?token=...
 *
 * One-click opt-out for free-tier weekly emails. The token IS the
 * auth -- no cookie required -- so users can unsubscribe from
 * inside the email client without signing in.
 *
 * Setting email_alerts = 0 stops the weekly digest and any
 * score-drop alerts. The free_users row stays put so the user can
 * re-subscribe by toggling the setting if they sign back in.
 */

import type { Env } from "../types";
import { html, layout, esc } from "../render";

function unsubscribedPage(domain: string): string {
  return layout("Unsubscribed", `
    <div style="max-width:440px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>Unsubscribed</em></h1>
      <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
        You will no longer receive weekly AEO score emails for <strong>${esc(domain)}</strong>.
        Your score is still being measured. You can resubscribe anytime from /free.
      </p>
      <a href="https://neverranked.com" class="btn btn-ghost">Back to neverranked.com</a>
    </div>
  `);
}

function invalidTokenPage(): string {
  return layout("Link not recognized", `
    <div style="max-width:440px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>Link not recognized</em></h1>
      <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
        This unsubscribe link is not valid. If you are trying to stop emails, sign in at /free and toggle the setting.
      </p>
    </div>
  `);
}

export async function handleFreeUnsubscribe(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (!token || token.length !== 32) {
    return html(invalidTokenPage(), 400);
  }

  const user = await env.DB.prepare(
    "SELECT id, domain FROM free_users WHERE unsub_token = ?"
  ).bind(token).first<{ id: number; domain: string }>();

  if (!user) {
    return html(invalidTokenPage(), 404);
  }

  await env.DB.prepare("UPDATE free_users SET email_alerts = 0 WHERE id = ?")
    .bind(user.id)
    .run();

  return html(unsubscribedPage(user.domain));
}
