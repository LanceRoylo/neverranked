---
title: "LinkedIn drafts, Citation Tape launch"
target_post_date: 2026-05-12 (paired with HN submission Tuesday)
status: drafts ready for review
---

# LinkedIn launch posts for The Citation Tape

Three voice variants for the Citation Tape launch. Pick whichever
matches the moment. Pair with the blog post draft at
`content/blog/citation-tape-launch.md` -- LinkedIn drives traffic
to the blog, the blog drives traffic to the public hub.

LinkedIn rules of thumb being applied here:

- First two lines have to earn the click on "see more"
- No emojis (per global brand voice rule)
- No em dashes (same)
- No banned words per the global brand voice rule
- 1300 char limit on post body (LinkedIn truncates harder past that)
- Personal account beats company account on engagement
- "Follow up question in the comments" outperforms link-in-post

## Variant A, founder voice (recommended)

```
We've been quiet for six months because we wanted the methodology to work before we named it.

It works now.

The Citation Tape is NeverRanked's standing measurement system for AI search citations. Every Monday at 6am Pacific, it pulls citation data from production and emits a weekly report on what AI engines (ChatGPT, Perplexity, Gemini, Claude, Copilot, AI Overviews) actually cite when they answer questions about the brands we track.

Same script, same data sources, no manual curation. The methodology is the script. The source-type taxonomy is public. The schema is in the repo. Anyone running the same query against the same database gets the same numbers.

The first weekly report is live. So is the bug we caught running it: this week's data is partial because of an infrastructure issue we documented openly. We chose to publish anyway with a banner above the headline rather than pretend the system was healthy.

Three properties that make The Citation Tape different from every other AEO measurement we've seen:

1. The methodology is the script
2. The source-type taxonomy is public
3. The schema is in the repo

Most AEO measurement today is gated behind dashboards. Customers see their own number. Categorical patterns stay locked inside agency decks. There is no public methodology anyone can reference.

The Citation Tape is our public methodology. It's small now. It will grow.

Link in comments.
```

Then in first comment:
```
Live at neverranked.com/state-of-aeo, with the launch post explaining how it works at neverranked.com/blog/the-citation-tape
```

Char count for variant A: ~1280. Under the 1300 limit.

## Variant B, company-page formal

```
Today NeverRanked is launching The Citation Tape, a public weekly measurement of what AI engines cite when answering questions about the brands we track.

The Citation Tape runs every Monday at 6am Pacific. Each weekly report covers seven sections: top-line headline, source-type distribution, top 15 third-party sources, per-engine differences, vertical breakdown, per-client baselines, and full methodology disclosure.

What makes this different from existing AEO measurement:

The methodology is the script. The source-type taxonomy is public on GitHub. The data schema is in the repo. Anyone can re-run our methodology against their own client base and compare.

The first weekly report is live with a data-integrity banner above the headline disclosing a known infrastructure issue we caught while building. We chose transparency over polish.

Read the launch post: neverranked.com/blog/the-citation-tape
View this week's report: neverranked.com/state-of-aeo
RSS for industry subscribers: neverranked.com/state-of-aeo/feed.xml

#AEO #AISearch #ContentMarketing
```

Char count for variant B: ~1090. Comfortably under limit.

## Variant C, news-shaped (for if Lance wants to post in third person)

```
NeverRanked has launched The Citation Tape, the first public, weekly, reproducible measurement of what AI engines cite.

Most AEO measurement today is gated. Customers see their own dashboards. Categorical patterns stay locked inside agency operations decks. The Citation Tape changes the default by publishing the methodology, the source-type taxonomy, and the data schema openly.

Every Monday at 6am Pacific, the system regenerates a weekly State of AEO report from production citation_runs data. The first report is live and carries a top-of-document data-integrity banner: this week's data is partial because of a documented infrastructure issue. NeverRanked chose to ship with the banner visible rather than wait for the bug fix.

Founder Lance Roylo on the decision: "Hiding the banner until the bug is fixed would require lying about when our data is healthy. We'd rather publish honestly and show the bug fix landing in real time."

The Citation Tape and its public hub are at neverranked.com/state-of-aeo. RSS feed for subscribers at neverranked.com/state-of-aeo/feed.xml.
```

Char count for variant C: ~1010.

## Recommendation

**Variant A.** Founder-voice posts on LinkedIn outperform third-person company-page posts in this category by a wide margin. The opening "We've been quiet for six months" is the kind of lead that earns the click on "see more." The honest data-integrity disclosure halfway through is unusual enough on LinkedIn that it generates comments.

If running both personal AND company accounts, post variant A on personal, variant B on company two hours later (LinkedIn down-ranks identical content posted in fast succession; the two-hour gap and the voice change avoid the de-rank).

## What NOT to do

- Don't post the link in the body. LinkedIn de-prioritizes posts with external URLs. Link goes in the first comment.
- Don't tag @ChatGPT or @Perplexity in the post. Looks try-hard.
- Don't use the #AEO hashtag without two more hashtags (single-hashtag posts read promotional). Variant B has the right ratio.
- Don't ask "what do you think?" at the end. Reads like a content-marketing template. Trust the post to invite responses on its own.

## Engagement plan after posting

- Reply to the first comment within 30 minutes. Pace is slower than HN; "first hour" is the right window for LinkedIn.
- If a connection comments "interesting, but how does this differ from [Profound / Athena / Otterly]?": "Profound and Athena are dashboards. The Tape publishes the methodology and the schema so anyone can build their own version. Different product."
- If asked "is the data accurate?" point at the data-integrity banner: "Honest answer is on the report itself: 13-40% complete this week, with the bug fix in flight. The pattern is reliable, the magnitudes are conservative."
- If a journalist comments asking for raw data: "Yes. Public schema in the repo. Email me to talk."

## Cross-posting to other surfaces

- **Twitter/X**: a 5-tweet thread, condensed version. Same hook (six months quiet), same three properties, same data-integrity disclosure, link to the blog at the end.
- **Hacker News**: Tuesday afternoon, separate submission targeting the MCP launch (drafted at `content/strategy/hn-submission-mcp-launch.md`). Don't double-up by posting the Tape launch to HN simultaneously, the audiences overlap and you'll burn one or the other.
- **Email** to past audit recipients and prospect list: short version, "if you ever wondered what AI engines actually cite, here's the standing report." Stay-in-touch nurture, not promotional.
