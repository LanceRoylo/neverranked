/* 2026-10-05, decision B: the client sees the cautious naming figure.
 *
 * The first per-question naming fields (a4cdba7) carried named_pct =
 * named / answers-read-in-full. Every answer we hold only in part is one where
 * the name was not found in the part we kept, so leaving them out of the
 * denominator can only push the rate up. The readout already states naming as
 * a floor (unread counted as not named) and a ceiling (unread counted as
 * named). The memo writer now gets the same two, and never the biased rate.
 *
 * Fictional business throughout: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildQuestionFacts, gatherMemoInputs, namedBounds, type MemoInputs, type QuestionRun } from "../src/lib/memo-inputs";
import { allowedNumberSet } from "../src/lib/memo-generator";
import { toEnginePresence, RESPONSE_TEXT_CAP, RESPONSE_TEXT_CAP_RAISED_AT } from "../src/lib/answer-presence";
import { openD1, SCHEMA } from "./support/d1-sqlite";

const NAME = "Harbor Lights Hotel";
const CUR = RESPONSE_TEXT_CAP_RAISED_AT + 100;
const NAMED = "For a quiet stay, Harbor Lights Hotel is a good pick.";
const NOT_NAMED = "Several hotels near the marina have rooftop pools.";
const CUT = "x".repeat(RESPONSE_TEXT_CAP); // held only in part, name not found

const run = (engine: string, kid: number, text: string | null): QuestionRun =>
  ({ engine, client_cited: 0, run_at: CUR + 10, keyword: `q${kid}`, category: "client", kid, response_text: text });

test("the floor counts unread answers as not named, the ceiling as named, both over every answer", () => {
  assert.deepEqual(namedBounds(2, 1, 4), { named_runs: 2, named_unknown_runs: 1, named_total_runs: 4, named_floor_pct: 50, named_ceiling_pct: 75 });
  // Nothing unread: one figure, the floor and the ceiling agree.
  assert.deepEqual(namedBounds(3, 0, 4), { named_runs: 3, named_unknown_runs: 0, named_total_runs: 4, named_floor_pct: 75, named_ceiling_pct: 75 });
  assert.equal(namedBounds(0, 0, 0).named_floor_pct, null, "no answers is no figure, not zero");
});

test("the bounds are the readout's bounds on the same counts", () => {
  const p = toEnginePresence({ engine: "perplexity", total: 40, named: 13, unknown_count: 6 });
  const b = namedBounds(13, 6, 40);
  assert.equal(b.named_floor_pct, +(100 * (p.rateFloor as number)).toFixed(1));
  assert.equal(b.named_ceiling_pct, +(100 * (p.rateCeiling as number)).toFixed(1));
});

test("per question and per engine carry the floor and ceiling, and no rate that drops the unread", () => {
  const rows = [run("perplexity", 1, NAMED), run("openai", 1, NAMED), run("gemini", 1, NOT_NAMED), run("google_ai_overview", 1, CUT)];
  const f = buildQuestionFacts(rows, { curStart: CUR, businessName: NAME });
  const q = f.by_question[0];
  assert.equal(q.named_floor_pct, 50, "2 of 4, the cut answer counted as not named");
  assert.equal(q.named_ceiling_pct, 75, "3 of 4, the cut answer counted as named");
  assert.equal(q.named_total_runs, q.current_runs);
  for (const k of ["named_pct", "named_judged_runs"]) {
    assert.equal(k in q, false, `${k} is not handed to the writer`);
    for (const v of f.namedByEngine.values()) assert.equal(k in v, false);
  }
  // 2 of the 3 answers read in full is 66.7: the figure that must not exist.
  const inp = {
    overall: { current: { runs: 0, cited: 0, share_pct: 0 }, prior: { runs: 0, cited: 0, share_pct: 0 }, share_delta_pp: 0 },
    cohort: { rank: null, members: [], customer_mentions: 0 },
    by_engine: [], by_question: f.by_question, by_category: f.by_category, offsite: { source_types: [], hosts: [] },
  } as unknown as MemoInputs;
  const allowed = allowedNumberSet(inp);
  for (const n of ["50", "75"]) assert.ok(allowed.has(n), `${n} must verify`);
  assert.equal(allowed.has("66.7"), false, "the rate over answers read in full must not verify");
});

test("the full memo payload never carries named_pct or named_judged_runs", async (t) => {
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const SEP1 = Math.floor(Date.UTC(2026, 8, 1) / 1000);
  const OCT1 = Math.floor(Date.UTC(2026, 9, 1) / 1000);
  const ins = (sql: string, ...a: unknown[]) => d1.db.prepare(sql).run(...a);
  ins("INSERT INTO measurement_registry VALUES ('demo', 1, 'sweep', ?)", SEP1);
  ins("INSERT INTO customers (client_slug, name, status) VALUES ('demo', ?, 'active')", NAME);
  ins("INSERT INTO domains (client_slug, domain, is_competitor, active) VALUES ('demo', 'harbor-lights.test', 0, 1)");
  ins("INSERT INTO citation_keywords (id, client_slug, keyword, category, active) VALUES (1, 'demo', 'q1', 'client', 1)");
  for (const [engine, text] of [["perplexity", NAMED], ["openai", CUT], ["gemini", NOT_NAMED]] as const) {
    ins("INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at) VALUES (1, ?, 0, '[]', '[]', ?, ?)",
      engine, text, SEP1 + 3 * 86400);
  }
  const inp = await gatherMemoInputs(d1.env, "demo", new Date((OCT1 - 1) * 1000));
  const json = JSON.stringify(inp);
  assert.doesNotMatch(json, /named_pct|named_judged_runs/);
  assert.equal(inp.by_question[0].named_floor_pct, 33.3);
  assert.equal(inp.by_question[0].named_ceiling_pct, 66.7);
});

test("the prompt states naming as the floor or the floor-to-ceiling range", () => {
  const prompt = fs.readFileSync(new URL("../src/lib/memo-generator.ts", import.meta.url), "utf8");
  assert.match(prompt, /HOW OFTEN THE CUSTOMER IS NAMED IS STATED AS THE FLOOR, OR AS THE FLOOR-TO-CEILING RANGE/);
  assert.match(prompt, /When named_unknown_runs is 0 the two are equal: state that single figure/);
  assert.match(prompt, /never a single figure above the floor/);
  assert.match(prompt, /Never compute or state a naming rate that leaves the partly held answers out of its count/);
  // The writer is never pointed at the biased rate any more.
  assert.doesNotMatch(prompt, /named_pct|named_judged_runs/);
  assert.match(prompt, /INPUT_CONTRACT_REVISION = "2026-10-05\.[^"]*named-floor-ceiling/);
});
