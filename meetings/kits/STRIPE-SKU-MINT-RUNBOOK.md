# Stripe SKU mint runbook

When Lance is ready to start taking real payments under the
research-engagement product, this is the runbook.

The code is already prepped. The only thing required is two new
Stripe Price IDs and a 2-line PLANS table edit in
`dashboard/src/routes/checkout.ts`.

## Step 1: Mint the Stripe Prices

Log into Stripe dashboard. Create two new Prices under the
existing NeverRanked Stripe account.

### Price A: Kickoff

- **Product:** NeverRanked Kickoff (create new product if not
  already there)
- **Pricing model:** Standard pricing
- **Price:** $4,500.00
- **Billing period:** One time
- **Currency:** USD
- **Tax behavior:** Inclusive (or your standard)
- **Description (optional):** $4,500 kickoff per category.
  One-time fee covering 3 weeks of daily measurement across
  the seven AI surfaces, competitive cohort analysis,
  source-type analysis, research memo, and prepped punch list.

Copy the resulting `price_xxxxxxxxxxxxxxxxxxxxx` ID.

### Price B: Retainer

- **Product:** NeverRanked Retainer (create new product if not
  already there)
- **Pricing model:** Standard pricing
- **Price:** $1,500.00
- **Billing period:** Monthly
- **Currency:** USD
- **Tax behavior:** Inclusive (or your standard)
- **Description (optional):** $1,500/month per category.
  Ongoing daily measurement, monthly delta memo, drift
  monitoring, punch list refreshes.

Copy the resulting `price_xxxxxxxxxxxxxxxxxxxxx` ID.

## Step 2: Wire the Price IDs into the code

Edit `dashboard/src/routes/checkout.ts`. Find the kickoff and
retainer entries in the PLANS table:

```ts
kickoff: {
  name: "NeverRanked Kickoff",
  priceLabel: "$4,500",
  mode: "payment",
  priceId: "",          // <-- paste Price A here
  comingSoon: true,     // <-- flip to false
},
retainer: {
  name: "NeverRanked Retainer",
  priceLabel: "$1,500/mo per category",
  mode: "subscription",
  priceId: "",          // <-- paste Price B here
  comingSoon: true,     // <-- flip to false
},
```

Paste the Price IDs. Flip comingSoon to false on both. Commit
that one change.

## Step 3: Deploy the dashboard worker

```sh
cd /Users/lanceroylo/Desktop/neverranked/dashboard
npm run deploy
```

That activates the new SKUs. `/checkout/kickoff` and
`/checkout/retainer` now create real Stripe checkout sessions
that charge the buyer.

## Step 4: Verify

Curl tests after deploy:

```sh
# Retired SKUs still 410 (correct):
curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/checkout/pulse
curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/checkout/audit

# Current SKUs no longer redirect to mailto, instead 302 to Stripe:
curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/checkout/kickoff
curl -s -o /dev/null -w "%{http_code}\n" https://app.neverranked.com/checkout/retainer
```

Expect: 410, 410, 302, 302.

Run a real test checkout in Stripe test mode before flipping
live, just to confirm webhook handling still works for the new
Prices.

## What the customer experiences

### Before the mint (today)

A prospect lands on `/checkout/kickoff` and sees a scoping page
that reads "The research engagement is scoped, not self-serve.
Email Lance directly with the category you want to measure and
3-5 competitors..." with a mailto CTA pre-filled with the right
subject and body template.

This is correct. The new product IS scoped, not self-serve, and
the kickoff is the moment Lance wants in the loop to set
expectations. The mailto captures the right intent without
charging anyone for a product they have not been quoted.

### After the mint (when ready)

The same URL creates a real Stripe checkout session and the
buyer is charged $4,500 on completion. Webhook handler routes
the successful payment into the existing engagement-provision
flow, which still exists below the throw in audit-delivery.ts
(audit-delivery would also need rewriting at that point — see
the code_rewrite_status memory note).

## What to NOT change

- **Do not reuse retired Price IDs.** The Pulse/Signal/Amplify/
  audit Price IDs in the retired entries of the PLANS table
  are kept for historical reference and DB-row resolution.
  Do not mint new SKUs on top of them.
- **Do not remove the retired entries from PLANS.** Existing
  customer records may still reference those plan keys; deleting
  the entries would crash any admin-page render that looks up
  plan labels for historical rows.
- **Do not flip comingSoon to false before the Price IDs are
  pasted.** Doing so makes the handler try to create a Stripe
  session against an empty priceId, which Stripe rejects with a
  500-class error visible to the buyer.

## What happens to audit-delivery after the mint

`generateAndStoreAudit`, `sendAuditDeliveryEmail`, and
`deliverAuditOnCheckout` are still locked with throws. The
audit-template is built on the dead AEO-score methodology and
the email body contains dead pricing.

When the new kickoff Price triggers a successful Stripe
webhook, the existing handleStripeWebhook flow tries to call
`deliverAuditOnCheckout`, which will throw and leave the
customer in a half-paid state (charged but no deliverable).

Two paths to resolve:

1. **Recommended:** rewrite audit-delivery to produce the
   research-memo + punch-list shape (using SAMPLE-DELIVERABLE.md
   as the target structure) before flipping the SKU. This is
   the proper post-payment flow under the new product.
2. **Acceptable interim:** edit handleStripeWebhook to skip
   the auto-delivery call for kickoff/retainer purchases and
   send Lance a notification email instead. Lance manually
   drives the kickoff conversation and the research memo
   delivery for the first few customers, then rewrite the
   automation when there's volume.

The second path is the lower-risk way to start taking real
payments. The first path is the right end state.

## Final note

Once kickoff and retainer are live and at least one paying
customer has signed, update `code_rewrite_status_2026-05-21.md`
to reflect the new state. That note is the single retrieval
surface for future sessions; it should not lag behind reality.
