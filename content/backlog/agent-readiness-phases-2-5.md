# Agent-readiness -- parked phases (do not work on)

**Status:** Backlog. Lance deprioritized 2026-05-11. Revisit only when:
- Citation-tracking product is meaningfully stronger (the current focus)
- An existing client explicitly asks for ActionType deployment
- A meaningful agent-commerce demand signal appears (e.g., OpenAI/Anthropic/Perplexity ships a real agent-purchase flow with measurable volume)

Until one of those triggers, leave this alone.

## What's already shipped (Phase 1, complete)

- `agent_readiness_check` v2 tool (27 ActionTypes, 13 verticals, JSON-LD + Microdata, deep nesting, "why this matters" copy)
- Test harness with 91-site panel across all 13 verticals
- Seed report at `reports/state-of-agent-readiness/state-of-agent-readiness-2026-05.{md,pdf}`
- 03b section in every new audit (auto-populated by `audit-generate.mjs`)
- Homepage one-liner under the hero
- Cover email templates at `content/outreach/state-of-agent-readiness-cover-emails.md`
- Monthly cadence documented at `scripts/agent-readiness-cron-README.md`

That's enough to (a) signal the category exists and (b) collect data over time.

## Phase 2 (parked) -- ActionType schema generator

**What it would be:** a `/agent-readiness-wizard` page where someone enters business URL + vertical, gets back ready-to-deploy ActionType JSON-LD blocks. Per-vertical defaults (banks get `ApplyAction` with `FinancialProduct`, hotels get `ReserveAction` with `Hotel` + `EntryPoint`, etc.). Free, no signup. Top-funnel inbound surface.

**Effort:** 1-2 weeks.

**Why it's parked:** giving away schema generation undermines the deployment service (Signal tier) without a demand signal. Wait for buyers to ask before building this.

## Phase 3 (parked) -- Deployment-as-a-service tier extension

**What it would be:** Pulse / Signal / Amplify tiers add ActionType deployment as a service line. NR generates the right schemas per page, deploys via existing schema-injection infrastructure, validates, monitors.

**Effort:** 1-2 months.

**Why it's parked:** waits on the first paying client to ask for it. Building service capacity before demand is the classic startup mistake.

## Phase 4 (parked) -- Certification + agent-side validator

**What it would be:** "NeverRanked Agent-Ready Certified" badge for validated sites. Public validator tool for agent builders (OpenAI, Anthropic, Perplexity).

**Effort:** 1-2 months.

**Why it's parked:** waits on having 50+ deployed clients to validate. Phase 3 must succeed first.

## Phase 5 (parked, parallel) -- Category standard-setting

**What it would be:** engage Schema.org community on Action vocabulary, engage agent builders on agent-readiness signals, become the canonical "State of Agent Readiness" publisher.

**Effort:** ongoing, low-volume, low-cost.

**Why it's parked:** the work itself is cheap (relationships, occasional posts), but doing it BEFORE Phase 2 ships gives you nothing to point at. Wait until Phase 2 is live.

## What to do in the meantime

Just keep collecting data. The monthly harness run grows the dataset. Audit recipients see 03b in their PDFs. The homepage one-liner sits there. The seed report is available for outreach. If the trigger event happens, we have a 6-12 month data history to point at instead of starting from zero.

## Trigger events that would un-park this

In rough order of likelihood:

1. **An existing Signal-tier client explicitly asks for ActionType deployment.** Most likely trigger. Wait for it.
2. **OpenAI, Anthropic, or Perplexity ships a measurable agent-purchase flow.** Indirect signal. Watch their roadmaps.
3. **Google or Schema.org publishes guidance prioritizing Action vocabulary.** Confirms the category. Move fast if this happens.
4. **A competitor launches an ActionType-focused product.** Unlikely (we already have the best measurement tool), but if so, decide whether to defend the category or cede it.
5. **The dataset crosses 250 sites with 6+ months of history.** Self-trigger -- at that point, publishing the State of Agent Readiness publicly becomes a defensible move.

Until one of these fires, focus stays on citation tracking.
