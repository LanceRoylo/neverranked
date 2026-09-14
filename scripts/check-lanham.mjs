/**
 * Lanham guard for the new "who checks the checker" copy.
 *
 * The Corgi media policy EXCLUDES Lanham Act false advertising, so a claim
 * ABOUT a competitor is the one assertion on this site with no insurance
 * behind it. The whole section is built to make its argument from facts about
 * NeverRanked alone. This verifies that held.
 */
import { readFileSync } from "node:fs";

import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const strip = (s) =>
  s.replace(/<style[\s\S]*?<\/style>/gi, " ")
   .replace(/<script[\s\S]*?<\/script>/gi, " ")
   .replace(/<!--[\s\S]*?-->/g, " ")
   .replace(/<[^>]+>/g, " ")
   .replace(/&rsquo;|&#39;/g, "'")
   .replace(/\s+/g, " ");

/**
 * VENDORS — the absolute deny list from
 * ~/Projects/neverranked-marketing/canon/nameable-entities.json (`deny.entries`).
 *
 * THIS IS A HAND-MAINTAINED COPY AND THAT IS A KNOWN COST. The authority is
 * that JSON file, which lives in a private repo; this one is public and its CI
 * has no checkout of it, so the list cannot be imported and has to be kept in
 * step by a human. It already drifted once: between 2026-08 and 2026-09-13 the
 * JSON grew to 22 entries while this regex still carried 11, so thirteen
 * vendors could have been named on the homepage without this gate noticing.
 *
 * ADDING A VENDOR MEANS EDITING BOTH FILES. There is no mechanism that will
 * catch you if you edit only one.
 */
const VENDORS = [
  "Visaible", "Profound", "Peec", "Semrush", "Ahrefs", "Moz", "BrightEdge",
  "Conductor", "seoClarity", "Otterly", "Scrunch", "Goodie", "Rankscale",
  "Athena HQ", "Evertune", "Daydream", "Bluefish", "TryProfound",
  "Metricus", "metricusapp", "AiRR", "AiRR Score",
];

/**
 * THIRD PARTIES — aggregators and portals. These are NOT on the JSON deny
 * list; several are explicitly on its ALLOW list, because a teardown may name
 * the surfaces AI cites. The scope here is narrower than the marketing gate's
 * on purpose: these two sections argue that NeverRanked is worth believing,
 * and that argument has to rest on facts about NeverRanked alone. Naming any
 * outside party inside them weakens it whether or not the name is otherwise
 * safe to print.
 */
const THIRD_PARTIES = [
  "Booking.com", "Expedia", "Hotels.com", "Zillow",
  "Realtor.com", "TripAdvisor",
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "Booking.com" and "Realtor.com" are also written without the dot in copy.
const loose = (s) => esc(s).replace(/\\\.com$/, "\\.?com");
const NAMED = new RegExp(
  [...VENDORS, ...THIRD_PARTIES].map((n) => `\\b${loose(n)}\\b`).join("|"),
  "i",
);

// Characterizing another vendor's honesty or accuracy — the actionable shape.
const CHARACTERIZE = /\b(?:they|their|competitors?|other tools?|those tools?|rivals?)\b[^.]{0,60}\b(?:lie|lying|lies|mislead(?:ing)?|deceptive|dishonest|fake|fraud|bogus|inflated|unsubstantiated|can(?:not|'t) be trusted|untrue|false)\b/i;

const SECTIONS = [
  ["homepage: The check", "index.html", "Who tells you whether it worked", "Running an agency?"],
  ["/vs/: Or don't pick", "vs/index.html", "Or don't pick", "We will eventually prove"],
];

let bad = 0;
for (const [label, file, startMark, endMark] of SECTIONS) {
  const text = strip(readFileSync(`${SITE}/${file}`, "utf8"));
  const a = text.indexOf(startMark);
  if (a < 0) { console.log(`  FAIL  ${label}: section not found`); bad++; continue; }
  const b = text.indexOf(endMark, a);
  const sec = text.slice(a, b > a ? b : a + 4000);

  const named = sec.match(NAMED);
  const charz = sec.match(CHARACTERIZE);
  const okNamed = !named;
  const okCharz = !charz;
  if (!okNamed) bad++;
  if (!okCharz) bad++;
  console.log(`  ${okNamed ? "ok  " : "FAIL"}  ${label} — names no competitor${named ? ` (found "${named[0]}")` : ""}`);
  if (named) {
    console.log(`        FIX BY REWORDING, not by shortening the list. If "${named[0]}" is`);
    console.log(`        ordinary prose rather than the company, rephrase the sentence:`);
    console.log(`        a false positive here costs a word, a false negative is uninsured.`);
  }
  console.log(`  ${okCharz ? "ok  " : "FAIL"}  ${label} — characterizes no competitor's honesty${charz ? ` (found "${charz[0]}")` : ""}`);
  console.log(`        ${sec.length} chars checked`);
}
console.log(`\n${bad === 0 ? "PASS — argument rests on facts about NeverRanked only" : "FAIL — " + bad + " Lanham exposure(s)"}`);
process.exit(bad ? 1 : 0);
