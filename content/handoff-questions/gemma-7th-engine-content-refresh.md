# Refresh all engine-count claims: 6 → 7 (Gemma added)

**To:** parallel session
**From:** Claude Code (this session)
**Date:** 2026-05-10 ~afternoon HST
**Status:** Gemma integration in flight in the other window; ship coordinated

## What's happening

We're adding Gemma 3 27B (Google's open-weight LLM) as the 7th tracked
engine on The Citation Tape. The strategic angle: Gemma is the only
**reproducible** engine in the set (open weights mean anyone can verify
our numbers by running the same model). That's the differentiator for
banking/regulated/enterprise customers — closed-API engines can't be
audited; Gemma can.

Per Lance's call: this ships paired with the May 22 Citation Tape rebrand
launch. Story becomes "Citation Tape launches with 7-engine coverage
including open-weight transparency."

## The code work (other window, do not touch)

This window is handling:
- `runGemma()` engine handler in `dashboard/src/citations.ts`
  (Together AI endpoint, OpenAI-compatible API)
- `TOGETHER_API_KEY` env addition
- engines_breakdown aggregator extended to 7 labels
- Deploy + verification

When Lance pushes the wrangler secret and we trigger a manual run,
Gemma rows start landing in `citation_runs`. From that moment on,
public-facing claims about "7-engine coverage" are factually defensible.

## Your zone: content refresh sweep

Find every place in the repo that says "6 engines," "six engines," or
lists the specific six (ChatGPT/Perplexity/Claude/Gemini/Copilot/AIO)
and update to seven, adding Gemma with the open-weight framing.

### Files that almost certainly need updating

Found via grep on a quick pass; not exhaustive:

- `content/audits/iq360-muckrack-comparison.md` — "Six engines" in
  the "Citation tracking with attribution" block + several places
- `content/blog/citation-tape-launch.md` — Tuesday launch blog post,
  multiple references
- `content/strategy/email-citation-tape-nurture.md` — Tuesday launch
  email sequence
- `content/strategy/linkedin-citation-tape-launch.md` — LinkedIn launch
  drafts
- `content/strategy/hn-submission-mcp-launch.md` — HN submission text
- `audits/asb-hawaii-2026-05/05-ai-citations.md` — "Signal-tier
  subscription queries the same prompt set across all six engines"
- `audits/asb-hawaii-2026-05/04-keyword-gap.md` — "weekly pull across
  all six AI engines"
- `audits/asb-hawaii-2026-05/06-competitor-teardown.md` — "observed
  across all six engines NeverRanked tracks"
- `content/meeting-evidence/asb-2026-05-18.md` — recently updated for
  the cron fix, may need engine count refresh too
- `content/sla/citation-floor-guarantee.md` — SLA terms
- `state-of-aeo/index.html` (or wherever the public hub lives)
- `reports/state-of-aeo/state-of-aeo-2026-05-10.md` (or wherever the
  latest report's masthead is)
- Any pitch pages in `content/pitch/*` that mention engine coverage
- Generator scripts that produce the State of AEO report headers
- Homepage / pricing page wording if it mentions engine count
- Diagrams or graphics showing engine logos -- need a Gemma logo added

### Suggested replacement patterns

| Old | New |
|---|---|
| "six engines" | "seven engines" |
| "all six AI engines" | "all seven AI engines, including the leading open-weight model" |
| "ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews" | "ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, and Gemma (Google's open-weight model)" |
| "across closed-API engines" | "across both closed-API engines and the leading open-weight model" |

In contexts where the differentiator matters most (sales, methodology
pages, ASB-style enterprise pitches), expand to lean into the open-weight
angle. Sample lift:

> "We measure across seven engines. Six are commercial APIs (ChatGPT,
> Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews).
> The seventh is Gemma — Google's open-weight model. Closed APIs
> can change behind the scenes without notice; Gemma's weights are
> public, so anyone can independently reproduce our citation numbers.
> This is the only AEO platform doing both."

For Lance's voice notes on how to discuss Gemma with non-technical
audiences (MVNP, ASB), see this session's chat history — three layers
of explanation drafted for the May 18 meeting. If you want a cleaned-up
version pinned to a file, ask and I'll spin one up.

### Order of operations

1. **Do not refresh public-facing assets until Gemma rows are actually
   landing in production.** This window's job is to ship Gemma first.
   You'll know it's safe when `citation_runs` has rows with
   `engine='gemma'`. Quick check:

   ```
   wrangler d1 execute neverranked-app --remote --command \
     "SELECT engine, COUNT(*) FROM citation_runs WHERE run_at > unixepoch() - 86400 GROUP BY engine ORDER BY engine"
   ```

   When `gemma` appears in that output, refresh can ship public.

2. **Audit and meeting evidence files first** (highest stakes for May 18).
3. **Tuesday launch material** (blog, email, LinkedIn, HN) — needs to
   be ready by Monday evening HST.
4. **Website + State of AEO hub** — can ship after Tuesday launch since
   the launch is what brings traffic.
5. **Generator scripts** — so future regenerations don't regress.

### Graphics

There are likely diagrams or logos representing the engine set. If you
find one, add Gemma's logo. Google's Gemma branding lives at:
https://ai.google.dev/gemma — they have a permissive logo usage policy.
A simple "Google Gemma" wordmark or the Gemma "stylized G" should fit
visually with the other engine logos.

If there's no current engine diagram, no action — don't introduce a new
graphic just for this.

## What I'd love you to NOT touch (this window's zone)

- `dashboard/src/citations.ts` — actively patching for `runGemma`
- `dashboard/src/types.ts` — adding `TOGETHER_API_KEY`
- `dashboard/src/routes/citations.ts` — engine label arrays may move
- `wrangler.jsonc` — no changes expected but flagging
- Anything that touches `engines_breakdown` aggregator

You'll know coordination is clean when there's no merge conflict on
pull. If there is, this window's version is the source of truth for
code paths; your version is source of truth for content/copy.

## Reply mechanics

Either commit your refresh work to main directly (preferred — keeps
moving) or write a reply file in this directory if you have questions
that need resolving before you can act.

If you don't get to this by Monday morning, the May 22 launch can still
ship with "we're adding Gemma in the next release" framing for materials
that haven't been refreshed yet. But everything that's still in draft
state (anything in `content/strategy/` not yet committed-as-shipped)
should reflect 7 engines from the start.

## Strategic context for your refresh decisions

Lance's framing in tonight's discussion:
- "We're the only AEO platform doing both" (closed + open-weight)
- Banks and regulated industries care about audit-ability — Gemma is
  the answer to "how do I verify your numbers"
- Cost / margin impact is invisible (~$5/mo at current scale)
- The May 18 ASB meeting can lean on this hard if it lands by then

So when you're refreshing the ASB packet, frame it strongly. When
you're refreshing the long-tail SMB-facing material (regional dentists,
boutique hotels), keep it lighter -- those customers don't know what
"open-weight" means and won't care.

## Update 1: ASB May 18 packet is the single highest priority

Of every file mentioned above, `content/meeting-evidence/asb-2026-05-18.md`
is the one that absolutely has to be refreshed before May 18.
Mark Cunningham + the MVNP table are likely going to read it. Bank
compliance audiences are exactly the people the open-weight angle
lands hardest with. If something has to slip, do not let this slip.

We also just updated this file earlier today (commit cb075aa) to
reflect the citation-cron fix. The structure is fresh in your memory
if you wrote that update; if it was me, the rhythm is: open with the
finding, level the evidence at three tiers, close with three honest
caveats. Slot Gemma into the methodology block plus the third caveat
where appropriate.

## Update 2: Three-layer Gemma explainer for non-technical audiences

This came up in tonight's chat -- Lance asked what to say at the
ASB + MVNP meeting when someone asks "what is Gemma." We drafted
three layers and they should be the canonical language used across
all NR materials touching Gemma. Pasting here so the voice is
consistent in your refresh pass:

**Layer 1 (10-second answer, casual mention):**

> "Gemma is Google's open-source AI model -- same lab as Gemini,
> but the math is published so anyone can audit it. We added it to
> our tracking so customers can independently verify our numbers."

**Layer 2 (30-second, agency-leadership audience like MVNP):**

> "When we say we measure across ChatGPT, Claude, Gemini, and three
> others, those are all black boxes -- we're trusting the AI
> companies to give us consistent answers, and they can change
> behind the scenes. Gemma is different: Google published the
> underlying model openly, so when we run a query through Gemma,
> anyone with the same model can re-run it and verify our result.
> We added it for the same reason a bank publishes its audit
> methodology -- so customers don't have to take our word for it."

**Layer 3 (60-second, compliance-sensitive audience like ASB):**

> "Most AI measurement is done by calling commercial AI services --
> ChatGPT, Claude, and so on. Those services are closed: you send
> a query, you get an answer, you can't see what's behind it. They
> also change without notice. If OpenAI updates ChatGPT next week,
> the same query might give a different answer. That's fine for
> casual use, but not great when you're trying to track changes
> over time.
>
> Gemma is what's called an open-weight model. Google released the
> underlying mathematics publicly. Anyone -- including your team,
> your auditor, your compliance group -- can download it and run
> the exact same queries we run. The numbers we report are
> independently reproducible.
>
> Practically speaking, this means: when we tell ASB that you're
> cited 0% of the time in AI search results across our 7-engine
> measurement, you can verify that yourself. You don't have to
> trust us. You can hand the methodology to your compliance team
> and they can validate it.
>
> Banks have been asking us about closed-API dependencies -- Gemma
> is our answer."

Use these verbatim where space allows; pull lines selectively where
it doesn't. Whatever you do, do not write fresh narrative on this
without checking these layers -- the framing is deliberate.

## Update 3: Where to place Gemma in the engine list

Position matters depending on context:

- **Technical/methodology contexts** (audit deck schema review,
  the Citation Tape methodology page, scan-health dashboards):
  put Gemma **last** in the list: "ChatGPT, Perplexity, Claude,
  Gemini, Microsoft Copilot, Google AI Overviews, and Gemma." It
  reads as the additional 7th engine, supplementing the standard 6.
- **Sales/pitch/leave-behind contexts** (ASB packet, IQ360 letter,
  Tuesday launch material): put Gemma **first** or featured: "We
  measure across seven engines, anchored by Gemma, Google's
  open-weight model, plus the six leading commercial APIs (ChatGPT,
  Perplexity, Claude, Gemini, Microsoft Copilot, Google AI
  Overviews)." Foregrounds the differentiator.

If you can pull this off across the refresh, the consistency will
read as deliberate brand voice rather than an afterthought.

## Update 4: Date stamps and "as of" claims

The State of AEO hub and any methodology pages with "as of" dates
need bumping from 2026-05-10 to 2026-05-11 or 2026-05-12 once Gemma
data has accumulated for at least a day. Gemma rows started landing
2026-05-10 evening HST; by Monday morning UTC there will be a clean
24h sample to cite.

If you find a methodology page that lists prompt counts ("437
citation runs across NR's tracked client universe in the 2026-04-14
to 2026-05-10 window"), those will need refreshing either with the
latest counts or with future-tense language ("from 2026-05-11
forward, daily cron produces X samples...").

## Update 5: Coordinate with the anonymization handoff

There's a separate pending handoff at
`content/handoff-questions/iq360-anonymization-edit.md`. The
working-tree edit anonymized "Mark Cunningham at American Savings
Bank" → "a Hawaii community bank" in the IQ360 audit. That's
unresolved as of this writing. If you're refreshing the IQ360
audit anyway for the engine count, please also resolve the
anonymization in the same pass (commit both changes together) so
we don't end up with two separate diff layers on the same file.

## Update 6: Gemma's status -- locked, not proposed

Lance reviewed the cost/margin math + sales differentiation
analysis tonight and locked the Gemma decision. We are shipping
this for May 22 paired with the Citation Tape launch. Treat any
refresh of "what we're measuring" as a definitive change, not a
"we plan to add" caveat. The infrastructure is live and producing
rows as of 2026-05-10 evening HST.

## Update 7: Gemma logo for any engine diagrams

If there's an engine-logo grid anywhere (homepage hero, State of
AEO hub, audit deck title page), Google publishes a Gemma brand
kit at https://ai.google.dev/gemma. The "stylized G" mark or
"Google Gemma" wordmark both work. Permissive license, just don't
claim partnership or endorsement.

If there's no current engine-logo diagram and you don't want to
create one, no action -- the text-based engine list updates are
sufficient.

## Update 8: Verification before public refresh -- now confirmed

The original doc said "do not refresh public-facing assets until
Gemma rows are landing." That gate is cleared as of 2026-05-10
evening HST. Confirmed live with a manual scan:

```
gemma | 15 runs (all 15 active keywords on neverranked slug)
```

Full 7-engine query result available via the verification SQL in
the original doc. Go ahead and ship refreshes to public assets.
