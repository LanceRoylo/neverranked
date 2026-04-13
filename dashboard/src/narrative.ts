/**
 * Dashboard — Narrative intelligence layer
 *
 * Translates raw scan data into plain-English stories that clients
 * can forward to their boss without explanation.
 */

import type { ScanResult } from "./types";

interface TechnicalSignal {
  label: string;
  value: string;
  status: string;
}

interface SchemaItem {
  type: string;
  present: boolean;
}

interface ChangeItem {
  type: "improved" | "regressed" | "new_issue" | "resolved";
  text: string;
}

interface NarrativeAction {
  priority: number; // 1 = highest
  action: string;
  reason: string;
  impact: "high" | "medium" | "low";
}

interface Narrative {
  summary: string;
  changes: ChangeItem[];
  actions: NarrativeAction[];
}

// --- Grade thresholds for language ---

function gradeLanguage(grade: string): string {
  switch (grade) {
    case "A": return "excellent";
    case "B": return "strong";
    case "C": return "moderate";
    case "D": return "weak";
    case "F": return "poor";
    default: return "unknown";
  }
}

function scoreDirection(current: number, previous: number): string {
  const diff = current - previous;
  if (diff > 15) return "jumped significantly";
  if (diff > 5) return "improved";
  if (diff > 0) return "ticked up slightly";
  if (diff === 0) return "held steady";
  if (diff > -5) return "dipped slightly";
  if (diff > -15) return "declined";
  return "dropped significantly";
}

// --- Executive summary ---

function buildSummary(
  domain: string,
  latest: ScanResult,
  previous: ScanResult | null
): string {
  const redFlags: string[] = JSON.parse(latest.red_flags);
  const techSignals: TechnicalSignal[] = JSON.parse(latest.technical_signals);
  const schemaCoverage: SchemaItem[] = JSON.parse(latest.schema_coverage);

  const presentSchemas = schemaCoverage.filter(s => s.present).map(s => s.type);
  const missingSchemas = schemaCoverage.filter(s => !s.present).map(s => s.type);
  const badSignals = techSignals.filter(s => s.status === "bad");
  const warnSignals = techSignals.filter(s => s.status === "warning");

  const parts: string[] = [];

  // Opening line: score context
  if (previous && !previous.error) {
    const diff = latest.aeo_score - previous.aeo_score;
    const dir = scoreDirection(latest.aeo_score, previous.aeo_score);

    if (diff !== 0) {
      parts.push(
        `${domain} scored ${latest.aeo_score}/100 (${latest.grade}), ${dir} by ${Math.abs(diff)} points since the last scan.`
      );
    } else {
      parts.push(
        `${domain} held steady at ${latest.aeo_score}/100 (${latest.grade}) with no score change since the last scan.`
      );
    }
  } else {
    parts.push(
      `${domain} scored ${latest.aeo_score}/100 (${latest.grade}), which is ${gradeLanguage(latest.grade)} AEO readiness.`
    );
  }

  // Schema coverage line
  if (presentSchemas.length > 0 && missingSchemas.length > 0) {
    if (presentSchemas.length >= 4) {
      parts.push(
        `Schema coverage is solid with ${presentSchemas.length} types detected, though ${joinList(missingSchemas)} ${missingSchemas.length === 1 ? "is" : "are"} still missing.`
      );
    } else {
      parts.push(
        `Only ${presentSchemas.length} schema ${presentSchemas.length === 1 ? "type was" : "types were"} detected. Adding ${joinList(missingSchemas)} would strengthen AI engine visibility.`
      );
    }
  } else if (presentSchemas.length > 0) {
    parts.push(`All tracked schema types are present, which is a strong foundation for AI discovery.`);
  } else {
    parts.push(`No structured data was detected. Schema markup is the single biggest lever for AEO improvement.`);
  }

  // Red flags line
  if (redFlags.length === 0) {
    parts.push("No red flags were found.");
  } else if (redFlags.length <= 2) {
    parts.push(
      `${redFlags.length} red ${redFlags.length === 1 ? "flag was" : "flags were"} found: ${joinList(redFlags.map(simplifyFlag))}.`
    );
  } else {
    const top2 = redFlags.slice(0, 2).map(simplifyFlag);
    parts.push(
      `${redFlags.length} red flags were found, led by ${joinList(top2)}. See the full list below.`
    );
  }

  // What it takes to improve
  if (latest.grade !== "A" && latest.aeo_score < 95) {
    const quickWins = getQuickWins(redFlags, missingSchemas, badSignals);
    if (quickWins.length > 0) {
      const winsText = quickWins.slice(0, 2).join(" and ");
      parts.push(`Biggest opportunity: ${winsText}.`);
    }
  }

  return parts.join(" ");
}

// --- What changed between scans ---

function buildChanges(latest: ScanResult, previous: ScanResult): ChangeItem[] {
  const changes: ChangeItem[] = [];

  const currFlags: string[] = JSON.parse(latest.red_flags);
  const prevFlags: string[] = JSON.parse(previous.red_flags);
  const currSchema: SchemaItem[] = JSON.parse(latest.schema_coverage);
  const prevSchema: SchemaItem[] = JSON.parse(previous.schema_coverage);
  const currSignals: TechnicalSignal[] = JSON.parse(latest.technical_signals);
  const prevSignals: TechnicalSignal[] = JSON.parse(previous.technical_signals);

  // Score change
  const diff = latest.aeo_score - previous.aeo_score;
  if (diff > 0) {
    changes.push({ type: "improved", text: `Score increased ${diff} points (${previous.aeo_score} to ${latest.aeo_score})` });
  } else if (diff < 0) {
    changes.push({ type: "regressed", text: `Score decreased ${Math.abs(diff)} points (${previous.aeo_score} to ${latest.aeo_score})` });
  }

  // Grade change
  if (latest.grade !== previous.grade) {
    const better = gradeToNum(latest.grade) > gradeToNum(previous.grade);
    changes.push({
      type: better ? "improved" : "regressed",
      text: `Grade ${better ? "upgraded" : "dropped"} from ${previous.grade} to ${latest.grade}`
    });
  }

  // New schemas added
  for (const curr of currSchema) {
    const prev = prevSchema.find(p => p.type === curr.type);
    if (curr.present && prev && !prev.present) {
      changes.push({ type: "improved", text: `${curr.type} schema was added` });
    }
    if (!curr.present && prev && prev.present) {
      changes.push({ type: "regressed", text: `${curr.type} schema was removed` });
    }
  }

  // Red flags resolved
  for (const pf of prevFlags) {
    if (!currFlags.some(cf => flagsMatch(cf, pf))) {
      changes.push({ type: "resolved", text: `Resolved: ${simplifyFlag(pf)}` });
    }
  }

  // New red flags
  for (const cf of currFlags) {
    if (!prevFlags.some(pf => flagsMatch(cf, pf))) {
      changes.push({ type: "new_issue", text: `New issue: ${simplifyFlag(cf)}` });
    }
  }

  // Signal status changes
  for (const cs of currSignals) {
    const ps = prevSignals.find(p => p.label === cs.label);
    if (ps) {
      if (cs.status === "good" && ps.status !== "good") {
        changes.push({ type: "improved", text: `${cs.label} is now passing` });
      } else if (cs.status === "bad" && ps.status !== "bad") {
        changes.push({ type: "regressed", text: `${cs.label} is now failing` });
      }
    }
  }

  return changes;
}

// --- Prioritized next actions ---

function buildActions(latest: ScanResult): NarrativeAction[] {
  const actions: NarrativeAction[] = [];
  const redFlags: string[] = JSON.parse(latest.red_flags);
  const techSignals: TechnicalSignal[] = JSON.parse(latest.technical_signals);
  const schemaCoverage: SchemaItem[] = JSON.parse(latest.schema_coverage);
  const missingSchemas = schemaCoverage.filter(s => !s.present);
  const badSignals = techSignals.filter(s => s.status === "bad");
  const warnSignals = techSignals.filter(s => s.status === "warning");

  let priority = 1;

  // High-impact schema additions
  const criticalMissing = missingSchemas.filter(s =>
    ["Organization", "WebSite", "FAQPage", "Article"].includes(s.type)
  );
  if (criticalMissing.length > 0) {
    actions.push({
      priority: priority++,
      action: `Add ${joinList(criticalMissing.map(s => s.type))} schema markup`,
      reason: `These are the schema types AI engines rely on most heavily for understanding and citing your site.`,
      impact: "high"
    });
  }

  // Bad technical signals
  for (const sig of badSignals) {
    const actionText = signalAction(sig);
    if (actionText) {
      actions.push({
        priority: priority++,
        action: actionText.action,
        reason: actionText.reason,
        impact: "high"
      });
    }
  }

  // Red flag actions (group similar ones)
  const flagGroups = groupFlags(redFlags);
  for (const group of flagGroups) {
    actions.push({
      priority: priority++,
      action: group.action,
      reason: group.reason,
      impact: group.count > 2 ? "high" : "medium"
    });
  }

  // Warning signals
  for (const sig of warnSignals) {
    const actionText = signalAction(sig);
    if (actionText) {
      actions.push({
        priority: priority++,
        action: actionText.action,
        reason: actionText.reason,
        impact: "medium"
      });
    }
  }

  // Nice-to-have schema
  const niceMissing = missingSchemas.filter(s =>
    !["Organization", "WebSite", "FAQPage", "Article"].includes(s.type)
  );
  if (niceMissing.length > 0) {
    actions.push({
      priority: priority++,
      action: `Add ${joinList(niceMissing.map(s => s.type))} schema for additional coverage`,
      reason: `These provide supplementary signals that help AI engines build richer context about your site.`,
      impact: "low"
    });
  }

  return actions;
}

// --- Helper functions ---

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function simplifyFlag(flag: string): string {
  // Trim common prefixes and make more conversational
  return flag
    .replace(/^Missing\s+/i, "missing ")
    .replace(/^No\s+/i, "no ")
    .replace(/^Low\s+/i, "low ");
}

function flagsMatch(a: string, b: string): boolean {
  // Fuzzy match -- same flag text (trimmed, lowered)
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function gradeToNum(grade: string): number {
  switch (grade) {
    case "A": return 5;
    case "B": return 4;
    case "C": return 3;
    case "D": return 2;
    case "F": return 1;
    default: return 0;
  }
}

function getQuickWins(redFlags: string[], missingSchemas: string[], badSignals: TechnicalSignal[]): string[] {
  const wins: string[] = [];

  if (missingSchemas.some(s => ["Organization", "WebSite"].includes(s))) {
    wins.push("adding Organization and WebSite schema");
  }
  if (missingSchemas.some(s => s === "FAQPage")) {
    wins.push("adding FAQ schema to key pages");
  }

  const metaFlag = redFlags.find(f => /meta description/i.test(f));
  if (metaFlag) {
    wins.push("writing meta descriptions for pages that are missing them");
  }

  const titleFlag = redFlags.find(f => /title/i.test(f));
  if (titleFlag) {
    wins.push("fixing page title issues");
  }

  for (const sig of badSignals) {
    if (/robots/i.test(sig.label)) {
      wins.push("adding a robots.txt that allows AI crawlers");
    }
    if (/sitemap/i.test(sig.label)) {
      wins.push("adding an XML sitemap");
    }
    if (/ssl|https/i.test(sig.label)) {
      wins.push("enabling HTTPS");
    }
  }

  return wins;
}

function signalAction(sig: TechnicalSignal): { action: string; reason: string } | null {
  const label = sig.label.toLowerCase();

  if (label.includes("robots")) {
    return {
      action: "Configure robots.txt to allow AI crawlers",
      reason: "Without a proper robots.txt, AI engines like ChatGPT and Perplexity may not be able to index your content."
    };
  }
  if (label.includes("sitemap")) {
    return {
      action: "Add an XML sitemap and reference it in robots.txt",
      reason: "Sitemaps help AI engines discover all your important pages efficiently."
    };
  }
  if (label.includes("ssl") || label.includes("https")) {
    return {
      action: "Enable HTTPS across the entire site",
      reason: "AI engines and search engines strongly prefer secure sites. This affects both trust signals and ranking."
    };
  }
  if (label.includes("canonical")) {
    return {
      action: "Add canonical tags to prevent duplicate content issues",
      reason: "Without canonical tags, AI engines may index the wrong version of your pages or split authority across duplicates."
    };
  }
  if (label.includes("open graph") || label.includes("og:")) {
    return {
      action: "Add Open Graph meta tags for better social and AI previews",
      reason: "Open Graph tags give AI engines structured metadata about your pages, improving how they reference your content."
    };
  }
  if (label.includes("lang")) {
    return {
      action: "Set the html lang attribute",
      reason: "Language declaration helps AI engines serve your content to the right audience."
    };
  }
  if (label.includes("heading") || label.includes("h1")) {
    return {
      action: "Ensure every page has a clear H1 heading",
      reason: "AI engines use heading structure to understand page topics and generate accurate citations."
    };
  }
  if (label.includes("word count") || label.includes("content length")) {
    return {
      action: "Add more substantive content to thin pages",
      reason: "AI engines need enough content to understand your expertise and generate useful answers from your site."
    };
  }

  return null;
}

interface FlagGroup {
  action: string;
  reason: string;
  count: number;
}

function groupFlags(flags: string[]): FlagGroup[] {
  const groups: FlagGroup[] = [];
  const used = new Set<number>();

  // Group meta description flags
  const metaFlags = flags.filter(f => /meta description/i.test(f));
  if (metaFlags.length > 0) {
    groups.push({
      action: `Write unique meta descriptions for ${metaFlags.length === 1 ? "the page that is" : `the ${metaFlags.length} pages that are`} missing them`,
      reason: "Meta descriptions are the first thing AI engines read when deciding whether to cite your content. Missing descriptions mean missed opportunities.",
      count: metaFlags.length
    });
    metaFlags.forEach(f => used.add(flags.indexOf(f)));
  }

  // Group title flags
  const titleFlags = flags.filter(f => /title/i.test(f) && !used.has(flags.indexOf(f)));
  if (titleFlags.length > 0) {
    groups.push({
      action: `Fix title tag issues across ${titleFlags.length} ${titleFlags.length === 1 ? "page" : "pages"}`,
      reason: "Clear, descriptive titles are essential for AI engines to categorize and reference your content accurately.",
      count: titleFlags.length
    });
    titleFlags.forEach(f => used.add(flags.indexOf(f)));
  }

  // Remaining ungrouped flags
  for (let i = 0; i < flags.length; i++) {
    if (!used.has(i)) {
      groups.push({
        action: `Address: ${simplifyFlag(flags[i])}`,
        reason: "This issue reduces your AEO score and may limit AI engine visibility.",
        count: 1
      });
    }
  }

  return groups;
}

// --- Public API ---

export function generateNarrative(
  domain: string,
  latest: ScanResult,
  previous: ScanResult | null
): Narrative {
  const summary = buildSummary(domain, latest, previous);
  const changes = previous && !previous.error
    ? buildChanges(latest, previous)
    : [];
  const actions = buildActions(latest);

  return { summary, changes, actions };
}
