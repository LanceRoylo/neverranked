/**
 * Prompt discovery.
 *
 * Generates AI-prompt suggestions personalized to the client's actual
 * business context (not just industry+location placeholders), persists
 * as suggestions awaiting one-click review, and lets accepted prompts
 * graduate to citation_keywords.
 *
 * Context blob includes:
 *   - business_name + business_url + business_description from injection_configs
 *   - top schema types and red flags from the latest scan_results
 *   - top 10 GSC queries from the most recent gsc_snapshots row
 *
 * Generation uses Claude Sonnet (better at task-specific quality than
 * gpt-4o-mini, and we already pay for the Anthropic key). Each candidate
 * runs through assertHumanTone() before persist -- AI-tell prompts get
 * blocked the same as any other AI-generated customer surface.
 *
 * Rate-limit: callers should check via a simple per-day automation_log
 * flag if they want to gate the generate button. The module itself is
 * not rate-limited at this layer (tests and admin overrides shouldn't
 * have to fight a flag).
 */

import type { Env } from "./types";
import { addInboxItem } from "./admin-inbox";

const MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

interface ScanSummary {
  aeo_score: number | null;
  schema_types: string[];
  red_flags: string[];
  url: string | null;
}

interface GscQuery { query: string; clicks: number; impressions: number }

export interface DiscoveryContext {
  businessName: string;
  businessUrl: string;
  businessDescription: string;
  industryHint: string;     // best-effort guess from scan, optional
  locationHint: string;     // best-effort guess from address, optional
  scanSummary: ScanSummary | null;
  topGscQueries: GscQuery[];
  existingTrackedCount: number;
}

export async function discoverContext(env: Env, clientSlug: string): Promise<DiscoveryContext> {
  const config = await env.DB.prepare(
    `SELECT business_name, business_url, business_description, business_address
       FROM injection_configs WHERE client_slug = ?`,
  ).bind(clientSlug).first<{
    business_name: string | null; business_url: string | null;
    business_description: string | null; business_address: string | null;
  }>();

  const domain = await env.DB.prepare(
    `SELECT id, domain FROM domains
       WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1`,
  ).bind(clientSlug).first<{ id: number; domain: string }>();

  let scanSummary: ScanSummary | null = null;
  if (domain) {
    const scan = await env.DB.prepare(
      `SELECT url, aeo_score, schema_types, red_flags FROM scan_results
         WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1`,
    ).bind(domain.id).first<{ url: string; aeo_score: number; schema_types: string; red_flags: string }>();
    if (scan) {
      try {
        scanSummary = {
          aeo_score: scan.aeo_score ?? null,
          schema_types: JSON.parse(scan.schema_types || "[]"),
          red_flags: JSON.parse(scan.red_flags || "[]"),
          url: scan.url,
        };
      } catch { /* shape drift, skip */ }
    }
  }

  // Top GSC queries from the latest snapshot, if connected.
  let topGscQueries: GscQuery[] = [];
  const gscSnap = await env.DB.prepare(
    `SELECT top_queries FROM gsc_snapshots WHERE client_slug = ? ORDER BY date_end DESC LIMIT 1`,
  ).bind(clientSlug).first<{ top_queries: string }>();
  if (gscSnap?.top_queries) {
    try {
      const arr = JSON.parse(gscSnap.top_queries) as GscQuery[];
      topGscQueries = (Array.isArray(arr) ? arr : []).slice(0, 10);
    } catch { /* skip */ }
  }

  const tracked = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM citation_keywords WHERE client_slug = ? AND active = 1`,
  ).bind(clientSlug).first<{ n: number }>();

  // Light-touch hints. We don't try to infer industry from raw scan text;
  // the model handles that better with the description in front of it.
  const industryHint = config?.business_description ? "see description" : "infer from business context";
  const locationHint = config?.business_address ?? "infer from business URL/name if possible";

  return {
    businessName: config?.business_name ?? domain?.domain ?? clientSlug,
    businessUrl: config?.business_url ?? (domain ? `https://${domain.domain}` : ""),
    businessDescription: config?.business_description ?? "",
    industryHint,
    locationHint,
    scanSummary,
    topGscQueries,
    existingTrackedCount: tracked?.n ?? 0,
  };
}

// ---------- Prompt generation ----------

interface GeneratedPrompt {
  prompt: string;
  category: "problem" | "recommendation" | "comparison" | "scenario";
}

const SYSTEM = `You generate realistic prompts that real people would type into AI assistants (ChatGPT, Perplexity, Gemini, Claude) when they have a need that the named business could solve.

Rules:
- Conversational sentences, not Google-style keyword strings. People EXPLAIN their situation to AI.
- Include context, frustration, or specific situation when natural.
- Cover four categories evenly:
  - "problem"        : "I have <specific problem> in <area>. What are my options?"
  - "recommendation" : "Can you recommend a good <type of business> in <area> that <quality>?"
  - "comparison"     : "What should I look for when choosing a <type> in <area>? Who do you recommend?"
  - "scenario"       : "I'm <specific situation>. My current <provider> isn't working. Who else should I talk to?"
- Each prompt should plausibly cause AI to recommend specific businesses by name (with citations).
- Vary length: some long with backstory, some short and direct. Real users do both.
- NEVER use AI-tell language: no "feel free to", "delve into", "in today's fast-paced", em dashes, semicolons, "elevate", "robust", "comprehensive", "seamless", "in conclusion", "leverage", or three-adjective lists. Write like a real person typing in a chat box at 11pm.

Return STRICT JSON, no prose:
{
  "prompts": [
    { "prompt": "...", "category": "problem" | "recommendation" | "comparison" | "scenario" },
    ...
  ]
}`;

async function callSonnet(env: Env, userMessage: string, count: number): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage + `\n\nReturn exactly ${count} prompts.` }],
      max_tokens: 2200,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const json = await resp.json() as { content: { type: string; text: string }[] };
  return json.content[0]?.text ?? "";
}

function parsePrompts(raw: string): GeneratedPrompt[] {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fence ? fence[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { prompts?: unknown };
    if (!Array.isArray(obj.prompts)) return [];
    return obj.prompts
      .map((p) => p as { prompt?: unknown; category?: unknown })
      .map((p) => ({
        prompt: typeof p.prompt === "string" ? p.prompt.trim() : "",
        category: (typeof p.category === "string" && ["problem","recommendation","comparison","scenario"].includes(p.category))
          ? p.category as GeneratedPrompt["category"]
          : "problem" as const,
      }))
      .filter((p) => p.prompt.length > 0 && p.prompt.length < 500);
  } catch {
    return [];
  }
}

function buildUserMessage(ctx: DiscoveryContext): string {
  const schema = ctx.scanSummary?.schema_types?.length
    ? `Schema types deployed: ${ctx.scanSummary.schema_types.slice(0, 8).join(", ")}`
    : "";
  const flags = ctx.scanSummary?.red_flags?.length
    ? `Red flags from latest scan: ${ctx.scanSummary.red_flags.slice(0, 5).join("; ")}`
    : "";
  const gsc = ctx.topGscQueries.length
    ? `Top current Google search queries (organic, may inform AI prompt themes):\n${ctx.topGscQueries.slice(0, 8).map(q => `  - "${q.query}" (${q.clicks} clicks)`).join("\n")}`
    : "";
  return `Business: ${ctx.businessName}
URL: ${ctx.businessUrl}
Address/location: ${ctx.locationHint}

Description:
${ctx.businessDescription || "(no description provided -- infer from business URL/name)"}

${schema}
${flags}

${gsc}`.trim();
}

export interface GenerationResult {
  generated: number;
  inserted: number;
  blockedByTone: number;
  duplicatesSkipped: number;
}

/**
 * Generate suggestions, run each through the tone guard, persist
 * survivors as 'pending'. Idempotent on (client_slug, prompt) -- if
 * the same prompt was already suggested, INSERT OR IGNORE keeps the
 * existing row (and its status) intact.
 */
export async function generateAndStorePromptSuggestions(
  env: Env,
  clientSlug: string,
  count = 15,
): Promise<GenerationResult> {
  const ctx = await discoverContext(env, clientSlug);
  const userMessage = buildUserMessage(ctx);
  const raw = await callSonnet(env, userMessage, count);
  const candidates = parsePrompts(raw);

  const { assertHumanTone } = await import("./human-tone-guard");
  const now = Math.floor(Date.now() / 1000);

  let inserted = 0;
  let blockedByTone = 0;
  let duplicatesSkipped = 0;

  for (const c of candidates) {
    const tone = await assertHumanTone(env, c.prompt, "customer-dashboard", {
      source: "prompt-discovery.generate",
      client_slug: clientSlug,
      target_type: "prompt_suggestion",
    });
    if (!tone.ok) {
      blockedByTone++;
      continue;
    }
    const result = await env.DB.prepare(
      `INSERT INTO prompt_suggestions (client_slug, prompt, category, source, status, created_at)
         VALUES (?, ?, ?, 'ai_generated', 'pending', ?)
       ON CONFLICT(client_slug, prompt) DO NOTHING`,
    ).bind(clientSlug, c.prompt, c.category, now).run();
    if ((result.meta?.changes ?? 0) > 0) inserted++;
    else duplicatesSkipped++;
  }

  // Surface to admin inbox so Lance knows when a customer has new
  // suggestions to review (prompts the customer should see and decide on).
  if (inserted > 0) {
    await addInboxItem(env, {
      kind: "prompt_suggestions_ready",
      title: `${inserted} new prompt suggestion${inserted === 1 ? "" : "s"} for ${clientSlug}`,
      body: `Generated ${candidates.length} prompts; ${inserted} new (${duplicatesSkipped} duplicates, ${blockedByTone} blocked by tone guard). Customer can review and one-click accept on /discover/${clientSlug}.`,
      action_url: `/discover/${clientSlug}`,
      target_type: "prompt_discovery",
      target_id: 0,
      target_slug: clientSlug,
      urgency: "low",
    });
  }

  return { generated: candidates.length, inserted, blockedByTone, duplicatesSkipped };
}

// ---------- Review actions ----------

export async function getPendingSuggestions(env: Env, clientSlug: string): Promise<{
  id: number; prompt: string; category: string | null; source: string; created_at: number;
}[]> {
  return (await env.DB.prepare(
    `SELECT id, prompt, category, source, created_at FROM prompt_suggestions
       WHERE client_slug = ? AND status = 'pending'
       ORDER BY created_at DESC`,
  ).bind(clientSlug).all<{ id: number; prompt: string; category: string | null; source: string; created_at: number }>()).results;
}

export async function acceptSuggestion(
  env: Env,
  clientSlug: string,
  suggestionId: number,
  userId: number | null,
): Promise<{ ok: boolean; keyword?: string }> {
  const row = await env.DB.prepare(
    `SELECT prompt, category, status FROM prompt_suggestions
       WHERE id = ? AND client_slug = ?`,
  ).bind(suggestionId, clientSlug).first<{ prompt: string; category: string | null; status: string }>();
  if (!row || row.status !== "pending") return { ok: false };

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO citation_keywords (client_slug, keyword, category, active, created_at)
       VALUES (?, ?, ?, 1, ?)`,
  ).bind(clientSlug, row.prompt, row.category ?? "primary", now).run();
  await env.DB.prepare(
    `UPDATE prompt_suggestions SET status = 'accepted', reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
  ).bind(userId, now, suggestionId).run();

  return { ok: true, keyword: row.prompt };
}

export async function dismissSuggestion(
  env: Env,
  clientSlug: string,
  suggestionId: number,
  userId: number | null,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const r = await env.DB.prepare(
    `UPDATE prompt_suggestions SET status = 'dismissed', reviewed_by = ?, reviewed_at = ?
       WHERE id = ? AND client_slug = ? AND status = 'pending'`,
  ).bind(userId, now, suggestionId, clientSlug).run();
  return (r.meta?.changes ?? 0) > 0;
}
