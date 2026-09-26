/* A renewal alert must point at the person who decides.
 *
 * The comp marker carries the address the trial was provisioned under, and the
 * alert echoed only that under "Contact:". For hawaii-theatre that is Carl,
 * the marketing director, who is an advocate inside the account and also
 * co-owns Lance's other company. The CEO is on file as the primary contact and
 * has been reading the monthly memo since June. Pitching the champion feels
 * like progress and does not move a renewal. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const CRON = fs.readFileSync(new URL("../src/cron.ts", import.meta.url), "utf8");
// Slice forward from the function, not to the first "Annual recap" in the
// file: that string appears earlier too, which produced a backwards slice and
// four failures that looked like the code and were the test.
const fnStart = CRON.indexOf("export async function runCompExpiryCheck");
const block = CRON.slice(fnStart, CRON.indexOf("Annual recap", fnStart));

test("the alert looks up the decision-maker on file", () => {
  assert.match(block, /primary_contact_name AS name/);
  assert.match(block, /Decision-maker on file/);
});

test("the provisioning record is labelled as what it is", () => {
  assert.match(block, /who set the trial up, NOT necessarily who decides/);
  assert.doesNotMatch(block, /Marker detail: \$\{m\.detail\}/,
    "a bare marker echo reads as the person to contact");
});

test("a missing primary contact says so rather than falling back to the marker", () => {
  assert.match(block, /no recorded decision-maker to approach/);
});

test("all three windows carry it, not just the 30-day one", () => {
  const uses = block.match(/\$\{who\}\$\{marker\}/g) || [];
  assert.equal(uses.length, 3, `expired, 7-day and 30-day alerts, found ${uses.length}`);
});

test("a failed lookup never loses the alert", () => {
  assert.match(block, /\.catch\(\(\) => null\)/, "the renewal warning matters more than the name on it");
});
