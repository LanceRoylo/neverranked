/**
 * Prompt suggester — generates ~10 citation-tracking prompts for a
 * client based on their domain and (optionally) industry hint.
 *
 * Used by Pulse onboarding (and reusable for Signal/Amplify onboarding
 * later). The prompts are the "best X for Y" style queries an AI engine
 * receives -- not the customer's own marketing keywords. Mix:
 *
 *   - 4 commercial intent ("best <category> in <city>")
 *   - 3 informational ("how does <thing> work", "what is <thing>")
 *   - 2 comparative ("<brand> vs alternatives", "<category> alternatives to X")
 *   - 1 problem-stated ("how to <solve their core problem>")
 *
 * Pure helper. Does not write to the DB. Caller stores accepted prompts
 * into citation_keywords. Does not validate (multi-pass) because the
 * customer reviews and edits before save -- they ARE the validation.
 */
import type { Env } from "../types";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const USER_AGENT = "NeverRanked-Prompt-Suggester/1.0";

export interface SuggestedPrompt {
  keyword: string;
  category: "commercial" | "informational" | "comparative" | "problem";
  rationale: string;          // 1 sentence why we picked this
}

export interface SuggestPromptsResult {
  ok: boolean;
  reason?: string;
  prompts?: SuggestedPrompt[];
  detectedBusiness?: string;  // what we inferred from the page
}

const TARGET_COUNT = 10;

export async function suggestPromptsForDomain(
  env: Env,
  domain: string,
  industryHint?: string,
): Promise<SuggestPromptsResult> {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, reason: "ANTHROPIC_API_KEY not set" };

  // 1. Fetch the homepage so Claude has real context. Falls back to
  //    industry-only generation if the fetch fails.
  let pageContext = "";
  try {
    const url = domain.startsWith("http") ? domain : `https://${domain}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (resp.ok) {
      const html = await resp.text();
      pageContext = stripToText(html).split(/\s+/).slice(0, 1500).join(" ");
    }
  } catch {
    // continue with empty context
  }

  // 2. Generate.
  const system = "You generate citation-tracking prompts for AI search visibility monitoring. " +
    "Given a business website, output exactly " + TARGET_COUNT + " prompts that an AI engine like ChatGPT or Perplexity would actually receive from a real user looking for what this business sells. " +
    "Mix the categories: roughly 4 commercial-intent ('best X in Y city'), 3 informational ('how does X work', 'what is X'), 2 comparative ('X vs alternatives'), 1 problem-stated ('how to solve Y'). " +
    "Geographic scope: match the business. Local SMB → city/region queries. National brand → broader queries. Never invent a city the page doesn't suggest. " +
    "Each prompt should be 4-12 words, plain question/query format, no quotes, no marketing fluff. " +
    "Output ONLY valid JSON: {\"detectedBusiness\":\"...\",\"prompts\":[{\"keyword\":\"...\",\"category\":\"commercial|informational|comparative|problem\",\"rationale\":\"...\"}, ...]}.";

  const user = `Domain: ${domain}
${industryHint ? `Industry hint: ${industryHint}\n` : ""}
${pageContext ? `Homepage content:\n"""\n${pageContext}\n"""` : "(homepage could not be fetched -- generate from domain + industry hint only)"}

Generate ${TARGET_COUNT} prompts. Output JSON only.`;

  const resp = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) return { ok: false, reason: `Claude API ${resp.status}` };

  const data = await resp.json() as { content?: { type: string; text: string }[] };
  const text = data.content?.find(b => b.type === "text")?.text || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, reason: "no JSON in Claude response" };

  let parsed: { detectedBusiness?: string; prompts?: SuggestedPrompt[] };
  try { parsed = JSON.parse(m[0]); }
  catch (e) { return { ok: false, reason: `JSON parse failed: ${e}` }; }

  if (!Array.isArray(parsed.prompts) || parsed.prompts.length === 0) {
    return { ok: false, reason: "Claude returned no prompts" };
  }

  // Light sanitization: clamp count, strip junk.
  const prompts = parsed.prompts
    .filter((p) => p && typeof p.keyword === "string" && p.keyword.trim().length >= 4)
    .slice(0, TARGET_COUNT)
    .map((p) => ({
      keyword: p.keyword.trim().replace(/^["']|["']$/g, "").slice(0, 200),
      category: (["commercial", "informational", "comparative", "problem"].includes(p.category)
        ? p.category : "commercial") as SuggestedPrompt["category"],
      rationale: (p.rationale || "").trim().slice(0, 200),
    }));

  return {
    ok: true,
    prompts,
    detectedBusiness: parsed.detectedBusiness || domain,
  };
}

function stripToText(html: string): string {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  h = h.replace(/<style[\s\S]*?<\/style>/gi, " ");
  h = h.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  h = h.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  h = h.replace(/<[^>]+>/g, " ");
  h = h.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'");
  h = h.replace(/&\w+;/g, " ");
  return h.replace(/\s+/g, " ").trim();
}
