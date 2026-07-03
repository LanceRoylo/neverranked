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
- Always end forward-looking: what to watch or what it sets up next month.
- Use ONLY numbers that appear in the data you are given. Do not compute new statistics. Do not use em dashes, semicolons, or emojis.

You receive the frozen chart data as JSON. Reply with STRICT JSON only, no markdown fences, exactly this shape:
{"engines":"...","venue":"...","sources":"...","topSources":"..."}
- engines: the per-AI-tool citation share (and the month-over-month move when prior values exist). Name the move that matters most and any dip worth watching.
- venue: where the customer ranks among named competitors in their category.
- sources: what the source-type composition (independent web vs their own site etc.) means for where to invest effort.
- topSources: what the specific named domains imply about where to be present and accurate.
If a section's data is empty, return an empty string for it.`;

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
    const engines = cleanNote(raw.engines, allowed);
    const venue = cleanNote(raw.venue, allowed);
    const sources = cleanNote(raw.sources, allowed);
    const topSources = cleanNote(raw.topSources, allowed);
    if (engines) notes.engines = engines;
    if (venue) notes.venue = venue;
    if (sources) notes.sources = sources;
    if (topSources) notes.topSources = topSources;
    return notes;
  } catch (e) {
    console.log(`[report-notes] failed: ${e instanceof Error ? e.message : String(e)}`);
    return {};
  }
}
