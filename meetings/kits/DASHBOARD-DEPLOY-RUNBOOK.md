# Dashboard worker deploy — runbook

Deploys the `app.neverranked.com` Worker with the post-retraction
source state active. Read this before deploying so the impact on
existing customer service and prospect-facing flows is clear.

Updated 2026-05-21 after the grader + preview generator rewrites
landed in source. The deploy is now a meaningfully different
event than it was when the runbook first shipped: the prompt
rewrites are real, the throws are off the live generation path,
and the deploy ACTIVATES new behavior rather than only shutting
down old behavior.

## What this deploy does (the headline)

ACTIVATES the rewritten preview generator and output grader. New
preview pages get generated against the research-engagement
positioning. The grader now enforces the new CANONICAL_FACTS
(retraction-first, 5+2 engine split, $4,500 + $1,500/mo pricing,
HTC capability surfaces only, no 45-to-95 causation claim).

CONTINUES TO BLOCK the killed-product flows that have no
rewrite yet: audit deliveries, demo dashboard, Reddit FAQ public
deployments, checkout for retired SKUs, Pulse waitlist, nurture
drip.

## What activates post-deploy (the new behavior)

- `generatePreview` runs against the rewritten SYSTEM_PROMPT.
  Outputs lead with the retraction, reference the 5+2 split,
  use HTC as a capability reference only, name the new pricing.
  Throw guard removed.
- `gradeProspectOutput` runs against the rewritten
  CANONICAL_FACTS. Rejects retired-SKU references, rejects the
  Hawaii Theatre 45-to-95 causation claim, requires the 5+2
  split whenever "seven engines" is claimed.
- Free-dashboard upsell block (`routes/free-dashboard.ts`) now
  displays the new pricing ($4,500 kickoff + $1,500/mo per
  category) with a mailto, not the killed Pulse/Signal upgrade
  forms.

## What continues to fail post-deploy

These endpoints still return HTTP 410 or throw with a clear
error. They are NOT rewritten yet because the underlying flows
are killed under the new product and no rebuild has been done.

- `GET /checkout/<plan>` — no Stripe Price IDs for the new
  $4,500 + $1,500/mo SKUs yet. PLANS table still references
  retired tiers. Returns 410.
- `POST /pulse-waitlist` — Pulse is a killed tier. Returns 410.
- `GET /demo/*` — public demo pitched the killed product. All
  five demo handlers return 410.
- `GET /reddit-faq/<slug>` — Reddit FAQ auto-deploy is killed.
  Returns 410.
- `generateAndStoreAudit`, `sendAuditDeliveryEmail`,
  `deliverAuditOnCheckout` — the audit deliverable structure
  is built on the dead AEO-score methodology. Throws.
- `buildAuditTemplate`, `buildAuditTemplateWithCache` — audit
  template body contains dead pricing and methodology. Throws.
- `sendNurtureDripEmails` — drip culminates in the dead $750
  audit soft-sell. Returns early with log line.

## What stays alive post-deploy (no change)

- **Existing customer billing.** Stripe webhooks (renewals,
  payment events, cancellations), the billing portal, and
  existing subscription state are untouched.
- **Citation tracking dashboard.** Existing customers with
  active citation tracking keep seeing their dashboard. The
  upsell language to dead tiers was surgically edited out;
  the data layer is unchanged.
- **Magic link auth, session management, account routes.**
- **Entity audit embed** at `/embed/entity-audit` — already
  honesty-updated previously ("off-site brand authority only,
  not a citation predictor").
- **Free-dashboard scoring logic.** Only the upsell block was
  edited; the score-display logic is unchanged.

## Pre-deploy verification (recommended, ~5 minutes)

Now that the generator and grader are live in source, eyeball
a generated artifact locally before pushing to prod. Use one of
the dashboard's local test scripts if one exists, or:

1. Pull the dashboard repo, run any local dev environment
   (`npm run dev` or equivalent — check `package.json`).
2. Invoke `generatePreview` with a sample PreviewInput.
3. Eyeball the output. Verify:
   - The retraction appears in the body.
   - The 5+2 engine framing appears whenever "seven engines"
     is referenced.
   - The pricing line says "$4,500 kickoff per category,
     $1,500 a month after."
   - Hawaii Theatre is described in capability terms only
     (Charity Navigator 2023, BBB 1999, missing Bing Profile,
     authority backlinks, meta description rewrites). The
     45-to-95, ten-days, 14-of-19 framings are absent.
4. Optional: invoke `gradeProspectOutput` on the generated
   artifact. Confirm it returns verdict "pass" or, if it
   fails, that the issues list points at something real.

If the sample looks wrong, do not deploy. Fix the prompt or
the fact list first.

## Pre-deploy customer-impact checklist

1. **How many active paying customers do we have?** If 0-5,
   blast radius is low. If higher, consider personally emailing
   each customer about the rebuild before they hit a broken
   audit email next cycle.
2. **Any cron-scheduled audit deliveries firing soon?** Audit
   delivery throws after deploy. Affected customers will not
   receive their next audit email.
3. **Any cold outreach in flight?** The outreach worker is a
   SEPARATE Worker (neverranked-outreach repo). This dashboard
   deploy does not affect that pipeline. If you want the
   outreach generator + grader rewrites live too, you also
   deploy that Worker from its own directory.
4. **Is anyone in a Stripe-paid in-flight transaction right
   now?** Webhook handler stays alive, so completed payments
   still process. Mid-checkout traffic sees the 410.

## Deploy command

From the `dashboard/` directory:

```sh
cd /Users/lanceroylo/Desktop/neverranked/dashboard
npm run deploy
```

That runs `wrangler deploy` against the `neverranked-dashboard`
Worker config in `wrangler.jsonc`.

For the outreach worker (separate concern, separate Worker):

```sh
cd /Users/lanceroylo/Desktop/neverranked-outreach/worker
# check the package.json scripts for the deploy command,
# typically `npm run deploy` or `wrangler deploy`
```

## Verify after deploy

Run these in order. All should return as described.

1. `curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/checkout/pulse` → expect **410**
2. `curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/demo/domain` → expect **410**
3. `curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/reddit-faq/anyslug` → expect **410**
4. `curl -s https://app.neverranked.com/embed/entity-audit?brand=Test&domain=example.com | head -5` → expect HTML response (still working)
5. `curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/` → expect **200** (homepage of app, still working)
6. Generate a new preview through whatever workflow normally
   triggers preview generation (test prospect or admin
   endpoint). Confirm the preview body leads with the
   retraction and references the new pricing.

If any of those return unexpectedly, roll back with `wrangler
rollback` from the dashboard directory.

## Rollback

```sh
cd /Users/lanceroylo/Desktop/neverranked/dashboard
wrangler rollback
```

That reverts to the previously-deployed version, which had the
throws active. Doing so disables the new generator + grader,
re-enables the old throws. Customer impact reverts.

Only roll back if a generated artifact ships something
materially wrong that the rewritten grader did not catch.

## After deploy, before forgetting

- Email any active paying customers individually about the
  rebuild and what changes for them.
- Update any marketing material outside this repo that still
  points at `/demo/`, `/checkout/<plan>`, or `/reddit-faq/<slug>`.
- Mint new Stripe Price IDs for $4,500 kickoff and $1,500/mo
  retainer, rewire the PLANS table in `routes/checkout.ts`,
  remove the throws on handleCheckout and handlePulseWaitlist.
- Decide whether the audit deliverable has any future under the
  new product. If yes, rewrite buildAuditTemplate and unlock
  the audit-delivery functions. If no, leave them throwing and
  remove the dead code in a later cleanup pass.
- Decide whether the demo dashboard should be rebuilt with
  research-engagement content. If yes, rewrite the renderPage
  helpers and unlock the demo handlers.
- Pull the second category (dental_honolulu) into the moat
  aggregate once API keys are funded and `run-dental-honolulu.mjs`
  is executed three times for pattern-readiness.
