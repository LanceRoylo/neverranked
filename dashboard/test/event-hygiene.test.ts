import { test } from "node:test";
import { strict as assert } from "node:assert";
import { screenEvents, domainsIn, EVENT_MAX_AGE_DAYS } from "../src/event-hygiene.ts";

// Every fixture below is a REAL row from client_events on 2026-08-17,
// the batch that made the grader hold all five digests in the first
// automated v2 dispatch. Invented fixtures would only prove the rules
// match themselves.

const NOW = Math.floor(Date.parse("2026-08-17T06:00:00Z") / 1000);
const daysAgo = (d: number) => NOW - d * 86400;

const HTC_COHORT = ["hawaiitheatre.com", "blaisdellcenter.com", "hawaiitheatre.org"];
const MONTAIC_COHORT = ["montaic.com"];
const NR_COHORT = ["neverranked.com"];

test("the stale backlog is what made every digest contradict itself", () => {
  // Row 5: true on 2026-06-01, rendered beside a CURRENT 18/18 coverage
  // figure. Both facts are real; printed together as now, they cannot
  // both be.
  const { keep, drop } = screenEvents(
    [
      { id: 5, kind: "citation_lost", severity: "concern" as const,
        title: "Citations dropped to zero on hawaiitheatre.com", occurred_at: daysAgo(77) },
      { id: 9, kind: "regression_alert", severity: "concern" as const,
        title: "hawaiitheatre.com score dropped 30 points", occurred_at: daysAgo(21) },
      { id: 4, kind: "phase_complete", severity: "win" as const,
        title: "Phase 1 complete: Foundation", occurred_at: daysAgo(78) },
    ],
    HTC_COHORT,
    NOW,
  );
  assert.equal(keep.length, 0, "nothing in that batch was within the window");
  assert.equal(drop.length, 3);
  assert.ok(drop.every((d) => /older than/.test(d.why)));
});

test("a fresh event still gets through, or the fix would just be a mute button", () => {
  // Row 11, 7 days old: the And Scene first-citation win. Real news.
  const { keep } = screenEvents(
    [{ id: 11, kind: "first_citation", severity: "win" as const,
       title: "First AI citation: andscenehawaii.com cited by Perplexity", occurred_at: daysAgo(7) }],
    ["andscenehawaii.com"],
    NOW,
  );
  assert.equal(keep.length, 1);
  assert.equal(keep[0].id, 11);
});

test("an event naming another client's domain never prints", () => {
  // Row 1: a neverranked.com regression filed under client_slug
  // 'montaic' in May. It made Montaic's section OPEN with a different
  // company's domain, which is the worst of the four complaints because
  // it is a confidentiality-shaped mistake, not just a confusing one.
  const { keep, drop } = screenEvents(
    [
      { id: 1, kind: "regression_alert", severity: "concern" as const,
        title: "neverranked.com score dropped 60 points", occurred_at: daysAgo(3) },
      { id: 10, kind: "regression_alert", severity: "concern" as const,
        title: "montaic.com score dropped 10 points", occurred_at: daysAgo(3) },
    ],
    MONTAIC_COHORT,
    NOW,
  );
  assert.deepEqual(keep.map((e) => e.id), [10]);
  assert.match(drop[0].why, /not in this client's cohort/);
});

test("a competitor in the client's own cohort is legitimate news", () => {
  // Row 6: blaisdellcenter.com is a competitor venue tracked FOR HTC.
  // Cross-domain does not mean cross-client, and a rule that could not
  // tell them apart would delete the competitive intelligence that is
  // half the product.
  const { keep } = screenEvents(
    [{ id: 6, kind: "regression_alert", severity: "concern" as const,
       title: "blaisdellcenter.com score dropped 45 points", occurred_at: daysAgo(2) }],
    HTC_COHORT,
    NOW,
  );
  assert.equal(keep.length, 1, "a tracked competitor is in-cohort and must survive");
});

test("two sequential truths about one domain collapse to the newer", () => {
  // Rows 7 and 8: "reached grade D" (Jun 15) then "reached grade C"
  // (Jun 22). Each was true when written. Side by side in one email they
  // read as the product not knowing its own numbers.
  const { keep, drop } = screenEvents(
    [
      { id: 7, kind: "grade_up", severity: "win" as const,
        title: "neverranked.com reached grade D", occurred_at: daysAgo(9) },
      { id: 8, kind: "grade_up", severity: "win" as const,
        title: "neverranked.com reached grade C", occurred_at: daysAgo(2) },
    ],
    NR_COHORT,
    NOW,
  );
  assert.deepEqual(keep.map((e) => e.id), [8], "the newer statement is the one still standing");
  assert.match(drop[0].why, /superseded/);
});

test("different kinds about one domain both survive", () => {
  // Dedupe is per kind, not per domain: a win and a concern about the
  // same site are not contradictory, they are a week.
  const { keep } = screenEvents(
    [
      { id: 20, kind: "grade_up", severity: "win" as const,
        title: "montaic.com reached grade A", occurred_at: daysAgo(4) },
      { id: 21, kind: "regression_alert", severity: "concern" as const,
        title: "montaic.com score dropped 10 points", occurred_at: daysAgo(3) },
    ],
    MONTAIC_COHORT,
    NOW,
  );
  assert.equal(keep.length, 2);
});

test("an unknown cohort suppresses nothing, because guessing hides real news", () => {
  const { keep } = screenEvents(
    [{ id: 30, kind: "grade_up", severity: "win" as const,
       title: "somewhere.com reached grade A", occurred_at: daysAgo(1) }],
    [],
    NOW,
  );
  assert.equal(keep.length, 1);
});

test("events with no domain in the title are judged on age alone", () => {
  const { keep } = screenEvents(
    [{ id: 4, kind: "phase_complete", severity: "win" as const,
       title: "Phase 1 complete: Foundation", occurred_at: daysAgo(2) }],
    HTC_COHORT,
    NOW,
  );
  assert.equal(keep.length, 1, "a roadmap milestone names no domain and is still real news");
});

test("kept events render in the order they happened", () => {
  const { keep } = screenEvents(
    [
      { id: 1, kind: "grade_up", severity: "win" as const, title: "a.com reached grade A", occurred_at: daysAgo(2) },
      { id: 2, kind: "first_citation", severity: "win" as const, title: "b.com cited by Perplexity", occurred_at: daysAgo(9) },
    ],
    ["a.com", "b.com"],
    NOW,
  );
  assert.deepEqual(keep.map((e) => e.id), [2, 1], "oldest first once screening is done");
});

test("the window boundary is inclusive, so a send one day late still carries its news", () => {
  const at = { kind: "grade_up", severity: "win" as const, title: "a.com reached grade A" };
  assert.equal(screenEvents([{ ...at, occurred_at: daysAgo(EVENT_MAX_AGE_DAYS) }], ["a.com"], NOW).keep.length, 1);
  assert.equal(screenEvents([{ ...at, occurred_at: daysAgo(EVENT_MAX_AGE_DAYS + 1) }], ["a.com"], NOW).keep.length, 0);
});

test("domain extraction handles the shapes that appear in real titles", () => {
  assert.deepEqual(domainsIn("Citations dropped to zero on hawaiitheatre.com"), ["hawaiitheatre.com"]);
  assert.deepEqual(domainsIn("www.Example.COM reached grade A"), ["example.com"]);
  assert.deepEqual(domainsIn("Phase 1 complete: Foundation"), []);
  assert.deepEqual(domainsIn("hawaiitheatre.org redirect fixed"), ["hawaiitheatre.org"]);
});
