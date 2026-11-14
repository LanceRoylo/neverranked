/* 2026-11-11, migration 0134: a client's own site can be a path on a shared
 * domain.
 *
 * The case: one venue of a group whose venues all live on one domain
 * (examplejazz.test/harbor/, examplejazz.test/uptown/, ...). Own-site matching
 * was host-only, so every venue's pages counted as the client's own site, in
 * run-level client_cited and in the readout snapshot alike.
 *
 * With no row, nothing may change: the affiliated golden file (captured
 * before either feature existed) still passes in affiliated-domains.test.ts,
 * and the cases below prove host-only matching for a client without a prefix.
 *
 * Fictional business throughout: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openD1, SCHEMA, type SqliteD1 } from "./support/d1-sqlite";
import { classifySource, ownedUrlMatch, normPathPrefix, affiliatedMatch } from "../src/lib/classify-source";
import { computeProminence } from "../src/citations";
import { buildMonthEndSnapshot } from "../src/lib/month-end-snapshot";
import { gatherMemoInputs } from "../src/lib/memo-inputs";
import { loadOwnedPathPrefix } from "../src/lib/owned-path";

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const SEP1 = at("2026-09-01T00:00:00Z");
const OCT1 = at("2026-10-01T00:00:00Z");
const SLUG = "example-jazz-harbor";
const SITE = "examplejazz.test";

// ── The matcher ──────────────────────────────────────────────────────────

test("with a prefix, only the venue's own pages are its site", () => {
  const p = "/harbor";
  assert.equal(ownedUrlMatch("https://www.examplejazz.test/harbor/", SITE, p), true);
  assert.equal(ownedUrlMatch("https://examplejazz.test/harbor", SITE, p), true, "no trailing slash");
  assert.equal(ownedUrlMatch("https://examplejazz.test/Harbor/Shows?d=1", SITE, p), true, "below it, any case");
  assert.equal(ownedUrlMatch("https://examplejazz.test/harborside/", SITE, p), false, "a sibling that shares the letters");
  assert.equal(ownedUrlMatch("https://examplejazz.test/uptown/", SITE, p), false, "another venue");
  assert.equal(ownedUrlMatch("https://examplejazz.test/", SITE, p), false, "the group's home page");
  assert.equal(ownedUrlMatch("https://tickets.examplejazz.test/harbor/x", SITE, p), true, "subdomains match as before");
  assert.equal(ownedUrlMatch("https://notexamplejazz.test/harbor/", SITE, p), false);
  assert.equal(ownedUrlMatch("not a url", SITE, p), false);
});

test("the prefix is written any reasonable way", () => {
  for (const raw of ["/harbor", "/harbor/", "harbor", " /Harbor/ ", "/harbor//"]) {
    assert.equal(normPathPrefix(raw), "/harbor", JSON.stringify(raw));
  }
  for (const none of ["", "  ", "/", null, undefined]) assert.equal(normPathPrefix(none), "");
});

test("without a prefix, matching is host-only exactly as before", () => {
  for (const p of [undefined, "", "/", null]) {
    assert.equal(ownedUrlMatch("https://www.examplejazz.test/uptown/", SITE, p), true);
    assert.equal(ownedUrlMatch("https://examplejazz.test/", SITE, p), true);
    assert.equal(ownedUrlMatch("https://other.test/harbor/", SITE, p), false);
  }
  assert.equal(ownedUrlMatch("https://examplejazz.test/", "", ""), false, "no owned domain matches nothing");
});

test("run-level client_cited: other venues' pages no longer count, and old 4-argument calls are unchanged", () => {
  const urls = ["https://examplejazz.test/uptown/", "https://news.example/x", "https://examplejazz.test/harbor/menu"];
  assert.equal(computeProminence([], urls, SITE, null), 1, "host-only: the first group page");
  assert.equal(computeProminence([], urls, SITE, null, ""), 1);
  assert.equal(computeProminence([], urls, SITE, null, "/harbor"), 3, "the venue's own page, where it sits");
  assert.equal(computeProminence([], ["https://examplejazz.test/uptown/"], SITE, null, "/harbor"), null);
  assert.equal(
    computeProminence([{ name: "Example Jazz Harbor" }] as never, ["https://examplejazz.test/uptown/"], SITE, "Example Jazz Harbor", "/harbor"),
    1, "the name branch is untouched",
  );
});

test("the classifier: own pages are owned, other venues fall through to affiliated or the rules", () => {
  const base = { owned: [SITE], ownedPathPrefix: "/harbor" };
  assert.equal(classifySource("https://examplejazz.test/harbor/", base), "owned");
  assert.equal(classifySource("https://examplejazz.test/uptown/", base), "independent_web", "not owned, nothing else configured");
  assert.equal(classifySource("https://examplejazz.test/uptown/", { ...base, affiliated: [{ domain: SITE }] }), "affiliated");
  assert.equal(classifySource("https://examplejazz.test/harbor/", { ...base, affiliated: [{ domain: SITE }] }), "owned", "owned still wins");
  assert.equal(classifySource("https://examplejazz.test/uptown/", { owned: [SITE] }), "owned", "no prefix: as before");
  assert.equal(classifySource("https://examplejazz.test/uptown/", { owned: [SITE], ownedPathPrefix: "" }), "owned");
});

test("affiliated matching keeps its meaning after sharing the path logic", () => {
  const list = [{ domain: SITE, path_prefix: "/uptown/" }];
  assert.equal(affiliatedMatch("https://www.examplejazz.test/uptown", list), true);
  assert.equal(affiliatedMatch("https://examplejazz.test/uptown/shows", list), true);
  assert.equal(affiliatedMatch("https://examplejazz.test/uptowner", list), false);
  assert.equal(affiliatedMatch("https://examplejazz.test/harbor/", list), false);
});

// ── The loader ───────────────────────────────────────────────────────────

test("the loader fails open to host-only and reads only an active row", async (t) => {
  const none = await openD1(SCHEMA);
  if (!none) { t.skip("node:sqlite unavailable"); return; }
  assert.equal(await loadOwnedPathPrefix(none.env, SLUG), "", "no table");
  const d1 = (await openD1(SCHEMA + OWNED_TABLE))!;
  assert.equal(await loadOwnedPathPrefix(d1.env, SLUG), "", "no row");
  d1.db.prepare("INSERT INTO client_owned_paths (client_slug, path_prefix, active) VALUES (?, 'Harbor/', 0)").run(SLUG);
  assert.equal(await loadOwnedPathPrefix(d1.env, SLUG), "", "inactive row");
  d1.db.prepare("UPDATE client_owned_paths SET active = 1").run();
  assert.equal(await loadOwnedPathPrefix(d1.env, SLUG), "/harbor", "normalised");
});

// ── The readout snapshot and memo, end to end ────────────────────────────

const OWNED_TABLE = `CREATE TABLE client_owned_paths (id INTEGER PRIMARY KEY, client_slug TEXT UNIQUE, path_prefix TEXT NOT NULL DEFAULT '', note TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER);
CREATE TABLE client_affiliated_domains (id INTEGER PRIMARY KEY, client_slug TEXT, domain TEXT, path_prefix TEXT NOT NULL DEFAULT '', note TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER);`;

// Per engine, two answers. Own venue pages: 3. Other group pages: 4 (two other venues, a look-alike path, the home page).
const ENGINE_URLS: Record<string, string[][]> = {
  perplexity: [
    ["https://www.examplejazz.test/harbor/", "https://examplejazz.test/uptown/", "https://news.example/best-jazz"],
    ["https://rival-club.test/shows", "https://examplejazz.test/riverside/"],
  ],
  openai: [
    ["https://examplejazz.test/harbor/menu", "https://www.yelp.com/biz/example"],
    ["https://examplejazz.test/harborside/", "https://rival-club.test/"],
  ],
  gemini: [
    ["https://news.example/weekend", "https://examplejazz.test/"],
    ["https://examplejazz.test/harbor/shows"],
  ],
};

async function build(opts: { prefix?: string; affiliatedGroup?: boolean }): Promise<SqliteD1 | null> {
  const d1 = await openD1(SCHEMA + OWNED_TABLE);
  if (!d1) return null;
  const ins = (sql: string, ...a: unknown[]) => d1.db.prepare(sql).run(...a);
  ins("INSERT INTO measurement_registry VALUES (?, 1, 'sweep', ?)", SLUG, SEP1);
  ins("INSERT INTO customers (client_slug, name, status) VALUES (?, 'Example Jazz Harbor', 'active')", SLUG);
  ins("INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active) VALUES (?, ?, 0, NULL, 1)", SLUG, SITE);
  ins("INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active) VALUES (?, 'rival-club.test', 1, 'Rival Club', 1)", SLUG);
  if (opts.prefix !== undefined) ins("INSERT INTO client_owned_paths (client_slug, path_prefix, active) VALUES (?, ?, 1)", SLUG, opts.prefix);
  if (opts.affiliatedGroup) ins("INSERT INTO client_affiliated_domains (client_slug, domain, path_prefix, active) VALUES (?, ?, '', 1)", SLUG, SITE);
  ["late jazz near the harbor", "dinner and a show"].forEach((k, i) =>
    ins("INSERT INTO citation_keywords (id, client_slug, keyword, category, active) VALUES (?, ?, ?, 'client', 1)", i + 1, SLUG, k));
  let day = 0;
  for (const [engine, lists] of Object.entries(ENGINE_URLS)) {
    lists.forEach((urls, i) => {
      day += 1;
      const cited = computeProminence([], urls, SITE, null, opts.prefix ?? "") !== null ? 1 : 0;
      ins(`INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at)
           VALUES (?, ?, ?, ?, ?, 'Several clubs have late sets.', ?)`,
        i + 1, engine, cited, JSON.stringify(urls),
        // A model-knowledge-style entity pointing at ANOTHER venue's page.
        JSON.stringify([{ name: "Uptown room", url: "https://examplejazz.test/uptown/" }]),
        SEP1 + day * 86400);
    });
  }
  // Model knowledge: no url list, the unit is the response. One answer points
  // at another venue's page, one at the client's own.
  for (const [k, url] of [[1, "https://examplejazz.test/uptown/"], [2, "https://examplejazz.test/harbor/"]] as const) {
    day += 1;
    ins(`INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at)
         VALUES (?, 'anthropic', 0, '[]', ?, 'A few rooms to try.', ?)`,
      k, JSON.stringify([{ name: "A jazz room", url }]), SEP1 + day * 86400);
  }
  await buildMonthEndSnapshot(d1.env, SLUG, { start: SEP1, end: OCT1, monthKey: "2026-09" });
  return d1;
}
const eb = (d1: SqliteD1) => JSON.parse(String(snap(d1).engines_breakdown)) as Record<string, { citations?: number; queries?: number }>;
const snap = (d1: SqliteD1) => d1.rows("SELECT top_competitors, engines_breakdown FROM citation_snapshots WHERE client_slug = ?", SLUG)[0];
const ownedOf = (d1: SqliteD1) => JSON.parse(String(snap(d1).top_competitors)).source_types.owned?.citations ?? 0;
const engOwned = (d1: SqliteD1) =>
  Object.entries(JSON.parse(String(snap(d1).engines_breakdown)) as Record<string, { citations?: number }>)
    .filter(([k]) => k !== "Claude")
    .reduce((n, [, r]) => n + (r.citations ?? 0), 0);

test("snapshot without a prefix: every group page is counted as the client's own (the old behaviour)", async (t) => {
  const d1 = await build({});
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  assert.equal(ownedOf(d1), 7, "own pages, other venues, the group home page and the look-alike all counted");
  assert.equal(engOwned(d1), 7);
  assert.equal(eb(d1).Claude?.citations, 2, "model knowledge: both answers, either venue");
});

test("snapshot with a prefix: only the venue's own pages are its site", async (t) => {
  const d1 = await build({ prefix: "/harbor" });
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  assert.equal(ownedOf(d1), 3);
  assert.equal(engOwned(d1), 3);
  assert.equal(eb(d1).Claude?.citations, 1, "model knowledge: only the answer pointing at the venue's own page");
  const tc = JSON.parse(String(snap(d1).top_competitors));
  assert.ok(tc.offsite_hosts.some((h: { host: string }) => h.host === SITE), "other venues read as another site");
  const runs = d1.rows("SELECT client_cited FROM citation_runs WHERE engine != 'anthropic' ORDER BY id").map((r) => r.client_cited);
  assert.deepEqual(runs, [1, 0, 1, 0, 0, 1], "run-level flag: only answers with a /harbor page");
});

test("with the group domain also marked affiliated, other venues are 'your group's other sites'", async (t) => {
  const d1 = await build({ prefix: "/harbor", affiliatedGroup: true });
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const tc = JSON.parse(String(snap(d1).top_competitors));
  assert.equal(ownedOf(d1), 3, "own pages still owned");
  assert.equal(tc.affiliated_hosts.find((h: { host: string }) => h.host === SITE)?.citations, 4);
  assert.ok(!tc.offsite_hosts.some((h: { host: string }) => h.host === SITE), "never a place to get listed");
});

test("the memo links to the venue's own pages, not the group's home page", async (t) => {
  const withPrefix = await build({ prefix: "/harbor" });
  if (!withPrefix) { t.skip("node:sqlite unavailable"); return; }
  const m = await gatherMemoInputs(withPrefix.env, SLUG, new Date((OCT1 - 1) * 1000), { monthEndSnapshot: true });
  assert.equal(m.destinations.own_site, "https://examplejazz.test/harbor/");
  const without = (await build({}))!;
  const m0 = await gatherMemoInputs(without.env, SLUG, new Date((OCT1 - 1) * 1000), { monthEndSnapshot: true });
  assert.equal(m0.destinations.own_site, "https://examplejazz.test", "no prefix: as before");
});

// ── The migration ─────────────────────────────────────────────────────────

test("the migration is idempotent and creates the table the loader reads", () => {
  const sql = read("../migrations/0134_client_owned_path.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS client_owned_paths/);
  assert.match(sql, /client_slug TEXT NOT NULL UNIQUE/);
  assert.match(read("../src/lib/owned-path.ts"), /FROM client_owned_paths WHERE client_slug = \? AND active = 1/);
});
