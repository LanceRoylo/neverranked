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

import type { Env, User, Domain } from "../types";
import { layout, html, redirect } from "../render";
import { createMagicLink } from "../auth";
import { scanDomain } from "../scanner";
import { autoGenerateRoadmap } from "../auto-provision";

// ---------- Plan config ----------

interface PlanConfig {
  name: string;
  priceLabel: string;
  mode: "payment" | "subscription";
  priceId: string;
}

const PLANS: Record<string, PlanConfig> = {
  audit: {
    name: "NeverRanked Audit",
    priceLabel: "$500",
    mode: "payment",
    priceId: "price_1TLgcBChs9v2cUMPj5Sd7E0o",
  },
  signal: {
    name: "NeverRanked Signal",
    priceLabel: "$2,000/mo",
    mode: "subscription",
    priceId: "price_1TLgcZChs9v2cUMPgum7Ujgt",
  },
  amplify: {
    name: "NeverRanked Amplify",
    priceLabel: "$4,500/mo",
    mode: "subscription",
    priceId: "price_1TLgctChs9v2cUMPFGY47fcC",
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
          <h3>Amplify is at capacity</h3>
          <p style="max-width:440px">Amplify is a hands-on engagement. We cap the roster to keep quality high. Join the waitlist and we will reach out when a spot opens, or start with Signal in the meantime.</p>
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

  // Pre-fill email and domain from query params if provided
  const prefillEmail = url.searchParams.get("email") || "";
  const prefillDomain = url.searchParams.get("domain") || "";

  // Build checkout session params using pre-created Stripe Price IDs
  const params: Record<string, string> = {
    "success_url": `${origin}/checkout/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    "cancel_url": `https://neverranked.com/#pricing`,
    "mode": config.mode,
    "line_items[0][price]": config.priceId,
    "line_items[0][quantity]": "1",
    "payment_method_types[0]": "card",
    "allow_promotion_codes": "true",
    "metadata[plan]": plan,
    // Ask for the domain to monitor during checkout
    "custom_fields[0][key]": "domain",
    "custom_fields[0][label][type]": "custom",
    "custom_fields[0][label][custom]": "Domain to monitor (e.g. yourbusiness.com)",
    "custom_fields[0][type]": "text",
  };

  if (prefillDomain) {
    params["custom_fields[0][text][default_value]"] = prefillDomain;
  }

  if (prefillEmail) {
    params["customer_email"] = prefillEmail;
  }

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
    ? "Check your email for your dashboard login link. Your full audit will be delivered within 48 hours."
    : "Check your email for your dashboard login link. Your dashboard is ready to go.";

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

      // Get domain from checkout custom field, fall back to email domain
      const customFields = session.custom_fields || [];
      const domainField = customFields.find((f: any) => f.key === "domain");
      const rawDomain = (domainField?.text?.value || "").trim().toLowerCase()
        .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      const emailDomain = email.split("@")[1];
      const provisionDomain = rawDomain || emailDomain;
      const clientSlug = provisionDomain.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/g, "-");

      // Check if user exists
      let user = await env.DB.prepare(
        "SELECT id, client_slug FROM users WHERE email = ?"
      ).bind(email).first<{ id: number; client_slug: string | null }>();

      if (!user) {
        // Create user with client_slug auto-derived from email domain
        const result = await env.DB.prepare(
          "INSERT INTO users (email, role, plan, client_slug, stripe_customer_id, stripe_subscription_id, created_at) VALUES (?, 'client', ?, ?, ?, ?, ?)"
        ).bind(email, plan, clientSlug, customerId, subscriptionId, now).run();
        const userId = result.meta?.last_row_id ?? 0;
        user = { id: Number(userId), client_slug: clientSlug };
      } else {
        // Update existing user -- set client_slug if missing
        await env.DB.prepare(
          "UPDATE users SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?, client_slug = COALESCE(client_slug, ?) WHERE id = ?"
        ).bind(plan, customerId, subscriptionId, clientSlug, user.id).run();
        if (!user.client_slug) user.client_slug = clientSlug;
      }

      // Auto-provision: add domain if it doesn't exist yet
      const slug = user.client_slug || clientSlug;
      const existingDomain = await env.DB.prepare(
        "SELECT id FROM domains WHERE domain = ? AND client_slug = ?"
      ).bind(provisionDomain, slug).first<{ id: number }>();

      let domainId: number | null = null;
      if (!existingDomain) {
        // Skip generic email providers (only when falling back to email domain)
        const genericDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "protonmail.com", "mail.com"];
        if (rawDomain || !genericDomains.includes(provisionDomain)) {
          const domResult = await env.DB.prepare(
            "INSERT INTO domains (client_slug, domain, is_competitor, active, created_at, updated_at) VALUES (?, ?, 0, 1, ?, ?)"
          ).bind(slug, provisionDomain, now, now).run();
          domainId = Number(domResult.meta?.last_row_id ?? 0);
        }
      } else {
        domainId = existingDomain.id;
      }

      // Trigger initial scan + auto-generate roadmap
      if (domainId) {
        try {
          const scanResult = await scanDomain(domainId, `https://${provisionDomain}/`, "onboard", env);
          if (scanResult && !scanResult.error) {
            await autoGenerateRoadmap(slug, scanResult, env);
          }
        } catch (e) {
          console.log(`Auto-provision scan failed: ${e}`);
        }
      }

      // Mark lead as converted in KV (if they came from free scan)
      try {
        const leadKey = `lead:${email}`;
        const leadRaw = await env.LEADS.get(leadKey);
        if (leadRaw) {
          const leadData = JSON.parse(leadRaw);
          leadData.converted = true;
          leadData.converted_at = new Date().toISOString();
          leadData.converted_plan = plan;
          await env.LEADS.put(leadKey, JSON.stringify(leadData));
        }
      } catch (e) {
        console.log(`Lead conversion tracking failed: ${e}`);
      }

      // Send welcome email with magic link to customer
      if (env.RESEND_API_KEY) {
        try {
          const magicToken = await createMagicLink(email, env);
          if (magicToken) {
            const dashboardOrigin = env.DASHBOARD_ORIGIN || "https://app.neverranked.com";
            const loginUrl = `${dashboardOrigin}/auth/verify?token=${magicToken}`;
            const planConfig = PLANS[plan];

            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "NeverRanked <reports@neverranked.com>",
                to: [email],
                subject: `Welcome to ${planConfig?.name || "NeverRanked"} -- your dashboard is ready`,
                html: buildWelcomeEmail(planConfig, loginUrl, plan),
              }),
            });
          }
        } catch (e) {
          console.log(`Welcome email failed: ${e}`);
        }

        // Send notification to admin
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

// ---------- Billing Portal ----------

/**
 * POST /billing/portal — Create Stripe Billing Portal session and redirect
 */
export async function handleBillingPortal(
  user: User,
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return html(layout("Error", `
      <div class="empty">
        <h3>Billing not configured</h3>
        <p>Please contact <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a></p>
      </div>
    `, user), 500);
  }

  if (!user.stripe_customer_id) {
    return html(layout("Billing", `
      <div class="empty">
        <h3>No billing account</h3>
        <p>You don't have an active subscription. <a href="https://neverranked.com/#pricing" style="color:var(--gold)">View plans</a></p>
      </div>
    `, user), 404);
  }

  const origin = new URL(request.url).origin;
  const session = await stripeRequest("/billing_portal/sessions", env.STRIPE_SECRET_KEY, {
    customer: user.stripe_customer_id,
    return_url: `${origin}/settings`,
  });

  if (session.error) {
    console.log(`Stripe portal error: ${JSON.stringify(session.error)}`);
    return html(layout("Error", `
      <div class="empty">
        <h3>Something went wrong</h3>
        <p>Could not open billing portal. Please contact <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a></p>
      </div>
    `, user), 500);
  }

  return redirect(session.url);
}

// ---------- Email templates ----------

function buildWelcomeEmail(planConfig: PlanConfig | undefined, loginUrl: string, plan: string): string {
  const planName = planConfig?.name || "NeverRanked";
  const whatHappensNext = plan === "audit"
    ? `<p style="margin:0 0 8px">Your full AEO audit is being prepared and will be delivered within 48 hours. In the meantime, your dashboard is live -- log in now to complete onboarding so we can start immediately.</p>`
    : `<p style="margin:0 0 8px">Your dashboard is live and ready. Log in now to complete onboarding -- it takes about 2 minutes and helps us tailor everything to your business.</p>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,system-ui,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px">

    <div style="margin-bottom:32px">
      <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">NeverRanked</span>
    </div>

    <h1 style="font-size:22px;font-weight:600;color:#ffffff;margin:0 0 8px;line-height:1.3">
      Welcome to ${planName}
    </h1>
    <p style="font-size:14px;color:#888;margin:0 0 32px">
      Your payment is confirmed. Here is what happens next.
    </p>

    <div style="background:#111;border:1px solid #222;border-radius:6px;padding:24px;margin-bottom:32px">
      <div style="font-size:13px;color:#ccc;line-height:1.7">
        ${whatHappensNext}
      </div>
    </div>

    <div style="text-align:center;margin-bottom:40px">
      <a href="${loginUrl}" style="display:inline-block;background:#c8a850;color:#0a0a0a;font-size:14px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:4px;letter-spacing:0.3px">
        Log in to your dashboard
      </a>
      <p style="font-size:11px;color:#555;margin-top:12px">This link expires in 15 minutes.</p>
    </div>

    <div style="border-top:1px solid #1a1a1a;padding-top:24px;font-size:11px;color:#444;line-height:1.6">
      <p style="margin:0 0 4px">Questions? Reply to this email or reach us at hello@neverranked.com</p>
      <p style="margin:0">NeverRanked -- AI visibility for businesses that depend on being found.</p>
    </div>

  </div>
</body>
</html>`;
}
