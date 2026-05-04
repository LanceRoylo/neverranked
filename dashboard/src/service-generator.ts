/**
 * Service schema generator.
 *
 * Given a services / offerings / pricing page on a customer's site,
 * extracts the named services with descriptions via Claude and emits
 * one Service JSON-LD node per offering. Inserted as 'pending' for
 * review.
 *
 * Service is critical for B2B and professional-services customers.
 * AI engines use Service nodes to answer "who provides X in Y" queries
 * -- without it, the customer's services are just unstructured prose
 * the model may or may not surface.
 *
 * Schema-grader manifest (added in this change) requires `name` and
 * `provider`. Recommended: serviceType, areaServed, offers, description,
 * image, url. Multi-pass validated -- factual grounding catches
 * invented services.
 */
import type { Env } from "./types";
import { gradeSchema } from "../../packages/aeo-analyzer/src/schema-grader";
import { logSchemaDrafted } from "./activity-log";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const USER_AGENT = "NeverRanked-Service-Generator/1.0";
const MAX_INPUT_WORDS = 4000;
const MAX_SERVICES = 15;

export interface ExtractedService {
  name: string;
  description?: string;
  serviceType?: string;
  areaServed?: string;
  url?: string;
  priceRange?: string;
}

export interface GenerateServicesResult {
  ok: boolean;
  reason?: string;
  services?: ExtractedService[];
  inserted?: number;
  injectionIds?: number[];
}

export async function generateServicesForPage(
  clientSlug: string,
  sourceUrl: string,
  env: Env,
): Promise<GenerateServicesResult> {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, reason: "ANTHROPIC_API_KEY not set" };

  // Load business name + areaServed default from clients table.
  const client = await env.DB.prepare(
    "SELECT business_name FROM agency_clients WHERE slug = ? LIMIT 1"
  ).bind(clientSlug).first<{ business_name: string | null }>();
  const providerName = client?.business_name || clientSlug;

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

  // 2. Strip
  const text = stripToText(html);
  const words = text.split(/\s+/);
  if (words.length < 100) return { ok: false, reason: `source page has ${words.length} words; need 100+` };
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
        const parsed = JSON.parse(m[0]) as { services?: unknown };
        if (!Array.isArray(parsed.services) || parsed.services.length === 0) {
          return { ok: false, reason: "services array missing or empty" };
        }
        for (const [i, s] of (parsed.services as Array<{ name?: unknown; description?: unknown }>).entries()) {
          if (typeof s.name !== "string" || s.name.trim().length < 3) {
            return { ok: false, reason: `service ${i + 1} missing valid name` };
          }
          // Description encouraged but optional.
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `JSON parse failed: ${e}` };
      }
    },
    regenerate: callModel,
    label: "service-generator",
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
  const parsed = JSON.parse(m[0]) as { services: ExtractedService[] };
  const services = parsed.services.slice(0, MAX_SERVICES);

  // 4. Build + grade + insert
  let targetPath: string;
  try { targetPath = new URL(sourceUrl).pathname; }
  catch { targetPath = "/*"; }

  const insertedIds: number[] = [];
  const skipped: string[] = [];
  for (const s of services) {
    const schema = buildServiceSchema(s, providerName, sourceUrl);
    const grade = gradeSchema(schema);
    if (!grade.meetsDeployThreshold) {
      skipped.push(`${s.name}: quality ${grade.score}`);
      continue;
    }
    const result = await env.DB.prepare(
      "INSERT INTO schema_injections (client_slug, schema_type, json_ld, target_pages, status, quality_score, quality_graded_at) " +
      "VALUES (?, 'Service', ?, ?, 'pending', ?, unixepoch())"
    ).bind(
      clientSlug,
      JSON.stringify(schema),
      JSON.stringify([targetPath]),
      grade.score,
    ).run();
    insertedIds.push(Number(result.meta?.last_row_id ?? 0));
  }

  if (insertedIds.length === 0) {
    return {
      ok: false,
      reason: `no Service schemas passed quality gate. Skipped: ${skipped.join("; ")}`,
      services,
    };
  }

  await logSchemaDrafted(
    env,
    clientSlug,
    "Service",
    `${insertedIds.length} service${insertedIds.length === 1 ? "" : "s"} from ${targetPath}`,
    insertedIds[0],
  );

  return {
    ok: true,
    services,
    inserted: insertedIds.length,
    injectionIds: insertedIds,
  };
}

// ---------------------------------------------------------------------------

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

function buildServiceSchema(s: ExtractedService, providerName: string, sourceUrl: string): unknown {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    provider: { "@type": "Organization", name: providerName },
  };
  if (s.description) node.description = s.description;
  if (s.serviceType) node.serviceType = s.serviceType;
  if (s.areaServed) node.areaServed = s.areaServed;
  if (s.url) node.url = s.url;
  else node.url = sourceUrl;
  if (s.priceRange) {
    node.offers = {
      "@type": "Offer",
      priceSpecification: { "@type": "PriceSpecification", priceCurrency: "USD", price: s.priceRange },
    };
  }
  return node;
}

async function callClaude(apiKey: string, sourceUrl: string, pageText: string, extraFeedback: string): Promise<string> {
  const system = "You extract distinct services / offerings from a business website's services or pricing page for use as schema.org Service nodes. " +
    "Only extract services EXPLICITLY described on the page. Each service needs a clear name (e.g. 'Private Theatre Rental', 'AEO Visibility Audit'). " +
    "Never invent services. Never lump unrelated offerings into one node. If the page is generic marketing prose with no enumerable services, output {\"services\":[]}. " +
    "Output ONLY valid JSON: {\"services\":[{\"name\":\"...\",\"description\":\"...\",\"serviceType\":\"...\",\"areaServed\":\"...\",\"priceRange\":\"...\"}, ...]}. " +
    "Optional fields: description (1-2 sentences grounded in page text), serviceType (high-level category), areaServed (geographic area or 'Online'), priceRange (only if a specific price is on the page; never guess). " +
    "Skip optional fields when uncertain.";

  const user = `Source URL: ${sourceUrl}

Page content:
"""
${pageText}
"""

Extract the services. Output JSON only.${extraFeedback ? "\n\nADDITIONAL CONSTRAINTS:\n" + extraFeedback : ""}`;

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
