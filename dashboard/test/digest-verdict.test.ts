import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weekReport,
  movedItems,
  digestSubject,
  type ClientWeek,
} from "../src/digest-verdict";

// The verdict module is the digest's editorial spine: one sentence that IS
// the email, movement only above thresholds, numbers stated once. Tested
// as behavior (which verdict class, which movement surfaces), not exact
// phrasing — the canon tests taught that lesson three times.

const quiet: ClientWeek = {
  domain: "hawaiitheatre.com",
  clientSlug: "hawaii-theatre",
  score: 70,
  scorePrev: 70,
  share: 0.082,
  sharePrev: 0.081,
  coverageWon: 18,
  coverageTotal: 18,
  clicks: 42,
  clicksPrev: 40,
  shippedThisWeek: [],
  events: [],
  actionsPending: 0,
};

test("a genuinely quiet week says quiet, with the held numbers, in one line", () => {
  const r = weekReport(quiet);
  assert.equal(r.moved.length, 0, "sub-threshold wiggle must not count as movement");
  assert.match(r.verdict, /Quiet week/i);
  assert.match(r.verdict, /8%/, "the held share appears with its value");
  assert.match(r.verdict, /[Nn]othing needs you/);
});

test("share movement leads the verdict and outranks score movement", () => {
  const r = weekReport({
    ...quiet,
    share: 0.12,
    sharePrev: 0.08,
    score: 75,
    scorePrev: 70,
  });
  assert.ok(r.moved.length >= 2);
  assert.equal(r.moved[0].kind, "share", "share is the outcome metric and goes first");
  assert.match(r.verdict, /share/i);
  assert.match(r.verdict, /4 points/);
  // Vocabulary discipline survives into the movement line.
  assert.match(r.moved[0].text, /of all citations/);
});

test("quiet numbers with pending actions says so instead of pretending movement", () => {
  const r = weekReport({ ...quiet, actionsPending: 2 });
  assert.equal(r.moved.length, 0);
  assert.equal(r.needsYou, true);
  assert.match(r.verdict, /2 items below need you/);
});

test("small click wiggles stay out, real click moves get in", () => {
  const small = movedItems({ ...quiet, clicks: 44, clicksPrev: 40 });
  assert.equal(small.filter((m) => m.kind === "clicks").length, 0, "+4 on 40 is noise");
  const real = movedItems({ ...quiet, clicks: 60, clicksPrev: 40 });
  assert.equal(real.filter((m) => m.kind === "clicks").length, 1, "+20 on 40 is movement");
});

test("missing citation tracking never fabricates a share line", () => {
  const r = weekReport({ ...quiet, share: null, sharePrev: null });
  assert.ok(!/share/i.test(r.verdict), "no snapshot means no share claim anywhere");
  assert.match(r.verdict, /score 70\/100/);
});

test("subjects carry the same verdict voice", () => {
  const quietSub = digestSubject([weekReport(quiet)]);
  assert.match(quietSub, /quiet week, nothing needs you/);
  const movedSub = digestSubject([
    weekReport({ ...quiet, share: 0.12, sharePrev: 0.08 }),
  ]);
  assert.match(movedSub, /share/i);
  const multi = digestSubject([
    weekReport(quiet),
    weekReport({ ...quiet, domain: "montaic.com", share: 0.2, sharePrev: 0.1 }),
  ]);
  assert.match(multi, /movement on 1 of 2 domains/);
});

test("no em dashes or semicolons ever reach client copy", () => {
  const busy = weekReport({
    ...quiet,
    share: 0.15,
    sharePrev: 0.05,
    score: 90,
    scorePrev: 60,
    clicks: 100,
    clicksPrev: 40,
    shippedThisWeek: ["FAQ schema for the venue pages"],
    events: [{ severity: "win", title: "Perplexity cited the box office page" }],
    actionsPending: 1,
  });
  const all = [busy.verdict, ...busy.moved.map((m) => m.text)].join(" ");
  assert.ok(!/—|–/.test(all), "em dash in client copy");
  assert.ok(!/;/.test(all), "semicolon in client copy");
});
