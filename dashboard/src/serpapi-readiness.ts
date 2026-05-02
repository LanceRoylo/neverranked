/**
 * SerpApi readiness reminder.
 *
 * Background: Google AI Overviews are server-side rendered from Google
 * search results -- there's no public API. Every AEO competitor
 * (Profound, AthenaHQ, Otterly, etc.) tracks them via a third-party
 * SERP API. We deferred this on 2026-05-01 with the explicit gate:
 * turn it on once we have our first paying client. Lance's words:
 * "won't eat into my margins too much."
 *
 * This check runs daily and writes a HIGH-urgency admin_inbox row the
 * morning after the first paying client goes active. Idempotent via
 * UNIQUE(kind, target_type, target_id) on admin_inbox so the cron can
 * re-fire safely until you resolve it.
 *
 * To "complete" the setup later, write a row to automation_log with
 * kind = 'serpapi_setup_complete' (manually via SQL or via an admin
 * endpoint). After that, this function is a permanent no-op.
 *
 * The inbox body contains the full implementation spec so a future
 * Claude session (or you on a Tuesday morning) can read it and have
 * exactly what's needed to build PR 12 (Google AI Overviews coverage).
 */

import type { Env } from "./types";
import { addInboxItem } from "./admin-inbox";

const COMPLETE_FLAG_KIND = "serpapi_setup_complete";

const INBOX_BODY = `**Why this fired:** You have at least one paying client (non-trial, active). The SerpApi setup was gated to this moment on 2026-05-01. Time to wire it up.

---

**The gap.** Google AI Overviews and Google AI Mode are server-side rendered from Google search results. No public API exposes them. Every AEO competitor (Profound, AthenaHQ, Otterly) gets at this data via a third-party SERP API.

**Your three options:**

1. **SerpApi** — $50/mo for 5k searches, $130/mo for 15k. Most reliable, AI Overviews extraction baked in. **Recommended for our scale.**
2. **BrightData** — enterprise sales, ~$500+/mo. Most accurate, scales hard. Overkill until we have 20+ clients.
3. **DataForSEO** — $25-75/mo flexible. Cheapest, decent coverage, less polished AI Overview parsing.

**At our scale** (a handful of clients × ~20 keywords each × weekly cadence ~ 700 searches/week), SerpApi at $50/mo fits with headroom.

---

**Implementation spec (PR 12 from the 2026-05-01 plan):**

1. **Get the API key.** Sign up at serpapi.com, take the test/dev key. Store as Wrangler secret:
   \`wrangler secret put SERPAPI_API_KEY\` (run from \`/dashboard\` directory)

2. **Add to types.ts Env interface:**
   \`SERPAPI_API_KEY?: string;\` next to the other API keys

3. **New module \`dashboard/src/citations-google-aio.ts\`:**
   - \`querySerpApi(env, keyword)\` — calls \`https://serpapi.com/search.json?engine=google&q=<kw>&api_key=<key>\` and parses the \`ai_overview\` block
   - Returns \`{ text, urls, entities }\` matching the existing engine-query shape (Perplexity/OpenAI/Gemini/Claude)

4. **Wire into citations.ts:**
   - In the existing per-keyword loop, add a fifth engine call after the Claude call (or wherever fits the pattern)
   - INSERT row with \`engine = 'google_aio'\` and \`grounding_mode = 'web'\`
   - Same \`extractEntitiesFromText\` + reddit extraction + sentiment scoring flow as the others

5. **Update ENGINE_LABELS dict** in routes/citations.ts, routes/reddit.ts, sentiment-scorer.ts. Add \`google_aio: "Google AI Overviews"\`.

6. **Update marketing copy** in \`dist/index.html\` and \`/changelog\`:
   - Homepage: add Google AI Overviews to the engine list
   - EXPLAINER.md: same
   - README.md: same
   - Changelog entry: "Shipped: Google AI Overviews tracking"

7. **Resolve this inbox item** by inserting the completion flag:
   \`INSERT INTO automation_log (kind, target_type, target_slug, reason, detail, created_at)
       VALUES ('serpapi_setup_complete', 'system', NULL, 'SerpApi wired up; AI Overviews ingest live', '{}', unixepoch());\`
   Then this reminder permanently no-ops.

---

**Cost ceiling.** Set up a SerpApi account credit alert so a runaway loop can't blow past your monthly budget. SerpApi has built-in rate limits but a "stop at $X" cap is good defensive hygiene.

**Verification after deploy.** Hit \`/admin/citation-debug?engine=google_aio&q=test+keyword\` (you may need to add this admin route) to confirm the API call succeeds and AI Overview text comes back. Then run the weekly citation cron manually for one client and check that \`google_aio\` rows appear in \`citation_runs\`.`;

/**
 * Daily-cron entry. Microsecond no-op until paying client exists,
 * fires once when triggered, no-ops forever after the completion
 * flag is set.
 */
export async function maybeRemindSerpApiSetup(env: Env): Promise<void> {
  // Already done?
  const done = await env.DB.prepare(
    `SELECT id FROM automation_log WHERE kind = ? LIMIT 1`,
  ).bind(COMPLETE_FLAG_KIND).first<{ id: number }>();
  if (done) return;

  // Any paying client active? Trial domains have trial=1 so we exclude
  // them. Competitors are also excluded (is_competitor=0).
  const paying = await env.DB.prepare(
    `SELECT COUNT(*) AS n, MIN(client_slug) AS first_slug
       FROM domains
       WHERE active = 1 AND trial = 0 AND is_competitor = 0`,
  ).first<{ n: number; first_slug: string | null }>();
  if (!paying || paying.n === 0) return;

  // Write the inbox row. addInboxItem is idempotent on
  // (kind, target_type, target_id) so re-firing daily until resolved
  // is safe -- it just refreshes title/body in place.
  const slug = paying.first_slug ?? "(unknown)";
  await addInboxItem(env, {
    kind: "serpapi_setup_pending",
    title: `Set up SerpApi for Google AI Overviews — paying client active (${slug})`,
    body: INBOX_BODY,
    target_type: "system",
    target_id: 0,
    target_slug: slug,
    urgency: "high",
  });
}
