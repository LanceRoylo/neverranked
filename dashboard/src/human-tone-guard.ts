/**
 * Human-tone guard. Pattern-matches AI-generated text against the
 * Hello Momentum canonical banned-pattern list before it lands in the
 * customer's hands or gets published on their behalf.
 *
 * Source of truth: the user's global CLAUDE.md ("Non-Negotiable Standards
 * from HM") and QUALITY_BENCHMARKS.md ("The AI Trap" anti-pattern).
 *
 * Three audiences (contexts), each with its own strictness:
 *   customer-publication  -- anything published externally on behalf of the
 *                            client (blog post, landing page, social caption)
 *   customer-email        -- emails sent to the client's audience
 *   customer-dashboard    -- text the client sees in our dashboard (briefs,
 *                            roadmap descriptions, narrative summaries)
 *   internal              -- admin-facing copy. Loosest checks; we don't
 *                            need to gate our own logs.
 *
 * Failure model: caller calls assertHumanTone() with the text + context.
 * On violation it returns {ok: false, violations[], inboxId} and writes
 * an admin_inbox row of kind='content_tone_fail' with urgency='high'.
 * Caller decides whether to regenerate, fall back to a template, or hard-
 * fail. We never silently let bad text through.
 */

import type { Env } from "./types";
import { addInboxItem } from "./admin-inbox";

export type ToneContext =
  | "customer-publication"
  | "customer-email"
  | "customer-dashboard"
  | "internal";

export interface ToneViolation {
  pattern: string;       // short slug, e.g. 'em-dash', 'banned-phrase'
  match: string;         // the offending substring (capped to 80 chars for display)
  rule: string;          // human-readable explanation
  severity: "block" | "warn"; // 'block' = fail the check; 'warn' = surface but allow
}

export interface ToneCheckResult {
  ok: boolean;
  violations: ToneViolation[];
}

// ---------- The canonical banned list ----------

// Banned phrases (case-insensitive, whole-word/phrase). These are the
// dead giveaways. Anything matching here is a hard block in customer-
// publication / customer-email / customer-dashboard contexts.
const BANNED_PHRASES = [
  "hidden gem",
  "rare opportunity",
  "nestled in",
  "elevate your business",
  "elevate your brand",
  "feel free to",
  "i'd be happy to",
  "i would be happy to",
  "delve into",
  "in today's fast-paced",
  "in today's digital age",
  "in the digital age",
  "in a world where",
  "it's important to note",
  "it's worth noting",
  "it is important to note",
  "navigate the complexities",
  "navigate the world of",
  "comprehensive solution",
  "robust solution",
  "cutting-edge",
  "seamlessly",
  "seamless integration",
  "leverage our",
  "unlock the power",
  "unleash the power",
  "game-changer",
  "game changer",
  "needle-mover",
  "moving the needle",
  "in conclusion",
  "to summarize",
  "without further ado",
  "the importance of",
  "the world of",
];

// Hedge openers: paragraphs that begin with these are AI tells.
// Matched at the start of any line (after optional whitespace).
const HEDGE_OPENERS = [
  "welcome to",
  "in today's",
  "in a world where",
  "furthermore,",
  "moreover,",
  "in conclusion,",
  "additionally,",
  "to summarize,",
  "in summary,",
];

// "Welcome to" is so prevalent in AI marketing copy that we ban it as a
// substring too, not just an opener.
const ANYWHERE_PHRASES = [
  "welcome to",
];

interface ContextRules {
  blockEmDash: boolean;
  blockSemicolonInProse: boolean;
  blockBannedPhrases: boolean;
  blockHedgeOpeners: boolean;
  blockThreeAdjectiveLists: boolean;
}

const CONTEXT_RULES: Record<ToneContext, ContextRules> = {
  "customer-publication": {
    blockEmDash: true,
    blockSemicolonInProse: true,
    blockBannedPhrases: true,
    blockHedgeOpeners: true,
    blockThreeAdjectiveLists: true,
  },
  "customer-email": {
    blockEmDash: true,
    blockSemicolonInProse: true,
    blockBannedPhrases: true,
    blockHedgeOpeners: true,
    blockThreeAdjectiveLists: true,
  },
  "customer-dashboard": {
    // Dashboard text the customer reads (briefs, roadmap descriptions,
    // narratives). Slightly looser on em dashes since dashboard prose
    // sometimes uses them for clarity, but banned phrases are still hard
    // blocks.
    blockEmDash: false,
    blockSemicolonInProse: false,
    blockBannedPhrases: true,
    blockHedgeOpeners: true,
    blockThreeAdjectiveLists: false,
  },
  "internal": {
    // Admin-only copy. We trust ourselves. No checks.
    blockEmDash: false,
    blockSemicolonInProse: false,
    blockBannedPhrases: false,
    blockHedgeOpeners: false,
    blockThreeAdjectiveLists: false,
  },
};

// ---------- The check ----------

function trim(s: string, max = 80): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function checkHumanTone(text: string, context: ToneContext): ToneCheckResult {
  const rules = CONTEXT_RULES[context];
  const violations: ToneViolation[] = [];
  if (!text || !text.trim()) return { ok: true, violations };

  // Em dashes: U+2014 plus the ASCII double-hyphen surrogate. We allow
  // single hyphens always; double-hyphen sequences inside words are ok
  // (e.g. "self-aware" is fine). The pattern matches " -- " or "--" with
  // word characters on both sides.
  if (rules.blockEmDash) {
    const emDashRe = /—|(?:^|\s)--(?:\s|$)|\w--\w/g;
    let m;
    while ((m = emDashRe.exec(text)) !== null) {
      violations.push({
        pattern: "em-dash",
        match: trim(text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20)),
        rule: "Em dashes are an AI tell. Use commas, periods, or parentheticals instead.",
        severity: "block",
      });
      if (violations.length > 8) break;
    }
  }

  // Semicolons in prose: hard block in marketing contexts. We don't care
  // about semicolons inside code-like blocks but the dashboard rarely
  // mixes those, so a flat ban is fine.
  if (rules.blockSemicolonInProse) {
    const semiRe = /;/g;
    let m;
    while ((m = semiRe.exec(text)) !== null) {
      violations.push({
        pattern: "semicolon",
        match: trim(text.slice(Math.max(0, m.index - 30), m.index + 30)),
        rule: "Semicolons in marketing copy read as AI. Use periods.",
        severity: "block",
      });
      if (violations.length > 8) break;
    }
  }

  // Banned phrases: case-insensitive substring match.
  if (rules.blockBannedPhrases) {
    const lower = text.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      let from = 0;
      let idx;
      while ((idx = lower.indexOf(phrase, from)) !== -1) {
        violations.push({
          pattern: "banned-phrase",
          match: trim(text.slice(idx, idx + phrase.length + 30)),
          rule: `"${phrase}" is on the Hello Momentum banned-phrase list.`,
          severity: "block",
        });
        from = idx + phrase.length;
        if (violations.length > 12) break;
      }
      if (violations.length > 12) break;
    }
    // Anywhere phrases (subset of banned but worth flagging twice if we
    // ever split severities). Skip if already caught above.
    for (const phrase of ANYWHERE_PHRASES) {
      if (!BANNED_PHRASES.includes(phrase) && lower.includes(phrase)) {
        violations.push({
          pattern: "anywhere-phrase",
          match: phrase,
          rule: `"${phrase}" is too generic for marketing copy.`,
          severity: "block",
        });
      }
    }
  }

  // Hedge openers: line starts with a known weak opener.
  if (rules.blockHedgeOpeners) {
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const lower = line.toLowerCase();
      for (const opener of HEDGE_OPENERS) {
        if (lower.startsWith(opener)) {
          violations.push({
            pattern: "hedge-opener",
            match: trim(line),
            rule: `Lines starting with "${opener}" signal AI hedging.`,
            severity: "block",
          });
          break;
        }
      }
      if (violations.length > 12) break;
    }
  }

  // Three-adjective lists: "X, Y, and Z" where the words look like
  // adjectives. We approximate with a lightweight regex; over-broad is
  // fine because the human reviewer will see the match and can override
  // by tweaking copy (often the right move anyway).
  if (rules.blockThreeAdjectiveLists) {
    const adj = /\b(\w+ly)?\s*(\w+),\s+(\w+),\s+and\s+(\w+)\b/gi;
    let m;
    while ((m = adj.exec(text)) !== null) {
      // Heuristic: skip if any term is a common non-adjective (numbers,
      // pronouns, articles). Better to under-fire than over-fire.
      const terms = [m[2], m[3], m[4]].map(t => t.toLowerCase());
      const skip = terms.some(t => /^\d+$/.test(t) || ["the","a","an","you","we","they","it","i"].includes(t));
      if (skip) continue;
      violations.push({
        pattern: "three-adjective-list",
        match: trim(m[0]),
        rule: "Three-adjective lists ('comprehensive, robust, scalable') are AI rhythm. Pick one strong word.",
        severity: "warn",
      });
      if (violations.length > 12) break;
    }
  }

  const blocking = violations.some(v => v.severity === "block");
  return { ok: !blocking, violations };
}

// ---------- The assert wrapper (writes to inbox on failure) ----------

export interface AssertParams {
  source: string;        // e.g. "voice-engine.generateDraftInVoice"
  client_slug?: string;
  target_type?: string;  // e.g. "content_draft", "reddit_brief"
  target_id?: number;
}

export interface AssertResult {
  ok: boolean;
  text: string;
  violations: ToneViolation[];
  inboxId?: number;
}

/**
 * Wrap any AI generation site. Returns ok=true when text is clean. On
 * failure, writes an admin_inbox row (high urgency) so Lance can review,
 * regenerate, or replace -- and returns ok=false so the caller knows
 * not to ship the text as-is. Caller decides retry/fallback policy.
 *
 * The 'internal' context always passes through clean (we trust ourselves).
 */
export async function assertHumanTone(
  env: Env,
  text: string,
  context: ToneContext,
  meta: AssertParams,
): Promise<AssertResult> {
  const result = checkHumanTone(text, context);
  if (result.ok) return { ok: true, text, violations: [] };

  // Write to inbox -- producer-idempotent via UNIQUE(kind, target_type,
  // target_id), so a regenerate-and-re-fail updates the same row instead
  // of creating duplicates.
  const violationsBlock = result.violations
    .map(v => `  - [${v.severity.toUpperCase()}] ${v.pattern}: ${v.rule}\n    "${v.match}"`)
    .join("\n");

  const body = `**Source:** \`${meta.source}\`
**Context:** \`${context}\`
${meta.client_slug ? `**Client:** \`${meta.client_slug}\`` : ""}

**Violations (${result.violations.length}):**

${violationsBlock}

**Generated text:**

${text}

---

The text above failed the human-tone guard and was NOT shipped. To resolve:
- Regenerate the source content with the violations as feedback
- Edit the source manually and re-run
- Or approve as-is to ship anyway (overrides the guard for this item)`;

  const inboxId = await addInboxItem(env, {
    kind: "content_tone_fail",
    title: `Tone-guard failure: ${meta.source}${meta.client_slug ? ` (${meta.client_slug})` : ""}`,
    body,
    target_type: meta.target_type ?? "ai-text",
    target_id: meta.target_id ?? 0,
    target_slug: meta.client_slug,
    urgency: "high",
  });

  return { ok: false, text, violations: result.violations, inboxId };
}
