# Reddit Citation Surface — American Savings Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-13
**Scope:** Reddit threads cited by AI engines in answers to American Savings Bank's tracked queries
**Why this matters:** ChatGPT, Perplexity, and Google AI Overviews pull "best X for Y" answers heavily from Reddit. Subreddits where your category is discussed without you are content opportunities; subreddits where you appear consistently are defense.

---

## What this section measures

When AI engines answer "best business checking in Hawaii" or "Honolulu performing arts venues," they often cite Reddit threads. Specifically, threads in vertical-relevant subreddits where the question has been asked and answered by real users. NeverRanked tracks which Reddit threads appear as citations in the engine answers, breaks them out by subreddit, and counts how often you appear in those citations.

This is different from your citation share number. Your overall share covers all source types. This section is the Reddit slice: where are AI engines pulling Reddit answers from for your category, and is your brand part of the conversation?

## Your current Reddit surface

American Savings Bank is not yet in NeverRanked's continuous citation tracking, so the specific Reddit surface for your category is not in this report. Once tracking starts (Pulse tier or above), this section populates automatically with the subreddits where AI engines pull "best X for Y" answers about your category, and where your brand appears (or doesn't) in those threads.

## Subreddit-level breakdown

_No subreddit data for this audit. See the Summary above for the reason._

## What this means

Reddit is one of the highest-leverage citation surfaces because subreddits operate as topic-specific Q&A archives that AI engines treat as authoritative. A single well-placed reply on a citation-generating thread can produce months of AI-search visibility because the thread keeps being cited in answers as long as it ranks within the subreddit. The action is not "post a lot on Reddit" — the action is "be present on the threads AI engines are already pulling from."

## The deployment work

When NeverRanked detects a citation-generating Reddit thread in your category, the Amplify tier produces a thread-specific reply brief: subject, tone, subreddit norms, what to avoid, and a draft of the reply. Your team posts under their own account; NeverRanked monitors for AI-engine citation lift week-over-week.

## What's NOT in this section

This section measures Reddit citations triggered by your tracked query set. It does NOT measure:

- Reddit mentions on threads we didn't observe an engine citing
- Direct Reddit traffic or engagement metrics (we leave those to your social tools)
- Whether a given subreddit is "good" or "bad" for your brand — only whether AI engines are using it to answer queries in your category

## Reproducibility

The classifier that detects reddit.com URLs in engine responses and extracts the subreddit is open-source at `tools/citation-gap/src/source-types.mjs` in the NeverRanked GitHub repo. The query that builds this surface for your client_slug is `getRedditCitationSurface` in `dashboard/src/citations.ts`. Anyone with the same engine prompts and the same Reddit-detection logic can reproduce the numbers in this section against their own database.

---

<!-- AUDIT-GENERATE: Populated by scripts/audit-generate.mjs from
     live citation_runs data. Placeholder text appears when there is
     no Reddit-citation data for the client_slug in the last 90 days. -->
