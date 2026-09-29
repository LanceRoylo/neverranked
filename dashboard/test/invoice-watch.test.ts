/* Nobody was asking whether the invoice went out, or whether it was paid.
 *
 * NR-PW-002 was sent 2026-09-04 for $785.34 net 15, due 09-16. On 09-29,
 * thirteen days past due, no record of receipt existed in this database or in
 * the docs repo. The SEND was documented forensically: gates checked, PDF
 * verified from its own text, measurement confirmed real before billing. The
 * receipt was documented nowhere.
 *
 * The wording of these alerts is load-bearing and is what most of this file
 * tests. "We have not recorded a payment" and "they have not paid" are
 * different statements about a customer, and only one of them is ours to make.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ISSUE_DAY, OVERDUE_GRACE_DAYS } from "../src/lib/invoice-watch";

const SRC = fs.readFileSync(new URL("../src/lib/invoice-watch.ts", import.meta.url), "utf8");
const MIG = fs.readFileSync(new URL("../migrations/0127_client_invoices.sql", import.meta.url), "utf8");
const CRON = fs.readFileSync(new URL("../src/cron.ts", import.meta.url), "utf8");

test("an unrecorded payment is never called an unpaid one", () => {
  assert.match(SRC, /does NOT mean the client has not paid/);
  assert.match(SRC, /nothing here records that they have/);
  // The title must describe our record, not their conduct.
  assert.match(SRC, /no payment recorded/);
  assert.doesNotMatch(SRC, /has not paid`/, "no alert title may assert non-payment");
});

test("NULL paid_at is documented as unknown, not as unpaid", () => {
  assert.match(MIG, /NULL means unknown, NOT unpaid/);
  assert.match(MIG, /paid_at is NULL meaning UNRECORDED, not unpaid/);
});

test("only customers who actually owe money are chased", () => {
  // A $0 pilot has nothing to invoice. Raising a monthly item for one is the
  // noise that buries the real alert.
  assert.match(SRC, /status IN \('active'\)[\s\S]*?mrr_cents > 0/);
});

test("a void invoice does not satisfy the month", () => {
  // NR-PW-001 exists and is void. It must not make 2026-07 look invoiced.
  assert.match(SRC, /status <> 'void'/);
});

test("overdue has a grace period so it does not fire on the due date", () => {
  assert.equal(OVERDUE_GRACE_DAYS, 3);
  assert.equal(ISSUE_DAY, 1);
  assert.match(SRC, /now - OVERDUE_GRACE_DAYS \* 86_400/);
});

test("only invoices actually sent can be overdue", () => {
  // A generated PDF is not an issued invoice. NR-PW-003 exists as a draft and
  // must not be chased before it goes out.
  assert.match(SRC, /status = 'sent'/);
  assert.match(MIG, /NULL until it actually goes to the client\. Generating a PDF is not issuing/);
});

test("the backfill records what is known and admits what is not", () => {
  assert.match(MIG, /'NR-PW-001'[\s\S]*?'void'/, "001 was never sendable");
  assert.match(MIG, /'NR-PW-002'[\s\S]*?78534[\s\S]*?'sent'/);
  assert.match(MIG, /'NR-PW-003'[\s\S]*?'draft'/);
  // 002's total must match the issued PDF exactly.
  assert.match(MIG, /75000, 3534, 78534/);
});

test("it runs on the daily cron with a real status literal", () => {
  assert.match(CRON, /watchInvoices/);
  assert.match(CRON, /"invoice_watch", "failure"/);
  assert.doesNotMatch(CRON, /"invoice_watch", "error"/);
  assert.match(CRON, /missing=\$\{r\.missing\.length\} overdue=\$\{r\.overdue\.length\}/);
});

test("the reminder tells you the exact command to run", () => {
  // The invoice exists only because somebody remembers to run the script.
  assert.match(SRC, /render-invoice\.mjs \$\{c\.client_slug\} \$\{period\}/);
});
