/**
 * Follow-up template registry.
 *
 * Each entry maps a SignalTier to a prompt template that Claude
 * fills in for the specific prospect. The voice rules are embedded
 * so every draft passes basic HM voice standards (no em dashes,
 * no semicolons in marketing copy, no AI-tell phrases, no formulaic
 * openers).
 *
 * Templates are intentionally LIGHT on prescription so the model
 * has room to vary phrasing prospect to prospect. The system prompt
 * carries the rules. The user prompt carries the prospect's signal
 * data + any cross-referenced NR data we have.
 */

import type { Env } from "../types";
import type { SignalTier, ProspectWarmth } from "./warmth";

const VOICE_SYSTEM = `You write short, direct cold-email follow-ups in Lance's voice for NeverRanked (an AI-citation tracking and content-shipping service).

Hard voice rules. Violating any of these makes the draft unusable.

1. No em dashes anywhere.
2. No semicolons in marketing prose.
3. No AI-tell phrases: "delve", "leverage", "robust", "comprehensive", "seamless", "in today's fast-paced", "feel free to", "elevate", "world-class", "cutting-edge".
4. No formulaic openers: "I hope this finds you well", "Just checking in", "Following up on my previous email", "Wanted to circle back".
5. No three-adjective lists.
6. Short sentences. Two to four sentences per paragraph max.
7. Direct. Lance writes like a Hawaiian operator running a real company. Plain, specific, no fluff.

CRITICAL CREEPY-AVOIDANCE RULES:
8. NEVER reference open counts, re-engagement patterns, IP addresses, multiple opens, or any tracking signal in the body or subject. This is the most important rule. Tracking signals informed which tier you picked; they NEVER appear in the email. The prospect should not feel watched.
9. NEVER say "You've opened this N times" or "I saw you came back" or "You've been thinking about this" or any variant that betrays observation. If you mention "interest" or "skepticism," it has to be inferred from a content reason (what NR offers vs what their business needs), not from behavior data.
10. NEVER ask the prospect to hop on a call, schedule a meeting, do a 15-min chat, or any phone-time ask. Lance's actual workflow does not include sales calls.

PRIMARY CALL-TO-ACTION SHAPE:
The follow-up always points the prospect at a personalized **Preview** -- a private URL Lance built for them at neverranked.com/preview/<their-slug> that shows their specific data. Phrasing examples:
  - "I built you a Preview at neverranked.com/preview/<slug>"
  - "Pulled together a Preview for you"
  - "Made a Preview that walks through what we found"
The Preview replaces "let's hop on a call." Never propose a call. The Preview IS the call to action.

Structure each follow-up as:

  1. ONE-line opener that references something specific about THEIR business or category (NOT about their behavior toward this email)
  2. ONE paragraph naming what's in the Preview, with a concrete finding or number if you have one
  3. ONE-line CTA -- pointing to the Preview URL using the phrasing above
  4. Sign-off "Lance" on its own line

If we don't have a Preview URL yet, use the placeholder neverranked.com/preview/{slug} so Lance can replace with the actual URL after the page is built.

Return STRICT JSON only:
{
  "subject": "<email subject line, 30-80 chars, NEVER references engagement signals>",
  "body": "<email body, 80-180 words>"
}`;

interface DraftInput {
  warmth: ProspectWarmth;
  prospect_email?: string | null;
  prospect_name?: string | null;
  company_name?: string | null;
  prospect_domain?: string | null;
  // Cross-referenced data we may have on them
  audit_findings?: string | null;
  citation_data?: string | null;
}

// Internal tier framing for Claude. NONE of this language should
// surface in the body. The tier sets the TONE of the email, not the
// SUBJECT.
const TIER_FRAMING: Record<SignalTier, string> = {
  cold: "First-touch tone. Brief, content-focused, no assumption of prior engagement.",
  warm: "Soft tone. Helpful, not pushy. Lead with what Lance built for them in the Preview rather than asking anything of them.",
  very_warm: "Direct tone. The Preview is ready and Lance is making sure they see it. No reference to behavior. Just: 'here's what I pulled together for you.'",
  hot: "Confident tone. Lance has done the work and the Preview is sitting there waiting. The email is short and points them at the Preview. Maybe references a specific finding from the Preview to give them a reason to click.",
  fading: "Gentle re-touch tone. No pressure language. Acknowledge that the right moment might not be now. Offer the Preview URL with a note like 'this stays here whenever you're ready.'",
};

export async function generateFollowupDraft(
  env: Env,
  input: DraftInput,
): Promise<{ subject: string; body: string } | null> {
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }

  const { warmth } = input;
  // We intentionally do NOT pass open counts, IP diversity, or
  // re-engagement timing into the prompt. The tier framing carries
  // the tone signal; the body is content-driven, not behavior-
  // driven. Sending the raw engagement numbers to Claude tempts it
  // to surface them, which is the creepy outcome we're avoiding.
  const slugForUrl = input.prospect_domain
    ? input.prospect_domain.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "")
    : `prospect-${warmth.prospect_id}`;

  const userMessage = `Tier tone: ${TIER_FRAMING[warmth.tier]}

${input.prospect_name ? `Name: ${input.prospect_name}` : ""}
${input.company_name ? `Company: ${input.company_name}` : ""}
${input.prospect_domain ? `Domain: ${input.prospect_domain}` : ""}
${input.audit_findings ? `\nWhat's in the Preview (use these as the substance of the email):\n${input.audit_findings}` : ""}
${input.citation_data ? `\nCitation data the Preview shows:\n${input.citation_data}` : ""}

Preview URL to use: neverranked.com/preview/${slugForUrl}

Write the follow-up. Return JSON only.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      system: [{ type: "text", text: VOICE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 1500,
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) {
    console.error(`generateFollowupDraft: ${resp.status} ${await resp.text()}`);
    return null;
  }

  const json = (await resp.json()) as { content: { type: string; text: string }[] };
  const raw = json.content?.[0]?.text || "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as { subject?: string; body?: string };
    if (!parsed.subject || !parsed.body) return null;
    return { subject: String(parsed.subject).trim(), body: String(parsed.body).trim() };
  } catch {
    return null;
  }
}

/**
 * Map a SignalTier to the template_kind string we store. Right now
 * they're 1:1 but separating them lets us add multiple templates
 * per tier in v2 (e.g. warm_first vs warm_second after re-engagement).
 */
export function templateKindForTier(tier: SignalTier): string {
  return tier;
}
