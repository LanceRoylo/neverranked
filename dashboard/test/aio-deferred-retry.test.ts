/* Deferred second pass for Google AI Overview.
 *
 * 2026-10-05..11-05: 8 to 17 AIO calls a night still failed after the 2-second
 * retry with "40101 Internal SE Server Error", spread over 56 of 63 questions.
 * The nightly workflow now holds such a failure, waits, and asks again.
 * These tests pin the four promises that make that safe: a recovered reading is
 * written once and on the right day, a still-failing call lands in
 * engine_failures and never as an empty answer, and a failure can never be
 * dropped on the floor. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDeferredAioRetry, runOneKeywordCitations } from "../src/citations";
import {
  AIO_DEFER_DELAYS_SECONDS,
  deferralIsStale,
  shouldDeferAio,
  type DeferredAioFailure,
} from "../src/lib/aio-deferred-retry";
import type { Env } from "../src/types";

const SE_ERROR = { status_code: 20000, tasks: [{ status_code: 40101, status_message: "Internal SE Server Error." }] };
const PAY = { status_code: 40200, status_message: "Payment Required." };
const OK_EMPTY = { status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] };
const OK_AIO = {
  status_code: 20000,
  tasks: [{ status_code: 20000, result: [{ items: [{
    type: "ai_overview",
    text: "An overview that cites a source.",
    references: [{ url: "https://example.com/page", source: "Example" }],
  }] }] }],
};
const OK_BING = {
  status_code: 20000,
  tasks: [{ status_code: 20000, result: [{ items: [{
    type: "organic", rank_absolute: 1, title: "A result", url: "https://example.org/", domain: "example.org",
  }] }] }],
};

type Write = { sql: string; args: unknown[] };

/** Records every write; answers reads from a small table of SQL fragments. */
function fakeEnv(opts: { existingAioRow?: boolean; keywordActive?: boolean } = {}) {
  const writes: Write[] = [];
  const answer = (sql: string): unknown => {
    if (sql.includes("FROM citation_keywords")) {
      return opts.keywordActive === false ? null : { id: 7, client_slug: "c", keyword: "test question", active: 1 };
    }
    if (sql.includes("FROM citation_runs")) return opts.existingAioRow ? { id: 1 } : null;
    if (sql.includes("FROM domains")) return { domain: "example.com" };
    return null;
  };
  const env = {
    DATAFORSEO_LOGIN: "x",
    DATAFORSEO_PASSWORD: "y",
    DB: {
      prepare(sql: string) {
        const stmt = (args: unknown[]) => ({
          first: async () => answer(sql),
          run: async () => { writes.push({ sql, args }); return { meta: { last_row_id: 1, changes: 1 } }; },
          all: async () => ({ results: [] }),
        });
        return { ...stmt([]), bind: (...args: unknown[]) => stmt(args) };
      },
    },
  } as unknown as Env;
  const rows = () => writes.filter((w) => w.sql.includes("INSERT INTO citation_runs"));
  const failures = () => writes.filter((w) => w.sql.includes("INSERT INTO engine_failures"));
  return { env, writes, rows, failures };
}

/** Routes DataForSEO calls by endpoint; each endpoint replays its own sequence. */
async function withFetch<T>(seq: { google?: unknown[]; bing?: unknown[] }, fn: () => Promise<T>) {
  const real = globalThis.fetch;
  const calls = { google: 0, bing: 0 };
  globalThis.fetch = (async (url: string | URL | Request) => {
    const which = String(url).includes("/serp/bing/") ? "bing" : "google";
    const list = seq[which] ?? [OK_EMPTY];
    const body = list[Math.min(calls[which], list.length - 1)];
    calls[which]++;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  try { return { r: await fn(), calls }; } finally { globalThis.fetch = real; }
}

const nowSec = () => Math.floor(Date.now() / 1000);
const deferred = (overrides: Partial<DeferredAioFailure> = {}): DeferredAioFailure => ({
  keyword: "test question",
  status: 200,
  detail: "after retry: DataForSEO 40101: Internal SE Server Error.",
  firstAttemptAt: nowSec() - 1,
  ...overrides,
});
const utcDay = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

test("a deferred pass that gets an answer writes exactly one reading, stamped today", async () => {
  const f = fakeEnv();
  const d = deferred();
  const { r, calls } = await withFetch({ google: [OK_AIO] }, () => runDeferredAioRetry(f.env, "c", 7, d, false));
  assert.equal(r.outcome, "recovered");
  assert.equal(calls.google, 1);
  assert.equal(f.rows().length, 1);
  assert.equal(f.failures().length, 0, "a recovered call is not also a failure");
  const runAt = f.rows()[0].args[8] as number;
  assert.ok(runAt >= d.firstAttemptAt, "stamped with when it was read, never backdated");
  assert.equal(utcDay(runAt), utcDay(d.firstAttemptAt), "same UTC run day as the sweep attempt");
  assert.equal(f.rows()[0].args[0], 7);
});

test("a replayed step never writes the reading twice", async () => {
  const f = fakeEnv({ existingAioRow: true });
  const { r, calls } = await withFetch({ google: [OK_AIO] }, () => runDeferredAioRetry(f.env, "c", 7, deferred(), true));
  assert.equal(r.outcome, "already_recorded");
  assert.equal(calls.google, 0, "does not even ask DataForSEO again");
  assert.equal(f.writes.length, 0);
});

test("still failing on a non-final pass: handed on, nothing recorded yet", async () => {
  const f = fakeEnv();
  const { r } = await withFetch({ google: [SE_ERROR, SE_ERROR] }, () => runDeferredAioRetry(f.env, "c", 7, deferred(), false));
  assert.equal(r.outcome, "still_deferred");
  assert.ok(r.deferred, "the next pass gets the deferral");
  assert.equal(f.writes.length, 0);
});

test("still failing on the final pass: recorded in engine_failures, never an empty answer", async () => {
  const f = fakeEnv();
  const { r } = await withFetch({ google: [SE_ERROR, SE_ERROR] }, () => runDeferredAioRetry(f.env, "c", 7, deferred(), true));
  assert.equal(r.outcome, "failed");
  assert.equal(f.rows().length, 0, "no citation_runs row for a call that did not complete");
  assert.equal(f.failures().length, 1);
  const [engine, , keyword, detail] = f.failures()[0].args as [string, number, string, string];
  assert.equal(engine, "google_ai_overview");
  assert.equal(keyword, "test question");
  assert.match(detail, /^deferred retry: after retry: DataForSEO 40101/);
});

test("a billing refusal on the deferred pass is recorded at once, not deferred again", async () => {
  const f = fakeEnv();
  const { r, calls } = await withFetch({ google: [PAY] }, () => runDeferredAioRetry(f.env, "c", 7, deferred(), false));
  assert.equal(r.outcome, "failed");
  assert.equal(calls.google, 1, "billing is never retried");
  assert.equal(f.failures().length, 1);
});

test("a completed call with no overview is a real empty answer: no row, no failure", async () => {
  const f = fakeEnv();
  const { r } = await withFetch({ google: [OK_EMPTY] }, () => runDeferredAioRetry(f.env, "c", 7, deferred(), false));
  assert.equal(r.outcome, "empty");
  assert.equal(f.writes.length, 0);
});

test("past the run's UTC day it records the original failure instead of reading late", async () => {
  const f = fakeEnv();
  const d = deferred({ firstAttemptAt: nowSec() - 2 * 86400 });
  const { r, calls } = await withFetch({ google: [OK_AIO] }, () => runDeferredAioRetry(f.env, "c", 7, d, false));
  assert.equal(r.outcome, "stale");
  assert.equal(calls.google, 0);
  assert.equal(f.rows().length, 0);
  assert.equal(f.failures().length, 1);
  assert.equal(f.failures()[0].args[3], d.detail);
});

test("a keyword deactivated in the meantime still has its failure recorded", async () => {
  const f = fakeEnv({ keywordActive: false });
  const { r } = await withFetch({ google: [OK_AIO] }, () => runDeferredAioRetry(f.env, "c", 7, deferred(), false));
  assert.equal(r.outcome, "keyword_gone");
  assert.equal(f.failures().length, 1);
});

test("sweep path: a transient AIO failure is handed to the workflow, not recorded", async () => {
  const f = fakeEnv();
  const { r } = await withFetch({ google: [SE_ERROR, SE_ERROR], bing: [OK_BING] },
    () => runOneKeywordCitations(f.env, "c", 7, { deferTransientAio: true }));
  assert.equal(r.ok, true);
  assert.ok(r.deferredAio, "deferral returned");
  assert.match(r.deferredAio!.detail, /40101/);
  assert.ok(r.deferredAio!.firstAttemptAt <= nowSec());
  assert.equal(f.failures().length, 0, "recorded later, by the final pass, so it is never counted twice");
  assert.equal(f.rows().length, 1, "bing's row only");
});

test("manual path (no deferral): the failure is recorded immediately, as before", async () => {
  const f = fakeEnv();
  const { r } = await withFetch({ google: [SE_ERROR, SE_ERROR], bing: [OK_BING] },
    () => runOneKeywordCitations(f.env, "c", 7));
  assert.equal(r.deferredAio, undefined);
  assert.equal(f.failures().length, 1);
});

test("if the step is going to throw, the deferred failure is recorded now so it cannot vanish", async () => {
  const f = fakeEnv();
  const { r } = await withFetch({ google: [SE_ERROR, SE_ERROR], bing: [OK_EMPTY] },
    () => runOneKeywordCitations(f.env, "c", 7, { deferTransientAio: true }));
  assert.equal(r.ok, false, "zero rows: the workflow step will throw");
  assert.equal(r.deferredAio, undefined);
  const aio = f.failures().filter((w) => w.args[0] === "google_ai_overview");
  assert.equal(aio.length, 1);
});

test("only transient failures are deferred, and never on the final pass", () => {
  assert.ok(shouldDeferAio({ status: 200, detail: "after retry: DataForSEO 40101: Internal SE Server Error." }, false));
  assert.ok(shouldDeferAio({ status: 0, detail: "after retry: DataForSEO fetch error: reset" }, false));
  assert.ok(!shouldDeferAio({ status: 200, detail: "after retry: DataForSEO 40101: Internal SE Server Error." }, true));
  assert.ok(!shouldDeferAio({ status: 200, detail: "DataForSEO 40200: Payment Required." }, false));
  assert.ok(!shouldDeferAio({ status: 401, detail: "DataForSEO HTTP 401: unauthorized" }, false));
  assert.ok(!shouldDeferAio(undefined, false));
});

test("the last sweep keyword's final deferred pass still lands on the same UTC day", () => {
  // The sweep's last AIO call starts about 06:41 UTC. Add every deferral wait
  // plus generous slack for step retries and the calls themselves.
  const lastAttempt = Date.UTC(2026, 10, 4, 6, 41) / 1000;
  const total = AIO_DEFER_DELAYS_SECONDS.reduce((a, b) => a + b, 0) + 3600;
  assert.equal(deferralIsStale(lastAttempt, lastAttempt + total), false);
  assert.equal(deferralIsStale(Date.UTC(2026, 10, 4, 23, 59) / 1000, Date.UTC(2026, 10, 5, 0, 1) / 1000), true);
});
