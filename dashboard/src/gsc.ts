/**
 * Google Search Console integration
 *
 * Handles OAuth 2.0 token management and GSC API data fetching.
 * Admin-only: one Google account connects and pulls data for all client sites.
 */

import type { Env, GscToken } from "./types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_API = "https://www.googleapis.com/webmasters/v3";
const REDIRECT_PATH = "/auth/google/callback";
const SCOPES = "https://www.googleapis.com/auth/webmasters.readonly";

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

export function getGoogleAuthUrl(env: Env, origin: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID || "",
    redirect_uri: origin + REDIRECT_PATH,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  return GOOGLE_AUTH_URL + "?" + params.toString();
}

export async function exchangeCodeForTokens(
  code: string,
  env: Env,
  origin: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID || "",
      client_secret: env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: origin + REDIRECT_PATH,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error("Google token exchange failed: " + resp.status + " " + err);
  }

  return (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

async function refreshAccessToken(
  refreshToken: string,
  env: Env
): Promise<{ access_token: string; expires_in: number }> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID || "",
      client_secret: env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error("Google token refresh failed: " + resp.status + " " + err);
  }

  return (await resp.json()) as { access_token: string; expires_in: number };
}

/** Get a valid access token, refreshing if needed */
export async function getValidToken(env: Env): Promise<string | null> {
  const token = await env.DB.prepare(
    "SELECT * FROM gsc_tokens ORDER BY updated_at DESC LIMIT 1"
  ).first<GscToken>();

  if (!token) return null;

  const now = Math.floor(Date.now() / 1000);

  // If token expires in less than 5 minutes, refresh it
  if (token.expires_at < now + 300) {
    try {
      const refreshed = await refreshAccessToken(token.refresh_token, env);
      const newExpires = now + refreshed.expires_in;
      await env.DB.prepare(
        "UPDATE gsc_tokens SET access_token = ?, expires_at = ?, updated_at = ? WHERE id = ?"
      ).bind(refreshed.access_token, newExpires, now, token.id).run();
      return refreshed.access_token;
    } catch (err) {
      // Refresh failed -- token is dead until someone re-authenticates.
      // Surface this loudly so the silent break that ate two weeks of
      // GSC pulls (Apr 14 - Apr 28 2026) cannot recur. Dedup over a
      // 24h window so the daily cron doesn't spam the inbox.
      console.log("GSC token refresh failed: " + err);
      try {
        const { createAlertIfFresh } = await import("./admin-alerts");
        await createAlertIfFresh(env, {
          clientSlug: "_system",
          type: "gsc_token_dead",
          title: "Google Search Console disconnected",
          detail: `Token refresh failed at ${new Date().toISOString()}. Re-authenticate at /admin/gsc to resume daily pulls. Last error: ${String(err).slice(0, 200)}`,
          windowHours: 24,
        });
      } catch {}
      return null;
    }
  }

  return token.access_token;
}

/** True when no token exists or refresh has failed in the last hour.
 *  Used by /search and /admin/gsc surfaces to render a re-auth banner
 *  rather than silently showing stale data. Cheap (one query, no fetch). */
export async function isGscDisconnected(env: Env): Promise<boolean> {
  const token = await env.DB.prepare(
    "SELECT expires_at, refresh_token FROM gsc_tokens ORDER BY updated_at DESC LIMIT 1"
  ).first<{ expires_at: number; refresh_token: string }>();
  if (!token || !token.refresh_token) return true;
  // If we're within 5 minutes of expiry and the most recent admin
  // alert says we're dead, treat as disconnected.
  const now = Math.floor(Date.now() / 1000);
  if (token.expires_at < now + 300) {
    const recentDead = await env.DB.prepare(
      `SELECT id FROM admin_alerts
         WHERE type = 'gsc_token_dead'
           AND created_at > ?
         LIMIT 1`
    ).bind(now - 3600).first<{ id: number }>();
    return !!recentDead;
  }
  return false;
}

// ---------------------------------------------------------------------------
// GSC API calls
// ---------------------------------------------------------------------------

/** List all sites the connected account has access to */
export async function listSites(accessToken: string): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const resp = await fetch(GSC_API + "/sites", {
    headers: { Authorization: "Bearer " + accessToken },
  });

  if (!resp.ok) {
    console.log("GSC list sites failed: " + resp.status);
    return [];
  }

  const data = (await resp.json()) as {
    siteEntry?: { siteUrl: string; permissionLevel: string }[];
  };

  return data.siteEntry || [];
}

interface GscQueryRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscSearchResponse {
  rows?: GscQueryRow[];
  responseAggregationType?: string;
}

/** Fetch search analytics for a site over a date range */
export async function fetchSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimension: "query" | "page" = "query",
  rowLimit: number = 20
): Promise<GscQueryRow[]> {
  const resp = await fetch(
    GSC_API + "/sites/" + encodeURIComponent(siteUrl) + "/searchAnalytics/query",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: [dimension],
        rowLimit,
        dataState: "final",
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.log("GSC search analytics failed for " + siteUrl + ": " + resp.status + " " + err);
    return [];
  }

  const data = (await resp.json()) as GscSearchResponse;
  return data.rows || [];
}

/** Fetch aggregate totals (no dimensions) for a site */
export async function fetchAggregateTotals(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<{ clicks: number; impressions: number; ctr: number; position: number }> {
  const resp = await fetch(
    GSC_API + "/sites/" + encodeURIComponent(siteUrl) + "/searchAnalytics/query",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dataState: "final",
      }),
    }
  );

  if (!resp.ok) {
    return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  }

  const data = (await resp.json()) as GscSearchResponse;
  if (data.rows && data.rows.length > 0) {
    const r = data.rows[0];
    return { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
  }
  return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

// ---------------------------------------------------------------------------
// Weekly GSC data pull (called from cron)
// ---------------------------------------------------------------------------

export async function pullGscData(env: Env): Promise<void> {
  const accessToken = await getValidToken(env);
  if (!accessToken) {
    console.log("GSC: no valid token, skipping data pull");
    return;
  }

  // Get all linked properties
  const properties = (await env.DB.prepare(
    "SELECT * FROM gsc_properties"
  ).all<{ client_slug: string; site_url: string }>()).results;

  if (properties.length === 0) {
    console.log("GSC: no properties linked, skipping");
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // GSC data has a ~3 day delay, so pull last 7 days ending 3 days ago
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 3);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 6);

  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  for (const prop of properties) {
    try {
      // Get aggregate totals
      const totals = await fetchAggregateTotals(accessToken, prop.site_url, startStr, endStr);

      // Get top queries
      const queryRows = await fetchSearchAnalytics(accessToken, prop.site_url, startStr, endStr, "query", 20);
      const topQueries = queryRows.map(r => ({
        query: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: Math.round(r.position * 10) / 10,
      }));

      // Get top pages
      const pageRows = await fetchSearchAnalytics(accessToken, prop.site_url, startStr, endStr, "page", 20);
      const topPages = pageRows.map(r => ({
        page: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: Math.round(r.position * 10) / 10,
      }));

      // Store snapshot
      await env.DB.prepare(
        `INSERT INTO gsc_snapshots (client_slug, site_url, date_start, date_end, clicks, impressions, ctr, position, top_queries, top_pages, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        prop.client_slug,
        prop.site_url,
        startStr,
        endStr,
        totals.clicks,
        totals.impressions,
        totals.ctr,
        totals.position,
        JSON.stringify(topQueries),
        JSON.stringify(topPages),
        now
      ).run();

      console.log("GSC: pulled data for " + prop.site_url + " (" + prop.client_slug + "): " + totals.clicks + " clicks, " + totals.impressions + " impressions");
    } catch (err) {
      console.log("GSC: error pulling data for " + prop.site_url + ": " + err);
    }

    await new Promise(r => setTimeout(r, 300));
  }
}
