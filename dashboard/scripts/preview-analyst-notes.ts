/**
 * Generate a month's analyst notes and print them, WITHOUT delivering anything.
 *
 * The readout's prose is written by a model at render time. Reading it for the
 * first time alongside the customer is not a review. This builds the exact
 * payload writeAnalystNotes sends (engines, venue, sources, top sources,
 * movement -- the grid is not part of it) and prints what comes back, plus
 * whether each note survives the guards.
 *
 *   export ANTHROPIC_API_KEY=...
 *   npx tsx scripts/preview-analyst-notes.ts <path-to-facts-src.json>
 */
import { writeAnalystNotes, allowedNumbers, noteNumbersOk, engineNoteClaimsOk } from "../src/lib/report-notes.ts";
import { engineVerbClaimsOk } from "../src/lib/engine-verb-claims.ts";
import { readFileSync } from "node:fs";

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("ANTHROPIC_API_KEY not set."); process.exit(1); }

const SOURCE_LABELS: Record<string, string> = {
  owned: "Your own site", news: "News", guide: "Guides and listicles",
  directory: "Directories", social: "Social", review: "Review sites",
  gov: "Government", edu: "Education", other: "Other",
};
const pretty = (k: string) => SOURCE_LABELS[k] || k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

const raw = readFileSync(process.argv[2] || "/tmp/facts_src.json", "utf8");
const m = raw.match(/"results":\s*(\[[\s\S]*?\]),\s*\n\s*"success"/);
if (!m) { console.error("could not parse the D1 dump"); process.exit(1); }
const row = JSON.parse(m[1])[0];
const eb = JSON.parse(row.engines_breakdown) as Record<string, { share_pct?: number; layer?: string; cohort_citations?: number; total?: number }>;
const tc = JSON.parse(row.top_competitors) as {
  htc_venue_share_pct?: number;
  competitors?: Array<{ label?: string; domain?: string; venue_share_pct?: number }>;
  source_types?: Record<string, { share_pct?: number }>;
  offsite_hosts?: Array<{ host?: string; share_pct?: number }>;
};

// Built exactly as buildReportFacts does. September is prince-waikiki's
// BASELINE month, so prior_label and question movement are deliberately
// absent: there is nothing to have moved from.
const engines = Object.entries(eb).map(([name, v]) => {
  const r: Record<string, unknown> = { name, pct: n(v?.share_pct) };
  if (v?.layer === "model_knowledge") r.layer = "model_knowledge";
  if (typeof v?.cohort_citations === "number" && v.cohort_citations === 0 && typeof v?.total === "number" && v.total > 0) r.noCohortSignal = true;
  return r;
});
const facts = {
  period_label: "September 2026",
  engines,
  venue: { rows: [
    { label: row.name, pct: n(tc.htc_venue_share_pct), you: true },
    ...(tc.competitors || []).filter((c) => c && (c.label || c.domain))
      .map((c) => ({ label: String(c.label || c.domain), pct: n(c.venue_share_pct) })),
  ] },
  sources: Object.entries(tc.source_types || {})
    .map(([k, v]) => ({ label: pretty(k), pct: n(v?.share_pct), own: k === "owned" }))
    .sort((a, b) => b.pct - a.pct),
  topSources: (tc.offsite_hosts || []).filter((h) => h && typeof h.host === "string")
    .map((h) => ({ host: String(h.host), pct: n(h.share_pct) })),
} as never;

async function main(): Promise<void> {
  const notes = await writeAnalystNotes({ ANTHROPIC_API_KEY: key } as never, facts, {
    name: row.name, category_label: row.category_label,
  });
  const allowed = allowedNumbers(facts);
  const labels = (facts as { engines: { name: string }[] }).engines.map((e) => e.name);

  const keys = ["engines", "venue", "sources", "topSources", "questions"] as const;
  for (const k of keys) {
    const t = (notes as Record<string, string | undefined>)[k];
    console.log(`\n--- ${k} ---`);
    if (!t) { console.log("  (absent: either not generated or dropped by a guard)"); continue; }
    console.log("  " + t.replace(/\n/g, "\n  "));
    const checks = [
      ["numbers", noteNumbersOk(t, allowed)],
      ["engine verbs", engineVerbClaimsOk(t, labels)],
      ...(k === "engines" ? [["layer claims", engineNoteClaimsOk(t, facts)] as [string, boolean]] : []),
    ] as [string, boolean][];
    console.log("  guards: " + checks.map(([nm, ok]) => `${nm}=${ok ? "ok" : "FAIL"}`).join("  "));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
