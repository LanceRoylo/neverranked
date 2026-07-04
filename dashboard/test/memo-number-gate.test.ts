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
