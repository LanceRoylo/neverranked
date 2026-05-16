/**
 * GET|POST /unsubscribe?id=<prospectId>&token=<16hex>
 *
 * The outreach cold-email List-Unsubscribe + footer link target.
 * lib/email.js (now run on the Fly host, UNCHANGED) signs:
 *   token = HMAC-SHA256(String(prospectId), secret).hex.slice(0,16)
 *   secret = config.unsubscribe_secret || 'neverranked-unsub-secret-change-me'
 * UNSUBSCRIBE_SECRET was deliberately left unset on the host (Stage
 * B: preserve laptop-identical behavior), so the host signs with the
 * hardcoded DEFAULT. This route had NO handler -> every one-click /
 * footer unsubscribe 404'd: a live CAN-SPAM + Gmail/Yahoo one-click
 * deliverability problem. Fix: verify against BOTH the real
 * OUTREACH_UNSUBSCRIBE_SECRET (if set) AND the default, so every
 * past and future link works; harden to real-secret-only later.
 *
 * Handles GET (footer click -> confirmation page) and POST (RFC
 * 8058 List-Unsubscribe-Post one-click -> 200). Token required (no
 * unauthenticated unsubscribe-by-id — that's an abuse vector).
 */
import type { Env } from "../types";

const DEFAULT_SECRET = "neverranked-unsub-secret-change-me";

async function tokenMatches(
  prospectId: string,
  token: string,
  secret: string,
): Promise<boolean> {
  if (!secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(prospectId));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  // Constant-time compare (same pattern as the tracking-pixel token).
  if (hex.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) {
    diff |= hex.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><style>body{font-family:Georgia,serif;background:#121212;color:#b3a99a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:32px}h1{color:#fbf8ef;font-weight:600;font-size:22px;margin:0 0 12px}p{margin:0 0 8px;line-height:1.6;max-width:42ch}a{color:#e8c767}</style></head><body><div><h1>${title}</h1>${body}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow" } },
  );
}

export async function handleOutreachUnsubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const token = url.searchParams.get("token");
  const isPost = request.method === "POST";

  if (!id || !token || !/^\d+$/.test(id)) {
    return isPost
      ? new Response("bad request", { status: 400 })
      : page(
          "Invalid unsubscribe link",
          `<p>This link is missing information. To opt out, reply <strong>STOP</strong> to the email and you will be removed.</p>`,
          400,
        );
  }

  const real = (env as any).OUTREACH_UNSUBSCRIBE_SECRET || "";
  const candidates = real ? [real, DEFAULT_SECRET] : [DEFAULT_SECRET];
  let valid = false;
  for (const s of candidates) {
    if (await tokenMatches(id, token, s)) {
      valid = true;
      break;
    }
  }
  if (!valid) {
    return isPost
      ? new Response("invalid token", { status: 400 })
      : page(
          "Invalid unsubscribe link",
          `<p>We could not verify this link. To opt out, reply <strong>STOP</strong> to the email and you will be removed.</p>`,
          400,
        );
  }

  const pid = parseInt(id, 10);
  try {
    const row = await env.DB.prepare(
      "SELECT unsubscribed FROM outreach_prospects_master WHERE id = ?",
    )
      .bind(pid)
      .first<{ unsubscribed: number }>();
    if (row && !row.unsubscribed) {
      // Mirror the reply-path unsubscribe (worker markUnsubscribed)
      // exactly: flag + one send_log row. Idempotent — re-clicks
      // don't double-log.
      await env.DB.prepare(
        "UPDATE outreach_prospects_master SET unsubscribed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
        .bind(pid)
        .run();
      await env.DB.prepare(
        "INSERT INTO outreach_send_log (prospect_id, action) VALUES (?, 'unsubscribed')",
      )
        .bind(pid)
        .run();
    }
  } catch {
    // Even if the write fails, do not error the recipient. The
    // mailto/STOP fallback still works; we log nothing sensitive.
  }

  if (isPost) {
    // RFC 8058: one-click expects a 2xx. Body irrelevant.
    return new Response("Unsubscribed", { status: 200 });
  }
  return page(
    "You're unsubscribed",
    `<p>You will not receive any more emails from NeverRanked outreach.</p><p>That is the only action this page takes.</p>`,
  );
}
