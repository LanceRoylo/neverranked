/**
 * Route: GET /track/pitch/<slug>
 *
 * Tracking pixel for /pitch/* pages on the marketing site. Every pitch
 * page embeds <img src="https://app.neverranked.com/track/pitch/<slug>">
 * which fires this endpoint on every page load. We log one row per
 * request and return a 1x1 transparent GIF.
 *
 * Privacy posture:
 *  - Raw IP is hashed (SHA-256 + project salt, truncated to 16 hex)
 *    before storage. We can count distinct openers, we cannot
 *    re-identify them.
 *  - User agent stored as-is for bot classification.
 *  - No cookies, no localStorage, no fingerprinting.
 *
 * Bot classification:
 *  - LinkedInBot, Slackbot-LinkExpanding, Twitterbot, facebookexternalhit,
 *    WhatsApp, TelegramBot, Discordbot, search engine crawlers, and Apple
 *    Mail's privacy proxy all get is_bot=1 so the dashboard can filter
 *    them out by default.
 *
 * Slug validation:
 *  - Only [a-z0-9-]{1,80} accepted to keep the table clean from probing.
 */

import type { Env } from "../types";

const SALT = "neverranked-pitch-tracker-v1";

// 1x1 transparent GIF (43 bytes).
const PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

const PIXEL_HEADERS: Record<string, string> = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, private",
  Pragma: "no-cache",
  Expires: "0",
  "Access-Control-Allow-Origin": "*",
};

function isBotUA(ua: string): boolean {
  if (!ua) return 1 ? true : false; // empty UA = treat as bot
  const lower = ua.toLowerCase();
  // Social/preview bots
  if (/linkedinbot|slackbot|twitterbot|facebookexternalhit|whatsapp|telegrambot|discordbot|skypeuripreview|redditbot/.test(lower)) return true;
  // Search engine crawlers
  if (/googlebot|bingbot|yandexbot|baiduspider|duckduckbot|applebot|petalbot|meta-externalagent|google-inspectiontool|ahrefsbot|semrushbot|mj12bot/.test(lower)) return true;
  // Email privacy proxies and security scanners
  if (/apple-mail|gmailimageproxy|google-image-proxy|yahoomailproxy|symantec|barracuda|mimecast|proofpoint|microsoft\s*office|skypeuripreview/.test(lower)) return true;
  // Programmatic / scripted clients (the bucket my own curl test fell into)
  if (/^curl\/|^wget\/|python-requests|python-urllib|^go-http-client|^node-fetch|^axios\/|^undici|^okhttp|^java\/|^libwww|^ruby\/|^php\/|^http\.rb|httpclient/.test(lower)) return true;
  // Headless / automation
  if (/headlesschrome|phantomjs|selenium|playwright|puppeteer|cypress/.test(lower)) return true;
  return false;
}

async function hashIP(ip: string): Promise<string> {
  if (!ip) return "";
  const enc = new TextEncoder();
  const data = enc.encode(ip + SALT);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pixelResponse(): Response {
  return new Response(PIXEL, { headers: PIXEL_HEADERS });
}

export async function handleTrackPitch(
  slug: string,
  request: Request,
  env: Env,
): Promise<Response> {
  // Always return the pixel, even on validation failure, so a caller cannot
  // probe for valid slugs by observing different responses.
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return pixelResponse();
  }

  const ua = request.headers.get("User-Agent") || "";
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const country = request.headers.get("CF-IPCountry") || "";
  const referer = request.headers.get("Referer") || "";

  const isBot = isBotUA(ua) ? 1 : 0;
  const ipHash = await hashIP(ip);
  const now = Math.floor(Date.now() / 1000);

  // Best-effort logging. If the DB call fails, still return the pixel.
  try {
    await (env as { DB: D1Database }).DB.prepare(
      `INSERT INTO pitch_opens (slug, opened_at, ip_hash, user_agent, is_bot, referer, country)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
      .bind(slug, now, ipHash, ua.slice(0, 500), isBot, referer.slice(0, 500), country)
      .run();
  } catch {
    // Swallow. The pixel returns either way.
  }

  return pixelResponse();
}
