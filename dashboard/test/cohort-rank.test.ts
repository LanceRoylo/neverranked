import { test } from "node:test";
import assert from "node:assert/strict";
import { cohortRank, COHORT_BASIS_NOTE } from "../src/lib/cohort-rank.ts";

/**
 * Three code paths ranked the customer and one of them was correct. The other
 * two ran `sorted.indexOf(mine) + 1`, which returns the FIRST match, so every
 * tie promoted the customer to the top of the tied group.
 *
 * Rank is the most quotable number in the readout. It is what a customer
 * repeats to their boss.
 */

test("REGRESSION: a tie does not promote the customer above equals", () => {
  // Four venues on 43. The old indexOf form reported the customer 1st of the
  // tied group purely because of where the array landed.
  const rank = cohortRank(43, [169, 166, 91, 43, 43, 43]);
  assert.equal(rank, 4, "three are strictly ahead, so the tied group starts at 4");
});

test("everyone tied on zero gets the same rank, not an arbitrary order", () => {
  // The common shape: a long tail of cohort venues nobody cites.
  const a = cohortRank(0, [10, 0, 0, 0, 0, 0]);
  const b = cohortRank(0, [10, 0]);
  assert.equal(a, 2);
  assert.equal(b, 2, "rank must not depend on how many others share the tie");
});

test("a clear lead is rank 1 and a clear last is last", () => {
  assert.equal(cohortRank(500, [169, 166, 91]), 1);
  assert.equal(cohortRank(1, [169, 166, 91]), 4);
});

test("an empty cohort is null, never a flattering rank of 1", () => {
  // "1 of nothing" is not a standing, and printing it would be the same false
  // confidence the tie bug produced.
  assert.equal(cohortRank(0, []), null);
  assert.equal(cohortRank(99, []), null);
});

test("the real cohort shape ranks the customer third", () => {
  // Two venues clearly ahead, then the customer.
  assert.equal(cohortRank(135, [169, 166, 91, 70, 65, 61, 43, 43]), 3);
});

test("the fallback basis warns against quoting it as the published rank", () => {
  const note = COHORT_BASIS_NOTE.entity_mentions_90d;
  assert.match(note, /FALLBACK BASIS/);
  assert.match(note, /different measurement/);
  assert.match(note, /Do not quote this number as the customer's published rank/);
  // And the good basis states WHY it agrees, so the model can say so.
  assert.match(COHORT_BASIS_NOTE.venue_citations, /same basis as the published readout/);
});
