---
title: "NeverRanked Moat Research — May 2026"
author: Lance + Claude
date: 2026-05-07
status: working draft
---

# Where AEO Is, Where It's Going, and Where the Moats Are

## State of AEO, May 2026 — honest read

The category exists but no clear leader. Profound and Athena have raised
money. Otterly is positioning as the analytics layer. Diib is layering AEO
onto SEO. Generic SEO platforms (SEMrush, Ahrefs, Moz) are all racing to
add an "AI mentions" tab.

What none of them ship together:

- Six-engine, web-grounded weekly tracking with statistical attribution
- Schema deployment via a snippet (most are dashboards, not deployers)
- Per-vertical compliance-aware schema (zero competitors do this)
- A clarity-first customer voice (most are technical and gatekept)
- Reverse-engineering of competitor citations
- Citation accuracy / hallucination tracking
- llms.txt support

That gap is our window. It is not infinite. By Q1 2027 at least one of
the funded competitors will copy the table-stakes pieces (six-engine
tracking, snippet deployment, dashboard). The moats we build NOW need
to compound between now and then.

## The taxonomy of NeverRanked moats

Most "moat" thinking is one-dimensional. Real moats fit one of these
patterns. The ones that matter most for NR are starred.

| Type | Description | NR has it? |
|---|---|---|
| **Data moat** ★ | Proprietary dataset competitors cannot replicate without doing the same ground-up work | Partial — citation_runs accumulating; not yet at scale |
| **Network effect** | Each new user makes the product better for existing users | Not yet — possible via benchmarks + schema marketplace |
| **Vertical depth** ★ | Per-vertical playbooks, prompts, schema, compliance | Active — Hawaii banking + real estate shipped |
| **Switching cost** | Painful to leave (data, integrations, workflow) | Light — citation history + schema deployment lock-in only |
| **Brand / voice** ★ | The Clarity Principle, the way audits read | Codified, growing |
| **Distribution** | Channels competitors don't have | Weak — needs work |
| **Speed advantage** ★ | Faster to detect engine changes than in-house teams | Active — engine-changelog scaffold |
| **Regulatory / compliance** ★ | Customers need certified vendors | Active — financial services schema shipped |
| **Trust / accuracy** ★ | Defensible because being wrong costs us | Possible — hallucination defense layer |
| **Scarcity / exclusivity** | Limited supply we control | Active — agency partner exclusivity clause |
| **Ecosystem position** | Become the substrate others build on | Long-term — partner API, MCP layer |

The most defensible moats are the ones that compound over time AND are
hard to copy quickly. Data moats and vertical depth dominate that
quadrant. Speed and brand are second-tier but real. Distribution and
ecosystem position are slow-burn but eventually structural.

## Where AEO is heading — six observations grounded in current trends

### 1. Agentic AI changes the citation surface fundamentally

ChatGPT, Claude, and Perplexity are all pushing agents that perform
tasks, not just answer questions. "Book me a Hawaii bank account" or
"set up an SBA loan application" replaces "tell me about Hawaii banks."

Implication: Schema like `Action`, `BookAction`, `ReserveAction`,
`ApplyAction` becomes the new citation-equivalent for agent flows.
Sites that expose agent-readable workflows get used by agents; sites
that only expose human-readable pages get skipped.

### 2. llms.txt and AI-specific robots files are the next standard

Anthropic proposed llms.txt as a robots.txt for AI. Adoption is early
but accelerating. Sites that publish a clean llms.txt give AI engines
a curated map of what to cite. Sites that don't get crawled
indiscriminately (or not at all).

Implication: NR can be the first AEO platform to make llms.txt
deployment trivial AND track which engines respect it AND benchmark
adoption across verticals.

### 3. Citation accuracy is becoming a legal exposure

When ChatGPT hallucinates that a bank offers a product it does not,
that is a misrepresentation. As of 2026 there is no clean
liability framework, but several lawsuits are testing the question.
Enterprises are starting to demand vendors who can prove what AI
says about them and dispute incorrect statements.

Implication: NR can be the vendor that captures hallucinations,
flags them to customers, helps file corrections via engine feedback
mechanisms, and tracks resolution. Defensible because requires the
six-engine tracking infrastructure to detect in the first place.

### 4. The dark-funnel attribution problem is unsolved

Right now no platform can reliably tell a customer: "ChatGPT mentioned
you 47 times last week, and 12 of those resulted in clicks, and 3 of
those clicks converted." The attribution chain is broken because AI
engines mostly don't pass referrer info.

Implication: Whoever builds even a partial solution to AI-driven
attribution captures the budget that currently flows to SEO/SEM
attribution platforms ($14B market). The half-solution is good
enough — UTM-tagged "AI-friendly" link patterns + first-party
analytics correlation.

### 5. Vertical specialization beats horizontal scale

The current AEO platforms are horizontal — same dashboard for a SaaS
company and a hospital. The vertical winners (HighLevel for agencies,
Mindbody for fitness, Toast for restaurants) all started horizontal
and got destroyed by vertical-first competitors.

Implication: NR's Hawaii banking and Hawaii real estate moves are
correct. Each new vertical playbook is a moat. Hawaii law firms, Hawaii
medical practices, Hawaii hotels, mainland community banking, mainland
boutique law — each is a structural compounding asset.

### 6. The "schema marketplace" is the network-effect play nobody is building

Schema.org is open standard but the practical templates are scattered.
There is no marketplace. NR could become the marketplace: customers
contribute templates back, NR curates and validates, the catalog grows.
Each new contributor makes the platform more valuable for the next.

Implication: First mover wins. Three-year window before someone else
notices.

## Moats ranked by impact × buildability for solo founder NR May 2026

### Tier S — build NOW, big impact, solo-buildable

**1. llms.txt deployment + tracking layer.** Build the canonical
"is your llms.txt right" tool at neverranked.com/llms-check. Track
which AI engines respect llms.txt (Anthropic does, OpenAI says they
will, Perplexity is unclear). Make NR the source-of-truth for
llms.txt adoption stats by vertical. Becomes the second tool people
use after our schema scanner. **Effort: 1 week. Distribution moat
+ data moat + speed moat.**

**2. Per-vertical leaderboard machine.** We built one Hawaii leaderboard.
Build the publishing infrastructure that scales — Hawaii law firms,
Hawaii medical practices, Hawaii hotels, mainland community banking,
mainland boutique hotels. Each leaderboard is half a day of audit
work + half a day of publishing. **Effort: 1 day per leaderboard,
unlimited supply. Distribution + vertical depth + structural lockup.**

**3. State of AEO 2026 — annual report.** One major data publication
per year. Aggregates NR scan data + industry research + benchmark
percentiles by vertical. Becomes the canonical reference. Every press
article about AEO has to cite it. **Effort: 2 weeks. Brand moat +
distribution + reputational compounding.**

### Tier A — build in next 90 days, big impact but more effort

**4. Citation accuracy auditing.** When ChatGPT mentions a customer,
is it accurate? Run continuous comparison of cited claims against the
customer's source-of-truth pages. Flag hallucinations weekly.
Eventually surfaces engine bugs and customer site gaps.
**Effort: 2 weeks. Trust moat + retention moat + regulatory tailwind.**

**5. Hawaii brand authority pages.** A directory page for each
Hawaii business in our scan history. Permanent indexable URL.
"AEO profile of [Hawaii business name]" with current score, trend,
and findings. Customers can claim their page. Becomes a Yelp-style
directory specifically for AEO. **Effort: 1 week. Distribution moat
+ data moat.**

**6. AI agent destination layer.** Schema templates and audit
patterns for AgentAction, BookAction, ReserveAction, ApplyAction.
Be the vendor that talks about agentic readiness before competitors
do. **Effort: 1 week to research and build first templates. Speed +
vertical depth + future-proofing.**

### Tier B — build in next 6 months, structural longer-term moats

**7. Schema marketplace.** Open contribution catalog. NR validates.
Customers contribute back templates from their deployments. The catalog
becomes the de-facto Schema.org-for-AEO source. Network effect.
**Effort: 1 month. Network effect moat.**

**8. Public scan persistence + benchmark engine.** Migrate scan data
from KV to D1. Build the "who is winning AEO in your category" engine.
Compounds permanently. Already triggered, ready when volume justifies.
**Effort: 2 weeks. Data moat.**

**9. AI-driven attribution layer.** Partial solution: branded short
links that NR generates per customer page. AI engines tend to follow
these. We track who clicks. Customer gets first-real-attribution
data. **Effort: 1 month. Solving the unsolved problem = budget moat.**

**10. NeverRanked Certified Practitioner program.** AEO certification
for agency operators. MVNP's team is the first cohort if they sign.
Free. Builds talent and evangelist moat. **Effort: 3 days curriculum
+ 2 days landing page.**

### Tier C — strategic / opportunistic, build when triggered

**11. Open-source AEO scorer.** Release a tier of the methodology
open-source under a non-commercial license. Other agencies use it,
see the score, want the full product. Inbound funnel. **Effort: 1
week.**

**12. Hallucination defense product.** When an AI engine makes up
facts about a customer, NR captures it, files a correction request
with the engine, tracks resolution. Becomes valuable as legal
liability rises. Gated on the trend. **Effort: 1 month.**

**13. Voice query tracking.** Different schema patterns get cited
in voice. Build a voice-citation tracker for Siri/Alexa/Google
Assistant. Niche but defensible. **Effort: 2 weeks.**

**14. AEO insurance / SLA.** "Citation share floor guarantee — if
your AEO score drops more than 10 points and we don't catch it
within 7 days, we credit the month." Sales weapon. Forces excellence.
Effort is contractual not engineering. **Effort: 2 days.**

**15. NR-authored book or canonical AEO text.** Lance writes the
book on AEO. Becomes the canonical reference. Compounds reputation
indefinitely. **Effort: 3 months part-time.**

## What I would NOT build

- **Chrome extension.** Looks like distribution, actually a maintenance
  burden for a solo founder. Defer until paying customer asks.
- **Mobile app.** No reason to exist. Dashboard is web-native.
- **AI content generator.** The category is crowded and we are not
  trying to compete on writing.
- **AI-detection tools.** Adjacent but not our category.
- **Generic SEO features.** Stay disciplined. AEO is the wedge.

## The compounding strategy

Most of these moats compound only if shipped in sequence. Specifically:

1. **Now (next 30 days):** Tier S. These build the moats that buy
   time before well-funded competitors catch up to the table-stakes
   features.
2. **Next 90 days:** Tier A. Builds the differentiation that makes
   NR feel categorically different, not just better.
3. **6-12 months:** Tier B. Makes NR structural — the substrate
   others build on.
4. **12-24 months:** Tier C. Plays the future — agentic AI, voice,
   regulatory, canonical reference texts.

If we execute Tier S in the next 30 days we have:

- llms.txt as a category-defining asset
- Five Hawaii vertical leaderboards published
- The State of AEO 2026 report drafted

That is the moat package that turns NR from "interesting startup" to
"the obvious vendor in the category." After that the competition is
trying to catch us, not the other way around.

## What this memo does NOT do

It does not solve our biggest non-moat problem: NR has zero agency
partners and one paying retail customer. Moats matter only if there
is enough business behind them to defend. Some of these moves serve
the moat, some serve the funnel, and a few do both. The ones that
do both (llms.txt tool, vertical leaderboards, State of AEO report,
brand authority pages) should be prioritized by definition.

## Recommendation for next sprint

Focus this week on three of Tier S:

1. **llms.txt deployment + tracking** — biggest impact, biggest
   surprise factor in the meeting (very few people know what
   llms.txt is yet)
2. **State of AEO 2026 report — Hawaii edition first** — uses
   data we already have, becomes a meeting weapon
3. **Vertical leaderboard machine** — formalizes the Hawaii banking
   leaderboard pattern into something reproducible across verticals

Skip Tier B and Tier C for now. Discipline matters more than ambition
when there is one founder.
