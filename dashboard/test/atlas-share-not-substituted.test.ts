/* Atlas must never answer "what is my citation share" with the other share.
 *
 * On 2026-09-07 it did: venue_share_pct (owned citations over citations to
 * any venue in the cohort) read 12% on the dashboard while the chat said
 * 1.64%, because Atlas was handed citation_share (owned over EVERY cited URL,
 * a strictly larger denominator). Same words, 7.3x gap, no way for the
 * customer to tell which was wrong.
 *
 * That was fixed by naming the two fields distinctly. The fallback
 * `venueSharePct ?? sharePctOut` then reintroduced it: whenever the venue
 * share could not be computed, the field whose _units say "THE headline
 * figure" quietly carried the one they say never to present as it.
 *
 * Seventh absence-rendered-as-value this week, and the third copy of this
 * same line after the dashboard and memo-inputs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../src/lib/atlas-context.ts", import.meta.url), "utf8");

test("an uncomputed venue share is null, not the other share", () => {
  assert.doesNotMatch(SRC, /venue_share_pct: venueSharePct \?\? sharePctOut/,
    "the substituting fallback must not return");
  assert.match(SRC, /venue_share_pct: venueSharePct,/);
  assert.match(SRC, /venue_share_pct: number \| null;/, "the type must admit absence");
});

test("the units tell Atlas what null means and forbid the substitution", () => {
  // Anchor on the _units block, not on the phrase: the comment above the
  // field quotes it too, so indexOf found the comment and the slice never
  // reached the value. Third test today to match a comment instead of code.
  // Anchor forward from the ASSIGNMENT. The phrase appears in the comment
  // above it, and `_units: {` appears first in the type declaration, so both
  // naive anchors sliced the wrong region. Third test today to match
  // something other than the code it meant to check.
  const assign = SRC.indexOf("venue_share_pct: venueSharePct,");
  assert.ok(assign > 0, "the assignment must exist");
  const i = SRC.indexOf("_units: {", assign);
  assert.ok(i > assign, "the _units value must follow the assignment");
  const units = SRC.slice(i, i + 1600);
  assert.match(units, /If it is NULL/);
  assert.match(units, /do NOT substitute share_of_all_cited_sources_pct/);
});

test("the two shares stay separately named, which is what fixed it originally", () => {
  assert.match(SRC, /share_of_all_cited_sources_pct/);
  assert.match(SRC, /Never present it as their citation share/);
});

test("Atlas can only read memos the customer was actually sent", () => {
  // A draft is not a deliverable. Quoting one would hand the customer a
  // document that has not passed the delivery gate.
  const i = SRC.indexOf("FROM monthly_memos");
  assert.match(SRC.slice(i, i + 200), /delivered_at IS NOT NULL/);
});
