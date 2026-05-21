# Demo walkthrough — the actual words to say

> The words to deliver while you have `demo-medspa.html` or
> `demo-medspa-anon.html` on screen. Read both versions once aloud
> before each meeting. The arc is the same. The bridge at the end
> is what changes.
>
> Estimated time: 2-3 minutes spoken. Pauses included.

---

## When you open the file

> "Before I describe what we'd measure for you, let me show you
> what the deliverable actually looks like in another category.
> This is real data. Med spas in Honolulu. One of the early
> categories we ran while we were rebuilding."

Pause. Let them look at the page for a beat.

---

## Beat 1 — the cohort block (the four metric cards at top)

> "First thing to notice. Three readout attempts, two of them
> produced usable captures. That's why the document shows two
> usable runs at the top, with the warning that this is a data
> point and not yet a pattern at our internal bar. Twenty one
> hundred citations across forty distinct queries from those
> two captures, on two engines. The methodology runs across
> all seven we track in a real engagement."

> "I'm pointing the warning out on purpose. If we'd hidden that,
> the document would look more impressive and tell you less. The
> bar we set for ourselves is three usable runs before we claim
> a pattern in a category. We're not there with med spas yet, and
> the cohort block says so out loud."

Pause. Scroll down to the source type distribution.

---

## Beat 2 — source type distribution (the bar chart)

> "Here's the headline. For med spas in Honolulu, ninety-eight
> percent of every AI citation came from what we call independent
> web. Spa sites, vendor pages, blog posts. Two percent from
> directories. Almost nothing from Reddit, almost nothing from
> YouTube."

> "The thing that surprises most people is the directory number.
> Two percent. And the two directories that did show up — they're
> on the list below — they're not Yelp, not Google, not
> Healthgrades. They're specialty directories most operators have
> never heard of."

(If named version is open) Scroll down to recurring hosts. Point at
`medspascout.com` and `cylex.us.com` in the review_directory row.

> "If you were running a med spa here, that's actionable. You don't
> need to win the Yelp game. You need to be claimed on these two."

(If anonymized version) Skip the directory specifics.

> "The point is the pattern, not the names. We see this shape
> across categories — the directories AI actually trusts are
> rarely the famous ones."

---

## Beat 3 — per-engine differences

> "Now look at the per-engine split. OpenAI cited zero YouTube
> across this entire cohort. Perplexity cited a small amount.
> Same category, same queries, different engines, different
> behavior. This is the cross-engine view nothing inside a single
> AI platform's dashboard could ever produce. They don't see each
> other."

Pause. This is the moat sentence landed.

---

## Beat 4 — recurring hosts (the bottom block)

> "Down here is the recurring host layer. Each name only appears
> if it was cited across two or more runs, so a one-off
> coincidence doesn't make the list. Three readouts, eight names
> survive the filter. Those are the entities the AI actually
> trusts for this category."

> "In a real engagement, the punch list maps to this list. If your
> client isn't on it and a competitor is, the action items target
> closing the specific gaps the AI is rewarding."

Pause. The methodology has been demonstrated. Now bridge.

---

## Bridge — Mark version (ASB)

> "For ASB, a banking readout would look the same shape. Different
> queries — best Hawaii bank for a small business loan, best
> mortgage in Honolulu, who do I bank with if I just moved here.
> Different competitive cohort — First Hawaiian, Bank of Hawaii,
> Central Pacific, Hawaii USA, Hawaii State. Different source
> mix — banks cite differently than spas. My prior is that for
> Hawaii banking, regulator filings and news media weight much
> more heavily than directory sources, but I'd rather measure it
> than guess."

> "That's what the kickoff produces. Three weeks, daily measurement,
> the research memo you saw the shape of, the prepped punch list
> for your team. Forty-five hundred for the first category. Fifteen
> hundred a month after for ongoing measurement. Per category. So
> if you wanted to measure consumer banking and small business
> banking separately, that's two engagements."

Stop. Let him respond.

---

## Bridge — James version (MVNP)

> "For one of your clients, a readout would look the same shape.
> Different queries, different competitive cohort, different
> source mix per category. Hotels cite very differently than med
> spas. Hawaiian Airlines competes in a totally different source
> ecosystem than First Hawaiian Bank does."

> "The deliverable goes to your team. The punch list is built for
> your senior strategists to translate into client-facing
> recommendations. We don't speak to your client. We don't repackage
> the work in our voice for them. The relationship stays yours."

> "Forty-five hundred per category for the kickoff. Fifteen hundred
> a month ongoing. So an agency running this across, say, three
> active accounts is three kickoffs and three retainers, scoped by
> category."

> "I'm not pitching you tonight. What I'd like to know is whether
> this shape is useful for MVNP — whether your strategists would
> actually use a research memo like the one you saw, or whether the
> shape is wrong."

Stop. Coffee, not contract. Let him respond.

---

## Recovery lines if something goes wrong

If the file won't open:
> "Hold on, I have the PDF here too." [open `demo-medspa.pdf`]

If both fail:
> "The print version is right here." [hand him the printed PDF or
> read from `demo-medspa.txt` aloud]

If he asks "what data did you run this against and when":
> "Three readouts run between May fifteenth and seventeenth, against
> Perplexity and OpenAI on a frozen query set. The raw data lives
> in our research repo. I can email you the structured JSON if you
> want to verify the numbers."

If he asks "what about the other five engines":
> "This particular run was during the initial methodology pilot,
> before we onboarded Gemini, Bing AIO, Google AI Overviews,
> Claude, and Gemma. The current measurement stack runs all seven
> every day. Your engagement runs against all seven."

If he asks "could I run it myself":
> "The classifier is public — it's in our research codebase. The
> seven engines are public APIs. What you can't replicate without
> us is the discipline. Pre-registered query sets, the >=3 runs
> threshold before claiming a pattern, the cross-category aggregate
> that lets us tell the Nth customer in a category what holds.
> That's what compounds."

---

## What NOT to say during the walkthrough

1. Do not claim the readout caused or will cause any specific
   citation lift.
2. Do not name a paying customer this readout was for. It's an
   internal methodology run.
3. Do not promise this category data extends to their category.
   Different categories have different patterns. Measuring is the
   point.
4. Do not over-explain the engine split mid-demo. If they ask,
   you have the line ready. If they don't, the cross-engine
   insight in Beat 3 is enough.
5. Do not undersell the cohort size. "Only three runs" is
   defensible — it's the floor we set for ourselves and we name it
   out loud.
