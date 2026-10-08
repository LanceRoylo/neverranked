/**
 * The check page's claims, made to stick (free-check fix plan, section 3
 * item 8).
 *
 * scripts/check-claims.mjs scans the built site in dist/, which never sees
 * the scan Worker's page: that page is a string inside
 * tools/schema-check/src/index.ts. So the same rules run here, over the
 * Worker's source and the modules it renders customer copy from.
 *
 * Blocked:
 *   - "(6|six) AI tools (can) read": the free check reads the site with one
 *     scanner. It never asks six AI tools anything.
 *   - "No signup": the full result is behind an email. The score is free.
 *   - "citation line" and "reliably start citing": the 78 was the 75th
 *     percentile of scanned sites, never a measured citation threshold.
 *   - "invisible": absence is stated per question, never as a verdict.
 *
 * CLAIMS_TARGET=<path> runs the rules against another copy of index.ts,
 * which is how the rule was shown to fail on the pre-change file.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CHECK_PAGE_RULES: { id: string; re: RegExp }[] = [
  // The plan's pattern, widened by "even": the homepage's own wording was
  // "the six AI tools can even read", which the narrow form misses.
  { id: "six-ai-tools-read", re: /\b(6|six) AI tools (can (even )?)?read/i },
  { id: "no-signup", re: /\bno[- ]signup\b/i },
  { id: "citation-line", re: /\bcitation line\b/i },
  { id: "reliably-start-citing", re: /reliably start citing/i },
  { id: "invisible", re: /\binvisible\b/i },
];

export function claimHits(text: string): { id: string; line: number; excerpt: string }[] {
  const hits: { id: string; line: number; excerpt: string }[] = [];
  text.split("\n").forEach((ln, i) => {
    for (const r of CHECK_PAGE_RULES) {
      if (r.re.test(ln)) hits.push({ id: r.id, line: i + 1, excerpt: ln.trim().slice(0, 140) });
    }
  });
  return hits;
}

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const FILES = [
  "../../tools/schema-check/src/index.ts",
  "../../tools/schema-check/src/copy.ts",
  "../../tools/schema-check/src/report-email.ts",
  "../../tools/schema-check/src/drip-email.ts",
  "../../tools/schema-check/src/missing-signals.ts",
  "../../tools/schema-check/og-image.html",
];

test("the rules catch the lines the check page used to ship", () => {
  // Verbatim from the pre-2026-10-07 page and drip. If a rule stops
  // matching these, it has been weakened.
  const old = [
    `<meta name="description" content="Free check. See how ChatGPT, Google AI, and Perplexity read your website, and what's missing. No signup.">`,
    `points below the score where AI engines reliably start citing.`,
    `Scoring against the citation line…`,
    `setHeadline("You are <em>invisible</em> to AI search.");`,
    `See how 6 AI tools read your site right now`,
    `whether the six AI tools can even read your site`,
  ];
  for (const line of old) assert.ok(claimHits(line).length > 0, `rule missed: ${line}`);
});

test("the scan Worker's page and emails carry none of the retired claims", () => {
  const targets = process.env.CLAIMS_TARGET ? [process.env.CLAIMS_TARGET] : FILES.map(here);
  const all: string[] = [];
  for (const f of targets) {
    for (const h of claimHits(readFileSync(f, "utf8"))) all.push(`${f.split("/").slice(-2).join("/")}:${h.line} [${h.id}] ${h.excerpt}`);
  }
  assert.deepEqual(all, [], `Retired check-page claims found:\n${all.join("\n")}`);
});
