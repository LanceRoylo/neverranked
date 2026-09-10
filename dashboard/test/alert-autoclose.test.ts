import { test } from "node:test";
import assert from "node:assert/strict";
import { autoCloseAlerts } from "../src/lib/alert-autoclose.ts";

/**
 * The queue this fixes had a 143-hour-old "daily_tasks overdue" sitting
 * above two openai alerts of similar age that were entirely real. So the
 * property under test is not "does it close things", it is "does it refuse
 * to close anything whose condition still holds", including when the check
 * itself fails.
 */

type Row = Record<string, unknown>;

/** Minimal D1 stub: routes each prepared SQL to a canned answer. */
function makeEnv(opts: {
  open: Row[];
  cronLastRan?: number | null;
  engine?: { rows_24h: number; fails_24h: number };
  peer?: { engine: string; degraded: boolean }[];
  snapshot?: { engines_breakdown: string; top_competitors: string; created_at: number | null; week_start: number } | null;
  yesterday?: { runs: number };
  priorDays?: { runs: number; days: number };
  throwOnCheck?: boolean;
}) {
  const updates: { id: number; detail: string; readAt: number }[] = [];
  const env = {
    DB: {
      prepare(sql: string) {
        const st = {
          _b: [] as unknown[],
          bind(...b: unknown[]) { st._b = b; return st; },
          async all() { return { results: opts.open }; },
          async first() {
            if (opts.throwOnCheck) throw new Error("d1 exploded");
            if (sql.includes("cron_runs")) return { last_ran: opts.cronLastRan ?? null };
            if (sql.includes("COUNT(DISTINCT CAST(run_at")) return opts.priorDays ?? { runs: 0, days: 0 };
            if (sql.includes("COUNT(*) AS runs FROM citation_runs")) return opts.yesterday ?? { runs: 0 };
            if (sql.includes("citation_runs")) return opts.engine ?? { rows_24h: 0, fails_24h: 0 };
            if (sql.includes("citation_snapshots")) return opts.snapshot ?? null;
            return null;
          },
          async run() {
            updates.push({ id: st._b[2] as number, detail: st._b[1] as string, readAt: st._b[0] as number });
            return { success: true, meta: { changes: 1 } };
          },
        };
        return st;
      },
    },
  };
  return { env: env as never, updates };
}

const cronAlert = (id: number, task = "daily_tasks") => ({
  id, type: "anomaly_cron_overdue", created_at: 1787000000,
  detail: `cron:${task}:overdue | ${task} last ran 48.0h ago; expected cadence is every 24h.`,
});

const NOW = 1788000000;

test("REGRESSION: a cron alert closes once the task runs clean again", () => {
  // The 143h-old daily_tasks row. It ran 1.7h before the briefing.
  const { env, updates } = makeEnv({ open: [cronAlert(1)], cronLastRan: NOW - 3600 });
  return autoCloseAlerts(env, NOW).then((r) => {
    assert.equal(r.closed, 1);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].readAt, NOW);
  });
});

test("a task STILL overdue is left open", async () => {
  // Last clean run three days ago against a 24h cadence.
  const { env, updates } = makeEnv({ open: [cronAlert(1)], cronLastRan: NOW - 3 * 86400 });
  const r = await autoCloseAlerts(env, NOW);
  assert.equal(r.closed, 0);
  assert.equal(r.kept, 1);
  assert.equal(updates.length, 0, "must not touch a live alert");
});

test("evidence is APPENDED, never replacing the original detail", async () => {
  const { env, updates } = makeEnv({ open: [cronAlert(1)], cronLastRan: NOW - 3600 });
  await autoCloseAlerts(env, NOW);
  // The bound value is the fragment concatenated by SQL, and the statement
  // itself must be a concat rather than an assignment.
  assert.match(updates[0].detail, /^ \[auto-closed \d{4}-\d\d-\d\d: daily_tasks has run clean/);
});

test("an unknown task name keeps the alert, because its cadence is unknown", async () => {
  const { env } = makeEnv({ open: [cronAlert(1, "some_task_we_removed")], cronLastRan: NOW - 60 });
  const r = await autoCloseAlerts(env, NOW);
  assert.equal(r.closed, 0);
});

test("unparseable detail keeps the alert", async () => {
  const { env } = makeEnv({
    open: [{ id: 9, type: "anomaly_cron_overdue", created_at: 1, detail: "something else entirely" }],
    cronLastRan: NOW - 60,
  });
  const r = await autoCloseAlerts(env, NOW);
  assert.equal(r.closed, 0);
  assert.equal(r.kept, 1);
});

test("a probe alert needs BOTH rows landing and zero refusals", async () => {
  const probe = (id: number) => ({
    id, type: "instrument_probe_failed", created_at: 1,
    detail: "No response from: openai. The probe is one tiny call per engine.",
  });
  // openai's real September shape: rows landing AND calls being refused.
  const busy = makeEnv({ open: [probe(1)], engine: { rows_24h: 254, fails_24h: 399 } });
  assert.equal((await autoCloseAlerts(busy.env, NOW)).closed, 0, "rows alone must not clear it");
  // Genuinely recovered.
  const well = makeEnv({ open: [probe(1)], engine: { rows_24h: 120, fails_24h: 0 } });
  assert.equal((await autoCloseAlerts(well.env, NOW)).closed, 1);
});

test("a checker that THROWS keeps the alert open", async () => {
  const { env, updates } = makeEnv({ open: [cronAlert(1)], throwOnCheck: true });
  const r = await autoCloseAlerts(env, NOW);
  assert.equal(r.closed, 0);
  assert.equal(r.kept, 1);
  assert.equal(updates.length, 0, "an error is not evidence that a problem went away");
});

test("FAIL CLOSED: types with no closer are never selected at all", async () => {
  // The guarantee is structural: the SQL only asks for registered types.
  let asked = "";
  const env = {
    DB: { prepare(sql: string) { asked = sql; return {
      bind: () => ({ all: async () => ({ results: [] }) }),
    }; } },
  };
  await autoCloseAlerts(env as never, NOW);
  for (const t of ["negative_ai_mention", "citation_lost", "backup_failure", "snippet_drift"]) {
    assert.doesNotMatch(asked, new RegExp(t), `${t} must never be auto-closable`);
  }
  assert.match(asked, /read_at IS NULL/);
});


/** The refresh watchdog raises this type with TWO different sentences: one for
 *  a customer with zero snapshots, one for a customer whose snapshot went
 *  stale. A parser tuned to either would silently never close the other, so
 *  the subject comes from the client_slug column. */
const refreshAlert = (id: number, detail: string) => ({
  id, type: "monthly_refresh_overdue", created_at: 1787000000,
  client_slug: "a-client", detail,
});

const READOUT = {
  engines_breakdown: '{"Perplexity":{"share_pct":2,"total":10}}',
  top_competitors: '{"htc_venue_share_pct":12,"competitors":[]}',
};

test("REGRESSION: a refresh alert closes once a current-month snapshot lands", () => {
  // Raised 2026-09-04 when the newest snapshot was 2026-08-23. A September row
  // landed on the 7th and the alert sat in the needs-you lane regardless.
  const sept = Math.floor(Date.UTC(2026, 8, 7) / 1000);
  const now = Math.floor(Date.UTC(2026, 8, 9) / 1000);
  const { env, updates } = makeEnv({
    open: [refreshAlert(1, "This month's refresh has not landed (latest snapshot 2026-08-23).")],
    snapshot: { ...READOUT, created_at: sept, week_start: sept },
  });
  return autoCloseAlerts(env, now).then((r) => {
    assert.equal(r.closed, 1);
    assert.match(updates[0].detail, /a-client has a current-month readout snapshot again/);
  });
});

test("BOTH sentences of that alert close, because the slug comes from the column", () => {
  const sept = Math.floor(Date.UTC(2026, 8, 7) / 1000);
  const now = Math.floor(Date.UTC(2026, 8, 9) / 1000);
  const other = makeEnv({
    open: [refreshAlert(2, "A signed customer (a-client) has ZERO citation_snapshots rows.")],
    snapshot: { ...READOUT, created_at: sept, week_start: sept },
  });
  return autoCloseAlerts(other.env, now).then((r) => assert.equal(r.closed, 1));
});

test("a still-stale snapshot keeps the refresh alert open", async () => {
  const aug = Math.floor(Date.UTC(2026, 7, 23) / 1000);
  const now = Math.floor(Date.UTC(2026, 8, 9) / 1000);
  const { env } = makeEnv({
    open: [refreshAlert(1, "This month's refresh has not landed (latest snapshot 2026-08-23).")],
    snapshot: { ...READOUT, created_at: aug, week_start: aug },
  });
  assert.equal((await autoCloseAlerts(env, now)).closed, 0);
});

test("no snapshot at all is the HARDER version of the alert, never a reason to close", async () => {
  const now = Math.floor(Date.UTC(2026, 8, 9) / 1000);
  const { env } = makeEnv({ open: [refreshAlert(1, "has ZERO citation_snapshots rows.")], snapshot: null });
  assert.equal((await autoCloseAlerts(env, now)).closed, 0);
});

test("a LEGACY-shape snapshot does not count as a landed refresh", async () => {
  // The detector skips legacy rows, so treating one as evidence would let the
  // closer and the detector disagree about the same customer.
  const sept = Math.floor(Date.UTC(2026, 8, 7) / 1000);
  const now = Math.floor(Date.UTC(2026, 8, 9) / 1000);
  const { env } = makeEnv({
    open: [refreshAlert(1, "This month's refresh has not landed.")],
    snapshot: { engines_breakdown: '{"gemini":{"queries":10,"citations":2}}', top_competitors: "[]", created_at: sept, week_start: sept },
  });
  assert.equal((await autoCloseAlerts(env, now)).closed, 0);
});


/** Three of these sat unread from 2026-09-08 and every one was false: the rule
 *  measured a rolling window that cut through the daily sweep and reported all
 *  five engines as halved within one second. */
const rowDrop = (id: number, engine = "gemini") => ({
  id, type: "anomaly_engine_row_drop", created_at: 1787000000, client_slug: "_system",
  detail: `engine:${engine}:row_drop | ${engine} produced 33 rows yesterday vs 78 daily average.`,
});

test("REGRESSION: a row-drop alert closes once the engine is back to normal volume", async () => {
  const { env, updates } = makeEnv({
    open: [rowDrop(1)],
    yesterday: { runs: 93 },              // healthy
    priorDays: { runs: 1160, days: 14 },  // avg ~83, floor ~41
  });
  const r = await autoCloseAlerts(env, 1788912000);
  assert.equal(r.closed, 1);
  assert.match(updates[0].detail, /gemini is producing its normal daily row count again/);
});

test("an engine STILL below half its average keeps the alert", async () => {
  const { env } = makeEnv({
    open: [rowDrop(1)],
    yesterday: { runs: 20 },
    priorDays: { runs: 1160, days: 14 },
  });
  assert.equal((await autoCloseAlerts(env, 1788912000)).closed, 0);
});

test("too little history to judge is not evidence of recovery", async () => {
  // Fewer than 3 prior days with rows means the detector would not fire, and
  // it equally cannot say the drop is over.
  const { env } = makeEnv({
    open: [rowDrop(1)],
    yesterday: { runs: 93 },
    priorDays: { runs: 100, days: 2 },
  });
  assert.equal((await autoCloseAlerts(env, 1788912000)).closed, 0);
});
