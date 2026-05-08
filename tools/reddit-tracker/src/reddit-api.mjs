/**
 * Reddit public-endpoint client.
 *
 * Uses the unauthenticated `.json` suffix on any reddit URL. No OAuth
 * needed for read-only discovery. Rate limit is ~60 req/min for
 * unauthed clients; we add a polite delay between sequential calls.
 *
 * Phase 1 keeps this minimal -- search + thread fetch. OAuth, rising
 * feeds, and authenticated bulk pulls move to Phase 2.
 */

const USER_AGENT = "NeverRanked-RedditTracker/0.1 (forward-looking citation discovery)";
const POLITE_DELAY_MS = 1100; // stays under 60/min unauthed ceiling
const FETCH_TIMEOUT_MS = 10_000; // a hung reddit response shouldn't block a batch

let lastRequestAt = 0;

async function politeWait() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < POLITE_DELAY_MS) {
    await new Promise((r) => setTimeout(r, POLITE_DELAY_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

async function jsonFetch(url) {
  await politeWait();
  // AbortController gives us a hard ceiling on hung responses. Reddit
  // can stall under load; without this, a batch discovery would block
  // the whole pipeline until process death.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Reddit fetch failed: ${res.status} ${res.statusText} for ${url}`);
    }
    return await res.json();
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error(`Reddit fetch timed out after ${FETCH_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search reddit for threads matching a query. Returns up to `limit`
 * raw thread records (subset of fields we care about, normalized).
 *
 * Reddit's search supports `sort=relevance|hot|top|new|comments` and
 * `t=hour|day|week|month|year|all`. For citation discovery, we want
 * threads with structural permanence -- so we default to
 * `sort=relevance` (reddit's own match-quality filter) and `t=year`
 * to bias toward enduring on-topic discussions, then apply our own
 * scoring on top. `sort=top` was the original default but on
 * generic-keyword categories ("best CRM for real estate") it
 * returned viral drama threads that happened to contain the search
 * terms; relevance sort suppresses that class of false positive.
 */
export async function searchThreads({ query, limit = 50, sort = "relevance", t = "year", subreddit = null }) {
  const base = subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`
    : "https://www.reddit.com/search.json";
  const params = new URLSearchParams({
    q: query,
    sort,
    t,
    limit: String(Math.min(limit, 100)),
    type: "link",
    restrict_sr: subreddit ? "1" : "0",
  });
  const data = await jsonFetch(`${base}?${params.toString()}`);
  const children = data?.data?.children || [];
  return children.map((c) => normalizeThread(c.data));
}

/**
 * Fetch full comments for a thread. Returns { thread, topComments }.
 * Used for mention detection. Phase 1 only pulls top-level top-scored
 * comments (no recursion); deep traversal moves to Phase 2.
 */
export async function fetchThreadDetail(threadUrl, { topN = 10 } = {}) {
  const url = threadUrl.endsWith(".json") ? threadUrl : `${threadUrl.replace(/\/$/, "")}.json`;
  const data = await jsonFetch(url);
  const [postWrap, commentsWrap] = Array.isArray(data) ? data : [null, null];
  const thread = postWrap?.data?.children?.[0]?.data;
  const comments = (commentsWrap?.data?.children || [])
    .filter((c) => c.kind === "t1" && c.data && !c.data.stickied)
    .map((c) => ({
      id: c.data.id,
      body: c.data.body || "",
      score: c.data.score || 0,
      author: c.data.author || null,
      created_utc: c.data.created_utc || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
  return { thread: thread ? normalizeThread(thread) : null, topComments: comments };
}

/**
 * Convert a reddit API record into our internal shape. Drops the dozens
 * of fields we don't use; keeps only what scoring + mention detection
 * needs.
 */
function normalizeThread(d) {
  return {
    id: d.id,
    url: `https://www.reddit.com${d.permalink}`,
    subreddit: (d.subreddit || "").toLowerCase(),
    title: d.title || "",
    op_body: d.selftext || "",
    op_score: d.score || 0,
    comment_count: d.num_comments || 0,
    posted_at: d.created_utc || 0,
    over_18: !!d.over_18,
    is_self: !!d.is_self,
    upvote_ratio: typeof d.upvote_ratio === "number" ? d.upvote_ratio : null,
  };
}
