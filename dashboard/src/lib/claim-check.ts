// Claim checking: verify that the PROSE describes the FROZEN DATA truthfully.
//
// WHY THIS EXISTS, and why it is not the same as the hallucination guard.
//
// `allowedNumbers()` in report-notes.ts checks that every figure the prose
// mentions EXISTS in the measured data. It is load-bearing and it works.
// What it cannot check is whether a real figure is used in a TRUE
// RELATIONSHIP -- and that is the failure mode that actually reached a
// delivered draft.
//
// On 2026-08-03 the generated HTC memo contained three errors. Every number
// in all three was legitimate, so the hallucination guard passed them:
//
//   1. "your overall share held flat at 52%" ... "unchanged from July"
//      Truth: it ROSE from 48% to 52%. That was the month's headline, and
//      the prose erased it. 52 and 48 are both real numbers.
//   2. "Diamond Head Theatre is second at 13.3%, the Blaisdell Center third
//      at 13.7%"  --  the values are correct, the ORDERING is inverted.
//   3. "Copilot stayed at 0%"  --  cohort_citations really was 0, but that
//      means NO venue in the category appeared on that engine, not that the
//      customer is absent. Framing a category-wide absence as customer
//      absence is the exact false reading the chart exclusion prevents.
//
// A human caught all three. Human attention is reliable in month one and
// unreliable in month nine, which is precisely when a two-client business
// becomes a six-client business. This module makes the catch repeatable.
//
// DESIGN RULE -- flag only on an UNAMBIGUOUS parse. This is a net underneath
// Lance's review, not a replacement for it, so a miss is acceptable and a
// false alarm is expensive: a gate that cries wolf gets overridden by habit,
// and then it protects nothing. Every check below bails out silently the
// moment it cannot resolve the claim with confidence.
//
// Issues carry a VERBATIM quote from the body. Same rule as the outreach
// grader, for the same measured reason: on long artifacts roughly half of an
// LLM's self-reported issues were fabricated, so an issue that cannot point
// at real text is worthless. These checks are deterministic, but the quote
// discipline stays -- it is what makes a hold actionable in one glance.

export interface ClaimFacts {
  engines?: Array<{ name?: string; pct?: number; prev?: number; noCohortSignal?: boolean }>;
  venue?: { rows?: Array<{ label?: string; pct?: number }> };
}

export interface ClaimIssue {
  kind: "direction" | "ranking" | "attribution";
  quote: string;   // verbatim from the body
  detail: string;  // what the data actually says
}

/** Split prose into sentences. Markdown-aware enough for memo bodies: list
 *  items and headings are their own units so a claim cannot straddle them. */
function sentences(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    // Split on sentence enders, keeping decimals ("13.7%") intact by
    // requiring whitespace after the period.
    for (const s of t.split(/(?<=[.!?])\s+/)) {
      const c = s.trim();
      if (c) out.push(c);
    }
  }
  return out;
}

/** Percentages appearing in a sentence, in order. Only reads NN% or NN.N%
 *  so bare years and counts cannot be mistaken for measurements. */
function pctsIn(s: string): number[] {
  return [...s.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
}

const RISE = /\b(rose|risen|rising|climbed|grew|grown|increased|improved|gained|up from|higher than)\b/i;
const FALL = /\b(fell|fallen|dropped|slipped|declined|decreased|lost ground|down from|lower than)\b/i;
const FLAT = /\b(flat|unchanged|held steady|holding steady|held at|steady at|no change|stayed at|remained at|did not move|didn'?t move|neither engine moved)\b/i;

/** CHECK 1 -- DIRECTION.
 *  A sentence that names a direction AND cites two percentages which match a
 *  known (pct, prev) pair must agree with the sign of that pair.
 *
 *  Catches: "held flat at 52%" when prev was 48. */
export function checkDirection(body: string, facts: ClaimFacts): ClaimIssue[] {
  const pairs: Array<{ name: string; cur: number; prev: number }> = [];
  for (const e of facts.engines || []) {
    if (typeof e?.pct === "number" && typeof e?.prev === "number" && e.pct !== e.prev) {
      pairs.push({ name: String(e.name || "engine"), cur: e.pct, prev: e.prev });
    }
  }
  if (!pairs.length) return [];

  const issues: ClaimIssue[] = [];
  for (const s of sentences(body)) {
    const said = FLAT.test(s) ? "flat" : RISE.test(s) ? "rise" : FALL.test(s) ? "fall" : null;
    if (!said) continue;
    const nums = pctsIn(s);
    if (nums.length < 1) continue;

    // Resolve which pair this sentence is about. Prefer a pair whose BOTH
    // values appear; fall back to a unique single-value match. Anything
    // ambiguous is skipped rather than guessed.
    let hit = pairs.filter((p) => nums.includes(p.cur) && nums.includes(p.prev));
    if (hit.length !== 1) {
      const single = pairs.filter((p) => nums.includes(p.cur));
      // Only trust a single-value match when it is unique AND the sentence
      // claims flatness -- "flat at 52%" is self-contained, whereas a rise
      // or fall citing one number may legitimately refer to a figure we did
      // not pair (a venue share, a source type).
      if (said === "flat" && single.length === 1) hit = single;
      else continue;
    }

    const p = hit[0];
    const actual = p.cur > p.prev ? "rise" : "fall";
    if (said !== actual) {
      issues.push({
        kind: "direction",
        quote: s,
        detail: `${p.name} went ${p.prev}% to ${p.cur}% (a ${actual}), but the sentence says "${said}"`,
      });
    }
  }
  return issues;
}

const ORDINAL = /\b(first|second|third|fourth|fifth)\b/i;

/** CHECK 2 -- RANKING.
 *  When a sentence assigns ordinals to named rows with percentages, the
 *  stated order must be descending by value.
 *
 *  Catches: "Diamond Head is second at 13.3%, Blaisdell third at 13.7%". */
export function checkRanking(body: string, facts: ClaimFacts): ClaimIssue[] {
  const issues: ClaimIssue[] = [];
  const ORD_RANK: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };

  for (const s of sentences(body)) {
    if (!ORDINAL.test(s)) continue;
    // Pull every "<ordinal> ... NN%" occurrence, in order of appearance.
    const marks: Array<{ rank: number; pct: number }> = [];
    for (const m of s.matchAll(/\b(first|second|third|fourth|fifth)\b[^.%]{0,60}?(\d+(?:\.\d+)?)\s*%/gi)) {
      marks.push({ rank: ORD_RANK[m[1].toLowerCase()], pct: Number(m[2]) });
    }
    if (marks.length < 2) continue;

    // Ranks must be distinct for the claim to be checkable.
    const ranks = marks.map((m) => m.rank);
    if (new Set(ranks).size !== ranks.length) continue;

    const byRank = [...marks].sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < byRank.length; i++) {
      if (byRank[i].pct > byRank[i - 1].pct) {
        issues.push({
          kind: "ranking",
          quote: s,
          detail: `rank ${byRank[i].rank} is given ${byRank[i].pct}% but rank ${byRank[i - 1].rank} is given ${byRank[i - 1].pct}%; a lower rank cannot hold a higher share`,
        });
        break;
      }
    }
  }
  return issues;
}

// Language that pins a result on the customer. "your", "you", and absence
// verbs are the tells. Deliberately narrow: this must not fire on a neutral
// sentence that merely names the engine.
const ATTRIBUTION = /\b(you|your|absent|missing|dropped off|lost|failed to|did not appear|didn'?t appear|no longer)\b/i;

// Prose calls engines by their short name ("Copilot") while the frozen facts
// store the full label ("Microsoft Copilot"). Matching only the full string
// made this check silently match NOTHING -- caught by the regression suite on
// 2026-08-03, and worth remembering: a guard that cannot find its subject is
// worse than no guard, because it reports clean.
//
// Generic descriptors are dropped so a token like "search" or "grounded"
// cannot drag in an unrelated sentence.
const NAME_STOP = new Set(["ai", "the", "search", "grounded", "overview", "engine", "model"]);
function engineAliases(name: string): string[] {
  const out = [name];
  for (const tok of name.split(/\s+/)) {
    const t = tok.replace(/[^A-Za-z0-9]/g, "");
    if (t.length >= 4 && !NAME_STOP.has(t.toLowerCase())) out.push(t);
  }
  return out;
}
function mentionsEngine(sentence: string, name: string): boolean {
  return engineAliases(name).some((a) =>
    new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sentence),
  );
}

/** CHECK 3 -- ZERO ATTRIBUTION.
 *  An engine flagged noCohortSignal returned citations but named NO venue in
 *  the category, customer or competitor. Describing that as the customer
 *  being absent, or scoring it as a plain zero next to real scores, is false
 *  in both directions and is the reading the chart exclusion exists to stop.
 *
 *  Catches: "Copilot stayed at 0%". */
export function checkZeroAttribution(body: string, facts: ClaimFacts): ClaimIssue[] {
  const dark = (facts.engines || []).filter((e) => e?.noCohortSignal && e?.name);
  if (!dark.length) return [];

  const issues: ClaimIssue[] = [];
  for (const s of sentences(body)) {
    for (const e of dark) {
      const name = String(e.name);
      if (!mentionsEngine(s, name)) continue;
      // Flag when the sentence either pins it on the customer OR scores it
      // as a bare zero. A sentence that already explains the category-wide
      // absence will contain "category", "venue", or "competitor" and is
      // left alone.
      const explained = /\b(category|cohort|venue|competitor|no business|not one)\b/i.test(s);
      if (explained) continue;
      const scored = /\b0\s*%/.test(s) || /\bzero\b/i.test(s);
      if (scored || ATTRIBUTION.test(s)) {
        issues.push({
          kind: "attribution",
          quote: s,
          detail: `${name} returned citations but named no venue in the category at all, customer or competitor. It is excluded from the chart, so it must not be reported as a zero or as the customer being absent`,
        });
      }
      break; // one issue per sentence is enough to act on
    }
  }
  return issues;
}

/** Run every claim check. Returns [] when facts are absent or unusable, so a
 *  memo without frozen facts vets exactly as it did before this existed. */
export function checkClaims(body: string, factsJson: string | null | undefined): ClaimIssue[] {
  if (!body || !factsJson) return [];
  let facts: ClaimFacts;
  try { facts = JSON.parse(factsJson) as ClaimFacts; } catch { return []; }
  if (!facts || typeof facts !== "object") return [];
  return [
    ...checkDirection(body, facts),
    ...checkRanking(body, facts),
    ...checkZeroAttribution(body, facts),
  ];
}

/** One-line summaries for the delivery-blocked page. */
export function formatClaimIssues(issues: ClaimIssue[]): string[] {
  return issues.map((i) => `${i.detail} — "${i.quote.length > 120 ? i.quote.slice(0, 117) + "..." : i.quote}"`);
}
