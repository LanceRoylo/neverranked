/**
 * Dashboard — Stripe checkout routes
 *
 * Uses Stripe Checkout Sessions (hosted) for payment.
 * No Stripe SDK -- direct REST API calls to keep bundle small.
 *
 * Plans:
 *   audit    — $500 one-time
 *   signal   — $2,000/mo subscription
 *   amplify  — $4,500/mo subscription
 */

import type { Env, User } from "../types";
import { layout, html, redirect } from "../render";

// ---------- Plan config ----------

interface PlanConfig {
  name: string;
  priceLabel: string;
  mode: "payment" | "subscription";
  amount: number;        // in cents
  interval?: "month";
  description: string;
}

const PLANS: Record<string, PlanConfig> = {
  audit: {
    name: "NeverRanked Audit",
    priceLabel: "$500",
    mode: "payment",
    amount: 50000,
    description: "Full technical + AEO audit. Schema review, keyword gap analysis, AI citation audit, competitor teardown, and 90-day roadmap. Delivered within 48 hours.",
  },
  signal: {
    name: "NeverRanked Signal",
    priceLabel: "$2,000/mo",
    mode: "subscription",
    amount: 200000,
    interval: "month",
    description: "Monthly retainer: technical & AEO audit, schema monitoring, citation tracking, live dashboard, monthly Loom recap, 12-hour email SLA. Three-month minimum.",
  },
  amplify: {
    name: "NeverRanked Amplify",
    priceLabel: "$4,500/mo",
    mode: "subscription",
    amount: 450000,
    interval: "month",
    description: "Full-cover retainer: everything in Signal plus weekly digest, biweekly Looms, quarterly strategy, content drafts, 6-hour SLA. Limited to 2 clients.",
  },
};

// ---------- Stripe API helpers ----------

async function stripeRequest(
  path: string,
  apiKey: string,
  body?: Record<string, string>
): Promise<any> {
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  return resp.json();
}

// Verify Stripe webhook signature (HMAC SHA256)
async function verifyWebhookSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = sigHeader.split(",").reduce((acc, part) => {
    const [key, val] = part.split("=");
    if (key === "t") acc.timestamp = val;
    if (key === "v1") acc.signatures.push(val);
    return acc;
  }, { timestamp: "", signatures: [] as string[] });

  if (!parts.timestamp || parts.signatures.length === 0) return false;

  // Check timestamp is within 5 minutes
  const ts = parseInt(parts.timestamp);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const signedPayload = `${parts.timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedHex = [...new Uint8Array(sig)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return parts.signatures.includes(expectedHex);
}

// ---------- Route handlers ----------

/**
 * GET /checkout/:plan — Create Stripe Checkout Session and redirect
 * Can be accessed without auth (for pricing page links)
 */
export async function handleCheckout(
  plan: string,
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return html(layout("Error", `
      <div class="empty">
        <h3>Payments not configured</h3>
        <p>Stripe is not set up yet. Please contact <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a></p>
      </div>
    `), 500);
  }

  const config = PLANS[plan];
  if (!config) {
    return html(layout("Not Found", `
      <div class="empty">
        <h3>Plan not found</h3>
        <p>Valid plans: audit, signal, amplify. <a href="https://neverranked.com/#pricing" style="color:var(--gold)">View pricing</a></p>
      </div>
    `), 404);
  }

  // For Amplify, check seat cap
  if (plan === "amplify") {
    const activeAmplify = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM users WHERE plan = 'amplify' AND stripe_subscription_id IS NOT NULL"
    ).first<{ count: number }>();
    if (activeAmplify && activeAmplify.count >= 2) {
      return html(layout("Amplify", `
        <div class="empty">
          <h3>Amplify is full</h3>
          <p style="max-width:400px">We limit Amplify to 2 clients to maintain quality. Join the waitlist or start with Signal.</p>
          <div style="margin-top:24px;display:flex;gap:12px">
            <a href="https://neverranked.com/#intake" class="btn">Join waitlist</a>
            <a href="/checkout/signal" class="btn btn-ghost">Start with Signal</a>
          </div>
        </div>
      `), 200);
    }
  }

  const url = new URL(request.url);
  const origin = url.origin;

  // Pre-fill email from query param if provided
  const prefillEmail = url.searchParams.get("email") || "";

  // Build checkout session params
  const params: Record<string, string> = {
    "success_url": `${origin}/checkout/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    "cancel_url": `https://neverranked.com/#pricing`,
    "mode": config.mode,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": config.name,
    "line_items[0][price_data][product_data][description]": config.description,
    "line_items[0][price_data][unit_amount]": config.amount.toString(),
    "line_items[0][quantity]": "1",
    "payment_method_types[0]": "card",
    "allow_promotion_codes": "true",
  };

  if (config.mode === "subscription" && config.interval) {
    params["line_items[0][price_data][recurring][interval]"] = config.interval;
  }

  if (prefillEmail) {
    params["customer_email"] = prefillEmail;
  }

  // Metadata for webhook processing
  params["metadata[plan]"] = plan;

  const session = await stripeRequest("/checkout/sessions", env.STRIPE_SECRET_KEY, params);

  if (session.error) {
    console.log(`Stripe error: ${JSON.stringify(session.error)}`);
    return html(layout("Error", `
      <div class="empty">
        <h3>Something went wrong</h3>
        <p>Could not create checkout session. Please try again or contact <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a></p>
      </div>
    `), 500);
  }

  return redirect(session.url);
}

/**
 * GET /checkout/success — Post-payment success page
 */
export async function handleCheckoutSuccess(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") || "audit";
  const config = PLANS[plan];

  const nextStep = plan === "audit"
    ? "We will deliver your full audit within 48 hours. Check your email."
    : "We will set up your dashboard and send you login details within 24 hours.";

  const body = `
    <div style="text-align:center;padding:80px 0">
      <div style="font-size:48px;margin-bottom:24px">&#10003;</div>
      <h1 style="margin-bottom:16px">Payment <em>confirmed</em></h1>
      <div style="font-family:var(--mono);font-size:14px;color:var(--text-faint);margin-bottom:32px;max-width:480px;margin-left:auto;margin-right:auto;line-height:1.7">
        ${config ? config.name : "NeverRanked"} -- ${config ? config.priceLabel : ""}
      </div>
      <div style="padding:24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;max-width:480px;margin:0 auto 32px;font-size:13px;line-height:1.7;color:var(--text-soft)">
        ${nextStep}
      </div>
      <p style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">
        Questions? <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a>
      </p>
    </div>
  `;

  return html(layout("Payment Confirmed", body));
}

/**
 * POST /stripe/webhook — Handle Stripe webhook events
 */
export async function handleStripeWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Webhook not configured", { status: 500 });
  }

  const payload = await request.text();
  const sigHeader = request.headers.get("stripe-signature") || "";

  const valid = await verifyWebhookSignature(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.log("Webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(payload);
  const now = Math.floor(Date.now() / 1000);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const email = session.customer_details?.email?.toLowerCase();
      const plan = session.metadata?.plan;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (!email || !plan) break;

      // Check if user exists
      let user = await env.DB.prepare(
        "SELECT id FROM users WHERE email = ?"
      ).bind(email).first<{ id: number }>();

      if (!user) {
        // Create user for new customers
        await env.DB.prepare(
          "INSERT INTO users (email, role, plan, stripe_customer_id, stripe_subscription_id, created_at) VALUES (?, 'client', ?, ?, ?, ?)"
        ).bind(email, plan, customerId, subscriptionId, now).run();
      } else {
        // Update existing user
        await env.DB.prepare(
          "UPDATE users SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?"
        ).bind(plan, customerId, subscriptionId, user.id).run();
      }

      // Send notification to admin
      if (env.RESEND_API_KEY) {
        try {
          const planConfig = PLANS[plan];
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "NeverRanked <reports@neverranked.com>",
              to: [env.ADMIN_EMAIL],
              subject: `New ${plan} purchase: ${email}`,
              html: `<p>New customer: <strong>${email}</strong></p><p>Plan: <strong>${planConfig?.name || plan}</strong> (${planConfig?.priceLabel || ''})</p><p>Stripe customer: ${customerId || 'N/A'}</p><p>Time: ${new Date().toISOString()}</p>`,
            }),
          });
        } catch (e) {
          console.log(`Admin notification failed: ${e}`);
        }
      }

      console.log(`Checkout completed: ${email} -> ${plan}`);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const subId = subscription.id;

      // Clear subscription from user
      await env.DB.prepare(
        "UPDATE users SET stripe_subscription_id = NULL, plan = 'churned' WHERE stripe_subscription_id = ?"
      ).bind(subId).run();

      // Notify admin
      if (env.RESEND_API_KEY) {
        try {
          const user = await env.DB.prepare(
            "SELECT email FROM users WHERE stripe_customer_id = ?"
          ).bind(subscription.customer).first<{ email: string }>();

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "NeverRanked <reports@neverranked.com>",
              to: [env.ADMIN_EMAIL],
              subject: `Subscription cancelled: ${user?.email || subscription.customer}`,
              html: `<p>Subscription cancelled.</p><p>Customer: <strong>${user?.email || 'unknown'}</strong></p><p>Stripe subscription: ${subId}</p><p>Time: ${new Date().toISOString()}</p>`,
            }),
          });
        } catch (e) {
          console.log(`Churn notification failed: ${e}`);
        }
      }

      console.log(`Subscription cancelled: ${subId}`);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      // Notify admin of failed payment
      if (env.RESEND_API_KEY) {
        try {
          const user = await env.DB.prepare(
            "SELECT email FROM users WHERE stripe_customer_id = ?"
          ).bind(customerId).first<{ email: string }>();

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "NeverRanked <reports@neverranked.com>",
              to: [env.ADMIN_EMAIL],
              subject: `Payment failed: ${user?.email || customerId}`,
              html: `<p>Invoice payment failed.</p><p>Customer: <strong>${user?.email || 'unknown'}</strong></p><p>Amount: $${(invoice.amount_due / 100).toFixed(2)}</p><p>Time: ${new Date().toISOString()}</p>`,
            }),
          });
        } catch (e) {
          console.log(`Payment failure notification failed: ${e}`);
        }
      }
      break;
    }
  }

  return new Response("OK", { status: 200 });
}
