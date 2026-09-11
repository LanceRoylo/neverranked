// Analyst notes for the report charts ("The read this month").
//
// Each chart in the readout archive carries two text layers:
//   1. "How to read this" — generic mechanics, hardcoded in the renderer.
//   2. "The read this month" — customer-specific, month-specific analyst
//      commentary, generated HERE and frozen into facts_json alongside the
//      numbers, so the interpretation is as immutable as the data.
//
// Voice contract (locked): senior analyst, succinct (2-4 sentences), plain
// language, no hype and no doom, always ends forward-looking, never claims
// causality from a single month, flags variance honestly.
//
// Fail-closed number check: every number that appears in a note must literally
// exist in the frozen facts (a value, a prior value, or a delta between them).
// A note that mentions a number we did not measure is DROPPED — that chart
// falls back to mechanics-only. A missing note is cosmetic; a fabricated
// number in a customer deliverable is not.

import type { Env } from "../types";
import { engineVerbClaimsOk } from "./engine-verb-claims";
import { firstCausalClaim } from "./causal-claims";
import { firstAdviceClaim } from "./note-advice";
import { checkHumanTone } from "../human-tone-guard";
import type { ReportFacts } from "./report-facts";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const NOTES_MODEL = "claude-sonnet-5"; // same tier as Atlas; thinking disabled below
const MAX_TOKENS = 900;
const MAX_NOTE_CHARS = 650; // ~4 sentences; anything longer is not "succinct"

export interface AnalystNotes {
  engines?: string;
  venue?: string;
  sources?: string;
  topSources?: string;
  questions?: string;
}

/** The set of numbers a note is allowed to mention: every measured value,
 *  every prior value, every |delta|, and the row counts. */
export function allowedNumbers(facts: ReportFacts): Set<number> {
  const s = new Set<number>();
  const add = (v: unknown) => { const x = Number(v); if (Number.isFinite(x)) s.add(Math.abs(x)); };
  for (const e of facts.engines || []) {
    add(e.pct); add(e.prev);
    if (typeof e.prev === "number") add(e.pct - e.prev);
  }
  for (const r of facts.venue?.rows || []) add(r.pct);
  for (const r of facts.sources || []) add(r.pct);
  for (const r of facts.topSources || []) add(r.pct);
  // Sum of any two venue rows (e.g. "more than A and B combined") + counts.
  const vr = facts.venue?.rows || [];
  for (let i = 0; i < vr.length; i++) for (let j = i + 1; j < vr.length; j++) add(Number(vr[i].pct) + Number(vr[j].pct));
  add((facts.engines || []).length);
  add(vr.length);
  add((facts.sources || []).length);
  add((facts.topSources || []).length);
  add((facts.questions?.appeared || []).length);
  add((facts.questions?.disappeared || []).length);
  for (const e of [...(facts.questions?.appeared || []), ...(facts.questions?.disappeared || [])]) add(e.engines.length);
  // Years in period labels ("Jul 2026") so dates don't trip the check.
  for (const lbl of [facts.period_label, facts.prior_label]) {
    const y = /(\d{4})/.exec(String(lbl || ""));
    if (y) add(Number(y[1]));
  }
  return s;
}

/** True if every number token in the note exists in the allowed set.
 *  Written-out small counts ("five of seven") are prose, not data claims,
 *  and pass; digits are held to the measured facts. */
export function noteNumbersOk(note: string, allowed: Set<number>): boolean {
  const tokens = note.match(/\d+(?:\.\d+)?/g) || [];
  return tokens.every((t) => allowed.has(Math.abs(Number(t))));
}


/**
 * MECHANICAL guard on the engines note. The prompt tells the writer that the
 * two measurement layers are different quantities; this enforces it.
 *
 * allowedNumbers() exists because instructing a model not to invent figures was
 * not enough. The same reasoning applies here: on 2026-09-07 the largest number
 * in a paying client's payload was a model-knowledge share (share of ANSWERS
 * naming them), the prompt asked for "the move that matters most", and nothing
 * stopped the sentence "Gemma cites you at 18 percent, far ahead of Perplexity
 * at 2". Both digits are real, so the number guard passes it. The claim is
 * still false twice over: Gemma cites nothing, and the two figures have
 * different denominators.
 *
 * Rejecting a note is SAFE. The chart then renders mechanics-only, which is
 * exactly how it behaved before analyst notes existed.
 */
/** Third-person references to the reader, in the reader's own report.
 *
 *  The prompt necessarily describes "the customer" because it is an
 *  instruction. The output is not an instruction, and a note that calls the
 *  reader "the customer" reads like an internal memo that escaped. Dropping it
 *  costs a paragraph and keeps the numbers, which is the same trade every
 *  other guard here makes. */
export function notePersonOk(note: string): boolean {
  return !/\b(the|this)\s+(customer|client)(?:'|\u2019)?s?\b/i.test(note);
}

export function engineNoteClaimsOk(note: string, facts: ReportFacts): boolean {
  const engines = facts.engines || [];
  const lower = note.toLowerCase();
  const named = (e: { name: string }) => lower.includes(e.name.toLowerCase());

  const memoryEngines = engines.filter((e) => e.layer === "model_knowledge");
  const citeEngines = engines.filter((e) => e.layer !== "model_knowledge");

  // 1. A model-knowledge tool must never be described as CITING.
  //
  // Attribution, not proximity. A wide window rejected the correct sentence
  // "Gemma names you in 18 percent of its answers, which is a different
  // measurement from the tools that cite sources" -- the note that actually
  // draws the distinction we want drawn. What matters is whether the
  // model-knowledge tool is the SUBJECT of the citing verb, so only a short
  // span after the name is considered.
  const CITE_WORDS = /\b(cite[sd]?|citation[s]?|citing|sourced?|links? to)\b/;
  for (const e of memoryEngines) {
    if (!named(e)) continue;
    const i = lower.indexOf(e.name.toLowerCase());
    const after = lower.slice(i + e.name.length, i + e.name.length + 40);
    if (CITE_WORDS.test(after)) return false;
  }

  // 2. No comparison ACROSS the layers. Different denominators, so any
  //    ranking between them is meaningless however true each number is.
  const COMPARE = /\b(ahead of|behind|beats?|outperform\w*|more than|less than|higher than|lower than|compared (?:to|with)|versus|vs\.?|best|worst|strongest|weakest|top|leading|trails?)\b/;
  if (memoryEngines.some(named) && citeEngines.some(named) && COMPARE.test(lower)) return false;

  // 3. The Bing control is classic search. It returns; it does not answer.
  const control = engines.find((e) => /bing/i.test(e.name));
  if (control && named(control)) {
    const i = lower.indexOf(control.name.toLowerCase());
    const window = lower.slice(Math.max(0, i - 120), i + control.name.length + 120);
    if (/\b(ai (?:tool|engine|answer)|answers?|recommend\w*|cites?|citing)\b/.test(window)) return false;
  }

  // 4. Baseline month: nothing has a prior value, so nothing moved. Movement
  //    language here is fabrication that carries no digits for the number
  //    guard to catch.
  const hasPrior = engines.some((e) => typeof e.prev === "number");
  const MOVEMENT = /\b(rose|risen|fell|fallen|dropped|climbed|improved|declined|slipped|gained|grew|increased|decreased|up from|down from|held steady|stayed flat|unchanged|month[- ]over[- ]month|since last month)\b/;
  if (!hasPrior && MOVEMENT.test(lower)) return false;

  return true;
}

function cleanNote(v: unknown, allowed: Set<number>): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t || t.length > MAX_NOTE_CHARS) return undefined;
  if (!noteNumbersOk(t, allowed)) return undefined;
  return t;
}

const NOTES_SYSTEM = `You are the senior research analyst at NeverRanked, writing the "read this month" paragraph under each chart in a customer's monthly AI-citation report.

Voice rules, all hard:
- 2 to 4 sentences per note. Succinct. Every sentence earns its place.
- Plain language a non-technical owner reads once and understands.
- Honest: no fluff, no inflating a small move, no doom on a dip. One month of movement is never called a trend. Never claim our work caused a move; at most note that a move is consistent with work done.
- Always end forward-looking: what the NEXT READING will reveal, or what this month sets up as a comparison. Describe what will become visible, never what the reader should do about it.
- DESCRIBE, DO NOT ADVISE, AND NEVER RANK IMPACT. You are writing the chart annotation, not the recommendation. Prioritisation lives in the memo and is written by the principal, which is a promise made on the public site, so a ranked instruction from you breaks it. Forbidden in any phrasing: that one action matters more than another, that something is the biggest lever or the first checkpoint or the top priority, that the reader should focus on or make sure of anything, or that "the opportunity is" somewhere. Observed 2026-09-11 in a preview of a paying customer\'s readout: "Keeping your listings accurate matters more right now than any other single lever" and "should be the first checkpoint next month". Both assert relative impact the measurement cannot establish. Say what the sources ARE. The reader decides what to do.
- Use ONLY numbers that appear in the data you are given. Do not compute new statistics. Do not use em dashes, semicolons, or emojis.
- WRITE TO THEM, NOT ABOUT THEM. This paragraph sits in their own report and they read it. Address them as "you" and "your site", or by their business name. Never write "the customer", "the client", "this business", or "the brand". Observed 2026-09-09: a sources note read "dwarfing the customer's own site at just 2 percent" in prose a paying customer was about to open. These instructions describe them in the third person because they are instructions. Your output is not.

You receive the frozen chart data as JSON. Reply with STRICT JSON only, no markdown fences, exactly this shape:
{"engines":"...","venue":"...","sources":"...","topSources":"...","questions":"..."}
- engines: how the customer performs per AI tool (and the month-over-month move when prior values exist). Name the move that matters most and any dip worth watching.
  CRITICAL, TWO DIFFERENT MEASUREMENTS. Each engine carries a "layer" field and the two layers are NOT the same quantity and are NOT comparable:
    layer "citation" (Perplexity, ChatGPT search, Gemini grounded, Google AI Overviews, and the Bing control): pct is the share of that tool's CITED SOURCES that point to the customer's own site.
    layer "model_knowledge" (Claude, Gemma): these tools search nothing and cite nothing. pct is the share of that tool's ANSWERS that MENTION the customer by name.
  Never call a model_knowledge figure a citation share, and never say those tools "cite" the customer. Say they name or mention. Never rank, compare, or place the two layers on one scale: "Gemma at 18 beats Perplexity at 2" is a false comparison even though both numbers are real, because they have different denominators. If you discuss both, say plainly that they measure different things. Prefer naming the biggest move WITHIN a layer.
  CRITICAL, THE CONTROL. "Bing search (control)" is classic keyword search, not an AI tool. It returns results, it does not answer or cite or recommend. Never describe it as an AI engine and never attribute AI behaviour to it.
  CRITICAL, BASELINE MONTHS. When engines carry no "prev" value there is NO prior reading and therefore NO movement. Do not write that anything rose, fell, improved, held, slipped, gained, or stayed flat. There is nothing to compare against. Describe the starting position and what next month will make visible. This applies to wording with no digits in it just as much as to numbers.
  CRITICAL: an engine carrying "noCohortSignal": true returned sources this month but cited NO venue in the category at all, neither the customer nor any competitor. It is excluded from the chart. Never describe it as the customer being absent, losing ground, or scoring zero, and never attribute it to anything the customer did or failed to do. Either ignore it or state plainly that no venue in the category appeared on that tool this month.
- venue: where the customer ranks among named competitors in their category.
- sources: what the source-type composition (independent web vs their own site etc.) means for where to invest effort.
- topSources: what the specific named domains imply about where to be present and accurate.
- questions: ONLY if question-level appeared/disappeared data is provided. Name the most meaningful specific question won or lost (quote it) and which tool it happened in. A win on a high-intent question matters even when totals are flat. Never editorialize a loss into a crisis.
If a section's data is empty or absent, return an empty string for it.`;

/** Generate the four analyst notes from frozen facts. Best-effort: returns {}
 *  on any failure (missing key, API error, bad JSON) — charts then render
 *  mechanics-only, exactly as before this feature existed. */
export async function writeAnalystNotes(
  env: Env,
  facts: ReportFacts,
  customer: { name: string; category_label?: string | null },
): Promise<AnalystNotes> {
  if (!env.ANTHROPIC_API_KEY) return {};
  try {
    const payload = {
      customer: customer.name,
      category: customer.category_label || undefined,
      period: facts.period_label,
      prior_period: facts.prior_label,
      engines: facts.engines,
      venue: facts.venue,
      sources: facts.sources,
      top_sources: facts.topSources,
      question_movement: facts.questions,
    };
    const resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: NOTES_MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "disabled" },
        system: NOTES_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      }),
    });
    if (!resp.ok) {
      console.log(`[report-notes] API ${resp.status} for ${customer.name}`);
      return {};
    }
    const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();
    const raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<string, unknown>;

    const allowed = allowedNumbers(facts);
    const notes: AnalystNotes = {};
    // Declared before first use. An earlier version of this block put the
    // engines check above these two lines, which is a temporal dead zone: it
    // transpiles clean, throws ReferenceError on every readout, and no test
    // caught it because nothing typechecked the project. Found 2026-09-09 by
    // installing typescript for the first time.
    const engineLabels = (facts.engines || []).map((e) => e.name);

    // ONE chain, and every note goes through it.
    //
    // This used to be a `verbOk` helper plus a hand-written sequence of ifs
    // for the engines note, and the comment claimed the helper ran on EVERY
    // note. It did not: `questions` was assigned straight from cleanNote and
    // skipped the whole chain. That is the note most likely to trip the verb
    // guard, because its prompt asks it to quote a question and name the tool
    // it moved on. A guard that four of five notes receive is how this
    // codebase keeps failing, so there is now no path to a note that dodges
    // one. Adding a guard here covers every note by construction.
    //
    // Every rejection is SAFE. A dropped note renders the chart
    // mechanics-only, exactly as it behaved before analyst notes existed.
    const guardNote = (t: string | undefined, which: string): string | undefined => {
      if (!t) return undefined;
      if (!engineVerbClaimsOk(t, engineLabels)) {
        console.log(`[report-notes] ${which} note attributes a forbidden verb to an engine; dropped`);
        return undefined;
      }
      if (!notePersonOk(t)) {
        console.log(`[report-notes] ${which} note refers to the reader in the third person; dropped`);
        return undefined;
      }
      // Causation. The published Atlas boundary refuses causal claims "of any
      // kind" and atlas-grader enforced it mechanically; the readout, which
      // is the deliverable, had prompt text only.
      const causal = firstCausalClaim(t);
      if (causal) {
        console.log(`[report-notes] ${which} note claims causation ("${causal}"); dropped`);
        return undefined;
      }
      // Ranked impact and strategic advice. The published boundary allows
      // the MEMO to prioritise, but promises it is written by the principal.
      // These notes are written by a model. See lib/note-advice.ts.
      const advice = firstAdviceClaim(t);
      if (advice) {
        console.log(`[report-notes] ${which} note ranks impact or gives advice ("${advice}"); dropped`);
        return undefined;
      }
      // Tone. atlas-grader, multi-pass and memo-generator all run this. The
      // readout did not, despite its prompt asking for the same things.
      const tone = checkHumanTone(t, "customer-publication");
      if (!tone.ok) {
        console.log(`[report-notes] ${which} note failed tone (${tone.violations.map((v) => v.pattern).join(", ")}); dropped`);
        return undefined;
      }
      return t;
    };

    let engines = guardNote(cleanNote(raw.engines, allowed), "engines");
    if (engines && !engineNoteClaimsOk(engines, facts)) {
      console.log(`[report-notes] engines note REJECTED: crosses the citation / model-knowledge boundary, misdescribes the control, or claims movement in a baseline month. Chart renders mechanics-only.`);
      engines = undefined;
    }
    const venue = guardNote(cleanNote(raw.venue, allowed), "venue");
    const sources = guardNote(cleanNote(raw.sources, allowed), "sources");
    const topSources = guardNote(cleanNote(raw.topSources, allowed), "topSources");
    const questions = guardNote(
      facts.questions ? cleanNote(raw.questions, allowed) : undefined,
      "questions",
    );
    if (engines) notes.engines = engines;
    if (venue) notes.venue = venue;
    if (sources) notes.sources = sources;
    if (topSources) notes.topSources = topSources;
    if (questions) notes.questions = questions;
    return notes;
  } catch (e) {
    console.log(`[report-notes] failed: ${e instanceof Error ? e.message : String(e)}`);
    return {};
  }
}
