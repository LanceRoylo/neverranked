import { test } from "node:test";
import assert from "node:assert/strict";
import { readNumbers } from "../src/lib/digest-read.ts";
import type { ClientWeek } from "../src/digest-verdict.ts";

/**
 * The grader held six consecutive digests for one client over six days
 * for the same reason each time: the numbers panel printed
 * figures and defined them without ever interpreting them. These tests
 * pin the interpretation, and the last one pins the property that made
 * the holds correct: a metric must never appear without a read.
 */

const base: ClientWeek = {
  domain: "example.com",
  clientSlug: "example",
  score: 70,
  scorePrev: null,
  share: 0.10,
  sharePrev: null,
  coverageWon: 17,
  coverageTotal: 18,
  clicks: null,
  clicksPrev: null,
  shippedThisWeek: [],
  events: [],
  actionsPending: 1,
};

const w = (over: Partial<ClientWeek>): ClientWeek => ({ ...base, ...over });

test("BASELINE: a first reading is interpreted, not just printed", () => {
  const r = readNumbers(base);
  assert.equal(r.baseline, true);
  const all = r.lines.join(" ");
  // The denominator, which is what makes 10% mean anything at all.
  assert.match(all, /out of every 100 sources/i);
  // Says outright that there is nothing to compare against, rather than
  // leaving the reader to wonder whether 10% is good.
  assert.match(all, /first reading/i);
  // Names the gap instead of restating the ratio.
  assert.match(all, /On the other 1, these tools answered without pointing to you/);
  // Input versus outcome, the distinction the whole panel rests on.
  assert.match(all, /It is the input\. Share and coverage are the outcome\./);
});

test("the 10 percent share is never allowed to read as 10 percent of ANSWERS", () => {
  // Share is a citation-layer figure. Describing it as a share of answers
  // would silently move it to the model-knowledge layer.
  const all = readNumbers(base).lines.join(" ");
  assert.match(all, /100 sources/);
  assert.doesNotMatch(all, /of (its |their )?answers/i);
});

test("sub-threshold movement is named as weather, not silently dropped", () => {
  // movedItems() ignores a 1 point share change, so the verdict says
  // nothing. That silence is what left the reader with no sense of change.
  const r = readNumbers(w({ share: 0.10, sharePrev: 0.09 }));
  const all = r.lines.join(" ");
  assert.match(all, /1 point above the last reading/);
  assert.match(all, /weather rather than a change to act on/);
});

test("movement the verdict already claimed is NOT restated", () => {
  // A 5 point jump clears the threshold, so the verdict leads with it.
  // Repeating the direction here is the padding the grader calls filler.
  const r = readNumbers(w({ share: 0.15, sharePrev: 0.10 }));
  const all = r.lines.join(" ");
  assert.match(all, /out of every 100 sources/i);
  assert.doesNotMatch(all, /points above the last reading/);
});

test("a flat reading reports stability instead of reading as an empty email", () => {
  const r = readNumbers(w({ share: 0.10, sharePrev: 0.10, score: 70, scorePrev: 70 }));
  const all = r.lines.join(" ");
  assert.match(all, /held exactly where it was/);
  assert.match(all, /a flat reading is a result rather than a gap in the data/);
});

test("full coverage does not print a zero-gap sentence", () => {
  const all = readNumbers(w({ coverageWon: 18, coverageTotal: 18 })).lines.join(" ");
  assert.match(all, /cited on all 18 tracked questions/);
  assert.doesNotMatch(all, /On the other 0/);
});

test("missing metrics produce no line rather than a null figure", () => {
  const r = readNumbers(w({ share: null, sharePrev: null, coverageWon: null, coverageTotal: null }));
  const all = r.lines.join(" ");
  assert.doesNotMatch(all, /null|NaN|undefined/);
  // Readiness still gets its read.
  assert.match(all, /70 out of 100/);
});

test("PROPERTY: every figure the panel renders gets a read, in every case", () => {
  const cases: ClientWeek[] = [
    base,
    w({ sharePrev: 0.09 }),
    w({ share: 0.15, sharePrev: 0.10, scorePrev: 60 }),
    w({ share: null, sharePrev: null }),
    w({ coverageWon: 0, coverageTotal: 18 }),
    w({ score: 100, scorePrev: 100, share: 1, sharePrev: 1, coverageWon: 18 }),
  ];
  for (const c of cases) {
    const { lines } = readNumbers(c);
    assert.ok(lines.length > 0, "a panel with figures must never render without a read");
    for (const l of lines) {
      assert.doesNotMatch(l, /null|NaN|undefined/, `leaked placeholder: ${l}`);
      // House style: no em dashes, no semicolons in client-facing copy.
      assert.doesNotMatch(l, /—|;/, `house style violation: ${l}`);
      assert.ok(l.trim().endsWith("."), `unterminated sentence: ${l}`);
    }
    // Share and readiness are always described when present.
    const all = lines.join(" ");
    if (c.share !== null) assert.match(all, /out of every 100 sources/i);
    assert.match(all, /Readiness measures/);
  }
});
