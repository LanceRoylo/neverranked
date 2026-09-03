/**
 * forensicSnapshotIsCurrent vs isForensicManaged.
 *
 * The 2026-09-03 bug: prince-waikiki had ONE snapshot, from a free diagnostic
 * on 2026-06-26, bridged in before they were a client. It was readout-shaped,
 * so isForensicManaged returned true, so every Cloudflare sweep skipped the
 * snapshot write, waiting for a bridge that never runs for them. One leftover
 * row silently disabled the rollup that report-facts reads for
 * engines_breakdown and top_competitors.
 *
 * The two predicates MUST stay different. isForensicManaged gates onboarding
 * and routes clients to /c/<slug>/ -- making it recency-aware would have
 * redirected the affected client away from their own dashboard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { forensicSnapshotIsCurrent, isForensicManaged } from "../src/citations.ts";

const READOUT_EB = JSON.stringify({ Claude: { citations: 98, total: 741, share_pct: 13 } });
const LEGACY_EB = JSON.stringify({ claude: { queries: 741, citations: 98 } });
const TC = JSON.stringify({ competitors: [{ domain: "x.com" }] });
const DAY = 86400;
const nowSec = () => Math.floor(Date.now() / 1000);

const envWith = (row: Record<string, unknown> | null) => ({
  DB: { prepare: () => ({ bind: () => ({ first: async () => row }) }) },
}) as never;

test("stale readout-shape snapshot is NOT current (the prince-waikiki case)", async () => {
  const env = envWith({ engines_breakdown: READOUT_EB, top_competitors: TC, measured_at: nowSec() - 69 * DAY });
  assert.equal(await forensicSnapshotIsCurrent(env, "prince-waikiki"), false, "69 days old, nothing is maintaining it");
});

test("and isForensicManaged STILL returns true for it, so the cockpit route survives", async () => {
  const env = envWith({ engines_breakdown: READOUT_EB, top_competitors: TC, measured_at: nowSec() - 69 * DAY });
  assert.equal(await isForensicManaged(env, "prince-waikiki"), true,
    "must stay true or index.ts redirects the client away from /c/<slug>/");
});

test("a genuinely bridged client stays current (hawaii-theatre, 1.9 days)", async () => {
  const env = envWith({ engines_breakdown: READOUT_EB, top_competitors: TC, measured_at: nowSec() - 2 * DAY });
  assert.equal(await forensicSnapshotIsCurrent(env, "hawaii-theatre"), true);
});

test("run_days [1,11,21] gaps do not trip it: 12 days still counts as maintained", async () => {
  const env = envWith({ engines_breakdown: READOUT_EB, top_competitors: TC, measured_at: nowSec() - 12 * DAY });
  assert.equal(await forensicSnapshotIsCurrent(env, "bridged"), true, "a late bridge must not lose its snapshot");
});

test("a legacy-shape snapshot is never 'current', however fresh", async () => {
  const env = envWith({ engines_breakdown: LEGACY_EB, top_competitors: "[]", measured_at: nowSec() });
  assert.equal(await forensicSnapshotIsCurrent(env, "legacy"), false);
});

test("no snapshot at all is not current", async () => {
  assert.equal(await forensicSnapshotIsCurrent(envWith(null), "brand-new"), false);
});

test("readout-shaped but NULL measured_at cannot be shown current, so it is not", async () => {
  const env = envWith({ engines_breakdown: READOUT_EB, top_competitors: TC, measured_at: null });
  assert.equal(await forensicSnapshotIsCurrent(env, "no-date"), false);
});
