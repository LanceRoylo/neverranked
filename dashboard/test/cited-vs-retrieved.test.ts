import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { citedChunkIndices, parsePerplexityAgentOutput } from "../src/citations";

/* Cited is not retrieved.
 *
 * Until 2026-09-15 two of the four citation-grade engines wrote their RETRIEVAL
 * set into cited_urls:
 *
 *   gemini      every groundingChunks[].web.uri, with groundingSupports (the
 *               field naming which chunks the answer rests on) never read.
 *   perplexity  search_results and url_citation annotations merged into one
 *               array.
 *
 * Retrieved is a superset of cited, so every published figure on those two
 * engines was computed on a looser definition than the word "cited" claims.
 * These tests pin the distinction so it cannot quietly collapse again. */

// ── Gemini: which chunks does the answer actually rest on ──────────────────

test("only chunks named by a support are cited", () => {
  // Search returned 5 sources. The answer rests on two of them.
  const supports = [
    { groundingChunkIndices: [0, 2] },
    { groundingChunkIndices: [2] },
  ];
  assert.deepEqual(citedChunkIndices(supports, 5), [0, 2]);
});

test("NULL, not empty, when supports are missing", () => {
  // This is the load-bearing case. Returning [] here would report zero
  // citations for every Gemini run on an older API shape, which is a bigger
  // error than the one being fixed. Null means "cannot tell" and the caller
  // falls back to the merged set.
  assert.equal(citedChunkIndices(undefined, 5), null);
  assert.equal(citedChunkIndices([], 5), null);
});

test("a support referencing no chunk yields an empty cited set, not null", () => {
  // Supports exist and name nothing. That IS an answer resting on no source,
  // which is different from not knowing.
  assert.deepEqual(citedChunkIndices([{ groundingChunkIndices: [] }], 3), []);
  assert.deepEqual(citedChunkIndices([{}], 3), []);
});

test("out-of-range and malformed indices are dropped, not trusted", () => {
  const supports = [{ groundingChunkIndices: [0, 9, -1, 1.5 as unknown as number] }];
  assert.deepEqual(citedChunkIndices(supports, 3), [0]);
});

test("the cited set is never larger than the retrieved set", () => {
  // The property that makes the metric honest, asserted directly.
  const supports = [{ groundingChunkIndices: [0, 1, 2, 3, 4] }];
  const chunkCount = 3;
  const cited = citedChunkIndices(supports, chunkCount);
  assert.ok(cited !== null && cited.length <= chunkCount);
});

// ── Perplexity: retrieval and citation arrive in the same payload ──────────

/** The real Agent API shape: a search_results item, then a message whose
 *  annotations carry the URLs the answer actually points at. */
const PPLX = {
  output: [
    {
      type: "search_results",
      results: [
        { url: "https://retrieved-only-a.com/x" },
        { url: "https://both.com/page" },
        { url: "https://retrieved-only-b.com/y" },
      ],
    },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: "Some answer text.",
          annotations: [
            { type: "url_citation", url: "https://both.com/page" },
            { type: "url_citation", url: "https://cited-not-in-search.com/z" },
          ],
        },
      ],
    },
  ],
} as unknown as Parameters<typeof parsePerplexityAgentOutput>[0];

test("retrieval and citation are separated", () => {
  const r = parsePerplexityAgentOutput(PPLX);
  assert.deepEqual(r.retrievedUrls, [
    "https://retrieved-only-a.com/x",
    "https://both.com/page",
    "https://retrieved-only-b.com/y",
  ]);
  assert.deepEqual(r.citedStrict, [
    "https://both.com/page",
    "https://cited-not-in-search.com/z",
  ]);
});

test("the historical merged field is unchanged", () => {
  // Reporting reads `urls` until the 2026-10-01 cutover. If this changes today,
  // September is measured half on one definition and half on another, and that
  // lands on a paying client's first monthly readout as movement they did not
  // make.
  const r = parsePerplexityAgentOutput(PPLX);
  assert.deepEqual(r.urls, [
    "https://retrieved-only-a.com/x",
    "https://both.com/page",
    "https://retrieved-only-b.com/y",
    "https://cited-not-in-search.com/z",
  ]);
});

test("the merged set is the union, so cited is never lost", () => {
  const r = parsePerplexityAgentOutput(PPLX);
  for (const u of r.citedStrict) assert.ok(r.urls.includes(u), `${u} missing from merged`);
  for (const u of r.retrievedUrls) assert.ok(r.urls.includes(u), `${u} missing from merged`);
});

test("strict is smaller than merged on the real shape", () => {
  // The whole point: this is why the reported number will fall on 2026-10-01.
  const r = parsePerplexityAgentOutput(PPLX);
  assert.ok(r.citedStrict.length < r.urls.length);
});

test("an answer with no annotations cites nothing even when search returned pages", () => {
  const r = parsePerplexityAgentOutput({
    output: [
      { type: "search_results", results: [{ url: "https://a.com/1" }, { url: "https://b.com/2" }] },
      { type: "message", content: [{ type: "output_text", text: "No sources used.", annotations: [] }] },
    ],
  } as unknown as Parameters<typeof parsePerplexityAgentOutput>[0]);
  assert.deepEqual(r.citedStrict, []);
  assert.equal(r.retrievedUrls.length, 2);
  // And the historical field still reports 2, which is exactly the overcount.
  assert.equal(r.urls.length, 2);
});


// ── The fallback must stay visible ────────────────────────────────────────

test("an absent supports field writes NULL, it does not copy the merged set", () => {
  // Pinned against the source because this is a storage decision, not a pure
  // function. The first version wrote `citedStrict ?? urls`, which made a
  // silent fallback identical to a genuine reading where the answer used every
  // retrieved chunk. Opposite findings, same bytes, no way to tell them apart.
  const src = readFileSync("src/citations.ts", "utf8");
  assert.doesNotMatch(
    src,
    /JSON\.stringify\(r\.citedStrict \?\? r\.urls\)/,
    "cited_urls_strict must not fall back to the merged set: NULL means the engine did not tell us",
  );
  assert.match(src, /r\.citedStrict \? JSON\.stringify\(r\.citedStrict\) : null/);
});

// ── The columns must not be written in the wrong order ────────────────────
//
// FOUND 2026-09-15, in production, on four insert sites. The bind list read
//
//     JSON.stringify(r.urls), JSON.stringify(r.urls), null
//
// against columns (cited_urls, cited_urls_strict, retrieved_urls), so the
// merged retrieval set went into the STRICT column and the retrieval column
// got NULL. Right arity, right types, wrong order: every arity check passed,
// nothing threw, and both columns are JSON arrays of URLs so no reader could
// tell. It is the exact error this file exists to prevent, re-entered through
// a door the file was not watching.
//
// openai and google_ai_overview have no citation signal extracted at all, so
// their strict column must be NULL -- the same shape bing has always used.

test("no insert writes the merged URL set into cited_urls_strict", () => {
  const src = readFileSync("src/citations.ts", "utf8");
  assert.doesNotMatch(
    src,
    /JSON\.stringify\(r\.urls\),\s*JSON\.stringify\(r\.urls\),\s*null/,
    "cited_urls_strict is being bound the merged set with retrieved_urls set NULL: the two columns are swapped",
  );
});

test("an engine with no citation signal binds NULL to strict, not a copy", () => {
  const src = readFileSync("src/citations.ts", "utf8");
  // bing has always been correct and is the reference shape.
  const correct = src.match(/JSON\.stringify\(r\.urls\),\s*null,\s*JSON\.stringify\(r\.urls\)/g) ?? [];
  assert.ok(
    correct.length >= 6,
    `expected at least 6 sites binding (urls, null, urls) -- bing x2, openai x2, google_ai_overview x2 -- found ${correct.length}`,
  );
});

// ── What the vendor actually returns ──────────────────────────────────────
//
// MEASURED 2026-09-15 against the live Perplexity Agent API with the exact
// request body queryPerplexity sends: `annotations` comes back as an EMPTY
// LIST, every time. There are no inline [1][2] markers in the text either.
// All 67 rows that night stored [].
//
// So the PPLX fixture above is a shape the API can return, not one it does.
// The tests that use it prove the parser handles annotations correctly IF they
// arrive. They prove nothing about whether they arrive, and for eleven days
// they read as a passing citation test over a column that was empty in
// production. A fixture you wrote yourself pins your belief about a vendor,
// never the vendor.
//
// This is why the 2026-10-01 strict cutover was cancelled: on Perplexity it
// would have reported zero citations for every client.

test("perplexity yields no citations when the vendor sends no annotations", () => {
  const r = parsePerplexityAgentOutput({
    output: [
      { type: "search_results", results: [{ url: "https://a.com/1" }, { url: "https://b.com/2" }] },
      // The real shape: annotations present and empty.
      { type: "message", content: [{ type: "output_text", text: "Answer.", annotations: [] }] },
    ],
  } as unknown as Parameters<typeof parsePerplexityAgentOutput>[0]);
  assert.deepEqual(r.citedStrict, [], "no annotations means no citations, and that is the live case");
  assert.equal(r.retrievedUrls.length, 2, "retrieval is what this engine actually gives us");
});
