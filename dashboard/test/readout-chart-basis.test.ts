/* The charts above a corrected memo must not say what the memo retracted.
 *
 * 2026-10-05: a paying client's September memo was reissued after a
 * line-by-line check, but the readout page renders its summary tiles and
 * charts from the frozen facts, through this renderer, so above the corrected
 * memo the page still said:
 *
 *   "9 of 30 questions / no AI tool put you anywhere in the answer"
 *     The grid's search rows are built from the links each tool listed. The
 *     answers named the business on five of those nine questions.
 *   "3rd in your category / 11% of all mentions", "Who AI names in your
 *     category", "Of every mention..."
 *     The venue share is a share of LINKS to the tracked businesses' own
 *     websites, a different measure from mentions.
 *   google.com at 6% among "the off-site places to get listed"
 *     Almost all of those are Google's own viewer links.
 *   the Bing control drawn as a bar among the AI tools, and "0%" for a tool
 *     whose share rounded to zero from a real handful of links.
 *
 * The fixture has the same shape as that month's frozen facts, with invented
 * names.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderCharts } from "../src/routes/customer-readouts.ts";

const FACTS = {
  period_label: "Sep 2026",
  engines: [
    { name: "Perplexity", pct: 2 },
    { name: "ChatGPT search", pct: 2 },
    { name: "Gemini grounded", pct: 2 },
    { name: "Google AI Overviews", pct: 0 },
    { name: "Bing search (control)", pct: 0 },
    { name: "Claude", pct: 0, layer: "model_knowledge" },
    { name: "Gemma", pct: 8, layer: "model_knowledge" },
  ],
  venue: {
    rows: [
      { label: "Example Hotel", pct: 11, you: true },
      { label: "Harbor House", pct: 15 },
      { label: "Reef Palace", pct: 15 },
      { label: "Sand Tower", pct: 9 },
    ],
  },
  sources: [
    { label: "Independent web", pct: 71, own: false },
    { label: "Competitor sites", pct: 14, own: false },
    { label: "Review directories", pct: 10, own: false },
    { label: "Your own site", pct: 2, own: true },
    { label: "Reddit", pct: 1, own: false },
  ],
  topSources: [
    { host: "tripadvisor.com", pct: 9 },
    { host: "google.com", pct: 6 },
    { host: "expedia.com", pct: 4 },
    { host: "booking.com", pct: 3 },
  ],
  grid: {
    engines: ["Perplexity", "ChatGPT", "Gemini", "Google AIO", "Claude", "Gemma", "Bing search (control)"],
    layers: ["citation", "citation", "citation", "citation", "model_knowledge", "model_knowledge", "citation"],
    questions: ["pool question", "harbor view question", "statewide dining question", "statewide golf question"],
    cells: [
      [1, 0.5, 0, 0],
      [0.9, 0.4, 0, 0],
      [1, 0.6, 0, 0],
      [0.8, 0.3, 0, 0],
      [0, 0, 0, 0],
      [0.1, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  presence: {
    engines: [{ name: "perplexity", floorPct: 39, ceilingPct: 39, unknown: 0, total: 769 }],
    overall: { floorPct: 39, ceilingPct: 48, unknown: 218, total: 2375 },
  },
};

const html = renderCharts(JSON.stringify(FACTS));
/** What a reader sees: tags and entities out, whitespace collapsed. */
const text = html
  .replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;|&#\d+;/g, " ")
  .replace(/\s+/g, " ");

test("the gap tile says the site was never a source, never that the business was absent", () => {
  assert.doesNotMatch(text, /anywhere in the answer/);
  assert.match(text, /2 of 4 questions your website was never among the sources of the AI tools that search the web/);
});

test("the rank tile states its basis and names a tie as a tie", () => {
  assert.doesNotMatch(text, /of all mentions/);
  assert.match(text, /3rd among the businesses we track/);
  assert.match(text, /11% of the links to their own websites went to yours\. Harbor House and Reef Palace lead on 15% each/);
});

test("the rank tile counts only businesses strictly ahead", () => {
  const tied = { ...FACTS, venue: { rows: [{ label: "Example Hotel", pct: 15, you: true }, { label: "Harbor House", pct: 15 }, { label: "Sand Tower", pct: 9 }] } };
  const t = renderCharts(JSON.stringify(tied)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(t, /1st among the businesses we track/);
  assert.match(t, /Level with Harbor House/);
});

test("the venue chart is a share of links to websites, not of mentions", () => {
  assert.doesNotMatch(text, /Who AI names in your category/);
  assert.doesNotMatch(text, /Of every mention/);
  assert.match(text, /Whose website AI uses as a source/);
  assert.match(text, /It counts links to websites, not mentions/);
});

test("google.com is not listed as a site to be listed on, and the reason is given", () => {
  assert.doesNotMatch(html, /href="https:\/\/google\.com"/);
  assert.match(text, /google\.com is left out of this list\. Almost all of its 6% are Google's own viewer links/);
  assert.doesNotMatch(text, /places to get listed/);
  // The biggest-source tile skips it too.
  assert.match(text, /9% of what AI reads comes from tripadvisor\.com, the biggest source other than the businesses' own websites/);
});

test("a google.com host at the top never becomes the biggest-source tile", () => {
  const googleFirst = { ...FACTS, topSources: [{ host: "www.google.com", pct: 12 }, { host: "tripadvisor.com", pct: 9 }] };
  const t = renderCharts(JSON.stringify(googleFirst)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(t, /9% of what AI reads comes from tripadvisor\.com/);
  assert.doesNotMatch(t, /comes from www\.google\.com/);
});

test("the source mix says other websites, and says what google.com is inside it", () => {
  assert.match(text, /Other websites 71%/);
  assert.doesNotMatch(text, /Independent web/);
  assert.match(text, /include links to google\.com itself, 6% of all links/);
  assert.doesNotMatch(text, /which is why off-site presence matters/);
});

test("the control is not drawn among the AI tools, and is named under the chart", () => {
  const ownSite = html.slice(html.indexOf("How much of what AI reads is your own site"));
  const chart = ownSite.slice(0, ownSite.indexOf("</section>"));
  assert.doesNotMatch(chart, /nr-lab">Bing search \(control\)</);
  assert.match(chart, /Bing search \(control\) is left out of this chart\. It is a classic search run as a control, not an AI tool\./);
});

test("a share that rounds to zero reads 'under 1%', never a claim of total absence", () => {
  const ownSite = html.slice(html.indexOf("How much of what AI reads is your own site"));
  const chart = ownSite.slice(0, ownSite.indexOf("</section>"));
  assert.match(chart, /nr-lab">Google AI Overviews<[\s\S]*?<span>under 1%<\/span>/);
  assert.doesNotMatch(chart, /data-v="0">0<\/span>%/);
  const memory = html.slice(html.indexOf("Where AI names you from memory"));
  assert.match(memory, /nr-lab">Claude<[\s\S]*?<span>under 1%<\/span>/);
  assert.match(memory, /A figure under 1% here is not a verdict on your business/);
});

test("the grid speaks of sources for search tools, names for memory tools, pages for the control", () => {
  assert.match(html, /Perplexity: used your site as a source on 100% of 0 checks/);
  assert.match(html, /Claude: named you in 0% of 0 checks/);
  assert.match(html, /Bing search \(control\): returned your page on 0% of 0 checks/);
  assert.doesNotMatch(html, /pulled from your site on/);
  assert.doesNotMatch(text, /did not include you/);
  assert.match(text, /An answer can still name you without using your site/);
});

test("no em dashes or semicolons in what the reader sees", () => {
  assert.doesNotMatch(text, /—/);
  assert.doesNotMatch(text, /;/);
});

/* Facts counted with google.com's links set aside (the basis a corrected memo
 * uses) say so in every caption that depends on it, and never claim the links
 * are still inside "Other websites". */
test("facts with google.com set aside say so, and do not claim it is still counted", () => {
  const setAside = {
    ...FACTS,
    googleLinksSetAside: 1650,
    sources: [
      { label: "Independent web", pct: 69, own: false },
      { label: "Competitor sites", pct: 15, own: false },
      { label: "Your own site", pct: 2, own: true },
    ],
    topSources: [
      { host: "tripadvisor.com", pct: 9 },
      { host: "expedia.com", pct: 4 },
    ],
    engines: FACTS.engines.map((e) => (e.name === "Google AI Overviews" ? { ...e, pct: 1 } : e)),
  };
  const t = renderCharts(JSON.stringify(setAside)).replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/g, " ").replace(/\s+/g, " ");
  assert.match(t, /1,650 links to google\.com itself are set aside/);
  assert.doesNotMatch(t, /Other websites here include links to google\.com/);
  assert.match(t, /google\.com is not listed\. Its links are set aside/);
  assert.match(t, /For Google AI Overviews, Google's own viewer links are set aside from its link count/);
  assert.match(t, /Other websites 69%/);
});

test("facts that still count google.com say AI Overviews' share is held down by it", () => {
  assert.match(text, /For Google AI Overviews, the links counted here include Google's own viewer links/);
});

test("the presence caption does not say a tool names you because it read your site", () => {
  assert.doesNotMatch(text, /Being read is how a tool gets there/);
  assert.doesNotMatch(text, /how it gets there/);
  assert.match(text, /Being named is what a reader sees\. The sources a tool lists are a separate measure/);
});

/* 2026-10-05 audit of the restored page. */
test("the headline tile names its basis: the tools that search the web", () => {
  assert.match(text, /39% of answers from AI tools that search the web name you at least, across 2,375 answers from the one tool that searches the web/);
  const four = { ...FACTS, presence: { ...FACTS.presence, engines: [1, 2, 3, 4].map((i) => ({ name: `e${i}`, floorPct: 39, ceilingPct: 39, unknown: 0, total: 10 })) } };
  const t = renderCharts(JSON.stringify(four)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(t, /from the four tools that search the web/);
});

test("'at least' is called a floor, and no rounded bound is promised to hold", () => {
  assert.doesNotMatch(text, /exact, not modest/);
  assert.doesNotMatch(text, /holds either way/);
  assert.match(text, /"At least" is a floor/);
  const ranged = { ...FACTS, presence: { engines: [{ name: "google_ai_overview", floorPct: 28, ceilingPct: 41, unknown: 42, total: 312 }], overall: FACTS.presence.overall } };
  assert.match(renderCharts(JSON.stringify(ranged)), /named you in about 28% to 41% of its answers, the range allowing for 42 answers too long to store/);
});

test("the storage sentence follows the month: before, during and after the cap change", () => {
  const cap = (label: string) => renderCharts(JSON.stringify({ ...FACTS, period_label: label })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(cap("Aug 2026"), /we have since increased how much of each answer we keep/);
  const sep = cap("Sep 2026");
  assert.match(sep, /on September 16 we increased how much of each answer we keep/);
  assert.doesNotMatch(sep, /we have since increased/);
  const oct = cap("Oct 2026");
  assert.doesNotMatch(oct, /increased how much of each answer we keep/);
});

test("no unmeasured norms: no 'dozen or more', no 'normal range', no cross-category pattern", () => {
  assert.doesNotMatch(text, /dozen or more/);
  assert.doesNotMatch(text, /normal range/);
  assert.doesNotMatch(text, /unrelated categories/);
  assert.match(text, /A figure under 1% here is not a verdict on your business: these tools answer from what they learned in training/);
  assert.match(text, /A tool lists several sources per answer/);
});

test("the grid caption says the last row is the control, and does not claim every day", () => {
  assert.match(text, /Each row is one AI tool, except Bing search \(control\), a classic search run as a control/);
  assert.doesNotMatch(text, /every day/);
});

test("one tool, one name on the page", () => {
  assert.doesNotMatch(html, /Google AIO:/);
  assert.match(html, /Google AI Overviews: used your site as a source on/);
});

test("hidden venue rows claim no link count and name a chain's general pages", () => {
  const many = {
    ...FACTS,
    venue: {
      rows: [
        { label: "Example Hotel", pct: 11, you: true },
        ...Array.from({ length: 13 }, (_, i) => ({ label: `Hotel ${i}`, pct: 5 })),
        { label: "Big Chain (brand pages)", pct: 1 },
        { label: "Quiet Inn", pct: 0 },
      ],
    },
  };
  const t = renderCharts(JSON.stringify(many)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(t, /4 more entries are left off the chart to keep it readable\. Together they account for 11%\. Some are a chain's general pages rather than one business\./);
  assert.doesNotMatch(t, /at least one link/);
  assert.doesNotMatch(t, /not because they scored zero/);
});

test("the sites list is what AI uses most, with google.com's destination left unclaimed", () => {
  assert.match(text, /The specific sites AI uses most/);
  assert.doesNotMatch(text, /point back to Google rather than/);
  assert.match(text, /whose destination we cannot see/);
});
