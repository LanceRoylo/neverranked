/**
 * Every customer-facing string the free check ships, through the same three
 * guards that gate the paid readout (CLAUDE.md, "Marketing copy routes
 * through Hello Momentum"):
 *   - human-tone-guard (customer-publication): no em dashes, no semicolons,
 *     no banned filler phrases, no hedge openers
 *   - causal-claims: never claim one thing produced another
 *   - engine-verb-claims: never say an engine recommends, prefers, endorses
 *     or ranks
 * plus the house rules the guards do not cover: no exclamation points, no
 * emoji, never "invisible".
 *
 * Covered: the check page strings (copy.ts), the kit's question templates,
 * the unsubscribe page, every missing-signal description, the result email
 * for a summary that trips every signal, and both (disabled) drip emails.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { checkHumanTone } from "../src/human-tone-guard.ts";
import { firstCausalClaim } from "../src/lib/causal-claims.ts";
import { engineVerbClaims } from "../src/lib/engine-verb-claims.ts";
import { ENGINE_ORDER } from "../src/lib/engine-order.ts";
import { allPageStrings, PAGE_COPY } from "../../tools/schema-check/src/copy.ts";
import { SCHEMA_SIGNALS, TECHNICAL_SIGNALS, missingSignals, type ScanSummary } from "../../tools/schema-check/src/missing-signals.ts";
import { buildReportEmail, RESULT_EMAIL_COPY } from "../../tools/schema-check/src/report-email.ts";
import { buildDripDay3Email, buildDripDay7Email, DRIP_COPY } from "../../tools/schema-check/src/drip-email.ts";
import { CONSENT_VERSIONS } from "../../tools/schema-check/src/consent.ts";

const ENGINES = [
  ...new Set([
    ...ENGINE_ORDER.flatMap((e) => [e.label, ...e.aliases]),
    "ChatGPT", "Google", "Google's AI", "Perplexity", "Gemini", "Claude", "AI tool", "AI tools", "AI engines",
  ]),
];

function decode(s: string): string {
  return s
    .replace(/&rarr;/g, "->").replace(/&middot;/g, ".").replace(/&sect;/g, "").replace(/&bull;/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, " ").replace(/&nbsp;/g, " ");
}
/** Visible text of an email: drop head, style and tags, decode entities. */
function visibleText(html: string): string {
  return decode(html.replace(/<head[\s\S]*?<\/head>/i, "").replace(/<[^>]+>/g, "\n"))
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}

function guard(label: string, text: string): string[] {
  const problems: string[] = [];
  const tone = checkHumanTone(text, "customer-publication");
  for (const v of tone.violations.filter((v) => v.severity === "block")) problems.push(`${label}: tone ${v.pattern} "${v.match}"`);
  const causal = firstCausalClaim(text);
  if (causal) problems.push(`${label}: causal claim "${causal}"`);
  for (const h of engineVerbClaims(text, ENGINES)) problems.push(`${label}: engine verb "${h.verb}" near ${h.engine}: ${h.quote}`);
  if (/!/.test(text)) problems.push(`${label}: exclamation point`);
  if (/\p{Extended_Pictographic}/u.test(text)) problems.push(`${label}: emoji`);
  if (/\binvisible\b/i.test(text)) problems.push(`${label}: "invisible"`);
  return problems;
}

const EVERYTHING_MISSING: ScanSummary = {
  v: 1,
  url: "https://shop.test/",
  domain: "shop.test",
  score: 20,
  grade: "F",
  schema_coverage: Object.keys(SCHEMA_SIGNALS).map((type) => ({ type, present: false })),
  technical_signals: Object.keys(TECHNICAL_SIGNALS).map((label) => ({ label, status: "bad" as const })),
  red_flags: [],
  crawl: { noindex: true, nofollow: true, blocked: ["OAI-SearchBot", "PerplexityBot", "GPTBot", "CCBot"] },
  client_side_rendered: true,
  jsonld_parse_errors: 2,
  schema_types: [],
  identity: null,
};

test("check page strings pass the guards", () => {
  const problems = allPageStrings().flatMap((s, i) => guard(`page[${i}] ${s.slice(0, 40)}`, s));
  assert.deepEqual(problems, []);
});

test("the consent lines pass the guards", () => {
  const problems = Object.entries(CONSENT_VERSIONS).flatMap(([k, v]) => guard(`consent ${k}`, v.text));
  assert.deepEqual(problems, []);
});

test("every missing-signal description passes the guards", () => {
  const all = missingSignals(EVERYTHING_MISSING);
  assert.ok(all.length >= Object.keys(SCHEMA_SIGNALS).length + Object.keys(TECHNICAL_SIGNALS).length + 4);
  const problems = all.flatMap((m) => [...guard(`name ${m.key}`, m.name), ...guard(`what ${m.key}`, m.what)]);
  // Robots variants: all crawlers, reading only, training only.
  for (const blocked of [["all crawlers (User-agent: *)"], ["ClaudeBot"], ["GPTBot"]]) {
    const one = missingSignals({ ...EVERYTHING_MISSING, crawl: { noindex: false, nofollow: false, blocked } });
    problems.push(...guard(`robots ${blocked.join(",")}`, one[0].what));
  }
  assert.deepEqual(problems, []);
});

test("the result email passes the guards, as text and as rendered HTML", () => {
  const m = buildReportEmail(EVERYTHING_MISSING, { unsubscribeUrl: "https://check.neverranked.com/unsubscribe?t=x" });
  const problems = [
    ...guard("result email text", m.text.replace(/https?:\/\/\S+/g, "")),
    ...guard("result email html", visibleText(m.html).replace(/https?:\/\/\S+/g, "")),
    ...guard("result email subject", m.subject),
    ...Object.entries(RESULT_EMAIL_COPY).flatMap(([k, v]) => guard(`RESULT_EMAIL_COPY.${k}`, v)),
  ];
  assert.deepEqual(problems, []);
});

test("both drip emails pass the guards and no longer carry the 78 line", () => {
  const scan = { domain: "shop.test", score: 61, grade: "C" };
  const c = { unsubscribeUrl: "https://check.neverranked.com/unsubscribe?t=x", postalAddress: "NeverRanked, 1 Test Street, Testville, ST 00000" };
  const d3 = visibleText(buildDripDay3Email(scan, c));
  const d7 = visibleText(buildDripDay7Email(scan, c));
  const problems = [
    ...guard("drip day 3", d3),
    ...guard("drip day 7", d7),
    ...Object.entries(DRIP_COPY).flatMap(([k, v]) => guard(`DRIP_COPY.${k}`, v)),
  ];
  assert.deepEqual(problems, []);
  for (const t of [d3, d7]) {
    assert.doesNotMatch(t, /\b78\b/);
    assert.doesNotMatch(t, /citation line/i);
    assert.doesNotMatch(t, /recommending/i);
    assert.doesNotMatch(t, /without action/i);
    assert.doesNotMatch(t, /monitor/i, "Monitor is out of every customer line");
    assert.doesNotMatch(t, /\$\d/, "no price pitch in the drip");
    assert.match(t, /1 Test Street, Testville/, "postal address in the footer");
    assert.match(t, /Unsubscribe/);
  }
});

test("a drip email cannot be built without its unsubscribe link and postal address", () => {
  const scan = { domain: "shop.test", score: 61, grade: "C" };
  for (const c of [
    { unsubscribeUrl: "", postalAddress: "NeverRanked, 1 Test Street" },
    { unsubscribeUrl: "https://check.neverranked.com/unsubscribe?t=x", postalAddress: "  " },
    undefined as any,
  ]) {
    assert.throws(() => buildDripDay3Email(scan, c));
    assert.throws(() => buildDripDay7Email(scan, c));
  }
});

test("the result email is transactional: no Monitor line, no price", () => {
  const m = buildReportEmail(EVERYTHING_MISSING, { unsubscribeUrl: "https://check.neverranked.com/unsubscribe?t=x" });
  for (const t of [m.text, visibleText(m.html)]) {
    assert.doesNotMatch(t, /monitor/i);
    assert.doesNotMatch(t, /\$\d/);
    assert.doesNotMatch(t, /pricing/i);
  }
  assert.ok(!Object.keys(RESULT_EMAIL_COPY).some((k) => /monitor/i.test(k)));
});

test("Appendix A strings are used verbatim", () => {
  assert.equal(PAGE_COPY.metaDescription, "Free check. See what AI tools can read from your website and what they miss. Your score shows in seconds.");
  assert.equal(PAGE_COPY.ogDescription, "Enter your URL. See what AI tools can read from your site and what they cannot. Free.");
  assert.equal(PAGE_COPY.gateBody, "Leave your email and we send the full result: each missing signal by name, and what it is, in plain words.");
  assert.equal(PAGE_COPY.gateButton, "Send my result");
  assert.equal(PAGE_COPY.gateConsent, "We email your result now. Lance may follow up once or twice about it, and every email has an unsubscribe link. We never sell or share your email.");
  assert.equal(PAGE_COPY.loading, "Scoring your site...");
  assert.equal(`13 ${PAGE_COPY.comparisonSuffix}`, "13 points below the top quarter of sites we have checked.");
  assert.equal(`7 ${PAGE_COPY.gateTitleMany}`, "7 things on your site AI tools may not read");
});
