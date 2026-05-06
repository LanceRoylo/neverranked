/**
 * $750 audit deliverable — fully automated.
 *
 * End-to-end generation of a per-customer audit. Every prose section
 * is LLM-generated, grounded in real scan data, and run through the
 * multi-pass validator (factual + tone + quality) with up to 3
 * regeneration attempts before falling back to a stub. No editable
 * placeholders -- if the system can't auto-generate a section to
 * spec, it surfaces a "needs manual review" admin_inbox row instead
 * of shipping slop.
 *
 * Phase 1 (this file): exec summary, AEO scan integration, schema
 *   deep dive, roadmap. Skips competitive analysis (phase 3).
 *
 * Phase 2 (planned): tighten multi-pass to enforce HM banned phrases
 *   beyond the existing tone-guard, add brand-voice fingerprint check.
 *
 * Phase 3 (planned): competitive analysis -- Claude identifies 3-5
 *   competitors from brand + category, parallel-scans them, builds
 *   comparison table. Hardest piece because competitor identification
 *   needs grounding in real category data, not LLM guesses.
 */

import type { Env } from "./types";
import { auditEntityGraphPartial, auditEntityGraphLight, type PartialEntityAudit, type RecommendedAction } from "./entity-graph";
import { renderEntityAuditCard } from "./entity-graph-render";
import { renderGauge } from "./visuals";
import { multiPassValidate } from "./lib/multi-pass";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const PROSE_MODEL = "claude-sonnet-4-5"; // higher-quality prose gen
const ANTHROPIC_VERSION = "2023-06-01";
const USER_AGENT = "NeverRanked-AuditTemplate/0.1 (lance@neverranked.com)";
const TIMEOUT_MS = 30_000;

interface TemplateOpts {
  brand: string;
  domain: string;
  customer_name?: string;
  /** Pre-computed scan data (entity audit, AEO scan, page schema spider,
   * competitive analysis result). When supplied, the underlying network
   * calls are skipped -- prose generation reuses cached scan data.
   * Used by audit-delivery.ts on QA-driven regeneration so attempts 2
   * and 3 don't re-run ~25 subrequests of scanning when only the prose
   * needs to change. Each field is independent: pass any subset. */
  scanCache?: {
    entityAudit?: import("./entity-graph").PartialEntityAudit | null;
    aeoScan?: AeoScanResult | null;
    pageScans?: PageSchemaScan[];
    competitive?: { html: string; commentary: string } | null;
  };
}

/** Result type exposed so audit-delivery can capture cache for retries. */
export interface AuditTemplateResult {
  html: string;
  scans: NonNullable<TemplateOpts["scanCache"]>;
}

// ---------- AEO scan integration ----------

interface AeoScanResult {
  aeo_score: number;
  grade: string;
  domain: string;
  url?: string;
  technical_signals?: Array<{ label: string; value: string; status?: string }>;
  // Other fields from check.neverranked.com -- we tolerate extras.
}

async function fetchAeoScan(domain: string): Promise<AeoScanResult | null> {
  const target = domain.startsWith("http") ? domain : `https://${domain.replace(/^www\./, "")}`;
  try {
    const r = await fetch("https://check.neverranked.com/api/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-Internal-Source": "audit-template",
      },
      body: JSON.stringify({ url: target }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    return await r.json() as AeoScanResult;
  } catch {
    return null;
  }
}

// ---------- Schema spider (top 5 pages) ----------

interface PageSchemaScan {
  url: string;
  schema_count: number;
  schema_types: string[];
  has_organization: boolean;
  has_partial_schema_penalty: boolean; // 1 schema present but incomplete
}

async function spiderTopPages(domain: string): Promise<PageSchemaScan[]> {
  // Reduced to homepage-only. Cloudflare Workers caps a single
  // invocation at ~50 outbound subrequests. With the entity audit,
  // AEO scan, 4 LLM section calls + multi-pass regens, and a
  // 3-competitor comparative scan, the budget gets tight fast. The
  // customer's most consequential page for AEO is the homepage
  // anyway -- per-page deep dive across the site can come from the
  // ongoing service tiers, not the one-shot audit.
  const root = domain.startsWith("http") ? domain : `https://${domain.replace(/^www\./, "")}`;
  const homepageUrl = root.replace(/\/+$/, "") + "/";
  return [await scanPageSchema(homepageUrl)];
}

async function scanPageSchema(url: string): Promise<PageSchemaScan> {
  const empty: PageSchemaScan = {
    url, schema_count: 0, schema_types: [], has_organization: false, has_partial_schema_penalty: false,
  };
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return empty;
    const html = await r.text();
    const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const types = new Set<string>();
    let count = 0;
    let hasOrganization = false;
    let hasIncomplete = false;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      count++;
      let parsed: unknown;
      try { parsed = JSON.parse(m[1]); } catch { continue; }
      collectTypes(parsed, types);
      if (hasOrgInTree(parsed)) hasOrganization = true;
      if (hasIncompleteSchema(parsed)) hasIncomplete = true;
    }
    return {
      url, schema_count: count, schema_types: Array.from(types),
      has_organization: hasOrganization,
      has_partial_schema_penalty: count >= 1 && hasIncomplete,
    };
  } catch {
    return empty;
  }
}

function collectTypes(node: unknown, out: Set<string>): void {
  if (!node) return;
  if (Array.isArray(node)) { for (const c of node) collectTypes(c, out); return; }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") out.add(t);
  else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.add(x));
  if (Array.isArray(obj["@graph"])) for (const c of obj["@graph"] as unknown[]) collectTypes(c, out);
}

function hasOrgInTree(node: unknown): boolean {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(hasOrgInTree);
  if (typeof node !== "object") return false;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  const arr = Array.isArray(t) ? t : t ? [t] : [];
  if (arr.some((x) => typeof x === "string" && /Organization|LocalBusiness|Corporation|NGO/i.test(x))) return true;
  if (Array.isArray(obj["@graph"])) return (obj["@graph"] as unknown[]).some(hasOrgInTree);
  return false;
}

function hasIncompleteSchema(node: unknown): boolean {
  // "Incomplete" heuristic for the partial-schema penalty: an org-typed
  // node missing ≥3 of {logo, sameAs, address, description}.
  if (!node) return false;
  if (Array.isArray(node)) return node.some(hasIncompleteSchema);
  if (typeof node !== "object") return false;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  const arr = Array.isArray(t) ? t : t ? [t] : [];
  if (arr.some((x) => typeof x === "string" && /Organization|LocalBusiness|Corporation/i.test(x))) {
    const want = ["logo", "sameAs", "address", "description"];
    const missing = want.filter((p) => obj[p] === undefined || obj[p] === null || obj[p] === "");
    if (missing.length >= 3) return true;
  }
  if (Array.isArray(obj["@graph"])) return (obj["@graph"] as unknown[]).some(hasIncompleteSchema);
  return false;
}

// ---------- LLM prose generation ----------

async function callClaude(env: Env, system: string, user: string, maxTokens: number): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: PROSE_MODEL,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Anthropic ${r.status}: ${body.slice(0, 300)}`);
  }
  const json = await r.json() as { content: Array<{ type: string; text: string }> };
  return json.content[0]?.text ?? "";
}

const HM_VOICE_RULES = `
Brand voice rules (NeverRanked / Hello Momentum):
- No em dashes. Use commas, periods, or "and" instead.
- No semicolons. Use periods.
- No formulaic openers. Banned: "Welcome to", "Nestled in", "In the heart of", "When it comes to", "delve into", "navigate the landscape", "in today's", "in the world of", "elevate", "leverage" as a verb.
- No AI-tells: don't write "rich tapestry", "comprehensive solution", "robust", "seamless", "robust solution", "cutting-edge", "innovative" without specifics.
- Specific over vague. Number > adjective. Named competitor > "the industry."
- Direct, declarative. Short sentences. No filler.
- The reader is a smart business owner, not a layperson. Don't over-explain.
`;

interface ProseSectionRequest {
  label: string;          // for logging (e.g. "audit-exec-summary")
  systemPrompt: string;
  userPrompt: string;
  sourceContext: string;  // grounding data the model should anchor to
  maxTokens: number;
  qualityGate?: (text: string) => { ok: boolean; reason?: string };
  /** Skip Pass A (factual check) when grounding data is deterministic
   * (e.g. JSON dump of scan results) and the LLM has no room to
   * fabricate -- saves subrequest budget. Default false. */
  skipFactual?: boolean;
  /** Override default 3-attempt max. Lower numbers save subrequest
   * budget when the section is forgivable to ship imperfect. */
  maxAttempts?: number;
}

async function generateProseSection(env: Env, req: ProseSectionRequest, brandSlug: string): Promise<string> {
  const initial = await callClaude(env, req.systemPrompt, req.userPrompt, req.maxTokens);
  const result = await multiPassValidate(env, {
    generated: initial,
    sourceContext: req.sourceContext,
    toneContext: "customer-publication",
    qualityGate: req.qualityGate,
    skipFactual: req.skipFactual,
    regenerate: async (feedback) => {
      const retryUser = `${req.userPrompt}\n\n---\n\nThe previous attempt had these issues you must fix this time:\n${feedback}\n\nGenerate the corrected version. Same constraints, fewer issues.`;
      return await callClaude(env, req.systemPrompt, retryUser, req.maxTokens);
    },
    maxAttempts: req.maxAttempts ?? 3,
    label: req.label,
    clientSlug: brandSlug,
  });
  return result.text;
}

// ---------- Section generators ----------

async function genExecutiveSummary(
  env: Env,
  brand: string,
  domain: string,
  customerName: string,
  entityAudit: PartialEntityAudit,
  aeoScan: AeoScanResult | null,
): Promise<string> {
  const groundingData = JSON.stringify({
    brand,
    domain,
    customer_first_name: customerName,
    entity_score: entityAudit.partial_score,
    entity_signals_lit: Object.entries(entityAudit.signals).filter(([_, v]) => v?.present).map(([k]) => k),
    entity_signals_dim: Object.entries(entityAudit.signals).filter(([_, v]) => !v?.present).map(([k]) => k),
    top_actions: entityAudit.actions.slice(0, 3).map((a) => ({ title: a.title, lift: a.score_lift, effort: a.effort })),
    aeo_score: aeoScan?.aeo_score ?? null,
    aeo_grade: aeoScan?.grade ?? null,
  }, null, 2);

  const system = `You write executive summaries for AEO (Answer Engine Optimization) audit deliverables. Your audience is the business owner or marketing lead who paid $750 for the audit.

${HM_VOICE_RULES}

CRITICAL: This audit reports TWO distinct scores that measure different things. You must NOT conflate them:

  - **Entity score** (0-100): how well the brand registers across the eight off-site and on-site IDENTITY surfaces AI engines lean on (Wikidata, Wikipedia, Organization schema, sameAs depth, Person schema, knowledge panel, about-page authority, brand consistency). Low entity score means AI engines can't verify who the brand is.

  - **AEO score** (0-100, with letter grade): how READY the brand's website is to be cited by AI, measured by schema completeness and technical structure of the homepage. Low AEO score means AI engines can read the site but the structured data is missing or broken.

In the executive summary you must clearly distinguish the two. Phrasing template: "Your entity score is X out of 100 (the off-site identity-graph score) and your AEO score is Y out of 100 (the on-site schema-readiness score)." Do not use generic phrases like "your score" without specifying which.

Structure: 3 paragraphs.

Paragraph 1: address the customer by first name, set context in one sentence (this is the full audit, not a teaser), then state both scores explicitly with their distinct meanings, then name the single most important finding tying them together.

Paragraph 2: name the THREE specific top actions BY READING THE ACTUAL DATA in the "top_actions" field. The first action you name MUST be the one whose priority is 1 in the data. Use this exact pattern: "First, [exact title from data] ([effort from data], [+score_lift from data] points). Second, [title #2] ([effort #2], [+lift #2] points). Third, [title #3] ([effort #3], [+lift #3] points)." Do NOT invent action names. Do NOT reorder them. Do NOT use generic phrases like "the three highest-impact actions" or "key recommendations" — name them.

Paragraph 3: tee up the rest of the document. Tell them what they're about to read in 2 sentences.

Total length: 200-320 words. No bullet points. No headers within this section.

If the entity score is 0, frame it as "no off-site identity-graph presence detected", not "your score is 0" alone — the zero needs context to land as actionable rather than insulting.`;

  const user = `Generate the executive summary. Brand and audit data:\n\n${groundingData}`;

  return await generateProseSection(env, {
    label: "audit-exec-summary",
    systemPrompt: system,
    userPrompt: user,
    sourceContext: groundingData,
    maxTokens: 600,
    qualityGate: (text) => {
      const wc = text.split(/\s+/).length;
      if (wc < 150) return { ok: false, reason: `too short (${wc} words, need 200-320)` };
      if (wc > 360) return { ok: false, reason: `too long (${wc} words, need 200-320)` };
      if (!text.toLowerCase().includes(brand.toLowerCase().split(" ")[0])) {
        return { ok: false, reason: "doesn't reference the brand by name" };
      }
      // Specificity check: must cite at least one numeric score from the
      // source data, not just talk in generalities about "low scores."
      const hasNumeric = /\b\d{1,3}\s*(?:\/\s*100|out of\s*100|points?|percentile|percent)\b/i.test(text);
      if (!hasNumeric) {
        return { ok: false, reason: "doesn't cite a specific numeric score from the audit data" };
      }
      // Both scores must be referenced (entity vs AEO are different
      // metrics; the QA agent flagged conflation as a blocking issue).
      const lower = text.toLowerCase();
      if (!lower.includes("entity score") && !lower.includes("entity-graph")) {
        return { ok: false, reason: "doesn't reference 'entity score' or 'entity-graph score'" };
      }
      if (!lower.includes("aeo score")) {
        return { ok: false, reason: "doesn't reference 'AEO score'" };
      }
      // Customer name check (when provided): must address by first name
      // in paragraph 1 to anchor as a per-customer deliverable, not boilerplate.
      if (customerName && customerName !== "there" && !text.toLowerCase().includes(customerName.toLowerCase())) {
        return { ok: false, reason: `doesn't address customer by first name (${customerName})` };
      }
      return { ok: true };
    },
  }, brand);
}

async function genAeoFindingsProse(
  env: Env,
  brand: string,
  aeoScan: AeoScanResult | null,
): Promise<string> {
  if (!aeoScan) {
    return `<p>Could not run a fresh schema scan against this domain. Common causes: site blocked our crawler, returned a non-2xx status, or has a CDN-level rate limit. Re-run after granting access or whitelisting <code>NeverRanked-EntityAudit</code> user agent.</p>`;
  }

  const groundingData = JSON.stringify({
    brand,
    aeo_score: aeoScan.aeo_score,
    grade: aeoScan.grade,
    technical_signals: (aeoScan.technical_signals || []).slice(0, 8),
  }, null, 2);

  const system = `You write the AEO scan findings paragraph for an audit deliverable. The reader has already seen the score gauge above this paragraph -- you don't need to restate the number. Focus on what the technical signals actually mean.

${HM_VOICE_RULES}

Structure: 2 paragraphs.

Paragraph 1: name the 2-3 most consequential technical signals from the scan. For each, explain in one sentence what AI engines actually do with it. Be specific (not "improves SEO" -- name the engine behavior).

Paragraph 2: tie the score to a category band. Where does this score sit relative to a category leader (typically scoring 85+) and a typical SMB (typically scoring under 50)? One forward-looking sentence on what's fixable in 30 days vs 90 days.

Length: 140-220 words. No bullet points. Address the brand by name at least once.`;

  const user = `Generate the AEO findings prose. Scan data:\n\n${groundingData}`;

  return await generateProseSection(env, {
    label: "audit-aeo-findings",
    systemPrompt: system,
    userPrompt: user,
    sourceContext: groundingData,
    maxTokens: 500,
    skipFactual: true,  // grounding is structured scan JSON, low fabrication risk
    maxAttempts: 2,     // tone + quality gates are deterministic, 2 attempts is enough
    qualityGate: (text) => {
      const wc = text.split(/\s+/).length;
      if (wc < 100) return { ok: false, reason: `too short (${wc} words)` };
      if (wc > 260) return { ok: false, reason: `too long (${wc} words)` };
      // Specificity: must reference at least one technical signal label
      // from the actual scan data. Without this, the LLM sometimes
      // produces generic "your site has structured data issues" prose.
      const signalLabels = (aeoScan.technical_signals || []).map((s) => s.label.toLowerCase());
      const referencesSignal = signalLabels.some((label) => {
        const tokens = label.split(/\W+/).filter((t) => t.length > 4);
        return tokens.some((t) => text.toLowerCase().includes(t));
      });
      if (signalLabels.length > 0 && !referencesSignal) {
        return { ok: false, reason: "doesn't reference any specific technical signal from the scan" };
      }
      return { ok: true };
    },
  }, brand);
}

// ---------- Competitive analysis ----------

interface CompetitorBrief {
  name: string;
  domain: string;
  why: string; // one-sentence rationale for why this is a real competitor
}

interface CompetitorScan {
  name: string;
  domain: string;
  why: string;
  entity_score: number;
  aeo_score: number | null;
  signals_lit: number;
  signals_total: number;
  schema_count: number;
}

/**
 * Ask Claude to identify 3-5 real competitors for the brand. Heavily
 * grounded: the model is given the brand name, domain, and entity
 * audit data (which often hints at category from the description in
 * Wikidata or the schema types found). The model returns structured
 * JSON we can validate before scanning.
 */
async function identifyCompetitors(
  env: Env,
  brand: string,
  domain: string,
  entityAudit: PartialEntityAudit,
): Promise<CompetitorBrief[]> {
  const wikidataDesc = ((entityAudit.signals.wikidata?.evidence as Record<string, unknown>)?.description as string | undefined) || "";
  const schemaTypes = Array.from(new Set(
    Object.values(entityAudit.signals)
      .flatMap((s) => {
        const ev = (s?.evidence ?? {}) as Record<string, unknown>;
        const t = ev["type"];
        if (typeof t === "string") return [t];
        if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
        return [];
      })
  ));
  const groundingData = JSON.stringify({ brand, domain, wikidata_description: wikidataDesc, schema_types: schemaTypes }, null, 2);

  const system = `You identify real competitors for a brand based on its name, domain, and category signals. You return STRICT JSON with no prose:

{
  "competitors": [
    { "name": "...", "domain": "example.com", "why": "one specific sentence explaining why this is a real head-to-head competitor" }
  ]
}

Rules:
- Return exactly 3 competitors. Not 4. Not 2. Three.
- Each must be a real, publicly-known business with a real domain. NEVER invent a company. If you're not certain a domain exists, do not include it.
- Each must compete in the same primary category and (where relevant) the same geography. A Hawaii rebate program competes with other Hawaii or West Coast energy programs, not generic national ones unless those genuinely operate locally.
- "why" is one sentence, specific, names the competitive overlap (same product, same market, same buyer). No fluff.
- Domain must be the bare domain (e.g., "example.com"), no protocol, no path, no www.
- If you genuinely cannot identify 3 real competitors with certainty, return fewer rather than fabricate.`;

  const user = `Identify competitors. Brand data:\n\n${groundingData}\n\nReturn the JSON now.`;

  try {
    const raw = await callClaude(env, system, user, 600);
    console.log(`[audit-competitive] Claude raw response (${brand}): ${raw.slice(0, 500)}`);
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) {
      console.log(`[audit-competitive] no JSON object found in response`);
      return [];
    }
    let parsed: { competitors?: CompetitorBrief[] };
    try {
      parsed = JSON.parse(m[0]) as { competitors?: CompetitorBrief[] };
    } catch (e) {
      console.log(`[audit-competitive] JSON parse failed: ${e}`);
      return [];
    }
    const all = parsed.competitors || [];
    console.log(`[audit-competitive] parsed ${all.length} competitors before filtering`);
    const list = all.filter((c) => {
      const ok = !!c.name && !!c.domain && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(c.domain);
      if (!ok) console.log(`[audit-competitive] filtered out: name=${c.name!} domain=${c.domain!}`);
      return ok;
    });
    const final = list.filter((c) => c.domain.toLowerCase() !== domain.toLowerCase().replace(/^www\./, ""));
    console.log(`[audit-competitive] returning ${final.length} competitors: ${final.map((c) => c.domain).join(", ")}`);
    return final;
  } catch (e) {
    console.log(`[audit-competitive] callClaude failed: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

/**
 * Light scan of a single competitor: just the on-page schema parse +
 * entity audit's cheap signals. We don't run DataForSEO for each
 * competitor since cost adds up; the comparison value is in
 * structural depth (schema, sameAs, Wikidata presence) which we get
 * from the existing entity-graph functions.
 */
async function scanCompetitor(env: Env, c: CompetitorBrief): Promise<CompetitorScan | null> {
  try {
    // Light audit: 2-3 subrequests per competitor instead of 7-9.
    // Cloudflare Workers caps a single invocation at ~50 subrequests
    // and the customer's own full audit already eats ~15. With 3
    // competitors we'd otherwise blow the budget.
    const audit = await auditEntityGraphLight(env, c.name, c.domain);
    const lit = Object.values(audit.signals).filter((s) => s?.present && s.error !== "skipped in light audit").length;
    // Total only counts signals we actually checked, for a fair
    // denominator vs the customer's full 8-signal score.
    const total = Object.values(audit.signals).filter((s) => s?.error !== "skipped in light audit").length;
    const orgEv = (audit.signals.org_schema?.evidence ?? {}) as Record<string, unknown>;
    const presentProps = (orgEv.present_props as string[]) || [];
    return {
      name: c.name,
      domain: c.domain,
      why: c.why,
      entity_score: audit.partial_score,
      aeo_score: null, // AEO scan skipped in competitor scans -- subrequest budget
      signals_lit: lit,
      signals_total: total,
      schema_count: presentProps.length,
    };
  } catch (e) {
    console.log(`[scanCompetitor] ${c.name} threw: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function genCompetitiveSection(
  env: Env,
  brand: string,
  domain: string,
  entityAudit: PartialEntityAudit,
  aeoScan: AeoScanResult | null,
): Promise<{ html: string; commentary: string } | null> {
  const competitors = await identifyCompetitors(env, brand, domain, entityAudit);
  if (competitors.length === 0) return null;

  const scans = (await Promise.all(competitors.map((c) => scanCompetitor(env, c))))
    .filter((s): s is CompetitorScan => s !== null);
  if (scans.length === 0) return null;

  // Build the comparison table. Customer's row sits at the top.
  const customerRow = {
    name: brand,
    domain,
    entity_score: entityAudit.partial_score,
    aeo_score: aeoScan?.aeo_score ?? null,
    signals_lit: Object.values(entityAudit.signals).filter((s) => s?.present).length,
    signals_total: Object.values(entityAudit.signals).length,
  };

  const rows = [
    `<tr style="background:rgba(232,199,103,0.06)">
      <td style="padding:12px 14px;border-bottom:1px solid #222;font-size:13px;color:var(--text);font-weight:500">${escHtml(customerRow.name)} <span style="color:var(--gold);font-size:10px;letter-spacing:0.16em;text-transform:uppercase;margin-left:6px">you</span></td>
      <td style="padding:12px 14px;border-bottom:1px solid #222;font-family:var(--mono);font-size:12px;color:var(--gold);text-align:right">${customerRow.entity_score}/100</td>
      <td style="padding:12px 14px;border-bottom:1px solid #222;font-family:var(--mono);font-size:12px;color:var(--gold);text-align:right">${customerRow.aeo_score !== null ? `${customerRow.aeo_score}/100` : "—"}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #222;font-family:var(--mono);font-size:12px;color:var(--text-mute);text-align:right">${customerRow.signals_lit}/${customerRow.signals_total}</td>
    </tr>`,
    ...scans.map((s) => {
      const entityClass = s.entity_score > customerRow.entity_score ? "color:#e88a6e" : "color:var(--text-soft)";
      const aeoClass = s.aeo_score !== null && customerRow.aeo_score !== null && s.aeo_score > customerRow.aeo_score ? "color:#e88a6e" : "color:var(--text-soft)";
      return `<tr>
        <td style="padding:12px 14px;border-bottom:1px solid #222;font-size:13px;color:var(--text-soft)">${escHtml(s.name)}<div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);margin-top:2px">${escHtml(s.domain)}</div></td>
        <td style="padding:12px 14px;border-bottom:1px solid #222;font-family:var(--mono);font-size:12px;${entityClass};text-align:right">${s.entity_score}/100</td>
        <td style="padding:12px 14px;border-bottom:1px solid #222;font-family:var(--mono);font-size:12px;${aeoClass};text-align:right">${s.aeo_score !== null ? `${s.aeo_score}/100` : "—"}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #222;font-family:var(--mono);font-size:12px;color:var(--text-mute);text-align:right">${s.signals_lit}/${s.signals_total}</td>
      </tr>`;
    }),
  ].join("");

  const tableHtml = `<table style="width:100%;border-collapse:collapse;margin:18px 0;background:var(--panel);border:1px solid var(--line);border-radius:6px;overflow:hidden">
    <thead>
      <tr>
        <th style="padding:12px 14px;text-align:left;font-family:var(--mono);font-size:10px;color:var(--text-mute);letter-spacing:0.18em;text-transform:uppercase;border-bottom:1px solid var(--line)">Brand</th>
        <th style="padding:12px 14px;text-align:right;font-family:var(--mono);font-size:10px;color:var(--text-mute);letter-spacing:0.18em;text-transform:uppercase;border-bottom:1px solid var(--line)">Entity</th>
        <th style="padding:12px 14px;text-align:right;font-family:var(--mono);font-size:10px;color:var(--text-mute);letter-spacing:0.18em;text-transform:uppercase;border-bottom:1px solid var(--line)">AEO</th>
        <th style="padding:12px 14px;text-align:right;font-family:var(--mono);font-size:10px;color:var(--text-mute);letter-spacing:0.18em;text-transform:uppercase;border-bottom:1px solid var(--line)">Signals</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  // Why-each-competitor list under the table
  const whyList = `<div style="margin-top:8px;font-family:var(--mono);font-size:11px;color:var(--text-mute);line-height:1.7">
    ${scans.map((s) => `<div style="padding:6px 0"><b style="color:var(--text-soft)">${escHtml(s.name)}</b>: ${escHtml(s.why)}</div>`).join("")}
  </div>`;

  // LLM commentary grounded in the comparison data
  const groundingData = JSON.stringify({
    you: { name: brand, ...customerRow },
    competitors: scans,
  }, null, 2);

  const system = `You write a brief commentary on a side-by-side comparison table. The reader sees the table -- you summarize the pattern, name the gap, and tee up the action.

${HM_VOICE_RULES}

Structure: 2 short paragraphs.

Paragraph 1: name where the customer sits relative to the named competitors. Specific. Use the actual numbers. If the customer is winning, say so plainly. If losing, name the leader and the metric.

Paragraph 2: name the single gap that closing would change the picture most. Tie it to a competitor's specific advantage (e.g., "Smith's has 8 sameAs links, you have 2"). Don't be vague.

Length: 90-160 words. No bullet points. No "in conclusion."`;

  const user = `Generate commentary on the comparison table:\n\n${groundingData}`;

  const commentary = await generateProseSection(env, {
    label: "audit-competitive-commentary",
    systemPrompt: system,
    userPrompt: user,
    sourceContext: groundingData,
    maxTokens: 400,
    skipFactual: true,  // grounding is the comparison table JSON, deterministic
    maxAttempts: 2,
    qualityGate: (text) => {
      const wc = text.split(/\s+/).length;
      if (wc < 60) return { ok: false, reason: `too short (${wc} words)` };
      if (wc > 200) return { ok: false, reason: `too long (${wc} words)` };
      // Must reference at least one competitor by name -- generic
      // commentary "your competitors are ahead" doesn't earn its keep.
      const namesAComp = scans.some((s) => text.toLowerCase().includes(s.name.toLowerCase().split(" ")[0]));
      if (!namesAComp) return { ok: false, reason: "doesn't name any specific competitor from the comparison" };
      return { ok: true };
    },
  }, brand);

  console.log(`[genCompetitiveSection] returning HTML len=${(tableHtml + whyList).length}, commentary len=${commentary.length}`);
  return { html: tableHtml + whyList, commentary };
}

async function genSchemaDeepDive(
  env: Env,
  brand: string,
  pages: PageSchemaScan[],
): Promise<{ tableHtml: string; commentary: string }> {
  // Build a deterministic table from page scan data — no LLM hallucination
  // about page coverage. The LLM only writes the commentary above it.
  const tableRows = pages.map((p) => {
    const path = (() => { try { return new URL(p.url).pathname || "/"; } catch { return p.url; } })();
    const status = p.schema_count === 0 ? "✗ none"
      : p.has_partial_schema_penalty ? "⚠ partial (penalty zone)"
      : p.has_organization ? "✓ has Organization"
      : "✓ has schema (no Org)";
    const types = p.schema_types.length ? p.schema_types.slice(0, 4).join(", ") : "—";
    const color = p.schema_count === 0 ? "#e88a6e"
      : p.has_partial_schema_penalty ? "#e8c767"
      : "#4ade80";
    return `<tr>
      <td style="padding:10px 14px;border-bottom:1px solid #222;font-family:var(--mono);font-size:12px;color:var(--text-soft)">${escHtml(path)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #222;font-family:var(--mono);font-size:12px;color:${color}">${escHtml(status)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #222;font-family:var(--mono);font-size:11px;color:var(--text-mute)">${escHtml(types)}</td>
    </tr>`;
  }).join("");

  const tableHtml = `<table style="width:100%;border-collapse:collapse;margin:18px 0;background:var(--panel);border:1px solid var(--line);border-radius:6px;overflow:hidden">
    <thead>
      <tr>
        <th style="padding:12px 14px;text-align:left;font-family:var(--mono);font-size:10px;color:var(--text-mute);letter-spacing:0.18em;text-transform:uppercase;border-bottom:1px solid var(--line)">Page</th>
        <th style="padding:12px 14px;text-align:left;font-family:var(--mono);font-size:10px;color:var(--text-mute);letter-spacing:0.18em;text-transform:uppercase;border-bottom:1px solid var(--line)">Status</th>
        <th style="padding:12px 14px;text-align:left;font-family:var(--mono);font-size:10px;color:var(--text-mute);letter-spacing:0.18em;text-transform:uppercase;border-bottom:1px solid var(--line)">Types found</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>`;

  // LLM commentary: ground in the actual table data
  const groundingData = JSON.stringify({ brand, pages: pages.map((p) => ({ url: p.url, schema_count: p.schema_count, types: p.schema_types, has_organization: p.has_organization, partial_penalty: p.has_partial_schema_penalty })) }, null, 2);

  const system = `You write a brief commentary on a per-page schema coverage table. The reader will see the table -- you summarize the pattern across the table, not re-list each row.

${HM_VOICE_RULES}

Structure: 2 short paragraphs.

Paragraph 1: name the dominant pattern. Are most pages bare? Is there an inconsistency where some pages are well-structured and others aren't? Is anything in the partial-schema penalty zone (1 schema present but incomplete = 18-percentile-point AI citation penalty)?

Paragraph 2: name the 1-2 page types that matter most for this customer's AEO and either acknowledge they're well-covered or flag the gap. Be specific about the URL paths from the table.

Length: 100-170 words. No bullet points.`;

  const user = `Generate the commentary. Page-by-page schema data:\n\n${groundingData}`;

  const commentary = await generateProseSection(env, {
    label: "audit-schema-commentary",
    systemPrompt: system,
    userPrompt: user,
    sourceContext: groundingData,
    maxTokens: 400,
    skipFactual: true,  // grounding is per-page schema JSON, deterministic
    maxAttempts: 2,
    qualityGate: (text) => {
      const wc = text.split(/\s+/).length;
      if (wc < 70) return { ok: false, reason: `too short (${wc} words)` };
      if (wc > 200) return { ok: false, reason: `too long (${wc} words)` };
      // Specificity: must reference at least one URL path from the page
      // scan data so the commentary is anchored to the customer's actual
      // pages, not a generic "your homepage" hand-wave.
      const paths = pages.map((p) => {
        try { return new URL(p.url).pathname; } catch { return ""; }
      }).filter((p) => p && p !== "/");
      if (paths.length > 0) {
        const referencesPath = paths.some((p) => text.includes(p) || text.includes(p.split("/").filter(Boolean)[0] || ""));
        if (!referencesPath) {
          return { ok: false, reason: "doesn't reference any specific URL path from the per-page scan" };
        }
      }
      return { ok: true };
    },
  }, brand);

  return { tableHtml, commentary };
}

// ---------- Main builder ----------

/** Backwards-compatible: returns just the HTML. New callers can use
 *  buildAuditTemplateWithCache to get the scan cache back for reuse. */
export async function buildAuditTemplate(env: Env, opts: TemplateOpts): Promise<string> {
  const result = await buildAuditTemplateWithCache(env, opts);
  return result.html;
}

/** Full builder. Returns rendered HTML plus the scan cache so callers
 *  (audit-delivery.ts on QA regen) can reuse the scans without re-
 *  running them. Saves ~25 subrequests per retry attempt -- the
 *  difference between regen succeeding and blowing the Workers
 *  subrequest budget. */
export async function buildAuditTemplateWithCache(env: Env, opts: TemplateOpts): Promise<AuditTemplateResult> {
  const { brand, domain } = opts;
  const customerName = opts.customer_name || "there";
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const cache = opts.scanCache || {};

  // Run scans in parallel ONLY when not provided in scanCache. On
  // QA-driven regen, all three are passed in -- we save ~25
  // subrequests by skipping the parallel block entirely.
  const needsEntityAudit = cache.entityAudit === undefined;
  const needsAeoScan = cache.aeoScan === undefined;
  const needsPageScans = cache.pageScans === undefined;
  const [entityAudit, aeoScan, pageScans] = await Promise.all([
    needsEntityAudit ? auditEntityGraphPartial(env, brand, domain).catch(() => null) : Promise.resolve(cache.entityAudit ?? null),
    needsAeoScan ? fetchAeoScan(domain) : Promise.resolve(cache.aeoScan ?? null),
    needsPageScans ? spiderTopPages(domain).catch(() => []) : Promise.resolve(cache.pageScans ?? []),
  ]);

  if (!entityAudit) {
    // Total failure -- return an honest error page rather than partial output.
    return errorPage(brand, domain, "Entity audit could not run. Check the domain is reachable and try again.");
  }

  // Generate prose sections in parallel for speed. Competitive
  // analysis is also cached on regen -- if scanCache.competitive is
  // provided, we skip the (expensive) Claude identification + 3
  // competitor scans + commentary call, saving another ~12
  // subrequests on attempt 2/3.
  const needsCompetitive = cache.competitive === undefined;
  const [execSummary, aeoProse, schemaResult, competitive] = await Promise.all([
    genExecutiveSummary(env, brand, domain, customerName, entityAudit, aeoScan).catch((e) => `<p>Section generation failed: ${escHtml(e instanceof Error ? e.message : String(e))}.</p>`),
    genAeoFindingsProse(env, brand, aeoScan).catch((e) => `<p>Section generation failed: ${escHtml(e instanceof Error ? e.message : String(e))}.</p>`),
    genSchemaDeepDive(env, brand, pageScans).catch((e) => ({ tableHtml: "", commentary: `<p>Section generation failed: ${escHtml(e instanceof Error ? e.message : String(e))}.</p>` })),
    needsCompetitive
      ? genCompetitiveSection(env, brand, domain, entityAudit, aeoScan).catch((e) => {
          console.log(`[buildAuditTemplate] competitive section failed: ${e instanceof Error ? e.message : e}`);
          return null;
        })
      : Promise.resolve(cache.competitive ?? null),
  ]);

  // Convert exec/AEO/schema prose paragraphs into HTML <p> tags if not already.
  const wrapPs = (s: string) => /^<p\b/i.test(s.trim())
    ? s
    : s.split(/\n\s*\n+/).map((p) => `<p>${escHtml(p.trim())}</p>`).join("\n");

  const entityCard = renderEntityAuditCard(entityAudit);
  const aeoGauge = aeoScan ? renderGauge(aeoScan.aeo_score, 100, {
    width: 320, height: 200, idPrefix: "aeo-real",
    showScore: true, showDenom: false, showGrade: true,
    ariaLabel: `AEO score ${aeoScan.aeo_score} out of 100`,
  }) : renderGauge(0, 100, {
    width: 320, height: 200, idPrefix: "aeo-pending",
    showScore: false, showDenom: false, showGrade: false,
    ariaLabel: "AEO scan unavailable",
  });

  const actionsBlock = renderActionsForRoadmap(entityAudit.actions);
  const aeoSignalsList = renderAeoSignalsList(aeoScan);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(brand)} · AEO Audit · NeverRanked</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;900&display=swap" rel="stylesheet">
<style>${BASE_CSS}</style>
</head>
<body>

<header class="page-hero">
  <div class="wrap">
    <div class="eyebrow"><span class="dot"></span><span>AEO Audit</span></div>
    <h1>${escHtml(brand)}</h1>
    <div class="domain"><span>${escHtml(domain)}</span></div>
    <div class="updated">${escHtml(today)} · NeverRanked</div>
  </div>
</header>

<section class="section">
  <div class="wrap">
    <div class="section-label"><span class="num">00</span><span>Executive summary</span><span class="rule"></span></div>
    ${wrapPs(execSummary)}
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-label"><span class="num">01</span><span>The picture</span><span class="rule"></span></div>
    <p>Eight identity surfaces AI engines weight when deciding to cite a brand. ${escHtml(brand)}'s standing on each, plus the prioritized actions ranked by score lift.</p>
    <div style="margin:24px 0;border:1px solid var(--line);border-radius:6px;overflow:hidden">
      ${entityCard}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-label"><span class="num">02</span><span>AEO scan findings</span><span class="rule"></span></div>
    <div class="aeo-block">
      <div class="gauge-slot">${aeoGauge}</div>
      <div>${aeoSignalsList}</div>
    </div>
    ${wrapPs(aeoProse)}
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-label"><span class="num">03</span><span>Schema deep dive</span><span class="rule"></span></div>
    <p>Per-page schema coverage across the homepage and the top-linked internal pages. Pages in the partial-schema penalty zone cost 18 percentile points of AI citation share versus no schema at all -- they're the most consequential to fix first.</p>
    ${schemaResult.tableHtml}
    ${wrapPs(schemaResult.commentary)}
  </div>
</section>

${competitive ? `
<section class="section">
  <div class="wrap">
    <div class="section-label"><span class="num">04</span><span>Competitive position</span><span class="rule"></span></div>
    <p>How ${escHtml(brand)} compares to three head-to-head competitors. Entity score is the eight-signal identity-graph audit out of 100. AEO score is the schema-readiness scan out of 100. Signals is the count of identity surfaces lit out of total tracked.</p>
    ${competitive.html}
    ${wrapPs(competitive.commentary)}
  </div>
</section>
` : ""}

<section class="section">
  <div class="wrap">
    <div class="section-label"><span class="num">${competitive ? "05" : "04"}</span><span>90-day roadmap</span><span class="rule"></span></div>
    <p>Prioritized actions ranked by score lift. Each one names the specific change, its measurable impact, and the realistic time to ship it.</p>
    ${actionsBlock}
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-label"><span class="num">${competitive ? "06" : "05"}</span><span>What we do next</span><span class="rule"></span></div>
    <p>Three paths from here.</p>
    <p><strong>1. Take this and run.</strong> The roadmap above is yours. Hand it to your engineers or your existing agency. We have no stake in whether you hire us, only that you fix what is broken.</p>
    <p><strong>2. Pulse, $497/mo.</strong> We monitor your citation share weekly across six AI engines, deploy two schemas to your live site each month, and send you a monthly visibility report. Your $750 audit fee is fully credited toward your first month if you upgrade within 30 days.</p>
    <p><strong>3. Signal, $2,000/mo.</strong> Pulse plus weekly tracking on 50+ prompts, Reddit thread monitoring, authority-platform tracking, unlimited schema deployment, and the auto-updating 90-day roadmap that pushes fixes to your live site within an hour.</p>
    <p>Reply to the audit email and we'll start whichever path makes sense.</p>
  </div>
</section>

<div class="footer">
  <div class="wrap">
    <div>NeverRanked · neverranked.com · <a href="mailto:lance@neverranked.com">lance@neverranked.com</a></div>
    <div style="margin-top:6px;letter-spacing:0.14em">Audit generated ${escHtml(today)}</div>
  </div>
</div>

</body>
</html>`;

  return {
    html,
    scans: { entityAudit, aeoScan, pageScans, competitive },
  };
}

// ---------- Helpers ----------

function renderActionsForRoadmap(actions: RecommendedAction[]): string {
  if (!actions || actions.length === 0) {
    return `<div style="padding:24px;background:var(--panel);border:1px solid var(--line);border-radius:6px;font-family:var(--mono);font-size:12px;color:var(--text-faint);text-align:center">Entity audit found no gaps to surface here. Schema-level roadmap items follow from the deep dive above.</div>`;
  }
  const rows = actions.slice(0, 5).map((a) => `
    <div class="roadmap-row">
      <div class="num">${String(a.priority).padStart(2, "0")}</div>
      <div>
        <div class="title">${escHtml(a.title)}</div>
        <div class="detail">${escHtml(a.detail)}</div>
      </div>
      <div>
        <div class="lift">+${a.score_lift}</div>
        <div class="effort">${escHtml(a.effort)}</div>
      </div>
    </div>
  `).join("");
  return `<div class="roadmap">${rows}</div>`;
}

function renderAeoSignalsList(scan: AeoScanResult | null): string {
  if (!scan) {
    return `<div style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">AEO scan unavailable. The remaining audit sections are based on what we could fetch.</div>`;
  }
  const signals = (scan.technical_signals || []).slice(0, 5);
  if (signals.length === 0) {
    return `<div style="font-family:var(--mono);font-size:12px;color:var(--text-mute)">Score: ${scan.aeo_score}/100 · Grade: ${scan.grade}</div>`;
  }
  return `<div style="font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.16em;text-transform:uppercase;margin-bottom:10px">Top signals</div>
    <div style="display:flex;flex-direction:column;gap:6px">${signals.map((s) => {
      const color = s.status === "good" ? "#4ade80" : s.status === "warn" ? "#e8c767" : "#e88a6e";
      return `<div style="display:grid;grid-template-columns:8px 1fr auto;gap:10px;align-items:center;font-size:12px">
        <div style="width:6px;height:6px;border-radius:50%;background:${color}"></div>
        <span style="color:var(--text-soft)">${escHtml(s.label)}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-mute)">${escHtml(s.value)}</span>
      </div>`;
    }).join("")}</div>`;
}

function errorPage(brand: string, domain: string, msg: string): string {
  return `<!doctype html><html><body style="font-family:system-ui;padding:48px;background:#0c0c0c;color:#e8e6df">
<h1 style="color:#e88a6e">Audit generation failed</h1>
<p>Brand: ${escHtml(brand)} (${escHtml(domain)})</p>
<p>${escHtml(msg)}</p>
</body></html>`;
}

function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c]!));
}

// ---------- CSS (shared with prior scaffold) ----------

const BASE_CSS = `
:root {
  --bg: #0c0c0c; --bg-lift: #131313;
  --panel: rgba(255,255,255,0.02); --line: #222;
  --text: #e8e6df; --text-soft: #aaa; --text-mute: #888; --text-faint: #555;
  --gold: #c9a84c; --gold-warm: #e8c767;
  --serif: 'Playfair Display', Georgia, serif;
  --mono: 'SF Mono', ui-monospace, monospace;
  --sans: ui-sans-serif, system-ui, -apple-system, sans-serif;
}
* { box-sizing: border-box }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); line-height: 1.65 }
.wrap { max-width: 880px; margin: 0 auto; padding: 0 32px }
.page-hero {
  padding: 96px 0 48px; border-bottom: 1px solid var(--line);
}
.page-hero .eyebrow {
  font-family: var(--mono); font-size: 11px; color: var(--gold);
  letter-spacing: 0.28em; text-transform: uppercase; margin-bottom: 16px;
  display: flex; align-items: center; gap: 10px;
}
.page-hero .eyebrow .dot {
  display: inline-block; width: 6px; height: 6px; background: var(--gold); border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(201,168,76,0.18), 0 0 12px rgba(232,199,103,0.6);
}
.page-hero h1 {
  font-family: var(--serif); font-weight: 900; font-size: clamp(40px, 6vw, 64px);
  letter-spacing: -0.028em; line-height: 1; margin: 0 0 16px;
}
.page-hero .domain {
  display: flex; align-items: center; gap: 10px; margin-top: 12px;
  font-family: var(--mono); font-size: 13px; color: var(--text-mute);
}
.page-hero .domain::before {
  content: ""; display: inline-block; width: 18px; height: 1px; background: var(--gold); opacity: 0.6;
}
.page-hero .updated {
  margin-top: 24px; font-family: var(--mono); font-size: 11px;
  color: var(--text-faint); letter-spacing: 0.18em; text-transform: uppercase;
}
.section { padding: 56px 0; border-bottom: 1px solid var(--line) }
.section:last-child { border-bottom: none }
.section-label {
  display: flex; align-items: center; gap: 14px; margin-bottom: 24px;
  font-family: var(--mono); font-size: 10px; color: var(--text-mute);
  letter-spacing: 0.22em; text-transform: uppercase;
}
.section-label .num { color: var(--gold); font-weight: 500 }
.section-label .rule { flex: 1; height: 1px; background: linear-gradient(90deg, var(--line) 0%, transparent 100%) }
.section h2 {
  font-family: var(--serif); font-weight: 900; font-size: clamp(28px, 4vw, 36px);
  letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 20px;
}
.section p {
  font-size: 16px; line-height: 1.75; color: var(--text-soft); margin: 0 0 18px; max-width: 70ch;
}
.section p strong, .section p b { color: var(--text); font-weight: 500 }
.aeo-block {
  display: grid; grid-template-columns: auto 1fr; gap: 32px; align-items: center;
  margin: 24px 0; padding: 24px; background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
}
.aeo-block .gauge-slot { line-height: 0; min-width: 240px }
.roadmap { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; margin: 18px 0 }
.roadmap-row {
  padding: 18px 20px; border-bottom: 1px solid var(--line); display: grid;
  grid-template-columns: auto 1fr auto; gap: 18px; align-items: start;
}
.roadmap-row:last-child { border-bottom: none }
.roadmap-row .num {
  font-family: var(--mono); font-size: 10px; color: var(--text-faint);
  letter-spacing: 0.18em; padding-top: 4px;
}
.roadmap-row .title { font-size: 15px; color: var(--text); font-weight: 500; line-height: 1.4 }
.roadmap-row .detail {
  font-family: var(--mono); font-size: 12px; color: var(--text-mute); margin-top: 6px; line-height: 1.6;
}
.roadmap-row .lift {
  font-family: var(--serif); font-size: 22px; font-weight: 900; color: var(--gold);
  letter-spacing: -0.02em; line-height: 1; text-align: right;
}
.roadmap-row .effort {
  font-family: var(--mono); font-size: 10px; color: var(--text-faint);
  letter-spacing: 0.16em; text-transform: uppercase; margin-top: 4px; text-align: right;
}
.footer {
  padding: 64px 0; text-align: center; font-family: var(--mono);
  font-size: 11px; color: var(--text-faint); letter-spacing: 0.18em; text-transform: uppercase;
}
.footer a { color: var(--gold); text-decoration: none }
@media print {
  body { background: white; color: black }
  .page-hero { padding-top: 24pt }
}
`;
