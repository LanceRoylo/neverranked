/**
 * Preview generator.
 *
 * Creates a personalized brief page for a prospect using Sonnet to
 * write the middle body content (the specific finding, the proof
 * point framing, the CTA). The system wraps it in a clean HTML
 * shell that matches HM voice and the existing /pitch/<slug>/ visual
 * pattern.
 *
 * Voice rules from Hello Momentum are baked into the system prompt:
 * no em dashes, no semicolons in marketing copy, no AI-tells, no
 * formulaic openers, no three-adjective lists.
 */

import type { Env } from "../types";

export interface PreviewInput {
  prospect_id?: number;
  client_slug?: string;
  recipient_name?: string;
  company_name?: string;
  domain?: string;
  vertical?: string;
  city?: string;
  notes?: string;
  // Tier from warm-prospect signal classification. Higher tier =
  // deeper Preview (more sections, more specific findings).
  signal_tier?: "warm" | "very_warm" | "hot" | "fading";
  open_count?: number;
  // Rich auto-detected intel from the lightweight domain enrichment.
  // Pre-filled by buildAutonomousPreview before calling Sonnet.
  enrichment?: {
    page_title: string | null;
    meta_description: string | null;
    og_site_name: string | null;
    schema_types_found: string[];
    notable_gaps: string[];
  };
  // Manual overrides if Lance wants to specify (legacy form path).
  audit_findings?: string;
  what_we_would_do?: string;
  extra_context?: string;
}

export interface PreviewOutput {
  slug: string;
  body_html: string;
  meta_title: string;
  meta_description: string;
}

const SYSTEM_PROMPT = `You write personalized brief pages for NeverRanked (an AI-citation tracking and content-shipping service).

Each brief is a short web page sent to a prospect Lance has been corresponding with. The brief replaces a sales call: instead of meeting, Lance points the prospect at this URL. They read it, decide, and reply.

VOICE RULES (violation = unusable output):
1. No em dashes. None. Anywhere.
2. No semicolons in marketing prose.
3. No AI-tell phrases: "delve", "leverage", "robust", "comprehensive", "seamless", "in today's fast-paced", "feel free to", "elevate", "world-class", "cutting-edge", "synergize", "best-in-class".
4. No formulaic openers: "Welcome to", "Nestled in", "Hidden gem", "Hope this finds you well".
5. No three-adjective lists ("fast, scalable, and reliable").
6. Short sentences. Two to four sentences per paragraph max.
7. Direct, Hawaiian-operator voice. Lance writes plainly, with specifics.
8. NEVER reference how many times the recipient opened any prior email. Don't reference engagement, behavior, or tracking signals of any kind.

HONESTY RULES (violation = the grader will hold the page, and rightly):
9. Every capability you state must be one NeverRanked already ships, present in the inputs Lance gave you. If a deliverable, schema type, or service is not in the inputs, do not claim it. Do not invent specifics to sound thorough.
10. Never promise THIS recipient a specific score, citation count, ranking, or timeline as a guaranteed result. The Hawaii Theatre numbers describe Hawaii Theatre only. Never imply or state the same outcome will happen for this company or this vertical.
11. If you cannot ground a statement in the provided inputs or the exact Hawaii Theatre facts, omit it. A shorter honest brief beats an impressive invented one. Richness comes from craft and specificity about what is real, never from added promises.

HM QUALITY GATE (Hello Momentum is the taste authority; the brief must clear these before it is good enough to send. Self-check every section against all of them and rewrite until they pass):
- Swap Test: if you could swap in a different company name and the sentence still works, it is too generic. Every paragraph must be unmistakably about THIS company, THIS domain, THIS finding. Delete any line that would survive the swap.
- So-What Test: every claim must answer "so what, for this specific reader." If a sentence does not change what they think or do, cut it.
- Blind Brand Test: a reader should know this is NeverRanked without a logo. Plain, direct, specific, a little blunt. Not the smooth voice every AI tool produces.
- Remove-a-Word Test: tighten until no word is removable without losing meaning. Short sentences. No throat-clearing, no preamble, no summary of what you are about to say.
- Regret Test: nothing manipulative, no false urgency, no fake scarcity, no flattery, no "act now." Principle 7: we are the wrong shop for manipulative copy. Calm confidence, never pressure.
- Lever Test: each section must do something, not just inform. Section 01 uses the lever "the inversion" (name the thing they trust, reveal it no longer controls the outcome). The hero uses a named-tension headline. The proof section's lever is concrete specificity (exact names and numbers, no rounding, no hedging). If a section is only conveying information with no device, it is decoration and fails.
- Craft floor: this must read as a considered, hand-built brief (the bar is Lance's manual pitch pages), never a filled-in template. Specific over smooth. Distinct over safe. If it reads like competent AI filler, it is not done.
These do not relax the HONESTY RULES. Distinctiveness comes from precision about what is real, never from bigger claims.

STRUCTURE (return as inner-HTML, no <html>/<head>/<body> wrappers).

Lance gives you concrete inputs: recipient_name, company_name, domain, headline_finding, what_we_would_do, and optional extra_context/audit_findings. USE THESE LITERALLY. Do not generalize. Do not paraphrase the finding into something softer. The personalization is the whole point.

The page is a hero followed by NUMBERED sections, exactly like Lance's hand-built briefs. Use this markup precisely:

A. <section class="page-hero">
   - <h1> = the headline_finding stated as a sharp, named claim about THIS company. Wrap the most pointed 2-4 words in <em>...</em> (renders gold italic). One line, no period needed.
   - <div class="updated">Private brief · prepared for [recipient_name or company_name]</div>

B. <section class="legal-section">
     <div class="section-label"><span class="num">00</span><span>Why this brief exists</span><span class="rule"></span></div>
   - 2 to 3 short paragraphs. Open with the recipient's first name on its own, then "Lance." (e.g. "Nicolas. Lance."). Name the company and domain. State plainly why this page exists instead of a call. No claims, only context. If extra_context is provided, weave one natural reference here so they know the conversation was remembered.

C. <section class="legal-section">
     <div class="section-label"><span class="num">01</span><span>SEO got you ranked. AI decides if you exist.</span><span class="rule"></span></div>
   - The education section. Many recipients do not know what AEO is or how it differs from SEO. Teach them, in NeverRanked's plain voice, using the CREATIVE LEVER "the inversion": name the thing they trust (their SEO work / Google rank), then reveal it no longer controls whether they get found.
   - Enter the wound, do not lecture: they did the SEO work in good faith and the ground moved under them. Acknowledge that, then explain the mechanism:
     * Classic SEO ranks a list of blue links. A person scans the page and clicks. Being on page one is the game.
     * AI answer engines (ChatGPT, Perplexity, Google AI Overviews, Claude) do not hand back a list. For any given question they synthesize one answer and cite a handful of sources. Ask the question a slightly different way, or just ask again, and the answer shifts. Across the range of questions your customers actually ask, most businesses surface for some and are absent from others. Being consistently among the cited sources is what decides whether you are in the answer, no matter where you rank on Google.
     * Where this is going (NeverRanked's stated view, framed as our point of view, NOT as a forecast with numbers): more questions get answered without anyone clicking a link, so being CITED becomes the thing that matters the way ranking used to.
   - Emit exactly one comparison device so this reads as a briefing, not a paragraph:
     <div class="compare"><div class="col"><div class="col-h">Classic SEO</div><ul><li>...</li><li>...</li><li>...</li></ul></div><div class="col"><div class="col-h">AI answer engines (AEO)</div><ul><li>...</li><li>...</li><li>...</li></ul></div></div>
     Three short, parallel <li> pairs. Concrete and mechanical (how each works), never statistical.
   - HARD: no invented percentages, market-share figures, dates, or "X% of searches" claims anywhere in this section. Mechanism and point of view only. Unsupported numbers will be held by the grader and they would be wrong.

D. <section class="legal-section">
     <div class="section-label"><span class="num">02</span><span>The finding</span><span class="rule"></span></div>
   - <h2> restating the finding crisply. Then prose (and a <ul> only if audit_findings gives you concrete, real items) explaining the implication for THIS company, connecting back to the shift you just explained. Do NOT assert a numeric score for them. State the gap qualitatively unless a real number is in the inputs.

E. <section class="legal-section">
     <div class="section-label"><span class="num">03</span><span>What this looks like in practice</span><span class="rule"></span></div>
   - The Hawaii Theatre proof point. State it EXACTLY as these facts, do not rephrase the numbers or invent a different framing:
     * The client is "Hawaii Theatre Center" (use that exact name, never "Hawaii Theatre Company" or any variant).
     * Their NeverRanked AEO score went from 45 to 95 (out of 100) in ten days.
     * In the same week, on the first weekly citation log run, Perplexity named them in 14 of 19 tracked queries.
   - Do NOT say "zero citations," do NOT say "zero to forty-five," do NOT change "45 to 95" into any other pair of numbers. The score moved 45 -> 95. That is the only correct framing.
   - One sentence may connect the case study to the recipient's category. It must NOT imply they will get the same result (see honesty rule 10).

F. <section class="legal-section">
     <div class="section-label"><span class="num">04</span><span>What we would do</span><span class="rule"></span></div>
   - Use what_we_would_do as the substance, as a verb-led <ul> (2 to 4 items). Each item specific about schema type, cadence, deliverable shape — but only items grounded in the inputs.
   - You MAY add ONE closing sentence after the list (not a list item) noting the SEO byproduct, in this exact spirit: the structured-data and content work we deploy to make them citable also strengthens their classic search rich results and organic discovery, included because the AEO work produces it. HARD GUARDRAIL: frame it ONLY as an included side effect. NEVER as a measured outcome, a ranking or traffic promise, a separate service line, or with any number or percentage. If it cannot be said as pure byproduct, omit the sentence entirely.

G. <section class="legal-section">
     <div class="section-label"><span class="num">05</span><span>What to do next</span><span class="rule"></span></div>
   - One short paragraph CTA inviting a reply (vary wording so it reads written, not templated). Then the signed close, exactly:
     <p class="sign">Lance Roylo</p>
     <p style="margin:0"><a href="mailto:lance@hi.neverranked.com">lance@hi.neverranked.com</a></p>

NEVER include a meeting/call/chat ask anywhere on the page.

OUTPUT FORMAT (strict JSON):
{
  "meta_title": "<page title, 30-70 chars, includes their company name if we have it>",
  "meta_description": "<one-line summary, 80-160 chars>",
  "body_html": "<the page-hero block A then the numbered legal-section blocks 00-05 exactly as specified, no DOCTYPE or wrappers>"
}`;

function depthForTier(tier: PreviewInput["signal_tier"]): string {
  // Depth scales WITHIN the fixed A + 00-05 arc — never invent new
  // shapes or drop the numbered device. The 01 education section +
  // its compare device stays for every tier except fading (it is the
  // differentiator most recipients need). Trim by tightening prose
  // and shrinking the 04 list; keep 00 / 01 / 03 / 05 always.
  switch (tier) {
    case "hot":
      return `DEPTH: HOT prospect. Deepest version. Full arc: page-hero + 00, 01 (full education + compare device), 02, 03, 04 (3-4 grounded <ul> items), 05. ~550-750 words.`;
    case "very_warm":
      return `DEPTH: VERY_WARM. Active consideration. Full arc, leaner: page-hero + 00, 01 (education + compare device, tighter), 02, 03, 04 (3 items), 05. ~450-600 words.`;
    case "warm":
      return `DEPTH: WARM. Moderate engagement. page-hero + 00, 01 (education + compare device, concise), 02 (prose only), 03, 04 (2-3 items), 05. ~380-520 words.`;
    case "fading":
      return `DEPTH: FADING. Went quiet, no pressure. page-hero + 00 (brief) + 01 (a SHORT 3-4 sentence version of the SEO->AEO shift, NO compare device) + 03 (one-sentence proof) + 05 (low-pressure "this stays here whenever you're ready"). Fold the finding into the hero; omit 02 and 04 as separate sections. Keep numbered labels on the sections you include. ~220-320 words.`;
    default:
      return `DEPTH: Unknown tier. Use the full arc at very_warm depth.`;
  }
}

function randomToken(length = 6): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  for (let i = 0; i < length; i++) {
    out += chars[buf[i] % chars.length];
  }
  return out;
}

function slugify(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

/**
 * Build a slug. Prefers a readable prefix (company name or domain)
 * concatenated with a random token so URLs are recognizable but
 * not enumerable.
 */
function buildSlug(input: PreviewInput): string {
  const prefix =
    slugify(input.company_name) ||
    slugify(input.domain?.replace(/^https?:\/\//, "").replace(/\..*$/, "")) ||
    `prospect-${input.prospect_id ?? "n"}`;
  const token = randomToken(5);
  return `${prefix}-${token}`;
}

export async function generatePreview(
  env: Env,
  input: PreviewInput,
): Promise<PreviewOutput | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  // Depth scaling by tier. Hot prospects get the deepest version
  // (more sections, more specific findings); fading gets a lighter
  // touch.
  const depthInstruction = depthForTier(input.signal_tier);

  const enrichmentBlock = input.enrichment ? `
DETECTED SITE INTEL (use these literally to make the Preview specific):
- Page title: ${input.enrichment.page_title || "(none detected)"}
- Meta description: ${input.enrichment.meta_description || "(none)"}
- Site name: ${input.enrichment.og_site_name || "(none)"}
- Schema types found on the homepage: ${input.enrichment.schema_types_found.length > 0 ? input.enrichment.schema_types_found.join(", ") : "NONE -- this is a major AEO gap; lead with this in the hero"}
- Notable gaps from the scan: ${input.enrichment.notable_gaps.length > 0 ? input.enrichment.notable_gaps.join("; ") : "none"}` : "";

  const userMessage = `Recipient:
${input.recipient_name ? `Name: ${input.recipient_name}` : ""}
${input.company_name ? `Company: ${input.company_name}` : ""}
${input.domain ? `Domain: ${input.domain}` : ""}
${input.vertical ? `Vertical: ${input.vertical}` : ""}
${input.city ? `City: ${input.city}` : ""}
${input.notes ? `Notes from prior contact: ${input.notes}` : ""}

${depthInstruction}
${enrichmentBlock}

${input.audit_findings ? `HEADLINE FINDING (overrides auto-detected; lead with this verbatim):\n${input.audit_findings}` : ""}
${input.what_we_would_do ? `WHAT WE WOULD DO (overrides auto-detected):\n${input.what_we_would_do}` : ""}
${input.extra_context ? `EXTRA CONTEXT:\n${input.extra_context}` : ""}

Write the brief. Use the company name and domain throughout where natural. Lead with the most specific finding you can derive from the inputs above. Return JSON only.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 2200,
      temperature: 0.5,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) {
    console.error(`generatePreview: ${resp.status} ${await resp.text()}`);
    return null;
  }

  const json = (await resp.json()) as { content: { type: string; text: string }[] };
  const raw = json.content?.[0]?.text || "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as {
      meta_title?: string;
      meta_description?: string;
      body_html?: string;
    };
    if (!parsed.body_html || !parsed.meta_title) return null;
    return {
      slug: buildSlug(input),
      body_html: String(parsed.body_html).trim(),
      meta_title: String(parsed.meta_title).trim(),
      meta_description: String(parsed.meta_description || "").trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Persist a generated Preview as a draft row. Returns slug for routing.
 */
export async function savePreviewDraft(
  env: Env,
  input: PreviewInput,
  generated: PreviewOutput,
  status: "draft" | "held" = "draft",
): Promise<string> {
  await env.DB.prepare(
    `INSERT INTO previews
       (slug, prospect_id, client_slug, recipient_name, company_name, domain,
        body_html, meta_title, meta_description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
  )
    .bind(
      generated.slug,
      input.prospect_id ?? null,
      input.client_slug ?? null,
      input.recipient_name ?? null,
      input.company_name ?? null,
      input.domain ?? null,
      generated.body_html,
      generated.meta_title,
      generated.meta_description || null,
      status,
    )
    .run();
  return generated.slug;
}

export interface PreviewRecord {
  id: number;
  slug: string;
  prospect_id: number | null;
  client_slug: string | null;
  recipient_name: string | null;
  company_name: string | null;
  domain: string | null;
  body_html: string;
  meta_title: string | null;
  meta_description: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  viewed_count: number;
  first_viewed_at: number | null;
  last_viewed_at: number | null;
}

export async function getPreviewBySlug(env: Env, slug: string): Promise<PreviewRecord | null> {
  return await env.DB.prepare(
    `SELECT * FROM previews WHERE slug = ?`,
  ).bind(slug).first<PreviewRecord>();
}

export async function getPreviewByProspectId(env: Env, prospect_id: number): Promise<PreviewRecord | null> {
  return await env.DB.prepare(
    `SELECT * FROM previews WHERE prospect_id = ?
       AND status IN ('draft', 'published')
       ORDER BY created_at DESC LIMIT 1`,
  ).bind(prospect_id).first<PreviewRecord>();
}

export async function publishPreview(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE previews SET status = 'published', published_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`,
  ).bind(id).run();
}

export async function updatePreviewBody(env: Env, id: number, body_html: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE previews SET body_html = ?, updated_at = unixepoch() WHERE id = ?`,
  ).bind(body_html.trim(), id).run();
}

/**
 * Archive every draft/published Preview for a prospect so a fresh
 * build regenerates under the current template. status='archived'
 * is already treated as gone by the public renderer, so the old
 * /preview/<slug> stops resolving. Non-destructive (kept for audit).
 * Replaces the manual "wrangler d1 UPDATE" hack.
 */
export async function archivePreviewsForProspect(
  env: Env,
  prospect_id: number,
): Promise<number> {
  const r = await env.DB.prepare(
    `UPDATE previews SET status='archived', updated_at=unixepoch()
       WHERE prospect_id = ? AND status IN ('draft','published')`,
  ).bind(prospect_id).run();
  return r.meta.changes ?? 0;
}

/**
 * Log a view. Bumps viewed_count, sets first/last_viewed_at.
 */
/**
 * Autonomous Preview build. The flow Lance asked for:
 *   1. Look up prospect metadata in outreach_prospects (synced from
 *      the local outreach tool)
 *   2. If we have a domain, run a lightweight enrichment scan
 *   3. Pull the signal tier from the warmth scoring
 *   4. Generate a Preview with depth scaled to tier and content
 *      specific to whatever we found
 *
 * Returns the slug of the new draft on success, or null on failure
 * (with a reason logged). The slug is the URL fragment for /preview/<slug>.
 */
export async function buildAutonomousPreview(
  env: Env,
  prospect_id: number,
  signal_tier: "warm" | "very_warm" | "hot" | "fading",
  open_count: number,
): Promise<{ slug: string } | { error: string }> {
  // 1. Lookup metadata
  const { getProspectMetadata } = await import("../routes/sync-prospects");
  const metadata = await getProspectMetadata(env, prospect_id);
  if (!metadata) {
    return { error: "Prospect metadata not synced. Push prospect data from the local outreach tool to /api/admin/sync-prospects first." };
  }
  if (!metadata.domain) {
    return { error: "Prospect has no domain on file. Update the prospect in the local outreach tool with a domain, then re-sync." };
  }

  // 2. Enrich
  let enrichment: PreviewInput["enrichment"] = undefined;
  try {
    const { enrichDomain } = await import("./domain-enrich");
    const e = await enrichDomain(metadata.domain);
    if (e.reachable) {
      enrichment = {
        page_title: e.page_title,
        meta_description: e.meta_description,
        og_site_name: e.og_site_name,
        schema_types_found: e.schema_types_found,
        notable_gaps: e.notable_gaps,
      };
    }
  } catch (e) {
    console.error("Preview enrichment failed:", e);
    // Continue without enrichment.
  }

  // 3. Generate
  const generated = await generatePreview(env, {
    prospect_id,
    recipient_name: metadata.name || undefined,
    company_name: metadata.company_name || undefined,
    domain: metadata.domain,
    vertical: metadata.vertical || undefined,
    city: metadata.city || undefined,
    notes: metadata.notes || undefined,
    signal_tier,
    open_count,
    enrichment,
  });
  if (!generated) {
    return { error: "Sonnet generation failed (check ANTHROPIC_API_KEY and logs)" };
  }

  // 3b. Fail-closed grade. Nothing reaches a prospect ungraded. A
  // fabricated client name or wrong case-study stat (the 2026-05-14
  // incident) gets caught here and the Preview is saved 'held', not
  // 'draft' -- the public route refuses to serve 'held'.
  const { gradeProspectOutput } = await import("./output-grader");
  const groundTruth = [
    `Prospect domain: ${metadata.domain}`,
    `Prospect business: ${metadata.company_name || "(unknown)"}`,
    `Vertical: ${metadata.vertical || "(unknown)"}`,
    enrichment
      ? `Verified site intel — schema types found: ${enrichment.schema_types_found.length ? enrichment.schema_types_found.join(", ") : "NONE"}; notable gaps: ${enrichment.notable_gaps.length ? enrichment.notable_gaps.join("; ") : "none"}`
      : "Site enrichment: unavailable (site unreachable at generation time) — the Preview must NOT assert specific schema findings as fact",
  ].join("\n");
  const grade = await gradeProspectOutput(
    env,
    `${generated.meta_title}\n\n${generated.body_html}`,
    "Preview brief (autonomous, prospect-facing)",
    groundTruth,
  );

  const persistInput = {
    prospect_id,
    recipient_name: metadata.name || undefined,
    company_name: metadata.company_name || undefined,
    domain: metadata.domain,
  };

  if (grade.verdict !== "pass") {
    // 4a. Held path: persist with status 'held' (never served), log
    // to admin_inbox so Lance can review/override.
    const slug = await savePreviewDraft(env, persistInput, generated, "held");
    try {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO admin_inbox (kind, title, body, target_type, target_id, status, created_at)
         VALUES ('preview_held', ?, ?, 'preview', ?, 'pending', unixepoch())`,
      )
        .bind(
          `Preview HELD by grader: ${metadata.company_name || metadata.domain}`,
          `Autonomous Preview for prospect ${prospect_id} failed the fail-closed grader and was NOT published.\n\nFactual: ${grade.factual_pass ? "pass" : "FAIL"} | Voice: ${grade.voice_pass ? "pass" : "FAIL"} | Overall: ${grade.overall_pass ? "pass" : "FAIL"}\n\nIssues:\n- ${grade.issues.join("\n- ")}\n\nReview at /admin/preview/${slug}/edit. Fix the data/prompt or override-publish.`,
          prospect_id,
        )
        .run();
    } catch (e) {
      console.error(`[preview-grader] admin_inbox insert failed: ${e instanceof Error ? e.message : e}`);
    }
    return { error: `Preview held by grader (factual=${grade.factual_pass} voice=${grade.voice_pass} overall=${grade.overall_pass}): ${grade.issues.join("; ")}` };
  }

  // 4b. Passed: persist as draft (existing behavior).
  const slug = await savePreviewDraft(env, persistInput, generated, "draft");
  return { slug };
}

export async function recordPreviewView(env: Env, slug: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE previews
        SET viewed_count = viewed_count + 1,
            first_viewed_at = COALESCE(first_viewed_at, ?),
            last_viewed_at = ?
      WHERE slug = ?`,
  ).bind(now, now, slug).run();
}
