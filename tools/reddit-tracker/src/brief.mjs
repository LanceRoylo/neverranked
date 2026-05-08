/**
 * Reply brief skeleton generator.
 *
 * Given a thread + a mention scan + a category, produces a structured
 * brief a practitioner (or a downstream LLM call) can fill in to
 * write an authentic, on-policy reddit reply.
 *
 * Phase 1 outputs the SKELETON -- sections + signals, no LLM-generated
 * prose. The structure mirrors the dashboard's reddit_briefs.brief_json
 * shape (gap, angle, tone notes, don't-do) so once an LLM is wired in,
 * the output drops straight into existing infrastructure.
 *
 * Why a skeleton without an LLM call:
 *   1. The product question this answers ("should I reply, and what
 *      would I say?") is mostly about evidence and constraints, not
 *      generation. The structured output IS the answer.
 *   2. Wiring an LLM call belongs alongside the dashboard's existing
 *      reddit-briefs path (auth, rate limits, model choice). Not in a
 *      CLI tool that's read-only by design in Phase 1.
 *   3. The skeleton is portable: paste it into Claude / ChatGPT / a
 *      Notion doc and it stays useful.
 */

/**
 * Generate the brief skeleton.
 *
 * @param {object} opts
 * @param {object} opts.thread - thread metadata { url, title, subreddit, op_score, comment_count, posted_at }
 * @param {object} opts.scan - output of scanThreadForMentions
 * @param {string} opts.category - the category query that surfaced this thread
 * @param {object} [opts.score] - composite score breakdown (recency, upvote, citation_likelihood, composite)
 * @returns {object} structured brief, ready to render or persist
 */
export function generateBriefSkeleton(opts) {
  const { thread, scan, category, score = {} } = opts;
  if (!thread || !scan || !category) {
    throw new Error("generateBriefSkeleton: thread, scan, and category are all required");
  }

  const { summary, client_mentions, competitor_mentions } = scan;
  const sub = (thread.subreddit || "").toLowerCase();

  // GAP -- what's missing from this thread that the client could
  // authentically add. Phrased as evidence, not assertion.
  const gap = inferGap(summary, client_mentions, competitor_mentions, category);

  // ANGLE -- the framing that would resonate without sounding
  // promotional. Pulled from thread shape + mention pattern.
  const angle = inferAngle(thread, summary, category);

  // TONE NOTES -- subreddit-culture-specific guardrails. Phase 1 ships
  // a small library of common subs; everything else gets generic
  // reddit-prose guidance. The dashboard's subreddit_norms table
  // (migration 0050) is the eventual source of truth.
  const tone_notes = inferToneNotes(sub);

  // DON'T-DO -- categorical disqualifiers. Same for every brief, with
  // sub-specific additions where the culture demands.
  const dont_do = inferDontDo(sub, summary);

  // DRAFT HOOKS -- opening sentence patterns the practitioner can
  // riff off. Three variations covering different stances.
  const draft_hooks = inferDraftHooks(thread, summary);

  // EVIDENCE -- the raw signals from the mention scan, surfaced so
  // the brief is auditable.
  const evidence = {
    client_mention_count: summary.client_mention_count || 0,
    client_sentiment_pos: summary.client_positive || 0,
    client_sentiment_neg: summary.client_negative || 0,
    competitors_named: summary.top_competitors || [],
    thread_age_days: thread.posted_at ? Math.floor((Date.now() / 1000 - thread.posted_at) / 86400) : null,
    composite_score: score.composite_score,
  };

  return {
    thread_url: thread.url,
    subreddit: sub,
    category,
    gap,
    angle,
    tone_notes,
    dont_do,
    draft_hooks,
    evidence,
    generated_at: new Date().toISOString(),
  };
}

// ---------- Inference helpers ----------

function inferGap(summary, clientMentions, competitorMentions, category) {
  const competitors = summary.top_competitors || [];
  if (!summary.client_mentioned && competitors.length > 0) {
    const names = competitors.slice(0, 3).map((c) => c.name).join(", ");
    return `Thread discusses ${category} and names ${competitors.length} competitor${competitors.length === 1 ? "" : "s"} (${names}). Client is not mentioned. Gap: client is invisible in a thread AI engines are likely to cite for this category.`;
  }
  if (!summary.client_mentioned && competitors.length === 0) {
    return `Thread is on-topic for ${category} but does not yet have an established competitive set. Gap: opportunity to seed the recommendation pattern before competitors do.`;
  }
  if (summary.client_negative > summary.client_positive) {
    return `Client is mentioned ${summary.client_mention_count}x but sentiment skews negative (${summary.client_negative}- vs ${summary.client_positive}+). Gap: existing perception needs counter-evidence, not introduction.`;
  }
  return `Client mentioned ${summary.client_mention_count}x with ${summary.client_positive}+ / ${summary.client_negative}- sentiment. No gap on visibility. Consider whether reply adds new evidence or repeats existing positive signal.`;
}

function inferAngle(thread, summary, category) {
  const titleLower = (thread.title || "").toLowerCase();
  const competitors = summary.top_competitors || [];

  // Comparison-shape thread: angle is differentiation
  if (/\bvs\.?\b|\bversus\b|\bor\b.*\?/.test(titleLower)) {
    return `Comparison thread. Angle: address the specific comparison axis the OP cares about (price, fit for use case, on-ramp). Don't try to be the answer to all axes -- pick the one where evidence is strongest.`;
  }
  // Recommendation-ask thread: angle is fit-for-context
  if (/\b(recommend|recommendations|suggestion)\b/.test(titleLower)) {
    return `Recommendation-ask thread. Angle: surface the specific use-case constraint the OP names in the title or body. Reply should sound like "for what you're describing, here's what I'd consider" -- not a feature list.`;
  }
  // "Anyone tried" / experience-share thread: angle is honest experience
  if (/\b(anyone\s+(tried|used|use)|honest|experience)\b/.test(titleLower)) {
    return `Experience-share thread. Angle: contribute one specific anecdote with a verifiable detail. Avoid summary-style replies. OP is asking for stories, not pitches.`;
  }
  // Generic best-of: angle is to add a non-obvious option
  if (/\b(best|top|favorite)\b/.test(titleLower)) {
    if (competitors.length >= 3) {
      return `Best-of list with ${competitors.length} competitors named. Angle: do not repeat the consensus. Either add a specific use case where the consensus picks fail, or surface a non-obvious option with a real reason.`;
    }
    return `Best-of thread with thin competitive set. Angle: be the first authoritative voice -- establish the criteria the OP should care about, then name the option that matches.`;
  }
  // Fallback
  return `Topical thread without strong shape signal. Angle: read the top 3 comments before drafting. Match their register, then add one piece of evidence not yet present.`;
}

// Subreddit tone library. Keep small and curated; default applies to
// everything else. Once subreddit_norms (migration 0050) has data,
// this becomes a thin fallback.
const SUBREDDIT_TONE = {
  realtors: [
    "r/realtors is suspicious of marketing language. Plain prose, specific tools, real numbers.",
    "Mods remove anything that smells like an ad. No CTAs, no links to your own site.",
    "Top comments are usually 1-3 sentences. Long comments without anecdotes get downvoted.",
  ],
  realestate: [
    "r/realestate is consumer-side. Agents posting need to disclose.",
    "Personal experience > general advice. Always.",
    "Comments without numbers or specifics get ignored.",
  ],
  smallbusiness: [
    "r/smallbusiness rewards practical detail. 'I've used X for 18 months, here's what works and what doesn't.'",
    "Avoid jargon. Avoid phrases like 'leverage', 'optimize', 'ecosystem'.",
    "Self-promotion rules are strict. Read the sidebar before you reply.",
  ],
  smallbusinessus: [
    "Same culture as r/smallbusiness -- practical, jargon-allergic, anti-promo.",
  ],
  saas: [
    "r/SaaS expects technical depth. Hand-wavy answers get challenged.",
    "Disclosing affiliation upfront is the norm and earns credibility.",
  ],
  podcasting: [
    "r/podcasting values workflow specifics. Mention what you actually use, with numbers (file size, bitrate, monthly cost).",
    "Self-promotion rules are enforced -- read the sidebar.",
  ],
  marketing: [
    "r/marketing is contrarian by default. Take a clear position. Don't hedge.",
  ],
  seo: [
    "r/SEO is allergic to consultant-speak. Concrete tactics, real screenshots, traffic numbers.",
  ],
  localseo: [
    "r/LocalSEO is small enough that regulars recognize each other. Don't be a stranger with strong opinions.",
  ],
  crm: [
    "r/CRM expects vendor disclosure. Naming your CRM without disclosing builds zero trust.",
  ],
};

function inferToneNotes(sub) {
  if (SUBREDDIT_TONE[sub]) return SUBREDDIT_TONE[sub];
  return [
    "Match the register of the top 3 comments before drafting.",
    "First-person specific anecdote > generic advice.",
    "Reddit prose is shorter and more direct than blog prose. Cut anything that sounds written for SEO.",
    "Disclose affiliation if you have one. The sub will figure it out anyway.",
  ];
}

const DONT_DO_BASE = [
  "Do not include links to your own properties. Mods remove these and the comment count zeroes out.",
  "Do not use CTAs ('check out', 'learn more', 'DM me'). Reads as ad copy.",
  "Do not use emojis. Reddit prose doesn't use them outside specific subs.",
  "Do not use em dashes. They're a tell for AI-generated text.",
  "Do not paste a feature list. Pick one specific thing and explain it.",
  "Do not reply within 24 hours of OP posting if the thread is already crowded -- your reply will be buried.",
];

function inferDontDo(sub, summary) {
  const out = [...DONT_DO_BASE];
  if (sub === "smallbusiness" || sub === "smallbusinessus") {
    out.push("r/smallbusiness has explicit anti-self-promo rules. Read them before replying.");
  }
  if (sub === "saas" || sub === "crm") {
    out.push("Disclose vendor affiliation in the first sentence if any exists.");
  }
  if (summary.client_negative > 0) {
    out.push("Negative sentiment exists in-thread. Do not pretend it doesn't -- address it directly or stay out.");
  }
  return out;
}

function inferDraftHooks(thread, summary) {
  const competitors = summary.top_competitors || [];
  const hooks = [];

  if (competitors.length > 0) {
    const top = competitors[0].name;
    hooks.push(`"I've used ${top} and [client] for similar workflows. Here's where they diverge for [specific use case]: …"`);
  }
  hooks.push(`"For [specific OP use case], I'd consider [client] because [one concrete reason with a number or detail]. The trade-off is [honest counter]."`);
  if (summary.client_mentioned) {
    hooks.push(`"Adding to the [client] thread above: [specific evidence not yet stated]."`);
  } else {
    hooks.push(`"One option no one's mentioned: [client]. The reason it fits this question specifically is [one sentence]."`);
  }
  return hooks;
}

/**
 * Render a brief skeleton as readable markdown. Output is suitable
 * for a CLI, a Notion doc, or pasting into a chat with an LLM that
 * will fill in the prose.
 */
export function renderBriefMarkdown(brief) {
  const lines = [];
  lines.push(`# Reply brief -- ${brief.subreddit ? `r/${brief.subreddit}` : "thread"}`);
  lines.push("");
  lines.push(`**Thread:** ${brief.thread_url}`);
  lines.push(`**Category:** ${brief.category}`);
  if (brief.evidence.composite_score != null) {
    lines.push(`**Discovery score:** ${brief.evidence.composite_score} · age ${brief.evidence.thread_age_days}d`);
  }
  lines.push("");

  lines.push("## Gap");
  lines.push(brief.gap);
  lines.push("");

  lines.push("## Angle");
  lines.push(brief.angle);
  lines.push("");

  lines.push("## Tone notes");
  for (const t of brief.tone_notes) lines.push(`- ${t}`);
  lines.push("");

  lines.push("## Don't-do");
  for (const d of brief.dont_do) lines.push(`- ${d}`);
  lines.push("");

  lines.push("## Draft hooks");
  for (const h of brief.draft_hooks) lines.push(`- ${h}`);
  lines.push("");

  lines.push("## Evidence");
  lines.push(`- Client mentioned: ${brief.evidence.client_mention_count}x (${brief.evidence.client_sentiment_pos}+ / ${brief.evidence.client_sentiment_neg}-)`);
  if (brief.evidence.competitors_named.length > 0) {
    lines.push(`- Competitors named:`);
    for (const c of brief.evidence.competitors_named) {
      lines.push(`  - ${c.name} (${c.mention_count}x)`);
    }
  }
  lines.push("");
  lines.push(`*Generated ${brief.generated_at}*`);
  return lines.join("\n");
}
