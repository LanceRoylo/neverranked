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

// Any competitor or third party by name.
const NAMED = /\bVisaible\b|\bProfound\b|\bPeec\b|\bBooking\.?com\b|\bExpedia\b|\bHotels\.com\b|\bZillow\b|\bRealtor\.?com\b|\bTripAdvisor\b|\bSemrush\b|\bAhrefs\b/i;

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
  console.log(`  ${okCharz ? "ok  " : "FAIL"}  ${label} — characterizes no competitor's honesty${charz ? ` (found "${charz[0]}")` : ""}`);
  console.log(`        ${sec.length} chars checked`);
}
console.log(`\n${bad === 0 ? "PASS — argument rests on facts about NeverRanked only" : "FAIL — " + bad + " Lanham exposure(s)"}`);
process.exit(bad ? 1 : 0);
