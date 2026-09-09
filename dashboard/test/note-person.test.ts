import { test } from "node:test";
import assert from "node:assert/strict";
import { notePersonOk } from "../src/lib/report-notes.ts";

/**
 * The analyst note sits under a chart in the customer's own report, and they
 * read it. On 2026-09-09 a generated sources note read "dwarfing the
 * customer's own site at just 2 percent", in prose a paying customer was
 * about to open.
 *
 * The prompt caused it: it necessarily describes "the customer" because it is
 * an instruction, and the model carried that into the output.
 */

test("REGRESSION: the exact sentence that was generated is rejected", () => {
  assert.equal(
    notePersonOk("Independent web content drives 69 percent of citations, dwarfing the customer's own site at just 2 percent."),
    false,
  );
});

test("every third-person form of the reader is caught", () => {
  for (const bad of [
    "the customer's own site",
    "the customers own site",
    "This customer appears on 12 percent of questions.",
    "the client's listings need attention",
    "The Client is cited by Perplexity.",
  ]) {
    assert.equal(notePersonOk(bad), false, `should reject: ${bad}`);
  }
});

test("second person and the business name both pass", () => {
  for (const ok of [
    "Independent web content drives 69 percent of citations, dwarfing your own site at just 2 percent.",
    "Prince Waikiki sits at 12 percent, just behind The Royal Hawaiian.",
    "Your listings on Tripadvisor matter more than anything on your own site.",
  ]) {
    assert.equal(notePersonOk(ok), true, `should allow: ${ok}`);
  }
});

test("the words are only banned as a reference to the READER", () => {
  // A note may legitimately discuss customers in the ordinary sense.
  for (const ok of [
    "These are the questions your customers actually ask.",
    "Customer reviews on Tripadvisor carry 10 percent of citations.",
    "Guests and customers alike search this way.",
  ]) {
    assert.equal(notePersonOk(ok), true, `should allow: ${ok}`);
  }
});

test("empty prose is not a violation", () => {
  assert.equal(notePersonOk(""), true);
});
