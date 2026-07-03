import { test } from "node:test";
import assert from "node:assert";
import { allowedNumbers, noteNumbersOk } from "../src/lib/report-notes.ts";
import type { ReportFacts } from "../src/lib/report-facts.ts";

const facts: ReportFacts = {
  period_label: "Jul 2026",
  prior_label: "Jun 2026",
  engines: [
    { name: "Claude", pct: 15, prev: 14 },
    { name: "ChatGPT search", pct: 10, prev: 7 },
    { name: "Microsoft Copilot", pct: 1, prev: 0 },
  ],
  venue: { rows: [
    { label: "Hawaii Theatre Center", pct: 48, you: true },
    { label: "Diamond Head Theatre", pct: 15 },
    { label: "Blaisdell Center", pct: 14 },
  ] },
  sources: [
    { label: "Independent web", pct: 69 },
    { label: "Your own site", pct: 9, own: true },
  ],
  topSources: [{ host: "gohawaii.com", pct: 3 }],
};

test("allowedNumbers contains values, priors, deltas, pair sums, counts, years", () => {
  const a = allowedNumbers(facts);
  for (const v of [15, 14, 10, 7, 1, 0, 48, 69, 9, 3]) assert.ok(a.has(v), `value ${v}`);
  assert.ok(a.has(3), "delta 10-7");
  assert.ok(a.has(29), "48 vs 15+14 combined");
  assert.ok(a.has(2026), "year from period label");
});

test("noteNumbersOk passes notes whose digits are all measured", () => {
  const a = allowedNumbers(facts);
  assert.ok(noteNumbersOk("Copilot moved from 0 to 1 and ChatGPT search rose from 7% to 10%.", a));
  assert.ok(noteNumbersOk("You hold 48% of venue citations, more than the next two combined at 29%.", a));
  assert.ok(noteNumbersOk("Five of seven tools held or rose this month.", a)); // written-out words are prose
});

test("noteNumbersOk fails a note with an unmeasured number", () => {
  const a = allowedNumbers(facts);
  assert.ok(!noteNumbersOk("Your citations grew 37% this month.", a));
  assert.ok(!noteNumbersOk("You lead the category by 12 points.", a));
});
