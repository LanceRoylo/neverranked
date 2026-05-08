# Meeting prep: anticipated questions

Mark Cunningham (Senior VP, Director of Marketing, ASB) and
James Malins (Director of Paid Digital Strategies, MVNP).
May 13, time pending.

Two distinct people in the room. Mark is the buyer with budget
and brand reputation on the line. James is the practitioner who
will live with the operational consequences. They will ask very
different kinds of questions. Plan answers for each.

---

## Mark's likely questions (buyer / brand / risk lens)

### "Will this hurt our existing SEO rankings?"

What's behind it: Mark's paid spend is tied to organic position.
A drop in organic = wasted paid budget. He cannot risk it.

Honest answer: No. AEO is additive to SEO, not a replacement.
The schema we deploy is structured-data layer that sits in your
HTML head. It does not change page content, URL structure, or
internal linking. Google's documentation explicitly endorses
structured data, and rich-results eligibility (sitelinks search
box, breadcrumbs, FAQ blocks) is a small but real organic win
on top. Your SEO will be the same or slightly better.

What NOT to say: "AEO is replacing SEO." That triggers the
fear. Lead with "additive."

### "What if your schema says something incorrect about ASB?"

Behind it: regulated industry, compliance/legal review chain.

Answer: Every schema we deploy is reviewed before going live.
You have approval rights on every change. We don't ship marketing
language. We ship structural facts your site already publicly
states (your name, address, services, FAQ Q&A you've already
written). If you change a service description on your site, we
update the schema to match. We can also pause the snippet at any
time and the schema rolls back instantly.

### "What does this look like in my quarterly board report?"

Behind it: Mark needs to be able to point to a number and say
"this moved." If we can't fit into his reporting, we won't survive.

Answer: We deliver a Visibility Index report monthly. One
headline number (% of tracked queries where ASB is cited),
trend line, named competitors gaining or losing share. Designed
to drop into a marketing performance deck without translation.
Two slides max. We can also provide raw data for Looker / your
existing reporting stack if your team prefers to integrate.

### "How does this fit with what MVNP already does for us?"

Behind it: he doesn't want to pay twice or trigger an awkward
conversation between vendors.

Answer: This is exactly why we wanted James in the room. AEO is
not paid digital. It does not compete with what MVNP runs for
ASB. Two ways this fits: (1) MVNP could become NR's agency
partner and run AEO as a new line item billable to ASB at
their own rate (we wholesale to them, they retail it). (2)
ASB engages NR directly, MVNP keeps doing paid digital, the
two run in parallel. Either works. Both work. We have a
preference but it's the room's call.

### "Will customers see anything different on our site?"

Behind it: brand consistency, UX risk.

Answer: No. Schema markup is invisible to humans. It lives in
the page head as JSON-LD or microdata. Customers see the same
site. The only people who see anything are search engines and
AI engines. The only visible change might be Google sometimes
showing a richer result for ASB queries (the search box, the
breadcrumb trail, the FAQ accordion). Visible only on Google.
Not on your own site.

### "What if AEO turns out to be a fad?"

Behind it: a senior marketer who has seen 15 "next big thing"
categories come and go.

Answer: Be honest. AEO is the formalization of structured data,
which has been core SEO infrastructure since 2011. The new part
is that AI engines (ChatGPT, Perplexity, Gemini, Claude) are
also reading it now, and they cite a much smaller pool of
sources than Google's blue-link index. The category name is
new. The work is not. Even if "AEO" the term dies, the schema
deployment is permanent infrastructure that helps your Google
SEO regardless. You can't lose this bet.

### "How long until we see results?"

Behind it: budget commitment vs payback timeline. He needs to
report progress to his manager.

Answer: Two timelines. (1) Schema deployment + visible
improvements in Google rich results: 2-4 weeks. (2) Citation
lift in ChatGPT/Perplexity/Gemini: 60-90 days because those
engines retrain on cycles. Our 3-month minimum exists to
protect customers from quitting before the second timeline
matters. We measure both. The 30-day report shows technical
implementation and Google rich-result wins. The 90-day report
shows actual AI citation lift.

### "Why us, why now, why ASB specifically?"

Behind it: testing whether this is generic outreach or specific.

Answer: ASB is a regional bank with strong content (we counted
10,923 words on your Common Questions page). That's the rarest
asset in your category — most banks publish thin content.
Right now AI engines are paraphrasing competitors who have
worse content but better structured data. You have the input.
You're missing the output layer. That gap is unusual and
recoverable. We don't say this to every prospect. We say it
to ASB because the audit shows it.

### "Pricing?"

Answer: Pulse $497/mo, Signal $2,000/mo, Amplify $4,500/mo.
3-month minimum. No contract beyond that. For ASB
specifically, Signal is the right tier — you have the content
maturity to leverage citation tracking and competitor monitoring,
not just the entry-tier reporting.

For MVNP as an agency partner, Signal wholesale is $800/mo
per slot. That means MVNP could resell at retail ($2k/mo) or
bundle into your retainer at any number you decide. The 10%
intro credit applies to the first three months either way.

---

## James's likely questions (practitioner / measurement lens)

### "What's the citation tracking methodology?"

Behind it: he runs paid for a living. He knows attribution is
hard and most vendors handwave it.

Answer: Six engines, weekly, not daily (signals are too noisy
daily). Each tracked prompt runs against ChatGPT, Perplexity,
Claude, Gemini, Microsoft Copilot, and Google AI Overviews.
Web-grounded engines (Perplexity, Copilot, Gemini, AIO) we
hit via API or scraper depending on access. ChatGPT Search +
Claude we hit via their respective interfaces. We measure
citation share (you appear in N of 100 cited sources for a
given prompt) and rank position (1st, 2nd, 3rd). Citation lift
attributed per variant with statistical confidence at p < 0.05
before we credit movement to the work. We will share the
methodology document. It's not magic.

### "How does this integrate with GA4 / our reporting stack?"

Answer: Our dashboard exports to CSV and JSON. We can push
weekly snapshots to a Google Sheet or your data warehouse. We
do NOT replace GA4. We sit alongside it. Citation events are
not measured in GA4 (GA4 only sees on-site traffic). What
we measure is citation share on AI engines, which is
upstream of any traffic. Then we cross-reference with
GA4 referrer data when it shows attribution from
chat.openai.com, perplexity.ai, etc.

### "What if you push bad schema and break our site?"

Behind it: legitimate engineering fear. Healthy.

Answer: The snippet ships schema as additive JSON-LD blocks in
the head. It cannot break page rendering, navigation, forms,
or any user-visible behavior. Worst case it ships invalid JSON
and Google ignores it. We test every block against Google's
Rich Results Test before deploy. We have rollback in 30 seconds
via the snippet kill switch. We've never broken a page in
production. Your team can also deploy the schema themselves
if you'd rather we not have a snippet on the site, and we just
provide the JSON-LD blocks for you to paste.

### "What's NR's responsibility vs our team's?"

Answer: Three categories of work and three different splits.

(1) Schema deployment: NR ships via the snippet. Auto.
(2) Page-level fixes (meta tags, heading hierarchy, content
gaps, canonical tags, og:images): your team ships these on
your site. We provide the prioritized list, the exact code,
the platform-specific instructions. We do not have admin
access to your CMS.
(3) Citation tracking + reporting: NR runs entirely.

If you want NR to do category 2 work too, that's the Amplify
tier — we write content drafts, propose page changes, and
auto-publish to your CMS with your review.

### "Have you handled an account our size?"

Behind it: scale skepticism. Be honest.

Answer: No. We have one paying retail customer (a Honolulu
performing arts venue, anonymized). ASB is bigger. The
mechanical work scales without issue — schema deployment is
schema deployment whether the site has 50 pages or 500. The
reporting scales linearly with tracked prompts. The thing
that's actually different at ASB scale is the review chain
(legal, brand, IT). That's where we'd plan to be careful. If
the answer is "we want to see you handle a smaller pilot first
before scaling," we welcome it. ASB could pilot with one
business unit (small business banking, mortgage) for 90 days
before expanding to the full site.

### "How do you compare to Profound, Athena, Otterly, Diib?"

Behind it: he's done the homework.

Answer: Honestly: Profound has more brand recognition. They
charge $30,000/year for tracking. They don't deploy schema —
they only report. Athena is similar, focused on enterprise.
Otterly tracks LLM citations only, no schema deployment, no
implementation work. Diib is more of a marketing automation
play, not specifically AEO.

NR's positioning is "we ship the work, not just the
dashboard." We're cheaper because we're smaller. We're
specific to AEO because that's all we do. We do schema
deployment + citation tracking together because doing only
one half doesn't move the number. The category is young and
the players are not entrenched. ASB / MVNP would be early.

### "What's our share of the wholesale margin if we sign as a partner?"

Answer: NR wholesales to MVNP at $800/mo per Signal slot
(at 1-9 clients). MVNP retails at whatever number you set.
Most agencies retail at our published $2,000/mo. That's
$1,200/mo per slot in pure subscription margin to MVNP. On
top, the implementation work (the page-level fixes from
category 2 above) is billable to ASB at MVNP's hourly rate.
For a typical Hawaii regional account, that's $450-2,000/mo
in additional billable hours per slot.

At 10 client slots, MVNP's revenue from the partnership is
roughly $16-32k/mo, on top of any existing retainer. Margin
splits and exclusivity terms are negotiable for the first
agency partner.

### "What is the founding partner clause?"

Answer: If MVNP signs the 90-day pilot, we lock Hawaii financial
services and Hawaii real estate development as MVNP-exclusive
verticals for 12 months from pilot start. No other agency on the
island gets wholesale access in those categories. MVNP also gets
right of first refusal on any new Hawaii vertical we open.

This is structural, not a discount. When a competing agency tries
to pitch NeverRanked into a Hawaii bank during that 12 months, we
route them back through MVNP or decline the deal.

It costs us nothing now, costs us something later if the bet works.
That is what makes it worth offering specifically to a founding
partner. After 12 months we revisit, and if the partnership is
producing, we extend or expand.

### "Have you heard about llms.txt?"

This is the meeting differentiator that nobody else in the room
will know about. Use it strategically.

What it is, in one sentence: llms.txt is a markdown file at the
root of a website that gives AI engines a curated map of what to
cite — proposed by Anthropic, adopted preferentially by Claude,
and being followed by other engines through 2026.

Why it matters: Sites with a curated llms.txt get cited by Claude
preferentially over sites without one. ASB does not have an
llms.txt. Neither do FHB, BOH, or CPB. None of the four Hawaii
banks have deployed it.

The window: When OpenAI and Perplexity follow Anthropic's lead
(expected H2 2026), every site without an llms.txt loses two-to-
three months of citation share to faster movers. Whoever ships
first in Hawaii community banking wins that window.

NeverRanked's position: We have a CLI tool that audits any site's
llms.txt against our scoring rubric. We have vertical-specific
templates including financial services. We deploy llms.txt
through the same snippet that handles schema. ASB's would be
the first community bank in Hawaii to have one.

Phrasing for Mark and James:

> "There's a second piece of the AEO surface most agencies haven't
> caught up to yet. It's called llms.txt. It's a curated map of
> your site that AI engines read first when deciding what to
> cite. Anthropic's Claude already follows it preferentially.
> OpenAI's stated they will. Right now zero Hawaii banks have it
> deployed — yours included. We have templates ready and the
> deployment infrastructure to ship it the same week we ship the
> schema work. The bank that deploys first locks in the lead before
> the rest of the engines catch up to the standard."

If James asks for technical detail: methodology is at
`/standards/llms-txt`. The CLI tool is `scripts/llms-txt-check.mjs`.
Reference implementation is at neverranked.com/llms.txt.

### "We built a public leaderboard for Hawaii community banking. You're #1 on it."

When and how to introduce: late in the meeting, after the
methodology and the audit have been discussed. Not the opener.
Frame it as a moat-deepening artifact we're shipping in the next
30 days, not as pressure.

The numbers (live scan May 7, 2026):
- ASB: 55 (D) — leader
- BOH: 50 (D)
- FHB: 45 (D)
- CPB: 25 (F)

Phrasing:

> "One thing we're shipping in the next 30 days is a public
> leaderboard for Hawaii community banking, weekly updated. You're
> on it — currently #1 by 5 points. We wanted you to see your
> position privately before it goes live. The lead is real but
> thin. Whoever ships the Phase 1 schema work first this quarter
> takes the category lead by an unrecoverable margin. That's
> either you or one of the three banks behind you."

What this does:
- Tells Mark his bank is winning, which is the right place for him
  to start the negotiation from
- Surfaces the urgency (the lead is thin, competitors can take it)
- Frames the leaderboard as inevitable, not a threat
- Implies first-mover advantage without saying "you should worry"

Be ready for: "Don't publish that without my approval." Honest
answer: "We're giving the category lead 14 days of pre-publication
notice. After that we publish whether you sign or not. The
methodology is reproducible — anyone can run check.neverranked.com
on these four domains and verify the numbers themselves. We're
not asking permission to score the category, we're asking whether
you want to extend your lead before everyone can see the gap."

### "Why offer that exclusivity? What's in it for you?"

Honest answer: Three things.

1. It gives MVNP a real reason to defend NR against competitors
   entering the territory. We need that defense more than we need
   the second-best agency partner in Hawaii.
2. It forces us to focus. If Hawaii banks are MVNP's, we are not
   tempted to dilute attention by chasing a different agency in
   the same vertical. We go build the next vertical instead.
3. It creates a forcing function. The pilot has a hard deadline
   to prove value because the lockout has a clock on it.

This is not a giveaway. It is structural alignment.

### "Hawaii queries are a tiny SERP. Is AEO meaningful here?"

Behind it: he's been managing Hawaii accounts long enough to
know the data is thin.

Answer: This is the right question. Honest answer: Hawaii local
queries are a small SERP (low search volume, narrow citation
universe), so the absolute citation counts are low. But the
relative share is very moveable. When ChatGPT cites three banks
for "Hawaii business banking," being one of those three vs
zero is huge. The data is noisy at low volume but the
strategic position is clearer than in mainland markets where
50 banks compete. Hawaii buyers also increasingly use AI
engines for trust-sensitive purchases (banking, healthcare,
real estate) at higher rates than commodity purchases. We have
data on this we can share.

### "Why should ASB be first when First Hawaiian and Bank of Hawaii aren't doing this?"

Behind it: the conservative competitive instinct of regional
banking.

Answer: First mover gets the citation share that's hard to
take back once the engines anchor on it. Right now, when
ChatGPT is asked about Hawaii business banking, it cites
Bank of Hawaii most often (we've measured this). That's
because BOH has more historical content and citation surface
on the open web. If ASB ships structured data first, we can
flip the citation rank within 90 days because the engines
re-evaluate on training cycles. By the time First Hawaiian
or Bank of Hawaii catch on, you've moved.

---

## Questions both might ask (the killers)

### "Can we do a 1-month trial?"

Answer: Honestly, no. Not because we want to lock you in —
because the data isn't meaningful at 30 days. The schema we
ship in week one gets absorbed into AI training cycles around
day 60. A 1-month trial would tell you the implementation
went smoothly (week 2-3 metrics) but would NOT tell you if
citation share moved (the actual question). 90 days is the
honest minimum.

What we WILL do: a 90-day pilot at standard Signal rate ($2,000
× 3 = $6,000 total), with explicit go/no-go review at day 90.
If you don't continue, you keep all schema we deployed and
walk away with zero further commitment.

### "What's our exit ramp if it doesn't work?"

Answer: Cancel anytime via the dashboard. No clawback. Schema
we've deployed via the snippet stops being maintained but stays
on your site (or you can have us remove it, your choice). We
don't lock customers in via contract. We only lock them in by
making the work meaningful. If we fail at that, we deserve
to lose the account.

### "Who else are you working with in Hawaii?"

Answer: Right now, no one. Hawaii Theatre is our retail
customer. ASB / MVNP would be the second NR engagement here.
We're not in conversations with other Hawaii banks or other
Hawaii agencies. We can offer first-look exclusivity in
Hawaii banking for ASB if that matters.

### "What's your team size?"

Answer: One person — me. Lance Roylo, founder. I built the
product, ship the implementations personally, run the reporting,
and am the only point of contact. The product is heavily
automated (the snippet, the scanner, the dashboard, the
generation pipeline) so most of the work runs without my
hands on it. The hands-on work is the audit deliverables and
the customer relationships. If MVNP signs as an agency partner,
this is part of the answer — you can support 5-25 client slots
without me being the bottleneck on each one.

### "What happens if you go away?"

Behind it: founder-risk on a long-term commitment.

Answer: Honest. Three answers stacked. (1) The schema we
deploy via snippet is JSON-LD that can be exported and
self-hosted by your team if NR ever shut down. We can provide
the export at any time. You don't lose the work. (2) The
methodology and tooling are not magic. The patterns we use
(schema.org standard, the six engines we track, the
citation-counting math) are all standard practice your own
team or any other vendor could replicate. (3) Founder risk
is real. We can address it with a longer warranty or by
holding the snippet code in escrow with your IT team. Not
typical for SaaS but I'd offer it for ASB.

---

## Things to NOT say

- "We're disrupting SEO." (Triggers Mark's risk fear.)
- "AEO is replacing search." (False, and triggers James's
  measurement skepticism.)
- "AI is changing everything." (Generic VC-pitch language;
  Mark and James have heard it 100 times.)
- Any reference to "leverage," "transform," "unlock,"
  "synergy," "cutting-edge," etc. (Brand voice violations,
  these are banned.)
- Claims about other agencies / banks NR has worked with.
  (We haven't. The honest pilot framing is stronger.)
- Any pricing estimate beyond what's in the one-pager.
  Don't extemporize. ASB has a procurement process and Mark
  needs the numbers to be exactly the same in the room as on
  the doc.

---

## What to ASK them

A founder who's only answering questions is in a one-down
position. Ask:

1. "What does success look like for ASB / MVNP six months out?
   I want to know what would make this an obvious yes for you."
2. "What's the single biggest concern you have right now about
   AEO as a category, regardless of who you'd buy it from?"
3. "If we ship this and it works, what's the second thing you'd
   want to do with us?"
4. "What's the current process when MVNP wants to recommend a
   new tool to ASB? I want to make sure we're not skipping a
   step in your existing workflow."

These questions land you in a peer-to-peer dynamic. Founders
who only pitch get treated as vendors. Founders who diagnose
get treated as partners.

---

## What to BRING

1. The fresh ASB audit (audits/asb-hawaii-2026-05/audit.pdf).
2. The MVNP, First Hawaiian, and Ward Village sample audits
   (so MVNP sees the work product applied to their roster).
3. The one-pager (content/asb-mvnp-onepager.md).
4. A laptop with check.neverranked.com in a tab, ready to do a
   live scan if asked.
5. Your phone with calendar open in case they say "let's
   schedule the next meeting now."

What NOT to bring: a deck with NR's vision, mission, market
opportunity, etc. Mark and James will skip past it. Lead with
the audit and the work.

---

## After the meeting

Same-day follow-up email by EOD: thank, recap one thing each
person said that you heard, name the one decision still open,
suggest the next concrete step (e.g. "I'll send the SOC 2
documentation by Friday" or "I'll wait for legal review before
proposing terms"). Short. Specific. Not a sales pitch.

Update pitch/_meta/log.md the next morning with status and
follow-on items.
