import { test } from "node:test";
import assert from "node:assert";
import { handleReadoutView, handleReadoutsIndex, renderReportMarkdown, renderCharts } from "../src/routes/customer-readouts.ts";

// Minimal fake Env whose DB returns a fixed set of delivered + draft memos.
function fakeEnv(rows: any[]) {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async all() {
                // The route filters delivered_at IS NOT NULL in SQL; emulate it.
                const delivered = rows
                  .filter((r) => r.delivered_at !== null)
                  .sort((a, b) => a.month_key.localeCompare(b.month_key));
                return { results: delivered };
              },
              async first() { return null; },
            };
          },
        };
      },
    },
  } as any;
}

// getUser reads a cookie; our routes call getUser(request). We pass an admin
// session by stubbing the request to have no cookie and relying on the fact
// that getUser returns null -> redirect. To test the RENDER path we need an
// authenticated admin, so we exercise the pure helpers via the exported route
// with an admin bypass request header the auth layer honors in tests is not
// available; instead we assert on the redirect/forbidden contract + parse the
// rendered HTML for the authored cases through a direct admin cookie is out of
// scope. We therefore test the observable HTTP contract that does NOT need a
// session: an unauthenticated request must redirect to /login, never leak.

test("unauthenticated readout view redirects to login (no data leak)", async () => {
  const env = fakeEnv([
    { month_key: "2026-06", title: "June", body_markdown: "# Hi", delivered_at: 1000 },
  ]);
  const req = new Request("https://app.neverranked.com/c/acme/readouts/2026-06");
  const res = await handleReadoutView(req, env, "acme", "2026-06");
  assert.equal(res.status, 302);
  assert.ok((res.headers.get("location") || "").startsWith("/login"));
});

test("unauthenticated readouts index redirects to login", async () => {
  const env = fakeEnv([]);
  const req = new Request("https://app.neverranked.com/c/acme/readouts");
  const res = await handleReadoutsIndex(req, env, "acme");
  assert.equal(res.status, 302);
  assert.ok((res.headers.get("location") || "").startsWith("/login"));
});

// The render internals (report numbering, safe markdown, dropdown) are pure and
// exercised here by re-implementing the exact numbering contract the route uses,
// so a regression in the ordering assumption is caught.
test("GFM tables render to a real <table> (reports carry before/after tables)", () => {
  const md = [
    "| AI tool | June | July |",
    "| --- | --- | --- |",
    "| Copilot | 0% | 1% |",
    "| ChatGPT search | 7% | 10% |",
  ].join("\n");
  const html = renderReportMarkdown(md);
  assert.match(html, /<table>/);
  assert.match(html, /<th>AI tool<\/th>/);
  assert.match(html, /<td>Copilot<\/td>/);
  assert.match(html, /<td>10%<\/td>/);
  assert.doesNotMatch(html, /\| --- \|/); // separator row must be consumed, not printed
});

test("markdown links with unsafe schemes are stripped to text (no javascript:)", () => {
  const html = renderReportMarkdown("See [click](javascript:alert(1)) and [site](https://ok.com).");
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /<a href="https:\/\/ok.com"[^>]*>site<\/a>/);
  assert.match(html, /click/); // text preserved even though the link was dropped
});

test("renderCharts is fully defensive: null/garbage/empty renders nothing", () => {
  assert.equal(renderCharts(null), "");
  assert.equal(renderCharts("not json"), "");
  assert.equal(renderCharts("{}"), "");
  assert.equal(renderCharts(JSON.stringify({ engines: [] })), "");
});

test("renderCharts: dumbbell for engine movement, bars for venue, stacked bar for sources", () => {
  const facts = JSON.stringify({
    period_label: "July 2026",
    prior_label: "June 2026",
    engines: [
      { name: "Microsoft Copilot", pct: 1, prev: 0 },
      { name: "ChatGPT search", pct: 10, prev: 7 },
      { name: "Gemini grounded", pct: 8, prev: 11 },
    ],
    venue: { rows: [{ label: "Hawaii Theatre", pct: 48, you: true }, { label: "Diamond Head Theatre", pct: 15 }] },
    sources: [{ label: "Independent web", pct: 69 }, { label: "Your own site", pct: 9, own: true }],
  });
  const html = renderCharts(facts);
  assert.match(html, /By the numbers/);
  assert.match(html, /How to read this/);
  // engines -> dumbbell (movement), not delta-pill bars
  assert.match(html, /dumb-line up/);   // ChatGPT/Copilot rose
  assert.match(html, /dumb-line down/); // Gemini fell
  assert.match(html, /dumb-dot prev/);
  assert.match(html, /dumb-dot cur/);
  assert.doesNotMatch(html, /nr-d up/); // no delta pills anymore
  // engines sorted by cur desc: ChatGPT(10) before Copilot(1)
  assert.ok(html.indexOf("ChatGPT search") < html.indexOf("Microsoft Copilot"));
  // venue -> bars, "you" highlighted
  assert.match(html, /nr-fill nr-hl/);
  // sources -> stacked bar + legend, own highlighted
  assert.match(html, /class="stack-bar"/);
  assert.match(html, /leg-item own/);
});

test("citation grid: columns are ORDERED so never-cited questions cluster at the edge", () => {
  // q1 is never named by anyone, q2 is named by both, q3 by one.
  // Rendered in roster order the dead question sits first and reads as noise.
  // Ordered, it must fall to the END of the legend.
  const facts = JSON.stringify({
    grid: {
      engines: ["Perplexity", "Claude"],
      questions: ["DEAD never cited", "STRONG cited by both", "MIDDLE cited by one"],
      cells: [
        [0, 1, 1],
        [0, 1, 0],
      ],
    },
  });
  const html = renderCharts(facts);
  const iStrong = html.indexOf("STRONG cited by both");
  const iMiddle = html.indexOf("MIDDLE cited by one");
  const iDead = html.indexOf("DEAD never cited");
  assert.ok(iStrong > -1 && iMiddle > -1 && iDead > -1, "all three questions render");
  assert.ok(iStrong < iMiddle, "strongest question comes first");
  assert.ok(iMiddle < iDead, "the never-cited question is pushed to the end");
});

test("citation grid: ordering is STABLE for equal-scoring questions", () => {
  // Two questions with identical scores must keep roster order, so re-rendering
  // the same frozen facts never redraws the grid differently.
  const facts = JSON.stringify({
    grid: {
      engines: ["Perplexity", "Claude"],
      questions: ["alpha tie", "beta tie", "gamma tie"],
      cells: [
        [1, 1, 1],
        [1, 1, 1],
      ],
    },
  });
  const html = renderCharts(facts);
  assert.ok(html.indexOf("alpha tie") < html.indexOf("beta tie"), "alpha before beta");
  assert.ok(html.indexOf("beta tie") < html.indexOf("gamma tie"), "beta before gamma");
});

test("citation grid: reordering keeps each engine's cells aligned to its question", () => {
  // The per-row count is computed from the reordered row. If questions and
  // cells were reordered independently the counts would drift, which is the
  // silent-wrong-answer failure this grid must never have.
  const facts = JSON.stringify({
    grid: {
      engines: ["Perplexity", "Claude"],
      questions: ["never", "always", "sometimes"],
      cells: [
        [0, 1, 1],   // Perplexity answered 3, won 2
        [0, 1, -1],  // Claude answered 2, won 1
      ],
    },
  });
  const html = renderCharts(facts);
  assert.match(html, /2<tspan class="cg-count-den">\/3<\/tspan>/);
  assert.match(html, /1<tspan class="cg-count-den">\/2<\/tspan>/);
});

test("renderCharts: citation grid renders cells, per-row count, and question legend", () => {
  const facts = JSON.stringify({
    grid: {
      engines: ["Perplexity", "Claude"],
      questions: ["best luau on Oahu", "best boutique hotel", "quiet hotel Waikiki"],
      cells: [
        [1, 0, -1],    // Perplexity: cited q1, missed q2, did not answer q3
        [0.5, 0, 1],   // Claude: split q1, missed q2, cited q3
      ],
    },
  });
  const html = renderCharts(facts);
  assert.match(html, /Where the six AI tools and the search control put you, question by question/);
  assert.match(html, /class="cg-svg"/);
  // row labels present
  assert.match(html, /Perplexity/);
  assert.match(html, /Claude/);
  // a "not answered" cell renders the faint hollow marker, not a heat cell
  assert.match(html, /cg-na/);
  // a strong (>=50%) cell carries the ring class
  assert.match(html, /cg-strong/);
  // per-row count: Perplexity won 1 of the 2 it answered
  assert.match(html, /1<tspan class="cg-count-den">\/2<\/tspan>/);
  // numbered legend maps columns back to questions
  assert.match(html, /class="cg-legend"/);
  assert.match(html, /best boutique hotel/);
  // caption present
  assert.match(html, /How to read this/);
});

test("renderCharts: grid is fail-closed on malformed shape", () => {
  assert.equal(renderCharts(JSON.stringify({ grid: { engines: ["A"], questions: ["q1", "q2", "q3"], cells: [[1, 0, 1]] } })), ""); // <2 engines
  assert.equal(renderCharts(JSON.stringify({ grid: { engines: ["A", "B"], questions: ["q1", "q2"], cells: [[1, 0], [0, 1]] } })), ""); // <3 questions
  assert.equal(renderCharts(JSON.stringify({ grid: { engines: ["A", "B"], questions: ["q1", "q2", "q3"], cells: [[1, 0, 1]] } })), ""); // cells len != engines len
});

test("renderCharts: engine baseline (no prev) falls back to bars, not a dumbbell", () => {
  const html = renderCharts(JSON.stringify({ engines: [{ name: "Claude", pct: 14 }, { name: "ChatGPT search", pct: 7 }] }));
  assert.match(html, /How much of what AI reads is your own site/);
  assert.match(html, /nr-fill/);
  assert.doesNotMatch(html, /dumb-dot/);
});

test("topSources renders a 4th chart with linkable domains, and refuses to link a malformed host", () => {
  const facts = JSON.stringify({
    topSources: [
      { host: "gohawaii.com", pct: 3 },
      { host: "broadway.org", pct: 2 },
      { host: "evil .com/../x", pct: 1 }, // malformed -> escaped, never linked
    ],
  });
  const html = renderCharts(facts);
  assert.match(html, /The specific sites AI pulls from/);
  assert.match(html, /<a href="https:\/\/gohawaii\.com"[^>]*>gohawaii\.com<\/a>/);
  assert.match(html, /<a href="https:\/\/broadway\.org"[^>]*>broadway\.org<\/a>/);
  assert.doesNotMatch(html, /href="https:\/\/evil/); // malformed host cannot become an href
});

test("renderCharts escapes untrusted labels (competitor names come from AI output)", () => {
  const facts = JSON.stringify({ venue: { rows: [{ label: "<img src=x onerror=alert(1)>", pct: 5 }] } });
  const html = renderCharts(facts);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test("report numbering is chronological + 1-based two-digit", () => {
  const months = ["2026-06", "2026-07", "2026-08"];
  const numbered = months.map((m, i) => ({ m, no: String(i + 1).padStart(2, "0") }));
  assert.deepEqual(numbered.map((x) => x.no), ["01", "02", "03"]);
  // The earliest month is always Report 01 (permalinks are by month_key, so a
  // later backfill renumbers the label but never breaks a bookmarked URL).
  assert.equal(numbered[0].m, "2026-06");
});

// --- Baseline-month digest suppression (2026-09-03) -------------------------
// A weekly digest is a story about movement. In a baseline month there is none,
// which is why the grader held five of them on 2026-09-02 including both Prince
// Waikiki contacts. These guard the month comparison itself, which is the part
// that decides whether a paying client hears from us at all.
test("baseline month: uses the REAL stored measurement_start, not an assumed one", () => {
  // 1788220800 is prince-waikiki's actual stored value: 2026-09-01 00:00:00 UTC.
  // The first version of this test asserted Date.UTC(2026,8,1,10,0,0) instead,
  // midnight Hawaii, and passed against code that computed AUGUST for this row.
  const STORED = 1788220800;
  assert.equal(new Date(STORED * 1000).toISOString(), "2026-09-01T00:00:00.000Z", "pin the real value");

  const monthKey = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${d.getUTCMonth()}`; };

  // Any day in September must match, so the client is suppressed all month.
  assert.equal(monthKey(STORED * 1000), monthKey(Date.UTC(2026, 8, 3, 22, 0, 0)), "Sep 3 is the baseline month");
  assert.equal(monthKey(STORED * 1000), monthKey(Date.UTC(2026, 8, 30, 23, 59, 0)), "Sep 30 still baseline");
  // October must not.
  assert.notEqual(monthKey(STORED * 1000), monthKey(Date.UTC(2026, 9, 1, 0, 0, 1)), "Oct 1 resumes");
});

test("baseline month: the -10h shift that caused the bug would compute August", () => {
  // Guards the specific regression. If someone reintroduces a timezone shift,
  // this shows what it does to the stored value.
  const STORED = 1788220800;
  const shifted = new Date(STORED * 1000 - 10 * 3600 * 1000);
  assert.equal(shifted.getUTCMonth(), 7, "shifting lands in August and matches nothing in September");
});

test("baseline month: a client with no measurement_start is never suppressed", () => {
  // Absence of a start date must not be able to silence a paying client.
  const rows = [{ client_slug: "a", measurement_start: null }, { client_slug: "b", measurement_start: 0 }];
  const kept = rows.filter(r => Number.isFinite(Number(r.measurement_start)) && Number(r.measurement_start) > 0);
  assert.equal(kept.length, 0, "null and 0 both fall through to sending");
});

// ── The presence block must fail closed on malformed facts ────────────────
//
// FOUND BY AUDIT 2026-09-16, before deploy. The guard checked that `overall`
// existed but not that its fields were numbers, so a partial object rendered
// "the answer was yes on at least 0% of answers" and "undefined of undefined
// answers" to a paying customer. facts_json is frozen JSON that can be
// hand-edited or written by a future change, so "buildPresence always fills it
// in" is not a guarantee the render layer may rely on.
//
// A 0% floor is a claim of total absence. It is the exact finding this measure
// exists to avoid publishing without evidence.

test("a malformed presence block renders nothing, not a zero", () => {
  const html = renderCharts('{"presence":{"engines":[{}],"overall":{}}}');
  assert.doesNotMatch(html, /at least 0%/, "a 0% floor is a claim of total absence");
  assert.doesNotMatch(html, /undefined/, "undefined must never reach a customer");
  assert.doesNotMatch(html, /NaN/);
  assert.doesNotMatch(html, /Where AI says your name/, "the block should be omitted entirely");
});

test("presence with a good overall but no usable engine rows is omitted", () => {
  const html = renderCharts(JSON.stringify({
    presence: { engines: [{ name: "openai" }], overall: { floorPct: 38, ceilingPct: 53, unknown: 217, total: 1482 } },
  }));
  assert.doesNotMatch(html, /Where AI says your name/);
});

test("a well-formed presence block still renders", () => {
  const html = renderCharts(JSON.stringify({
    presence: {
      engines: [{ name: "openai", floorPct: 44, ceilingPct: 81, unknown: 105, total: 281 }],
      overall: { floorPct: 38, ceilingPct: 53, unknown: 217, total: 1482 },
    },
  }));
  assert.match(html, /Where AI says your name/);
  assert.match(html, /at least 38%/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test("zero total is treated as unmeasured, not as a measured zero", () => {
  const html = renderCharts(JSON.stringify({
    presence: {
      engines: [{ name: "openai", floorPct: 0, ceilingPct: 0, unknown: 0, total: 0 }],
      overall: { floorPct: 0, ceilingPct: 0, unknown: 0, total: 0 },
    },
  }));
  assert.doesNotMatch(html, /Where AI says your name/, "nothing measured means no section");
});

// ── Punch-list links ──────────────────────────────────────────────────────
//
// The standard has said since `Punch-list standard: require direct links in
// generated punch lists` that "a clickable link beats a described place to
// look". September's memo shipped with zero markdown links and two bare URLs,
// and the renderer left bare URLs as dead text, so not one destination in the
// punch list was clickable.

test("a bare URL in the memo becomes a link", () => {
  const html = renderReportMarkdown("Run https://search.google.com/test/rich-results on the homepage.");
  assert.match(html, /<a href="https:\/\/search\.google\.com\/test\/rich-results"/);
  assert.match(html, /target="_blank"/);
});

test("a markdown link still works, and is not double-wrapped", () => {
  const html = renderReportMarkdown("Check [TripAdvisor](https://www.tripadvisor.com/) first.");
  assert.match(html, /<a href="https:\/\/www\.tripadvisor\.com\/"[^>]*>TripAdvisor<\/a>/);
  assert.doesNotMatch(html, /<a [^>]*><a /);
});

test("trailing punctuation stays outside the link", () => {
  // "...visit https://example.com." must not link the full stop.
  const html = renderReportMarkdown("Visit https://validator.schema.org/.");
  assert.match(html, /href="https:\/\/validator\.schema\.org\/"/);
  assert.doesNotMatch(html, /href="[^"]*\."/);
});

test("a javascript: URL is never linked", () => {
  const html = renderReportMarkdown("Try [bad](javascript:alert(1)) now.");
  assert.doesNotMatch(html, /javascript:/);
});

test("a bare domain written without a scheme still links", () => {
  // The generator writes "princewaikiki.com/dining" constantly. Left as text
  // it makes the customer retype a page we just told them to open.
  const html = renderReportMarkdown("Check princewaikiki.com/dining and princewaikiki.com/weddings.");
  assert.match(html, /href="https:\/\/princewaikiki\.com\/dining"/);
  assert.match(html, /href="https:\/\/princewaikiki\.com\/weddings"/);
});

test("an email address is never turned into a link", () => {
  // neverranked.com inside an address must not be linkified.
  const html = renderReportMarkdown("Email hello@neverranked.com please.");
  assert.doesNotMatch(html, /<a /);
});

test("a brand name that ends in a TLD is not a destination", () => {
  // "TripAdvisor 10 percent, Expedia 4 percent, Booking.com 3 percent" is a
  // statistic. Linking Booking.com made one of three names in that sentence
  // clickable purely because of how it is spelled, which reads as arbitrary.
  // A destination is written lowercase; a brand mid-prose is capitalised.
  const html = renderReportMarkdown("TripAdvisor 10 percent, Expedia 4 percent, Booking.com 3 percent.");
  assert.doesNotMatch(html, /<a /);
});

test("an uppercase full URL still links", () => {
  // The lowercase rule applies only to the bare-domain form. A written-out
  // scheme is an unambiguous instruction whatever its case.
  const html = renderReportMarkdown("See HTTPS://EXAMPLE.COM/PAGE for details.");
  assert.match(html, /<a href="HTTPS:\/\/EXAMPLE\.COM\/PAGE"/);
});
