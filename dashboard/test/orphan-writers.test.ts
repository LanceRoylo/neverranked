import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A WRITER WITH NO READER IS A BUG THAT LOOKS LIKE SILENCE.
 *
 * Found repeatedly on 2026-09-08, in every corner of this codebase:
 *
 *   engine_failures   -- created that morning, no consumer wired. The engine
 *                        health check judged an empty rate over rows that only
 *                        exist when a call already succeeded, so an engine
 *                        refusing 399 calls in 7 days looked perfectly healthy.
 *   admin_inbox       -- the held-digest alert threw on a UNIQUE collision
 *                        every day from 2026-05-18 and landed in `catch {}`.
 *   email_delivery_log-- the only place a grader hold was recorded, and
 *                        nothing read it.
 *
 * Each was invisible for the same reason: the write succeeded, so nothing
 * failed, so nothing said anything. The cost is always paid later by whoever
 * needed the number.
 *
 * THIS TEST MAKES THE ASSUMPTION DECLARE ITSELF. A table written and never
 * read must be listed below WITH A REASON. Adding an entry takes a sentence.
 * Not being able to write that sentence is the finding.
 *
 * It also fails when a declaration goes STALE -- a table listed here that has
 * since gained a reader -- so the list cannot quietly rot into a suppression
 * file.
 */

const WRITE_ONLY_BY_DESIGN: Record<string, string> = {
  stripe_webhook_events:
    "Idempotency ledger. Deduped via INSERT ... ON CONFLICT DO NOTHING and the insert's own changed-row count, so the read IS the write's result. A SELECT here would be a second, racier way to ask the same question.",
  support_messages:
    "Secondary record. The support message is emailed on the line above; this row exists so a human can query the history in D1. No in-app surface reads it, deliberately.",
  outreach_send_log:
    "Append-only audit trail of unsubscribe actions. Written so the action is provable after the fact; the operative state lives in outreach_prospects_master.unsubscribed, which IS read.",
  audit_qa_runs:
    "QA sweep results, queried by hand in D1 when a sweep looks wrong. No product surface consumes it.",
  schema_audit_log:
    "Append-only record of schema audits, read by hand. Retained as evidence, not as state.",
  monitored_pages:
    "Written by the pages module ahead of a per-page monitoring surface that is not built. Listed here so it stays visible rather than looking finished.",
};

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) tsFiles(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

test("every table the app writes has a reader, or a declared reason it does not", () => {
  const files = tsFiles("src");
  const written = new Map<string, Set<string>>();
  const referenced = new Map<string, Set<string>>();

  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([A-Za-z_][A-Za-z0-9_]*)/gi)) {
      const t = m[1].toLowerCase();
      if (!written.has(t)) written.set(t, new Set());
      written.get(t)!.add(f);
    }
    for (const m of src.matchAll(/UPDATE\s+([A-Za-z_][A-Za-z0-9_]*)\s+SET/gi)) {
      const t = m[1].toLowerCase();
      if (!written.has(t)) written.set(t, new Set());
      written.get(t)!.add(f);
    }
    // Any non-write mention: SELECT ... FROM, JOIN, a subquery, a COUNT.
    for (const m of src.matchAll(/(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi)) {
      const t = m[1].toLowerCase();
      if (!referenced.has(t)) referenced.set(t, new Set());
      referenced.get(t)!.add(f);
    }
  }

  assert.ok(written.size > 50, `expected to find the app's writes, found ${written.size}`);

  const orphans = [...written.keys()].filter((t) => !referenced.has(t)).sort();
  const undeclared = orphans.filter((t) => !(t in WRITE_ONLY_BY_DESIGN));

  assert.deepEqual(
    undeclared,
    [],
    `These tables are written and never read. Wire a reader, or add an entry to ` +
      `WRITE_ONLY_BY_DESIGN saying why nobody needs to: ${undeclared.join(", ")}`,
  );

  // A declaration that is no longer true is worse than none: it tells the next
  // reader that silence here is intended when it no longer is.
  const stale = Object.keys(WRITE_ONLY_BY_DESIGN).filter((t) => !orphans.includes(t)).sort();
  assert.deepEqual(
    stale,
    [],
    `These are listed as write-only but now have a reader. Remove them from ` +
      `WRITE_ONLY_BY_DESIGN: ${stale.join(", ")}`,
  );
});

test("every declared exemption gives a real reason, not a placeholder", () => {
  for (const [table, reason] of Object.entries(WRITE_ONLY_BY_DESIGN)) {
    assert.ok(reason.length > 60, `${table}: reason is too thin to be a decision`);
    assert.doesNotMatch(reason, /^(TODO|TBD|unused|n\/a|legacy)\b/i, `${table}: not a reason`);
  }
});
