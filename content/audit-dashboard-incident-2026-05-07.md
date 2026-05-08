# Customer Dashboard Audit — May 7, 2026

**Trigger:** Ron McDaniel (Hawaii Theatre Center, our only paying
direct retail customer) reported that every avatar-menu item
loaded a favicon spinner and bounced him back to the dashboard.

**Tone of this document:** This is not a defense of the codebase.
It is an honest accounting of what I saw, what I missed, and
what is still wrong. Ron deserves better than what we shipped.

---

## Part 1 — The fix I just shipped

### What it does

[dashboard/src/index.ts:828](dashboard/src/index.ts:828) used to
redirect every non-explicit path to `/onboarding` for any client
user with `onboarded=0`. The fix adds a whitelist of critical
user-control paths (`/settings`, `/support`, `/billing/*`, the
two invite endpoints) that pass through the gate.

### Is the fix correct?

For the specific symptom Ron reported: yes. He can now reach
Settings and Support. The redirect loop is gone.

### Is the fix complete?

**No.** Ron's underlying goal — "set up some additional users
on our dashboard" — is **not solvable on the current platform**
even after my fix. Here is what I found:

- The teammate-invite UI exists only for agency admins, at
  `/agency/invites`. Direct retail clients (like Hawaii Theatre)
  have no equivalent.
- The Settings page for a client user has these sections only:
  Account (read-only), Billing, Competitors, Google Search
  Console, Email Preferences. Nothing for inviting teammates.
- The codebase has email infrastructure for sending invites
  ([dashboard/src/email.ts:155](dashboard/src/email.ts:155)) but
  it is gated behind agency membership.

So when Ron tries again after my fix, he will reach Settings,
look for the invite UI, find nothing, and write back asking the
exact same question. **The fix unblocks him from the menu, not
from the workflow he was trying to do.**

### What the fix should have included

Either:

- A "Team Members" section on the client Settings page with the
  same invite mechanism agency admins have, scoped to the
  client's slug
- OR a clear note in the Settings page: "To invite teammates,
  contact lance@neverranked.com — we'll send the invite for you"

Right now there is neither. Ron will hit a soft dead-end.

### Other ways the fix could be wrong

- The whitelist is hardcoded path strings. If I rename
  `/settings` to `/account` or `/support` to `/help` later, the
  whitelist breaks silently.
- I did not add a test. There are no tests in the dashboard
  package at all (see Part 3). The fix could regress on the
  next refactor and nobody would know until another customer
  emails.
- I assumed `path.startsWith("/billing/")` covers everything
  billing-related. I did not verify against the actual billing
  routes.

---

## Part 2 — Why this happened

### Root cause of the bug

The onboarding gate at index.ts:828 was written assuming the
only acceptable state for a non-onboarded client is "complete
onboarding before doing anything else." That assumption is
wrong. Non-onboarded clients legitimately need to:

- Reach Support to ask for help
- Reach Settings to update payment or see what they signed up for
- Reach Billing to fix a card decline
- Invite teammates who can help complete onboarding

The gate was designed to push users toward onboarding, but it
ended up locking them out of the very surfaces that would
unblock them when they got stuck on onboarding itself.

### Why I did not catch this when shipping the customer

We onboarded Hawaii Theatre Center to the platform, gave Ron the
login link, and never ran through the actual user flow as Ron
would experience it. There is a "view as client" toggle for
admins ([commit 672a071](https://github.com/lanceroylo/neverranked/commit/672a071))
but I did not use it before going live. Even if I had, the flag
keeps `user.role === "admin"`, which means the onboarding gate
at line 828 would not have fired for me — only for an actual
client account.

In other words: I literally cannot reproduce the bug as the
admin-toggled-to-client-view, because the toggle is cosmetic.
The role gate fires on real role, not viewed role. So even if
I had QA'd before launch, I would have seen Settings work fine.

### Why this slipped through code review

The change came in alongside other onboarding work months ago.
There was no test coverage, no integration smoke test, and no
manual QA pass that exercised "client clicks every menu item
in every onboarded state." It was assumed to work because the
happy path looked right.

---

## Part 3 — Audit of the rest of the dashboard

I went looking for other landmines like this. The list below is
ordered by blast radius.

### S-Tier: customer-facing dead-ends or missing flows

**1. No teammate-invite flow for direct clients.**
Ron's actual problem. Affects every retail Signal customer who
wants to add a colleague. Workaround: manual addition by
admin. Real fix: build a "Team Members" section on the client
Settings page. **Effort: 1-2 days.**

**2. No test coverage on the dashboard worker.**
Zero unit tests, zero integration tests, zero e2e. The package
manifest at `dashboard/package.json` has no test runner installed.
Every change ships on faith that the happy path still works.
This is the single most expensive risk on the platform.
**Effort: 1 week to set up vitest + cover the auth/redirect
matrix at minimum.**

**3. Onboarding gate still over-aggressive for legitimate flows.**
Even with my fix, a non-onboarded client cannot see:
- Their own dashboard at `/`
- Their domain report at `/domain/N`
- Their roadmap at `/roadmap/<slug>`
- The Learn knowledge base at `/learn`

The current logic is "no access to the product until onboarding
is complete." A more humane policy would be "show the product,
flag the onboarding step, but let them browse." Many clients sign
up, see the dashboard, and do onboarding later. We block them.
**Effort: 4 hours to inverter the policy + smoke test.**

### A-Tier: silent gotchas that could trap clients

**4. Hawaii Theatre Center may have `onboarded=0` due to skipped
provisioning step.**
Ron has been a customer for weeks but his user record reads as
unfinished. We probably never set the flag because we skipped the
competitor-suggestion step and went to a call. Other auto-
provisioned customers may be in the same state. Need to query
the DB to confirm. **Effort: 30 minutes for a query + manual
fix on affected accounts.**

**5. The "Getting Started" avatar menu entry is a POST form, not
a link.**
Unusual UX — users expect menu items to navigate, not submit. The
form posts to `/onboarding/checklist/reset` which clears the
dismissed flag and redirects. If the POST fails (CSRF, expired
session, network blip), the user sees nothing happen and has no
recovery path. Convert to a GET link to a route that does the
same thing. **Effort: 30 minutes.**

**6. 2FA redirect chain for admin users.**
[dashboard/src/index.ts:708](dashboard/src/index.ts:708) —
admins without TOTP enrolled get redirected to `/settings/2fa`
on every request. If the enrollment page itself errors, an admin
is locked out of their own dashboard. We do not have a "skip 2FA
this once" or "email me a recovery link" flow.
**Effort: 2 hours to add a recovery path.**

**7. No customer-facing error page.**
Errors in route handlers throw → Cloudflare's default 1000-
series error page → user sees Cloudflare branding. There is no
"something broke, here is the request ID, email us" page. A
customer hitting an exception cannot tell us what they were
trying to do. **Effort: 4 hours to add a global error handler
+ branded error page with X-Request-Id surfaced.**

**8. The "view as client" admin toggle is cosmetic, not
functional.**
[commit 672a071](https://github.com/lanceroylo/neverranked/commit/672a071)
intentionally stopped mutating `user.role` because it broke 211
admin auth gates. The trade-off is that admins now have NO way
to QA the actual client experience. We need a "use client
account" mechanism — either impersonation (with audit log) or a
test client account we use for QA. **Effort: 1 day for impersonation
with audit log; 1 hour for test client + login link.**

### B-Tier: hygiene issues that compound over time

**9. 109 admin role gates in `dashboard/src/index.ts` alone.**
Each one is hardcoded `user.role === "admin"`. No central
authorization layer, no role-aware route registry. Adding a new
role (agency_admin, support, billing) requires touching every
gate. **Effort: 3 days to refactor into a route registry.**

**10. No structured logging on customer journeys.**
We log page views and events to KV but there is no funnel view.
"How many users land on Settings, click Invite, hit a 404" — we
cannot answer this question. We need to. **Effort: 2 days for
basic funnel instrumentation.**

**11. Onboarding completion gate uses a single boolean
(`onboarded`) but the actual onboarding has 3+ steps.**
Adding domains, suggesting competitors, reviewing the first scan.
If a customer completes 2 of 3, they are still treated as
"unfinished" even though they could productively use the
platform. **Effort: 4 hours to refactor into stage-based flag.**

**12. The "LAST STEP" callout in Ron's screenshot is the
`getting-started` checklist, which uses fixed copy.**
If a step is partially complete, the copy still says "last
step." If a customer cannot complete it (because the data does
not exist yet), they see "last step" forever. Need partial-
state copy. **Effort: 2 hours.**

### C-Tier: theoretical risks worth tracking but not urgent

**13. No rate-limit on POST endpoints for client users.**
A buggy client form can hit `/support` or `/settings/emails` in
a loop. Currently no protection. Cloudflare's basic rate-limit
catches catastrophic abuse but not accidental hammering.

**14. Email-link auth tokens have a 15-minute window.**
Reasonable for security but if a customer opens the email an hour
later, the link silently fails. Need a "link expired, request
another" page that explains, not just a 401.

**15. Cancel/pause flow exists at `/settings/cancel` but the
exit-survey table is admin-only.**
We collect the data but cannot share it with the customer ("here
is what you told us when you canceled, want to revisit?").
Compounds churn.

---

## Part 4 — What this means and what to do

### The honest summary

We have one paying retail customer. They reported a basic
navigation bug. The bug existed because we never ran through the
customer's actual flow before going live and we have zero
automated test coverage. The fix unblocks the symptom but does
not solve what they were actually trying to do, because the
feature they wanted (invite teammates) does not exist for direct
retail customers.

This is the kind of gap that does not show up until a customer
hits it. We were lucky Ron emailed instead of churning quietly.

### Immediate (next 24 hours)

1. ✅ Ship the menu-redirect fix (done — commit d2fddd6)
2. **Reply to Ron with the truth:** the menu is fixed, AND we
   do not yet have a teammate-invite UI for direct clients but
   I will add the additional users manually if he sends the
   email addresses. Get on a call with him this week.
3. Query the DB for all client users with `onboarded=0` and
   manually set `onboarded=1` on the ones who have been active
   for >7 days. Hawaii Theatre is one of them.
4. Add a "Team Members" placeholder section to the client
   Settings page with copy: "Need to add teammates? Email
   lance@neverranked.com with their addresses — we will send the
   invites within one business day."

### This week

5. Set up vitest in `dashboard/` and cover at minimum:
   - Onboarding gate redirect behavior for client users
   - Avatar-menu link routing for all four menu items
   - Settings page renders without error for plan='none' users
   - Support form POST submission completes
6. Build the actual teammate-invite flow for direct clients
   (mirroring the agency invites pattern, scoped to client_slug)
7. Add the global error page with X-Request-Id surfaced
8. Refactor the "Getting Started" form button into a GET link

### This month

9. Refactor onboarding gate from "block everything" to "show
   everything, surface the missing step contextually"
10. Add admin impersonation with audit log so we can QA real
    client accounts before launch
11. Set up funnel instrumentation on the critical flows
    (signup → onboarding → first roadmap completion)
12. Cover the auth/2fa matrix with integration tests including
    the recovery path
13. Move the 109 admin role gates into a centralized auth layer

### Next quarter

14. Build the partial-onboarding state model (stages, not a
    single boolean)
15. Add the "view as client" capability properly (real
    impersonation, not the cosmetic toggle)

### Process changes

The bug Ron found was a process failure, not just a code bug.
Going forward:

- **Pre-launch QA checklist:** before any customer goes live,
  walk through every menu item in every nav surface as that
  customer, end-to-end. No exceptions.
- **One-customer-canary policy:** every dashboard change ships
  to staging first, runs a smoke test against a fixed test
  account, and only deploys to production if the smoke test
  passes.
- **Customer-reported bug post-mortems:** every time a customer
  reports something, write a short doc like this one. Most of
  them will surface adjacent issues.

---

## What I want to be clear about

I missed this. The fix I just shipped does not solve Ron's
actual problem. The dashboard has at least 14 other issues of
varying severity that I would not have audited if Ron had not
written in.

We need automated tests, a real QA process, and a humbler view
of what we are confident the platform does. I am writing this
audit so the same kind of incident does not happen the second
time.
