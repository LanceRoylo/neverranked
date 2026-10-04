/* Inbox items that close themselves when their condition clears.
 *
 * Until 2026-10-04 nothing closed an invoice item: recording a payment left
 * "no payment recorded" pending forever, counted every morning as needing
 * you. Run against a real SQLite database so the SQL itself is tested. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { watchInvoices } from "../src/lib/invoice-watch";
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
  return {
    DB: { prepare: (sql: string) => ({ bind: (...a: unknown[]) => bound(sql, a), ...bound(sql, []) }) },
  } as unknown as Env;
}

const ts = (d: string) => Math.floor(Date.parse(`${d}T12:00:00Z`) / 1000);

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE customers (client_slug TEXT, name TEXT, mrr_cents INTEGER, status TEXT);
    CREATE TABLE client_invoices (invoice_no TEXT PRIMARY KEY, client_slug TEXT, period TEXT,
      total_cents INTEGER, due_at INTEGER, sent_at INTEGER, paid_at INTEGER, status TEXT);
    CREATE TABLE admin_inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, title TEXT, body TEXT,
      action_url TEXT, target_type TEXT, target_id INTEGER, target_slug TEXT, urgency TEXT,
      status TEXT DEFAULT 'pending', resolution_note TEXT, resolved_by INTEGER, created_at INTEGER,
      resolved_at INTEGER, snoozed_until INTEGER, last_seen_at INTEGER,
      UNIQUE(kind, target_type, target_id));
  `);
  db.prepare("INSERT INTO customers VALUES ('client-a','Client A',75000,'active')").run();
  db.prepare("INSERT INTO client_invoices VALUES ('A-002','client-a','2026-09',78534,?,?,NULL,'sent')").run(ts("2026-09-16"), ts("2026-09-04"));
  db.prepare("INSERT INTO client_invoices VALUES ('A-003','client-a','2026-10',78534,?,?,NULL,'sent')").run(ts("2026-10-16"), ts("2026-10-01"));
  return db;
}

const pending = (db: DatabaseSync) =>
  (db.prepare("SELECT target_type, title FROM admin_inbox WHERE status = 'pending' ORDER BY id").all() as Array<{ target_type: string; title: string }>);

// addInboxItem fires an immediate email for new high items. Keep it off the network.
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
test.after(() => { globalThis.fetch = realFetch; });

test("recording a payment closes its 'no payment recorded' item, and only that one", async () => {
  const db = fixture();
  const env = d1(db);
  await watchInvoices(env, ts("2026-10-20"));
  assert.equal(pending(db).filter((p) => p.target_type === "invoice_overdue").length, 2);

  db.prepare("UPDATE client_invoices SET paid_at = ?, status = 'paid' WHERE invoice_no = 'A-002'").run(ts("2026-10-21"));
  const r = await watchInvoices(env, ts("2026-10-22"));
  assert.equal(r.resolved, 1);
  const left = pending(db).filter((p) => p.target_type === "invoice_overdue");
  assert.equal(left.length, 1);
  assert.match(left[0].title, /^A-003/);
});

test("a month's missing-invoice item closes when the invoice exists, and next month's still appears", async () => {
  const db = fixture();
  const env = d1(db);
  await watchInvoices(env, ts("2026-11-02"));
  assert.equal(pending(db).filter((p) => p.target_type === "invoice_missing").length, 1);

  db.prepare("INSERT INTO client_invoices VALUES ('A-004','client-a','2026-11',78534,?,?,NULL,'sent')").run(ts("2026-11-16"), ts("2026-11-02"));
  await watchInvoices(env, ts("2026-11-03"));
  assert.equal(pending(db).filter((p) => p.target_type === "invoice_missing").length, 0);

  // December, no invoice yet. The resolved November item must not swallow it.
  const dec = pending(db).length;
  await watchInvoices(env, ts("2026-12-02"));
  const missing = pending(db).filter((p) => p.target_type === "invoice_missing");
  assert.equal(missing.length, 1, `december reminder swallowed (pending before: ${dec})`);
  assert.match(missing[0].title, /2026-12/);
});
