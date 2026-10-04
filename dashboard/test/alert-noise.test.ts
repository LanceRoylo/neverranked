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
  assert.match(subject, /totalNeedsYou/);
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

/* Step 3, 2026-10-04: one email a day. A normal morning was a briefing (8pm
 * Honolulu), an "N items need your attention" email (7am) and a per-item
 * "Action:" email for every high item, re-sent each time its producer fired. */
test("a high inbox item emails once, when it is new, not on every re-fire", () => {
  const src = read("../src/admin-inbox.ts");
  assert.match(src, /RETURNING id, created_at/);
  assert.match(src, /const isNew = result\?\.created_at === now;/);
  assert.match(src, /if \(urgency === "high" && isNew\)/);
});

test("the briefing is the one daily email, sent at 17:00 UTC, with the inbox inside", () => {
  const idx = read("../src/index.ts");
  const at17 = idx.slice(idx.indexOf('cron === "0 17 * * *"'), idx.indexOf('cron === "0 17 * * *"') + 2500);
  assert.match(at17, /maybeSendAutomationDigest\(env\)/);
  assert.match(at17, /else \{\s*await sendInboxMorningSummary\(env\);/, "inbox summary only as the fallback");
  const cron = read("../src/cron.ts");
  assert.doesNotMatch(cron.replace(/\/\/.*$/gm, ""), /maybeSendAutomationDigest\(/, "no second send from the 06:00 run");
  const auto = read("../src/automation.ts");
  assert.match(auto, /getPendingInbox\(env, 10\)/);
  assert.match(auto, /nothing needs you/);
  assert.doesNotMatch(auto, /if \(automationTotal === 0 && unreadAlertCount === 0 && scanFailures === 0\) \{\s*return;/, "a quiet day still sends: silence must mean broken");
});

test("the first 17:00 send after the move is not blocked by the 06:03 one", () => {
  // Last send 2026-10-04 06:03:36 UTC, next 17:00 UTC: 10.9h apart.
  const src = read("../src/automation.ts");
  const m = src.match(/now - settings\.lastDigestSentAt < (\d+) \* 3600/);
  assert.ok(m, "guard missing");
  assert.ok(Number(m[1]) < 10.9, `a ${m[1]}h guard blocks the first 17:00 briefing`);
});
