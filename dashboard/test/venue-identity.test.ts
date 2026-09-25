/* One hotel written twice, versus two hotels that look alike.
 *
 * Every label below is taken from prince-waikiki's stored cohort on
 * 2026-09-25. The true duplicates and the false ones sit at the same edit
 * distance, which is why a similarity threshold cannot separate them and this
 * compares distinctive cores instead. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { venueCore, sameVenue, groupVenues } from "../src/lib/venue-attribution";

const SAME: Array<[string, string]> = [
  ["The Laylow Waikiki Autograph Collection", "The Laylow Autograph Collection"],
  ["Sheraton Princess Kaiulani Waikiki Beach", "Sheraton Princess Kaiulani"],
  ["The Ritz Carlton Residences Waikiki Beach", "Ritz-Carlton Residences Waikiki"],
];

const DIFFERENT: Array<[string, string]> = [
  // One bar apart in the same chart. Merging these is the error this guards.
  ["Outrigger Waikiki Beach Resort", "Outrigger Reef Waikiki Beach Resort"],
  // Brand tiers: the tier IS the distinguishing word.
  ["Hyatt Regency Waikiki Beach Resort and Spa", "Hyatt Centric Waikiki Beach"],
  ["Hyatt Centric Waikiki Beach", "Hyatt Place Waikiki Beach"],
  ["Hilton Hawaiian Village", "Hilton Waikiki Beach Resort and Spa"],
  ["Hilton Waikiki Beach Resort and Spa", "Hilton Garden Inn Waikiki Beach"],
  ["Sheraton Waikiki", "Sheraton Princess Kaiulani"],
  ["The Kahala", "Ala Moana Hotel"],
  ["Halekulani", "The Royal Hawaiian"],
  // A brand landing page is not the property of the same name.
  ["Outrigger (brand pages)", "Outrigger Waikiki Beach Resort"],
  ["Hilton (brand pages)", "Hilton Hawaiian Village"],
];

test("the same hotel written two ways resolves to one property", () => {
  for (const [a, b] of SAME) {
    assert.equal(sameVenue(a, b), true, `${a} == ${b} (cores ${venueCore(a)} / ${venueCore(b)})`);
  }
});

test("hotels that merely look alike stay apart", () => {
  for (const [a, b] of DIFFERENT) {
    assert.equal(sameVenue(a, b), false, `${a} != ${b} (cores ${venueCore(a)} / ${venueCore(b)})`);
  }
});

test("containment never merges, which is what would eat Outrigger Reef", () => {
  assert.equal(venueCore("Outrigger Waikiki Beach Resort"), "outrigger");
  assert.equal(venueCore("Outrigger Reef Waikiki Beach Resort"), "outrigger reef");
  assert.notEqual(venueCore("Outrigger Waikiki Beach Resort"), venueCore("Outrigger Reef Waikiki Beach Resort"));
});

test("a label with no distinctive word merges with nothing", () => {
  for (const empty of ["Waikiki Beach Hotel", "The Resort", "Hotel"]) {
    assert.equal(venueCore(empty), "", `${empty} should have no core`);
    assert.equal(sameVenue(empty, "The Resort"), false, "an empty core must never match");
  }
});

test("grouping the real cohort collapses exactly the three known pairs", () => {
  const cohort = [
    "Halekulani", "The Royal Hawaiian", "Sheraton Waikiki", "Hilton Hawaiian Village",
    "The Ritz Carlton Residences Waikiki Beach", "The Kahala", "Ala Moana Hotel",
    "Outrigger (brand pages)", "Waikiki Beach Marriott Resort and Spa",
    "Hyatt Regency Waikiki Beach Resort and Spa", "Marriott (brand pages)",
    "Ka Lai Waikiki Beach", "Moana Surfrider", "Hilton Waikiki Beach Resort and Spa",
    "Alohilani Resort Waikiki Beach", "Renaissance Honolulu Hotel and Spa",
    "Hyatt Centric Waikiki Beach", "Hilton (brand pages)",
    "The Laylow Waikiki Autograph Collection", "Sheraton Princess Kaiulani Waikiki Beach",
    "The Ritz Carlton Oahu Turtle Bay", "Hilton Vacation Club the Modern Honolulu",
    "Outrigger Reef Waikiki Beach Resort", "The Ambassador Hotel of Waikiki",
    "The Laylow Autograph Collection", "Hyatt Place Waikiki Beach",
    "Outrigger Waikiki Beach Resort", "Courtyard Waikiki Beach",
    "Doubletree Alana Waikiki Beach", "Hyatt (brand pages)",
    "Hilton Garden Inn Waikiki Beach", "Sheraton Princess Kaiulani",
    "Embassy Suites Waikiki Beach Walk", "Ac Hotel Honolulu",
    "Ritz-Carlton Residences Waikiki",
  ];
  const groups = groupVenues(cohort);
  const merged = groups.filter((g) => g.labels.length > 1);
  assert.equal(merged.length, 3, `expected 3 merges, got ${merged.length}: ${JSON.stringify(merged.map(m => m.labels))}`);
  // 35 labels, 3 pairs collapsed, so 32 distinct properties.
  assert.equal(groups.length, 32, `expected 32 distinct properties, got ${groups.length}`);
  for (const g of merged) assert.equal(g.labels.length, 2, "each merge is a pair, never a pile-up");
});
