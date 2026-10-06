/* 2026-10-05, decision C: a client's affiliated domains are listed separately
 * and never counted as the client's own site.
 *
 * The case: a parent hotel group's page for the hotel. AI tools cite it, and
 * it was counted as an independent third-party source, topped the list of
 * places to "get listed", and became a punch-list destination. It is now
 * source type "affiliated" ("Your group's other sites"), listed apart from the
 * third-party hosts, and kept out of own-site link shares, venue share,
 * own_site_pulls and site_in_sources.
 *
 * With no affiliated rows configured nothing may change. The golden file was
 * captured from the code before the affiliated type existed (commit 9583327),
 * from the same fixture builder this test runs.
 *
 * Fictional business throughout: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAffiliatedFixture, affiliatedFixtureOutputs, GROUP } from "./support/affiliated-fixture";
import { classifySource, affiliatedMatch, SOURCE_TYPES } from "../src/lib/classify-source";
import { computeProminence } from "../src/citations";
import { renderCharts } from "../src/routes/customer-readouts";
import { AFFILIATED_BASIS } from "../src/lib/memo-inputs";
import { allowedNumberSet } from "../src/lib/memo-generator";

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const GOLDEN = read("./fixtures/affiliated-absent.golden.json");

type Out = Awaited<ReturnType<typeof affiliatedFixtureOutputs>>;
async function outputs(opts: Parameters<typeof buildAffiliatedFixture>[0]): Promise<Out | null> {
  const d1 = await buildAffiliatedFixture(opts);
  return d1 ? affiliatedFixtureOutputs(d1) : null;
}
const tcOf = (o: Out, i = 1) => JSON.parse(String(o.snapshots[i].top_competitors));
const ebOf = (o: Out, i = 1) => JSON.parse(String(o.snapshots[i].engines_breakdown));

// ── None configured: byte-identical ──────────────────────────────────────

test("with no affiliated table at all, every output is byte-identical to before", async (t) => {
  const out = await outputs({ withAffiliatedTable: false });
  if (!out) { t.skip("node:sqlite unavailable"); return; }
  assert.equal(JSON.stringify(out, null, 1) + "\n", GOLDEN);
});

test("with the table present and empty, every output is byte-identical to before", async (t) => {
  const out = await outputs({ withAffiliatedTable: true });
  if (!out) { t.skip("node:sqlite unavailable"); return; }
  assert.equal(JSON.stringify(out, null, 1) + "\n", GOLDEN);
});

// ── Configured ───────────────────────────────────────────────────────────

test("a group domain becomes its own source type and leaves the third-party list", async (t) => {
  const before = JSON.parse(GOLDEN) as Out;
  const out = await outputs({ withAffiliatedTable: true, affiliated: [{ domain: GROUP }] });
  if (!out) { t.skip("node:sqlite unavailable"); return; }
  const tc = tcOf(out);
  assert.ok(tc.source_types.affiliated, "its own bucket");
  assert.ok(!tc.offsite_hosts.some((h: { host: string }) => h.host === GROUP), "not a third-party host");
  assert.equal(tc.affiliated_hosts[0].host, GROUP, "listed separately");
  assert.equal(tc.source_types.owned.citations, tcOf(before).source_types.owned.citations, "never the client's own site");
  assert.equal(tc.htc_venue_share_pct, tcOf(before).htc_venue_share_pct, "venue share untouched");
  for (const [engine, row] of Object.entries(ebOf(out))) {
    assert.equal((row as { citations: number }).citations, (ebOf(before)[engine] as { citations: number }).citations, `${engine} own-site count`);
  }
  assert.equal(out.snapshots[1].citation_share, before.snapshots[1].citation_share);
  assert.equal(out.snapshots[1].client_citations, before.snapshots[1].client_citations);
});

test("the memo keeps own-site figures, drops the group site as a listing, and may name it", async (t) => {
  const before = (JSON.parse(GOLDEN) as Out).memo;
  const out = await outputs({ withAffiliatedTable: true, affiliated: [{ domain: GROUP }] });
  if (!out) { t.skip("node:sqlite unavailable"); return; }
  const m = out.memo;
  assert.equal(m.own_site_pulls, before.own_site_pulls);
  assert.deepEqual(m.overall, before.overall, "venue share and its counts");
  assert.deepEqual(m.by_question.map((q) => q.site_in_sources_runs), before.by_question.map((q) => q.site_in_sources_runs));
  assert.ok(!m.offsite.hosts.some((h) => h.host === GROUP));
  assert.ok(!m.destinations.listings.some((l) => l.host === GROUP), "never a place to get listed");
  assert.ok(m.offsite.source_types.some((s) => s.type === "affiliated"));
  assert.equal(m.affiliated?.hosts[0].host, GROUP);
  assert.equal(m.affiliated?.basis, AFFILIATED_BASIS);
  assert.ok(allowedNumberSet(m).has(String(m.affiliated!.hosts[0].share_pct)), "its share may be stated");
});

test("the readout labels the segment in plain words and names the group site once", async (t) => {
  const before = (JSON.parse(GOLDEN) as Out).facts!;
  const out = await outputs({ withAffiliatedTable: true, affiliated: [{ domain: GROUP }] });
  if (!out) { t.skip("node:sqlite unavailable"); return; }
  const f = out.facts!;
  const seg = f.sources.find((s) => s.label === "Your group's other sites");
  assert.ok(seg && !seg.own, "labelled, and not marked as the client's own");
  assert.equal(f.sources.find((s) => s.own)!.pct, before.sources.find((s) => s.own)!.pct);
  assert.ok(!f.topSources.some((s) => s.host === GROUP));
  assert.deepEqual(f.affiliatedSources?.map((s) => s.host), [GROUP]);
  const html = renderCharts(JSON.stringify(f));
  assert.match(html, /Your group&#39;s other sites|Your group's other sites/);
  assert.match(html, /never counted as your own site: examplegroup\.test\./);
  assert.doesNotMatch(html, /[—;] ?Your group/);
});

test("a path prefix marks only the client's page on a shared group domain", async (t) => {
  const out = await outputs({ withAffiliatedTable: true, affiliated: [{ domain: GROUP, path_prefix: "/hotels/example-hotel" }] });
  if (!out) { t.skip("node:sqlite unavailable"); return; }
  const tc = tcOf(out);
  // The hotel's own pages on the group site (three URL shapes) are affiliated,
  // the group's page for another hotel and its about page are not.
  const aff = tc.affiliated_hosts.find((h: { host: string }) => h.host === GROUP).citations;
  const third = tc.offsite_hosts.find((h: { host: string }) => h.host === GROUP).citations;
  const golden = tcOf(JSON.parse(GOLDEN) as Out).offsite_hosts.find((h: { host: string }) => h.host === GROUP).citations;
  assert.ok(aff > 0 && third > 0);
  assert.equal(aff + third, golden, "every group link is in exactly one of the two lists");
});

// ── The classifier ───────────────────────────────────────────────────────

test("affiliated sits after owned and before competitor, and only fires when configured", () => {
  const ctx = { owned: ["example-hotel.test"], affiliated: [{ domain: GROUP }], competitors: [GROUP, "rival-inn.test"] };
  assert.equal(classifySource("https://example-hotel.test/a", ctx), "owned");
  assert.equal(classifySource("https://www.examplegroup.test/hotels/example-hotel", ctx), "affiliated", "wins over a competitor listing");
  assert.equal(classifySource("https://rival-inn.test/", ctx), "competitor");
  assert.equal(classifySource("https://www.examplegroup.test/x", { owned: ["example-hotel.test"] }), "independent_web", "unconfigured: as before");
  assert.ok(SOURCE_TYPES.includes("affiliated"));
});

test("a path prefix matches the page and below it, never a sibling", () => {
  const list = [{ domain: "www.ExampleGroup.test", path_prefix: "/Hotels/Example-Hotel/" }];
  assert.equal(affiliatedMatch("https://examplegroup.test/hotels/example-hotel", list), true);
  assert.equal(affiliatedMatch("https://www.examplegroup.test/hotels/example-hotel/dining?x=1", list), true);
  assert.equal(affiliatedMatch("https://eu.examplegroup.test/hotels/example-hotel", list), true, "subdomains match");
  assert.equal(affiliatedMatch("https://examplegroup.test/hotels/example-hotel-two", list), false);
  assert.equal(affiliatedMatch("https://examplegroup.test/hotels", list), false);
  assert.equal(affiliatedMatch("https://notexamplegroup.test/hotels/example-hotel", list), false);
  assert.equal(affiliatedMatch("not a url", list), false);
  assert.equal(affiliatedMatch("https://examplegroup.test/", []), false);
});

test("an affiliated link can never set the run-level own-site flag", () => {
  // client_cited (site_in_sources) is decided at run time from the client's
  // own domain. A group page is a different host.
  assert.equal(computeProminence([], ["https://www.examplegroup.test/hotels/example-hotel"], "example-hotel.test", null), null);
});

// ── The rules ─────────────────────────────────────────────────────────────

test("the writer and the notes are told what a group site is", () => {
  const gen = read("../src/lib/memo-generator.ts");
  assert.match(gen, /THE CUSTOMER'S GROUP'S OTHER SITES ARE NOT THEIR OWN SITE/);
  assert.match(gen, /never put them in the punch list as a third-party place to get listed/);
  assert.match(gen, /INPUT_CONTRACT_REVISION = "2026-10-05\.[^"]*affiliated/);
  assert.match(read("../src/lib/report-notes.ts"), /"Your group's other sites" is pages of the business's wider group/);
  assert.doesNotMatch(AFFILIATED_BASIS, /[—;]/);
});

test("the migration is the next number, idempotent, and creates the table the code reads", () => {
  const sql = read("../migrations/0130_client_affiliated_domains.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS client_affiliated_domains/);
  assert.match(sql, /UNIQUE \(client_slug, domain, path_prefix\)/);
  assert.match(read("../src/lib/affiliated-domains.ts"), /FROM client_affiliated_domains WHERE client_slug = \? AND active = 1/);
});
