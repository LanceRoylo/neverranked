/* 2026-11-17: last month's memo is finished, but is it marked sent?
 *
 * In November one client's October readout went out as a PDF and its memo
 * row stayed an undelivered draft, and another client's sat in Gmail Drafts
 * for twelve days. Nothing asked about either. Run against real SQLite.
 * Fictional clients throughout: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { watchMemosUnsent, memoUnsentKey, UNSENT_AFTER_DAY } from "../src/lib/memo-unsent-watch";
import type { Env } from "../src/types";

function d1(db: DatabaseSync): Env {
  const bound = (sql: string, args: unknown[]) => {
    const st = db.prepare(sql);
    return {
      all: async () => ({ results: st.all(...(args as never[])) }),
      first: async () => st.get(...(args as never[])) ?? null,
      run: async () => { const r = st.run(...(args as never[])); return { meta: { changes: Number(r.changes) } }; },
    };
  };
  return { DB: { prepare: (sql: string) => ({ bind: (...a: unknown[]) => bound(sql, a), ...bound(sql, []) }) } } as unknown as Env;
}
/** A Hawaii-time instant: `hst("2026-11-05", 20)` is 8pm HST on Nov 5. */
const hst = (day: string, hour = 20) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000) + (hour + 10) * 3600;
const utcMidnight = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE customers (client_slug TEXT PRIMARY KEY, name TEXT, status TEXT);
    CREATE TABLE measurement_registry (client_slug TEXT PRIMARY KEY, active INTEGER, measurement_start INTEGER);
    CREATE TABLE monthly_memos (id INTEGER PRIMARY KEY, client_slug TEXT, month_key TEXT, delivered_at INTEGER);
    CREATE TABLE admin_inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, title TEXT, body TEXT,
      action_url TEXT, target_type TEXT, target_id INTEGER, target_slug TEXT, urgency TEXT,
      status TEXT DEFAULT 'pending', resolution_note TEXT, resolved_by INTEGER, created_at INTEGER,
      resolved_at INTEGER, snoozed_until INTEGER, last_seen_at INTEGER, UNIQUE(kind, target_type, target_id));
  `);
  db.prepare("INSERT INTO customers VALUES ('harbor-hotel','Harbor Hotel','active'),('lantern-hall','Lantern Hall','pilot'),('new-client','New Client','active'),('gone-client','Gone Client','churned')").run();
  db.prepare("INSERT INTO measurement_registry VALUES ('harbor-hotel',1,?),('lantern-hall',1,?),('new-client',1,?),('gone-client',1,?)")
    .run(utcMidnight("2026-09-01"), utcMidnight("2026-08-01"), utcMidnight("2026-12-01"), utcMidnight("2026-06-01"));
  // October drafts exist for both live clients, neither marked delivered.
  db.prepare("INSERT INTO monthly_memos VALUES (32,'harbor-hotel','2026-10',NULL),(33,'lantern-hall','2026-10',NULL)").run();
  return db;
}
const pending = (db: DatabaseSync) =>
  db.prepare("SELECT kind, title, body, target_slug, target_id FROM admin_inbox WHERE status='pending' ORDER BY target_slug").all() as
    Array<{ kind: string; title: string; body: string; target_slug: string; target_id: number }>;

const realFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
test.after(() => { globalThis.fetch = realFetch; });

test("quiet before day 5 in Hawaii, even when it is already day 5 in UTC", async () => {
  const db = fixture();
  assert.equal(UNSENT_AFTER_DAY, 5);
  // 06:00 UTC on Nov 5 is 8pm on Nov 4 in Honolulu: still day 4.
  const r = await watchMemosUnsent(d1(db), Math.floor(Date.parse("2026-11-05T06:00:00Z") / 1000));
  assert.equal(r.month, null);
  assert.equal(pending(db).length, 0);
});

test("from day 5, each client owed last month's memo gets one item", async () => {
  const db = fixture();
  const r = await watchMemosUnsent(d1(db), hst("2026-11-05"));
  assert.equal(r.month, "2026-10");
  assert.deepEqual(r.unsent, ["harbor-hotel", "lantern-hall"]); // pilots count, churned and not-yet-started do not
  const p = pending(db);
  assert.equal(p.length, 2);
  assert.equal(p[0].title, "Harbor Hotel: October 2026 memo not marked sent");
  assert.equal(p[0].kind, "memo_unsent");
  // Wording: never says the client did not get it.
  assert.match(p[0].body, /does NOT mean they never got it/);
  assert.doesNotMatch(p[0].body, /did not (get|receive)|was not sent/);
  assert.match(p[0].body, /Check Drafts first/);
});

test("running again the same day does not stack a second item", async () => {
  const db = fixture();
  await watchMemosUnsent(d1(db), hst("2026-11-05"));
  await watchMemosUnsent(d1(db), hst("2026-11-06"));
  assert.equal(pending(db).length, 2);
});

test("marking the memo delivered closes its item on the next run", async () => {
  const db = fixture();
  await watchMemosUnsent(d1(db), hst("2026-11-05"));
  db.prepare("UPDATE monthly_memos SET delivered_at = ? WHERE id = 32").run(hst("2026-11-05", 9));
  const r = await watchMemosUnsent(d1(db), hst("2026-11-06"));
  assert.equal(r.resolved, 1);
  assert.deepEqual(pending(db).map((x) => x.target_slug), ["lantern-hall"]);
  const note = db.prepare("SELECT resolution_note FROM admin_inbox WHERE target_slug='harbor-hotel'").get() as { resolution_note: string };
  assert.match(note.resolution_note, /now marked delivered/);
});

test("a month resolved by hand (held on purpose) stays resolved, and next month raises fresh", async () => {
  const db = fixture();
  await watchMemosUnsent(d1(db), hst("2026-11-05"));
  db.prepare("UPDATE admin_inbox SET status='resolved', resolution_note='held on purpose' WHERE target_slug='lantern-hall'").run();
  await watchMemosUnsent(d1(db), hst("2026-11-20"));
  assert.deepEqual(pending(db).map((x) => x.target_slug), ["harbor-hotel"]);
  // December 5th: November's memo is the one now asked about, as a new item.
  await watchMemosUnsent(d1(db), hst("2026-12-05"));
  const lantern = pending(db).filter((x) => x.target_slug === "lantern-hall");
  assert.equal(lantern.length, 1);
  assert.match(lantern[0].title, /November 2026/);
  assert.equal(lantern[0].target_id, memoUnsentKey("2026-11", 2));
});

test("January asks about December, across the year boundary", async () => {
  const db = fixture();
  const r = await watchMemosUnsent(d1(db), hst("2027-01-05"));
  assert.equal(r.month, "2026-12");
  // new-client starts measuring Dec 1, so it owes a December memo by now.
  assert.ok(r.unsent.includes("new-client"));
});

test("the daily cron runs it and logs the run", () => {
  const cron = fs.readFileSync(new URL("../src/cron.ts", import.meta.url), "utf8");
  assert.match(cron, /await import\("\.\/lib\/memo-unsent-watch"\)/);
  assert.match(cron, /logCronRun\(env, "memo_unsent_watch", "success"/);
});
