# Client onboarding SOP

How a NeverRanked engagement actually runs from kickoff through day 30. The document covers what work gets handled automatically by the snippet, what work is hybrid (client provides data, we inject), what work requires the client's dev team or CMS edits, and the compliance + approval mechanics.

This SOP is referenceable for:

- New direct clients (Signal or Amplify)
- Agency partners taking a client through the reseller path
- Internal ops / future contractors

It is NOT a sales document. It assumes the client has already engaged. For pre-engagement positioning, see `EXPLAINER.md` (direct customers) and `AGENCY-EXPLAINER.md` (agency partners).

---

## The three classes of work

Every audit produces three classes of findings, and we name them in the kickoff so the client and the agency understand effort split before week one starts.

**1. Snippet-automated.** We ship the work end-to-end. Client installs the one-line schema injection snippet in the `<head>` of their site. From there, schema fixes deploy via the dashboard with no further engineering work on the client's side. This is the majority of the work for most clients.

**2. Hybrid.** We need source data from the client. The client (or their agency) provides the data; we generate, gate, and inject the schema. Common examples: `Person` schema for advisors, `AggregateRating`, custom `Service` schemas with proprietary product details.

**3. Source-side.** The client's dev team or CMS must touch the page directly. The snippet cannot help here because the issue is in the existing page source, not missing schema. Common examples: malformed JSON-LD blocks that need to be removed, hardcoded meta tags that need updating, server-side redirects.

The audit document delivered to the client should classify every finding into one of the three classes so expectations are right at kickoff.

---

## Week 1 — kickoff

### Day 1 — kickoff call (45-60 minutes)

Attendees: client point-of-contact, agency point-of-contact (if applicable), NeverRanked.

Agenda:

- **Confirm scope.** Which pages, which subdomains, which AI engines (the default seven are ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, and Gemma. Confirm anything additional).
- **Confirm queries.** The client tells us which 10-20 queries matter most. Default: the audit defaults if the client has no preference. For a bank: mortgage research, business banking switch, branch locator, "best Hawaii bank for X". For a venue: live shows, "what's on tonight," reservation booking. For a SaaS: comparison queries, pricing, alternatives.
- **Install the snippet.** Hand off the snippet URL — `<script src="https://app.neverranked.com/inject/<client_slug>.js" async></script>` — for the client's CMS team or developer to drop into the `<head>` of every page. Same snippet across all pages on the same domain. For multi-domain clients (e.g. `mortgage.asbhawaii.com` as a separate subdomain from `asbhawaii.com`), each domain needs its own one-line install.
- **Designate approvers.** Single point-of-contact at the client (or agency) who approves schema batches before they go live. Compliance approver, if separate.
- **Compliance pre-check.** Identify any schema types that need compliance review before injection. Most commonly: `AggregateRating`, `Person` (in regulated industries), industry-specific claims schemas.
- **Calendar the cadence.** Weekly status (15 min, async if preferred). Monthly review (30 min, on a screen-share). Quarterly drift detection check-in.

Output: a kickoff summary document the client can forward internally with the scope, the approvers, and the next-week milestones.

### Day 2-5 — automated wins land

While the client gathers data for the hybrid work, we ship every snippet-automated fix from the audit. These don't need additional input from the client beyond the snippet install.

Typical automated wins from a fresh audit:

- Entity classification fixes (e.g., promoting a homepage from `Organization` to `BankOrCreditUnion`, `LocalBusiness`, `NightClub`, `Restaurant`, `SoftwareApplication`)
- Site-wide breadcrumb consistency
- Per-page product schemas on zero-schema pages (`FinancialProduct`, `Product`, `Service`, `Course`, etc., as appropriate)
- Branch / location schemas with geo coordinates and hours (when the client provides the location data, this becomes hybrid; when public address data is sufficient, it can be automated)
- Article / BlogPosting schema on content pages
- FAQ schema on Q&A-format pages

Each schema is graded against our completeness manifests before deploy. Anything below 60 is blocked from deploy. The client sees every approved schema in the dashboard before it injects.

These quick wins are deliberate. They show momentum in the first week, give the client a tangible "things are happening" signal, and build the trust needed for the hybrid work that takes longer.

---

## Hybrid work playbook

### Person schema (advisors, loan officers, branch managers, specialists, authors)

#### Why it matters

CMU GEO research shows ~2.3x AI citation lift on content with named-author signals. For service businesses, named advisors are also the entry point AI engines surface for "who should I talk to about X" queries. A `Person` node with just `{"@type": "Person", "name": "Jane"}` passes presence-only checks but doesn't anchor authority. The grader scores Person nodes against required + recommended fields (`url`, `sameAs`, `jobTitle`, `worksFor`, `image`, `description`).

#### Data we need from the client

A spreadsheet (Google Sheet or CSV) with one row per individual:

| Column | Required | Notes |
|---|---|---|
| `full_name` | yes | Exactly as the client uses publicly |
| `job_title` | yes | Exact wording from the website |
| `profile_url` | yes | The URL on the client's site where this person is profiled. We inject the schema on this URL. |
| `photo_url` | strongly recommended | Publicly accessible URL. Test in browser before submitting. |
| `linkedin_url` | recommended | If individual hasn't opted out |
| `description` | recommended | One-line specialty / bio |
| `license_or_credential` | as needed | NMLS#, FINRA, state license, certification — for regulated roles |
| `languages_spoken` | optional | Useful for "advisor speaking [language]" queries |
| `opt_out` | yes | Flag any individual who has opted out of structured-data syndication |

#### Compliance pre-check questions

- Are there any individuals whose profile is not approved for structured-data syndication?
- For roles requiring license display (mortgage loan officers, financial advisors), should the license number be in the schema, or display-only on the page?
- Photo usage rights — confirm photos can be syndicated to schema.org consumers.
- Does the client's brand team need to review job title wording before deploy?

#### Process

1. Client (or agency) builds the spreadsheet and shares with us.
2. We generate `Person` JSON-LD nodes, one per row, gated by the `opt_out` column.
3. Compliance / brand approver reviews the markup (single batch review, not per-person).
4. Approved batch deploys via snippet.
5. Maintenance: client emails us when an individual joins, leaves, or changes title. We update the schema within 24 hours.

#### Common gotchas

- **Photo CORS / 403s.** Photos served from non-public CDNs sometimes 403 to AI engines. Test 1-2 photos in an incognito browser before going wide.
- **Opt-outs.** Honor every opt-out without question. Document the opt-out so it doesn't accidentally get reversed in a future batch.
- **License numbers.** Mortgage loan officers in many states must display NMLS# publicly. ASB compliance will know — ask if the license number should be in the schema, the visible page, or both.
- **Maintenance cadence.** Designate a single point-of-contact for advisor changes. Without one, the schema goes stale and the dashboard's `Person` completeness score drops.

---

### AggregateRating

#### Why it matters

When customers ask AI engines "is [client] worth it" or compare the client to alternatives, the engines pull rating data from external sources (Google Business Profile, Yelp, Tripadvisor, etc.) the client does not control. Each source can have different scores, sample sizes, and reviewer demographics; AI engines split the difference, and the resulting narrative is whatever external source weights heaviest. With `AggregateRating` schema published on the client's own site, the rating they stand behind becomes a canonical signal.

#### Why it's higher-stakes than Person schema

`AggregateRating` is effectively a marketing claim being syndicated to AI engines. Regulated industries (banking, healthcare, legal) often have specific rules about advertising claims. The rating must be substantiated. A bank publishing "4.7★" needs to be able to defend that number to a regulator if asked. About a third of regulated-industry clients we've talked to have a blanket no-AggregateRating policy. **That's fine. The implementation roadmap survives without it. Do not push.**

#### Compliance pre-check questions (ask BEFORE generating any markup)

1. **Is publishing AggregateRating schema approved?** Some clients decline entirely; others approve subject to disclaimer language.
2. **Which review source is the canonical one?** Options:
   - Google Business Profile (most common, easiest to defend)
   - Yelp
   - Trustpilot
   - Internal NPS / customer satisfaction data
   - Aggregated multi-source (requires defensible methodology)
3. **Are per-product ratings needed?** One overall rating, or separate ratings per product line? Per-product is more accurate but multiplies maintenance.
4. **Refresh cadence?** Monthly, quarterly, on-demand? Continuous syncing is technically possible if the source has an API.
5. **Any required disclaimer text?** Schema can't carry disclaimer copy, but the visible page can.
6. **What's the current rating + review count from the chosen source?** We need both. AggregateRating without `reviewCount` fails grader threshold.

#### Process

1. Client compliance answers the six questions above. Document the answers.
2. We generate the `AggregateRating` markup.
3. Compliance reviews the final markup (often a re-review even if they approved the concept).
4. Approved schema deploys via snippet.
5. Maintenance: refresh on the agreed cadence. We'll set up the source feed if the source has an API; otherwise the client emails us updated numbers on schedule.

#### Common gotchas

- **Mediocre ratings.** If the client's canonical rating is below their target (e.g., 3.7★ where they want to project 4.5★), surfacing it may hurt the citation narrative rather than help. This is a strategic call the client has to make. Be honest with them: surfacing a soft rating might lower AI citation rates rather than raise them. Better to skip than to ship a number that backfires.
- **Multi-source aggregation methodology.** If the client wants "4.6★ across 1,200 reviews from GBP + Yelp + Trustpilot", the aggregation methodology needs to be documented and defensible. Easier to start single-source.
- **Disclaimer language.** Some compliance teams want a tooltip / footnote text accompanying any rating. The schema itself can't carry that text, but the visible page can. Defer to the client's brand standards.
- **Banking-specific.** FDIC and state banking regulators may have opinions on which rating sources can be syndicated. Defer to the client's legal team.

---

## Source-side work playbook

Some audit findings cannot be fixed by the snippet because the issue is in the existing page source, not missing schema. The most common cases:

### Malformed JSON-LD blocks

The grader's overall score is weighted as `0.6 × min(node_scores) + 0.4 × mean(node_scores)`. A single broken JSON block can drag a page from a 95 to a 33, putting it in the 18pp partial-schema citation penalty zone. The snippet only **adds** schema. It cannot remove or repair existing JSON-LD that's already in the page source.

**Process:**

1. We identify the malformed block in the audit (the dashboard shows which page, which block, which JSON parse error).
2. Client's dev or CMS team locates the source of the malformed block (often a CMS plugin output, a stale theme template, or a copy-paste from an outdated example).
3. Dev team either fixes or removes the broken block. Either action exits the penalty zone.
4. Within hours, the next scan confirms the fix. Page should jump from red back into green.

**Time estimate.** Usually 30 minutes to 2 hours of dev time once the responsible developer is identified. The longest part is finding which CMS plugin or theme is generating the bad block.

### Duplicate canonical tags

If a page ships multiple `<link rel="canonical">` tags pointing to different URLs, AI engines pick one heuristically and may not pick the one the client wants. The snippet cannot remove existing canonical tags. Source-side fix.

### Hardcoded incorrect meta tags

Wrong title, missing description, broken `og:image` paths. Source-side fix. The snippet doesn't manage `<meta>` tags.

### Server-side redirects to 404 pages

Out of scope for AEO. Send to a regular technical SEO team to fix.

---

## Compliance + approval mechanics

### Approval gates in the dashboard

Every schema injection is gated on `status = 'approved'` in the database. The snippet only serves schemas marked approved. The dashboard provides:

- A pending-review queue showing every generated schema awaiting approval
- Per-batch approval (typical for advisor lists, AggregateRating, content schemas)
- Per-page approval (typical for one-off product or service schemas)
- Rollback in one click — flips `status` back to `draft` and the schema stops serving on the next snippet load (within ~1 hour, the snippet's cache TTL)

### Compliance review process

For regulated-industry clients (banking, healthcare, legal), the recommended flow:

1. We generate the schema markup
2. We export the markup as a single JSON document (one per page)
3. Client compliance reviews the JSON exports
4. Compliance approves in writing (email is fine; we save the approval log on our side)
5. We mark the schema approved in the dashboard
6. The snippet starts serving on the next cache cycle

### Audit trail

Every schema deployment is logged with:

- Who approved it (email address)
- Timestamp
- The exact JSON-LD payload as deployed
- The page(s) it ships on
- Any subsequent rollbacks

Exportable to CSV for compliance archiving.

---

## The 30-day milestone view

What the client sees by the end of week 4 if everything has gone well:

- All snippet-automated fixes deployed (typically 60-80% of audit findings)
- Person schema deployed for the advisor batch the client provided
- AggregateRating deployed (if compliance approved)
- Source-side fixes coordinated with the client's dev team
- The dashboard shows weekly citation tracking across the agreed engines + queries
- The Monday digest is in their inbox under their (or their agency's) brand

Beyond day 30, citation tracking is the primary signal. Schema work has shipped; AI engines are absorbing the changes during their training cycles. Day 60-90 is when citation share starts visibly moving in the dashboard.

The 90-day mark is the first natural review point. We use it to:

- Confirm the citation share lift the audit predicted is showing up
- Identify any queries that are still surfacing competitors
- Plan the next quarter's roadmap based on drift detection

---

## When something doesn't go to plan

### The client never installs the snippet

Without the snippet on the page, none of the snippet-automated work can ship. Symptom: the dashboard shows scans succeeding but no fields the snippet can serve.

**Action:** unblock the install. Common blockers:
- Their CMS team hasn't been looped in
- A security review wants to see the snippet source first (point at neverranked.com/security and the public repo)
- Their development team has a deploy freeze
- They forgot

Reach out to the agency or the engagement champion. Don't let an install delay turn into a full month of stalled work.

### Hybrid data doesn't arrive

Symptom: kickoff happened, advisor data was promised, two weeks have passed, no spreadsheet.

**Action:** offer to pre-populate the spreadsheet from the public site for the client to validate. Reduces their lift from "create a list" to "review and approve a list." This is usually the unblocker.

### Compliance declines AggregateRating

This is fine. Drop it from the roadmap, document the decision, move on. The implementation survives without it. The audit document should never have promised AggregateRating as a guaranteed deliverable; it should have been listed as conditional on compliance approval.

### Source-side fix never happens

Symptom: the malformed JSON-LD block on a high-LTV page is still there 60 days into the engagement.

**Action:** offer a workaround in the schema. We can inject a corrected version of the schema alongside the broken one. This doesn't fully fix the penalty (AI engines may still see the malformed one) but it's better than nothing while the dev team gets to it. Be honest in the dashboard that this is a workaround, not a fix.

### Client wants to cancel

Honor the cancellation per the engagement terms. Snippet removal is one paste — the client deletes the `<script>` tag from their site head and our deploys stop reaching them. Their dashboard data is exported and handed over. No retention games.

---

## Reference URLs

| Asset | URL |
|---|---|
| Public security page | https://neverranked.com/security/ |
| Public schema scorer | https://check.neverranked.com |
| Source-available codebase | https://github.com/lanceroylo/neverranked |
| Snippet generator code | https://github.com/lanceroylo/neverranked/blob/main/dashboard/src/routes/inject.ts |
| Agency partnership page | https://neverranked.com/agencies/ |
| Internal kit / nav index | https://neverranked.com/kit/ |
