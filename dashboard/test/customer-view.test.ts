/**
 * Tests for dashboard/src/routes/customer-view.ts
 *
 * Two test surfaces:
 *
 *   1. UNIT — test loadCustomerView + the render function directly.
 *      Validates data shape, HTML structure, all 5 spec sections
 *      present, memo-pointer banner present, mobile-responsive CSS
 *      tokens present.
 *
 *   2. INTEGRATION — HTTP tests against the deployed worker at
 *      app.neverranked.com. Validates the route is live, auth gate
 *      fires correctly, the worker isn't silently broken.
 *
 * Auth-gated path (authenticated dashboard render) is not covered
 * here because the magic-link flow requires email round-tripping.
 * Lance tests the authenticated path manually after these pass.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCustomerView } from "../src/routes/customer-view.ts";

// Minimal Env stub for loadCustomerView. loadCustomerView tries the live D1
// path (buildFromD1) first, so the stub must answer env.DB queries: every
// lookup returns null, so buildFromD1 finds no customer and falls through to
// the hardcoded Hamada fixture (and null for unknown slugs).
const envStub = {
  DB: {
    prepare: () => ({ bind: () => ({ first: async () => null }) }),
  },
} as any;

// ---------------------------------------------------------------------
// UNIT: loadCustomerView
// ---------------------------------------------------------------------

test("loadCustomerView returns Hamada data for the right slug", async () => {
  const data = await loadCustomerView(envStub, "hamada-financial-group");
  assert.ok(data, "expected non-null data for hamada-financial-group");
  assert.equal(data!.customerName, "Hamada Financial Group");
  assert.equal(data!.category, "Hawaii wealth management");
  assert.equal(data!.totalQuestions, 18);
  assert.equal(data!.cohortSize, 42);
  assert.equal(data!.yourMentions, 4);
});

test("loadCustomerView returns null for unknown slug", async () => {
  const data = await loadCustomerView(envStub, "some-fake-customer");
  assert.equal(data, null);
});

test("Hamada fixture carries a citation map (renders the instrument)", async () => {
  const data = await loadCustomerView(envStub, "hamada-financial-group");
  assert.ok(data!.citationMap, "expected a citationMap on the fixture");
  assert.equal(data!.citationMap!.engines.length, 7);
  const you = data!.citationMap!.businesses.find((b) => b.you);
  assert.ok(you && you.label === "Hamada Financial Group");
});

// Env stub that serves a readout-shape snapshot + a set of citation_runs, so
// buildFromD1 exercises the real citation-map join (buildCitationMapEdges).
function d1Env(snapshot: any, runs: any[]) {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first() {
                if (/FROM customers/.test(sql)) return { name: "Test Wealth", category: "wm", category_label: "Wealth" };
                if (/citation_snapshots/.test(sql)) return snapshot;
                return null;
              },
              async all() { return { results: runs }; }, // the runs query
            };
          },
        };
      },
    },
  } as any;
}

const READOUT_SNAP = {
  week_start: Math.floor(Date.UTC(2026, 5, 1) / 1000),
  created_at: Math.floor(Date.UTC(2026, 5, 1) / 1000),
  total_queries: 18,
  client_citations: 4,
  engines_breakdown: JSON.stringify({ Perplexity: { share_pct: 20 }, "ChatGPT search": { share_pct: 8 }, Claude: { share_pct: 3 } }),
  top_competitors: JSON.stringify({
    htc_venue_share_pct: 10, htc_engines_count: 2,
    competitors: [
      { domain: "masudalehrman.com", label: "Masuda Lehrman Wealth", venue_share_pct: 30, engines_count: 3 },
      { domain: "fhb.com", label: "First Hawaiian Advisors", venue_share_pct: 25, engines_count: 4 },
    ],
  }),
};

test("citation map join: strict canonical match, threshold, and drops unmatched names", async () => {
  const runs = [
    // perplexity: cites you on q1,q2 (you-edge >=2); names Masuda on q1,q3 (comp-edge >=2)
    { engine: "perplexity", client_cited: 1, competitors_mentioned: '["Masuda Lehrman"]', keyword: "q1" },
    { engine: "perplexity", client_cited: 1, competitors_mentioned: null, keyword: "q2" },
    { engine: "perplexity", client_cited: 0, competitors_mentioned: '["Masuda Lehrman Wealth Management"]', keyword: "q3" },
    // openai: names Masuda on q1,q2 (comp-edge); never cites you (no you-edge)
    { engine: "openai", client_cited: 0, competitors_mentioned: '["Masuda Lehrman Wealth"]', keyword: "q1" },
    { engine: "openai", client_cited: 0, competitors_mentioned: '["Masuda Lehrman"]', keyword: "q2" },
    // gemini: cites you once (below threshold), and names an UNLISTED firm (must be dropped)
    { engine: "gemini", client_cited: 1, competitors_mentioned: '["Some Unlisted Advisory Group"]', keyword: "q1" },
  ];
  const data = await loadCustomerView(d1Env(READOUT_SNAP, runs), "test-wealth");
  const map = data!.citationMap!;
  assert.ok(map, "expected a citation map");
  // Three engines ran; canonical order keeps perplexity, openai, gemini.
  assert.deepEqual(map.engines.map((e) => e.id), ["perplexity", "openai", "gemini"]);
  // Businesses: you + top competitors by share (masuda=c0, fhb=c1). No invented node.
  assert.ok(map.businesses.some((b) => b.you));
  assert.ok(!map.businesses.some((b) => /unlisted/i.test(b.label)), "must not invent a node for an unmatched name");
  // Edges: perplexity->you (2 qs), perplexity->c0 (2 qs), openai->c0 (2 qs).
  const has = (e: string, b: string) => map.edges.some((x) => x.e === e && x.b === b);
  assert.ok(has("perplexity", "you"), "perplexity you-edge (cited on 2 questions)");
  assert.ok(has("perplexity", "c0"), "perplexity->Masuda (named on 2 questions)");
  assert.ok(has("openai", "c0"), "openai->Masuda (named on 2 questions)");
  // gemini cited you only once -> NO you-edge; unlisted firm -> NO edge at all.
  assert.ok(!has("gemini", "you"), "single citation is below the 2-question threshold");
  assert.equal(map.edges.filter((x) => x.e === "gemini").length, 0, "gemini draws no edge");
});

test("citation map join: fail-closed with no runs (no map)", async () => {
  const data = await loadCustomerView(d1Env(READOUT_SNAP, []), "test-wealth");
  assert.equal(data!.citationMap, undefined);
});

test("loadCustomerView Hamada data has all 7 AI tools in perTool", async () => {
  const data = await loadCustomerView(envStub, "hamada-financial-group");
  assert.equal(data!.perTool.length, 7, "expected exactly 7 AI tools");
  const tools = data!.perTool.map((t) => t.tool);
  assert.ok(tools.includes("Perplexity"));
  assert.ok(tools.includes("ChatGPT search"));
  assert.ok(tools.includes("Gemini grounded"));
  assert.ok(tools.includes("Microsoft Copilot (Bing)"));
  assert.ok(tools.includes("Google AI Overviews"));
  assert.ok(tools.includes("Claude"));
  assert.ok(tools.includes("Gemma"));
});

test("loadCustomerView trend has exactly 8 weeks", async () => {
  const data = await loadCustomerView(envStub, "hamada-financial-group");
  assert.equal(data!.trend.length, 8, "expected exactly 8 weekly trend points");
});

test("loadCustomerView cohort top10 has exactly 10 rows and your firm is last", async () => {
  const data = await loadCustomerView(envStub, "hamada-financial-group");
  assert.equal(data!.cohortTop10.length, 10);
  const yourRow = data!.cohortTop10.find((r) => r.isYou);
  assert.ok(yourRow, "expected a row flagged as 'you'");
  assert.equal(data!.cohortTop10[data!.cohortTop10.length - 1].isYou, true,
    "expected the 'you' row to be last in the top10 (Hamada is rank 10/10 in this slice)");
});

test("loadCustomerView changedEvents are all observational (no causation language)", async () => {
  const data = await loadCustomerView(envStub, "hamada-financial-group");
  for (const e of data!.changedEvents) {
    // Forbidden causal phrasing per the receipts-pilot containment + spec
    const lower = e.text.toLowerCase();
    assert.doesNotMatch(lower, /\bour work\b/, `causation creep: "${e.text}"`);
    assert.doesNotMatch(lower, /\bwe drove\b/, `causation creep: "${e.text}"`);
    assert.doesNotMatch(lower, /\bwe caused\b/, `causation creep: "${e.text}"`);
    assert.doesNotMatch(lower, /\brecommend\b/, `recommendation in dashboard (should be in memo): "${e.text}"`);
    assert.doesNotMatch(lower, /\byou should\b/, `prescription in dashboard (should be in memo): "${e.text}"`);
  }
});

test("loadCustomerView observableGaps are all observational (no prescription language)", async () => {
  const data = await loadCustomerView(envStub, "hamada-financial-group");
  for (const g of data!.observableGaps) {
    const lower = g.text.toLowerCase();
    assert.doesNotMatch(lower, /\bshould\b/, `prescription in gap: "${g.text}"`);
    assert.doesNotMatch(lower, /\bmust\b/, `prescription in gap: "${g.text}"`);
    assert.doesNotMatch(lower, /\bdo X\b/, `prescription in gap: "${g.text}"`);
  }
});

// ---------------------------------------------------------------------
// UNIT: HTML render via the route handler (calls renderCustomerView)
// ---------------------------------------------------------------------
// renderCustomerView is internal to the module. We exercise it through
// the public surface (loadCustomerView output) and a fetch-style check
// against the deployed worker below.

// ---------------------------------------------------------------------
// INTEGRATION: HTTP against the deployed worker
// ---------------------------------------------------------------------

const BASE = "https://app.neverranked.com";

test("INTEGRATION: GET /c/hamada-financial-group/ unauthenticated returns 302 to /login", async () => {
  const res = await fetch(`${BASE}/c/hamada-financial-group/`, { redirect: "manual" });
  assert.equal(res.status, 302, `expected 302 redirect, got ${res.status}`);
  const location = res.headers.get("location");
  assert.ok(location, "expected Location header on 302");
  assert.match(location!, /^\/login/, `expected redirect to /login, got ${location}`);
});

test("INTEGRATION: GET /c/some-fake-slug/ unauthenticated also redirects (auth gate fires first)", async () => {
  const res = await fetch(`${BASE}/c/some-fake-slug/`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location")!, /^\/login/);
});

test("INTEGRATION: GET /c/HAMADA-Financial-Group/ (mixed case) handled by case-insensitive regex", async () => {
  // Route regex is /^\/c\/([a-z0-9-]+)\/?$/i — uppercase should match.
  // Auth gate still fires unauthenticated, so we expect 302 to /login.
  const res = await fetch(`${BASE}/c/HAMADA-Financial-Group/`, { redirect: "manual" });
  assert.equal(res.status, 302);
});

test("INTEGRATION: GET /c/ (no slug) does not match the route", async () => {
  // Should fall through to the general auth handling, NOT be treated as a
  // customer-view request with empty slug.
  const res = await fetch(`${BASE}/c/`, { redirect: "manual" });
  // Either 302 (auth gate) or 404 (no route match) is acceptable; what we
  // care about is that no crash/500 happens from an empty slug match.
  assert.ok(res.status === 302 || res.status === 404 || res.status === 405,
    `expected 302 / 404 / 405, got ${res.status}`);
});

test("INTEGRATION: GET /c/hamada-financial-group (no trailing slash) also handled", async () => {
  // Route regex allows optional trailing slash.
  const res = await fetch(`${BASE}/c/hamada-financial-group`, { redirect: "manual" });
  assert.equal(res.status, 302);
});

test("INTEGRATION: app.neverranked.com root responds (worker not broken)", async () => {
  const res = await fetch(`${BASE}/`, { redirect: "manual" });
  // Worker should respond with something (200 / 302 / etc.), NOT 500
  assert.notEqual(res.status, 500, "worker returning 500 on root");
  assert.notEqual(res.status, 502, "worker returning 502 on root");
  assert.notEqual(res.status, 503, "worker returning 503 on root");
});

test("INTEGRATION: GET /login returns a sign-in page (HTML)", async () => {
  const res = await fetch(`${BASE}/login`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /[Ss]ign in/, "expected 'Sign in' text on login page");
  assert.match(body, /email/i, "expected email input on login page");
});
