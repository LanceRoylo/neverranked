/* Prince Waikiki's September memo was released 2026-09-25 and nobody at the
 * client opened it for ten days: release never emails, both logins had never
 * signed in, and nothing asked. Run against real SQLite. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { watchReadoutsSeen, notifyOnDeliver } from "../src/lib/readout-seen-watch";
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
const ts = (d: string) => Math.floor(Date.parse(`${d}T12:00:00Z`) / 1000);

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE customers (client_slug TEXT, name TEXT);
    CREATE TABLE monthly_memos (id INTEGER PRIMARY KEY, client_slug TEXT, month_key TEXT, delivered_at INTEGER);
    CREATE TABLE users (id INTEGER PRIMARY KEY, client_slug TEXT, role TEXT);
    CREATE TABLE page_views (user_id INTEGER, client_slug TEXT, path TEXT, created_at INTEGER);
    CREATE TABLE admin_inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, title TEXT, body TEXT,
      action_url TEXT, target_type TEXT, target_id INTEGER, target_slug TEXT, urgency TEXT,
      status TEXT DEFAULT 'pending', resolution_note TEXT, resolved_by INTEGER, created_at INTEGER,
      resolved_at INTEGER, snoozed_until INTEGER, last_seen_at INTEGER, UNIQUE(kind, target_type, target_id));
  `);
  db.prepare("INSERT INTO customers VALUES ('client-a','Client A')").run();
  db.prepare("INSERT INTO monthly_memos VALUES (11,'client-a','2026-09',?)").run(ts("2026-09-25"));
  db.prepare("INSERT INTO users VALUES (44,'client-a','client'),(45,'client-a','client'),(2,NULL,'admin')").run();
  return db;
}
const pending = (db: DatabaseSync) =>
  db.prepare("SELECT kind, title FROM admin_inbox WHERE status='pending'").all() as Array<{ kind: string; title: string }>;

const realFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
test.after(() => { globalThis.fetch = realFetch; });

test("releasing a memo raises 'tell the client', because release does not email them", async () => {
  const db = fixture();
  await notifyOnDeliver(d1(db), 11);
  const p = pending(db);
  assert.equal(p.length, 1);
  assert.match(p[0].title, /Tell Client A their September 2026 readout is ready/);
});

test("ten days with no visit raises 'no visit recorded', never 'they did not look'", async () => {
  const db = fixture();
  const r = await watchReadoutsSeen(d1(db), ts("2026-10-05"));
  assert.deepEqual(r.unseen, ["client-a"]);
  const p = pending(db).find((x) => x.kind === "readout_unseen");
  assert.ok(p);
  assert.match(p!.title, /released 10d ago, no visit recorded/);
  assert.match(fs.readFileSync(new URL("../src/lib/readout-seen-watch.ts", import.meta.url), "utf8"), /This does NOT prove nobody looked/);
});

test("too soon after release, nothing is raised yet", async () => {
  const db = fixture();
  const r = await watchReadoutsSeen(d1(db), ts("2026-09-26"));
  assert.equal(r.unseen.length, 0);
});

test("a client login opening the readout closes both items", async () => {
  const db = fixture();
  const env = d1(db);
  await notifyOnDeliver(env, 11);
  await watchReadoutsSeen(env, ts("2026-10-05"));
  assert.equal(pending(db).length, 2);
  db.prepare("INSERT INTO page_views VALUES (45,'client-a','/c/client-a/readouts/2026-09',?)").run(ts("2026-10-06"));
  const r = await watchReadoutsSeen(env, ts("2026-10-06"));
  assert.equal(r.seen, 1);
  assert.equal(pending(db).length, 0);
});

test("an admin looking at the client's readout does not count as the client seeing it", async () => {
  const db = fixture();
  db.prepare("INSERT INTO page_views VALUES (2,NULL,'/c/client-a/readouts/2026-09',?)").run(ts("2026-10-05"));
  const r = await watchReadoutsSeen(d1(db), ts("2026-10-05"));
  assert.equal(r.seen, 0);
  assert.deepEqual(r.unseen, ["client-a"]);
});

test("release and the daily run are both wired", () => {
  assert.match(fs.readFileSync(new URL("../src/routes/admin-memos.ts", import.meta.url), "utf8"), /notifyOnDeliver\(env, id\)/);
  assert.match(fs.readFileSync(new URL("../src/cron.ts", import.meta.url), "utf8"), /watchReadoutsSeen\(env\)/);
});
