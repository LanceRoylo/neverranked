import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashQuerySet,
  recordQuerySetVersion,
  querySetAt,
} from "../src/lib/query-set.ts";

/**
 * The hash and change log the published methodology page promises.
 *
 * Before 2026-09-06 the page said customer question sets were frozen and
 * hash-locked. Neither was implemented on the customer side, and because
 * citation_keywords has no updated_at and no log, a deactivation erased
 * itself. Reconstructing what a set used to be required joining against run
 * data, and was impossible once those runs aged out.
 */

function mockEnv(opts: {
  keywords: string[];
  latest?: { set_hash: string; keywords_json: string; question_count: number } | null;
  history?: Array<{ set_hash: string; question_count: number; keywords_json: string; observed_at: number }>;
}) {
  const inserts: unknown[][] = [];
  const DB = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (/FROM query_set_versions/.test(sql) && /observed_at <= \?/.test(sql)) {
                const at = Number(args[1]);
                const rows = (opts.history || []).filter((h) => h.observed_at <= at);
                return rows.length ? rows[rows.length - 1] : null;
              }
              if (/FROM query_set_versions/.test(sql)) return opts.latest ?? null;
              return null;
            },
            async all() {
              if (/FROM citation_keywords/.test(sql)) {
                return { results: opts.keywords.map((k) => ({ keyword: k })) };
              }
              return { results: [] };
            },
            async run() {
              if (/INSERT INTO query_set_versions/.test(sql)) inserts.push(args);
              return {};
            },
          };
        },
      };
    },
  };
  return { env: { DB } as never, inserts };
}

test("hash is order-independent and whitespace-stable", async () => {
  const a = await hashQuerySet(["best hotel waikiki", "oahu resort with pool"]);
  const b = await hashQuerySet(["oahu resort with pool", "  best hotel waikiki  "]);
  assert.equal(a, b, "reordering or padding must not read as a content change");
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("hash MOVES when a question is added or removed", async () => {
  const base = await hashQuerySet(["q one", "q two"]);
  assert.notEqual(await hashQuerySet(["q one", "q two", "q three"]), base);
  assert.notEqual(await hashQuerySet(["q one"]), base);
  // The prince-waikiki case: 18 questions, then 30 the next day.
  const before = await hashQuerySet(Array.from({ length: 18 }, (_, i) => `question ${i}`));
  const after = await hashQuerySet(Array.from({ length: 30 }, (_, i) => `question ${i}`));
  assert.notEqual(before, after);
});

test("first observation records a baseline and is flagged as such", async () => {
  const { env, inserts } = mockEnv({ keywords: ["a question", "b question"], latest: null });
  const res = await recordQuerySetVersion(env, "prince-waikiki");
  assert.ok(res);
  assert.equal(res!.changed, true);
  assert.equal(res!.first, true, "a baseline must not be alertable as drift");
  assert.equal(res!.count, 2);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0][5], null, "prev_hash is null on a baseline");
});

test("an unchanged set writes NOTHING (safe on a daily cron)", async () => {
  const keywords = ["a question", "b question"];
  const hash = await hashQuerySet(keywords);
  const { env, inserts } = mockEnv({
    keywords,
    latest: { set_hash: hash, keywords_json: JSON.stringify([...keywords].sort()), question_count: 2 },
  });
  const res = await recordQuerySetVersion(env, "prince-waikiki");
  assert.equal(res!.changed, false);
  assert.equal(inserts.length, 0, "idempotence broken; the log would fill with duplicates");
});

test("a change records an exact diff, both directions", async () => {
  const prevKeywords = ["kept one", "kept two", "dropped one"];
  const prevHash = await hashQuerySet(prevKeywords);
  const { env, inserts } = mockEnv({
    keywords: ["kept one", "kept two", "added one", "added two"],
    latest: { set_hash: prevHash, keywords_json: JSON.stringify([...prevKeywords].sort()), question_count: 3 },
  });
  const res = await recordQuerySetVersion(env, "hawaii-theatre");
  assert.equal(res!.changed, true);
  assert.equal(res!.first, false);
  assert.deepEqual(res!.added.sort(), ["added one", "added two"]);
  assert.deepEqual(res!.removed, ["dropped one"]);
  assert.equal(inserts[0][5], prevHash, "prev_hash must chain to the previous version");
});

test("an EMPTY active set is refused rather than recorded as a baseline", async () => {
  // A zero-question set is a misconfiguration or a partial write, never a real
  // engagement state. Recording it would poison every later diff against it.
  const { env, inserts } = mockEnv({ keywords: [], latest: null });
  const res = await recordQuerySetVersion(env, "prince-waikiki");
  assert.equal(res, null);
  assert.equal(inserts.length, 0);
});

test("querySetAt answers what the set WAS, which is the question the audit could not", async () => {
  const history = [
    { set_hash: "aaa", question_count: 18, keywords_json: JSON.stringify(["q1"]), observed_at: 1000 },
    { set_hash: "bbb", question_count: 30, keywords_json: JSON.stringify(["q1", "q2"]), observed_at: 2000 },
  ];
  const { env } = mockEnv({ keywords: [], history });
  assert.equal((await querySetAt(env, "prince-waikiki", 1500))!.question_count, 18);
  assert.equal((await querySetAt(env, "prince-waikiki", 2500))!.question_count, 30);
  assert.equal(await querySetAt(env, "prince-waikiki", 500), null, "no claim before the first record");
});
