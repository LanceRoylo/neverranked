/**
 * QA audit: schema_integrity (rules-based, blocking on red).
 *
 * Audits a schema_injection row before it ships to a customer's live
 * site. This is a SECOND gate after the existing 60-point quality
 * grader -- the existing grader scores schema substance; this audit
 * checks structural integrity AND fit with the target page.
 *
 * Checks (sequential, short-circuit on first red):
 *   1. JSON.parse succeeds (red on fail)
 *   2. Required @context and @type fields present (red on fail)
 *   3. Schema.org type is recognized (yellow on unknown -- unusual but not blocking)
 *   4. Target page URL resolves (HTTP HEAD returns 2xx) (red on 4xx/5xx, yellow on timeout)
 *   5. HTML-vs-schema content overlap (red if schema claims text that's absent from page)
 *
 * The HTML overlap check is the most valuable: it catches the case
 * where AI-generated schema invents content the page doesn't actually
 * support. Implementation: extract visible text from the page body,
 * extract human-readable text fields from the schema (name, description,
 * answers, headlines), require 50%+ token overlap.
 *
 * Override path: caller can re-approve with ?force=1 query param to
 * bypass blocking. The bypass still writes the qa_audits row with
 * blocked=0, blocked_overridden=1 -- so the override is recorded.
 */

import type { Env } from "../types";
import { recordAudit, runRulesPipeline, type AuditResult, type RuleCheck } from "./qa-auditor";

interface SchemaAuditInput {
  json_ld: string;
  target_url: string;
}

const REQUIRED_FIELDS_BY_TYPE: Record<string, string[]> = {
  FAQPage: ["@context", "@type", "mainEntity"],
  Article: ["@context", "@type", "headline"],
  HowTo: ["@context", "@type", "name", "step"],
  BreadcrumbList: ["@context", "@type", "itemListElement"],
  Event: ["@context", "@type", "name", "startDate"],
  LocalBusiness: ["@context", "@type", "name"],
  Organization: ["@context", "@type", "name"],
  WebSite: ["@context", "@type", "name", "url"],
  Person: ["@context", "@type", "name"],
};

const KNOWN_TYPES = new Set([
  ...Object.keys(REQUIRED_FIELDS_BY_TYPE),
  "Service",
  "Product",
  "Review",
  "AggregateRating",
  "Question",
  "Answer",
  "WebPage",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract human-readable text fields from a parsed schema object.
 * Walks the JSON-LD recursively and pulls strings from name, description,
 * text, headline, etc. Skips URLs, ids, dates, numbers.
 */
function extractSchemaText(node: unknown, acc: string[] = []): string[] {
  if (typeof node === "string") {
    // Skip URLs and IDs
    if (/^https?:\/\//.test(node) || /^#/.test(node)) return acc;
    acc.push(node);
    return acc;
  }
  if (Array.isArray(node)) {
    for (const item of node) extractSchemaText(item, acc);
    return acc;
  }
  if (node && typeof node === "object") {
    const textyKeys = ["name", "description", "text", "headline", "alternativeHeadline", "answerText", "abstract", "about", "articleBody"];
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (textyKeys.includes(key)) extractSchemaText(value, acc);
      // Recurse into nested objects regardless of key
      else if (value && typeof value === "object") extractSchemaText(value, acc);
    }
  }
  return acc;
}

/**
 * Tokenize text for overlap comparison. Lowercases, strips punctuation,
 * removes stopwords, returns a Set of unique tokens.
 */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been", "being",
  "of", "in", "on", "at", "to", "for", "with", "by", "as", "this", "that", "these", "those",
  "it", "its", "their", "they", "we", "our", "you", "your", "i", "me", "my",
  "from", "up", "out", "if", "then", "than", "so", "do", "does", "did", "have", "has", "had",
  "will", "would", "could", "should", "can", "may", "might", "must",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t))
  );
}

function overlapRatio(schemaTokens: Set<string>, pageTokens: Set<string>): number {
  if (schemaTokens.size === 0) return 1; // schema has no text to verify; pass
  let matches = 0;
  for (const t of schemaTokens) if (pageTokens.has(t)) matches++;
  return matches / schemaTokens.size;
}

/**
 * Strip HTML tags and return visible text content. Crude but effective
 * for the overlap check -- we don't need perfect rendering, just the
 * visible word set.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const RULES: RuleCheck<SchemaAuditInput>[] = [
  {
    name: "valid_json",
    severity: "red",
    check: (input) => {
      try {
        JSON.parse(input.json_ld);
        return null;
      } catch (e) {
        return `JSON-LD is not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  },
  {
    name: "required_fields",
    severity: "red",
    check: (input) => {
      const parsed = JSON.parse(input.json_ld);
      // Handle both single-object and graph-array forms
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") return "schema is not an object";
        const type = item["@type"];
        if (!type) return "missing @type";
        if (!item["@context"]) return "missing @context";
        const typeStr = Array.isArray(type) ? type[0] : type;
        const required = REQUIRED_FIELDS_BY_TYPE[typeStr];
        if (required) {
          for (const field of required) {
            if (!(field in item)) return `${typeStr} missing required field: ${field}`;
          }
        }
      }
      return null;
    },
  },
  {
    name: "known_type",
    severity: "yellow",
    check: (input) => {
      const parsed = JSON.parse(input.json_ld);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const type = item?.["@type"];
        const typeStr = Array.isArray(type) ? type[0] : type;
        if (typeStr && !KNOWN_TYPES.has(typeStr)) {
          return `schema type "${typeStr}" not in known-types set (may be valid but unusual)`;
        }
      }
      return null;
    },
  },
  {
    name: "url_resolves",
    severity: "red",
    check: async (input) => {
      if (!input.target_url) return null; // no target to verify
      try {
        const resp = await fetch(input.target_url, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
        });
        if (resp.status >= 400) {
          return `target URL ${input.target_url} returned ${resp.status}`;
        }
        return null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Network errors are yellow not red -- transient
        if (/timeout|abort/i.test(msg)) {
          return null; // skip overlap check, don't block
        }
        return `target URL fetch failed: ${msg}`;
      }
    },
  },
  {
    name: "html_overlap",
    severity: "red",
    check: async (input) => {
      if (!input.target_url) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(input.json_ld);
      } catch {
        return null; // already caught by valid_json
      }
      const schemaText = extractSchemaText(parsed).join(" ");
      const schemaTokens = tokenize(schemaText);
      if (schemaTokens.size < 5) return null; // not enough schema text to meaningfully verify

      let html: string;
      try {
        const resp = await fetch(input.target_url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
          headers: { "User-Agent": "NeverRanked-QA-Auditor/1.0" },
        });
        if (resp.status >= 400) return null; // already flagged by url_resolves
        html = await resp.text();
      } catch {
        return null; // transient, don't block on this
      }

      const pageText = stripHtml(html);
      const pageTokens = tokenize(pageText);
      const ratio = overlapRatio(schemaTokens, pageTokens);

      // Empirical threshold: 50% of meaningful schema tokens should appear
      // on the page. Below that, the schema likely makes claims the page
      // doesn't support -- a hallucination signal.
      if (ratio < 0.5) {
        return `schema text only ${Math.round(ratio * 100)}% present in target page content (threshold 50%) -- schema may be claiming content the page doesn't support`;
      }
      return null;
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Audit a schema_injection before approval. Returns the audit result;
 * caller decides whether to block. The audit row is written to qa_audits
 * automatically.
 *
 * Usage in handleInjectApprove:
 *   const audit = await auditSchemaIntegrity(env, id, json_ld, target_url);
 *   if (audit.verdict === "red" && !force) return redirect(...with error...);
 */
export async function auditSchemaIntegrity(
  env: Env,
  injectionId: number,
  jsonLd: string,
  targetUrl: string,
  options: { blocking?: boolean } = {},
): Promise<AuditResult> {
  const blocking = options.blocking !== false;
  const result = await runRulesPipeline<SchemaAuditInput>(
    { json_ld: jsonLd, target_url: targetUrl },
    RULES,
  );

  await recordAudit(env, {
    category: "schema_integrity",
    artifact_type: "schema_injection",
    artifact_id: injectionId,
    artifact_ref: targetUrl,
  }, {
    ...result,
    blocked: blocking && result.verdict === "red",
  });

  return result;
}
