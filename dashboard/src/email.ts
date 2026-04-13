/**
 * Dashboard — Email sending via Resend
 */

import type { Env } from "./types";

export async function sendMagicLinkEmail(
  email: string,
  token: string,
  env: Env
): Promise<boolean> {
  const loginUrl = `https://app.neverranked.com/auth/verify?token=${token}`;

  // If no Resend key, log to console (dev mode)
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Magic link for ${email}: ${loginUrl}`);
    return true;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Never Ranked <login@neverranked.com>",
        to: [email],
        subject: "Sign in to Never Ranked",
        text: `Click to sign in:\n\n${loginUrl}\n\nThis link expires in 15 minutes.\n\n— Never Ranked`,
        html: `
          <div style="font-family:monospace;font-size:14px;color:#333;max-width:480px;margin:0 auto;padding:40px 20px">
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#1a1a1a">Never Ranked</p>
            <p style="margin:0 0 24px">Click the button below to sign in to your dashboard.</p>
            <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:#e8c767;font-family:monospace;font-size:13px;text-decoration:none;letter-spacing:.05em">Sign in</a>
            <p style="margin:24px 0 0;font-size:12px;color:#888">This link expires in 15 minutes. If you did not request this, ignore this email.</p>
          </div>
        `,
      }),
    });

    return resp.ok;
  } catch (err) {
    console.error("Email send failed:", err);
    return false;
  }
}
