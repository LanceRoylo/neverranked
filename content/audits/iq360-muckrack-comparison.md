# NeverRanked × Muck Rack: A Capability Audit for IQ360

**To:** Jordan, IQ360
**From:** Lance Roylo, NeverRanked
**Re:** What you're getting from Muck Rack, what you're missing, what we just shipped

---

Jordan,

You mentioned IQ360 runs on Muck Rack. I went deep on what they
actually do this week and wrote it up so you and your team can see
where we sit relative to them. Not a pitch. An honest map of what
each platform owns, what each one misses, and where the two are
actually complementary instead of competing.

The short version: Muck Rack is the right tool for the half of AEO
that lives upstream of the website. We are the right tool for the
half that lives on the site itself. Most agencies are paying for
the upstream half and ignoring the downstream half. That is the gap
this document is about.

---

## What Muck Rack does well

I am not going to play down a platform that has Pfizer, Google, and
NBCUniversal on the customer list. Muck Rack's core stack is sharp:

- **Journalist database.** Searchable, filterable, deduplicated. The
  actual people behind every byline at every outlet that matters.
- **Pitch tooling.** Templated outreach with a measurable open and
  reply layer.
- **Earned media monitoring.** Real-time alerts across digital,
  broadcast, podcast, newsletter, and social.
- **Generative Pulse.** Their newest product. It tells customers
  whether and how their brand is showing up in ChatGPT, Claude,
  Gemini, and a few others.
- **Curation Engine + reporting dashboards.** AI-summarized
  coverage analysis, executive-ready reports.

This is best-in-class PR infrastructure. If your brief from a client
is "manage our press relations and prove the value to the board,"
Muck Rack is the answer.

The thesis Muck Rack stands on: 84% of AI citations come from
earned media. Get the press, the citations follow.

That thesis is partially true. Earned media moves citation share
for brands that already rank for everything else. For the long
tail of agency clients — the regional law firm, the boutique
hotel, the community bank, the wealth advisor — it is not the
binding constraint. Schema is.

---

## What Muck Rack does not do

Three structural gaps in their product, not failures of execution:

**They measure. They do not deploy.** When Generative Pulse tells
you "your client is cited 12% of the time on ChatGPT," the next
question is: what do we do about it? Muck Rack does not answer
that with a deployment. They tell you to pitch more journalists.
For long-tail clients without a press strategy, that is a
non-starter.

**No structured-data layer.** Muck Rack has nothing for Schema.org,
nothing for llms.txt, nothing for Schema.org Action types. The
machine-readable layer that AI engines actually parse first is
absent from their tooling. They monitor what comes out the other
end without changing what goes in.

**Pricing is enterprise-only.** Public pricing is "contact sales,"
which means they are not configured to serve agency clients in the
$2K-$10K monthly retainer range. Their floor is north of
$25K/year per seat in most published reports.

For an agency like IQ360 working across regional and mid-market
accounts, that pricing structure forces a binary: pay enterprise
rates for every client (impossible) or only use Muck Rack for the
ones who can afford it (limiting).

---

## What NeverRanked does

We sit on the deployment side of AEO. Three layers:

**Schema deployment.** We ship Schema.org JSON-LD onto customer
sites. Organization, WebSite, FAQPage, FinancialService,
LocalBusiness, AggregateRating — whatever the vertical and content
support. Deploy via a snippet so no engineering work on the
client's end. Our compliance-aware templates pass legal review at
banks and healthcare orgs on day one.

**Citation tracking with attribution.** Every Signal customer gets
weekly six-engine pulls (ChatGPT, Perplexity, Claude, Gemini,
Microsoft Copilot, Google AI Overviews) on a vertical-specific
prompt corpus. We attribute citation movement to specific
deployments at p<0.05 statistical confidence.

**Agent-readiness deployment.** As of this month, we also ship the
ReserveAction, ApplyAction, BuyAction, and ContactAction templates
that AI agents (not just answer engines) read when they perform
tasks for users. The agentic shift is the next paradigm and we
are deploying for it now.

**Pricing is in agency range.** $497/mo Pulse, $2,000/mo Signal,
$4,500/mo Amplify. Wholesale tier for agencies starts at $800/mo
per Signal slot at 1-9 clients, which means an agency can resell
at retail and pocket $1,200/mo per client in subscription margin
plus 3-8 hours of billable implementation per slot.

---

## What we just shipped this week (the gap-closing addition)

Three new pieces of platform we shipped between May 6 and May 10
that are directly relevant to where Muck Rack stops:

1. **Citation tracking as a standalone product line.** Six engines.
   Weekly cadence. Statistical attribution at p<0.05. Vertical-
   specific prompt corpora for community banking, real estate,
   professional services, hospitality, and more. The product name
   ships with the May 22 release; until then it is bundled into
   Signal. The capability is the answer to Generative Pulse for
   clients who want the tracking layer without the rest of the
   Muck Rack platform.

2. **@neverranked/mcp** — the first AEO toolchain in the official
   MCP registry. Any AI agent built on Claude Code or Claude Desktop
   can now run AEO scoring, llms.txt audits, and agent-readiness
   checks via MCP tool calls. Free for developer use, attribution
   required when output is shown to users. This is the open
   ecosystem play Muck Rack does not have.

3. **Earned-media authority signal** — being added to the AEO score
   as a fifth weighted component. We use Common Crawl and news APIs
   to detect inbound third-party mentions of the customer's domain
   and surface them as a sub-score. This means our methodology now
   accounts for the same signal Muck Rack's "84% of citations are
   earned media" thesis rests on, without replacing schema as the
   downstream lever.

---

## How IQ360 could use both

The two platforms are not interchangeable. They sit at different
points in the same value chain. The agency operator's question is
not "which one do I pick" but "which combination, by client tier?"

A workable allocation:

**Enterprise clients** ($10K+/mo retainer, real press strategy,
in-house comms team): keep them on Muck Rack for journalist
outreach and earned-media monitoring. Add NeverRanked Signal at
$2K/mo for the deployment layer Muck Rack does not run. Ratio
of cost: Muck Rack is the larger line item, NeverRanked is the
plug-in.

**Mid-market clients** ($3K-$10K/mo retainer, press strategy
emerging, no in-house comms): NeverRanked Signal as the primary
AEO platform. Selective use of Muck Rack for one-off press pushes
when there is a story to pitch. Ratio of cost: NeverRanked is the
recurring spend, Muck Rack is the campaign tool.

**Long-tail clients** ($1K-$3K/mo retainer, no press strategy,
no in-house comms): NeverRanked Pulse at $497/mo or Signal at
$2K/mo. Muck Rack is not the right tool here — pricing alone
makes it a non-starter. The deployment work is what moves
citation share for these clients, and NeverRanked does the
deployment.

The point is, you should not be picking. You should be matching
tool to tier. Muck Rack covers your top tier well. NeverRanked
covers your middle and long tail in a way nobody else does.

---

## What I am proposing

Pick one of your real clients. Any tier. Send me their URL. I will
run a full audit on it — same methodology I just sent to Mark
Cunningham at American Savings Bank — and send you the PDF within
72 hours. Eight to twelve pages, vertical-specific, with the
deployment plan that closes the gap.

No cost. No pitch on the call back. If the audit makes a case for
NeverRanked-as-IQ360-line-item, you bring it up. If it does not,
you keep the audit and I shake your hand.

The agency partner program has wholesale terms locked in at the
$800/mo Signal floor, vertical exclusivity in Hawaii available to
the first agency that signs, and I would rather it be a Honolulu
agency I already trust than a mainland one I do not.

Lance

lance@neverranked.com
neverranked.com
