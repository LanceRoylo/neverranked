import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { liveClientSlugs } from "../src/lib/live-clients.ts";

/**
 * The 2026-09-10 briefing carried five operator alerts and every one was for
 * a slug with nobody to nudge: a paused sister brand and NeverRanked's own
 * roadmap. The two slugs that matter, prince-waikiki and hawaii-theatre,
 * produced none. Both sweeps grouped roadmap_items by client_slug and never
 * asked whether a customer existed.
 */
function fakeEnv(rows: Array<{ client_slug: string }>) {
  return {
    DB: {
      prepare(sql: string) {
        assert.match(sql, /FROM customers/, "must read the customers table");
        assert.match(sql, /status\s*!=\s*'churned'/, "must exclude churned");
        return { all: async () => ({ results: rows }) };
      },
    },
  } as never;
}

describe("who an operator alert can be about", () => {
  test("live customers are alertable, paid or not", async () => {
    const live = await liveClientSlugs(fakeEnv([
      { client_slug: "prince-waikiki" },
      { client_slug: "hawaii-theatre" },
    ]));
    assert.equal(live.has("prince-waikiki"), true);
    // Unpaid pilot on purpose: $0 is still a real person to nudge. The test
    // is whether a customer exists, not whether they pay.
    assert.equal(live.has("hawaii-theatre"), true);
  });

  test("a slug with no customers row is not alertable", async () => {
    const live = await liveClientSlugs(fakeEnv([{ client_slug: "prince-waikiki" }]));
    // and-scene has a domains row and a roadmap, and no customer.
    assert.equal(live.has("and-scene"), false);
    // neverranked measures itself. The alert text says "nudge the customer".
    assert.equal(live.has("neverranked"), false);
  });

  test("a failed read returns null, not an empty set", async () => {
    // The distinction is the whole point. An empty set silences every alert
    // and looks identical to a clean run with nothing to report, which is a
    // synthetic success. Null forces the caller to say it could not tell.
    const boom = { DB: { prepare() { throw new Error("D1 unavailable"); } } } as never;
    assert.equal(await liveClientSlugs(boom), null);
  });

  test("it never throws, because the sweeps sit in a bare await chain", async () => {
    // A throw here skips every later step of runDailyMaintenance for that
    // run. A partial run that looks finished is worse than a skipped sweep.
    const boom = { DB: { prepare() { throw new Error("D1 unavailable"); } } } as never;
    await assert.doesNotReject(() => liveClientSlugs(boom));
  });

  test("no customers means alert on nobody, not on everybody", async () => {
    // Fail in the quiet direction. A missed nudge costs less than an alert
    // lane the operator has learned to ignore.
    const live = await liveClientSlugs(fakeEnv([]));
    assert.equal(live.size, 0);
  });
});
