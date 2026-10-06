/* 2026-10-05, decision A: the monthly readout covers the WHOLE calendar month.
 *
 * The memo drafted on the 2nd used to read the newest weekly snapshot of the
 * month, which is built on a Monday over the month to date. October's would
 * have stopped around the 26th, and September's stopped at 06:06 on the 28th.
 * So the 1st-of-month work builds a month-end snapshot over exactly
 * [first second of the month, first second of the next), floored at
 * measurement_start, and the full-month draft reads that row or refuses,
 * loudly.
 *
 * Fictional business throughout: the repo is public. The tests that matter
 * run REAL SQL (node:sqlite) because the bugs are about which row a query
 * picks and what a bound excludes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openD1, SCHEMA, type SqliteD1 } from "./support/d1-sqlite";
import {
  previousMonthWindow, monthWindowOf, monthWindowForKey, monthEndSnapshotKey, memoClockFor,
  expectedWindowStart, monthEndSnapshotCovers, buildMonthEndSnapshot, loadMonthEndSnapshot,
  buildMonthEndSnapshots, MONTH_END_KIND, type MonthWindow,
} from "../src/lib/month-end-snapshot";
import { buildReadoutSnapshot } from "../src/citations";
import { gatherMemoInputs } from "../src/lib/memo-inputs";
import { generateFullMonthDrafts } from "../src/lib/memo-generator";

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const DAY = 86400;
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const AUG1 = at("2026-08-01T00:00:00Z");
const SEP1 = at("2026-09-01T00:00:00Z");
const AUG: MonthWindow = { start: AUG1, end: SEP1, monthKey: "2026-08" };
const SLUG = "example-hotel";

// ── The window ────────────────────────────────────────────────────────────

test("on the 1st the window is exactly the month just ended", () => {
  const w = previousMonthWindow(new Date("2026-11-01T06:45:00Z"));
  assert.equal(w.monthKey, "2026-10");
  assert.equal(new Date(w.start * 1000).toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(new Date(w.end * 1000).toISOString(), "2026-11-01T00:00:00.000Z");
  // The key is the month's last second, never a Monday 00:00.
  assert.equal(new Date(monthEndSnapshotKey(w) * 1000).toISOString(), "2026-10-31T23:59:59.000Z");
  // Year boundary.
  assert.equal(previousMonthWindow(new Date("2027-01-01T06:45:00Z")).monthKey, "2026-12");
  assert.deepEqual(monthWindowForKey("2026-10"), w);
  assert.equal(monthWindowForKey("2026-13"), null);
  assert.deepEqual(monthWindowOf(new Date((w.end - 1) * 1000)), w);
});

test("the window is floored at measurement_start, and a later start means not engaged", () => {
  const mid = AUG1 + 9 * DAY;
  assert.equal(expectedWindowStart(AUG, null), AUG1);
  assert.equal(expectedWindowStart(AUG, AUG1 - 30 * DAY), AUG1);
  assert.equal(expectedWindowStart(AUG, mid), mid);
  assert.deepEqual(monthEndSnapshotCovers(null, AUG, SEP1), { ok: false, reason: "not_engaged", detail: "measurement starts after 2026-08" });
});

test("a memo for a month that has ended is re-read on that month's clock", () => {
  // Delivery re-vets the body. With the wall clock, an October memo vetted on
  // 3 November read November's first days as its data.
  assert.equal(memoClockFor("2026-10", new Date("2026-11-03T20:00:00Z")).toISOString(), "2026-10-31T23:59:59.000Z");
  const now = new Date("2026-11-03T20:00:00Z");
  assert.equal(memoClockFor("2026-11", now), now, "the current month keeps the wall clock");
  assert.equal(memoClockFor("garbage", now), now);
});

// ── What counts as covering the month ─────────────────────────────────────

const EB = JSON.stringify({ Perplexity: { citations: 1, total: 4, share_pct: 25, cohort_citations: 2, layer: "citation" } });
const tcWith = (extra: Record<string, unknown>) => JSON.stringify({ htc_venue_share_pct: 30, competitors: [], ...extra });

test("only a month-end build over the whole month, made after it closed, covers it", () => {
  const good = {
    week_start: SEP1 - 1, measured_at: SEP1 + 6 * 3600, engines_breakdown: EB,
    top_competitors: tcWith({ snapshot_kind: MONTH_END_KIND, window: { start: AUG1, end: SEP1 } }),
  };
  assert.deepEqual(monthEndSnapshotCovers(good, AUG, null), { ok: true });
  assert.equal((monthEndSnapshotCovers(null, AUG, null) as { reason: string }).reason, "missing");
  const weekly = { ...good, top_competitors: tcWith({ window: { start: AUG1, end: SEP1 } }) };
  assert.equal((monthEndSnapshotCovers(weekly, AUG, null) as { reason: string }).reason, "not_month_end");
  const short = { ...good, top_competitors: tcWith({ snapshot_kind: MONTH_END_KIND, window: { start: AUG1, end: SEP1 - 5 * DAY } }) };
  assert.equal((monthEndSnapshotCovers(short, AUG, null) as { reason: string }).reason, "window_mismatch");
  const early = { ...good, measured_at: SEP1 - 3600 };
  assert.equal((monthEndSnapshotCovers(early, AUG, null) as { reason: string }).reason, "built_before_month_closed");
  // An engagement that began mid-month is covered from its start, not the 1st.
  assert.equal((monthEndSnapshotCovers(good, AUG, AUG1 + 9 * DAY) as { reason: string }).reason, "window_mismatch");
  const legacy = { ...good, engines_breakdown: JSON.stringify({ perplexity: { queries: 3, citations: 1 } }), top_competitors: "[]" };
  assert.equal((monthEndSnapshotCovers(legacy, AUG, null) as { reason: string }).reason, "not_readout_shape");
});

// ── Real SQL: the build ───────────────────────────────────────────────────

async function seed(d1: SqliteD1, slug: string, opts: { owned?: boolean; mStart?: number; status?: string } = {}) {
  const ins = (sql: string, ...a: unknown[]) => d1.db.prepare(sql).run(...a);
  ins("INSERT INTO measurement_registry VALUES (?, 1, 'sweep', ?)", slug, opts.mStart ?? AUG1);
  ins("INSERT INTO customers (client_slug, name, status) VALUES (?, 'Example Hotel', ?)", slug, opts.status ?? "active");
  if (opts.owned !== false) ins("INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active) VALUES (?, 'example-hotel.test', 0, NULL, 1)", slug);
  ins("INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active) VALUES (?, 'rival-inn.test', 1, 'Rival Inn', 1)", slug);
}

let kid = 100;
function addRun(d1: SqliteD1, slug: string, runAt: number, urls: string[], engine = "perplexity", cited = 0) {
  kid++;
  d1.db.prepare("INSERT INTO citation_keywords (id, client_slug, keyword, category, active) VALUES (?, ?, ?, 'client', 1)").run(kid, slug, `q${kid}`);
  d1.db.prepare("INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at) VALUES (?, ?, ?, ?, '[]', 'An answer.', ?)")
    .run(kid, engine, cited, JSON.stringify(urls), runAt);
}

test("the month-end build excludes the new month's sweep and pre-engagement runs", async (t) => {
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const start = AUG1 + 9 * DAY; // engagement began on the 10th
  await seed(d1, SLUG, { mStart: start });
  addRun(d1, SLUG, AUG1 + 2 * DAY, ["https://example-hotel.test/a", "https://example-hotel.test/b"]); // before the start
  addRun(d1, SLUG, AUG1 + 11 * DAY, ["https://example-hotel.test/rooms", "https://www.tripadvisor.com/x", "https://rival-inn.test/c"]);
  addRun(d1, SLUG, SEP1 - 1, ["https://news.example/z"]); // the month's last second: in
  addRun(d1, SLUG, SEP1, ["https://example-hotel.test/c"]); // the new month's first second: out
  addRun(d1, SLUG, SEP1 + 6 * 3600, ["https://example-hotel.test/d"]); // the new month's 06:00 sweep: out

  const res = await buildMonthEndSnapshot(d1.env, SLUG, AUG);
  assert.equal(res.ok, true);
  const row = await loadMonthEndSnapshot(d1.env, SLUG, AUG);
  assert.ok(row, "the row is stored under the month-end key");
  assert.equal(row!.week_start, SEP1 - 1);
  const eb = JSON.parse(row!.engines_breakdown);
  assert.equal(eb.Perplexity.total, 4, "3 links on the 12th + 1 on the last second, nothing else");
  assert.equal(eb.Perplexity.citations, 1, "only the in-window own-site link");
  const tc = JSON.parse(row!.top_competitors);
  assert.deepEqual(tc.window, { start, end: SEP1 });
  assert.equal(tc.snapshot_kind, MONTH_END_KIND);
  assert.deepEqual(monthEndSnapshotCovers(row, AUG, start), { ok: true });
});

test("a month-to-date build before the month's first Monday is keyed inside the month", async (t) => {
  // Thursday 1 October 2026. The Monday of that week is 28 September. Keyed
  // there, an admin rebuild on the 1st or 2nd overwrote September's last
  // weekly row with October's first days.
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const OCT1 = at("2026-10-01T00:00:00Z");
  const NOV1 = at("2026-11-01T00:00:00Z");
  await seed(d1, SLUG);
  addRun(d1, SLUG, OCT1 + 3600, ["https://example-hotel.test/a"]);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-01T12:00:00Z") });
  assert.equal((await buildReadoutSnapshot(d1.env, SLUG, OCT1, NOV1)).ok, true);
  t.mock.timers.setTime(Date.parse("2026-10-12T09:00:00Z")); // a Monday
  assert.equal((await buildReadoutSnapshot(d1.env, SLUG, OCT1, NOV1)).ok, true);
  t.mock.timers.reset();
  const keys = d1.rows("SELECT week_start FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start", SLUG).map((r) => r.week_start);
  assert.deepEqual(keys, [OCT1, at("2026-10-12T00:00:00Z")], "never at 2026-09-28");
});

// ── Real SQL: the draft reads the month-end row ───────────────────────────

function snapRow(d1: SqliteD1, slug: string, weekStart: number, share: number, measuredAt: number, tcExtra: Record<string, unknown> = {}) {
  const eb = JSON.stringify({ Perplexity: { citations: share / 5, total: 20, share_pct: share, cohort_citations: 6, layer: "citation" } });
  const tc = JSON.stringify({
    htc_venue_share_pct: share, competitors: [{ domain: "rival-inn.test", label: "Rival Inn", citations: 6 }],
    source_types: { independent_web: { citations: 10, share_pct: 50 } }, offsite_hosts: [], ...tcExtra,
  });
  d1.db.prepare(`INSERT INTO citation_snapshots (client_slug, week_start, total_queries, client_citations, citation_share,
      top_competitors, keyword_breakdown, engines_breakdown, created_at, measured_at) VALUES (?, ?, 2, 1, 0.1, ?, '{}', ?, ?, ?)`)
    .run(slug, weekStart, tc, eb, measuredAt, measuredAt);
}

test("the full-month draft reads the month-end snapshot, not the last weekly row", async (t) => {
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  await seed(d1, SLUG);
  addRun(d1, SLUG, AUG1 + 3 * DAY, ["https://example-hotel.test/a"], "perplexity", 1);
  const AUG24 = at("2026-08-24T00:00:00Z"); // the month's last Monday
  snapRow(d1, SLUG, AUG24, 10, AUG24 + 6 * 60);
  const clock = new Date((SEP1 - 1) * 1000);

  // Only the weekly row: the 15th-style read still works, the full-month read refuses.
  assert.equal((await gatherMemoInputs(d1.env, SLUG, clock)).by_engine.find((e) => e.engine === "Perplexity")?.current_share_pct, 10);
  await assert.rejects(gatherMemoInputs(d1.env, SLUG, clock, { monthEndSnapshot: true }), /month-end snapshot for 2026-08 is missing/);

  snapRow(d1, SLUG, SEP1 - 1, 20, SEP1 + 6 * 3600, { snapshot_kind: MONTH_END_KIND, window: { start: AUG1, end: SEP1 } });
  for (const opts of [{ monthEndSnapshot: true }, {}]) {
    const inp = await gatherMemoInputs(d1.env, SLUG, clock, opts);
    assert.equal(inp.by_engine.find((e) => e.engine === "Perplexity")?.current_share_pct, 20, JSON.stringify(opts));
    assert.equal(inp.overall.current.share_pct, 20);
  }
});

// ── Real SQL: the guard on the 2nd ────────────────────────────────────────

function noNetwork(t: { after(fn: () => void): void }) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (u: unknown) => { calls.push(String(u)); throw new Error("no network in tests"); }) as typeof fetch;
  t.after(() => { globalThis.fetch = real; });
  return calls;
}

test("a missing month-end snapshot that cannot be built raises a needs-you item and is NOT drafted", async (t) => {
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const calls = noNetwork(t);
  await seed(d1, SLUG, { owned: false }); // the build refuses: no owned domain
  addRun(d1, SLUG, AUG1 + 3 * DAY, ["https://rival-inn.test/a"]);
  snapRow(d1, SLUG, at("2026-08-24T00:00:00Z"), 10, at("2026-08-24T00:06:00Z")); // a partial month IS on hand

  const res = await generateFullMonthDrafts(d1.env, new Date((SEP1 - 1) * 1000));
  assert.equal(res.length, 1);
  assert.equal(res[0].ok, false);
  assert.match(res[0].error ?? "", /month-end snapshot for 2026-08 not usable \(missing: .*no_owned_domain.*\); not drafted from a partial month/);
  assert.equal(d1.rows("SELECT * FROM monthly_memos").length, 0, "nothing drafted");
  assert.equal(calls.length, 0, "the writer was never called");
  const inbox = d1.rows("SELECT kind, title, body, urgency, status, target_type, target_slug FROM admin_inbox");
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].kind, "month_end_snapshot_missing");
  assert.equal(inbox[0].urgency, "high");
  assert.equal(inbox[0].status, "pending");
  assert.equal(inbox[0].target_type, `month_end:${SLUG}:2026-08`);
  assert.match(String(inbox[0].title), /example-hotel, August 2026/, "names the client and the month");
  assert.match(String(inbox[0].body), /Draft August 2026 in full/, "and says how to recover");
});

test("a month with only weekly rows is built once in the draft path, then drafted from it", async (t) => {
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  noNetwork(t);
  await seed(d1, SLUG);
  addRun(d1, SLUG, AUG1 + 3 * DAY, ["https://example-hotel.test/a", "https://rival-inn.test/b"], "perplexity", 1);
  snapRow(d1, SLUG, at("2026-08-24T00:00:00Z"), 10, at("2026-08-24T00:06:00Z"));

  const res = await generateFullMonthDrafts(d1.env, new Date((SEP1 - 1) * 1000));
  // It got past the guard and reached the writer, which has no key in tests.
  assert.match(res[0].error ?? "", /ANTHROPIC_API_KEY not set/);
  assert.equal(d1.rows("SELECT * FROM admin_inbox").length, 0, "no alarm for a snapshot it could build");
  const row = await loadMonthEndSnapshot(d1.env, SLUG, AUG);
  assert.equal(JSON.parse(row!.top_competitors).snapshot_kind, MONTH_END_KIND);
});

test("a month already delivered is skipped, never rolled forward into the next month's label", async (t) => {
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  await seed(d1, SLUG);
  d1.db.prepare("INSERT INTO monthly_memos (client_slug, month_key, title, body_markdown, delivered_at) VALUES (?, '2026-08', 't', 'b', ?)").run(SLUG, SEP1 + DAY);
  const res = await generateFullMonthDrafts(d1.env, new Date((SEP1 - 1) * 1000));
  assert.equal(res[0].skipped, "2026-08 already delivered");
  assert.equal(d1.rows("SELECT * FROM citation_snapshots").length, 0, "no build either");
  assert.equal(d1.rows("SELECT * FROM admin_inbox").length, 0);
});

// ── Real SQL: the 1st-of-month build ──────────────────────────────────────

test("each client's month-end build is isolated and leaves its own cron_runs row", async (t) => {
  const d1 = await openD1(SCHEMA, (sql, binds) => {
    if (sql.includes("FROM citation_runs") && binds[0] === "third-client") throw new Error("D1_ERROR: simulated");
  });
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  await seed(d1, SLUG);
  await seed(d1, "second-client", { owned: false });
  await seed(d1, "third-client");
  await seed(d1, "later-client", { mStart: SEP1 + 9 * DAY });
  d1.db.prepare("INSERT INTO measurement_registry VALUES ('paused-client', 0, 'sweep', ?)").run(AUG1);
  for (const s of [SLUG, "second-client", "third-client", "paused-client"]) addRun(d1, s, AUG1 + 3 * DAY, ["https://example-hotel.test/a"]);

  const r = await buildMonthEndSnapshots(d1.env, Date.parse("2026-09-01T06:45:00Z"));
  assert.equal(r.month, "2026-08");
  assert.deepEqual(r.built, [SLUG]);
  assert.deepEqual(r.failed.map((f) => f.slug).sort(), ["second-client", "third-client"]);
  const runs = d1.rows("SELECT status, detail FROM cron_runs WHERE task_name = 'month_end_snapshot' ORDER BY id");
  assert.equal(runs.length, 4, "one row per active sweep client, the paused one is not built");
  assert.ok(runs.some((x) => x.status === "failure" && /second-client 2026-08: refused \(no_owned_domain\)/.test(String(x.detail))));
  assert.ok(runs.some((x) => x.status === "failure" && /third-client 2026-08: D1_ERROR: simulated/.test(String(x.detail))));
  assert.ok(runs.some((x) => x.status === "success" && /later-client 2026-08: not engaged/.test(String(x.detail))));
  assert.ok(runs.some((x) => x.status === "success" && new RegExp(`${SLUG} 2026-08: built`).test(String(x.detail))));
});

// ── Wiring ────────────────────────────────────────────────────────────────

test("the 1st builds month-end snapshots before the recaps, the 2nd drafts through the guard", () => {
  const cron = read("../src/cron.ts");
  const ms = cron.slice(cron.indexOf("export async function runMonthStartWork("), cron.indexOf("export const MEMO_DRAFT_DAY"));
  const build = ms.indexOf("buildMonthEndSnapshots(env, nowMs)");
  assert.ok(build > 0, "runMonthStartWork builds the month-end snapshots");
  assert.ok(build < ms.indexOf("maybeSendMonthlyRecaps(env)"), "and does it first");
  assert.match(ms, /getUTCDate\(\) === 1\)/);
  assert.match(cron, /isPreview\s*\? await generateAllMemoDrafts\(env, clock\)\s*: await generateFullMonthDrafts\(env, clock\)/);
});

test("delivery re-vets a memo on its own month's clock", () => {
  const routes = read("../src/routes/admin-memos.ts");
  assert.match(routes, /vetMemoBody\(env, memo\.client_slug, body, memoClockFor\(memo\.month_key, new Date\(\)\), memo\.facts_json\)/);
});
