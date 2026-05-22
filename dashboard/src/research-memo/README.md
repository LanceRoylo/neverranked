# Research memo template

For the first 5-10 paying customers, Lance hand-fills this
template per engagement. Once the methodology stabilizes across
real customers, this becomes the target shape for an
auto-generator that populates it from raw measurement data.

## Files in this directory

- **`template.html`** — the structural skeleton. Every
  `{{PLACEHOLDER}}` is a fill point. The structure mirrors
  `meetings/kits/SAMPLE-DELIVERABLE.md` and the public-facing
  example at `neverranked.com/example-engagement/` exactly. Same
  10 sections + 3 appendices.

## How to use it (manual process for the first customers)

1. Pull the customer's raw measurement data from their data store
   (the `raw.jsonl` file for their engagement).
2. Run `aggregate.mjs --category <customer_category> --json` to
   get the structured aggregate output.
3. Copy `template.html` to a new file named for the customer +
   date (e.g. `delivered/2026-07-15-acme-banking.html`).
4. Fill in every `{{PLACEHOLDER}}` with the customer-specific
   data. Most placeholders map directly to fields in the
   aggregate.mjs JSON output. The prose placeholders (executive
   summary, headline interpretation, source-type non-obvious
   finding, punch list items) require Lance's analysis.
5. Run the filled HTML through the rewritten output-grader at
   `dashboard/src/preview/output-grader.ts` before delivering.
   If the grader rejects any claim, revise and re-grade.
6. Print to PDF via Chrome headless:

   ```sh
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless --disable-gpu --no-pdf-header-footer \
     --print-to-pdf=delivered/2026-07-15-acme-banking.pdf \
     delivered/2026-07-15-acme-banking.html
   ```

7. Email the PDF to the customer's designated recipients with a
   short cover note (see `meetings/kits/EMAIL-TEMPLATES.md`
   section 9 for the monthly delta cover pattern; adapt for the
   kickoff memo).

## How the auto-generator (eventually) populates this

Once there are 5-10 hand-filled deliveries to learn from, build
a `buildResearchMemo` function in this directory that:

- Takes a `category` + `customer_id` as input.
- Calls `aggregate.mjs --json` internally to get the data.
- Maps the structured aggregate fields to the `{{PLACEHOLDER}}`
  tokens deterministically.
- Calls Claude (via the rewritten preview/generator pattern) to
  produce the prose placeholders (executive summary, headline
  interpretation, non-obvious finding, punch list items) against
  the customer-specific data.
- Runs the generated output through the output-grader before
  returning.
- Returns the filled HTML.

Wire it into a Worker route or scheduled task to produce the
memo on demand or on a schedule. Until then, manual fill is
right because each early customer surfaces nuances the
auto-generator would not handle correctly without training.

## What the placeholders look like

Most are obvious from context. A few that need explanation:

- `{{HEADLINE_FINDING_AS_NAMED_CLAIM}}` — the h1. Should read as
  a sharp, named claim about THIS customer's situation. Not
  generic. Example: "Bank of Hawaii is on every AI answer about
  Hawaii banking. You are on none of them."
- `{{EXEC_SUMMARY_PARA_1}}` — opening paragraph naming the
  headline finding in customer-facing terms. Specific, named,
  numerically grounded.
- `{{NON_OBVIOUS_FINDING_PARA}}` — the paragraph that earns the
  kickoff fee. What surprised you in the source-type or per-engine
  mix. Did Yelp not appear where it usually does? Did a
  category-specific directory you'd never heard of dominate?
- `{{P1_TITLE}}` through `{{P6_TITLE}}` — punch list item names.
  Imperative voice. Example: "Claim and complete medspascout.com
  profile."
- `{{P1_WHY}}` through `{{P6_WHY}}` — the strategic reason this
  item is on the list, anchored in the data above.
- `{{P1_WHAT}}` — the technical specifics of doing the work.
  Specific enough that the customer's executor can act on it
  without asking us a question.

## What the template enforces

By writing every placeholder into the template, the deliverable
shape stays consistent across customers regardless of who fills
it in. Future-Lance is forced to address every section in every
memo, which prevents the "skip the methodology section because
we forgot" failure mode.

The print stylesheet is tuned for letter-size PDF output that
prints ink-friendly. Customer doesn't need to think about
formatting; the PDF is the deliverable artifact.

## Grading hook (mandatory)

Before any filled template ships to a customer, run it through
the output-grader at `dashboard/src/preview/output-grader.ts`.
The grader enforces the CANONICAL_FACTS rewritten 2026-05-21:

- No retracted Hawaii Theatre 45-to-95 causation claims.
- No retired SKU references (Pulse, Signal, Amplify, $750).
- No snippet / done-for-you / "We DEPLOY THE FIX" language.
- 5+2 engine split required when "seven engines" appears.
- HTC capability surfaces only (Charity Navigator 2023, BBB
  1999, etc.) if HTC is referenced at all.

If the grader rejects a claim, do not ship. Revise.

## When this template should evolve

- After 5-10 deliveries, review the per-section friction patterns.
  If a section is always rewritten the same way during fill,
  bake that into the template.
- When voice-only AI surfaces become measurable, add a section.
- When the model-knowledge engines (Claude, Gemma) reveal a
  consistent finding worth foregrounding, add a section.
- When a customer category demonstrates patterns the current
  template doesn't surface well (e.g. B2B SaaS may need a
  Reddit-share section the current local-business template lacks),
  consider a category-specific template variant.

The version in this directory is the v1, designed against the
med-spa cohort. Variants live in sibling directories
(`template-saas.html`, `template-banking.html`, etc.) when the
need is justified by more than one engagement.
