import { test } from "node:test";
import assert from "node:assert";
import { checkAtlasCap } from "../src/routes/atlas-chat.ts";

// Fake env whose atlas_messages COUNT returns fixed day/month tallies.
function envWithCounts(day_n: number, month_n: number) {
  return {
    DB: {
      prepare() {
        return { bind() { return { async first() { return { day_n, month_n }; } }; } };
      },
    },
  } as any;
}

test("under both caps -> no cap message (null)", async () => {
  assert.equal(await checkAtlasCap(envWithCounts(5, 40), "acme"), null);
});

test("at the daily cap (20) -> returns the daily limit message", async () => {
  const msg = await checkAtlasCap(envWithCounts(20, 50), "acme");
  assert.ok(msg && /today's limit of 20/.test(msg), "expected daily-limit message");
});

test("under daily but at monthly cap (200) -> returns the monthly limit message", async () => {
  const msg = await checkAtlasCap(envWithCounts(3, 200), "acme");
  assert.ok(msg && /this month's limit of 200/.test(msg), "expected monthly-limit message");
});

test("just under the daily cap (19) -> still allowed", async () => {
  assert.equal(await checkAtlasCap(envWithCounts(19, 100), "acme"), null);
});
