---
title: "HN submission draft, MCP launch"
target_post_date: 2026-05-12 (Tuesday afternoon ET)
status: draft, ready to copy-paste
---

# HN submission, ready-to-post

Per the parallel-window handoff doc, Tuesday afternoon ET is the
slot to submit @neverranked/mcp to Hacker News. This is the
copy-paste-ready draft. Submit at https://news.ycombinator.com/submit.

## Title (80 char limit)

```
Show HN: @neverranked/mcp – AEO scoring and llms.txt audit for AI agents
```

73 chars. Within limit. Hyphen-not-em-dash deliberate.

## URL

```
https://www.npmjs.com/package/@neverranked/mcp
```

## Body (HN treats `Show HN` posts kindly, but body still helps)

Use the body field for context. HN's "Show HN" guidelines say:
include a link to the project, the source, and what's interesting
about it. Avoid marketing language.

```
@neverranked/mcp exposes our AEO (Answer Engine Optimization) toolchain to AI agents via the Model Context Protocol. Three tools today:

  aeo_scan: scores a URL 0-100 across schema, llms.txt, agent-readiness, and citation surface
  llms_txt_check: validates an llms.txt file against the spec
  agent_readiness_check: audits whether a site exposes structured data agents can use

Why we built it: AI engines (ChatGPT, Perplexity, Gemini, Claude, Copilot, AIO, and Gemma) increasingly answer "best X for Y" queries directly, and what they cite is shaped by infrastructure most sites don't ship: schema.org, llms.txt, agent-readable structured data. The MCP server lets Claude Desktop, Claude Code, or any MCP client run those audits inline.

One thing we did differently from the rest of the AEO space: we added Gemma (Google's open-weight model) to our engine set so the citation measurements behind aeo_scan are independently reproducible. Anyone with the same model weights can re-run our prompts and verify the numbers. Six of the seven engines we track are commercial APIs that can change behind the scenes; Gemma's weights are public. As far as we can tell, no other AEO platform includes an open-weight engine, which means every other measurement vendor is asking you to trust their API responses on faith.

Some interesting parts:

- llms_txt_check is grumpy about the spec on purpose. The standard is young, and we'd rather flag ambiguities than silently accept malformed feeds.

- agent_readiness_check looks for the Schema.org Action types (ReserveAction, ApplyAction, BuyAction, ContactAction) that AI agents read when they execute tasks on behalf of users. Today most sites score zero. The next year is going to be interesting.

- The aeo_scan engine is the same one we run daily across our tracked client universe. Public methodology and current weekly reports at https://neverranked.com/state-of-aeo. The May 10 archive carries a banner about a partial run window from a subrequest-budget bug in the daily cron. We caught and shipped the fix the same day and documented it openly. Current runs are clean.

- If you want to run aeo_scan without installing the MCP server, the same engine is exposed at https://check.neverranked.com (no signup) or at app.neverranked.com/free/signup (free weekly score for one domain, no card).

The package is on npm as @neverranked/mcp and in the official MCP registry as io.github.LanceRoylo/mcp.

Source: https://github.com/LanceRoylo/neverranked/tree/main/mcp-server
Blog post with more context: https://neverranked.com/blog/the-first-aeo-mcp-server/

Happy to answer questions about MCP server design, the AEO scoring methodology, the open-weight reproducibility argument, or what we've learned watching AI engines cite (or not cite) the brands we track.
```

Length check: ~290 words. HN comment slots tolerate 1500 words easily; this leaves room to expand if needed.

## Pre-submit checklist

Before pasting:

- [ ] LinkedIn posts (personal + company) have been live for at
      least 4 hours. HN community judges projects partly on
      "is this the team's only marketing channel?" -- having
      LinkedIn warm proves it isn't.
- [ ] @neverranked/mcp version on npm is the version mentioned
      (currently 0.1.2 as of 2026-05-09). Verify with
      `npm view @neverranked/mcp version`.
- [ ] The blog post at /blog/the-first-aeo-mcp-server/ is live
      and renders cleanly.
- [ ] The State of AEO public hub at /state-of-aeo/ renders
      cleanly with the data-integrity banner visible (honesty
      pre-empts "your numbers look weird" comments).
- [ ] You are signed into HN with an account at least 30 days
      old (newer accounts get rate-limited and de-emphasized).

## Specific submission timing (Tuesday May 12 2026)

**Submit at 10:00 AM ET (07:00 AM HST).**

Reasoning:
- HN front-page algorithm weights submissions made between
  8am-12pm ET (US East Coast workday start, US West Coast
  morning ramp). Submissions before 8am or after 1pm get less
  early-vote velocity.
- 10am ET = 4pm UK = 11am ET morning peak. International
  HN-reading dev/founder audience overlaps.
- Submitting closer to noon means competing with the morning's
  built-up momentum from other Show HN posts.
- 07:00 AM HST means Lance is up + at the desk + present for
  the first 90 minutes of comment activity. Critical for
  engagement (see plan below).

If 10am ET doesn't work, second-best: 9:30am ET. Third-best:
8:30am ET. Avoid noon-onward.

## First comment, ready-to-post

Post this as the FIRST comment on your own submission within
60 seconds of posting. Provides context HN readers want
without cluttering the title/body:

```
Author here. Some context on why we built this:

1. We run a daily 7-engine citation tracker (ChatGPT,
   Perplexity, Claude, Gemini, Microsoft Copilot, Google AI
   Overviews, and Gemma -- the open-weight engine we added
   specifically so anyone can independently reproduce our
   numbers). The MCP server exposes the same scan engine we
   use internally.

2. The most useful tool is probably aeo_scan: scan any URL,
   get back schema completeness, citation-readiness score,
   and a 90-day fix priority list. Works on dental practices,
   B2B SaaS, performing arts venues, anything with a public
   site.

3. Real-world example: we ran the scan + deployment cycle on
   Hawaii Theatre (Honolulu performing arts venue). They went
   from a 45 AEO score to 95 in ten days. On the first weekly
   citation log run after deployment, Perplexity named them
   on 14 of 19 tracked queries. CEO approved the case study:
   https://neverranked.com/case-studies/hawaii-theatre/

4. Repo: https://github.com/LanceRoylo/neverranked
   The State of AEO public hub:
   https://neverranked.com/state-of-aeo/

Happy to answer questions about MCP server design, AEO
methodology, or how the citation tracker is built.
```

This works because:
- Acknowledges you're the author up front (HN values
  disclosure)
- Three numbered context points = scannable
- One concrete example with verifiable numbers (Hawaii
  Theatre)
- Public links so anyone can verify the claims
- Ends with "happy to answer questions" not "buy our product"

## Engagement plan after submission

HN traffic comes in the first 90 minutes. Be present and
responsive:

- **Post your first comment within 60 seconds** (template above).
- Reply to the first OTHER commenter within 15 minutes regardless of
  what they say. Sets the tone.
- If asked "why MCP and not just a CLI?": "MCP is how agents
  consume tools. We started with a CLI in February; the agent
  pull made MCP the better surface. Both still exist."
- If asked "do you have customers?" or "is this real?": Point
  at the Hawaii Theatre case study. "We have one named client
  who agreed to be public: Hawaii Theatre. 45 AEO score to 95
  in ten days, 14 of 19 Perplexity citations the same week,
  CEO-approved. Full case at
  neverranked.com/case-studies/hawaii-theatre. Plus four other
  clients under NDA."
- If asked about the data-integrity banner on the State of AEO
  report: "The cron has a known partial-completion bug we fixed
  the same day we caught it. The diagnosis and fix architecture
  are public in the repo at
  content/handoff-questions/citation-cron-fix-landed.md. The
  pattern shown is reliable; the magnitude is conservative."
- If a hostile comment attacks "AEO is just SEO renamed":
  "The mechanism is different (citation share in answer
  generation vs. ranking on a SERP). The taxonomy of source
  types AI engines pull from is documented in our open-source
  classifier at tools/citation-gap/src/source-types.mjs. Agree
  or disagree, but the work is reproducible."
- If asked "what about the broken/empty engines I see in the
  May 10 report?": "Caught two engine integrity bugs in the
  Monday May 11 cron diagnostic (Claude returning fenced JSON
  the parser rejected; Gemma's Together AI integration
  thinner than commercial engines). Both fixes shipped same
  day; commits 62d3f98 and ca719b3 in the public repo. The
  underlying methodology is reproducible regardless of any
  one engine's transient state."

## What NOT to do

- Don't submit as `Lance Roylo`. Submit as the project ("@neverranked/mcp")
  not the founder. HN community resists personal brand promotion.
- Don't reply with marketing language. Match HN tone: technical,
  specific, slightly self-effacing.
- Don't mention the State of AEO report unless asked. Lead with
  the MCP, the State of AEO is downstream evidence.
- Don't ask people to vote. HN auto-flags any "upvote please"
  language. Word of mouth only.

## Backup framing options

If the title doesn't land in the first 30 minutes, a second
submission attempt later in the week could try:

A) "Show HN: We open-sourced our AEO scoring system as an MCP server"
   (76 chars, more story-shaped)

B) "Show HN: Three MCP tools for measuring how AI engines see your site"
   (75 chars, leads with utility)

Original title is best for the launch slot; B is the strongest
backup if it doesn't get traction.
