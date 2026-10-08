/**
 * The briefing reports PEOPLE, with the excluded traffic shown by source.
 * Pins the numbers and the rendered lines so the old "every API call over 90
 * days" line cannot come back by accident.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  freeCheckCounts, renderFreeCheckText, renderFreeCheckHtml, conversionPhrase, isPersonEvent,
  needsYouExcludingNewLeads, countWindow,
  type FcEventRow, type FcLeadRow,
} from "../src/lib/free-check-counts.ts";

const NOW = 1_792_000_000; // a fixed instant

/** Source with comments removed, so a comment that NAMES the old bug does not
 *  count as the bug. Line comments only when they start a line or follow
 *  whitespace, so "https://" inside a string survives. */
function code(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}
const H = 3600;
const START = NOW - 3 * 86400; // first page-tagged row three days ago

function ev(type: string, source: string, at: number, session: string | null, extra: Partial<FcEventRow> = {}): FcEventRow {
  return { type, source, is_internal: 0, is_bot: 0, session_id: session, created_at: at, ...extra };
}
function lead(id: number, email: string, at: number, extra: Partial<FcLeadRow> = {}): FcLeadRow {
  return {
    id, email, domain: "shop.test", score: 62, grade: "C", source: "check_page", is_internal: 0, session_id: null,
    utm_source: "linkedin", utm_campaign: "tofu-2026-10", utm_content: "c1", referrer: null,
    consent_version: "gate-2026-10a", created_at: at, ...extra,
  };
}

const events: FcEventRow[] = [
  // person A: two scans, saw the ask, in the last day
  ev("scan", "page", NOW - 2 * H, "sess-a"), ev("scan", "page", NOW - 2 * H + 30, "sess-a"), ev("gate_impression", "page", NOW - 2 * H + 40, "sess-a"),
  // person B: scan + ask two days ago (week only)
  ev("scan", "page", NOW - 2 * 86400, "sess-b"), ev("gate_impression", "page", NOW - 2 * 86400, "sess-b"),
  // excluded callers in the last day
  ev("scan", "montaic", NOW - H, null, { is_internal: 1, is_bot: 1 }),
  ev("scan", "montaic", NOW - H, null, { is_internal: 1, is_bot: 1 }),
  ev("scan", "mcp", NOW - H, null, { is_bot: 1 }),
  ev("scan", "audit-template", NOW - H, null, { is_internal: 1 }),
  ev("scan", "page", NOW - H, "sess-bot", { is_bot: 1 }),
  // legacy row from before counting began: must not count anywhere
  ev("scan", "legacy_page", START - 86400, null),
];
const leads: FcLeadRow[] = [
  lead(1, "owner@shop.test", NOW - 2 * H + 60, { session_id: "sess-a" }),
  lead(2, "other@shop.test", NOW - 2 * 86400, { session_id: "sess-b" }),
  lead(3, "qa@example.com", NOW - H, { is_internal: 1, session_id: "sess-a" }),
  lead(4, "old@shop.test", START - 86400, { source: "kv_backfill", consent_version: "legacy-2026-05" }),
  // an old cached page: a real lead with no page session
  lead(5, "cached@shop.test", NOW - 3 * H),
];

test("a person is a page row that is neither internal nor a bot", () => {
  assert.equal(isPersonEvent({ source: "page", is_internal: 0, is_bot: 0 }), true);
  assert.equal(isPersonEvent({ source: "page", is_internal: 0, is_bot: 1 }), false);
  assert.equal(isPersonEvent({ source: "page", is_internal: 1, is_bot: 0 }), false);
  assert.equal(isPersonEvent({ source: "mcp", is_internal: 0, is_bot: 0 }), false);
});

test("counts are distinct people, internal and bots excluded and itemised", () => {
  const c = freeCheckCounts(events, leads, NOW, START);
  assert.equal(c.day.ranCheck, 1, "person A scanned twice: one person");
  assert.equal(c.week.ranCheck, 2);
  assert.equal(c.day.sawAsk, 1);
  assert.equal(c.week.sawAsk, 2);
  assert.equal(c.day.gaveEmail, 1, "the internal capture is not a lead");
  assert.equal(c.week.gaveEmail, 2);
  assert.equal(c.day.otherCaptures, 1, "the cached-page capture is counted apart");
  assert.equal(c.week.otherCaptures, 1);
  assert.equal(c.day.excluded, 5);
  assert.deepEqual(c.day.excludedBySource, { montaic: 2, mcp: 1, "audit-template": 1, bots: 1 });
  assert.deepEqual(c.newLeads.map((l) => l.id), [1, 5]);
});

test("nothing before the first page-tagged row is counted", () => {
  const c = freeCheckCounts(events, leads, NOW, START);
  assert.equal(c.week.excludedBySource.legacy_page, undefined);
  const none = freeCheckCounts(events, leads, NOW, null);
  assert.equal(none.week.ranCheck, 0);
});

test("new leads are listed even before counting begins", () => {
  const none = freeCheckCounts(events, leads, NOW, null);
  assert.deepEqual(none.newLeads.map((l) => l.id), [1, 5], "a real lead is never hidden by the counting basis");
  const text = renderFreeCheckText(none).join("\n");
  assert.match(text, /No page-tagged rows yet/);
  assert.match(text, /owner@shop\.test/);
});

test("the capture rate uses one population and can never pass 100%", () => {
  // Three sessions captured, only one of them saw the ask.
  const ev2: FcEventRow[] = [ev("gate_impression", "page", NOW - 60, "s1")];
  const ld2: FcLeadRow[] = [
    lead(1, "a@shop.test", NOW - 50, { session_id: "s1" }),
    lead(2, "b@shop.test", NOW - 50, { session_id: "s2" }),
    lead(3, "c@shop.test", NOW - 50, { session_id: "s3" }),
  ];
  const w = countWindow(ev2, ld2, NOW - 86400, NOW);
  assert.equal(w.sawAsk, 1);
  assert.equal(w.gaveEmail, 1);
  assert.equal(w.otherCaptures, 2);
  assert.ok(w.gaveEmail <= w.sawAsk);
  assert.equal(conversionPhrase(5, 3), "3, which is 3 of 3 who saw the ask", "clamped even if a caller passes more");
});

test("a page row whose stored UA matches the current bot pattern is not a person", () => {
  assert.equal(isPersonEvent({ source: "page", is_internal: 0, is_bot: 0, user_agent: "Mozilla/5.0 HeadlessChrome/120" }), false);
  assert.equal(isPersonEvent({ source: "page", is_internal: 0, is_bot: 0, user_agent: "Mozilla/5.0 (Macintosh) Chrome/129" }), true);
});

test("one new lead is not counted twice in the briefing subject", () => {
  assert.equal(needsYouExcludingNewLeads(1, 1, 1), 0, "the lead's own inbox item");
  assert.equal(needsYouExcludingNewLeads(3, 1, 1), 2);
  assert.equal(needsYouExcludingNewLeads(2, 2, 1), 1, "an older pending lead still needs you");
  assert.equal(needsYouExcludingNewLeads(0, 0, 3), 0);
});

test("the capture rate is counts until 30 asks, then a percentage", () => {
  assert.equal(conversionPhrase(4, 15), "4, which is 4 of 15 who saw the ask");
  assert.equal(conversionPhrase(4, 0), "4");
  assert.equal(conversionPhrase(6, 30), "6, which is 6 of 30 who saw the ask, 20%");
});

test("briefing text block", () => {
  const lines = renderFreeCheckText(freeCheckCounts(events, leads, NOW, START));
  const text = lines.join("\n");
  assert.match(lines[0], /^FREE CHECK \(people only\. Internal callers and bots are excluded below\)$/);
  assert.match(text, /Ran a check\s+1\s+\(last 7 days: 2\)/);
  assert.match(text, /Saw the email ask\s+1\s+\(last 7 days: 2\)/);
  assert.match(text, /Gave an email\s+1\s+\(last 7 days: 2, which is 2 of 2 who saw the ask\)/);
  assert.match(text, /Other captures\s+1\s+\(last 7 days: 1\. no page session, or the ask was not logged: unverified source\)/);
  assert.match(text, /cached@shop\.test  \(unverified source: no page session\)/);
  assert.match(text, /Excluded\s+5\s+\(montaic 2, audit-template 1, bots 1, mcp 1\)/);
  assert.match(text, /Counting from \d{4}-\d{2}-\d{2}\. The old line counted every API call over 90 days\./);
  assert.match(text, /NEW LEADS \(last 24h\)\n  shop\.test  .+ HST  linkedin \/ tofu-2026-10 \/ c1  owner@shop\.test/);
  assert.doesNotMatch(text, /Live AI check/, "the live AI check line stays hidden until one has run");
  assert.doesNotMatch(text, /%/, "no percentage under 30 asks");
});

test("the counting-from note drops after 14 days", () => {
  const text = renderFreeCheckText(freeCheckCounts(events, leads, START + 15 * 86400, START)).join("\n");
  assert.doesNotMatch(text, /Counting from/);
});

test("briefing HTML escapes lead values", () => {
  const html = renderFreeCheckHtml(freeCheckCounts(events, [lead(9, "<b>x</b>@shop.test", NOW - 60, { session_id: "sess-a" })], NOW, START));
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
});

test("automation.ts no longer counts KV keys for the briefing", () => {
  const src = code("../src/automation.ts");
  assert.doesNotMatch(src, /countKeys\(env\.LEADS/);
  assert.doesNotMatch(src, /Free-scan events recorded/);
  assert.match(src, /renderFreeCheckText\(/);
});

test("the admin page reads utm_source, not utm.source, and drops the canned benchmarks", () => {
  const src = code("../src/routes/admin-free-check.ts");
  assert.doesNotMatch(src, /utm\.source/);
  assert.doesNotMatch(src, /5-15%/);
  assert.doesNotMatch(src, /already know they have an AEO problem/);
  assert.doesNotMatch(src, /env\.LEADS/);
});

test("briefing, admin page and cockpit share one loader, bounded by time, newest first", () => {
  const loader = code("../src/lib/free-check-load.ts");
  assert.match(loader, /FROM free_check_events WHERE created_at >= \? ORDER BY created_at DESC LIMIT \?/);
  assert.doesNotMatch(loader, /ORDER BY created_at ASC/);
  for (const f of ["../src/automation.ts", "../src/routes/admin-free-check.ts", "../src/routes/cockpit.ts"]) {
    const src = code(f);
    assert.match(src, /loadFreeCheckRows\(/, f);
    assert.doesNotMatch(src, /FROM free_check_events/, `${f} must not query the events itself`);
  }
  assert.match(code("../src/routes/admin-free-check.ts"), /from "\.\.\/lib\/bot-ua"/);
});

test("the cockpit no longer shows KV call counts as scans and captures", () => {
  const src = code("../src/routes/cockpit.ts");
  assert.doesNotMatch(src, /countKeys\(env\.LEADS, "event:/);
  assert.doesNotMatch(src, />Scans \(all\)</);
  assert.doesNotMatch(src, />Captures</);
  assert.match(src, /Free checks by people \(7d\)/);
});
