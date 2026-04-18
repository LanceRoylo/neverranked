// GET /billing — Stripe billing dashboard.
// Pulls live data from Stripe API: MRR, active subscriptions, recent charges,
// failed payments. No local caching — always fresh.

import type { Env } from "../types";
import { PLAN_LABELS } from "../types";
import { esc, page, formatDate } from "../render";
import { layout } from "../views/layout";

// ---------- Stripe API helpers ----------

interface StripeList<T> {
  data: T[];
  has_more: boolean;
}

interface StripeSub {
  id: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  created: number;
  customer: string;
  items: { data: { price: { id: string; unit_amount: number; recurring: { interval: string } | null } }[] };
  metadata: Record<string, string>;
}

interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
  customer: string | null;
  description: string | null;
  failure_message: string | null;
  paid: boolean;
  refunded: boolean;
  receipt_url: string | null;
  metadata: Record<string, string>;
}

interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  metadata: Record<string, string>;
}

async function stripeGet<T>(env: Env, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://api.stripe.com/v1${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ---------- Price ID → plan name mapping ----------

const PRICE_TO_PLAN: Record<string, string> = {
  price_1TLgcBChs9v2cUMPj5Sd7E0o: "Audit",
  price_1TLgcZChs9v2cUMPgum7Ujgt: "Signal",
  price_1TLgctChs9v2cUMPFGY47fcC: "Amplify",
};

function planFromPriceId(priceId: string): string {
  return PRICE_TO_PLAN[priceId] ?? priceId.slice(-8);
}

// ---------- Route handler ----------

export async function showBilling(_request: Request, env: Env): Promise<Response> {
  // Parallel fetch: active subs, recent charges (last 50), failed charges
  const [subsData, chargesData, failedData] = await Promise.all([
    stripeGet<StripeList<StripeSub>>(env, "/subscriptions", {
      status: "active",
      limit: "100",
      "expand[]": "data.customer",
    }),
    stripeGet<StripeList<StripeCharge>>(env, "/charges", {
      limit: "25",
    }),
    stripeGet<StripeList<StripeCharge>>(env, "/charges", {
      limit: "25",
      // We'll filter failed ones client-side since Stripe doesn't have a clean
      // "failed only" param — we look for status != succeeded
    }),
  ]);

  const activeSubs = subsData.data;
  const recentCharges = chargesData.data;
  const failedCharges = failedData.data.filter(
    (c) => c.status === "failed" || (!c.paid && c.status !== "pending"),
  );

  // Calculate MRR from active subscriptions
  let mrrCents = 0;
  for (const sub of activeSubs) {
    for (const item of sub.items.data) {
      const amount = item.price.unit_amount ?? 0;
      const interval = item.price.recurring?.interval;
      if (interval === "month") {
        mrrCents += amount;
      } else if (interval === "year") {
        mrrCents += Math.round(amount / 12);
      }
    }
  }

  // Count canceling (cancel_at_period_end = true)
  const cancelingSubs = activeSubs.filter((s) => s.cancel_at_period_end);

  // Revenue this month from charges
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000;
  const monthCharges = recentCharges.filter(
    (c) => c.status === "succeeded" && c.created >= monthStart,
  );
  let monthRevenueCents = 0;
  for (const c of monthCharges) monthRevenueCents += c.amount;

  // Build a customer cache for display names (from expanded sub data)
  const customerCache = new Map<string, { email: string | null; name: string | null }>();
  for (const sub of activeSubs) {
    const cust = sub.customer as unknown as StripeCustomer | string;
    if (typeof cust === "object" && cust !== null) {
      customerCache.set(cust.id, { email: cust.email, name: cust.name });
    }
  }

  const body = `
<div class="section-head">
  <h1>Billing <em>overview.</em></h1>
  <div class="meta"><a href="https://dashboard.stripe.com" target="_blank" rel="noopener">Open Stripe Dashboard &rarr;</a></div>
</div>

${renderBillingStats(mrrCents, activeSubs.length, cancelingSubs.length, monthRevenueCents, failedCharges.length)}

<div class="section-head" style="margin-top:36px">
  <h1 style="font-size:22px">Active <em>subscriptions</em></h1>
  <div class="meta">${activeSubs.length} active</div>
</div>
${renderSubscriptions(activeSubs, customerCache)}

${failedCharges.length > 0 ? `
<div class="section-head" style="margin-top:36px">
  <h1 style="font-size:22px">Failed <em>payments</em></h1>
  <div class="meta" style="color:var(--danger)">${failedCharges.length} failed</div>
</div>
${renderCharges(failedCharges, customerCache, true)}
` : ""}

<div class="section-head" style="margin-top:36px">
  <h1 style="font-size:22px">Recent <em>charges</em></h1>
  <div class="meta">Last 25</div>
</div>
${renderCharges(recentCharges, customerCache, false)}
`;

  return page(layout({ title: "Billing", nav: "billing", body }));
}

// ---------- Render helpers ----------

function renderBillingStats(
  mrrCents: number,
  activeSubs: number,
  cancelingSubs: number,
  monthRevenueCents: number,
  failedCount: number,
): string {
  const fmt = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return `
<div class="stats" style="grid-template-columns:repeat(5,1fr)">
  <div class="stat">
    <div class="label">MRR</div>
    <div class="value" style="color:var(--gold)">${fmt(mrrCents)}</div>
  </div>
  <div class="stat">
    <div class="label">Active Subs</div>
    <div class="value">${activeSubs}</div>
  </div>
  <div class="stat">
    <div class="label">Canceling</div>
    <div class="value" ${cancelingSubs > 0 ? 'style="color:var(--danger)"' : ""}>${cancelingSubs}</div>
  </div>
  <div class="stat">
    <div class="label">This Month</div>
    <div class="value">${fmt(monthRevenueCents)}</div>
  </div>
  <div class="stat">
    <div class="label">Failed</div>
    <div class="value" ${failedCount > 0 ? 'style="color:var(--danger)"' : ""}>${failedCount}</div>
  </div>
</div>`;
}

function renderSubscriptions(
  subs: StripeSub[],
  customers: Map<string, { email: string | null; name: string | null }>,
): string {
  if (subs.length === 0) {
    return `
<div class="table-wrap">
  <table>
    <tbody><tr class="empty-row"><td>No active subscriptions.</td></tr></tbody>
  </table>
</div>`;
  }

  const rows = subs
    .map((sub) => {
      const custId = typeof sub.customer === "string" ? sub.customer : (sub.customer as unknown as StripeCustomer).id;
      const cust = customers.get(custId);
      const custLabel = cust?.name || cust?.email || custId;
      const priceId = sub.items.data[0]?.price.id ?? "";
      const amount = sub.items.data[0]?.price.unit_amount ?? 0;
      const plan = planFromPriceId(priceId);
      const periodEnd = formatDate(sub.current_period_end);
      const cancelTag = sub.cancel_at_period_end
        ? ' <span style="color:var(--danger);font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-family:var(--label)">canceling</span>'
        : "";
      const stripeUrl = `https://dashboard.stripe.com/subscriptions/${esc(sub.id)}`;

      return `
<tr>
  <td><a href="${stripeUrl}" target="_blank" rel="noopener">${esc(custLabel)}</a></td>
  <td><span class="badge badge-paid">${esc(plan)}</span></td>
  <td class="num">$${(amount / 100).toFixed(0)}/mo</td>
  <td class="muted mono">${periodEnd}</td>
  <td>${cancelTag || '<span class="muted">Active</span>'}</td>
</tr>`;
    })
    .join("");

  return `
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Customer</th>
        <th>Plan</th>
        <th class="num">Amount</th>
        <th>Renews</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

function renderCharges(
  charges: StripeCharge[],
  customers: Map<string, { email: string | null; name: string | null }>,
  isFailed: boolean,
): string {
  if (charges.length === 0) {
    return `
<div class="table-wrap">
  <table>
    <tbody><tr class="empty-row"><td>${isFailed ? "No failed payments. All clear." : "No recent charges."}</td></tr></tbody>
  </table>
</div>`;
  }

  const rows = charges
    .map((c) => {
      const custId = c.customer ?? "";
      const cust = customers.get(custId);
      const custLabel = cust?.name || cust?.email || custId || "—";
      const amountStr = `$${(c.amount / 100).toFixed(2)}`;
      const dateStr = formatDate(c.created);
      const stripeUrl = `https://dashboard.stripe.com/payments/${esc(c.id)}`;

      let statusHtml: string;
      if (c.status === "succeeded" && c.paid) {
        statusHtml = '<span style="color:var(--ok)">Paid</span>';
      } else if (c.status === "failed") {
        statusHtml = `<span style="color:var(--danger)">Failed</span>`;
      } else if (c.refunded) {
        statusHtml = '<span style="color:var(--text-faint)">Refunded</span>';
      } else {
        statusHtml = `<span class="muted">${esc(c.status)}</span>`;
      }

      const failureNote = c.failure_message
        ? `<div style="font-size:11px;color:var(--danger);margin-top:2px">${esc(c.failure_message)}</div>`
        : "";

      return `
<tr>
  <td><a href="${stripeUrl}" target="_blank" rel="noopener">${esc(custLabel)}</a>${failureNote}</td>
  <td class="num mono">${amountStr}</td>
  <td>${statusHtml}</td>
  <td class="muted">${esc(c.description ?? "—")}</td>
  <td class="muted mono">${dateStr}</td>
</tr>`;
    })
    .join("");

  return `
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Customer</th>
        <th class="num">Amount</th>
        <th>Status</th>
        <th>Description</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}
