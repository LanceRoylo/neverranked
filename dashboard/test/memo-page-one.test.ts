/* 2026-11-22: page 1 is the action memo.
 *
 * A client ended its engagement saying the reporting showed it where to
 * improve, and that it now had to work out a plan with its current resources.
 * Page 1 carries that plan: where they stand, three sized actions with an
 * owner and a month we will be able to tell, last month's actions, and one
 * question. These tests hold the shape in code. Fictional businesses
 * throughout: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPageOne, countFigures, pageOneText, memoDraftIssues } from "../src/lib/memo-draft-check";
import { renderReportMarkdown } from "../src/routes/customer-readouts";

const GOOD = `## December 2026: what moved

### This month in plain words

Dana, here is where Lantern Hall stands after November and the three things worth doing first.

**Where you stand**
- When people asked AI tools about live shows in town, Lantern Hall was named in 7 of 10 answers.
- Your own website was a source in about 1 in 6.
- The tools read listing sites like Harbor Events far more often than your site.

**Three things to do this month**
1. Add your upcoming shows to the Harbor Events listing. Why: it was a source in 40 answers about live shows and never named you. Who: whoever manages your listings. Time: under an hour. We will watch: the live shows question, from January 2027.
2. Say "comedy nights every Friday" on your events page. Why: the comedy question rarely names you. Who: marketing. Time: half a day. We will watch: the comedy question, from February 2027.
3. Check that the events page shows each show's date as text a search tool can read. Why: the tools use your history page but rarely your events page. Who: your web developer. Time: a developer task. We will watch: the upcoming events question, from February 2027.

**Last month's actions**
This is the "before" picture, so there is nothing to check yet.

**One question for you**
What did your team change on the website or your listings since October, and roughly when?

### Where you stand

The detail goes here, with 71% and 14% and every other figure.
`;

const swap = (from: string | RegExp, to: string) => GOOD.replace(from, to);

test("a page 1 in the agreed shape passes", () => {
  assert.deepEqual(checkPageOne(GOOD), []);
  assert.match(pageOneText(GOOD) ?? "", /^Dana,/);
  assert.doesNotMatch(pageOneText(GOOD) ?? "", /The detail goes here/);
});

test("a missing part is named", () => {
  const issues = checkPageOne(swap("**One question for you**\n", ""));
  assert.ok(issues.some((i) => /One question for you/.test(i)), issues.join("\n"));
});

test("page 1 states levels: the headline shape from a real preview is refused", () => {
  // A real 2026-11 preview led with a 13-point jump while the question set had
  // grown from 2 to 18, so the months were not comparable. Anonymised here.
  const issues = checkPageOne(swap(
    "- Your own website was a source in about 1 in 6.",
    "- Google AI Overviews jumped from 4% to 17%, the largest movement so far.",
  ));
  assert.ok(issues.some((i) => /states a change/.test(i)), issues.join("\n"));
  assert.ok(checkPageOne(swap("about 1 in 6", "about 1 in 6, up from 1 in 9")).some((i) => /states a change/.test(i)));
  assert.ok(checkPageOne(swap("about 1 in 6", "about 1 in 6, a gain of 5 points")).some((i) => /states a change/.test(i)));
});

test("three actions, each with an allowed owner, an allowed size and a month", () => {
  const two = swap(/\n3\. Check that the events page[^\n]*/, "");
  assert.ok(checkPageOne(two).some((i) => /2 numbered items, not 3/.test(i)));

  const who = checkPageOne(swap("Who: marketing.", "Who: Jordan."));
  assert.ok(who.some((i) => /"Who: Jordan" is not one of/.test(i)), who.join("\n"));

  const time = checkPageOne(swap("Time: half a day.", "Time: two weeks."));
  assert.ok(time.some((i) => /"Time: two weeks" is not one of/.test(i)));

  const month = checkPageOne(swap("the comedy question, from February 2027.", "the comedy question."));
  assert.ok(month.some((i) => /Action 2 does not say which month/.test(i)));

  const noWatch = checkPageOne(swap(" We will watch: the live shows question, from January 2027.", ""));
  assert.ok(noWatch.some((i) => /Action 1 has no "We will watch:"/.test(i)));
});

test("at most one action may need a developer", () => {
  const issues = checkPageOne(swap("Who: marketing. Time: half a day.", "Who: your web developer. Time: a developer task."));
  assert.ok(issues.some((i) => /2 of the three actions need a developer/.test(i)), issues.join("\n"));
});

test("our words stay off page 1", () => {
  for (const [word, re] of [["Atlas", /Atlas/], ["punch list", /punch list/], ["citations", /citations/], ["like for like", /like for like/]] as const) {
    const issues = checkPageOne(swap("Dana, here is", `Dana, per the ${word}, here is`));
    assert.ok(issues.some((i) => re.test(i)), `${word}: ${issues.join("\n")}`);
  }
});

test("length and figure caps", () => {
  const long = swap("This is the \"before\" picture", `${"word ".repeat(200)}This is the "before" picture`);
  assert.ok(checkPageOne(long).some((i) => /Keep it to 300/.test(i)));
  const busy = swap("Your own website was a source in about 1 in 6.", "Your own website was a source in 12%, 14%, 18%, 22%, 25% and 31% of answers.");
  assert.ok(checkPageOne(busy).some((i) => /figures/.test(i)));
});

test("figures are counted the way a reader counts them", () => {
  assert.equal(countFigures("named in 7 of 10 answers"), 1);
  assert.equal(countFigures("7 out of 10, and 1 in 6"), 2);
  assert.equal(countFigures("1. Do this from January 2027."), 0);
  assert.equal(countFigures("12% and 14%"), 2);
  assert.equal(countFigures(pageOneText(GOOD) ?? ""), 3);
});

test("memoDraftIssues includes the page-1 checks", () => {
  const inp = { comparison: null, by_question: [] } as never;
  assert.deepEqual(memoDraftIssues(GOOD, inp), []);
  assert.ok(memoDraftIssues(swap("Who: marketing.", "Who: Jordan."), inp).length > 0);
});

test("the readout renders numbered lines as a list and keeps the numbers", () => {
  const html = renderReportMarkdown("**Three things to do this month**\n1. First.\n2. Second.\n\n- a bullet");
  assert.match(html, /<ol>\n<li value="1">First\.<\/li>\n<li value="2">Second\.<\/li>\n<\/ol>/);
  assert.match(html, /<ul>\n<li>a bullet<\/li>\n<\/ul>/);
  assert.match(renderReportMarkdown("3. Only the third."), /<li value="3">/);
});

