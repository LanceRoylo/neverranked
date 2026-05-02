/**
 * Reddit reply briefs (Phase 5B).
 *
 * For Amplify clients, generates a STRUCTURED BRIEF for any reddit
 * thread surfaced on /reddit/<slug>. The brief tells the practitioner
 * what's missing from the existing thread, what angle only they can
 * speak to, what tone the subreddit expects, and what NOT to do.
 *
 * Critically, this is NOT a draft. The system prompt is hard-tuned so
 * the model never produces paragraphs that could be pasted as a reply.
 * We give the human enough strategic input to write their own real
 * comment in their own words.
 *
 * Pipeline:
 *   1. Fetch thread JSON from reddit (op + top 5 comments by score)
 *   2. Fetch (or read cached) subreddit norms (sidebar + rules)
 *   3. Optionally include the client's voice fingerprint summary so the
 *      "angle" field knows who the practitioner is
 *   4. Single Anthropic call with strict JSON output
 *   5. Persist to reddit_briefs (UNIQUE per client+thread, idempotent)
 */

import type {
  Env,
  RedditBriefData,
  RedditThreadSnapshot,
  VoiceFingerprintData,
} from "./types";

const MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";
const NORMS_TTL_SECONDS = 7 * 86400;
// Reddit blocks default fetch UAs. Use a descriptive one per their guidance.
const REDDIT_UA = "neverranked-reply-brief/0.1 (https://neverranked.com)";

// ---------- Reddit fetching ----------

async function redditJson(url: string): Promise<unknown> {
  const resp = await fetch(url, {
    headers: { "User-Agent": REDDIT_UA, "Accept": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    throw new Error(`Reddit ${resp.status} for ${url}`);
  }
  return resp.json();
}

/** Fetch a thread by canonical URL. Returns OP + top N comments by score. */
export async function fetchRedditThread(
  threadUrl: string,
  topN = 5,
): Promise<RedditThreadSnapshot> {
  // Reddit's JSON endpoint is the URL with .json appended. Strip trailing slash.
  const base = threadUrl.replace(/\/$/, "");
  const data = await redditJson(`${base}.json?raw_json=1&limit=${topN * 3}`);

  if (!Array.isArray(data) || data.length < 2) {
    throw new Error("Unexpected Reddit response shape");
  }
  const opChild = (data[0] as { data?: { children?: { data?: unknown }[] } })
    .data?.children?.[0]?.data as
    | { title?: string; selftext?: string }
    | undefined;
  const op_title = opChild?.title ?? "";
  const op_body = (opChild?.selftext ?? "").slice(0, 4000);

  const commentChildren =
    ((data[1] as { data?: { children?: { kind?: string; data?: unknown }[] } })
      .data?.children ?? []);

  const top_comments = commentChildren
    .filter((c) => c.kind === "t1")
    .map((c) => c.data as { author?: string; score?: number; body?: string; stickied?: boolean })
    .filter((c) => !c.stickied && typeof c.body === "string" && c.body !== "[deleted]" && c.body !== "[removed]")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, topN)
    .map((c) => ({
      author: c.author ?? "[unknown]",
      score: c.score ?? 0,
      body: (c.body ?? "").slice(0, 1500),
    }));

  return { op_title, op_body, top_comments, fetched_at: Math.floor(Date.now() / 1000) };
}

interface SubredditNorms {
  description: string;
  rules: { short_name: string; description: string }[];
}

/** Fetch subreddit description + rules, with a 7-day cache in D1. */
export async function getSubredditNorms(
  env: Env,
  subreddit: string,
): Promise<SubredditNorms> {
  const sub = subreddit.toLowerCase();
  const now = Math.floor(Date.now() / 1000);

  const cached = await env.DB.prepare(
    "SELECT description, rules_json, fetched_at FROM subreddit_norms WHERE subreddit = ?",
  ).bind(sub).first<{ description: string | null; rules_json: string | null; fetched_at: number }>();

  if (cached && now - cached.fetched_at < NORMS_TTL_SECONDS) {
    let rules: SubredditNorms["rules"] = [];
    try { rules = JSON.parse(cached.rules_json || "[]"); } catch { /* fall through */ }
    return { description: cached.description ?? "", rules };
  }

  // Fetch fresh. About + rules are two separate endpoints.
  let description = "";
  let rules: SubredditNorms["rules"] = [];
  try {
    const about = await redditJson(`https://www.reddit.com/r/${sub}/about.json?raw_json=1`) as
      { data?: { public_description?: string; description?: string } };
    description = (about.data?.public_description || about.data?.description || "").slice(0, 1500);
  } catch {
    // Subreddit may be private/banned -- proceed with empty
  }
  try {
    const rulesResp = await redditJson(`https://www.reddit.com/r/${sub}/about/rules.json?raw_json=1`) as
      { rules?: { short_name?: string; description?: string }[] };
    rules = (rulesResp.rules ?? [])
      .map((r) => ({
        short_name: (r.short_name ?? "").slice(0, 200),
        description: (r.description ?? "").slice(0, 500),
      }))
      .slice(0, 12);
  } catch {
    // No rules surfaced
  }

  await env.DB.prepare(
    `INSERT INTO subreddit_norms (subreddit, description, rules_json, fetched_at)
       VALUES (?, ?, ?, ?)
     ON CONFLICT(subreddit) DO UPDATE SET
       description = excluded.description,
       rules_json = excluded.rules_json,
       fetched_at = excluded.fetched_at`,
  ).bind(sub, description, JSON.stringify(rules), now).run();

  return { description, rules };
}

// ---------- Brief generation ----------

interface MessageResponse {
  content: { type: string; text: string }[];
}

async function callAnthropic(env: Env, system: string, user: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set. Reddit briefs are disabled until it's added via wrangler secret.");
  }
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      max_tokens: 1500,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${txt.slice(0, 500)}`);
  }
  const json = (await resp.json()) as MessageResponse;
  return json.content[0]?.text ?? "";
}

const BRIEF_SYSTEM = `You are a strategic editor briefing a real human practitioner who is about to reply to a Reddit thread.

CRITICAL RULE: You are NOT writing the reply. You are writing a brief that helps the practitioner write their own. Never produce a paragraph that could be pasted into Reddit as a comment. If the practitioner copy-pastes any of your output verbatim, you have failed.

Your output is strict JSON in this exact shape, nothing else:

{
  "gap": "<one sentence: what is missing from the answers already in this thread>",
  "angle": "<one sentence: what only this specific practitioner can credibly add, given their work>",
  "tone_notes": ["<bullet>", "<bullet>", "<bullet>"],
  "dont_do": ["<bullet>", "<bullet>", "<bullet>", "<bullet>"]
}

Field rules:
- gap: one sentence, present tense, names the unanswered question or weak existing answer
- angle: one sentence, references the practitioner's specific expertise or experience -- never generic ("you have experience" is bad, "you treat 8-10 prenatal patients/week using Webster technique" is good)
- tone_notes: 2-4 bullets describing how this specific subreddit expects comments to read, based on its description and rules
- dont_do: 3-5 bullets of explicit anti-patterns -- things that will get the comment downvoted, removed, or read as marketing. Always include at least one rule about not linking the business and not signing off with the business name.

Do not write reply prose. Do not include greetings, conclusions, or any text the practitioner could lift. Bullets are short directives, not sentences they could paste.`;

/**
 * Generate (or return cached) brief for one (client, thread). If a
 * brief already exists, returns it unchanged unless `regenerate=true`.
 */
export async function generateOrGetBrief(
  env: Env,
  params: {
    clientSlug: string;
    threadUrl: string;
    subreddit: string;
    userId: number | null;
    regenerate?: boolean;
  },
): Promise<{ id: number; brief: RedditBriefData; snapshot: RedditThreadSnapshot; cached: boolean }> {
  const { clientSlug, threadUrl, subreddit, userId, regenerate } = params;

  if (!regenerate) {
    const existing = await env.DB.prepare(
      "SELECT id, brief_json, thread_snapshot FROM reddit_briefs WHERE client_slug = ? AND thread_url = ?",
    ).bind(clientSlug, threadUrl).first<{ id: number; brief_json: string; thread_snapshot: string }>();
    if (existing) {
      return {
        id: existing.id,
        brief: JSON.parse(existing.brief_json) as RedditBriefData,
        snapshot: JSON.parse(existing.thread_snapshot) as RedditThreadSnapshot,
        cached: true,
      };
    }
  }

  // Fetch fresh thread + norms in parallel.
  const [snapshot, norms, voice] = await Promise.all([
    fetchRedditThread(threadUrl),
    getSubredditNorms(env, subreddit),
    loadVoiceContext(env, clientSlug),
  ]);

  const userMessage = buildUserMessage(threadUrl, subreddit, snapshot, norms, voice);
  const raw = await callAnthropic(env, BRIEF_SYSTEM, userMessage);
  const brief = parseBrief(raw);

  // Human-tone guard: brief fields land directly on the customer's
  // dashboard so they need to read like a human strategist wrote them.
  // We check the four fields combined; on failure, an admin_inbox row
  // is written. We still persist the brief (so Lance can see what was
  // generated and decide), but the caller's UI can show a warning
  // banner via the inbox link.
  const briefAsText = [brief.gap, brief.angle, ...brief.tone_notes, ...brief.dont_do].join("\n");
  const { assertHumanTone } = await import("./human-tone-guard");
  await assertHumanTone(env, briefAsText, "customer-dashboard", {
    source: "reddit-briefs.generateOrGetBrief",
    client_slug: clientSlug,
    target_type: "reddit_brief",
  });
  // Voice score: only meaningful when we have a fingerprint AND there's
  // enough text to judge. Wrapper handles both no-ops cleanly.
  const { assertVoiceScore } = await import("./voice-engine");
  await assertVoiceScore(env, clientSlug, briefAsText, "reddit-brief", {
    source: "reddit-briefs.generateOrGetBrief",
    target_type: "reddit_brief",
  });

  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    `INSERT INTO reddit_briefs
       (client_slug, thread_url, subreddit, brief_json, thread_snapshot, model, generated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_slug, thread_url) DO UPDATE SET
       brief_json = excluded.brief_json,
       thread_snapshot = excluded.thread_snapshot,
       model = excluded.model,
       generated_by = excluded.generated_by,
       updated_at = excluded.updated_at
     RETURNING id`,
  ).bind(
    clientSlug, threadUrl, subreddit.toLowerCase(),
    JSON.stringify(brief), JSON.stringify(snapshot),
    MODEL, userId, now, now,
  ).first<{ id: number }>();

  return { id: result?.id ?? 0, brief, snapshot, cached: false };
}

async function loadVoiceContext(env: Env, clientSlug: string): Promise<string> {
  const fp = await env.DB.prepare(
    "SELECT fingerprint_json FROM voice_fingerprints WHERE client_slug = ?",
  ).bind(clientSlug).first<{ fingerprint_json: string }>();
  if (!fp) return "(no voice profile built yet -- the practitioner is the client themselves; keep angle generic to 'their direct work experience')";
  try {
    const profile = JSON.parse(fp.fingerprint_json) as VoiceFingerprintData;
    return profile.summary || "(voice profile present but no summary)";
  } catch {
    return "(voice profile unparseable)";
  }
}

function buildUserMessage(
  threadUrl: string,
  subreddit: string,
  snapshot: RedditThreadSnapshot,
  norms: SubredditNorms,
  voiceContext: string,
): string {
  const commentsBlock = snapshot.top_comments.length === 0
    ? "(no top-level comments)"
    : snapshot.top_comments.map((c, i) =>
        `[Comment ${i + 1} -- ${c.score} pts by u/${c.author}]\n${c.body}`,
      ).join("\n\n---\n\n");

  const rulesBlock = norms.rules.length === 0
    ? "(no public rules surfaced)"
    : norms.rules.map((r, i) => `${i + 1}. ${r.short_name}${r.description ? " -- " + r.description : ""}`).join("\n");

  return `Thread: ${threadUrl}
Subreddit: r/${subreddit}

## Subreddit description
${norms.description || "(none)"}

## Subreddit rules
${rulesBlock}

## Practitioner context (who is replying)
${voiceContext}

## Original post
Title: ${snapshot.op_title}

${snapshot.op_body || "(no body text)"}

## Top existing comments
${commentsBlock}

Produce the brief now. Strict JSON only, matching the shape in your instructions.`;
}

function parseBrief(text: string): RedditBriefData {
  // Extract first {...} block in case the model wrapped it in fences or prose.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Brief output was not JSON");
  const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<RedditBriefData>;

  const sentence = (s: unknown): string => {
    if (typeof s !== "string") return "";
    const trimmed = s.trim();
    // Hard-truncate at first sentence boundary to enforce the one-sentence rule.
    const m = trimmed.match(/^[^.!?]+[.!?]/);
    return (m ? m[0] : trimmed).trim();
  };
  const bullets = (arr: unknown, max: number): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, max);
  };

  return {
    gap: sentence(obj.gap),
    angle: sentence(obj.angle),
    tone_notes: bullets(obj.tone_notes, 4),
    dont_do: bullets(obj.dont_do, 5),
  };
}
