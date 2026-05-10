---
title: "Free monitoring tier, design spec"
author: Lance + Claude
date: 2026-05-09
status: working draft, decision pending
---

# Free monitoring tier

A standing free product surface that captures email at the top of
the funnel, demonstrates NR's measurement chops weekly without
exposing the paid moats, and ships in under two engineering days.

## Why this exists

Today NR has two surfaces for non-customers:

1. **check.neverranked.com** -- one-shot AEO score with no
   authentication, no signup, no return path. Anonymous users
   bounce.
2. **app.neverranked.com** -- gated paid product. Full features,
   no free tier inside.

That gap is wasted demand. Someone who runs a one-shot scan and
sees a B-grade has no reason to come back next week. Someone who
sees a D-grade has no path to fix it without giving NR a credit
card. The free monitoring tier is the bridge: weekly scores on
one domain, indefinitely, in exchange for an email.

The acquisition target is anyone running a check.neverranked.com
scan today. Conversion target: free users become paid users when
the citation_runs gap or schema deployment work crosses the
"this is more than I want to do myself" threshold.

## What's free vs. what's paid

| Feature | Free | Paid |
|---|---|---|
| Weekly AEO scan, one domain | Yes | Yes (multi-domain) |
| Score history (12 weeks rolling) | Yes | Yes (full history) |
| Email when score changes ±5pts | Yes | Yes |
| The State of AEO digest block | Yes | Yes |
| Schema validator (one-shot) | Yes | Yes |
| Citation tracking (multi-engine) | No | Yes |
| Citation gap analysis + briefs | No | Yes |
| Schema deployment via snippet | No | Yes |
| Roadmap with citation_gap items | No | Yes |
| White-label / agency mode | No | Yes |
| Reverse-engineer competitor citations | No | Yes |
| llms.txt + agent-readiness audits | No | Yes |
| Hawaii Theatre-style support | No | Yes |

The wedge: free users never see citation data. Citations are the
expensive part (multi-engine queries, accumulating subrequest
budget) and the most differentiated paid feature. Schema
deployment via snippet is paid because it's the high-margin
product. Everything cosmetic ships free.

## Free user flow

1. User lands on neverranked.com or check.neverranked.com.
2. Runs an anonymous one-shot scan as today.
3. After scan: "Get this weekly. One email." Email capture.
4. Magic-link auth (no password). Existing dashboard auth pattern.
5. Dashboard at app.neverranked.com/free shows:
   - Current score for the registered domain
   - 12-week sparkline (zero data initially, fills as scans
     accumulate)
   - The State of AEO digest block (same payload as paid users)
   - One CTA: "Add citation tracking" -> upgrade flow
6. Weekly cron: Monday scan, Tuesday email if score changed.

The free dashboard is intentionally narrow. One domain, one chart,
one number, the industry digest. No sidebar, no roadmap, no
multi-tab nav. The narrowness is the design -- it makes the paid
upgrade obviously bigger.

## Upgrade triggers

Three explicit upgrade prompts in the free dashboard, each tied to
a real moment:

1. **Score drops below 60.** "Your score dropped to 58. The
   roadmap can fix this. Start the trial."
2. **Score has been flat for 6 weeks.** "Your score has not
   changed in 6 weeks. Citation tracking surfaces what's actually
   blocking it."
3. **The State of AEO digest mentions a category-relevant source
   type.** Example: free user is in r/Hawaii and the latest report
   highlights a Hawaii citation gap. "Your category had a 0.94
   priority Reddit gap last week. Start tracking."

No "FREE TRIAL ENDS IN 7 DAYS" pressure tactics. The free tier is
permanent. The paid tier is differentiated enough that the
upgrade decision is "this is more than I want to do myself," not
"my free thing is about to expire."

## Implementation sketch

### Schema additions (D1)

One new table, two new columns on existing tables:

```sql
-- 0069_free_tier.sql
CREATE TABLE free_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  last_scan_at INTEGER,
  email_alerts INTEGER DEFAULT 1,
  unsub_token TEXT NOT NULL UNIQUE,
  upgraded_to_user_id INTEGER REFERENCES users(id)
);
CREATE INDEX idx_free_users_domain ON free_users(domain);
CREATE INDEX idx_free_users_unsub ON free_users(unsub_token);

-- One column on scan_results so the cron can scope queries
ALTER TABLE scan_results ADD COLUMN free_user_id INTEGER
  REFERENCES free_users(id);
```

Free users are intentionally not in the `users` table. Different
shape (no role, no client_slug, no agency), different lifecycle
(weekly scan only, no auth-token machinery), and putting them in
a separate table makes the paid upgrade path explicit (insert
into users, set free_users.upgraded_to_user_id, scan_results
join now resolves both ways).

### Routes

```
POST /free/signup          -> create free_user, send magic link
GET  /free/auth?token=...  -> verify magic link, set cookie
GET  /free                 -> render free dashboard (auth gated)
POST /free/scan            -> trigger one-off rescan (rate-limited)
GET  /free/unsubscribe?token=... -> opt-out without auth
POST /free/upgrade          -> stripe checkout to paid plan
```

Rate limits: free /free/scan capped at 1/day per user. Weekly
auto-scan via the existing Monday cron, scoped to free_users with
`email_alerts = 1`.

### Email pipeline

Reuses the existing `sendDigestEmail` infrastructure with a
trimmed `digests` array (one domain) and the State of AEO block
already wired up. New subject template: "Your AEO score this week:
$N/100" with delta if applicable.

Estimated incremental Workers cost: at 1k free users, weekly
scans add ~150 subrequests each = ~150k subrequests/week. Within
the existing weekly budget profile. No infra concerns.

## Launch criteria

The free tier must clear these gates before launch:

1. The State of AEO digest block must already be in the paid
   weekly digest (shipped tonight, 2026-05-09).
2. Magic-link auth must be tested end-to-end. The existing
   `/admin/free-check` route is the closest precedent and works.
3. Stripe upgrade flow must hand off email + domain so the new
   user record links to the existing free_user record.
4. The free dashboard must render correctly with zero scan history
   (first-week experience).
5. The unsubscribe path must work without authentication.

Estimated build: 1-2 engineering days. Most of the heavy lifting
is wiring existing primitives.

## What this is NOT

- Not a free trial of the paid tier. Free is permanent.
- Not a developer API. Programmatic access stays paid.
- Not a public AEO score lookup ("look up any domain's score
  without auth"). That would commoditize the score. Free users
  see only the domain they registered.
- Not a way to track competitors. Free is one domain, the user's
  own.

## Risk and mitigations

**Risk: Free users never upgrade.** The economic case for the free
tier still works because (1) email captures feed nurture
sequences, (2) the State of AEO digest reaches free inboxes
weekly with category-relevant industry data, (3) free users
become evangelists who refer paying customers. But if 12 months
out the upgrade rate is below 2%, the free tier needs to be
scoped tighter (e.g. 4-week limit on score history).

**Risk: Free tier abuse.** Someone signs up 100 free accounts to
get 100 weekly scans for free. Mitigations: domain-uniqueness
constraint (one free account per domain), email verification
required, rate-limit the signup endpoint. If abuse becomes real,
add CAPTCHA on signup.

**Risk: Free tier cannibalizes consulting work.** Anyone doing
agency work for clients who would have bought the free product
might lose footing. Mitigation: agency Mode-2 tier already covers
this -- agencies sign up clients under their own slug and get
white-label dashboards. The free tier is for direct end-user
acquisition only, not for resold use.

## Open questions for Lance

1. **Should the free tier be branded "Free" or under a softer
   name** ("Pulse", "Watch", "Standing")? Matters for messaging.
   My recommendation: just say "Free" and treat it as standing
   product, not a tier.
2. **One domain forever, or one domain per 90-day window so
   users can switch?** My recommendation: one domain forever
   (simpler), upgrade allows switching.
3. **Email cadence: weekly digest only, or also one-off score-
   change alerts?** My recommendation: weekly digest is the floor;
   add a same-day alert when score drops by 10+ points.
4. **Public score history page** (optional toggle, free users can
   make their score history visible to anyone via a shareable
   URL)? My recommendation: yes, opt-in. Creates organic SEO and
   social proof when good scores share publicly.

## Decision points

Lance picks: ship as designed, ship with modifications (which?),
or defer.

If shipped as designed, the implementation order is:

1. Migration 0069 (free_users table + scan_results column)
2. POST /free/signup + magic-link auth
3. GET /free dashboard (read-only)
4. Weekly cron extension to scan free_users domains
5. Email pipeline wiring (reuse sendDigestEmail with trimmed
   digests)
6. Stripe upgrade hand-off
7. Public landing page copy at /free or as an overlay on the
   homepage

Total: 1-2 engineering days. Stays in dashboard repo. Schema
migration coordinates with the parallel window via the handoff
doc (next migration number is 0069).
