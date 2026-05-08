/**
 * Mention detection -- given a discovered thread + a client identity,
 * find where the client is mentioned (or not) inside the thread, and
 * surface the competitive set being recommended instead.
 *
 * The product question this answers: "is my client named in this
 * thread, and if not, who is being named?" That's the gap a reply
 * brief is supposed to close.
 *
 * Phase 1: read-only. No DB writes. The output JSON is shaped to
 * match the eventual reddit_thread_mentions schema (migration 0067)
 * so Phase 2 can wire the writer with no remapping.
 */

import { fetchThreadDetail } from "./reddit-api.mjs";

/**
 * Identity an identity object describing how to recognize a client
 * inside reddit prose.
 *
 * @typedef {object} ClientIdentity
 * @property {string} slug - canonical client_slug (used as FK target)
 * @property {string[]} names - business names + common abbreviations
 * @property {string[]} [domains] - "example.com" style; matches with or without https://
 * @property {string[]} [aliases] - product names, founder names, etc.
 */

/**
 * Surface forms of a competitor mention. Used to seed the competitive
 * set when scanning reddit threads. Phase 1 uses a static seed list
 * passed by the caller; Phase 2 will pull from a per-category
 * competitor table.
 *
 * @typedef {object} CompetitorEntry
 * @property {string} name - canonical competitor name
 * @property {string[]} surfaceForms - all spellings to match
 */

/**
 * Build a case-insensitive word-boundary regex for a list of surface
 * forms. Escapes regex metacharacters in each form. Empty list -> null.
 */
function compileMatcher(forms) {
  const cleaned = (forms || [])
    .filter((s) => typeof s === "string" && s.trim().length >= 2)
    .map((s) => s.trim());
  if (cleaned.length === 0) return null;
  const escaped = cleaned.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Domains can match with-or-without protocol prefix; word-boundary
  // works for plain names. We use a unified \b approach since reddit
  // prose rarely embeds domains inside other tokens.
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
}

/**
 * Find all matches of a compiled matcher in a text. Returns an array
 * of { match, index, surrounding } where `surrounding` is a 200-char
 * excerpt centered on the match (the mention_context in the schema).
 */
function findMatches(text, matcher) {
  if (!text || !matcher) return [];
  matcher.lastIndex = 0;
  const out = [];
  let m;
  while ((m = matcher.exec(text)) !== null) {
    const idx = m.index;
    const start = Math.max(0, idx - 80);
    const end = Math.min(text.length, idx + m[0].length + 80);
    const surrounding = text.slice(start, end).replace(/\s+/g, " ").trim();
    out.push({ match: m[0], index: idx, surrounding });
    // Avoid infinite loops on zero-width regex (shouldn't happen with our patterns)
    if (m.index === matcher.lastIndex) matcher.lastIndex++;
  }
  return out;
}

/**
 * Crude sentiment classifier. Looks at the surrounding context for
 * recommend / use / love / hate / avoid / waste signals. Returns
 * "positive" | "negative" | "neutral". Phase 1 heuristic only; Phase
 * 2 will use an LLM pass for high-stakes classifications.
 */
function classifySentiment(surrounding) {
  const s = surrounding.toLowerCase();
  const positive = /\b(recommend|love|use|using|switched to|happy with|great|awesome|excellent|favorite)\b/.test(s);
  const negative = /\b(avoid|hate|terrible|garbage|waste|stay away|disappointed|cancelled|cancel|switching from|moved away from)\b/.test(s);
  if (positive && !negative) return "positive";
  if (negative && !positive) return "negative";
  if (positive && negative) return "mixed";
  return "neutral";
}

/**
 * Detect mentions of a client inside a single text block. Returns an
 * array of mention records shaped for the reddit_thread_mentions
 * schema (without thread_id / client_slug, which the caller fills).
 */
function detectInBlock(text, identity, mentionType, blockMeta = {}) {
  const allForms = [
    ...(identity.names || []),
    ...(identity.aliases || []),
    ...(identity.domains || []),
  ];
  const matcher = compileMatcher(allForms);
  const hits = findMatches(text, matcher);
  return hits.map((h) => ({
    mention_type: mentionType,
    mention_context: h.surrounding,
    surface_form: h.match,
    sentiment: classifySentiment(h.surrounding),
    ...blockMeta,
  }));
}

/**
 * Scan a thread for client + competitor mentions.
 *
 * @param {string} threadUrl
 * @param {object} opts
 * @param {ClientIdentity} opts.client - the client to look for
 * @param {CompetitorEntry[]} [opts.competitors] - competitive set seed
 * @param {number} [opts.topComments=15] - how many top-scored comments to scan
 * @returns {Promise<object>} { thread, client_mentions, competitor_mentions, summary }
 */
export async function scanThreadForMentions(threadUrl, opts = {}) {
  const { client, competitors = [], topComments = 15 } = opts;
  if (!client || !client.slug || !Array.isArray(client.names)) {
    throw new Error("scanThreadForMentions: opts.client must include { slug, names: [...] }");
  }

  const detail = await fetchThreadDetail(threadUrl, { topN: topComments });
  if (!detail.thread) {
    return { thread: null, client_mentions: [], competitor_mentions: [], summary: { found: false } };
  }
  const thread = detail.thread;

  // Client mentions across title, op_body, and each top comment.
  const clientMentions = [
    ...detectInBlock(thread.title, client, "title"),
    ...detectInBlock(thread.op_body, client, "op_body"),
    ...detail.topComments.flatMap((c) =>
      detectInBlock(c.body, client, "comment", { comment_id: c.id, comment_score: c.score, comment_author: c.author })
    ),
  ];

  // Competitor mentions, grouped by competitor canonical name.
  const competitorMentions = {};
  for (const comp of competitors) {
    const compIdentity = { slug: `__competitor:${comp.name}`, names: comp.surfaceForms || [comp.name] };
    const compHits = [
      ...detectInBlock(thread.title, compIdentity, "title"),
      ...detectInBlock(thread.op_body, compIdentity, "op_body"),
      ...detail.topComments.flatMap((c) =>
        detectInBlock(c.body, compIdentity, "comment", { comment_id: c.id, comment_score: c.score, comment_author: c.author })
      ),
    ];
    if (compHits.length > 0) {
      competitorMentions[comp.name] = compHits;
    }
  }

  // Summary: the punchline data the brief generator will key off.
  const positive = clientMentions.filter((m) => m.sentiment === "positive").length;
  const negative = clientMentions.filter((m) => m.sentiment === "negative").length;
  const competitorList = Object.entries(competitorMentions)
    .map(([name, hits]) => ({ name, mention_count: hits.length, sentiments: hits.map((h) => h.sentiment) }))
    .sort((a, b) => b.mention_count - a.mention_count);

  return {
    thread: {
      url: thread.url,
      subreddit: thread.subreddit,
      title: thread.title,
      op_score: thread.op_score,
      comment_count: thread.comment_count,
    },
    client_mentions: clientMentions,
    competitor_mentions: competitorMentions,
    summary: {
      client_slug: client.slug,
      client_mentioned: clientMentions.length > 0,
      client_mention_count: clientMentions.length,
      client_positive: positive,
      client_negative: negative,
      competitors_named: competitorList.length,
      top_competitors: competitorList.slice(0, 5),
      gap_signal: clientMentions.length === 0 && competitorList.length > 0
        ? `client absent; ${competitorList.length} competitor(s) named`
        : clientMentions.length === 0
        ? "client absent; no clear competitive set in this thread"
        : `client mentioned ${clientMentions.length}x (${positive}+ / ${negative}-)`,
    },
  };
}
