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
boutique hotels), keep it lighter — those customers don't know what
"open-weight" means and won't care.
