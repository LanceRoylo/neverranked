/**
 * GET /free/auth?token=...
 *
 * Verifies the magic link token from a free-tier signup email,
 * mints a free_sessions row, sets the nr_free cookie, and
 * redirects to /free.
 *
 * Parallel to handleVerify in routes/login.ts but for free users.
 */

import type { Env } from "../types";
import { html, layout } from "../render";
import { verifyFreeMagicLink, freeSessionCookie } from "../free-auth";

function linkExpiredPage(): string {
  return layout("Link expired", `
    <div style="max-width:440px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>Link expired</em></h1>
      <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
        This confirmation link has expired or has already been used. Request a new one.
      </p>
      <a href="/free/signup" class="btn">Start over</a>
    </div>
  `);
}

export async function handleFreeAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (!token || token.length !== 64) {
    return html(linkExpiredPage(), 400);
  }

  const result = await verifyFreeMagicLink(token, env);
  if (!result) {
    return html(linkExpiredPage(), 400);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/free",
      "Set-Cookie": freeSessionCookie(result.sessionToken),
    },
  });
}
