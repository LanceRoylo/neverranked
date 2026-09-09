import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReadoutSnapshot } from "../src/citations.ts";
import { isReadoutShapeSnapshot } from "../src/lib/snapshot-shape.ts";

/**
 * buildReadoutSnapshot must follow the PUBLISHED methodology, which defines
 * the two layers differently:
 *
 *   Layer 1 (citation-grade)  -> cited if the DOMAIN is in the URL list
 *   Layer 2 (model-knowledge) -> mentioned if the NAME is in the response
 *
 * The forensic bridge collapses these, scoring Claude on URL counts for an
 * engine the page says does not retrieve. This writer must not. See
 * neverranked-docs/CLAIMS-VS-CODE-AUDIT-2026-09-06.md.
 */

const OWNED = "princewaikiki.com";
const COMPETITORS = [{ domain: "halekulani.com" }, { domain: "hilton.com" }];

const RUNS = [
  // --- Layer 1: Perplexity. 5 URLs total, 1 of them owned -> 20%.
  {
    engine: "perplexity",
    client_cited: 1,
    keyword: "q1",
    cited_urls: JSON.stringify([
      "https://princewaikiki.com/a",
      "https://halekulani.com/b",
      "https://www.tripadvisor.com/c",
    ]),
    cited_entities: "[]",
  },
  {
    engine: "perplexity",
    client_cited: 0,
    keyword: "q2",
    cited_urls: JSON.stringify(["https://gohawaii.com/x", "https://hilton.com/y"]),
    cited_entities: "[]",
  },
  // --- Layer 2: Claude. 2 responses, 1 mentions the brand -> 50%.
  // cited_urls is '[]' by design for training-mode engines; the model-emitted
  // URLs live in cited_entities and must NOT be counted as citations.
  //
  // NOTE client_cited is 0 on BOTH rows. That is the prince-waikiki
  // production state: with no injection_configs row the business name was
  // null, so computeProminence could only ever return null for a
  // model-knowledge engine and every row was flagged 0. The writer must
  // recompute from entities rather than inherit that.
  {
    engine: "anthropic",
    client_cited: 0,
    keyword: "q1",
    cited_urls: "[]",
    cited_entities: JSON.stringify([{ name: "Prince Waikiki", url: "https://princewaikiki.com" }]),
  },
  {
    engine: "anthropic",
    client_cited: 0,
    keyword: "q2",
    cited_urls: "[]",
    cited_entities: JSON.stringify([{ name: "Halekulani", url: "https://www.halekulani.com" }]),
  },
];

function mockEnv(
  opts: { injectionConfig?: unknown; customerName?: string | null; ownedDomain?: string } = {},
) {
  const written: Record<string, unknown> = {};
  const {
    injectionConfig = null,
    customerName = "Prince Waikiki",
    ownedDomain = OWNED,
  } = opts;
  const DB = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes("is_competitor = 0")) return { domain: ownedDomain };
              // prince-waikiki genuinely has no injection_configs row.
              if (sql.includes("injection_configs")) return injectionConfig;
              if (sql.includes("FROM customers")) {
                return customerName === null ? null : { name: customerName };
              }
              return null;
            },
            async all() {
              if (sql.includes("is_competitor = 1")) return { results: COMPETITORS };
              if (sql.includes("citation_runs")) return { results: RUNS };
              return { results: [] };
            },
            async run() {
              if (sql.includes("INSERT INTO citation_snapshots")) {
                written.client_slug = args[0];
                written.total_queries = args[2];
                written.client_citations = args[3];
                written.citation_share = args[4];
                written.top_competitors = args[5];
                written.keyword_breakdown = args[6];
                written.engines_breakdown = args[7];
              }
              return {};
            },
          };
        },
      };
    },
  };
  return { env: { DB } as never, written };
}

async function build() {
  const { env, written } = mockEnv();
  const res = await buildReadoutSnapshot(env, "prince-waikiki", 0, 9_999_999_999);
  assert.equal(res.ok, true, "writer should report success");
  return {
    eb: JSON.parse(String(written.engines_breakdown)) as Record<string, Record<string, number | string>>,
    tc: JSON.parse(String(written.top_competitors)) as Record<string, never>,
    kb: JSON.parse(String(written.keyword_breakdown)) as Record<string, number>,
    written,
  };
}

test("Layer 1 share_pct is share of CITED URLS", async () => {
  const { eb } = await build();
  const p = eb["Perplexity"];
  assert.equal(p.total, 5, "denominator is URLs, not runs");
  assert.equal(p.citations, 1);
  assert.equal(p.share_pct, 20);
  assert.equal(p.layer, "citation");
});

test("Layer 2 share_pct is share of RESPONSES, and is tagged as such", async () => {
  const { eb } = await build();
  const c = eb["Claude"];
  // 2 responses, 1 mentioning the brand. If this ever reads as a URL count
  // (the bridge's behaviour) the number silently changes meaning.
  assert.equal(c.total, 2, "denominator is responses, not URLs");
  assert.equal(c.citations, 1);
  assert.equal(c.share_pct, 50);
  assert.equal(c.layer, "model_knowledge");
});

test("model-emitted URLs never enter the source-type provenance chart", async () => {
  const { tc } = await build();
  const st = tc["source_types"] as unknown as Record<string, { citations: number }>;
  const total = Object.values(st).reduce((a, b) => a + b.citations, 0);
  // Only Perplexity's 5 URLs. Claude's two entity URLs must be excluded:
  // "where AI pulls its answers from" is not a question a non-retrieving
  // model can answer, and folding recalled URLs in would put invented
  // sources into a chart the customer reads as provenance.
  assert.equal(total, 5, "Layer 2 entity URLs leaked into source_types");
  assert.equal(st["owned"].citations, 1);
  assert.equal(st["competitor"].citations, 2);
  assert.equal(st["review_directory"].citations, 1);
  assert.equal(st["independent_web"].citations, 1);
});

test("venue share is computed from Layer 1 citations only", async () => {
  const { tc } = await build();
  // owned 1 citation, competitors 2 (halekulani 1 + hilton 1) -> 1/3 = 33%.
  // Claude's mention of the brand must not inflate this; mixing a citation
  // numerator with a response denominator is not a quantity.
  assert.equal(tc["htc_venue_share_pct"], 33);
  assert.equal(tc["venue_basis"], "layer1_citations");
});

test("engines_count spans both layers (where you appear AT ALL)", async () => {
  const { eb, tc } = await build();
  // Perplexity cited the site and Claude mentioned the brand: two surfaces.
  assert.equal(tc["htc_engines_count"], 2);
  assert.equal(Object.keys(eb).length, 2, "only engines that actually ran");
});

test("an engine that never ran is omitted rather than rendered as a zero", async () => {
  const { eb } = await build();
  // A measured-zero and a never-ran must not look the same in a delivered
  // chart. Gemma and the Bing control did not run in this fixture.
  assert.ok(!("Gemma" in eb));
  assert.ok(!("Bing search (control)" in eb));
});

test("the written row passes the readout-shape guard report-facts uses", async () => {
  const { written } = await build();
  assert.equal(
    isReadoutShapeSnapshot(String(written.engines_breakdown), String(written.top_competitors)),
    true,
    "row would still fall back to narrative-only",
  );
});

test("engine labels match the bridge's exactly (prior-month join key)", async () => {
  const { eb } = await build();
  // report-facts joins the prior report's engines BY NAME. A label differing
  // by one word drops the dumbbell's "from" dots silently.
  assert.ok("Perplexity" in eb);
  assert.ok("Claude" in eb);
  assert.ok(!("ChatGPT" in eb), "must be 'ChatGPT search', the bridge's label");
});

test("REGRESSION: a mention is recomputed from entities, not inherited from client_cited", async () => {
  // The prince-waikiki bug found 2026-09-06. Both Claude rows in the fixture
  // carry client_cited = 0 because the business name was null at run time.
  // Gemma named that business in a substantial share of real responses and
  // every one was flagged 0. Trusting the flag ships "Gemma 0%", which a customer
  // reads as being invisible in model knowledge -- a false finding.
  const { eb } = await build();
  assert.equal(eb["Claude"].citations, 1, "writer inherited the broken flag");
  assert.equal(eb["Claude"].share_pct, 50);
});

test("no resolvable business name REFUSES to write rather than asserting 0%", async () => {
  // Layer 2 measures by name. Without a name every model-knowledge surface
  // reads 0%, which is an assertion of absence the writer cannot support.
  // Failing closed is the only honest option.
  const { env, written } = mockEnv({ injectionConfig: null, customerName: null });
  const res = await buildReadoutSnapshot(env, "prince-waikiki", 0, 9_999_999_999);
  assert.equal(res.ok, false);
  // The reason is the point: the caller now raises an alert naming WHICH
  // guard refused, and "no business name" is the one that would otherwise
  // publish a readout asserting an absence it never measured.
  assert.equal(res.reason, "no_business_name");
  assert.equal(written.engines_breakdown, undefined, "must not write a row at all");
});

test("injection_configs still wins when the row exists (hawaii-theatre path)", async () => {
  const { env, written } = mockEnv({
    injectionConfig: { business_name: "Hawaii Theatre Center" },
    customerName: "ignored, injection_configs wins",
    ownedDomain: "hawaiitheatre.com",
  });
  await buildReadoutSnapshot(env, "hawaii-theatre", 0, 9_999_999_999);
  const eb = JSON.parse(String(written.engines_breakdown));
  // Neither the entity NAME ("Prince Waikiki") nor its URL host now belongs to
  // this client, so Claude reads 0 of 2 responses. Asserted so a future change
  // to name resolution cannot silently repoint an existing client's matcher
  // at the wrong brand.
  assert.equal(eb["Claude"].citations, 0);
  assert.equal(eb["Claude"].total, 2);
});

test("scalar columns are question counts, share is the Layer 1 citation share", async () => {
  const { written, kb } = await build();
  assert.equal(written.total_queries, 2);
  assert.equal(written.client_citations, 1);
  assert.equal(written.citation_share, 1 / 5);
  assert.deepEqual(kb, { questions_with_owned: 1, total_questions: 2 });
});
