/**
 * Tests for tools/reddit-tracker/src/brief.mjs
 *
 * Inference helpers are private; we exercise them through the public
 * generateBriefSkeleton API by crafting scan summaries that hit each
 * branch. The renderBriefMarkdown formatter is tested for shape.
 *
 * Coverage:
 *   - generateBriefSkeleton: input validation, integration shape
 *   - inferGap branches: client absent + competitors named, client
 *     absent + no competitors, negative-sentiment skew, mentioned-OK
 *   - inferAngle branches: comparison, recommendation-ask, experience-
 *     share, best-of (with + without competitive set), fallback
 *   - inferToneNotes: known sub library hit, default fallback
 *   - inferDontDo: base list, smallbusiness/saas/crm specifics,
 *     negative-sentiment addition
 *   - inferDraftHooks: with/without competitors, mentioned/absent
 *   - renderBriefMarkdown: section presence, evidence rendering
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateBriefSkeleton,
  renderBriefMarkdown,
} from "../src/brief.mjs";

// ---------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------

const mkThread = (overrides = {}) => ({
  url: "https://www.reddit.com/r/test/comments/abc/x",
  title: "test thread",
  subreddit: "test",
  op_score: 100,
  comment_count: 50,
  posted_at: Math.floor(Date.now() / 1000) - 86400 * 200,
  ...overrides,
});

const mkScan = (overrides = {}) => ({
  client_mentions: [],
  competitor_mentions: {},
  summary: {
    client_slug: "test-client",
    client_mentioned: false,
    client_mention_count: 0,
    client_positive: 0,
    client_negative: 0,
    competitors_named: 0,
    top_competitors: [],
    gap_signal: "client absent",
    ...overrides.summary,
  },
  ...(overrides.summary ? {} : overrides),
});

// ---------------------------------------------------------------------
// generateBriefSkeleton -- input validation + integration
// ---------------------------------------------------------------------

test("generateBriefSkeleton throws when required args missing", () => {
  assert.throws(() => generateBriefSkeleton({}));
  assert.throws(() => generateBriefSkeleton({ thread: mkThread() }));
  assert.throws(() => generateBriefSkeleton({ thread: mkThread(), scan: mkScan() }));
});

test("generateBriefSkeleton returns the full structured shape", () => {
  const b = generateBriefSkeleton({
    thread: mkThread(),
    scan: mkScan(),
    category: "best CRM for real estate",
    score: { composite_score: 0.6 },
  });
  assert.equal(typeof b.thread_url, "string");
  assert.equal(b.subreddit, "test");
  assert.equal(b.category, "best CRM for real estate");
  assert.equal(typeof b.gap, "string");
  assert.equal(typeof b.angle, "string");
  assert.ok(Array.isArray(b.tone_notes));
  assert.ok(Array.isArray(b.dont_do));
  assert.ok(Array.isArray(b.draft_hooks));
  assert.equal(typeof b.evidence, "object");
  assert.equal(typeof b.generated_at, "string");
  assert.equal(b.evidence.composite_score, 0.6);
});

// ---------------------------------------------------------------------
// inferGap -- four branches
// ---------------------------------------------------------------------

test("inferGap: client absent + competitors named", () => {
  const scan = mkScan({
    summary: {
      client_mentioned: false,
      top_competitors: [{ name: "Foo" }, { name: "Bar" }, { name: "Baz" }, { name: "Qux" }],
    },
  });
  const b = generateBriefSkeleton({ thread: mkThread(), scan, category: "best CRM" });
  assert.match(b.gap, /not mentioned/);
  assert.match(b.gap, /4 competitors/);
  assert.match(b.gap, /Foo, Bar, Baz/);
});

test("inferGap: client absent + no competitive set", () => {
  const scan = mkScan({
    summary: { client_mentioned: false, top_competitors: [] },
  });
  const b = generateBriefSkeleton({ thread: mkThread(), scan, category: "best CRM" });
  assert.match(b.gap, /does not yet have an established competitive set/);
  assert.match(b.gap, /seed the recommendation pattern/);
});

test("inferGap: client mentioned, sentiment skews negative", () => {
  const scan = mkScan({
    summary: {
      client_mentioned: true,
      client_mention_count: 5,
      client_positive: 1,
      client_negative: 4,
      top_competitors: [],
    },
  });
  const b = generateBriefSkeleton({ thread: mkThread(), scan, category: "best CRM" });
  assert.match(b.gap, /sentiment skews negative/);
  assert.match(b.gap, /4-/);
  assert.match(b.gap, /counter-evidence/);
});

test("inferGap: client mentioned with positive sentiment", () => {
  const scan = mkScan({
    summary: {
      client_mentioned: true,
      client_mention_count: 3,
      client_positive: 3,
      client_negative: 0,
    },
  });
  const b = generateBriefSkeleton({ thread: mkThread(), scan, category: "best CRM" });
  assert.match(b.gap, /No gap on visibility/);
  assert.match(b.gap, /repeats existing positive signal/);
});

// ---------------------------------------------------------------------
// inferAngle -- five title-shape branches
// ---------------------------------------------------------------------

test("inferAngle: comparison thread (vs / versus / or-question)", () => {
  for (const title of ["Foo vs Bar", "Foo versus Bar", "Foo or Bar?"]) {
    const b = generateBriefSkeleton({
      thread: mkThread({ title }),
      scan: mkScan(),
      category: "test",
    });
    assert.match(b.angle, /Comparison thread/, `expected comparison branch for "${title}"`);
  }
});

test("inferAngle: recommendation-ask thread", () => {
  const b = generateBriefSkeleton({
    thread: mkThread({ title: "Need recommendations for a CRM" }),
    scan: mkScan(),
    category: "test",
  });
  assert.match(b.angle, /Recommendation-ask thread/);
  assert.match(b.angle, /surface the specific use-case constraint/);
});

test("inferAngle: experience-share thread", () => {
  for (const title of [
    "Anyone tried Notion for project tracking",
    "Honest opinions on Salesforce",
    "What's your experience with HubSpot",
  ]) {
    const b = generateBriefSkeleton({
      thread: mkThread({ title }),
      scan: mkScan(),
      category: "test",
    });
    assert.match(b.angle, /Experience-share thread/, `expected experience-share for "${title}"`);
  }
});

test("inferAngle: best-of with thick competitive set (>=3)", () => {
  const b = generateBriefSkeleton({
    thread: mkThread({ title: "Best CRM tools" }),
    scan: mkScan({
      summary: {
        top_competitors: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
      },
    }),
    category: "test",
  });
  assert.match(b.angle, /Best-of list with 4 competitors/);
  assert.match(b.angle, /do not repeat the consensus/);
});

test("inferAngle: best-of with thin competitive set (<3)", () => {
  const b = generateBriefSkeleton({
    thread: mkThread({ title: "Best CRM tools" }),
    scan: mkScan({ summary: { top_competitors: [{ name: "A" }] } }),
    category: "test",
  });
  assert.match(b.angle, /Best-of thread with thin competitive set/);
  assert.match(b.angle, /be the first authoritative voice/);
});

test("inferAngle: fallback for shape-less title", () => {
  const b = generateBriefSkeleton({
    thread: mkThread({ title: "Random thread without strong signal" }),
    scan: mkScan(),
    category: "test",
  });
  assert.match(b.angle, /Topical thread without strong shape signal/);
});

// ---------------------------------------------------------------------
// inferToneNotes -- library hit + default
// ---------------------------------------------------------------------

test("inferToneNotes pulls from the curated library when sub is known", () => {
  const b = generateBriefSkeleton({
    thread: mkThread({ subreddit: "realtors" }),
    scan: mkScan(),
    category: "test",
  });
  assert.ok(b.tone_notes.some((t) => t.includes("r/realtors is suspicious")));
});

test("inferToneNotes returns default tone for unknown subs", () => {
  const b = generateBriefSkeleton({
    thread: mkThread({ subreddit: "some-random-sub" }),
    scan: mkScan(),
    category: "test",
  });
  assert.ok(b.tone_notes.some((t) => t.includes("Match the register")));
  assert.ok(b.tone_notes.some((t) => t.includes("first-person") || t.includes("First-person")));
});

// ---------------------------------------------------------------------
// inferDontDo -- base list + sub-specific + negative-sentiment
// ---------------------------------------------------------------------

test("inferDontDo always includes the base disqualifiers", () => {
  const b = generateBriefSkeleton({
    thread: mkThread(),
    scan: mkScan(),
    category: "test",
  });
  assert.ok(b.dont_do.some((d) => d.includes("Do not include links")));
  assert.ok(b.dont_do.some((d) => d.includes("Do not use CTAs")));
  assert.ok(b.dont_do.some((d) => d.includes("Do not use emojis")));
  assert.ok(b.dont_do.some((d) => d.includes("Do not use em dashes")));
});

test("inferDontDo adds smallbusiness-specific anti-promo line", () => {
  const b = generateBriefSkeleton({
    thread: mkThread({ subreddit: "smallbusiness" }),
    scan: mkScan(),
    category: "test",
  });
  assert.ok(b.dont_do.some((d) => d.includes("anti-self-promo rules")));
});

test("inferDontDo adds vendor-disclosure line for saas / crm", () => {
  for (const sub of ["saas", "crm"]) {
    const b = generateBriefSkeleton({
      thread: mkThread({ subreddit: sub }),
      scan: mkScan(),
      category: "test",
    });
    assert.ok(
      b.dont_do.some((d) => d.includes("Disclose vendor affiliation")),
      `expected vendor-disclosure for r/${sub}`,
    );
  }
});

test("inferDontDo adds the negative-sentiment caution when applicable", () => {
  const b = generateBriefSkeleton({
    thread: mkThread(),
    scan: mkScan({ summary: { client_negative: 2 } }),
    category: "test",
  });
  assert.ok(b.dont_do.some((d) => d.includes("Negative sentiment exists in-thread")));
});

// ---------------------------------------------------------------------
// inferDraftHooks -- three variations
// ---------------------------------------------------------------------

test("inferDraftHooks references top competitor by name when present", () => {
  const b = generateBriefSkeleton({
    thread: mkThread(),
    scan: mkScan({
      summary: { top_competitors: [{ name: "Follow Up Boss" }] },
    }),
    category: "test",
  });
  assert.ok(b.draft_hooks.some((h) => h.includes("Follow Up Boss")));
});

test("inferDraftHooks differs based on whether client is mentioned", () => {
  const absent = generateBriefSkeleton({
    thread: mkThread(),
    scan: mkScan({ summary: { client_mentioned: false } }),
    category: "test",
  });
  const present = generateBriefSkeleton({
    thread: mkThread(),
    scan: mkScan({ summary: { client_mentioned: true, client_mention_count: 1 } }),
    category: "test",
  });
  assert.ok(absent.draft_hooks.some((h) => h.includes("no one's mentioned")));
  assert.ok(present.draft_hooks.some((h) => h.includes("Adding to the")));
});

// ---------------------------------------------------------------------
// renderBriefMarkdown -- output shape
// ---------------------------------------------------------------------

test("renderBriefMarkdown emits all expected sections", () => {
  const b = generateBriefSkeleton({
    thread: mkThread({ subreddit: "crm" }),
    scan: mkScan({
      summary: {
        client_mentioned: false,
        top_competitors: [{ name: "Salesforce", mention_count: 3 }],
      },
    }),
    category: "best CRM for real estate",
    score: { composite_score: 0.7 },
  });
  const md = renderBriefMarkdown(b);
  assert.match(md, /^# Reply brief/);
  assert.match(md, /## Gap/);
  assert.match(md, /## Angle/);
  assert.match(md, /## Tone notes/);
  assert.match(md, /## Don't-do/);
  assert.match(md, /## Draft hooks/);
  assert.match(md, /## Evidence/);
  assert.match(md, /Salesforce/);
  // Markdown rendering wraps the label in ** ... **, so match around it.
  assert.match(md, /Discovery score:\*\*\s+0\.7/);
});

test("renderBriefMarkdown uses 'thread' label when subreddit is missing", () => {
  const b = generateBriefSkeleton({
    thread: mkThread({ subreddit: "" }),
    scan: mkScan(),
    category: "test",
  });
  const md = renderBriefMarkdown(b);
  assert.match(md, /^# Reply brief -- thread/);
});

test("renderBriefMarkdown omits Discovery score line when not provided", () => {
  const b = generateBriefSkeleton({
    thread: mkThread(),
    scan: mkScan(),
    category: "test",
    // no score
  });
  const md = renderBriefMarkdown(b);
  assert.doesNotMatch(md, /Discovery score:/);
});
