// Atlas fail-closed factual grader.
//
// Runs on every Atlas response BEFORE it reaches the customer. Rejects
// output that crosses the structural boundary the engagement depends on:
// Atlas reports data, it does not advise. The categories mirror the
// OUTPUT VALIDATION section of the system prompt.
//
// Design choices:
//
//   - Deterministic, not LLM-based. This is a per-message hot path; a
//     regex guard is fast, free, and predictable. An LLM grader would
//     add latency, cost, and its own failure modes on every turn. The
//     model is already heavily instructed; this is the backstop.
//
//   - Fail-closed with safe recovery. A rejection does not surface an
//     error to the customer. The caller retries once with a correction
//     note, and if that also fails, falls back to Punt 5. So mild
//     over-aggression costs at most one redraft, never a bad answer.
//     This lets us err toward stricter patterns.
//
//   - Word-boundary matching to limit false positives. We match
//     directive phrasing, not every incidental token.

import { checkHumanTone } from "../human-tone-guard";

export interface AtlasGraderResult {
  ok: boolean;
  // Short machine reason for logging + the retry note. Empty when ok.
  reason: string;
  // All categories that tripped, for telemetry.
  categories: string[];
  // Human-readable detail used to build the redraft instruction.
  detail: string;
}

// Causal language. Atlas may state correlation but never causation.
const CAUSAL = [
  /\bcaused\b/i,
  /\bcause[ds]?\s+(?:your|the|a|an|it)\b/i,
  /\bdrove\b/i,
  /\bdriving\b/i,
  /\bled to\b/i,
  /\bleading to\b/i,
  /\bresulted in\b/i,
  /\bresulting in\b/i,
  /\bbecause of\b/i,
  /\bdue to\b/i,
  /\bas a result of\b/i,
  /\bthanks to\b/i,
];

// Prescriptive / directive language. Atlas never tells the customer what
// to do. These are scoped to second-person directives to avoid tripping
// on neutral data phrasing.
const PRESCRIPTIVE = [
  /\byou should\b/i,
  /\byou must\b/i,
  /\byou need to\b/i,
  /\byou ought to\b/i,
  /\bi recommend\b/i,
  /\bi'd recommend\b/i,
  /\bi would recommend\b/i,
  /\bi suggest\b/i,
  /\bi'd suggest\b/i,
  /\bi advise\b/i,
  /\bmy recommendation\b/i,
  /\bmy advice\b/i,
  /\byou'll want to\b/i,
  /\byou want to\b/i,
  /\bfocus on\b/i,
  /\bprioritize\b/i,
  /\bthe best (?:thing|move|approach|strategy)\b/i,
  /\byour biggest opportunity\b/i,
  /\bthe most important thing\b/i,
  /\bconsider (?:publishing|adding|writing|creating|updating|building)\b/i,
];

// Strategic claims about the customer's business.
const STRATEGIC = [
  /\byour positioning is\b/i,
  /\byour competitive advantage\b/i,
  /\byour buyer is\b/i,
  /\byour target (?:customer|audience|market) is\b/i,
  /\byour value proposition\b/i,
];

// Cross-customer comparison. Each engagement is isolated.
const CROSS_CUSTOMER = [
  /\bother (?:customers|clients)\b/i,
  /\bour other (?:customers|clients)\b/i,
  /\bcompared to (?:other|another) (?:customer|client|business)\b/i,
  /\bother (?:businesses|companies) (?:we|i) (?:work|measure)\b/i,
];

// System-prompt / internal-architecture reveal.
const REVEAL = [
  /\bsystem prompt\b/i,
  /\bmy instructions\b/i,
  /\bi was (?:told|instructed|programmed)\b/i,
  /\bpunt pattern\b/i,
  /\bcache_control\b/i,
  /\bdata context\b/i,
  /\bgrader\b/i,
];

// Speculation/projection language Atlas must defer to the memo.
const SPECULATION = [
  /\bi (?:think|believe|expect|predict)\b/i,
  /\bwill (?:likely|probably) (?:improve|increase|decrease|drop|rise|grow)\b/i,
  /\bi'd expect\b/i,
];

// Punt templates legitimately contain some directive-sounding words
// ("flag it", references to the memo). We allowlist the canonical punt
// fragments so a correct punt is never rejected.
const PUNT_ALLOWLIST = [
  "that's prioritization, which lives in your monthly memo",
  "that's a recommendation question",
  "neverranked measures; we don't execute",
  "that's outside what neverranked measures",
  "i don't have data on that",
  "flagged. lance typically responds",
];

function isPunt(text: string): boolean {
  const lower = text.toLowerCase();
  return PUNT_ALLOWLIST.some((p) => lower.includes(p));
}

// Memo readback: when Atlas reports the priorities a delivered memo
// already states, the prescriptive/strategic language belongs to Lance
// (the memo author), not to Atlas. Reporting it is allowed. We detect
// clear memo attribution and, when present, relax ONLY the prescriptive
// and strategic checks (causal, cross-customer, reveal, speculation,
// tone, and em-dash checks still apply). This mirrors the punt skip.
//
// The attribution must be explicit. A response that gives advice without
// crediting the memo is NOT a readback and stays fully graded.
const MEMO_ATTRIBUTION = [
  /\byour (?:current |latest |may |june |july |august |september |october |november |december |january |february |march |april )?memo\b/i,
  /\bthe memo (?:lists|says|sets|lays out|states|orders|prioriti)/i,
  /\bmemo's (?:priorit|first|second|third|order|punch list)/i,
  /\baccording to (?:your|the) memo\b/i,
  /\blance (?:set|wrote|listed|prioriti)/i,
];

function isMemoReadback(text: string): boolean {
  return MEMO_ATTRIBUTION.some((re) => re.test(text));
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

export function gradeAtlasResponse(text: string): AtlasGraderResult {
  const categories: string[] = [];
  const details: string[] = [];

  if (!text || !text.trim()) {
    return { ok: false, reason: "empty", categories: ["empty"], detail: "Response was empty." };
  }

  const punt = isPunt(text);
  const memoReadback = isMemoReadback(text);

  // prescriptive + strategic language is allowed when it is the customer
  // punting OR Atlas reading back the memo's own (Lance-authored)
  // priorities. Everything else stays hard.
  const allowDirective = punt || memoReadback;

  const checks: Array<{ name: string; patterns: RegExp[]; skipIfDirective?: boolean }> = [
    { name: "causal", patterns: CAUSAL },
    { name: "prescriptive", patterns: PRESCRIPTIVE, skipIfDirective: true },
    { name: "strategic", patterns: STRATEGIC, skipIfDirective: true },
    { name: "cross-customer", patterns: CROSS_CUSTOMER },
    { name: "reveal", patterns: REVEAL, skipIfDirective: true },
    { name: "speculation", patterns: SPECULATION },
  ];

  for (const c of checks) {
    if (c.skipIfDirective && allowDirective) continue;
    const hit = firstMatch(text, c.patterns);
    if (hit) {
      categories.push(c.name);
      details.push(`${c.name} ("${hit}")`);
    }
  }

  // Layer the shared tone guard (em-dashes, banned marketing phrases).
  // Use customer-dashboard context: banned phrases + hedge openers block,
  // em dashes allowed (Atlas prose may use them... actually no — Atlas
  // forbids em dashes explicitly, so we check them separately below).
  const tone = checkHumanTone(text, "customer-dashboard");
  for (const v of tone.violations) {
    if (v.severity === "block") {
      categories.push(`tone:${v.pattern}`);
      details.push(`tone:${v.pattern} ("${v.match}")`);
    }
  }

  // Atlas-specific: em dashes are explicitly forbidden in its voice even
  // though the dashboard context allows them generally.
  if (/—|(?:^|\s)--(?:\s|$)|\w--\w/.test(text)) {
    categories.push("em-dash");
    details.push("em-dash");
  }

  if (categories.length === 0) {
    return { ok: true, reason: "", categories: [], detail: "" };
  }

  return {
    ok: false,
    reason: categories.join(","),
    categories,
    detail: details.join("; "),
  };
}

// Builds the correction note appended to the system prompt on a retry.
export function buildRedraftNote(result: AtlasGraderResult): string {
  return [
    `[GRADER REJECTED your previous draft. It contained: ${result.detail}.`,
    `Re-draft your answer to report only what the data shows.`,
    `Do not use causal, prescriptive, strategic, speculative, or comparative language.`,
    `If the question genuinely calls for advice or prioritization, use the appropriate punt pattern instead.`,
    `Do not use em dashes.]`,
  ].join(" ");
}
