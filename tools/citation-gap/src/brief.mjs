/**
 * Citation-gap brief generator.
 *
 * Per-source briefs structured the same way as the reddit-tracker
 * brief module (gap, angle, action, tone notes, don't-do, evidence)
 * but with source-type-specific guidance. Wikipedia briefs talk about
 * editor reputations and notability sourcing; TripAdvisor briefs talk
 * about review density and recency; press briefs talk about wire
 * services and Hawaii-local outlets.
 *
 * Same design contract as the reddit version: no LLM call. The brief
 * IS the answer for most cases. Pasting it into Claude / a Notion doc
 * keeps it useful.
 */

/**
 * Generate a brief for a single source-gap. Returns a structured
 * object plus a markdown render.
 *
 * @param {object} source - one of analyzeCitationGaps().sources
 * @param {object} client - { slug, names: [...], domains: [...] }
 */
export function generateSourceBrief(source, client) {
  const meta = SOURCE_BRIEF_LIBRARY[source.source_type] || SOURCE_BRIEF_LIBRARY.other;
  const action = meta.action(source, client);
  const gap = inferGap(source, client);
  const angle = meta.angle(source, client);
  const tone_notes = meta.tone_notes;
  const dont_do = meta.dont_do;
  const evidence = {
    domain: source.domain,
    source_type: source.source_type,
    runs_citing_source: source.total_runs,
    engines: source.engines,
    keywords: source.keywords,
    client_named_runs: source.client_named_runs,
    client_named_ratio: source.client_named_ratio,
    gap_score: source.gap_score,
    example_urls: source.example_urls,
  };
  return {
    domain: source.domain,
    source_type: source.source_type,
    source_label: source.source_label,
    action,
    gap,
    angle,
    tone_notes,
    dont_do,
    evidence,
    generated_at: new Date().toISOString(),
  };
}

function inferGap(source, client) {
  if (source.is_client_owned) {
    return `Source is the client's own property. Not a gap; it's working as intended.`;
  }
  if (source.client_named_ratio >= 0.8) {
    return `${source.source_label} cites this client in ${Math.round(source.client_named_ratio * 100)}% of the ${source.total_runs} runs that mention this source. Strong signal; defend rather than invest.`;
  }
  if (source.client_named_ratio >= 0.4) {
    return `${source.source_label} cites this client in ${Math.round(source.client_named_ratio * 100)}% of the ${source.total_runs} runs that mention this source. Partial coverage. Reinforce so AI engines stop treating the citation as occasional.`;
  }
  return `${source.source_label} is cited in ${source.total_runs} run${source.total_runs === 1 ? "" : "s"} for this client's tracked queries (${source.engines.join(", ")}), but the client is named in only ${source.client_named_runs} of those runs. The source is a citation channel for this category; the client is missing from it.`;
}

// ---------------------------------------------------------------------
// Source-type brief libraries.
// ---------------------------------------------------------------------

const SOURCE_BRIEF_LIBRARY = {
  wikipedia: {
    action: (s, c) => `Audit and update Wikipedia entry. Confirm notability sourcing (3+ independent secondary sources). Refresh facts that AI engines extract -- founding date, leadership, notable events.`,
    angle: (s, c) => `Wikipedia is treated by AI engines as canonical. Edits compound. Targets in priority order: (1) intro paragraph accuracy, (2) infobox completeness, (3) "References" section depth (the moat), (4) "Recent events" if applicable.`,
    tone_notes: [
      "Wikipedia voice is encyclopedic. No marketing tone. No promotional verbs.",
      "Every claim needs a citation to an independent secondary source. Press releases don't count.",
      "Use a logged-in account with edit history. New / IP edits get reverted.",
      "Do not edit the entry about your own organization without disclosing on the Talk page.",
    ],
    dont_do: [
      "Do not add unsourced claims, even true ones. They get reverted.",
      "Do not delete sourced content you disagree with. Discuss on the Talk page first.",
      "Do not add the brand site as the primary source for any factual claim.",
      "Do not edit infobox fields like 'industry' or 'founded' without a press / news source backing the change.",
    ],
  },

  tripadvisor: {
    action: (s, c) => `Increase review density and recency. Target 4+ new reviews/month from authentic visitors. Refresh business hours, photos, and Q&A.`,
    angle: (s, c) => `TripAdvisor citation strength scales with review count and recency. AI engines pull recent reviews preferentially. The unlock is review velocity, not review score.`,
    tone_notes: [
      "Owner responses to reviews are read by AI engines. Make them substantive (specific to the review, not boilerplate).",
      "Photos uploaded by visitors > photos uploaded by owner. Encourage post-visit photo shares.",
      "Q&A answers should be short, specific, and address logistical questions (parking, accessibility, hours).",
    ],
    dont_do: [
      "Do not use a service to generate fake reviews. TripAdvisor's detection is good; suspended listings stop being cited.",
      "Do not use templated responses that read like 'Thank you for your review!'",
      "Do not delete legitimate negative reviews. Address them in-line.",
    ],
  },

  "google-maps": {
    action: (s, c) => `Complete and refresh Google Business Profile. Hours, photos, attributes (accessibility, parking, payment options), Q&A, services list, posts.`,
    angle: (s, c) => `Google's own AI uses Business Profile as ground truth. Other engines retrieve through Google. Coverage gaps here cascade.`,
    tone_notes: [
      "Profile descriptions should match brand voice without being promotional.",
      "Add photos in categories Google uses: storefront / interior / staff / products / experiences.",
      "Use Posts (events, offers, updates) — they're indexed and cite-eligible.",
      "Q&A: pin canonical answers to common questions before community answers them wrong.",
    ],
    dont_do: [
      "Do not stuff keywords in the business name. Google penalizes and the listing stops being cited.",
      "Do not let the business hours go stale, especially around holidays.",
      "Do not upload photos that violate Google's content policies (no graphic content, no overlay text on hero photos).",
    ],
  },

  reddit: {
    action: (s, c) => `Use the @nr/reddit-tracker discovery + brief pipeline. Surface the threads cited for this category and reply where the gap is real.`,
    angle: (s, c) => `Reddit citation is hard to fake but high leverage. One quality reply on a cited thread compounds because the thread is in the AI engines' retrieval set.`,
    tone_notes: [
      "Run scripts/reddit-thread-search.mjs to identify the specific threads.",
      "Run scripts/reddit-brief-generate.mjs for source-shaped reply briefs.",
      "All reddit-specific tone constraints apply (see @nr/reddit-tracker).",
    ],
    dont_do: [
      "Do not reply with a sales pitch. Mods remove and the comment count zeroes out.",
      "Do not link to brand-owned properties. Disclose if relevant; otherwise don't.",
    ],
  },

  news: {
    action: (s, c) => `Press release distribution + targeted pitch. ${s.domain.includes("globenewswire") || s.domain.includes("prnewswire") ? "Wire services AI engines crawl; cadence matters more than headline." : "Direct pitch -- earned, not paid."}`,
    angle: (s, c) => `News citations decay fast. AI engines preference recency. The strategy is steady cadence (1-2 wire pieces / quarter) plus opportunistic earned press around real events.`,
    tone_notes: [
      "Wire services: write the lede so it stands alone; AI engines truncate.",
      "Earned press: pitch to specific reporters who cover the beat, not the desk.",
      "Local outlets (Star-Advertiser, Civil Beat, Pacific Business News for Hawaii) are heavily weighted by AI for local queries.",
    ],
    dont_do: [
      "Do not push thin announcements. Wire services crawl, but engines downweight no-news posts.",
      "Do not use jargon in the headline. AI engines extract headlines verbatim.",
    ],
  },

  directory: {
    action: (s, c) => `Claim and complete listing. Match NAP (name / address / phone) exactly across directories so AI engines can reconcile.`,
    angle: (s, c) => `Directories are aggregator-trusted. AI engines use them for fact-checking. Inconsistent NAP across directories is the most common silent gap.`,
    tone_notes: [
      "Verify NAP consistency: business name, address format, phone format.",
      "Categories should match what people actually search for, not what's most prestigious.",
    ],
    dont_do: [
      "Do not list under multiple business names to capture more searches. AI engines flag and downweight.",
    ],
  },

  social: {
    action: (s, c) => `Publish a canonical bio paragraph that matches the brand site, plus 2-4 high-signal posts/quarter. Optimize the bio first.`,
    angle: (s, c) => `Social profiles are weak citation sources individually but accumulate. AI engines use them to verify the brand exists and is active. Bio consistency > post volume.`,
    tone_notes: [
      "Bio paragraph should be the same across LinkedIn / Instagram / X / Facebook for entity reconciliation.",
      "Posts should reference the brand site URL at least sometimes; AI engines build entity graphs from this.",
    ],
    dont_do: [
      "Do not use platform-specific bios that contradict the canonical version.",
      "Do not let profiles go inactive for 6+ months. Engines treat inactive as defunct.",
    ],
  },

  "review-aggregator": {
    action: (s, c) => `Claim listing if not already; collect reviews from real customers; respond to all reviews.`,
    angle: (s, c) => `Review aggregators are heavily weighted for software / SaaS / B2B citation. Empty listings get cited as "exists but unrated"; populated listings get cited with sentiment context.`,
    tone_notes: [
      "Owner responses signal active brand presence to AI engines.",
      "Encourage reviewers to mention specific use cases, not just star ratings.",
    ],
    dont_do: [
      "Do not pay for reviews. Detection is good and removal cascades.",
    ],
  },

  "industry-publication": {
    action: (s, c) => `Pitch contributed content (op-ed, byline) or get coverage in feature stories. One feature in HBR / TechCrunch / etc. compounds for 12+ months.`,
    angle: (s, c) => `Industry publications are the highest-weighted citation source for their category. AI engines treat them as authority on subject-matter expertise.`,
    tone_notes: [
      "Pitch a specific reporter / editor with a specific angle. Cold blasts get ignored.",
      "Contributed content needs a real point of view, not a feature pitch.",
    ],
    dont_do: [
      "Do not pitch product news as a feature story. Wrong desk.",
      "Do not use AI-generated drafts. Editors reject and the relationship goes cold.",
    ],
  },

  yelp: {
    action: (s, c) => `Claim the listing, populate hours / photos / categories, respond to reviews. For B2B less impactful than for consumer.`,
    angle: (s, c) => `Yelp citation strength is local-consumer biased. High signal for restaurants / venues / services; weaker for B2B.`,
    tone_notes: ["Same culture as TripAdvisor — review density and recency matter."],
    dont_do: ["Do not buy reviews. Yelp's filter is aggressive."],
  },

  youtube: {
    action: (s, c) => `Audit YouTube presence. AI engines cite YouTube for product walkthroughs, tutorials, and category explainers.`,
    angle: (s, c) => `Underused source. A single well-titled tutorial that ranks for 'how to X' in your category becomes a citation channel for years.`,
    tone_notes: [
      "Title and description carry most of the citation signal -- the video itself less so until transcripts mature.",
      "Closed captions / transcripts are crawled; upload accurate ones.",
    ],
    dont_do: [
      "Do not stuff keywords. AI engines learn what query the video actually answers from comments and watch-time.",
    ],
  },

  other: {
    action: (s, c) => `Investigate. Source type unclassified -- needs a manual look to decide if it's high-value, low-value, or new-category-worthy.`,
    angle: (s, c) => `Unrecognized source domain. Could be a high-leverage niche site we haven't classified yet, or noise. Open the example URLs and classify.`,
    tone_notes: [
      "Add the domain to source-types.mjs once classified so future briefs benefit.",
    ],
    dont_do: [
      "Do not act on a brief for an unclassified source without verifying the type first.",
    ],
  },
};

/**
 * Render a single brief as markdown. Mirrors the reddit-tracker brief
 * markdown shape so the two outputs feel like one product.
 */
export function renderSourceBriefMarkdown(brief) {
  const lines = [];
  lines.push(`### ${brief.source_label} -- ${brief.domain}`);
  lines.push("");
  lines.push(`**Action:** ${brief.action}`);
  lines.push("");
  lines.push(`**Gap.** ${brief.gap}`);
  lines.push("");
  lines.push(`**Angle.** ${brief.angle}`);
  lines.push("");
  lines.push(`**Tone notes.**`);
  for (const t of brief.tone_notes) lines.push(`- ${t}`);
  lines.push("");
  lines.push(`**Don't-do.**`);
  for (const d of brief.dont_do) lines.push(`- ${d}`);
  lines.push("");
  lines.push(`**Evidence.**`);
  lines.push(`- Cited in ${brief.evidence.runs_citing_source} runs across ${brief.evidence.engines.join(", ")}`);
  lines.push(`- Client named in ${brief.evidence.client_named_runs} of those (${Math.round(brief.evidence.client_named_ratio * 100)}%)`);
  lines.push(`- Keywords: ${brief.evidence.keywords.slice(0, 4).join(" / ")}${brief.evidence.keywords.length > 4 ? ` (+ ${brief.evidence.keywords.length - 4} more)` : ""}`);
  if (brief.evidence.example_urls.length > 0) {
    lines.push(`- Example: ${brief.evidence.example_urls[0]}`);
  }
  lines.push("");
  return lines.join("\n");
}
