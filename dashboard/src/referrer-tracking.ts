/**
 * AI referrer tracking.
 *
 * Companion to bot-analytics: bots log server-side from the inject
 * script fetch. Humans coming from AI engines (ChatGPT, Perplexity,
 * Gemini, Claude, etc.) get logged client-side via the snippet
 * reading document.referrer and POSTing to /track/referral/:token
 * when the host matches a known AI engine.
 *
 * Coverage caveat surfaced in the dashboard: only counts visitors
 * whose browser sends a Referer header (most do, but some privacy
 * tools strip it). Direct visits, social referrers, and search
 * engines aren't logged -- that's not what this is for.
 */

import type { Env } from "./types";

// ---------- Engine classification ----------

interface EngineRule {
  engine: string;
  hosts: RegExp;
}

// Anchor each pattern to end-of-string so "openai.com.example.com" doesn't
// match. Subdomain-tolerant.
const ENGINE_RULES: EngineRule[] = [
  { engine: "openai",     hosts: /(?:^|\.)(?:chat\.openai\.com|chatgpt\.com)$/i },
  { engine: "perplexity", hosts: /(?:^|\.)perplexity\.ai$/i },
  { engine: "gemini",     hosts: /(?:^|\.)(?:gemini\.google\.com|bard\.google\.com)$/i },
  { engine: "claude",     hosts: /(?:^|\.)claude\.ai$/i },
  { engine: "copilot",    hosts: /(?:^|\.)(?:copilot\.microsoft\.com|m365\.cloud\.microsoft)$/i },
  { engine: "deepseek",   hosts: /(?:^|\.)(?:chat\.deepseek\.com|deepseek\.com)$/i },
  { engine: "meta_ai",    hosts: /(?:^|\.)meta\.ai$/i },
];

export function classifyAiReferrer(host: string | null): string | null {
  if (!host) return null;
  const h = host.toLowerCase().trim();
  for (const rule of ENGINE_RULES) {
    if (rule.hosts.test(h)) return rule.engine;
  }
  return null;
}

const ENGINE_LABELS: Record<string, string> = {
  openai: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  claude: "Claude",
  copilot: "Microsoft Copilot",
  deepseek: "DeepSeek",
  meta_ai: "Meta AI",
  other_ai: "Other AI",
};

export function engineLabel(slug: string): string {
  return ENGINE_LABELS[slug] || slug;
}

// ---------- Hashing (matches bot-analytics + analytics convention) ----------

async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const data = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 32);
}

// ---------- Ingest ----------

export interface ReferrerHitInput {
  clientSlug: string;
  engine: string;
  referrerHost: string;
  landingPath: string | null;
  ip: string | null;
}

export async function logReferrerHit(env: Env, input: ReferrerHitInput): Promise<void> {
  const ipHash = await hashIp(input.ip);
  const now = Math.floor(Date.now() / 1000);
  const landing = (input.landingPath ?? "").slice(0, 200);
  await env.DB.prepare(
    `INSERT INTO referrer_hits (client_slug, engine, referrer_host, landing_path, ip_hash, hit_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(input.clientSlug, input.engine, input.referrerHost, landing, ipHash, now).run();
}

// ---------- Aggregation for dashboard ----------

export interface PerEngineStat {
  engine: string;
  hits_7d: number;
  hits_30d: number;
  last_seen: number;
}

export async function getReferrerStats(env: Env, clientSlug: string): Promise<{
  totals: { hits_7d: number; hits_30d: number; distinctEngines: number };
  perEngine: PerEngineStat[];
  topLandingPages: { path: string; hits_30d: number }[];
}> {
  const now = Math.floor(Date.now() / 1000);
  const sevenAgo = now - 7 * 86400;
  const thirtyAgo = now - 30 * 86400;

  const perEngine = (await env.DB.prepare(
    `SELECT engine,
            SUM(CASE WHEN hit_at >= ? THEN 1 ELSE 0 END) AS hits_7d,
            SUM(CASE WHEN hit_at >= ? THEN 1 ELSE 0 END) AS hits_30d,
            MAX(hit_at) AS last_seen
       FROM referrer_hits
       WHERE client_slug = ? AND hit_at >= ?
       GROUP BY engine
       ORDER BY hits_30d DESC, last_seen DESC`,
  ).bind(sevenAgo, thirtyAgo, clientSlug, thirtyAgo).all<PerEngineStat>()).results;

  const topPages = (await env.DB.prepare(
    `SELECT landing_path AS path, COUNT(*) AS hits_30d
       FROM referrer_hits
       WHERE client_slug = ? AND hit_at >= ? AND landing_path IS NOT NULL AND landing_path != ''
       GROUP BY landing_path
       ORDER BY hits_30d DESC
       LIMIT 10`,
  ).bind(clientSlug, thirtyAgo).all<{ path: string; hits_30d: number }>()).results;

  return {
    totals: {
      hits_7d: perEngine.reduce((s, e) => s + e.hits_7d, 0),
      hits_30d: perEngine.reduce((s, e) => s + e.hits_30d, 0),
      distinctEngines: perEngine.filter(e => e.hits_30d > 0).length,
    },
    perEngine,
    topLandingPages: topPages,
  };
}

// ---------- Snippet code generator ----------

/**
 * The browser-side JS we append to the inject script. Reads
 * document.referrer, classifies it client-side against the same engine
 * patterns (mirroring server logic), and POSTs to /track/referral/:token
 * when matched. Uses sendBeacon when available so it never blocks
 * page rendering. Silent on non-AI referrers.
 *
 * The token is the per-client snippet_token from injection_configs --
 * authenticates without exposing the slug in client code.
 */
export function referrerTrackingSnippet(snippetToken: string, dashboardOrigin: string): string {
  // Engine patterns are inlined as a JS array. Keep this in lockstep with
  // ENGINE_RULES above. Server still re-classifies on receive in case a
  // misbehaving client lies about engine, so this is just for filtering
  // (don't bother hitting our endpoint for google.com referrers).
  const patterns = [
    "chat.openai.com", "chatgpt.com",
    "perplexity.ai",
    "gemini.google.com", "bard.google.com",
    "claude.ai",
    "copilot.microsoft.com",
    "chat.deepseek.com", "deepseek.com",
    "meta.ai",
  ];
  return `
(function(){
  try {
    var ref = document.referrer;
    if (!ref) return;
    var host = "";
    try { host = new URL(ref).hostname.toLowerCase(); } catch(e) { return; }
    var patterns = ${JSON.stringify(patterns)};
    var matched = false;
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (host === p || host.endsWith("." + p)) { matched = true; break; }
    }
    if (!matched) return;
    var payload = JSON.stringify({
      h: host,
      p: (location.pathname + location.search).slice(0, 200)
    });
    var url = "${dashboardOrigin}/track/referral/${snippetToken}";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    } else {
      fetch(url, { method: "POST", body: payload, headers: { "content-type": "application/json" }, keepalive: true, mode: "no-cors" });
    }
  } catch(e) { /* no-op -- never break the customer's page */ }
})();
`;
}
