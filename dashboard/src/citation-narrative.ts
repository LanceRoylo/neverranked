/**
 * Dashboard -- Citation narrative intelligence
 *
 * Translates raw citation tracking data into plain-English context
 * that explains what the numbers mean and what to do about them.
 * Same philosophy as narrative.ts but for citation share data.
 */

export interface CitationNarrative {
  headline: string;
  summary: string;
  competitorInsight: string;
  keywordInsight: string;
  engineInsight: string;
  nextSteps: { action: string; reason: string }[];
}

interface KeywordResult {
  keyword: string;
  keyword_id: number;
  cited: boolean;
  engines: string[];
}

interface CompetitorEntry {
  name: string;
  count: number;
}

interface EngineData {
  queries: number;
  citations: number;
}

export function generateCitationNarrative(
  citationShare: number,
  previousShare: number | null,
  totalQueries: number,
  clientCitations: number,
  topCompetitors: CompetitorEntry[],
  keywordBreakdown: KeywordResult[],
  enginesBreakdown: Record<string, EngineData>,
  clientSlug: string
): CitationNarrative {
  const sharePct = (citationShare * 100).toFixed(0);
  const citedKeywords = keywordBreakdown.filter(k => k.cited);
  const uncitedKeywords = keywordBreakdown.filter(k => !k.cited);

  // --- Headline ---
  const headline = buildHeadline(citationShare, previousShare, clientCitations, totalQueries);

  // --- Summary ---
  const summary = buildSummary(
    citationShare, previousShare, totalQueries, clientCitations,
    citedKeywords, uncitedKeywords, topCompetitors, clientSlug
  );

  // --- Competitor insight ---
  const competitorInsight = buildCompetitorInsight(topCompetitors, citationShare);

  // --- Keyword insight ---
  const keywordInsight = buildKeywordInsight(citedKeywords, uncitedKeywords);

  // --- Engine insight ---
  const engineInsight = buildEngineInsight(enginesBreakdown);

  // --- Next steps ---
  const nextSteps = buildNextSteps(
    citationShare, citedKeywords, uncitedKeywords,
    topCompetitors, enginesBreakdown
  );

  return { headline, summary, competitorInsight, keywordInsight, engineInsight, nextSteps };
}

// ---------------------------------------------------------------------------
// Headline
// ---------------------------------------------------------------------------

function buildHeadline(
  share: number,
  prevShare: number | null,
  citations: number,
  totalQueries: number
): string {
  const pct = (share * 100).toFixed(0);

  if (prevShare !== null) {
    const prevPct = (prevShare * 100).toFixed(0);
    const diff = Number(pct) - Number(prevPct);
    if (diff > 5) return `Citation share jumped to ${pct}%`;
    if (diff > 0) return `Citation share ticked up to ${pct}%`;
    if (diff === 0) return `Citation share held steady at ${pct}%`;
    if (diff > -5) return `Citation share dipped to ${pct}%`;
    return `Citation share dropped to ${pct}%`;
  }

  if (share === 0) return "Not yet cited by AI engines";
  if (share < 0.1) return `Appearing in ${pct}% of tracked queries`;
  if (share < 0.3) return `Building presence at ${pct}% citation share`;
  if (share < 0.5) return `Solid visibility at ${pct}% citation share`;
  return `Strong position at ${pct}% citation share`;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(
  share: number,
  prevShare: number | null,
  totalQueries: number,
  clientCitations: number,
  cited: KeywordResult[],
  uncited: KeywordResult[],
  competitors: CompetitorEntry[],
  slug: string
): string {
  const parts: string[] = [];
  const totalKeywords = cited.length + uncited.length;

  // Opening context
  if (share === 0 && prevShare === null) {
    parts.push(
      `This is the first citation scan for ${slug}. AI engines like ChatGPT and Perplexity were queried ${totalQueries} times across ${totalKeywords} keywords. None of the responses cited ${slug} directly.`
    );
    parts.push(
      "This is normal for newer sites or businesses that have not yet built enough external authority and structured data for AI models to recommend by name."
    );
  } else if (share === 0) {
    parts.push(
      `${slug} was not cited in any of the ${totalQueries} queries this week. AI engines are answering these questions but recommending other sources.`
    );
  } else if (cited.length > 0) {
    parts.push(
      `${slug} was cited in ${clientCitations} of ${totalQueries} queries (${(share * 100).toFixed(0)}% citation share), appearing in responses for ${cited.length} of ${totalKeywords} tracked keywords.`
    );
  }

  // What competitors are doing
  if (competitors.length > 0 && share < 0.5) {
    const topName = competitors[0].name;
    const topCount = competitors[0].count;
    parts.push(
      `The most frequently cited source was ${topName} with ${topCount} mentions across both engines. Studying what content and structure they have that ${slug} does not is the fastest path to increasing citation share.`
    );
  }

  // Trend context
  if (prevShare !== null) {
    const diff = share - prevShare;
    if (diff > 0.05) {
      parts.push("Citation share is trending up, which means the AEO work is getting traction with AI models.");
    } else if (diff > 0) {
      parts.push("Small gains in citation share. Consistency matters here more than speed.");
    } else if (diff === 0) {
      parts.push("No change in citation share from last week. This is common during the first 30-60 days of AEO work.");
    } else if (diff > -0.05) {
      parts.push("Slight dip in citation share. AI responses are non-deterministic, so small fluctuations are normal.");
    } else {
      parts.push("Notable drop in citation share. Worth investigating whether competitors published new content or if site changes affected structured data.");
    }
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Competitor insight
// ---------------------------------------------------------------------------

function buildCompetitorInsight(competitors: CompetitorEntry[], share: number): string {
  if (competitors.length === 0) {
    return "No competitor entities were detected in AI responses. This may mean the queries are too broad or the AI models are giving general advice rather than naming specific businesses.";
  }

  const parts: string[] = [];
  const topThree = competitors.slice(0, 3);

  if (share === 0) {
    parts.push(
      `AI engines are currently recommending ${competitors.length} other sources instead. The top cited are ${topThree.map(c => c.name).join(", ")}.`
    );
    parts.push(
      "These are the businesses and publishers that have already established the authority signals AI models look for: consistent entity data, comprehensive structured markup, and content that directly answers the queries being tracked."
    );
  } else {
    parts.push(
      `${competitors.length} competitor sources were also cited. The most frequently mentioned are ${topThree.map(c => `${c.name} (${c.count} mentions)`).join(", ")}.`
    );
  }

  // Identify competitor types
  const domains = competitors.filter(c => c.name.includes("."));
  const brands = competitors.filter(c => !c.name.includes("."));
  if (domains.length > 0 && brands.length > 0) {
    parts.push(
      "The competitor mix includes both direct business competitors and industry publications. Both are worth analyzing for content gaps."
    );
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Keyword insight
// ---------------------------------------------------------------------------

function buildKeywordInsight(cited: KeywordResult[], uncited: KeywordResult[]): string {
  const total = cited.length + uncited.length;

  if (cited.length === 0) {
    return `None of the ${total} tracked keywords resulted in a citation. This means the AI models are aware of the topics but are citing other sources as authorities. The gap is in authority signals, not relevance.`;
  }

  if (uncited.length === 0) {
    return `All ${total} tracked keywords resulted in at least one citation. This is strong coverage. Consider adding more long-tail and competitor-focused keywords to find the edges of your citation territory.`;
  }

  const citedList = cited.slice(0, 3).map(k => `"${k.keyword}"`).join(", ");
  const uncitedList = uncited.slice(0, 3).map(k => `"${k.keyword}"`).join(", ");

  const parts: string[] = [];
  parts.push(`Cited for ${cited.length} of ${total} keywords: ${citedList}${cited.length > 3 ? ` and ${cited.length - 3} more` : ""}.`);
  parts.push(`Not cited for: ${uncitedList}${uncited.length > 3 ? ` and ${uncited.length - 3} more` : ""}.`);

  // Engine-specific patterns
  const perplexityOnly = cited.filter(k => k.engines.includes("perplexity") && !k.engines.includes("openai"));
  const openaiOnly = cited.filter(k => k.engines.includes("openai") && !k.engines.includes("perplexity"));
  if (perplexityOnly.length > 0 && openaiOnly.length === 0) {
    parts.push("Citations are coming from Perplexity only, which suggests the site has good web presence but may lack the entity-level authority ChatGPT relies on.");
  } else if (openaiOnly.length > 0 && perplexityOnly.length === 0) {
    parts.push("Citations are coming from ChatGPT only. Perplexity relies more heavily on real-time web data and source URLs, so improving external link presence and citation sources would help there.");
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Engine insight
// ---------------------------------------------------------------------------

function buildEngineInsight(engines: Record<string, EngineData>): string {
  const engineNames = Object.keys(engines);
  if (engineNames.length === 0) return "No engine data available.";

  const parts: string[] = [];

  for (const [name, data] of Object.entries(engines)) {
    const share = data.queries > 0 ? ((data.citations / data.queries) * 100).toFixed(0) : "0";
    const displayName = name === "openai" ? "ChatGPT" : name === "perplexity" ? "Perplexity" : name === "anthropic" ? "Claude" : name === "gemini" ? "Gemini" : name;
    parts.push(`${displayName}: ${share}% citation rate (${data.citations}/${data.queries} queries).`);
  }

  // Compare engines
  const entries = Object.entries(engines);
  if (entries.length >= 2) {
    const sorted = entries.sort((a, b) => {
      const shareA = a[1].queries > 0 ? a[1].citations / a[1].queries : 0;
      const shareB = b[1].queries > 0 ? b[1].citations / b[1].queries : 0;
      return shareB - shareA;
    });
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const bestShare = best[1].queries > 0 ? best[1].citations / best[1].queries : 0;
    const worstShare = worst[1].queries > 0 ? worst[1].citations / worst[1].queries : 0;

    if (bestShare > worstShare && bestShare > 0) {
      const bestName = best[0] === "openai" ? "ChatGPT" : best[0] === "perplexity" ? "Perplexity" : best[0];
      const worstName = worst[0] === "openai" ? "ChatGPT" : worst[0] === "perplexity" ? "Perplexity" : worst[0];
      parts.push(`Stronger presence on ${bestName} than ${worstName}. Each engine weights different authority signals, so this gap indicates where to focus optimization.`);
    }
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Next steps
// ---------------------------------------------------------------------------

function buildNextSteps(
  share: number,
  cited: KeywordResult[],
  uncited: KeywordResult[],
  competitors: CompetitorEntry[],
  engines: Record<string, EngineData>
): { action: string; reason: string }[] {
  const steps: { action: string; reason: string }[] = [];

  if (share === 0) {
    steps.push({
      action: "Analyze the top 3 cited competitors to identify content and schema gaps",
      reason: "The businesses getting cited have something your site does not. The fastest path to citations is closing those specific gaps rather than guessing."
    });
    steps.push({
      action: "Create comprehensive, question-answering content for your top keywords",
      reason: "AI engines cite content that directly answers the query. Thin service pages do not get cited. Long-form, expert content does."
    });
    steps.push({
      action: "Build external entity signals (directory listings, press mentions, industry profiles)",
      reason: "AI models cross-reference multiple sources before recommending a business. If you only exist on your own website, that is not enough for a citation."
    });
  } else if (share < 0.2) {
    steps.push({
      action: "Double down on the keywords where you are already cited",
      reason: "You have initial traction. Reinforcing the topics where AI already trusts you is easier than breaking into new ones."
    });
    if (uncited.length > 0) {
      steps.push({
        action: `Target the ${uncited.length} keywords where you are not yet cited`,
        reason: "These are the growth opportunities. Look at what the cited competitors are doing for these specific queries that you are not."
      });
    }
  } else if (share < 0.5) {
    steps.push({
      action: "Expand your keyword tracking to find the edges of your citation territory",
      reason: "With solid base coverage, the next step is finding long-tail and adjacent queries where you can win additional citations."
    });
  } else {
    steps.push({
      action: "Monitor weekly for regression and defend your position",
      reason: "At this citation share, the priority shifts from gaining to maintaining. Watch for new competitors entering your keyword space."
    });
  }

  // Engine-specific advice
  const pplx = engines["perplexity"];
  const oai = engines["openai"];
  if (pplx && oai) {
    const pplxShare = pplx.queries > 0 ? pplx.citations / pplx.queries : 0;
    const oaiShare = oai.queries > 0 ? oai.citations / oai.queries : 0;
    if (pplxShare > oaiShare + 0.1) {
      steps.push({
        action: "Focus on entity consistency to improve ChatGPT citations",
        reason: "ChatGPT relies more heavily on training data and entity knowledge graphs than real-time web data. Ensure your business appears consistently across authoritative directories and data sources."
      });
    } else if (oaiShare > pplxShare + 0.1) {
      steps.push({
        action: "Improve web presence and external links for better Perplexity citations",
        reason: "Perplexity uses real-time web search, so it favors sites with strong external link profiles and frequently updated content."
      });
    }
  }

  return steps;
}
