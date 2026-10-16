/* One fictional client month used to prove that affiliated domains, when none
 * are configured, change nothing (decision C, 2026-10-05). The same builder
 * produced the golden file before the affiliated code existed and runs again
 * in the test after it, so any difference is the code's.
 *
 * The citations include a parent group's pages (examplegroup.test), which is
 * exactly the kind of host a client row would mark affiliated. Fictional
 * names only: the repo is public. */
import { openD1, SCHEMA, type SqliteD1 } from "./d1-sqlite";
import { buildMonthEndSnapshot } from "../../src/lib/month-end-snapshot";
import { gatherMemoInputs } from "../../src/lib/memo-inputs";
import { buildReportFacts } from "../../src/lib/report-facts";

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
export const AUG1 = at("2026-08-01T00:00:00Z");
export const SEP1 = at("2026-09-01T00:00:00Z");
export const OCT1 = at("2026-10-01T00:00:00Z");
export const SLUG = "example-hotel";
export const GROUP = "examplegroup.test";

const ENGINE_URLS: Record<string, string[][]> = {
  perplexity: [
    ["https://example-hotel.test/rooms", "https://www.examplegroup.test/hotels/example-hotel", "https://www.tripadvisor.com/Hotel_Review-x"],
    ["https://rival-inn.test/stay", "https://news.example/best-hotels", "https://examplegroup.test/hotels/other-hotel"],
  ],
  openai: [
    ["https://www.examplegroup.test/hotels/example-hotel/dining", "https://www.yelp.com/biz/example"],
    ["https://example-hotel.test/", "https://rival-inn.test/"],
  ],
  google_ai_overview: [
    ["https://www.google.com/searchviewer/1?svid=a", "https://examplegroup.test/hotels/example-hotel", "https://example-hotel.test/spa"],
    ["https://www.tripadvisor.com/y", "https://rival-inn.test/deals"],
  ],
  gemini: [
    ["https://news.example/weekend", "https://www.examplegroup.test/about"],
    ["https://example-hotel.test/offers"],
  ],
  bing: [["https://example-hotel.test/", "https://examplegroup.test/"], ["https://rival-inn.test/"]],
};

export async function buildAffiliatedFixture(opts: { withAffiliatedTable: boolean; affiliated?: Array<{ domain: string; path_prefix?: string }> }): Promise<SqliteD1 | null> {
  const d1 = await openD1(SCHEMA + (opts.withAffiliatedTable
    ? `CREATE TABLE client_affiliated_domains (id INTEGER PRIMARY KEY, client_slug TEXT, domain TEXT, path_prefix TEXT NOT NULL DEFAULT '', note TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER);`
    : ""));
  if (!d1) return null;
  const ins = (sql: string, ...a: unknown[]) => d1.db.prepare(sql).run(...a);
  ins("INSERT INTO measurement_registry VALUES (?, 1, 'sweep', ?)", SLUG, AUG1);
  ins("INSERT INTO customers (client_slug, name, status) VALUES (?, 'Example Hotel', 'active')", SLUG);
  ins("INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active) VALUES (?, 'example-hotel.test', 0, NULL, 1)", SLUG);
  ins("INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active) VALUES (?, 'rival-inn.test', 1, 'Rival Inn', 1)", SLUG);
  for (const a of opts.affiliated ?? []) {
    ins("INSERT INTO client_affiliated_domains (client_slug, domain, path_prefix, active) VALUES (?, ?, ?, 1)", SLUG, a.domain, a.path_prefix ?? "");
  }
  const kws = ["quiet hotel near the marina", "hotel with a spa", "family hotel with a pool"];
  kws.forEach((k, i) => ins("INSERT INTO citation_keywords (id, client_slug, keyword, category, active) VALUES (?, ?, ?, 'client', 1)", i + 1, SLUG, k));
  const own = (urls: string[]) => (urls.some((u) => /\/\/example-hotel\.test\//.test(u)) ? 1 : 0);
  let day = 0;
  for (const month of [AUG1, SEP1]) {
    for (const [engine, lists] of Object.entries(ENGINE_URLS)) {
      lists.forEach((urls, i) => {
        for (let k = 1; k <= 3; k++) {
          day = (day % 25) + 1;
          ins(`INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at)
               VALUES (?, ?, ?, ?, '[]', ?, ?)`,
            k, engine, own(urls), JSON.stringify(urls),
            i === 0 ? "Example Hotel is a calm choice near the marina." : "Several hotels near the marina have pools.",
            month + day * 86400 + i * 3600);
        }
      });
    }
    for (const k of [1, 2, 3]) {
      ins(`INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at)
           VALUES (?, 'anthropic', 0, '[]', ?, 'Example Hotel and Rival Inn are both options.', ?)`,
        k, JSON.stringify([{ name: "Example Hotel", url: "https://www.examplegroup.test/hotels/example-hotel" }, { name: "Rival Inn", url: "https://rival-inn.test" }]),
        month + (k + 2) * 86400);
    }
  }
  return d1;
}

/** Everything a reader sees, in a stable order. Timestamps of the build are
 *  left out: they are the clock, not the data. */
export async function affiliatedFixtureOutputs(d1: SqliteD1) {
  await buildMonthEndSnapshot(d1.env, SLUG, { start: AUG1, end: SEP1, monthKey: "2026-08" });
  await buildMonthEndSnapshot(d1.env, SLUG, { start: SEP1, end: OCT1, monthKey: "2026-09" });
  const snapshots = d1.rows(
    `SELECT week_start, total_queries, client_citations, citation_share, top_competitors, keyword_breakdown, engines_breakdown, query_set_hash
       FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start`, SLUG);
  const aug = await buildReportFacts(d1.env, SLUG, "2026-08");
  d1.db.prepare("INSERT INTO monthly_memos (client_slug, month_key, title, body_markdown, delivered_at, facts_json) VALUES (?, '2026-08', 't', 'b', ?, ?)")
    .run(SLUG, SEP1 + 86400, JSON.stringify(aug));
  const memo = await gatherMemoInputs(d1.env, SLUG, new Date((OCT1 - 1) * 1000), { monthEndSnapshot: true });
  const facts = await buildReportFacts(d1.env, SLUG, "2026-09");
  return { snapshots, memo, facts };
}
