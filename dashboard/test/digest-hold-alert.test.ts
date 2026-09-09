import { test } from "node:test";
import assert from "node:assert/strict";
import { holdInboxUpsert, holdUrgency } from "../src/lib/digest-hold-alert.ts";

/**
 * The statement these tests cover threw on every execution from 2026-05-18
 * to 2026-09-08 and nobody knew, because it was inline, its failure was
 * caught by `catch {}`, and nothing asserted it worked. One row exists
 * all-time against 100+ real holds.
 *
 * So the first test is the one that matters: two different clients must
 * not collide on the same unique key.
 */

const input = (over: Partial<Parameters<typeof holdInboxUpsert>[0]> = {}) =>
  holdInboxUpsert({
    clientSlug: "hawaii-theatre",
    recipient: "greg@example.com",
    paying: false,
    voicePass: true,
    substancePass: false,
    issues: ["Empty section", "No signal"],
    now: 1788000000,
    ...over,
  });

test("REGRESSION: two clients do not collide on admin_inbox's unique key", () => {
  // UNIQUE(kind, target_type, target_id). kind is constant and target_id is
  // 0, so target_type is the ONLY field that can separate two clients. The
  // old code passed the literal 'digest' here for everyone.
  const a = input({ clientSlug: "hawaii-theatre" });
  const b = input({ clientSlug: "prince-waikiki" });
  const targetTypeOf = (s: ReturnType<typeof input>) =>
    s.binds[2];
  assert.equal(targetTypeOf(a), "digest:hawaii-theatre");
  assert.equal(targetTypeOf(b), "digest:prince-waikiki");
  assert.notEqual(targetTypeOf(a), targetTypeOf(b), "two clients MUST NOT share a key");
  assert.notEqual(targetTypeOf(a), "digest", "the constant that caused the collision");
});

test("a repeat hold updates the existing row instead of throwing", () => {
  const { sql } = input();
  assert.match(sql, /ON CONFLICT \(kind, target_type, target_id\) DO UPDATE/);
  // A hold that recurs after someone resolved the row must reopen it.
  assert.match(sql, /status\s*=\s*'pending'/);
  assert.match(sql, /resolved_at\s*=\s*NULL/);
});

test("created_at is never overwritten, so a chronic hold cannot look fresh", () => {
  const { sql } = input();
  const onConflict = sql.slice(sql.indexOf("DO UPDATE"));
  assert.doesNotMatch(
    onConflict,
    /created_at/,
    "bumping created_at makes a six-day outage read as one day old",
  );
});

test("a paying client outranks an unpaid beta", () => {
  assert.equal(holdUrgency(true), "high");
  assert.equal(holdUrgency(false), "normal");
  assert.equal(input({ paying: true }).binds[4], "high");
  assert.equal(input({ paying: false }).binds[4], "normal");
});

test("a paying client's row says so in the title, where it gets scanned", () => {
  assert.match(String(input({ paying: true }).binds[0]), /PAYING CLIENT heard nothing/);
  assert.doesNotMatch(String(input({ paying: false }).binds[0]), /PAYING CLIENT/);
});

test("the body carries the current issues and dates the START of the holds", () => {
  const body = String(input().binds[1]);
  assert.match(body, /Empty section; No signal/);
  assert.match(body, /Still held as of 2026-\d\d-\d\d/);
  assert.match(body, /date is when the holds STARTED/);
});

test("bind count matches the placeholders in the statement", () => {
  // A silent arity mismatch is the other way this statement dies quietly.
  const { sql, binds } = input();
  assert.equal((sql.match(/\?/g) || []).length, binds.length);
});


/** The first alert this ever raised, on 2026-09-09, read
 *  "PAYING CLIENT heard nothing" about a pilot at $0 MRR. The caller decided
 *  `paying` from status IN ('active','pilot'), which is the provisioning test
 *  for "is this a real customer", not a revenue test. That collapsed the exact
 *  distinction this severity split exists to make. The helper below documents
 *  the rule the callers now use. */
const paysUs = (mrrCents: number, status: string) => mrrCents > 0 && status !== "churned";

test("REGRESSION: a $0 pilot is a real customer and is NOT a paying one", () => {
  assert.equal(paysUs(0, "pilot"), false);
  assert.equal(paysUs(0, "active"), false);
  assert.equal(paysUs(75000, "active"), true);
  assert.equal(paysUs(75000, "pilot"), true, "a paying pilot still pays");
  assert.equal(paysUs(75000, "churned"), false, "revenue that has stopped is not revenue");
});

test("the title follows the revenue answer, not the status", () => {
  assert.match(String(input({ paying: paysUs(75000, "active") }).binds[0]), /PAYING CLIENT heard nothing/);
  assert.doesNotMatch(String(input({ paying: paysUs(0, "pilot") }).binds[0]), /PAYING CLIENT/);
});
