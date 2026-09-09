import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotMissingAlert } from "../src/lib/readout-snapshot-alert.ts";
import { classifyAlert } from "../src/lib/alert-triage.ts";

/**
 * buildReadoutSnapshot has four guards that refuse to write rather than write
 * something wrong. All four returned a bare boolean the caller discarded, so
 * a refusal and a clean run looked identical from outside. The cost is dated:
 * the readout falls back to a legacy-shape row and renders wrong on the 25th.
 */

const NOW = 1788000000;
const alert = (reason: string, paying = false) =>
  snapshotMissingAlert({ clientSlug: "some-client", reason, paying, now: NOW });

test("REGRESSION: the alert lands in needs_you, not the routine lane", () => {
  // Without a triage entry this classifies as routine and is hidden behind
  // the "+N routine" counter in the briefing, which is the same silence.
  const t = classifyAlert("readout_snapshot_missing");
  assert.equal(t.lane, "needs_you");
  assert.equal(t.severity, "high");
});

test("each guard produces its own fix, not a generic failure message", () => {
  const fixes = new Set<string>();
  for (const r of ["no_owned_domain", "no_business_name", "no_runs_in_window", "no_recognized_engines"]) {
    const body = String(alert(r).binds[1]);
    assert.doesNotMatch(body, /unrecognized guard/, `${r} should be a known reason`);
    fixes.add(body);
  }
  assert.equal(fixes.size, 4, "four guards must not collapse to one message");
});

test("the business-name guard explains why a zero would be a lie", () => {
  const body = String(alert("no_business_name").binds[1]);
  assert.match(body, /measured by NAME/);
  assert.match(body, /0%/);
});

test("every body names the deadline consequence", () => {
  for (const r of ["no_owned_domain", "no_business_name", "no_runs_in_window", "no_recognized_engines"]) {
    assert.match(String(alert(r).binds[1]), /renders wrong on the 25th/);
  }
});

test("an unknown reason still alerts rather than throwing or going quiet", () => {
  const body = String(alert("something_new").binds[1]);
  assert.match(body, /unrecognized guard fired \(something_new\)/);
  assert.match(body, /worker logs/);
});

test("a paying client outranks the rest and says so in the title", () => {
  assert.equal(alert("no_owned_domain", true).binds[4], "high");
  assert.equal(alert("no_owned_domain", false).binds[4], "normal");
  assert.match(String(alert("no_owned_domain", true).binds[0]), /PAYING CLIENT/);
});

test("keyed per client so two clients cannot collide on the unique index", () => {
  const a = snapshotMissingAlert({ clientSlug: "client-a", reason: "no_owned_domain", paying: false, now: NOW });
  const b = snapshotMissingAlert({ clientSlug: "client-b", reason: "no_owned_domain", paying: false, now: NOW });
  assert.equal(a.binds[2], "readout:client-a");
  assert.notEqual(a.binds[2], b.binds[2]);
});

test("created_at is not bumped, so a three-week gap cannot look like today", () => {
  const { sql } = alert("no_runs_in_window");
  assert.match(sql, /ON CONFLICT \(kind, target_type, target_id\) DO UPDATE/);
  assert.doesNotMatch(sql.slice(sql.indexOf("DO UPDATE")), /created_at/);
});

test("bind count matches the placeholders", () => {
  const { sql, binds } = alert("no_owned_domain");
  assert.equal((sql.match(/\?/g) || []).length, binds.length);
});
