# Pre-registration: what the standing instruction does to our readings

Written 2026-11-09, before any December data exists. The commit that adds this file is the timestamp.

## Background

Every AI tool we measure gets a short standing instruction with each question, asking it to name specific businesses. Claude and Gemma are also asked to answer as a fixed list. We disclosed this on the methodology page on 2026-11-09. From 2027-01-01 we plan to send the plain question instead, exactly as a person would type it.

Before we switch, we measure what the instruction does.

## What we will run

On eleven nights in December 2026 (the 1st, 4th, 7th and every third night after, through the 31st, UTC), after the normal nightly measurement has finished, we ask every active question again with no instruction. One asking per question per setup per night. Production measurement does not change in December.

Setups that keep production's model and settings and drop only the instruction:

- Perplexity (sonar, with web search)
- ChatGPT search (gpt-5-search-api)
- Gemini grounded (gemini-2.5-flash, with Google Search)
- Gemma (gemma-4-31B-it)
- Claude (claude-haiku-4-5-20251001)

Exploratory setups, with no prediction:

- Gemini grounded on gemini-3.6-flash
- Claude on claude-sonnet-5, with thinking off
- Claude on claude-sonnet-5-5, with thinking off

## How the comparison works

- **Pairs.** A shadow answer is compared with the production answer for the same question on the same night. Questions with no production answer that night are left out.
- **The test for "named".** The business's name appears in the answer text, ignoring case. The same test is applied to production answers and shadow answers, so both sides are judged the same way. This is not the figure clients see, which also counts links to the business's site. It is used here because it is the one test that means the same thing on every setup.
- **The rate.** For each tool, answers that named the business, divided by answers given. Calls that failed are left out of both counts and reported separately.
- **Points.** A difference in percentage points between the instructed rate and the plain rate, for the same tool, model and pairs.
- **Businesses per answer.** For Claude and Gemma, how many business names an answer contains. Production's count comes from its fixed list. The shadow's count comes from a separate extraction call (claude-haiku-5-5) that lists the names in the answer and does nothing else.

## Predictions

**H1. Memory tools name the business less often when asked plainly.** On Claude (Haiku 4.5) and Gemma, the plain rate is at least 5 points below the instructed rate. Refuted for a tool if its gap is under 5 points or goes the other way.

**H2. Web-search tools barely move.** On Perplexity, ChatGPT search and Gemini 2.5 Flash, the plain rate is within 5 points of the instructed rate. Refuted if any one of them moves 5 points or more in either direction.

**H3. Memory tools name fewer businesses per answer when asked plainly.** On Claude (Haiku 4.5) and Gemma, the median number of businesses per answer is lower plain than instructed. Refuted for a tool if it is the same or higher.

## What we will publish

All three results, whichever way they come out, with counts and not only percentages, by 2027-01-15. If a prediction fails we say so in the same place we say it held. The shadow data never enters a client's readout. The switch on 2027-01-01 is logged as a change in how we measure, and readings from before and after it are not treated as one series.

## Limits we already know about

- One asking per question per night is a sample, not the full daily run.
- The exploratory setups change the model and the instruction together, so they cannot say which change caused a difference.
- A spending cap of $4 a night may stop a night before every question is asked. Any question cut off that way is left out of the pairs, and the number cut off is reported.
