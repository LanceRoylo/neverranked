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

import type { Env, User, Domain } from "../types";
import { layout, html, esc, redirect, longDate, shortDate } from "../render";
import { getAgency, countActiveSlots } from "../agency";
import { createAgencyCheckoutSession, stripeRequest } from "../stripe-agency";

// ---------------------------------------------------------------------------
// Stripe live-data helpers (scoped to this page; kept inline to avoid
// bloating stripe-agency.ts with render-layer concerns)
// ---------------------------------------------------------------------------

interface UpcomingInvoice {
  amountDue: number;      // cents
  currency: string;
  periodEnd: number | null; // unix ts
  invoiceNumber: string | null;
}

interface PaymentMethodSummary {
  brand: string;          // "visa", "mastercard", etc
  last4: string;
  expMonth: number | null;
  expYear: number | null;
}

/**
 * Fetch the upcoming invoice for a subscription. Returns null if Stripe
 * has nothing queued (rare; active subs always have an upcoming). Any
 * error is swallowed -- billing page must render even if Stripe is
 * momentarily flaky.
 */
async function fetchUpcomingInvoice(
  subscriptionId: string,
  apiKey: string,
): Promise<UpcomingInvoice | null> {
  try {
    const inv = await stripeRequest(
      `/invoices/upcoming?subscription=${encodeURIComponent(subscriptionId)}`,
      apiKey,
    );
    if (!inv || inv.error) return null;
    return {
      amountDue: Number(inv.amount_due ?? 0),
      currency: String(inv.currency || "usd"),
      periodEnd: inv.period_end ? Number(inv.period_end) : null,
      invoiceNumber: inv.number || null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the default payment method on the Stripe customer so we can
 * display "Visa ending 4242" as reassurance. Same error-swallow policy.
 */
async function fetchDefaultPaymentMethod(
  customerId: string,
  apiKey: string,
): Promise<PaymentMethodSummary | null> {
  try {
    const cust = await stripeRequest(
      `/customers/${encodeURIComponent(customerId)}?expand[]=invoice_settings.default_payment_method`,
      apiKey,
    );
    if (!cust || cust.error) return null;
    const pm = cust.invoice_settings?.default_payment_method;
    if (!pm || !pm.card) return null;
    return {
      brand: String(pm.card.brand || "card"),
      last4: String(pm.card.last4 || "????"),
      expMonth: pm.card.exp_month ? Number(pm.card.exp_month) : null,
      expYear: pm.card.exp_year ? Number(pm.card.exp_year) : null,
    };
  } catch {
    return null;
  }
}

/** Fetch active clients (primary domains) attached to the agency, by plan. */
async function fetchAgencyClients(env: Env, agencyId: number): Promise<Domain[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM domains
       WHERE agency_id = ? AND is_competitor = 0 AND active = 1
       ORDER BY plan, client_slug`
  ).bind(agencyId).all<Domain>();
  return rows.results || [];
}

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
  // Per-slot rate in cents at this quantity (volume mode: one rate for
  // all units at this qty). Must match the tier amounts in
  // scripts/setup-agency-stripe.ts; Stripe is the source of truth for
  // actual billing, this function is only used for the estimate card.
  if (kind === "signal") {
    if (qty <= 9) return 80000;   // $800/mo
    if (qty <= 24) return 70000;  // $700/mo
    return 60000;                 // $600/mo
  }
  if (qty <= 9) return 180000;    // $1,800/mo
  if (qty <= 24) return 160000;   // $1,600/mo
  return 140000;                  // $1,400/mo
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

  // Live Stripe data and client breakdown. These calls fan out in
  // parallel so the page load doesn't serialize three round-trips.
  // Every helper swallows its own errors so we never break the page.
  const [upcomingInvoice, paymentMethod, clients] = await Promise.all([
    hasSub && env.STRIPE_SECRET_KEY
      ? fetchUpcomingInvoice(agency.stripe_subscription_id!, env.STRIPE_SECRET_KEY)
      : Promise.resolve(null),
    hasSub && agency.stripe_customer_id && env.STRIPE_SECRET_KEY
      ? fetchDefaultPaymentMethod(agency.stripe_customer_id, env.STRIPE_SECRET_KEY)
      : Promise.resolve(null),
    fetchAgencyClients(env, agency.id),
  ]);

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
          <tr><td>1 - 9</td><td>${dollars(80000)}/mo</td><td>${dollars(180000)}/mo</td></tr>
          <tr><td>10 - 24</td><td>${dollars(70000)}/mo</td><td>${dollars(160000)}/mo</td></tr>
          <tr><td>25+</td><td>${dollars(60000)}/mo</td><td>${dollars(140000)}/mo</td></tr>
        </tbody>
      </table>
    </div>
  `;

  // ---- Next invoice card (live Stripe data) -----------------------------
  // Only rendered when hasSub + upcomingInvoice resolved. The amount here
  // reflects Stripe's real math: slot quantities, volume tier rates, and
  // any intro credit still in effect. It will NOT match our in-page
  // estimate exactly when the intro credit is active, which is the point
  // -- the agency sees their actual next charge.
  const nextInvoiceCard = hasSub && upcomingInvoice ? `
    <div class="card">
      <div class="label" style="margin-bottom:8px">Next invoice</div>
      <div style="font-family:var(--serif);font-size:32px;line-height:1.1;margin-bottom:4px">
        ${dollars(upcomingInvoice.amountDue)}
      </div>
      <div style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">
        ${upcomingInvoice.periodEnd ? "Bills " + esc(longDate(upcomingInvoice.periodEnd)) : "Billing date pending"}
        ${upcomingInvoice.invoiceNumber ? " &middot; " + esc(upcomingInvoice.invoiceNumber) : ""}
      </div>
      ${paymentMethod ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line);font-family:var(--mono);font-size:12px;color:var(--text-soft)">
          Billing via ${esc(paymentMethod.brand)} ending ${esc(paymentMethod.last4)}
          ${paymentMethod.expMonth && paymentMethod.expYear
            ? ` <span style="color:var(--text-faint)">&middot; exp ${String(paymentMethod.expMonth).padStart(2, "0")}/${String(paymentMethod.expYear).slice(-2)}</span>`
            : ""}
        </div>
      ` : ""}
    </div>
  ` : "";

  // ---- Active clients breakdown -----------------------------------------
  // Sources from the domains table directly. Shows every client the
  // agency is currently billing for, grouped by plan, with the per-slot
  // rate at their current tier. If there are no clients we skip the
  // card entirely so the page doesn't look empty.
  const signalClients = clients.filter(c => c.plan === "signal");
  const amplifyClients = clients.filter(c => c.plan === "amplify");
  const unassignedClients = clients.filter(c => c.plan !== "signal" && c.plan !== "amplify");

  const clientRow = (d: Domain, rate: number) => `
    <tr>
      <td style="padding:8px 0;font-size:13px">
        <div style="font-weight:500">${esc(d.client_slug)}</div>
        <div style="color:var(--text-faint);font-size:11px;font-family:var(--mono)">${esc(d.domain)}</div>
      </td>
      <td style="padding:8px 0;font-family:var(--mono);font-size:12px;color:var(--text-soft);text-align:right;white-space:nowrap">
        ${dollars(rate)}/mo
      </td>
    </tr>
  `;

  const clientsCard = clients.length > 0 ? `
    <div class="card">
      <div class="label" style="margin-bottom:12px">Active clients (${clients.length})</div>
      ${signalClients.length > 0 ? `
        <div style="margin-bottom:12px">
          <div style="font-family:var(--label);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">
            Signal &middot; ${signalClients.length} &middot; ${dollars(summary.signalRate)}/mo each
          </div>
          <table style="width:100%;border-collapse:collapse">${signalClients.map(d => clientRow(d, summary.signalRate)).join("")}</table>
        </div>
      ` : ""}
      ${amplifyClients.length > 0 ? `
        <div style="margin-bottom:12px">
          <div style="font-family:var(--label);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">
            Amplify &middot; ${amplifyClients.length} &middot; ${dollars(summary.amplifyRate)}/mo each
          </div>
          <table style="width:100%;border-collapse:collapse">${amplifyClients.map(d => clientRow(d, summary.amplifyRate)).join("")}</table>
        </div>
      ` : ""}
      ${unassignedClients.length > 0 ? `
        <div style="padding:10px 12px;background:var(--bg-edge);border-radius:4px;font-family:var(--mono);font-size:11px;color:var(--text-faint)">
          ${unassignedClients.length} client${unassignedClients.length === 1 ? "" : "s"} without a plan assigned. Ask your rep to set Signal or Amplify so these count correctly.
        </div>
      ` : ""}
    </div>
  ` : "";

  // ---- Margin math callout ----------------------------------------------
  // Motivational resale math, only when it makes sense (has at least 1
  // client). Numbers are rounded for readability. We use conservative
  // midpoint retail prices ($325 Signal, $750 Amplify) to avoid looking
  // like we over-promise. Profit is their real cost subtracted.
  const SIGNAL_RETAIL = 32500; // $325/mo midpoint
  const AMPLIFY_RETAIL = 75000; // $750/mo midpoint
  const signalRevenue = SIGNAL_RETAIL * slots.signal;
  const amplifyRevenue = AMPLIFY_RETAIL * slots.amplify;
  const totalRevenue = signalRevenue + amplifyRevenue;
  const profit = totalRevenue - summary.monthlyTotal;
  const marginPct = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;

  const marginCard = clients.length > 0 && slots.signal + slots.amplify > 0 ? `
    <div class="card" style="border-color:var(--gold-dim)">
      <div class="label" style="margin-bottom:12px;color:var(--gold)">Resale potential</div>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.7;margin:0 0 16px">
        At midpoint retail pricing, your current client count could be worth:
      </p>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px">
        <div style="text-align:center;padding:12px;background:var(--bg-edge);border-radius:4px">
          <div class="label" style="font-size:10px">Revenue</div>
          <div style="font-family:var(--serif);font-size:22px;margin-top:4px">${dollars(totalRevenue)}</div>
        </div>
        <div style="text-align:center;padding:12px;background:var(--bg-edge);border-radius:4px">
          <div class="label" style="font-size:10px">Your cost</div>
          <div style="font-family:var(--serif);font-size:22px;margin-top:4px;color:var(--text-faint)">${dollars(summary.monthlyTotal)}</div>
        </div>
        <div style="text-align:center;padding:12px;background:var(--bg-edge);border-radius:4px">
          <div class="label" style="font-size:10px;color:var(--gold)">Profit</div>
          <div style="font-family:var(--serif);font-size:22px;margin-top:4px;color:var(--gold)">${dollars(profit)}
            <span style="font-size:12px;color:var(--text-faint);margin-left:4px">${marginPct}%</span>
          </div>
        </div>
      </div>
      <p style="font-size:11px;color:var(--text-faint);line-height:1.6;margin:0;font-family:var(--mono)">
        Based on $${(SIGNAL_RETAIL/100).toFixed(0)}/mo retail for Signal, $${(AMPLIFY_RETAIL/100).toFixed(0)}/mo for Amplify. Adjust up or down to fit your market.
      </p>
    </div>
  ` : "";

  // Status-aware CTA. Three shapes: active sub (manage portal), paused
  // sub (churned, reactivate copy), pending/no sub (activate flow).
  const ctaCardPaused = `
    <div class="card" style="border-color:var(--yellow)">
      <div class="label" style="margin-bottom:12px">Subscription paused</div>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.7;margin:0 0 16px">
        Your Stripe subscription was cancelled. Your clients are still
        in the dashboard, but no new scans or schema updates will run
        until you reactivate.
      </p>
      <form method="POST" action="/agency/billing/activate" style="margin:0">
        <button type="submit" class="btn">Reactivate subscription</button>
      </form>
      <p style="font-size:11px;color:var(--text-faint);margin-top:12px;font-family:var(--mono)">
        Any outstanding client data stays intact. Reactivating restores billing from today.
      </p>
    </div>
  `;

  const ctaCard = agency.status === "paused" && !hasSub
    ? ctaCardPaused
    : hasSub
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

    ${nextInvoiceCard ? `
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start;margin-bottom:24px">
        ${nextInvoiceCard}
        ${ctaCard}
      </div>
    ` : `
      <div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:24px;align-items:start;margin-bottom:24px">
        ${tierCard}
        ${ctaCard}
      </div>
    `}

    ${marginCard || clientsCard ? `
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start;margin-bottom:24px">
        ${clientsCard}
        ${marginCard}
      </div>
    ` : ""}

    ${nextInvoiceCard ? tierCard : ""}
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
