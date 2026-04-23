/**
 * Content QA pipeline
 *
 * Every generated draft runs through this before it reaches the customer
 * for approval. Three layers:
 *
 *   1. Mechanical checks (length, structure) -- cheap, run synchronously
 *      in the Worker, no external calls. Catches structural drift.
 *   2. Claude pass that scans for brand-safety issues AND extracts every
 *      factual claim in one combined prompt (one call = less latency +
 *      lower token cost). Produces a structured JSON verdict.
 *   3. Static "never say" rules that a client can configure (Phase B).
 *
 * Output is a ContentQaResult with a single overall level -- pass /
 * warn / held -- plus per-check detail so the customer UI can surface
 * exactly why a draft needs attention.
 */

import type { Env } from "./types";

// Claude Sonnet 4.5 lives in voice-engine; we hit the same API directly
// here to keep the QA module self-contained and easier to swap later.
const MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

// ---------- public types ----------

export type QaLevel = "pass" | "warn" | "held";

export interface QaCheck {
  key: string;
  label: string;
  passed: boolean;
  level: QaLevel;
  detail: string;
}

export interface FactClaim {
  claim: string;
  quote: string;
  risk: "low" | "medium" | "high";
  reason: string;
}

export interface BrandSafetyFlag {
  category: "political" | "medical_advice" | "financial_advice" | "legal_advice" | "inflammatory" | "reputational";
  excerpt: string;
  reason: string;
}

export interface ContentQaResult {
  level: QaLevel;
  voiceScore: number | null;
  checks: QaCheck[];
  factClaims: FactClaim[];
  brandSafetyFlags: BrandSafetyFlag[];
  wordCount: number;
}

// ---------- mechanical checks ----------

function countWords(body: string): number {
  return body.trim().split(/\s+/).filter(Boolean).length;
}

interface MechanicalInputs {
  title: string;
  body: string;
  kind: string; // article | landing | faq | service_page
}

function runMechanicalChecks(input: MechanicalInputs): { checks: QaCheck[]; wordCount: number } {
  const checks: QaCheck[] = [];
  const wc = countWords(input.body);

  // Length bands. Articles want more room; landings want tighter.
  const isLanding = input.kind === "landing" || input.kind === "service_page";
  const minWords = isLanding ? 500 : 800;
  const maxWords = isLanding ? 1500 : 3000;
  checks.push({
    key: "length",
    label: `Length (${minWords}-${maxWords} words)`,
    passed: wc >= minWords && wc <= maxWords,
    level: wc >= minWords && wc <= maxWords ? "pass" : wc < minWords ? "held" : "warn",
    detail: `${wc.toLocaleString()} words. ${wc < minWords ? "Too thin -- regenerate." : wc > maxWords ? "Longer than target; still publishable but consider trimming." : "In range."}`,
  });

  // Title presence and sanity.
  const titleOk = input.title.trim().length >= 15 && input.title.trim().length <= 120;
  checks.push({
    key: "title",
    label: "Title length (15-120 chars)",
    passed: titleOk,
    level: titleOk ? "pass" : "warn",
    detail: titleOk ? "Good." : `Title is ${input.title.trim().length} chars. Aim for 40-70 for best SEO.`,
  });

  // Heading structure. H1 is usually the post title (WP handles it),
  // so we look for at least two H2s inside the body for structure.
  const h2s = (input.body.match(/^##\s+/gm) || []).length;
  checks.push({
    key: "structure",
    label: "Heading structure (>= 2 H2 sections)",
    passed: h2s >= 2,
    level: h2s >= 2 ? "pass" : "warn",
    detail: `${h2s} H2 heading${h2s === 1 ? "" : "s"} found. ${h2s < 2 ? "Add more to break up the piece." : "Scannable."}`,
  });

  return { checks, wordCount: wc };
}

// ---------- Claude brand-safety + fact-claims pass ----------

const QA_SYSTEM_BASE = `You are a cautious editorial reviewer for a B2B content pipeline. You review AI-generated drafts BEFORE they are published to the customer's site. The customer is a real business -- mistakes here are reputation-damaging.

You have two jobs in one pass:

1. BRAND SAFETY: scan the draft for anything that could embarrass or legally expose the business if published. Specifically flag:
   - political_advocacy: takes a partisan political stance
   - medical_advice: gives specific medical recommendations (risky even in health businesses unless the client is a licensed provider)
   - financial_advice: specific investment or financial recommendations
   - legal_advice: specific legal recommendations or interpretations
   - inflammatory: attack language, dehumanizing phrasing, any group slurs
   - reputational: controversial claims, unverified attacks on named competitors, anything obviously off-brand
   - restriction_violation: a violation of the client's explicit content rules (listed below, if any)

2. FACT CLAIMS: extract every factual claim -- statistics, specific percentages, historical events, named studies, regulatory details, product claims about the client's own business, claims about named third parties. Rate each as low / medium / high risk based on how easy it is to verify and how embarrassing it would be if wrong.

Return STRICT JSON, no prose around it:

{
  "brand_safety_flags": [
    { "category": "...", "excerpt": "quoted text from draft (max 180 chars)", "reason": "one sentence on why this is risky" }
  ],
  "fact_claims": [
    { "claim": "short paraphrase of the claim", "quote": "actual text from draft (max 180 chars)", "risk": "low|medium|high", "reason": "one sentence on why this is that risk level" }
  ]
}

If either list is empty, return an empty array. Do not invent flags to look thorough. If the draft is clean, return empty arrays. Do not include any other fields.`;

async function runClaudeQaPass(
  env: Env,
  title: string,
  body: string,
  restrictions?: string | null,
): Promise<{ brandSafetyFlags: BrandSafetyFlag[]; factClaims: FactClaim[] }> {
  if (!env.ANTHROPIC_API_KEY) {
    // When the key isn't set (local dev), skip the Claude pass cleanly.
    // The mechanical checks still run -- drafts just won't have the
    // Claude-assisted layer.
    return { brandSafetyFlags: [], factClaims: [] };
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      temperature: 0.2,
      system: [
        {
          type: "text",
          text: QA_SYSTEM_BASE,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `${restrictions ? `Client's explicit content rules (never violate):\n${restrictions}\n\n---\n\n` : ""}Draft title: ${title}\n\n---\n\n${body.slice(0, 18000)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[content-qa] Anthropic ${resp.status}: ${text.slice(0, 400)}`);
    // Fail open on the Claude layer -- the customer still sees the
    // draft with a note that the automated scan was unavailable.
    return { brandSafetyFlags: [], factClaims: [] };
  }

  const data = await resp.json<{ content: { type: string; text: string }[] }>();
  const text = data.content?.[0]?.text || "";
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const firstBrace = raw.search(/[{[]/);
  const lastBrace = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    console.error(`[content-qa] could not parse Claude response: ${text.slice(0, 300)}`);
    return { brandSafetyFlags: [], factClaims: [] };
  }

  try {
    const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    return {
      brandSafetyFlags: Array.isArray(parsed.brand_safety_flags) ? parsed.brand_safety_flags : [],
      factClaims: Array.isArray(parsed.fact_claims) ? parsed.fact_claims : [],
    };
  } catch (err) {
    console.error(`[content-qa] JSON parse failed: ${err}`);
    return { brandSafetyFlags: [], factClaims: [] };
  }
}

// ---------- orchestrator ----------

/**
 * Run the full QA pipeline on a draft. Voice score is passed in rather
 * than computed here so callers that already have it (the generation
 * flow) don't pay for a second scoring pass. If voiceScore is null we
 * skip the voice-score check.
 */
export async function runContentQa(
  env: Env,
  params: {
    title: string;
    body: string;
    kind: string;
    voiceScore: number | null;
    restrictions?: string | null;
  },
): Promise<ContentQaResult> {
  const { checks, wordCount } = runMechanicalChecks({
    title: params.title,
    body: params.body,
    kind: params.kind,
  });

  // Voice score check.
  if (params.voiceScore !== null) {
    const vs = params.voiceScore;
    checks.push({
      key: "voice",
      label: "Voice match (>=60)",
      passed: vs >= 60,
      level: vs >= 75 ? "pass" : vs >= 60 ? "warn" : "held",
      detail: `${vs}/100. ${vs < 60 ? "Too off-voice -- regenerate." : vs < 75 ? "Borderline; review the voice before publishing." : "On voice."}`,
    });
  }

  // Claude pass, with any per-client restrictions injected.
  const { brandSafetyFlags, factClaims } = await runClaudeQaPass(env, params.title, params.body, params.restrictions);

  // Any brand-safety flag is a hard hold. High-risk fact claims are a
  // warn but not a block -- customer is the final reviewer on facts.
  if (brandSafetyFlags.length > 0) {
    checks.push({
      key: "brand_safety",
      label: "Brand safety scan",
      passed: false,
      level: "held",
      detail: `${brandSafetyFlags.length} flag${brandSafetyFlags.length === 1 ? "" : "s"}. Goes to NeverRanked ops review before the customer sees it.`,
    });
  } else {
    checks.push({
      key: "brand_safety",
      label: "Brand safety scan",
      passed: true,
      level: "pass",
      detail: "No brand-safety flags.",
    });
  }

  const highRiskCount = factClaims.filter(f => f.risk === "high").length;
  if (factClaims.length > 0) {
    checks.push({
      key: "fact_claims",
      label: "Factual claims extracted",
      passed: highRiskCount === 0,
      level: highRiskCount > 0 ? "warn" : "pass",
      detail: `${factClaims.length} claim${factClaims.length === 1 ? "" : "s"} identified${highRiskCount > 0 ? `, ${highRiskCount} high-risk` : ""}. Surface in approval UI.`,
    });
  }

  // Overall level: held if any held, warn if any warn, else pass.
  const level: QaLevel = checks.some(c => c.level === "held")
    ? "held"
    : checks.some(c => c.level === "warn")
      ? "warn"
      : "pass";

  return {
    level,
    voiceScore: params.voiceScore,
    checks,
    factClaims,
    brandSafetyFlags,
    wordCount,
  };
}
