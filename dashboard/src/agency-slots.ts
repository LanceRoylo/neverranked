/**
 * Dashboard -- Agency Stripe slot reconciliation
 *
 * The billing model: every agency has ONE Stripe subscription with up
 * to TWO subscription_items -- a Signal price line and an Amplify
 * price line. Each item's `quantity` is the number of active clients
 * on that plan.
 *
 * Checkout seeds the Signal item with quantity=1 (Stripe requires >=1
 * at Checkout creation on subscription-mode sessions). Amplify is
 * lazy-created the first time an Amplify client is added, so agencies
 * with no Amplify clients never pay for an empty Amplify line.
 *
 * Rather than track deltas across call sites (and fight race conditions
 * when the DB and Stripe disagree), this module takes the DB as the
 * source of truth and reconciles Stripe to match. Callers just fire
 * `reconcileAgencySlots(env, agencyId)` after any mutation that could
 * change the active-client counts -- domain insert, active toggle,
 * plan change, agency row status flip. The function is idempotent and
 * safe to call repeatedly.
 *
 * Failures propagate -- if Stripe rejects, the caller can decide whether
 * to roll back the DB mutation or surface the error.
 */

import type { Env, Agency } from "./types";
import { getAgency, countActiveSlots } from "./agency";
import { stripeRequest } from "./stripe-agency";

export interface SlotLineResult {
  /** How many active clients on this plan the DB reports. */
  expected: number;
  /** Stripe's current quantity (0 if item doesn't exist). */
  stripeQuantity: number;
  /** True iff we actually sent a Stripe API call to change state. */
  updated: boolean;
  /** True iff this call lazy-created the Amplify subscription_item. */
  lazyCreated?: boolean;
  /** Stripe subscription_item id (new or existing). */
  itemId?: string;
}

export interface SlotReconcileResult {
  agencyId: number;
  skipped?: "no-subscription" | "missing-env";
  signal: SlotLineResult;
  amplify: SlotLineResult;
}

/**
 * Reconcile one agency's Stripe subscription quantities against the
 * current state of `domains`. Returns a structured result so callers
 * (and the admin UI) can log or surface what changed.
 *
 * Does NOT modify the `domains` table. Only touches Stripe and the
 * `agencies.amplify_slot_item_id` column (on lazy-create).
 */
export async function reconcileAgencySlots(
  env: Env,
  agencyId: number,
  _attempt: number = 0
): Promise<SlotReconcileResult> {
  const agency = await getAgency(env, agencyId);
  if (!agency) throw new Error(`Agency ${agencyId} not found`);

  const empty: SlotLineResult = { expected: 0, stripeQuantity: 0, updated: false };

  // No subscription yet -> nothing to reconcile. This is normal for
  // agencies in 'pending' or 'paused' status.
  if (!agency.stripe_subscription_id) {
    return { agencyId, skipped: "no-subscription", signal: empty, amplify: empty };
  }
  if (!env.STRIPE_SECRET_KEY) {
    return { agencyId, skipped: "missing-env", signal: empty, amplify: empty };
  }

  const slots = await countActiveSlots(env, agencyId);

  const signal = await reconcileSignal(env, agency, slots.signal);
  const amplify = await reconcileAmplify(env, agency, slots.amplify);

  // Drift guard. Two concurrent add-client requests can each insert their
  // domain row and then reconcile -- if the second reconcile's D1 read
  // happens on a replica that hasn't seen the first insert yet, it will
  // push Stripe back to an old quantity. After reconcile, re-read the DB
  // and if the count has advanced past what we just wrote to Stripe, run
  // reconcile once more. Capped at one retry so we don't loop forever if
  // something upstream is genuinely broken.
  if (_attempt === 0) {
    const slotsAfter = await countActiveSlots(env, agencyId);
    const drift =
      slotsAfter.signal !== signal.stripeQuantity ||
      slotsAfter.amplify !== amplify.stripeQuantity;
    if (drift) {
      console.log(
        `[agency-slots] drift detected for agency ${agencyId}: ` +
        `db=(signal:${slotsAfter.signal},amplify:${slotsAfter.amplify}) ` +
        `stripe=(signal:${signal.stripeQuantity},amplify:${amplify.stripeQuantity}) -- retrying reconcile`
      );
      try {
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare(
          `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
             VALUES ('_system', 'slot_drift_detected', ?, ?, ?)`
        ).bind(
          `Slot drift on agency ${agencyId}`,
          `DB counts (signal:${slotsAfter.signal}, amplify:${slotsAfter.amplify}) diverged from Stripe quantities (signal:${signal.stripeQuantity}, amplify:${amplify.stripeQuantity}) after reconcile. Auto-retrying.`,
          now,
        ).run();
      } catch (e) {
        console.log(`[agency-slots] failed to log drift alert: ${e}`);
      }
      return reconcileAgencySlots(env, agencyId, 1);
    }
  }

  return { agencyId, signal, amplify };
}

/**
 * Signal line is always-present: Checkout seeded quantity=1, and it
 * persists across the lifetime of the subscription even if the agency
 * drops to 0 Signal clients (Stripe allows quantity=0 on existing
 * subscription_items). If there's no signal_slot_item_id on the
 * agency row, something is wrong with the Checkout handler -- we
 * log and return a warning result rather than trying to lazy-create.
 */
async function reconcileSignal(
  env: Env,
  agency: Agency,
  expected: number
): Promise<SlotLineResult> {
  if (!agency.signal_slot_item_id) {
    // Shouldn't happen post-checkout. Log for visibility.
    console.log(
      `[agency-slots] agency ${agency.id} (${agency.slug}) has subscription but no signal_slot_item_id`
    );
    return { expected, stripeQuantity: 0, updated: false };
  }

  const apiKey = env.STRIPE_SECRET_KEY!;
  const item = await stripeRequest(
    `/subscription_items/${agency.signal_slot_item_id}`,
    apiKey
  );
  if (item?.error) {
    throw new Error(
      `Stripe read signal item failed: ${item.error.message || JSON.stringify(item.error)}`
    );
  }

  const current = Number(item?.quantity ?? 0);
  const result: SlotLineResult = {
    expected,
    stripeQuantity: current,
    updated: false,
    itemId: agency.signal_slot_item_id,
  };

  if (current === expected) return result;

  const updated = await stripeRequest(
    `/subscription_items/${agency.signal_slot_item_id}`,
    apiKey,
    {
      quantity: String(expected),
      proration_behavior: "always_invoice",
    }
  );
  if (updated?.error) {
    throw new Error(
      `Stripe update signal quantity failed: ${updated.error.message || JSON.stringify(updated.error)}`
    );
  }

  result.stripeQuantity = expected;
  result.updated = true;
  return result;
}

/**
 * Amplify line may not exist yet. Lazy-create it the first time an
 * Amplify client is active. If expected drops back to 0 we leave the
 * item in place at quantity=0 -- cheaper to keep it around than to
 * delete + re-create, and Stripe doesn't charge on a zero-quantity
 * line.
 */
async function reconcileAmplify(
  env: Env,
  agency: Agency,
  expected: number
): Promise<SlotLineResult> {
  const apiKey = env.STRIPE_SECRET_KEY!;

  // Item already exists -- same path as signal
  if (agency.amplify_slot_item_id) {
    const item = await stripeRequest(
      `/subscription_items/${agency.amplify_slot_item_id}`,
      apiKey
    );
    if (item?.error) {
      throw new Error(
        `Stripe read amplify item failed: ${item.error.message || JSON.stringify(item.error)}`
      );
    }

    const current = Number(item?.quantity ?? 0);
    const result: SlotLineResult = {
      expected,
      stripeQuantity: current,
      updated: false,
      itemId: agency.amplify_slot_item_id,
    };

    if (current === expected) return result;

    const updated = await stripeRequest(
      `/subscription_items/${agency.amplify_slot_item_id}`,
      apiKey,
      {
        quantity: String(expected),
        proration_behavior: "always_invoice",
      }
    );
    if (updated?.error) {
      throw new Error(
        `Stripe update amplify quantity failed: ${updated.error.message || JSON.stringify(updated.error)}`
      );
    }

    result.stripeQuantity = expected;
    result.updated = true;
    return result;
  }

  // No item yet and no Amplify clients either -> nothing to do.
  if (expected === 0) {
    return { expected: 0, stripeQuantity: 0, updated: false };
  }

  // Lazy-create. Stripe creates the item attached to the existing
  // subscription, returns the item id, and we persist it so future
  // reconciles update in place.
  if (!env.STRIPE_AGENCY_AMPLIFY_PRICE_ID) {
    throw new Error("STRIPE_AGENCY_AMPLIFY_PRICE_ID not configured");
  }

  const created = await stripeRequest("/subscription_items", apiKey, {
    subscription: agency.stripe_subscription_id!,
    price: env.STRIPE_AGENCY_AMPLIFY_PRICE_ID,
    quantity: String(expected),
    proration_behavior: "always_invoice",
  });
  if (created?.error) {
    throw new Error(
      `Stripe create amplify item failed: ${created.error.message || JSON.stringify(created.error)}`
    );
  }

  const newItemId = created.id as string;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE agencies SET amplify_slot_item_id = ?, updated_at = ? WHERE id = ?"
  ).bind(newItemId, now, agency.id).run();

  console.log(
    `[agency-slots] lazy-created Amplify item ${newItemId} for agency ${agency.id} (${agency.slug}) at quantity ${expected}`
  );

  return {
    expected,
    stripeQuantity: expected,
    updated: true,
    lazyCreated: true,
    itemId: newItemId,
  };
}

/**
 * Convenience wrapper. Future callers might prefer this name since
 * "reconcile" implies a bigger operation than what actually happens
 * (one Stripe API call when nothing's changed, 1-2 when it has).
 */
export async function syncAgencySlots(env: Env, agencyId: number) {
  return reconcileAgencySlots(env, agencyId);
}
