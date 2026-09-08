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
            if (sql.includes("citation_runs")) return opts.engine ?? { rows_24h: 0, fails_24h: 0 };
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
