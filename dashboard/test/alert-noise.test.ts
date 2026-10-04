/* 89 alerts in the 30 days to 2026-10-04, about 10 of which needed a human.
 *
 * Three causes: notices filed as alerts (auto-completions, deploys,
 * recoveries), monitors still watching the retired laptop / bridge / injection
 * systems, and our own decisions echoing back. The briefing subject counted
 * every unread row ("20 alerts") although its own body already split out what
 * needs you. These tests hold the rule: an alert is something only Lance can
 * act on, about the system as it runs, and nothing here may hide a client's
 * own good news from the client.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyAlert, isConcernType } from "../src/lib/alert-triage";

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("notices are activity, not needs-you", () => {
  for (const t of ["auto_completed", "deploy", "engine_recovered", "phase_completed_2", "grade_reached_A", "first_citation", "milestone"]) {
    assert.equal(classifyAlert(t).lane, "activity", t);
  }
});

test("a memo waiting for review is work, not a notice", () => {
  // A paid deliverable. Filed as routine, the 09-24 notice sat unread 10 days.
  assert.equal(classifyAlert("memo_drafts_ready").lane, "needs_you");
});

test("an unknown type still defaults to needs-you", () => {
  assert.ok(isConcernType("some_brand_new_alert"));
});

test("the briefing subject counts what needs you, not every unread row", () => {
  const src = read("../src/automation.ts");
  const subject = src.slice(src.indexOf("const subject = `Briefing:"), src.indexOf("const subject = `Briefing:") + 500);
  assert.match(subject, /needsYouCount/);
  assert.doesNotMatch(subject, /unreadAlertCount > 0 \? `, \$\{unreadAlertCount\} alert/);
});

test("admin counters use the needs-you count", () => {
  assert.match(read("../src/routes/health.ts"), /countNeedsYouAlerts\(env\)/);
  assert.match(read("../src/lib/weekly-summary-email.ts"), /filter\(\(r\) => isConcernType\(r\.type\)\)/);
  assert.match(read("../src/routes/home.ts"), /if \(isConcernType\(a\.type\)\)/);
});

test("a client's own badge is untouched: notices still reach the client", () => {
  // Read state is shared between admin and client. Pre-reading a client's
  // milestone would hide good news from the client, so the fix is applied to
  // admin counters only and this query must stay as it is.
  assert.match(read("../src/index.ts"), /SELECT type FROM admin_alerts WHERE client_slug = \? AND read_at IS NULL/);
});

test("no fix hint tells a reader to run the bridge without checking snapshot_source", () => {
  // The 2026-09-23 bridge run switched off 12 of a paying client's questions.
  const triage = classifyAlert("monthly_refresh_overdue").fixHint;
  assert.match(triage, /snapshot_source/);
  assert.match(triage, /NEVER run the dryrun bridge/);
  const hub = read("../src/routes/hub.ts");
  for (const m of hub.matchAll(/fix: `URGENT, customer-facing[^`]*`/g)) {
    if (/bridge/.test(m[0])) assert.match(m[0], /snapshot_source/, "hub fix mentions the bridge without the guard");
  }
});

test("the drift sweep only chases snippets that would do something", () => {
  const cron = read("../src/cron.ts");
  const fn = cron.slice(cron.indexOf("export async function runSchemaDriftSweep"));
  assert.match(fn.slice(0, 1500), /JOIN injection_configs ic ON ic\.client_slug = d\.client_slug AND ic\.enabled = 1/);
});
