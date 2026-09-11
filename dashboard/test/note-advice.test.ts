import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { noteAdviceOk, firstAdviceClaim } from "../src/lib/note-advice.ts";

/**
 * Every string below is real output from the 2026-09-11 preview of the
 * September readout, or the published boundary it is checked against.
 */
describe("the readout describes, it does not rank impact", () => {
  test("blocks the two sentences the preview actually produced", () => {
    assert.equal(noteAdviceOk("Keeping your listings accurate and current on these named platforms matters more right now than any other single lever, and next month's report should show whether that composition shifts."), false);
    assert.equal(noteAdviceOk("The opportunity is less about publishing more on your own site and more about making sure the independent and review content that already gets cited is accurate and favorable."), false);
  });

  test("blocks the other shapes the boundary names", () => {
    for (const s of [
      "You should update your Google Business Profile first.",
      "The biggest lever here is review density.",
      "Your top priority is the Wikipedia entry.",
      "Focus on the review directories before anything else.",
      "Make sure your listings are current.",
    ]) assert.equal(noteAdviceOk(s), false, `should block: ${s}`);
  });
});

describe("what must survive, or the guard is worse than the problem", () => {
  test("the engines note passes intact", () => {
    // This note is the methodology working: two layers kept apart, Gemma
    // NAMES rather than cites, the control flagged as not an AI tool. It is
    // the last thing that should be collateral damage.
    for (const s of [
      "This is your first tracked month, so these numbers are a starting point rather than a trend.",
      "Gemma names Prince Waikiki in 18 percent of its answers, and Claude in none this month.",
      "Bing search is a plain search control, not an AI tool, and no venue in the category showed up there this month.",
      "Next month will show whether these levels hold or move.",
    ]) assert.equal(noteAdviceOk(s), true, `must pass: ${s}`);
  });

  test("forward-looking closes stay legal, because the prompt asks for them", () => {
    // Every note is instructed to end on what to watch. That is an
    // observation about the next reading, not an instruction to the reader.
    assert.equal(noteAdviceOk("Watch whether you can close that 3 point gap next month or whether the leaders extend it."), true);
    assert.equal(noteAdviceOk("That sets up next month as the first real comparison."), true);
  });

  test("plain description of the field passes", () => {
    for (const s of [
      "Independent web content dominates what AI tools cite in this category at 69 percent, while your own site accounts for just 2 percent of sources.",
      "Review directories add another 11 percent, meaning most of the conversation about you is happening on other people's pages, not yours.",
      "Tripadvisor leads at 10 percent, with expedia.com and booking.com close behind at 4 and 3 percent.",
    ]) assert.equal(noteAdviceOk(s), true, `must pass: ${s}`);
  });

  test("the matched phrase is reported, so the log says what tripped", () => {
    assert.equal(firstAdviceClaim("The biggest lever here is reviews."), "The biggest lever");
    assert.equal(firstAdviceClaim("Perplexity cited you on nine of eighteen questions."), null);
  });
});
