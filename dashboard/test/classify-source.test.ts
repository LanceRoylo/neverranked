import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySource, hostOf, SOURCE_TYPES } from "../src/lib/classify-source.ts";

// PARITY FIXTURE. Every expectation below was produced by RUNNING
// dryrun/forensic/classify.mjs, not by reading it. The published methodology
// page documents these nine buckets by name, so the research pipeline and the
// Worker must agree: if they diverge, one of them contradicts a public page.
//
// Regenerate after any change to either implementation:
//   node -e 'import("<abs path>/classify.mjs").then(m=>{...})'
// and paste the output here rather than hand-editing an expectation.

const CTX = { owned: ["princewaikiki.com"], competitors: ["halekulani.com", "hilton.com"] };

const PARITY: Array<[string, string]> = [
  ["https://www.princewaikiki.com/dining", "owned"],
  ["https://blog.princewaikiki.com/x", "owned"],
  ["https://www.halekulani.com/", "competitor"],
  ["https://hilton.com/en/hotels/abc", "competitor"],
  ["https://www.youtube.com/watch?v=1", "youtube"],
  ["https://youtu.be/abc", "youtube"],
  ["https://www.reddit.com/r/Hawaii/comments/x", "reddit"],
  ["https://en.wikipedia.org/wiki/Waikiki", "wikipedia"],
  ["https://www.wikidata.org/wiki/Q1", "wikipedia"],
  ["https://www.quora.com/What-is", "forum"],
  ["https://news.ycombinator.com/item?id=1", "forum"],
  ["https://community.example.com/thread", "forum"],
  ["https://forum.example.org/t/1", "forum"],
  ["https://www.linkedin.com/company/x", "social"],
  ["https://medium.com/@a/b", "social"],
  ["https://x.com/someone", "social"],
  ["https://www.tripadvisor.com/Hotel_Review", "review_directory"],
  ["https://www.tripadvisor.co.uk/Hotel_Review", "review_directory"],
  ["https://www.yelp.com/biz/x", "review_directory"],
  ["https://www.bbb.org/us/hi", "review_directory"],
  ["https://www.gohawaii.com/islands/oahu", "independent_web"],
  ["https://honolulumagazine.com/best-of", "independent_web"],
  ["not a url", "invalid"],
  ["", "invalid"],
  ["ftp://files.example.com/x", "independent_web"],
];

test("TS port matches dryrun/forensic/classify.mjs bucket-for-bucket", () => {
  for (const [url, expected] of PARITY) {
    assert.equal(classifySource(url, CTX), expected, `bucket drift on ${url || "(empty)"}`);
  }
});

test("owned and competitor win over every category rule", () => {
  // A competitor hosted on a directory is still a competitor. If this ever
  // flips, cohort members start counting as review_directory and the venue
  // share silently loses them.
  assert.equal(
    classifySource("https://www.yelp.com/biz/x", { owned: [], competitors: ["yelp.com"] }),
    "competitor",
  );
  assert.equal(
    classifySource("https://www.youtube.com/watch?v=1", { owned: ["youtube.com"] }),
    "owned",
  );
});

test("empty cohort entries never match everything", () => {
  // A blank domain in the cohort list must not turn `endsWith("." + "")` into
  // a wildcard that buckets the entire web as competitor.
  assert.equal(classifySource("https://example.com/x", { owned: [""], competitors: [""] }), "independent_web");
});

test("hostOf strips www and lowercases, and is total", () => {
  assert.equal(hostOf("https://WWW.Example.COM/a"), "example.com");
  assert.equal(hostOf("garbage"), "");
});

test("SOURCE_TYPES covers every bucket the classifier can return except invalid", () => {
  const produced = new Set(PARITY.map(([, b]) => b));
  for (const b of produced) {
    if (b === "invalid") continue;
    assert.ok(SOURCE_TYPES.includes(b as never), `${b} missing from SOURCE_TYPES`);
  }
});
