/**
 * Dashboard -- Agency billing
 *
 * Routes:
 *   GET  /agency/billing          -> status page (plan, slot counts, intro countdown, CTA)
 *   POST /agency/billing/activate -> create agency Checkout Session, redirect to Stripe
 *   GET  /agency/billing/success  -> post-checkout landing with a polished confirmation
 *
 * The activate flow only runs when an agency has no stripe_subscription_id
 * yet. Existing subscribers get pushed to the standard billing portal
 * (POST /billing/portal, already implemented in routes/checkout.ts).
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect, longDate } from "../render";
import { getAgency, countActiveSlots } from "../agency";
import { createAgencyCheckoutSession, stripeRequest } from "../stripe-agency";

/** Gate: only agency admins with an agency_id pass. Returns a redirect
 *  Response to send downstream, or null if the user is allowed. */
function ensureAgencyAdmin(user: User): Response | null {
  if (user.role !== "agency_admin" || !user.agency_id) {
    return redirect("/");
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /agency/billing
// ---------------------------------------------------------------------------

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Compute what the agency would pay at their current slot count using
 * the volume-tiered pricing we ship in scripts/setup-agency-stripe.ts.
 * We keep this client-side of the Stripe source so the page loads fast;
 * the single source of truth for actual billing is still Stripe.
 */
function tierRate(kind: "signal" | "amplify", qty: number): number {
  // Per-slot rate in cents at this quantity (volume mode: one rate for all units at this qty)
  if (kind === "signal") {
    if (qty <= 9) return 140000;
    if (qty <= 24) return 130000;
    return 120000;
  }
  if (qty <= 9) return 315000;
  if (qty <= 24) return 292500;
  return 270000;
}

function buildSlotSummary(slots: { signal: number; amplify: number }): {
  signalSubtotal: number;
  amplifySubtotal: number;
  monthlyTotal: number;
  signalRate: number;
  amplifyRate: number;
} {
  const signalRate = tierRate("signal", slots.signal);
  const amplifyRate = tierRate("amplify", slots.amplify);
  const signalSubtotal = signalRate * slots.signal;
  const amplifySubtotal = amplifyRate * slots.amplify;
  return {
    signalSubtotal,
    amplifySubtotal,
    monthlyTotal: signalSubtotal + amplifySubtotal,
    signalRate,
    amplifyRate,
  };
}

export async function handleAgencyBillingGet(
  user: User,
  env: Env,
  url: URL,
): Promise<Response> {
  const gate = ensureAgencyAdmin(user);
  if (gate) return gate;

  const agency = await getAgency(env, user.agency_id!);
  if (!agency) return redirect("/");

  const slots = await countActiveSlots(env, agency.id);
  const summary = buildSlotSummary(slots);

  const now = Math.floor(Date.now() / 1000);
  const introActive = agency.intro_discount_ends_at !== null && agency.intro_discount_ends_at > now;
  const introDaysLeft = introActive && agency.intro_discount_ends_at
    ? Math.ceil((agency.intro_discount_ends_at - now) / 86400)
    : 0;
  const introMonthlyCredit = introActive ? Math.round(summary.monthlyTotal * 0.10) : 0;

  const hasSub = !!agency.stripe_subscription_id;

  const flashOk = url.searchParams.get("activated") === "1"
    ? `<div class="flash">Subscription activated. Stripe has you covered from here.</div>`
    : "";
  const flashErrParam = url.searchParams.get("error");
  const flashErr = flashErrParam
    ? `<div class="flash flash-error">${esc(flashErrParam)}</div>`
    : "";

  // ---- Render blocks ----

  const statRow = `
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:24px">
      <div class="card" style="padding:20px">
        <div class="label">Status</div>
        <div style="font-family:var(--serif);font-size:24px;margin-top:6px;text-transform:capitalize">${esc(agency.status)}</div>
      </div>
      <div class="card" style="padding:20px">
        <div class="label">Signal slots</div>
        <div style="font-family:var(--serif);font-size:24px;margin-top:6px">${slots.signal}
          <span style="font-size:12px;color:var(--text-faint);margin-left:6px">${dollars(summary.signalRate)}/mo each</span>
        </div>
      </div>
      <div class="card" style="padding:20px">
        <div class="label">Amplify slots</div>
        <div style="font-family:var(--serif);font-size:24px;margin-top:6px">${slots.amplify}
          <span style="font-size:12px;color:var(--text-faint);margin-left:6px">${dollars(summary.amplifyRate)}/mo each</span>
        </div>
      </div>
      <div class="card" style="padding:20px">
        <div class="label">Est. monthly</div>
        <div style="font-family:var(--serif);font-size:24px;margin-top:6px">${dollars(summary.monthlyTotal)}</div>
        ${introActive
          ? `<div style="font-size:11px;color:var(--gold);margin-top:4px">Intro credit -${dollars(introMonthlyCredit)}/mo for ${introDaysLeft} more ${introDaysLeft === 1 ? "day" : "days"}</div>`
          : ""}
      </div>
    </div>
  `;

  const tierCard = `
    <div class="card">
      <div class="label" style="margin-bottom:12px">Volume pricing</div>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.7;margin:0 0 16px">
        Per-slot rate drops automatically as you grow. Volume pricing means
        the rate at your current tier applies to every slot at that tier,
        not a blended rate.
      </p>
      <table class="data-table" style="margin:0">
        <thead><tr><th>Slots</th><th>Signal</th><th>Amplify</th></tr></thead>
        <tbody>
          <tr><td>1 - 9</td><td>${dollars(140000)}/mo</td><td>${dollars(315000)}/mo</td></tr>
          <tr><td>10 - 24</td><td>${dollars(130000)}/mo</td><td>${dollars(292500)}/mo</td></tr>
          <tr><td>25+</td><td>${dollars(120000)}/mo</td><td>${dollars(270000)}/mo</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const ctaCard = hasSub
    ? `
      <div class="card">
        <div class="label" style="margin-bottom:12px">Manage billing</div>
        <p style="font-size:13px;color:var(--text-soft);line-height:1.7;margin:0 0 16px">
          Update payment method, download invoices, or cancel from the
          Stripe billing portal.
        </p>
        <form method="POST" action="/billing/portal" style="margin:0">
          <button type="submit" class="btn">Open billing portal</button>
        </form>
      </div>
    `
    : `
      <div class="card">
        <div class="label" style="margin-bottom:12px">Activate your subscription</div>
        <p style="font-size:13px;color:var(--text-soft);line-height:1.7;margin:0 0 16px">
          Start with one Signal slot. Add more after activation.
          Billing stays in sync automatically.
          ${env.STRIPE_AGENCY_INTRO_COUPON_ID
            ? `Your first 3 months include a 10% intro credit.`
            : ""}
        </p>
        <form method="POST" action="/agency/billing/activate" style="margin:0">
          <button type="submit" class="btn">Continue to Stripe</button>
        </form>
        <p style="font-size:11px;color:var(--text-faint);margin-top:12px;font-family:var(--mono)">
          You'll be redirected to Stripe to enter your payment method.
        </p>
      </div>
    `;

  const body = `
    <div class="section-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div>
        <h1>Billing</h1>
        <p class="section-sub">${esc(agency.name)} agency subscription</p>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/agency" class="btn btn-ghost">Back to dashboard</a>
      </div>
    </div>

    ${flashOk}
    ${flashErr}
    ${statRow}

    <div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:24px;align-items:start">
      ${tierCard}
      ${ctaCard}
    </div>
  `;

  return html(layout("Agency Billing", body, user));
}

// ---------------------------------------------------------------------------
// POST /agency/billing/activate
// ---------------------------------------------------------------------------

export async function handleAgencyBillingActivate(
  request: Request,
  user: User,
  env: Env,
): Promise<Response> {
  const gate = ensureAgencyAdmin(user);
  if (gate) return gate;

  const agency = await getAgency(env, user.agency_id!);
  if (!agency) return redirect("/");

  if (agency.stripe_subscription_id) {
    // Already subscribed -- the settings portal is the right place.
    return redirect("/agency/billing");
  }

  // Resolve the origin the user is actually on. wrangler dev with a
  // custom_domain route can make request.url report the production
  // hostname even in local mode, so we prefer the browser's Origin
  // header (always reflects the page the user submitted from) and
  // fall back to request.url only as a last resort.
  const origin =
    request.headers.get("origin") ||
    env.DASHBOARD_ORIGIN ||
    new URL(request.url).origin;
  const result = await createAgencyCheckoutSession(agency, env, origin);
  if (result.error || !result.url) {
    const msg = result.error || "Could not create checkout session.";
    return redirect("/agency/billing?error=" + encodeURIComponent(msg));
  }
  return redirect(result.url);
}

// ---------------------------------------------------------------------------
// GET /agency/billing/success
// ---------------------------------------------------------------------------

/**
 * Landing page after Stripe Checkout. The webhook does the real work
 * (persisting stripe ids, flipping status to active); we just poll
 * until we see the agency row has a subscription id, then redirect
 * onward. In practice the webhook fires in under a second on modern
 * Stripe, so this is a formality for edge cases.
 */
export async function handleAgencyBillingSuccess(
  user: User,
  env: Env,
  url: URL,
): Promise<Response> {
  const gate = ensureAgencyAdmin(user);
  if (gate) return gate;

  const sessionId = url.searchParams.get("session_id") || "";
  const agency = await getAgency(env, user.agency_id!);
  if (!agency) return redirect("/");

  // If the webhook already landed, skip the polling UI entirely.
  if (agency.stripe_subscription_id) {
    return redirect("/agency/billing?activated=1");
  }

  // Fallback: we attempt a one-off sync here in case the webhook race'd
  // us. Pull the session, find the subscription, and persist manually.
  // This keeps the page reliable even when Cloudflare->Stripe webhook
  // delivery is delayed.
  if (sessionId && env.STRIPE_SECRET_KEY) {
    try {
      const session = await stripeRequest(`/checkout/sessions/${sessionId}`, env.STRIPE_SECRET_KEY);
      if (session?.subscription && session?.customer && session?.metadata?.agency_id === String(agency.id)) {
        // Reuse the webhook handler logic by shaping a synthetic event.
        const { handleAgencyCheckoutCompleted } = await import("../stripe-agency");
        await handleAgencyCheckoutCompleted({ data: { object: session } }, env);
        return redirect("/agency/billing?activated=1");
      }
    } catch (e) {
      console.log(`billing success fallback sync failed: ${e}`);
    }
  }

  const body = `
    <div class="empty" style="padding:64px 24px;text-align:center">
      <div style="font-family:var(--serif);font-size:28px;margin-bottom:12px">Payment received</div>
      <p style="color:var(--text-soft);max-width:440px;margin:0 auto 24px">
        We're finalizing your subscription. This usually takes a few
        seconds. You'll be redirected automatically.
      </p>
      <p style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">
        Session: ${esc(sessionId)}
      </p>
    </div>
    <script>
      setTimeout(function(){ window.location.href = '/agency/billing?activated=1'; }, 2500);
    </script>
  `;

  return html(layout("Billing -- finalizing", body, user));
}
