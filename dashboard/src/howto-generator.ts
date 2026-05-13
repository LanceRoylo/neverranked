/**
 * HowTo schema generator.
 *
 * Given a how-to / instructions / guide page on a customer's site,
 * extracts the named procedure + ordered steps via Claude and emits
 * a HowTo JSON-LD node. Inserted as 'pending' for review.
 *
 * HowTo is one of the highest-citation schema types per the 730-citation
 * study -- AI engines preferentially cite step-by-step procedural
 * content over generic prose. Schema-grader manifest requires `name`
 * and `step` (non-empty array of HowToStep).
 *
 * Multi-pass validated. Factual grounding is critical here: a
 * hallucinated step could mislead a customer's reader and embarrass
 * us. Pass A audits each step against the source page text.
 */
import type { Env } from "./types";
import { gradeSchema } from "../../packages/aeo-analyzer/src/schema-grader";
import { logSchemaDrafted } from "./activity-log";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const USER_AGENT = "NeverRanked-HowTo-Generator/1.0";
const MAX_INPUT_WORDS = 4000;
const MAX_STEPS = 20;

export interface ExtractedHowTo {
  name: string;
  description?: string;
  totalTime?: string;     // ISO 8601 duration, e.g. "PT30M"
  estimatedCost?: string;
  supply?: string[];
  tool?: string[];
  steps: Array<{ name: string; text: string; image?: string; url?: string }>;
}

export interface GenerateHowToResult {
  ok: boolean;
  reason?: string;
  howto?: ExtractedHowTo;
  injectionId?: number;
}

export async function generateHowToForPage(
  clientSlug: string,
  sourceUrl: string,
  env: Env,
): Promise<GenerateHowToResult> {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, reason: "ANTHROPIC_API_KEY not set" };

  // 0. Plan quota check. HowTo is gated behind Signal+.
  const { checkSchemaQuota } = await import("./lib/plan-limits");
  const quota = await checkSchemaQuota(env, clientSlug, "HowTo");
  if (!quota.ok) return { ok: false, reason: quota.reason };

  // 1. Fetch
  let html: string;
  try {
    const resp = await fetch(sourceUrl, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status} fetching source` };
    html = await resp.text();
  } catch (e) {
    return { ok: false, reason: `fetch failed: ${e}` };
  }

  // 2. Strip to text
  const text = stripToText(html);
  const words = text.split(/\s+/);
  if (words.length < 80) return { ok: false, reason: `source page has ${words.length} words; need 80+` };
  const inputText = words.slice(0, MAX_INPUT_WORDS).join(" ");

  // 3. Generate (multi-pass)
  const callModel = async (extraFeedback: string): Promise<string> =>
    callClaude(env.ANTHROPIC_API_KEY!, sourceUrl, inputText, extraFeedback);

  const initial = await callModel("");
  if (!initial) return { ok: false, reason: "initial generation returned empty" };

  const { multiPassValidate } = await import("./lib/multi-pass");
  const validation = await multiPassValidate(env, {
    generated: initial,
    sourceContext: inputText,
    toneContext: "customer-publication",
    qualityGate: (txt) => {
      try {
        const m = txt.match(/\{[\s\S]*\}/);
        if (!m) return { ok: false, reason: "no JSON object in output" };
        const parsed = JSON.parse(m[0]) as { howto?: { name?: unknown; steps?: unknown } };
        const ht = parsed.howto;
        if (!ht || typeof ht !== "object") return { ok: false, reason: "howto object missing" };
        if (typeof ht.name !== "string" || ht.name.trim().length < 4) {
          return { ok: false, reason: "howto.name missing or too short" };
        }
        if (!Array.isArray(ht.steps) || ht.steps.length < 2) {
          return { ok: false, reason: "howto.steps must have at least 2 steps" };
        }
        for (const [i, s] of (ht.steps as Array<{ name?: unknown; text?: unknown }>).entries()) {
          if (typeof s.name !== "string" || s.name.trim().length < 3) {
            return { ok: false, reason: `step ${i + 1} missing name` };
          }
          if (typeof s.text !== "string" || s.text.trim().length < 10) {
            return { ok: false, reason: `step ${i + 1} text too short` };
          }
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `JSON parse failed: ${e}` };
      }
    },
    regenerate: callModel,
    label: "howto-generator",
    clientSlug,
  });

  if (!validation.ok) {
    return {
      ok: false,
      reason: `multi-pass validation stuck after ${validation.attempts} attempts -- see /admin/inbox/${validation.inboxId}`,
    };
  }

  const m = validation.text.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, reason: "post-validation parse failed" };
  const parsed = JSON.parse(m[0]) as { howto: ExtractedHowTo };
  const howto: ExtractedHowTo = {
    ...parsed.howto,
    steps: (parsed.howto.steps || []).slice(0, MAX_STEPS),
  };

  // 4. Build + grade + insert
  const schema = buildHowToSchema(howto, sourceUrl);
  const grade = gradeSchema(schema);
  if (!grade.meetsDeployThreshold) {
    return {
      ok: false,
      reason: `quality ${grade.score} below deploy threshold: ${grade.issues.slice(0, 2).join("; ")}`,
      howto,
    };
  }

  let targetPath: string;
  try { targetPath = new URL(sourceUrl).pathname; }
  catch { targetPath = "/*"; }

  const targetPagesJson = JSON.stringify([targetPath]);
  const { nextVariantLetter } = await import("./lib/schema-variants");
  const variant = await nextVariantLetter(env, clientSlug, "HowTo", targetPagesJson);
  const result = await env.DB.prepare(
    // Auto-approve: deploy threshold already passed.
    "INSERT INTO schema_injections (client_slug, schema_type, json_ld, target_pages, status, variant, quality_score, quality_graded_at, approved_at) " +
    "VALUES (?, 'HowTo', ?, ?, 'approved', ?, ?, unixepoch(), unixepoch())"
  ).bind(
    clientSlug,
    JSON.stringify(schema),
    targetPagesJson,
    variant,
    grade.score,
  ).run();

  const id = Number(result.meta?.last_row_id ?? 0);
  await logSchemaDrafted(env, clientSlug, "HowTo", `${howto.name} (${howto.steps.length} steps) from ${targetPath}`, id);

  return { ok: true, howto, injectionId: id };
}

// ---------------------------------------------------------------------------

function stripToText(html: string): string {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  h = h.replace(/<style[\s\S]*?<\/style>/gi, " ");
  h = h.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  h = h.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  // Prefer <article> or <main> if present.
  const main = h.match(/<(article|main)[\s\S]*?<\/\1>/i);
  if (main) h = main[0];
  h = h.replace(/<[^>]+>/g, " ");
  h = h.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'");
  h = h.replace(/&\w+;/g, " ");
  return h.replace(/\s+/g, " ").trim();
}

function buildHowToSchema(ht: ExtractedHowTo, sourceUrl: string): unknown {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": sourceUrl + "#howto",
    name: ht.name,
    step: ht.steps.map((s, i) => {
      const step: Record<string, unknown> = {
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
      };
      if (s.image) step.image = s.image;
      if (s.url) step.url = s.url;
      return step;
    }),
  };
  if (ht.description) node.description = ht.description;
  if (ht.totalTime) node.totalTime = ht.totalTime;
  if (ht.estimatedCost) node.estimatedCost = ht.estimatedCost;
  if (ht.supply && ht.supply.length > 0) {
    node.supply = ht.supply.map((s) => ({ "@type": "HowToSupply", name: s }));
  }
  if (ht.tool && ht.tool.length > 0) {
    node.tool = ht.tool.map((t) => ({ "@type": "HowToTool", name: t }));
  }
  return node;
}

async function callClaude(apiKey: string, sourceUrl: string, pageText: string, extraFeedback: string): Promise<string> {
  const system = "You extract a single HowTo procedure from a customer's website page. " +
    "The page should describe a sequence of steps to accomplish something. If it doesn't (e.g. it's a generic marketing page or a list of unrelated tips), output {\"howto\":null} and nothing else. " +
    "When extracting: name the procedure clearly (e.g. 'How to Reserve a Theatre for a Private Event'). Each step needs a short name and a 1-3 sentence text grounded in the page. " +
    "Never invent steps. Never add steps the page doesn't describe. Order matters -- preserve the page's order. " +
    "Output ONLY valid JSON of shape: {\"howto\":{\"name\":\"...\",\"description\":\"...\",\"totalTime\":\"PT30M\",\"steps\":[{\"name\":\"...\",\"text\":\"...\"}]}}. " +
    "Optional fields: description, totalTime (ISO 8601), estimatedCost, supply (array of names), tool (array of names), image (URL), url (URL). Skip optionals when uncertain.";

  const user = `Source URL: ${sourceUrl}

Page content:
"""
${pageText}
"""

Extract the HowTo procedure. Output JSON only.${extraFeedback ? "\n\nADDITIONAL CONSTRAINTS:\n" + extraFeedback : ""}`;

  const resp = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude API ${resp.status}`);
  const data = await resp.json() as { content?: { type: string; text: string }[] };
  return data.content?.find(b => b.type === "text")?.text || "";
}
