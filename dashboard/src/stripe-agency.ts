/**
 * Dashboard -- Stripe agency white-label subscription helpers
 *
 * Billing model:
 *   One subscription per agency, two subscription_items:
 *     - Signal slots  (quantity = active signal client count)
 *     - Amplify slots (quantity = active amplify client count)
 *   Prices are volume-tiered (see scripts/setup-agency-stripe.ts) so the
 *   per-slot rate drops automatically as the agency grows.
 *
 *   A 10%-off coupon runs for the first 3 months. We record the unix
 *   timestamp when the discount expires on the agencies row so the UI
 *   can show the countdown without hitting Stripe on every render.
 *
 * Webhook dispatch:
 *   Agency events are distinguished from direct-client events by
 *   metadata.agency_id on the Checkout Session and Subscription. The
 *   main webhook handler in routes/checkout.ts checks that field first
 *   and routes agency events into handleAgencySubscriptionEvent() below.
 */

import type { Agency, Env } from "./types";
import { getAgency } from "./agency";

// ---------------------------------------------------------------------------
// Stripe REST helper (matches the pattern in routes/checkout.ts)
// ---------------------------------------------------------------------------

export async function stripeRequest(
  path: string,
  apiKey: string,
  body?: Record<string, string>,
  method?: "GET" | "POST" | "DELETE",
): Promise<any> {
  const verb = method || (body ? "POST" : "GET");
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    method: verb,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  return resp.json();
}

// ---------------------------------------------------------------------------
// Checkout session creation
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout Session to activate an agency's subscription.
 * We start both subscription_items at quantity=0 (Stripe permits this
 * only at creation via trials or explicit subscription_data). To keep
 * things simple we seed with quantity=1 Signal and expect the agency
 * to add their first client right after (Day 7 slot management).
 *
 * If the agency already has a stripe_subscription_id we refuse -- they
 * should be routed to the billing portal to manage an existing sub.
 */
export async function createAgencyCheckoutSession(
  agency: Agency,
  env: Env,
  origin: string,
): Promise<{ url?: string; error?: string }> {
  if (!env.STRIPE_SECRET_KEY) return { error: "Stripe is not configured." };
  if (!env.STRIPE_AGENCY_SIGNAL_PRICE_ID || !env.STRIPE_AGENCY_AMPLIFY_PRICE_ID) {
    return { error: "Agency plan prices are not configured." };
  }
  if (agency.stripe_subscription_id) {
    return { error: "This agency already has an active subscription. Use the billing portal to manage it." };
  }

  const params: Record<string, string> = {
    mode: "subscription",
    success_url: `${origin}/agency/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/agency/billing`,
    customer_email: agency.contact_email,
    "payment_method_types[0]": "card",
    // Seed both line items. Quantity defaults to zero is NOT allowed on
    // Checkout subscription items, so we activate Signal=1, Amplify=0
    // is also rejected: Stripe requires >=1 on every item. We seed
    // Signal=1 and add Amplify when the first Amplify client is added
    // (see stripe-agency#ensureAmplifyItem on Day 7).
    "line_items[0][price]": env.STRIPE_AGENCY_SIGNAL_PRICE_ID,
    "line_items[0][quantity]": "1",
    "metadata[agency_id]": String(agency.id),
    "metadata[agency_slug]": agency.slug,
    "subscription_data[metadata][agency_id]": String(agency.id),
    "subscription_data[metadata][agency_slug]": agency.slug,
  };

  // Apply the 90-day intro discount if configured. Stripe requires
  // discounts to go through subscription_data on subscription-mode
  // sessions (not discounts[] which is payment-mode only).
  if (env.STRIPE_AGENCY_INTRO_COUPON_ID) {
    params["discounts[0][coupon]"] = env.STRIPE_AGENCY_INTRO_COUPON_ID;
  }

  // Reuse the Stripe customer if the agency already has one (e.g. from
  // a prior failed attempt) so we don't create orphan customers.
  if (agency.stripe_customer_id) {
    params.customer = agency.stripe_customer_id;
    delete params.customer_email;
  }

  const session = await stripeRequest("/checkout/sessions", env.STRIPE_SECRET_KEY, params);
  if (session.error) {
    console.log(`Agency checkout error: ${JSON.stringify(session.error)}`);
    return { error: session.error.message || "Could not create checkout session." };
  }
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Webhook event handlers
// ---------------------------------------------------------------------------

/**
 * Is this webhook event an agency event? Checks the metadata bag on
 * the top-level object. Not every event has metadata (e.g. invoices
 * inherit the subscription's metadata, which we look up manually).
 */
export function isAgencyEvent(event: any): boolean {
  const obj = event?.data?.object;
  if (!obj) return false;
  const meta = obj.metadata || {};
  if (meta.agency_id) return true;

  // Subscription-scoped events often have the metadata on a nested
  // `subscription_details` or on the subscription itself. We fall back
  // to a synchronous check on the object's subscription_details if
  // Stripe populated it on the event (Stripe API version 2024-06+).
  const subDetails = obj.subscription_details?.metadata || {};
  if (subDetails.agency_id) return true;

  return false;
}

/**
 * Resolve agency_id from a webhook payload. Looks at direct metadata
 * first, then falls back to subscription_details. If neither has it
 * and we have a subscription id, we pull the subscription to check.
 */
export async function resolveAgencyId(event: any, env: Env): Promise<number | null> {
  const obj = event?.data?.object;
  if (!obj) return null;

  const directMeta = obj.metadata || {};
  if (directMeta.agency_id) return Number(directMeta.agency_id);

  const subDetails = obj.subscription_details?.metadata || {};
  if (subDetails.agency_id) return Number(subDetails.agency_id);

  // Invoice: look up subscription.
  const subId = obj.subscription || obj.id;
  if (subId && typeof subId === "string" && subId.startsWith("sub_") && env.STRIPE_SECRET_KEY) {
    const sub = await stripeRequest(`/subscriptions/${subId}`, env.STRIPE_SECRET_KEY);
    if (sub?.metadata?.agency_id) return Number(sub.metadata.agency_id);
  }

  return null;
}

/**
 * checkout.session.completed for an agency subscription. Persists the
 * customer + subscription ids onto the agency row, records the intro
 * discount expiry, captures the two subscription_item ids so Day 7 can
 * adjust quantities cleanly, and flips status to active.
 */
export async function handleAgencyCheckoutCompleted(event: any, env: Env): Promise<void> {
  const session = event.data.object;
  const agencyId = Number(session.metadata?.agency_id || 0);
  if (!agencyId) return;

  const agency = await getAgency(env, agencyId);
  if (!agency) return;

  const customerId: string | null = session.customer || null;
  const subscriptionId: string | null = session.subscription || null;

  let signalItemId: string | null = null;
  let amplifyItemId: string | null = null;
  let introEndsAt: number | null = null;

  // Pull the subscription to capture item ids + discount schedule.
  if (subscriptionId && env.STRIPE_SECRET_KEY) {
    const sub = await stripeRequest(`/subscriptions/${subscriptionId}`, env.STRIPE_SECRET_KEY);
    const items: any[] = sub?.items?.data || [];
    for (const item of items) {
      const priceId = item?.price?.id;
      if (priceId === env.STRIPE_AGENCY_SIGNAL_PRICE_ID) signalItemId = item.id;
      if (priceId === env.STRIPE_AGENCY_AMPLIFY_PRICE_ID) amplifyItemId = item.id;
    }
    // Discount end calc: Stripe returns discount.end as a unix ts when
    // the coupon duration is repeating. If that's missing, compute
    // 3 months from the subscription start as a conservative fallback.
    const discount = sub?.discount;
    if (discount?.end) {
      introEndsAt = Number(discount.end);
    } else if (discount && sub?.start_date) {
      introEndsAt = Number(sub.start_date) + 60 * 60 * 24 * 90;
    }
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE agencies
        SET stripe_customer_id = ?,
            stripe_subscription_id = ?,
            signal_slot_item_id = COALESCE(?, signal_slot_item_id),
            amplify_slot_item_id = COALESCE(?, amplify_slot_item_id),
            intro_discount_ends_at = COALESCE(?, intro_discount_ends_at),
            status = 'active',
            updated_at = ?
      WHERE id = ?`
  ).bind(customerId, subscriptionId, signalItemId, amplifyItemId, introEndsAt, now, agencyId).run();

  console.log(`Agency ${agency.slug} (${agencyId}) activated: sub=${subscriptionId} customer=${customerId}`);
}

/**
 * customer.subscription.deleted (agency). Pause the agency and null out
 * the subscription ids. We deliberately do NOT cascade-disable clients
 * here -- a churned agency's clients stay where they are until ops
 * decides what to do (hand off, migrate, archive).
 */
export async function handleAgencySubscriptionDeleted(event: any, env: Env): Promise<void> {
  const sub = event.data.object;
  const agencyId = Number(sub.metadata?.agency_id || 0) || await resolveAgencyId(event, env);
  if (!agencyId) return;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE agencies
        SET status = 'paused',
            stripe_subscription_id = NULL,
            signal_slot_item_id = NULL,
            amplify_slot_item_id = NULL,
            updated_at = ?
      WHERE id = ?`
  ).bind(now, agencyId).run();
  console.log(`Agency ${agencyId} subscription cancelled; status=paused`);
}

/**
 * invoice.payment_failed (agency). We don't flip status yet -- Stripe
 * will retry per the dunning settings, and we'll react to the
 * terminal invoice.payment_failed -> subscription.updated (past_due)
 * chain. For now we just log + notify ops so the white-glove team can
 * reach out before the sub actually cancels.
 */
export async function handleAgencyInvoiceFailed(event: any, env: Env): Promise<void> {
  const invoice = event.data.object;
  const agencyId = await resolveAgencyId(event, env);
  if (!agencyId) return;
  const agency = await getAgency(env, agencyId);
  if (!agency) return;

  if (env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "NeverRanked <reports@neverranked.com>",
          to: [env.ADMIN_EMAIL],
          subject: `Agency payment failed: ${agency.name}`,
          html: `
            <p>Agency invoice failed.</p>
            <p>Agency: <strong>${agency.name}</strong> (${agency.slug})</p>
            <p>Amount due: $${(Number(invoice.amount_due || 0) / 100).toFixed(2)}</p>
            <p>Contact: ${agency.contact_email}</p>
            <p>Time: ${new Date().toISOString()}</p>
          `,
        }),
      });
    } catch (e) {
      console.log(`Agency failure notify failed: ${e}`);
    }
  }
  console.log(`Agency ${agency.slug} invoice failed`);
}
