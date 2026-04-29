/**
 * Bot Analytics -- detect + log AI/search bot user-agents that fetch
 * the schema injection script for a given client.
 *
 * Why this exists: Ahrefs has "Bot Analytics" (which AI crawlers visit
 * your site, how often). The most credible AEO claim is "we know which
 * AI engines are seeing you." We have a unique vantage point: every
 * page on the customer's site loads /inject/<slug>.js, so every fetch
 * of that endpoint is a real signal of who's reading the page.
 *
 * Coverage caveat: training crawlers that scrape raw HTML without
 * executing JS will NOT fetch this script. We surface this honestly
 * in the dashboard. The strong signal is for citation-time crawlers
 * (ChatGPT-User, Perplexity, Claude-Web) that fetch external assets
 * when generating an answer.
 */

import type { Env } from "./types";
import { hashIP } from "./analytics";

// Order matters: list specific patterns BEFORE generic ones. We pick
// the first match. e.g. 'GPTBot' must come before any catch-all that
// could swallow it, and 'ChatGPT-User' must come before a hypothetical
// 'ChatGPT' alone.
interface BotPattern {
  /** Internal bucket key stored in bot_hits.bot_pattern. */
  key: string;
  /** Regex against the User-Agent header. Case-insensitive. */
  match: RegExp;
  /** Human-readable label for dashboard rendering. */
  label: string;
  /** True when this bot likely indicates AI training or AI-citation
   *  activity (vs. classic search indexing). Used to roll up the
   *  "AI bot" total separately from "Search bot" total. */
  ai: boolean;
}

export const BOT_PATTERNS: BotPattern[] = [
  // OpenAI
  { key: "openai_train",     match: /GPTBot/i,                label: "OpenAI (training)",      ai: true  },
  { key: "openai_browse",    match: /ChatGPT-User/i,          label: "ChatGPT (browse/cite)",  ai: true  },
  { key: "openai_search",    match: /OAI-SearchBot/i,         label: "ChatGPT Search",         ai: true  },
  // Anthropic -- note Claude-Web before claudebot, and anthropic-ai
  // is a legacy crawler name still used in some places.
  { key: "anthropic_browse", match: /Claude-Web/i,            label: "Claude (browse/cite)",   ai: true  },
  { key: "anthropic_train",  match: /ClaudeBot|anthropic-ai/i,label: "Anthropic (training)",   ai: true  },
  // Perplexity
  { key: "perplexity",       match: /PerplexityBot/i,         label: "Perplexity",             ai: true  },
  { key: "perplexity_user",  match: /Perplexity-User/i,       label: "Perplexity (browse)",    ai: true  },
  // Google
  { key: "google_extended",  match: /Google-Extended/i,       label: "Google AI (training)",   ai: true  },
  { key: "google",           match: /Googlebot|Googlebot-Image|Googlebot-Video/i, label: "Google Search", ai: false },
  // Apple
  { key: "apple_extended",   match: /Applebot-Extended/i,     label: "Apple AI (training)",    ai: true  },
  { key: "apple",            match: /Applebot/i,              label: "Apple Search",           ai: false },
  // Meta
  { key: "meta",             match: /Meta-ExternalAgent|FacebookBot/i, label: "Meta AI",       ai: true  },
  // ByteDance
  { key: "bytedance",        match: /Bytespider/i,            label: "ByteDance",              ai: true  },
  // Common Crawl -- used as training data by many models
  { key: "commoncrawl",      match: /CCBot/i,                 label: "Common Crawl",           ai: true  },
  // Microsoft
  { key: "bing",             match: /Bingbot|BingPreview/i,   label: "Bing Search",            ai: false },
  // Cohere, Mistral, others not yet seen in the wild
  { key: "cohere",           match: /Cohere-AI/i,             label: "Cohere",                 ai: true  },
  // DuckDuckGo (uses Bing data but also has its own)
  { key: "duckduckgo",       match: /DuckDuckBot/i,           label: "DuckDuckGo",             ai: false },
  // Yandex (still relevant outside US)
  { key: "yandex",           match: /YandexBot/i,             label: "Yandex",                 ai: false },
  // Generic AI catch-all -- if UA contains 'AI', 'bot', 'crawl', and
  // didn't match anything above. We bucket as other_ai when the UA
  // mentions AI/LLM keywords.
  { key: "other_ai",         match: /\bAI\b|LLM|GPT|Anthropic|OpenAI|generative/i, label: "Other AI bot", ai: true },
  // Generic crawler fallback
  { key: "other_bot",        match: /bot|crawler|spider|fetch/i, label: "Other crawler",       ai: false },
];

/** Look up the canonical bot bucket for a given user-agent.
 *  Returns null when the UA looks human (no recognized bot tokens). */
export function detectBot(ua: string | null | undefined): BotPattern | null {
  if (!ua) return null;
  for (const p of BOT_PATTERNS) {
    if (p.match.test(ua)) return p;
  }
  return null;
}

/** Map bucket key -> label, for dashboard rendering. */
export function botLabel(key: string): string {
  const p = BOT_PATTERNS.find(b => b.key === key);
  return p?.label ?? key;
}

/** True when this bucket counts toward the AI-bot total. */
export function isAiBot(key: string): boolean {
  const p = BOT_PATTERNS.find(b => b.key === key);
  return !!p?.ai;
}

/** Log a bot hit. Best-effort, fire-and-forget from the request path
 *  via ctx.waitUntil(). Caller should NOT await this on the hot path.
 *
 *  Returns the matched pattern (if any) so the caller can decide
 *  whether to also write any other side-effects. */
export async function logBotHit(
  env: Env,
  params: {
    clientSlug: string;
    userAgent: string | null | undefined;
    ip: string | null | undefined;
    refererPath: string | null | undefined;
  },
): Promise<BotPattern | null> {
  const matched = detectBot(params.userAgent);
  if (!matched) return null;

  try {
    const ipHash = params.ip ? await hashIP(params.ip) : null;
    const ua = (params.userAgent || "").slice(0, 240);
    const ref = (params.refererPath || "").slice(0, 200);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO bot_hits (client_slug, bot_pattern, user_agent, ip_hash, referer_path, hit_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(params.clientSlug, matched.key, ua, ipHash, ref, now).run();
  } catch (e) {
    // Logging is best-effort; never let a bot-tracking failure break
    // the inject script response.
    console.log(`[bot-analytics] log failed for ${params.clientSlug}: ${e}`);
  }
  return matched;
}

/** Helper: extract just the path portion of a referer URL. We don't
 *  want to store the full referer (it can contain query strings with
 *  PII like email addresses, OAuth tokens, etc.). */
export function refererPath(refererHeader: string | null): string | null {
  if (!refererHeader) return null;
  try {
    const u = new URL(refererHeader);
    return u.pathname.slice(0, 200);
  } catch {
    return null;
  }
}
