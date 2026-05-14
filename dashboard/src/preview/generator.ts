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
  // Rich intel Lance provides via the build form. These flow into
  // the Sonnet prompt verbatim so the output is personalized like
  // the existing hand-crafted /pitch/<slug>/ pages.
  audit_findings?: string;            // headline finding to lead with
  what_we_would_do?: string;          // concrete plan
  extra_context?: string;             // background on the relationship
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

STRUCTURE (return as inner-HTML, no <html>/<head>/<body> wrappers):

Lance gives you concrete inputs: recipient_name, company_name, domain, headline_finding, what_we_would_do, and optional extra_context. USE THESE LITERALLY. Do not generalize. Do not paraphrase the finding into something softer. The personalization is the whole point.

1. <section class="hero">
   - <h1> that names the company directly and states the headline_finding as a strong claim. Example: "<h1>ASB is named in zero percent of AI engine citations across the Hawaii community banking query set.</h1>"
   - One or two sentences below the h1 expanding the implication for THIS company specifically.

2. <section class="proof">
   - The Hawaii Theatre proof point. Use these exact numbers: 'Forty-five out of one hundred to ninety-five in ten days. Same week, first weekly citation log run, Perplexity named them on 14 of 19 tracked queries.' Pair with one sentence connecting the case study to the recipient's category if relevant.

3. <section class="what-happens">
   - Use what_we_would_do as the substance. Break it into 2-3 concrete bullet items inside a <ul> if the input has multiple actions. Each bullet starts with a verb. Be specific about the schema types, the cadence, the deliverable shape.

4. <section class="next">
   - One-line CTA inviting them to reply. Examples below. Vary the wording slightly per Preview so each feels written, not templated:
   - 'If this is the shape of work you want, reply with a yes and we kick off in five business days.'
   - 'Read once, decide if it fits. Reply when you are ready.'
   - 'No call needed. Reply and we set up the deployment.'

NEVER include a meeting/call/chat ask anywhere on the page.

If extra_context is provided, weave one reference to it naturally into the hero or what-happens section so the recipient knows you remembered the conversation.

OUTPUT FORMAT (strict JSON):
{
  "meta_title": "<page title, 30-70 chars, includes their company name if we have it>",
  "meta_description": "<one-line summary, 80-160 chars>",
  "body_html": "<inner HTML with the four sections above, no DOCTYPE or wrappers>"
}`;

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

  const userMessage = `Recipient:
${input.recipient_name ? `Name: ${input.recipient_name}` : ""}
${input.company_name ? `Company: ${input.company_name}` : ""}
${input.domain ? `Domain: ${input.domain}` : ""}

${input.audit_findings ? `HEADLINE FINDING (lead with this verbatim in the hero):
${input.audit_findings}` : ""}

${input.what_we_would_do ? `WHAT WE WOULD DO (use as the substance of the what-happens section):
${input.what_we_would_do}` : ""}

${input.extra_context ? `EXTRA CONTEXT (weave one reference into the hero or what-happens):
${input.extra_context}` : ""}

${(!input.audit_findings && !input.what_we_would_do) ? "No specific intel provided. Write a category-neutral brief, but flag this in the meta_description so Lance knows to add specifics in the editor." : ""}

Write the brief. Use the company name and domain throughout where natural. Return JSON only.`;

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
): Promise<string> {
  await env.DB.prepare(
    `INSERT INTO previews
       (slug, prospect_id, client_slug, recipient_name, company_name, domain,
        body_html, meta_title, meta_description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', unixepoch(), unixepoch())`,
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
 * Log a view. Bumps viewed_count, sets first/last_viewed_at.
 */
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
