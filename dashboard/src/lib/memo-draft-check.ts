/**
 * memo-draft-check.ts: what a draft must not say, checked by code.
 *
 * Built 2026-11-05 after both October drafts needed rewriting by hand. The
 * number guard passed them, because every figure was real somewhere. These
 * checks catch the shapes that got through:
 *
 *   - An overall month-over-month figure the comparison never stated ("8%,
 *     down from 10%": the 10 came from last month's memo).
 *   - Words only we use (stable core, surfaces, cohort), in a report read by
 *     people new to all of this.
 *   - A count that disagrees with its own list (22 questions under a heading
 *     that said 18) or with the comparison ("seven questions" for 18).
 *
 * Same design rule as claim-check.ts: flag only on an unambiguous parse. A
 * false alarm gets overridden by habit, and then the gate protects nothing.
 * Each issue quotes the text it found.
 */

import type { MemoInputs } from "./memo-inputs";

/** The section readouts show above the charts. The writer is told this exact
 *  heading, and the renderer lifts it out by this exact heading. */
export const SHORT_VERSION_HEADING = "This month in plain words";

/** Our words, with what to say instead. Terms with an everyday meaning only
 *  match in the sense we use them. */
export const PLAIN_WORD_RULES: Array<{ re: RegExp; say: string }> = [
  { re: /\bstable core\b/i, say: "the questions we asked on every day of both months" },
  { re: /\bcitation (?:share|layer|rate)\b/i, say: "how often your site was among the sources" },
  { re: /\bmodel[ _]knowledge\b/i, say: "tools that answer from what they already learned" },
  { re: /\b(?:the|this|that|each|every|these|those|all|both|one|two|three|four|five|six|seven|other|search|web|\d+)\s+surfaces?\b(?!\s+(?:the|a|an|your|in|on)\b)/i, say: "AI tools" },
  { re: /\bcohort\b/i, say: "the hotels or venues we track" },
  { re: /\binstrument (?:change|event)s?\b/i, say: "a change on our side" },
  { re: /\b(?:the|our) instrument\b/i, say: "our measurement" },
  { re: /\bsnapshots?\b/i, say: "this month's reading" },
  { re: /\bnoise (?:floor|band)\b/i, say: "the range this moves on its own" },
  { re: /\bdelta\b/i, say: "change" },
  { re: /\b\d+(?:\.\d+)?\s*pp\b/i, say: "points" },
  { re: /\bGemini grounded\b/i, say: "Gemini" },
  { re: /\bAEO\b/, say: "showing up in AI answers" },
];

const quote = (s: string) => `"${s.trim().replace(/\s+/g, " ").slice(0, 80)}"`;

export function checkPlainWords(body: string): string[] {
  const issues: string[] = [];
  for (const { re, say } of PLAIN_WORD_RULES) {
    const m = body.match(re);
    if (m) issues.push(`Our word, not the reader's: ${quote(m[0])}. Say: ${say}.`);
  }
  return issues;
}

/** This month in plain words is what gets read and forwarded, so it has to exist. */
export function checkShortVersion(body: string): string[] {
  return new RegExp(`^###\\s+${SHORT_VERSION_HEADING}\\s*$`, "m").test(body)
    ? []
    : [`No "### ${SHORT_VERSION_HEADING}" section, so page 1 has no summary.`];
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const COUNT = `(\\d+|${NUMBER_WORDS.join("|")})`;
const toNumber = (s: string) => (/^\d/.test(s) ? Number(s) : NUMBER_WORDS.indexOf(s.toLowerCase()));

/** A heading that counts questions must sit over that many list items. */
export function checkHeadingCounts(body: string): string[] {
  const issues: string[] = [];
  const lines = body.split(/\r?\n/);
  lines.forEach((line, i) => {
    const h = line.match(new RegExp(`^#{2,4}\\s.*\\b${COUNT}\\s+questions?\\b`, "i"));
    if (!h) return;
    let items = 0;
    for (let j = i + 1; j < lines.length && !/^#{1,4}\s/.test(lines[j]); j++) {
      if (/^\s*(?:[-*]|\d+\.)\s/.test(lines[j])) items++;
    }
    // No list under the heading: prose follows, and there is nothing to count.
    if (items > 0 && items !== toNumber(h[1])) {
      issues.push(`${quote(line)} sits over ${items} list items.`);
    }
  });
  return issues;
}

/** The comparison says how many questions it covers. Prose must agree. */
export function checkComparedQuestionCount(body: string, inp: Pick<MemoInputs, "comparison">): string[] {
  if (!inp.comparison) return [];
  const want = inp.comparison.questions;
  const issues: string[] = [];
  const re = new RegExp(`\\b${COUNT}\\s+questions\\s+(?:we\\s+)?(?:measured|asked)\\s+(?:on\\s+)?(?:every|each)\\s+day\\b`, "gi");
  for (const m of body.matchAll(re)) {
    if (toNumber(m[1]) !== want) issues.push(`${quote(m[0])}, but the comparison covers ${want} questions.`);
  }
  return issues;
}

/** With a comparison in hand, a stated rise or fall must be one it states, or
 *  one on a single question. Anything else came from a basis the two months
 *  do not share. */
export function checkUnbasedMovement(body: string, inp: Pick<MemoInputs, "comparison" | "by_question">): string[] {
  if (!inp.comparison) return [];
  const pairs: Array<[number, number]> = [];
  for (const s of inp.comparison.per_surface) {
    if (typeof s.prior_pct === "number" && typeof s.current_pct === "number") pairs.push([s.prior_pct, s.current_pct]);
  }
  for (const q of inp.by_question) {
    if (typeof q.prior_pct === "number") pairs.push([q.prior_pct, q.current_pct]);
  }
  // Pooled lines state their figures only inside the sentence.
  for (const line of Object.values(inp.comparison.pooled)) {
    const n = [...line.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
    if (n.length >= 2) pairs.push([n[0], n[1]]);
  }
  const stated = (prior: number, cur: number) =>
    pairs.some(([p, c]) => Math.abs(p - prior) < 0.51 && Math.abs(c - cur) < 0.51);
  const issues: string[] = [];
  const pct = "(\\d+(?:\\.\\d+)?)\\s*(?:%|percent)";
  for (const m of body.matchAll(new RegExp(`${pct},?\\s+(?:down|up)\\s+from\\s+${pct}`, "gi"))) {
    if (!stated(Number(m[2]), Number(m[1]))) issues.push(`${quote(m[0])} is not a change the comparison states.`);
  }
  for (const m of body.matchAll(new RegExp(`\\bfrom\\s+${pct}\\s+to\\s+${pct}`, "gi"))) {
    if (!stated(Number(m[1]), Number(m[2]))) issues.push(`${quote(m[0])} is not a change the comparison states.`);
  }
  // "down from 10% last month", with the current figure earlier in the sentence.
  for (const m of body.matchAll(new RegExp(`(?<![\\d%],?\\s)\\b(?:down|up)\\s+from\\s+${pct}`, "gi"))) {
    const prior = Number(m[1]);
    if (!pairs.some(([p]) => Math.abs(p - prior) < 0.51)) issues.push(`${quote(m[0])} is not a change the comparison states.`);
  }
  return issues;
}

// ── Page 1: the action memo (2026-11-22) ─────────────────────────────
// A client ended its engagement on 2026-11-21 saying the reporting showed it
// where to improve, and that it now had to work out a plan "with our current
// resources". It understood the findings and could not turn them into work.
// So page 1 is three actions a named role can do, sized, each with what we
// will watch, and nothing a newcomer has to decode. These checks hold the
// shape. Spec: neverranked-docs/strategy/MEMO-V2-ACTION-MEMO-SPEC-2026-11.md.

export const PAGE_ONE_LABELS = {
  stand: "Where you stand",
  actions: "Three things to do this month",
  last: "Last month's actions",
  question: "One question for you",
} as const;

/** Who does it: a role the reader recognises, never a person we guessed. */
export const PAGE_ONE_WHO = ["front desk", "marketing", "whoever manages your listings", "your web developer", "you"] as const;
/** How long it takes, in the reader's terms. */
export const PAGE_ONE_TIME = ["under an hour", "half a day", "a developer task"] as const;
export const PAGE_ONE_MAX_WORDS = 300;
export const PAGE_ONE_MAX_FIGURES = 6;

/** Words that are fine further down for the reader who wants detail, but not
 *  on the page that gets read and forwarded. */
export const PAGE_ONE_WORDS: Array<{ re: RegExp; say: string }> = [
  { re: /\bAtlas\b/, say: "leave it for the detail" },
  { re: /\blike[- ]for[- ]like\b/i, say: "the same questions in both months" },
  { re: /\bpooled\b/i, say: "together" },
  { re: /\bbasis\b/i, say: "what we compared" },
  { re: /\breadings?\b/i, say: "checks" },
  { re: /\bpunch list\b/i, say: "three things to do" },
  { re: /\bcitations?\b/i, say: "used your site as a source, or named you" },
];

/** The text of the page-1 section, without its heading, or null. */
export function pageOneText(body: string): string | null {
  const start = body.match(new RegExp(`^###\\s+${SHORT_VERSION_HEADING}\\s*$`, "m"));
  if (!start || start.index === undefined) return null;
  const after = start.index + start[0].length;
  const next = body.slice(after).search(/^#{2,3}\s/m);
  return body.slice(after, next < 0 ? body.length : after + next).trim();
}

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";

/** The lines under a bold label, up to the next bold label. */
function block(page: string, label: string): string[] | null {
  const lines = page.split(/\r?\n/);
  const i = lines.findIndex((l) => l.trim() === `**${label}**`);
  if (i < 0) return null;
  const out: string[] = [];
  for (let j = i + 1; j < lines.length && !/^\*\*[^*]+\*\*\s*$/.test(lines[j].trim()); j++) {
    if (lines[j].trim()) out.push(lines[j].trim());
  }
  return out;
}

/** Figures as a reader counts them: "7 of 10" and "1 in 6" are one figure each, a list number
 *  and a year are none. */
export function countFigures(text: string): number {
  const t = text
    .replace(/^\s*\d+\.\s/gm, "")
    .replace(new RegExp(`\\b(?:${MONTHS})\\s+\\d{4}\\b`, "g"), "")
    .replace(/\b(?:19|20)\d{2}\b/g, "")
    .replace(/\b\d+(?:\.\d+)?\s+(?:(?:out\s+)?of|in)\s+\d+(?:\.\d+)?\b/gi, " FIG ");
  return (t.match(/\bFIG\b|\d+(?:\.\d+)?/g) ?? []).length;
}

export function checkPageOne(body: string): string[] {
  const page = pageOneText(body);
  if (page === null) return []; // checkShortVersion reports the missing section
  const issues: string[] = [];

  for (const label of Object.values(PAGE_ONE_LABELS)) {
    if (block(page, label) === null) issues.push(`Page 1 has no "**${label}**" part.`);
  }

  const words = page.replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
  if (words > PAGE_ONE_MAX_WORDS) issues.push(`Page 1 is ${words} words. Keep it to ${PAGE_ONE_MAX_WORDS}.`);
  const figures = countFigures(page);
  if (figures > PAGE_ONE_MAX_FIGURES) issues.push(`Page 1 carries ${figures} figures. Keep it to ${PAGE_ONE_MAX_FIGURES}, and write "N of M" as one.`);

  for (const { re, say } of PAGE_ONE_WORDS) {
    const m = page.match(re);
    if (m) issues.push(`Page 1 uses ${quote(m[0])}. Say: ${say}.`);
  }

  // Page 1 states levels. Movement needs its basis said with it, and that
  // belongs in the detail, where the comparison is laid out.
  const moved = page.match(/\b(?:up|down)\s+from\s+\d|\bfrom\s+\d+(?:\.\d+)?\s*%?\s+to\s+\d|\b\d+(?:\.\d+)?\s*(?:percentage\s+)?points?\b/i);
  if (moved) issues.push(`Page 1 states a change, ${quote(moved[0])}. Page 1 gives where they stand. Changes go in What moved, with what was compared.`);

  const actions = block(page, PAGE_ONE_LABELS.actions);
  if (actions) {
    const items = actions.filter((l) => /^\d+\.\s/.test(l));
    if (items.length !== 3) issues.push(`"${PAGE_ONE_LABELS.actions}" has ${items.length} numbered items, not 3.`);
    let developer = 0;
    items.forEach((item, n) => {
      const who = item.match(/\bWho:\s*([^.]+)\./);
      const time = item.match(/\bTime:\s*([^.]+)\./);
      const watch = item.match(/\bWe will watch:\s*(.+)$/);
      if (!who) issues.push(`Action ${n + 1} has no "Who:".`);
      else if (!(PAGE_ONE_WHO as readonly string[]).includes(who[1].trim().toLowerCase())) {
        issues.push(`Action ${n + 1} "Who: ${who[1].trim()}" is not one of: ${PAGE_ONE_WHO.join(", ")}.`);
      }
      if (!time) issues.push(`Action ${n + 1} has no "Time:".`);
      else if (!(PAGE_ONE_TIME as readonly string[]).includes(time[1].trim().toLowerCase())) {
        issues.push(`Action ${n + 1} "Time: ${time[1].trim()}" is not one of: ${PAGE_ONE_TIME.join(", ")}.`);
      }
      if (!watch) issues.push(`Action ${n + 1} has no "We will watch:".`);
      else if (!new RegExp(`\\b(?:${MONTHS})\\b`).test(watch[1])) issues.push(`Action ${n + 1} does not say which month we will be able to tell.`);
      if (/your web developer/i.test(who?.[1] ?? "") || /a developer task/i.test(time?.[1] ?? "")) developer++;
    });
    if (developer > 1) issues.push(`${developer} of the three actions need a developer. At most one may.`);
  }
  return issues;
}

/** Every check, for a body that claims to be a finished draft. */
export function memoDraftIssues(body: string, inp: Pick<MemoInputs, "comparison" | "by_question">): string[] {
  return [
    ...checkShortVersion(body),
    ...checkPageOne(body),
    ...checkPlainWords(body),
    ...checkHeadingCounts(body),
    ...checkComparedQuestionCount(body, inp),
    ...checkUnbasedMovement(body, inp),
  ];
}

/** What the writer sees. With a comparison present it is the only source of
 *  month-over-month figures, so the other bases are taken away rather than
 *  forbidden: the rule against them existed and the October drafts used them
 *  anyway. The number guard still reads the full inputs. */
export function writerView(inp: MemoInputs): unknown {
  if (!inp.comparison) return inp;
  const { prior: _prior, share_delta_pp: _delta, ...overall } = inp.overall;
  const like = inp.like_for_like;
  return {
    ...inp,
    overall,
    by_engine: inp.by_engine.map(({ prior_share_pct: _p, delta_pp: _d, ...row }) => row),
    ...(like ? { like_for_like: { questions: like.questions, questions_added_since_prior: like.questions_added_since_prior, basis: like.basis } } : {}),
  };
}
