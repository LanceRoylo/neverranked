/**
 * The bot pattern exists twice: the dashboard's copy and the scan Worker's
 * copy (two Workers cannot share code). The scan Worker classifies every
 * free-check call with its copy at write time, and the dashboard reads those
 * rows. If the copies drift, the two sides disagree about who is a person,
 * silently. So the files must be identical, byte for byte.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

test("dashboard and scan Worker bot-ua.ts are identical", () => {
  const dash = read("../src/lib/bot-ua.ts");
  const worker = read("../../tools/schema-check/src/bot-ua.ts");
  assert.equal(
    worker,
    dash,
    "tools/schema-check/src/bot-ua.ts and dashboard/src/lib/bot-ua.ts differ. Edit both, then copy one over the other.",
  );
});

test("the pattern catches the callers the old admin filter missed", async () => {
  const { isBotUserAgent } = await import("../src/lib/bot-ua.ts");
  for (const ua of ["neverranked-mcp/0.1.4", "NeverRanked-AuditTemplate/0.1", "node", "undici", "", "   ", "curl/8.7.1", "python-requests/2.31", "Mozilla/5.0 HeadlessChrome/120"]) {
    assert.equal(isBotUserAgent(ua), true, `should be a bot: ${JSON.stringify(ua)}`);
  }
  assert.equal(isBotUserAgent(undefined), true);
  assert.equal(
    isBotUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"),
    false,
  );
  assert.equal(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), false);
});
