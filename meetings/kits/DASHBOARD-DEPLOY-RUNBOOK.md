# Dashboard worker deploy — runbook

Deploys the `app.neverranked.com` Worker with all the lockdowns
from 2026-05-20 active. Read this before deploying so the impact
on existing customer service is clear.

## What this deploy does

Pushes the locked source state of the dashboard Worker live.
After this deploy, the following endpoints return HTTP 410 (Gone)
or fail with a clear error:

- `GET /checkout/<plan>` — Stripe checkout for any retired tier
- `POST /pulse-waitlist` — new signups for the retired Pulse tier
- `GET /demo/*` — the public demo dashboard (5 handlers)
- `GET /reddit-faq/<slug>` — public Reddit FAQ deployment pages
- Audit delivery (generateAndStoreAudit, sendAuditDeliveryEmail,
  deliverAuditOnCheckout) throws on invocation
- Audit template builders throw on invocation
- Preview generator throws on invocation
- Output grader throws on invocation
- Nurture drip cron returns early with a log line

## What still works after deploy

- **Existing customer billing.** Stripe webhooks (renewals, payment
  events, cancellations), the billing portal, and existing
  subscription state are untouched.
- **Citation tracking.** The customer dashboard for existing
  citation-tracked clients keeps rendering. The upsell language to
  dead tiers was surgically edited out.
- **Magic link auth, session management, account routes.**
- **The free-dashboard route.** The upsell block was rewritten to
  point at the new pricing and a mailto. The score-display logic
  is unchanged.
- **Entity audit embed at `/embed/entity-audit`** — already
  honesty-updated previously, still shows "off-site brand
  authority only, not a citation predictor."

## What breaks for existing customers after deploy

- **Monthly audit deliveries.** Any cron job that calls
  generateAndStoreAudit, sendAuditDeliveryEmail, or
  deliverAuditOnCheckout will throw. If there are active customers
  on a monthly audit cadence, they will not receive their next
  audit email. They will not be billed differently. Their dashboard
  still works.
- **New audit purchases.** If anything points a customer at
  `/checkout/audit`, they get a 410 with a redirect-to-email
  message.
- **Nurture drip emails.** Cron-triggered nurture follow-ups stop
  going out. Prospects in the nurture sequence go silent.

## Pre-deploy checklist

1. **How many active paying customers do we have?** Memory note
   says "profitable on first paying client." If the count is 0-5,
   this deploy is low-blast-radius. If it is higher, consider:
   - Personally emailing each customer about the rebuild before
     they hit a broken audit email next cycle.
   - Or holding the deploy until customers are migrated to the new
     research-engagement scope.
2. **Is anyone in a Stripe-paid in-flight transaction right now?**
   The webhook handler stays alive, so completed payments still
   process. But a customer who is mid-checkout when the deploy
   lands will see the 410. Low probability if traffic is low.
3. **Does any active marketing point at `/demo/`?** The demo route
   was indexed by Google as `app.neverranked.com/demo/domain` etc.
   Post-deploy, those URLs return 410. Google drops them on its
   own cycle. Live URLs in cold email or social need updating.
4. **Are the migrations clean?** If there are pending D1
   migrations in `migrations/` that have not been applied, this
   deploy might fail or apply them. Check the migrations folder
   before pushing.

## Deploy command

From the `dashboard/` directory:

```sh
cd /Users/lanceroylo/Desktop/neverranked/dashboard
npm run deploy
```

That runs `wrangler deploy` against the `neverranked-dashboard`
Worker config in `wrangler.jsonc`.

## Verify after deploy

Run these in order. All should return as described.

1. `curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/checkout/pulse` → expect **410**
2. `curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/demo/domain` → expect **410**
3. `curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/reddit-faq/anyslug` → expect **410**
4. `curl -s https://app.neverranked.com/embed/entity-audit?brand=Test&domain=example.com | head -5` → expect HTML response (still working)
5. `curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/` → expect **200** (homepage of app, still working)

If any of those return unexpectedly, roll back with `wrangler
rollback` from the dashboard directory.

## Rollback

```sh
cd /Users/lanceroylo/Desktop/neverranked/dashboard
wrangler rollback
```

That reverts to the previously-deployed version, which is the
pre-lockdown state. Doing so re-enables the killed-product routes.
Only roll back if customer impact is worse than expected.

## After deploy, before forgetting

- Email any active paying customers individually about the rebuild
  and what changes for them.
- Update any marketing material outside this repo that still
  points at `/demo/`, `/checkout/<plan>`, or `/reddit-faq/<slug>`.
- Once the new Stripe Price IDs exist for $4,500 kickoff and
  $1,500/mo retainer, rewire the PLANS table in
  `routes/checkout.ts` and remove the throws.
- Once the CANONICAL_FACTS draft is reviewed and locked, rewrite
  the generator and grader and remove their throws.
