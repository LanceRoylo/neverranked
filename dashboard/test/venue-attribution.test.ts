import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributeVenueUrl,
  matchCohortMember,
  pathOf,
  regionOf,
  UMBRELLA_DOMAINS,
} from "../src/lib/venue-attribution.ts";

/**
 * Every fixture below is a REAL cited URL from prince-waikiki's September
 * measurement. Found 2026-09-07: a cohort of domains cannot see that
 * marriott.com hosts Sheraton Waikiki, the Royal Hawaiian and the Moana
 * Surfrider, so all three rendered at 0% in "Who AI names in your category"
 * while their combined citations sat inside a bar labelled "Marriott".
 */

const COHORT = [
  "alamoanahotelhonolulu.com", "alohilaniresort.com", "halekulani.com", "hilton.com",
  "hiltonhawaiianvillage.com", "hyatt.com", "kahalaresort.com", "marriott.com",
  "moana-surfrider.com", "outrigger.com", "outriggerwaikiki.com", "ritzcarlton.com",
  "royal-hawaiian.com", "sheraton-waikiki.com",
];

test("chain URLs resolve to the specific property and its island", () => {
  const cases: Array<[string, string, string]> = [
    ["/en-us/hotels/hnlws-sheraton-waikiki-beach-resort/pools/", "oahu", "Sheraton Waikiki Beach Resort"],
    ["/en/hotels/hnlhvhh-hilton-hawaiian-village-waikiki-beach-resort/", "oahu", "Hilton Hawaiian Village Waikiki Beach Resort"],
    ["/hyatt-regency/en-us/hnlrw-hyatt-regency-waikiki-beach-resort-and-spa/dining", "oahu", "Hyatt Regency Waikiki Beach Resort and Spa"],
    ["/hawaii/oahu/outrigger-waikiki-beach-resort", "oahu", "Outrigger Waikiki Beach Resort"],
    ["/en-us/hotels/koaak-mauna-kea-beach-hotel-autograph-collection/golf/", "big-island", "Mauna Kea Beach Hotel Autograph Collection"],
    ["/hyatt-regency/en-us/oggrm-hyatt-regency-maui-resort-and-spa", "maui", "Hyatt Regency Maui Resort and Spa"],
    ["/en/hotels/lihwbgi-hilton-garden-inn-kauai-wailua-bay/events/", "kauai", "Hilton Garden Inn Kauai Wailua Bay"],
  ];
  for (const [path, region, label] of cases) {
    const a = attributeVenueUrl(path);
    assert.equal(a.region, region, `region for ${path}`);
    assert.equal(a.label, label, `label for ${path}`);
  }
});

test("a label never starts with a lowercase article", () => {
  const a = attributeVenueUrl("/en-us/hotels/hnllc-the-royal-hawaiian-a-luxury-collection-resort-waikiki/overview/");
  assert.match(a.label, /^The /, `"${a.label}" reads as a typo in a paid deliverable`);
  assert.ok(a.label.includes(" a Luxury"), "articles stay lowercase inside the name");
});

test("cohort members are recovered from chain URLs", () => {
  const pairs: Array<[string, string]> = [
    ["hnlws-sheraton-waikiki-beach-resort", "sheraton-waikiki.com"],
    ["hnlhvhh-hilton-hawaiian-village-waikiki-beach-resort", "hiltonhawaiianvillage.com"],
    ["hnllc-the-royal-hawaiian-a-luxury-collection-resort-waikiki", "royal-hawaiian.com"],
    ["hnlwi-moana-surfrider-a-westin-resort-and-spa-waikiki-beach", "moana-surfrider.com"],
    ["outrigger-waikiki-beach-resort", "outriggerwaikiki.com"],
  ];
  for (const [slug, domain] of pairs) {
    assert.equal(matchCohortMember(slug, COHORT, UMBRELLA_DOMAINS), domain, `slug ${slug}`);
  }
});

test("REGRESSION: Princess Kaiulani is not credited to Sheraton Waikiki", () => {
  // A token-overlap rule matched this, because "sheraton" and "waikiki" both
  // appear. They are different hotels, and crediting one's citations to the
  // other is a wrong number in a client's competitive chart.
  assert.equal(
    matchCohortMember("hnlks-sheraton-princess-kaiulani-waikiki-beach", COHORT, UMBRELLA_DOMAINS),
    null,
  );
});

test("a brand domain never claims a property", () => {
  // "hilton" is a substring of every Hilton property slug. Letting it match
  // would rebuild the exact bundling this module exists to undo.
  assert.equal(matchCohortMember("hnlwahf-hilton-waikiki-beach-resort-and-spa", COHORT, UMBRELLA_DOMAINS), null);
  assert.equal(matchCohortMember("hnlrw-hyatt-regency-waikiki-beach-resort-and-spa", COHORT, UMBRELLA_DOMAINS), null);
});

test("contradicting region signals yield unknown rather than a guess", () => {
  // An OGG (Maui) code on a slug whose words say Waikiki cannot be resolved
  // honestly, and a wrong island silently removes a real competitor.
  assert.equal(attributeVenueUrl("/en-us/hotels/oggxx-some-waikiki-beach-hotel/").region, "unknown");
});

test("brand pages and listicles carry no property but keep their region", () => {
  const a = attributeVenueUrl("/en-us/destinations/united-states/hawaii/waikiki/business-center-hotels.mi");
  assert.equal(a.slug, "");
  assert.equal(a.label, "");
  assert.equal(a.region, "oahu", "a Waikiki listicle is still an Oahu page and must not be dropped");
});

test("regionOf reads the customer's own island from their domain", () => {
  assert.equal(regionOf("princewaikiki.com Prince Waikiki"), "oahu");
  // Undeterminable region must be null so the caller DISABLES filtering
  // rather than dropping every competitor as off-island.
  assert.equal(regionOf("example.com Some Business"), null);
});

test("pathOf is total and never throws", () => {
  assert.equal(pathOf("https://www.marriott.com/en-us/hotels/x/"), "/en-us/hotels/x/");
  assert.equal(pathOf("not a url"), "/");
  assert.equal(pathOf(""), "/");
});
