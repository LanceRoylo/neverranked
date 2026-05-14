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

Structure each follow-up as:

  1. ONE-line opener that references something specific (their re-engagement, a specific gap, or a question they probably have)
  2. ONE paragraph naming what we'd do for them, with a concrete number or specific finding if available
  3. ONE-line ask -- a low-friction next step (15-min call, a quick audit, a specific question)
  4. Sign-off "Lance" on its own line

Return STRICT JSON only:
{
  "subject": "<email subject line, 30-80 chars>",
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

const TIER_FRAMING: Record<SignalTier, string> = {
  cold: "First-touch follow-up. The prospect has barely engaged.",
  warm: "Soft follow-up. The prospect has opened the email a few times over several days, suggesting interest without urgency. Tone: helpful, not pushy.",
  very_warm: "Fast follow-up. The prospect opened the email 2-3 times within 24 hours, suggesting active consideration. Tone: 'I noticed you came back, what's the question I didn't answer?' Make it easy for them to reply.",
  hot: "High-engagement follow-up. The prospect has opened the email 4+ times. They're actively evaluating. Tone: meet them where they are. Reference the level of engagement specifically. Offer a specific next step that matches the level of interest -- a short call, a tailored audit, a custom finding.",
  fading: "Re-engagement nudge. The prospect engaged multiple times then went quiet. Tone: gentle, no pressure. Acknowledge that timing might be off and offer one specific reason to come back.",
};

export async function generateFollowupDraft(
  env: Env,
  input: DraftInput,
): Promise<{ subject: string; body: string } | null> {
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }

  const { warmth } = input;
  const recencyLabel =
    warmth.hours_since_last < 24 ? `${Math.max(1, Math.round(warmth.hours_since_last))} hours ago`
      : warmth.hours_since_last < 48 ? "yesterday"
      : `${Math.round(warmth.hours_since_last / 24)} days ago`;
  const fastReopenLabel = warmth.hours_between_first_two !== null && warmth.hours_between_first_two < 24
    ? `Second open was ${Math.max(1, Math.round(warmth.hours_between_first_two))} hours after the first.`
    : "";
  const forwardingLabel = warmth.ip_diversity >= 2
    ? `The opens came from ${warmth.ip_diversity} different IPs, which sometimes means they forwarded the email to a colleague or read it on multiple devices.`
    : "";

  const userMessage = `Tier framing: ${TIER_FRAMING[warmth.tier]}

Prospect engagement signal:
- Total opens: ${warmth.open_count}
- Last open: ${recencyLabel}
- Tier: ${warmth.tier}
${fastReopenLabel}
${forwardingLabel}

${input.prospect_name ? `Name: ${input.prospect_name}` : ""}
${input.company_name ? `Company: ${input.company_name}` : ""}
${input.prospect_domain ? `Domain: ${input.prospect_domain}` : ""}
${input.audit_findings ? `\nCross-referenced findings:\n${input.audit_findings}` : ""}
${input.citation_data ? `\nCitation data:\n${input.citation_data}` : ""}

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
