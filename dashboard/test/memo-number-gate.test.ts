import { test } from "node:test";
import assert from "node:assert";
import { isSafeNumber, findUnverifiedNumbers } from "../src/lib/memo-generator.ts";

test("isSafeNumber: band tightened to 0-12 (31 no longer auto-safe)", () => {
  assert.equal(isSafeNumber("12"), true);
  assert.equal(isSafeNumber("13"), false);
  assert.equal(isSafeNumber("22"), false);
  assert.equal(isSafeNumber("31"), false); // the old hole
  assert.equal(isSafeNumber("2026"), true); // years still safe
});

// A measured set as allowedNumberSet would produce: real shares, a real delta (3),
// plus the structural engine (7) + question (18) counts.
const allowed = new Set(["14", "12", "48", "7", "18", "3"]);

test("findUnverifiedNumbers: measured + structural numbers pass clean", () => {
  const body = "Claude cites you 14%, up from 12%. Across the 7 AI tools and 18 questions you hold 48%.";
  assert.deepEqual(findUnverifiedNumbers(body, allowed), []);
});

test("findUnverifiedNumbers: a fabricated PERCENTAGE is flagged (the core hole)", () => {
  const bad = findUnverifiedNumbers("Your share is 22% of the category.", allowed);
  assert.ok(bad.includes("22"), "22% must be flagged as unverified");
});

test("findUnverifiedNumbers: a fabricated two-digit count is flagged", () => {
  assert.ok(findUnverifiedNumbers("You were cited 25 times last week.", allowed).includes("25"));
});

test("findUnverifiedNumbers: a fabricated points-delta is flagged", () => {
  assert.ok(findUnverifiedNumbers("Perplexity rose 8 points.", allowed).includes("8"));
});

test("findUnverifiedNumbers: 'top 10' does not false-positive (small count, not a %)", () => {
  assert.deepEqual(findUnverifiedNumbers("The top 10 third-party hosts to fix.", allowed), []);
});

test("findUnverifiedNumbers: a real delta stated as points passes", () => {
  assert.deepEqual(findUnverifiedNumbers("ChatGPT search rose 3 points this month.", allowed), []);
});

// --- the plan_markdown bypass ----------------------------------------------
//
// The frozen plan is human-authored and approved, so the memo may cite it when
// grading against it. The old allowance harvested EVERY numeric token in the
// plan into the allowed set, and the allowed check short-circuits before the
// percentage strictness -- so a plan's cadence days silently licensed a
// fabricated percentage anywhere in the memo.

import { planBareNumbers } from "../src/lib/memo-generator.ts";

const PLAN = "Measurement runs on the 1st, 11th and 21st. The plan sets a 48% citation-share target across 18 questions.";

test("a plan's cadence day cannot license a fabricated percentage", () => {
  // "11" appears in the plan only as a run date. A memo claiming 11% is
  // asserting a measurement the plan never made.
  const allowed = new Set<string>();
  for (const t of PLAN.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent|percentage|pp\b|points?\b)/gi)) allowed.add(t[1]);
  const bad = findUnverifiedNumbers("Your share reached 11% this month.", allowed, planBareNumbers({ plan_markdown: PLAN }));
  assert.ok(bad.includes("11"), `expected 11 to be flagged, got ${JSON.stringify(bad)}`);
});

test("a percentage the plan actually states still verifies", () => {
  // The case the allowance exists for. 48 is written as "48%" in the plan.
  const allowed = new Set<string>();
  for (const t of PLAN.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent|percentage|pp\b|points?\b)/gi)) allowed.add(t[1]);
  assert.deepEqual(
    findUnverifiedNumbers("The plan set a 48% target.", allowed, planBareNumbers({ plan_markdown: PLAN })),
    [],
  );
});

test("a plan date may still be mentioned in prose", () => {
  // Not a data claim, so the plan's bare numbers remain quotable.
  assert.deepEqual(
    findUnverifiedNumbers("Runs land on the 21st.", new Set<string>(), planBareNumbers({ plan_markdown: PLAN })),
    [],
  );
});

test("planBareNumbers excludes figures the plan states as data", () => {
  const bare = planBareNumbers({ plan_markdown: PLAN });
  assert.ok(bare.has("11"), "cadence day is bare");
  assert.ok(!bare.has("48"), "48 is stated as a percentage, so it is not bare");
});
