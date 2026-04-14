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
  outlook: string;
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

export interface AeoContext {
  aeoScore: number;
  grade: string;
  redFlagCount: number;
  schemaCount: number;
}

export function generateCitationNarrative(
  citationShare: number,
  previousShare: number | null,
  totalQueries: number,
  clientCitations: number,
  topCompetitors: CompetitorEntry[],
  keywordBreakdown: KeywordResult[],
  enginesBreakdown: Record<string, EngineData>,
  clientSlug: string,
  aeoContext?: AeoContext | null
): CitationNarrative {
  const sharePct = (citationShare * 100).toFixed(0);
  const citedKeywords = keywordBreakdown.filter(k => k.cited);
  const uncitedKeywords = keywordBreakdown.filter(k => !k.cited);

  // --- Headline ---
  const headline = buildHeadline(citationShare, previousShare, clientCitations, totalQueries);

  // --- Summary ---
  const summary = buildSummary(
    citationShare, previousShare, totalQueries, clientCitations,
    citedKeywords, uncitedKeywords, topCompetitors, clientSlug, aeoContext
  );

  // --- Competitor insight ---
  const competitorInsight = buildCompetitorInsight(topCompetitors, citationShare);

  // --- Keyword insight ---
  const keywordInsight = buildKeywordInsight(citedKeywords, uncitedKeywords);

  // --- Engine insight ---
  const engineInsight = buildEngineInsight(enginesBreakdown);

  // --- Outlook ---
  const outlook = buildOutlook(
    citationShare, previousShare, citedKeywords, uncitedKeywords,
    topCompetitors, enginesBreakdown, aeoContext
  );

  // --- Next steps ---
  const nextSteps = buildNextSteps(
    citationShare, citedKeywords, uncitedKeywords,
    topCompetitors, enginesBreakdown, aeoContext
  );

  return { headline, summary, outlook, competitorInsight, keywordInsight, engineInsight, nextSteps };
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
  slug: string,
  aeo?: AeoContext | null
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

  // AEO score cross-reference
  if (aeo) {
    if (aeo.aeoScore >= 70 && share === 0) {
      parts.push(
        "Your site scores " + aeo.aeoScore + "/100 on AEO readiness (grade " + aeo.grade + "), which means the technical foundation is solid. The gap between a good readiness score and actually being cited usually comes down to external authority: AI models need to see your business mentioned and linked across multiple third-party sources before they trust it enough to recommend by name."
      );
    } else if (aeo.aeoScore >= 70 && share > 0 && share < 0.3) {
      parts.push(
        "Your AEO readiness score of " + aeo.aeoScore + "/100 supports the citations you are earning. Continued improvements in content depth and external authority will push citation share higher."
      );
    } else if (aeo.aeoScore < 50 && share === 0) {
      parts.push(
        "Your site currently scores " + aeo.aeoScore + "/100 on AEO readiness (grade " + aeo.grade + "), which means there are foundational technical issues holding you back. AI engines cannot cite a site they cannot properly read. Fixing the " + aeo.redFlagCount + " red flag" + (aeo.redFlagCount !== 1 ? "s" : "") + " and adding structured data is the first step before citation share can improve."
      );
    } else if (aeo.aeoScore < 50 && share > 0) {
      parts.push(
        "Notably, your site is earning some citations despite a low AEO readiness score of " + aeo.aeoScore + "/100. This suggests your brand has external authority that AI models are picking up on. Improving the technical foundation would amplify that signal significantly."
      );
    } else if (aeo.aeoScore >= 50 && aeo.aeoScore < 70 && share === 0) {
      parts.push(
        "Your AEO readiness score of " + aeo.aeoScore + "/100 is moderate. The technical foundation is partially there but has gaps. " + (aeo.redFlagCount > 0 ? "Resolving the " + aeo.redFlagCount + " remaining red flag" + (aeo.redFlagCount !== 1 ? "s" : "") + " and expanding schema coverage from " + aeo.schemaCount + " type" + (aeo.schemaCount !== 1 ? "s" : "") + " would strengthen the signals AI engines rely on." : "Expanding schema coverage and content depth would strengthen the signals AI engines need to cite your business.")
      );
    }
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

// ---------------------------------------------------------------------------
// Outlook (forward-looking, honest, soft)
// ---------------------------------------------------------------------------

function buildOutlook(
  share: number,
  prevShare: number | null,
  cited: KeywordResult[],
  uncited: KeywordResult[],
  competitors: CompetitorEntry[],
  engines: Record<string, EngineData>,
  aeo?: AeoContext | null
): string {
  const parts: string[] = [];
  const totalKeywords = cited.length + uncited.length;
  const engineCount = Object.keys(engines).length;

  // ------ Zero state: first scan, no citations yet ------
  if (share === 0 && prevShare === null) {
    parts.push(
      "This is the baseline. Every business starts here. The value of this first scan is not the score itself but the fact that you now have a clear, measurable starting point."
    );
    if (aeo && aeo.aeoScore >= 60) {
      parts.push(
        "Your technical readiness is already in a solid place. As content authority and external signals build over the coming weeks, the citation share will follow. Most businesses in a similar position begin seeing their first AI citations within 4-8 weeks of consistent optimization."
      );
    } else if (aeo && aeo.aeoScore >= 40) {
      parts.push(
        "The foundation is partially built. As the roadmap items are completed and the site's structured data improves, AI engines will have more to work with. The typical timeline from here to first citations is 6-10 weeks, depending on how quickly the technical gaps close."
      );
    } else {
      parts.push(
        "There is real work to do on the technical side, and that is exactly why this tracking exists. As each piece of the foundation gets built, the data here will reflect it. First citations typically appear 8-12 weeks into the optimization process."
      );
    }
    if (competitors.length > 0) {
      parts.push(
        "The competitors already showing up in AI responses give you a roadmap. What they have built is visible and replicable."
      );
    }
    return parts.join(" ");
  }

  // ------ Zero state: not first scan, still no citations ------
  if (share === 0 && prevShare !== null) {
    parts.push(
      "No citations this week, but that does not mean the work is not moving. AI models update their understanding of the web on their own timeline. The optimizations being made now are building toward a threshold. Once that threshold is crossed, citations tend to come in clusters rather than one at a time."
    );
    if (aeo && aeo.aeoScore > (prevShare !== null ? 50 : 0)) {
      parts.push(
        "The AEO readiness score shows the site is improving technically. That progress will translate to citations as the external authority signals catch up."
      );
    }
    return parts.join(" ");
  }

  // ------ Has citations, trending up ------
  if (prevShare !== null && share > prevShare) {
    const gain = share - prevShare;
    const gainPts = (gain * 100).toFixed(1);
    parts.push(
      "Citation share grew by " + gainPts + " points this week. That is real momentum."
    );
    if (share < 0.15) {
      parts.push(
        "Early gains like this are significant because they show AI engines are starting to recognize and trust your site. The first citations are the hardest to earn. Each one after gets easier as the authority compounds."
      );
    } else if (share < 0.4) {
      parts.push(
        "At this pace, the trajectory is strong. Continued work on the roadmap items and keyword coverage will keep pushing citation share up. The businesses that reach 30-40% citation share typically see measurable lead impact from AI-driven referrals."
      );
    } else {
      parts.push(
        "This is a strong position. The focus now shifts from building to maintaining and expanding into adjacent keyword territory."
      );
    }
    return parts.join(" ");
  }

  // ------ Has citations, flat or first scan with citations ------
  if (share > 0 && (prevShare === null || share === prevShare)) {
    const pct = (share * 100).toFixed(0);
    if (prevShare === null) {
      parts.push(
        "Starting at " + pct + "% citation share means AI engines are already aware of your business. That is a better starting position than most. The work ahead is about expanding which keywords trigger citations and making sure the coverage is consistent across all " + engineCount + " AI engines being tracked."
      );
    } else {
      parts.push(
        "Citation share held steady at " + pct + "%. Stability is not stagnation. It means the current authority signals are holding. The next move is expanding into the " + uncited.length + " keyword" + (uncited.length !== 1 ? "s" : "") + " where you are not yet cited."
      );
    }
    return parts.join(" ");
  }

  // ------ Has citations, trending down ------
  if (prevShare !== null && share < prevShare && share > 0) {
    const lossPts = ((prevShare - share) * 100).toFixed(1);
    parts.push(
      "Citation share dipped " + lossPts + " points this week. Small fluctuations are normal because AI responses are non-deterministic. The same query can produce different results on different days."
    );
    parts.push(
      "What matters is the trend over 4-6 weeks, not any single week. If the dip continues, it is worth investigating whether competitors published new content or whether any site changes affected structured data."
    );
    return parts.join(" ");
  }

  // ------ Had citations, lost them all ------
  if (share === 0 && prevShare !== null && prevShare > 0) {
    parts.push(
      "Citations dropped to zero this week after " + (prevShare * 100).toFixed(0) + "% last week. This can happen when AI models refresh their source data or when competitors improve. It does not erase the progress that has been made."
    );
    parts.push(
      "The authority signals your site has built are still there. Check whether any recent site changes may have affected structured data, and continue the roadmap work. Citations often return once the model's next update cycle picks up the latest signals."
    );
    return parts.join(" ");
  }

  return "The tracking data will become more meaningful over the next few weeks as patterns emerge across multiple scans.";
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
  engines: Record<string, EngineData>,
  aeo?: AeoContext | null
): { action: string; reason: string }[] {
  const steps: { action: string; reason: string }[] = [];

  // AEO-specific steps come first when score is low
  if (aeo && aeo.aeoScore < 50 && aeo.redFlagCount > 0) {
    steps.push({
      action: "Fix the " + aeo.redFlagCount + " technical red flag" + (aeo.redFlagCount !== 1 ? "s" : "") + " on your site",
      reason: "AI engines skip sites with broken structured data, missing meta information, or poor accessibility. These red flags are actively preventing citations regardless of content quality."
    });
  }
  if (aeo && aeo.schemaCount < 3) {
    steps.push({
      action: "Add more structured data types (currently " + aeo.schemaCount + ")",
      reason: "AI models use structured data to understand what your business does, where you operate, and what services you offer. More schema types give AI engines more reasons to cite you."
    });
  }

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
