# NeverRanked Position on AI Agent Readiness

Through 2026, the dominant AI use case has been *answering questions*.
ChatGPT tells you the best Hawaii bank, Perplexity summarizes a category,
Claude gives you advice on a topic. Citation Optimization (the AEO moves
NeverRanked has been shipping all year) is built around this paradigm.

The next paradigm, already in motion, is *agents performing tasks on
behalf of users*. ChatGPT books your dinner reservation. Claude opens
your bank account. Perplexity runs a quote across three insurance
carriers. The agent is no longer reading your site for context. It is
trying to *use* your site to do something.

Sites optimized for citation are not necessarily optimized for agent
use. The signals are different. The window for differentiation is open.
This document is NeverRanked's framework for closing it.

## The four agent task surfaces that matter

Agents need machine-readable instructions for the actions a site
supports. Schema.org has had `Action` types for years. Almost no
business uses them. The four most consequential surfaces:

### 1. ReserveAction: booking surfaces

Restaurants, hotels, airlines, healthcare appointments, tours, classes,
table service, professional consultations. If a user can book time on
your calendar via your site, an agent can do it for them, but only if
the site exposes a structured `ReserveAction` block.

### 2. BuyAction / OrderAction: commerce surfaces

E-commerce, gift cards, subscription signups, ticket sales, donations.
The product schema you already have (Product, Offer) is the foundation;
agent readiness adds the action-shape that says "an agent can complete
the purchase from this URL with these parameters."

### 3. ApplyAction: application surfaces

Loan applications, account openings, job applications, scholarship
applications, college admissions, government forms. The single biggest
agent-acceleration opportunity in financial services and education.

### 4. ContactAction / AskAction: communication surfaces

Email an advisor, request a quote, schedule a demo, open a support
ticket. Agents that need information will favor sites that expose
structured contact actions over those that bury contact behind
unstructured webforms.

## What good looks like

A well-structured `Action` block answers four questions for the agent:

1. **What action?** (`@type`)
2. **Who is the target?** (`target.url`, the actual endpoint, not a
   landing page)
3. **What does the agent need to provide?** (`object`, `query-input`,
   `actionStatus` if applicable)
4. **What does success look like?** (`result`, the schema type the
   action produces, e.g. a `Reservation`, `Order`, or `LoanOrCredit`)

The fifth, optional, but increasingly important question:

5. **Are there agents we trust?** (`agent` constraints. Some sites
   may want to whitelist specific agent providers as authentication
   matures)

## Why most businesses are not ready

Three reasons:

1. **The schema is not the bottleneck.** Most sites have not yet
   exposed the underlying actions as machine-callable endpoints.
   Booking happens through a third-party widget (OpenTable, Resy,
   Calendly, etc.) that the site does not control. The Action schema
   has nowhere to point.

2. **The actions are gated behind authentication.** Most consequential
   agent actions (banking, healthcare) require proof of identity. The
   identity layer for agents is still maturing. Sites that figure out
   delegated authentication first will be the ones agents can actually
   transact with.

3. **The category leaders have not made it a priority.** Schema.org's
   Action vocabulary is not new. The reason it has not been adopted is
   not technical. It is that no one was crawling for it. That changed
   in 2026.

## NeverRanked's deployment path

For each customer:

1. Audit current Action coverage (typically zero)
2. Identify the 2-4 most consequential actions the customer's site
   supports: booking, ordering, applying, contacting
3. Generate paste-ready Action templates with proper target URLs and
   query-input fields
4. Deploy via the same snippet that handles citation schema
5. Track agent traffic (bot user-agents that identify as agents) in
   the same dashboard that tracks citation traffic
6. Update quarterly as agent capabilities expand

## What NeverRanked refuses to ship

- **Action schema pointing at JavaScript-only endpoints.** Agents in
  2026 cannot execute arbitrary JavaScript reliably. The endpoint must
  be a real HTTP URL that responds to GET or POST.
- **Reservation actions for businesses without a real-time inventory
  feed.** Pointing an agent at a "we will call you back" form is worse
  than not having the schema. The agent will report failure.
- **Action schema that wraps a third-party widget the customer does
  not control.** OpenTable's structured booking is OpenTable's surface,
  not the customer's. We will not pretend otherwise.
- **Agentic claims on sites that do not actually support the action.**
  If the action does not work for a human, exposing it for agents is
  fraud.

## How agent-readiness scoring works

NeverRanked's audit pipeline now includes an Agent Readiness component
on the AEO score. Each customer gets a per-action assessment:

- Is the action exposed at all? (binary)
- Is the schema correct? (validation)
- Does the target URL respond? (live check)
- Are the required parameters discoverable? (heuristic)

The component contributes up to 10 points to the overall AEO score,
graduating up over time as the agent ecosystem matures. This means
sites that invest now get an early lift in their public score and
remain ahead as the weighting increases.

## Where we expect this to land by Q2 2027

- ChatGPT and Claude both ship general-purpose agents that can
  transact through trusted commerce providers
- A small number of category leaders (probably hospitality and
  consumer banking) ship the first agent-native interfaces, where
  agents can complete reservations and account openings end-to-end
  without human intervention
- Schema.org publishes a refreshed Action vocabulary specifically for
  agent use, replacing or augmenting the 2014-era PotentialAction
  patterns most documentation still references
- Major search and AI surfaces begin distinguishing "agent-ready" from
  "human-only" sites in their indexes. Agent-ready sites win the
  agentic transaction volume

NeverRanked's bet: customers who deploy agent-readiness in 2026 lock in
position before this transition becomes obvious. Customers who wait
until 2027 catch up to a category that has already moved.

## Public commitment

NeverRanked publishes its own agent-readiness audit at
[neverranked.com/standards/agent-readiness](https://neverranked.com/standards/agent-readiness)
when shipped. The reference implementation is our own site's
"contact" and "scan" surfaces, exposed as `ContactAction` and an
agent-callable `AskAction` pointing at the public scan API.
