/**
 * Person/Leadership schema generator.
 *
 * Scrapes a customer's About / Team / Leadership page, asks Claude
 * to extract named individuals with their roles, and emits one
 * Person JSON-LD schema per leader. Inserted as 'pending' for
 * review (same flow as FAQ -- people are factual claims that
 * could embarrass us if wrong).
 *
 * Per the existing schema-grader manifest, Person REQUIRES a name
 * AND an identity hook (url or sameAs). A name-only Person node
 * scores below the deploy threshold and gets blocked. We extract
 * sameAs URLs from any social profile or LinkedIn link the page
 * references for that name.
 *
 * Multi-pass validation runs the same factual + tone + quality
 * gates. Factual is critical here -- attributing a wrong title or
 * inventing a person who isn't on the page is a major trust
 * failure.
 */
import type { Env } from "./types";
import { gradeSchema } from "../../packages/aeo-analyzer/src/schema-grader";
import { logSchemaDrafted } from "./activity-log";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const USER_AGENT = "NeverRanked-Person-Generator/1.0";
const MAX_INPUT_WORDS = 4000;
const MAX_PEOPLE = 12;

export interface ExtractedPerson {
  name: string;
  jobTitle?: string;
  description?: string;
  url?: string;        // any link to a profile / bio page
  sameAs?: string[];   // social URLs (LinkedIn, X, etc)
}

export interface GeneratePersonsResult {
  ok: boolean;
  reason?: string;
  people?: ExtractedPerson[];
  inserted?: number;
  injectionIds?: number[];
}

export async function generatePersonsForPage(
  clientSlug: string,
  sourceUrl: string,
  env: Env,
): Promise<GeneratePersonsResult> {
  if (!env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "ANTHROPIC_API_KEY not set" };
  }

  // 0. Plan quota check. Person is NOT in the Pulse allowed list, so
  //    Pulse customers see a clean upgrade prompt instead of partial work.
  const { checkSchemaQuota } = await import("./lib/plan-limits");
  const quota = await checkSchemaQuota(env, clientSlug, "Person");
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

  // 2. Strip HTML to text + extract any social/linkedin URLs found
  //    on the page (these become candidate sameAs values).
  const text = stripToText(html);
  const words = text.split(/\s+/);
  if (words.length < 100) {
    return { ok: false, reason: `source page has only ${words.length} words; need 100+` };
  }
  const inputText = words.slice(0, MAX_INPUT_WORDS).join(" ");
  const linksByDomain = extractRelevantLinks(html);

  // 3. Generate via Claude (multi-pass validated)
  const callModel = async (extraFeedback: string): Promise<string> => {
    const out = await callClaudeForPersons(env.ANTHROPIC_API_KEY!, sourceUrl, inputText, linksByDomain, extraFeedback);
    return out;
  };

  const initial = await callModel("");
  if (!initial) return { ok: false, reason: "initial generation returned empty" };

  // Pass through multi-pass. The factual check audits each named
  // person against the source text -- if Claude invented someone
  // who isn't on the page, factual catches it.
  const { multiPassValidate } = await import("./lib/multi-pass");
  const validation = await multiPassValidate(env, {
    generated: initial,
    sourceContext: inputText,
    toneContext: "customer-publication",
    qualityGate: (text) => {
      try {
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) return { ok: false, reason: "no JSON object in output" };
        const parsed = JSON.parse(m[0]) as { people?: unknown };
        if (!Array.isArray(parsed.people) || parsed.people.length === 0) {
          return { ok: false, reason: "people array missing or empty" };
        }
        // Each person needs at minimum a name. Identity hook (url
        // or sameAs) is enforced later by the schema-grader manifest.
        for (const p of parsed.people as Array<{ name?: unknown }>) {
          if (typeof p.name !== "string" || p.name.trim().length < 2) {
            return { ok: false, reason: "person missing valid name" };
          }
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `JSON parse failed: ${e}` };
      }
    },
    regenerate: callModel,
    label: "person-generator",
    clientSlug,
  });

  if (!validation.ok) {
    return {
      ok: false,
      reason: `multi-pass validation stuck after ${validation.attempts} attempts -- see /admin/inbox/${validation.inboxId}`,
    };
  }

  // Parse final
  const m = validation.text.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, reason: "post-validation parse failed" };
  const parsed = JSON.parse(m[0]) as { people: ExtractedPerson[] };
  const people = parsed.people.slice(0, MAX_PEOPLE);

  // 4. Build Person schemas (one per person), grade, insert as pending
  let targetPath: string;
  try { targetPath = new URL(sourceUrl).pathname; }
  catch { targetPath = "/*"; }

  const insertedIds: number[] = [];
  const skipped: string[] = [];
  for (const p of people) {
    const schema = buildPersonSchema(p, sourceUrl);
    const grade = gradeSchema(schema);
    if (!grade.meetsDeployThreshold) {
      skipped.push(`${p.name}: quality ${grade.score} (${grade.issues[0] || "no detail"})`);
      continue;
    }
    const result = await env.DB.prepare(
      "INSERT INTO schema_injections (client_slug, schema_type, json_ld, target_pages, status, quality_score, quality_graded_at) " +
      "VALUES (?, 'Person', ?, ?, 'pending', ?, unixepoch())"
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
      reason: `no Person schemas passed quality gate. Skipped: ${skipped.join("; ")}. Most common cause: missing identity hook (url or sameAs) -- the page doesn't link to the leader's LinkedIn or bio.`,
      people,
    };
  }

  await logSchemaDrafted(
    env,
    clientSlug,
    "Person",
    `${insertedIds.length} leader${insertedIds.length === 1 ? "" : "s"} from ${targetPath}`,
    insertedIds[0],
  );

  return {
    ok: true,
    people,
    inserted: insertedIds.length,
    injectionIds: insertedIds,
  };
}

// ---------------------------------------------------------------------------
// Helpers
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

/** Extract LinkedIn / Twitter / personal-website links from the
 *  page so we can suggest sameAs URLs to Claude. The model may
 *  pick the right one per person; if it's ambiguous, we pass them
 *  through and let the model attribute. */
function extractRelevantLinks(html: string): { linkedin: string[]; twitter: string[]; other: string[] } {
  const out = { linkedin: [] as string[], twitter: [] as string[], other: [] as string[] };
  const seen = new Set<string>();
  const re = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href.startsWith("http")) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    if (/linkedin\.com\/(in|pub)\//i.test(href)) out.linkedin.push(href);
    else if (/(twitter|x)\.com\/[a-z0-9_]+\/?$/i.test(href)) out.twitter.push(href);
  }
  return out;
}

function buildPersonSchema(p: ExtractedPerson, sourceUrl: string): unknown {
  const sameAs = (p.sameAs || []).filter(u => /^https?:\/\//.test(u));
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.name,
  };
  if (p.url) node.url = p.url;
  if (sameAs.length > 0) node.sameAs = sameAs;
  if (p.jobTitle) node.jobTitle = p.jobTitle;
  if (p.description) node.description = p.description;
  return node;
}

async function callClaudeForPersons(
  apiKey: string,
  sourceUrl: string,
  pageText: string,
  candidateLinks: { linkedin: string[]; twitter: string[]; other: string[] },
  extraFeedback: string,
): Promise<string> {
  const linksBlock = (candidateLinks.linkedin.length + candidateLinks.twitter.length) > 0
    ? `\n\nCandidate identity links found on this page (you may attribute these to the right person if context makes it clear):\nLinkedIn: ${candidateLinks.linkedin.join(", ") || "(none)"}\nTwitter/X: ${candidateLinks.twitter.join(", ") || "(none)"}`
    : "";

  const system = "You extract named individuals from a business website's About / Team / Leadership page for use as schema.org Person nodes. " +
    "Only extract people who are EXPLICITLY NAMED on the page with a role or title. " +
    "Never invent people. Never guess names. If the page lists a role without a name (e.g., 'CEO' alone), skip it. " +
    "Each Person REQUIRES a name and at least one identity hook (url to their bio page OR a sameAs social profile URL). " +
    "Do not output people who lack any verifiable identity hook -- a name alone is useless to AI engines. " +
    "Output ONLY valid JSON: {\"people\":[{\"name\":\"...\",\"jobTitle\":\"...\",\"description\":\"...\",\"url\":\"...\",\"sameAs\":[\"...\"]}, ...]}. " +
    "jobTitle, description, url, sameAs are optional but at least one of url/sameAs MUST be present per person.";

  const user = `Source URL: ${sourceUrl}

Page content:
"""
${pageText}
"""${linksBlock}

Extract every clearly-named person on this page who has a verifiable identity hook (a profile URL or social link). Output JSON only.${extraFeedback ? "\n\nADDITIONAL CONSTRAINTS:\n" + extraFeedback : ""}`;

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
