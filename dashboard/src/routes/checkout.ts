/**
 * Dashboard — Stripe checkout routes
 *
 * Uses Stripe Checkout Sessions (hosted) for payment.
 * No Stripe SDK -- direct REST API calls to keep bundle small.
 *
 * Plans:
 *   audit    — $750 one-time
 *   pulse    — $497/mo subscription (waitlist mode until Stripe wired)
 *   signal   — $2,000/mo subscription
 *   amplify  — $4,500/mo subscription
 */

import type { Env, User, Domain } from "../types";
import { layout, html, redirect } from "../render";
import { createMagicLink } from "../auth";
import { scanDomain } from "../scanner";
import { autoGenerateRoadmap } from "../auto-provision";
import { sendSnippetDeliveryEmail } from "../agency-emails";
import {
  handleAgencyCheckoutCompleted,
  handleAgencySubscriptionDeleted,
  handleAgencyInvoiceFailed,
  resolveAgencyId,
} from "../stripe-agency";

// ---------- Plan config ----------

interface PlanConfig {
  name: string;
  priceLabel: string;
  mode: "payment" | "subscription";
  priceId: string;
  /** When true, /checkout/<plan> renders a waitlist capture page instead
   *  of creating a Stripe session. Used for tiers that exist in marketing
   *  copy but don't yet have a Stripe Price configured. Once the Price is
   *  created in Stripe, set comingSoon=false and fill in priceId. */
  comingSoon?: boolean;
}

const PLANS: Record<string, PlanConfig> = {
  audit: {
    name: "NeverRanked Audit",
    priceLabel: "$750",
    mode: "payment",
    priceId: "price_1TLgcBChs9v2cUMPj5Sd7E0o",
  },
  pulse: {
    name: "NeverRanked Pulse",
    priceLabel: "$497/mo",
    mode: "subscription",
    priceId: "",          // Stripe Price not yet created
    comingSoon: true,
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
        <p>Valid plans: audit, pulse, signal, amplify. <a href="https://neverranked.com/#pricing" style="color:var(--gold)">View pricing</a></p>
      </div>
    `), 404);
  }

  // Coming-soon tiers: marketing copy is live but Stripe isn't wired
  // yet. Capture interest into admin_inbox so Lance can reach out
  // manually, instead of dropping the lead with a 404 or a Stripe error.
  if (config.comingSoon) {
    return html(layout(`${config.name} — coming soon`, `
      <div style="max-width:560px;margin:80px auto;padding:0 24px">
        <div style="font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:16px">
          ${config.name} &middot; ${config.priceLabel}
        </div>
        <h1 style="font-family:var(--serif);font-weight:400;font-size:38px;line-height:1.15;margin:0 0 20px 0;letter-spacing:-.01em">
          Reserve your <em>Pulse seat.</em>
        </h1>
        <p style="font-size:15px;line-height:1.7;color:var(--text-mute);margin:0 0 32px 0">
          Drop your email and the domain you want monitored. We will email you a login link within seconds. Two minutes later you are tracking 10 prompts across ChatGPT, Perplexity, Gemini, Google AI Overviews, and Claude. No payment yet -- you are in the founding cohort and we will email a Stripe link once your seat is confirmed.
        </p>
        <form method="POST" action="/checkout/pulse/waitlist" style="display:flex;flex-direction:column;gap:14px">
          <input type="email" name="email" required placeholder="you@yourdomain.com"
            style="font-family:var(--mono);font-size:14px;padding:14px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);border-radius:4px;outline:none">
          <input type="text" name="domain" required placeholder="yourdomain.com"
            style="font-family:var(--mono);font-size:14px;padding:14px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);border-radius:4px;outline:none">
          <textarea name="note" placeholder="Optional: anything you want us to know (current marketing setup, audit reference, etc.)"
            rows="3"
            style="font-family:var(--mono);font-size:13px;padding:12px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);border-radius:4px;outline:none;resize:vertical"></textarea>
          <button type="submit"
            style="font-family:var(--label);text-transform:uppercase;letter-spacing:.2em;font-size:11px;padding:14px 24px;background:var(--gold);color:var(--bg);border:1px solid var(--gold);cursor:pointer;margin-top:6px">
            Reserve my Pulse seat &rarr;
          </button>
        </form>
        <p style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin:24px 0 0 0;line-height:1.6">
          No payment yet. We'll email you a Stripe link once your seat is confirmed.
        </p>
      </div>
    `), 200);
  }

  // For Amplify, check seat cap
  if (plan === "amplify") {
    const activeAmplify = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM users WHERE plan = 'amplify' AND stripe_subscription_id IS NOT NULL"
    ).first<{ count: number }>();
    // Amplify capacity gate. Bumped from 2 -> 6 (2026-04-29):
    // 2 read as "we're at capacity, don't bother" and dampened
    // top-of-funnel inbound. 6 reads as deliberate selectivity
    // while leaving room for the next several customers.
    if (activeAmplify && activeAmplify.count >= 6) {
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

  // Pre-fill email and domain from query params if provided.
  //
  // Defensive validation: URL-decoding turns `+` into a space, so a
  // gmail-style alias like `lance+test@x.com` arrives here as
  // `lance test@x.com` and breaks Stripe's customer_email validation.
  // Rather than try to guess the user's intent, we validate the
  // email shape and SKIP the prefill if it looks malformed -- Stripe
  // will collect it from the user instead, which is preferable to
  // failing the entire checkout creation.
  const rawEmail = url.searchParams.get("email") || "";
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const prefillEmail = EMAIL_RE.test(rawEmail) ? rawEmail : "";

  // Domain prefill: similar defensive check. Strip protocol/path,
  // require something that looks like a domain. Bad value = no prefill.
  const rawDomain = (url.searchParams.get("domain") || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  const prefillDomain = DOMAIN_RE.test(rawDomain) ? rawDomain : "";

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

  // Skip payment method collection when the initial invoice is $0 (e.g.
  // a 100%-off comp coupon on a subscription). Paying customers still
  // have amount_due > 0 and are always required to enter a card. If the
  // comp expires and a renewal invoice hits, Stripe fails the charge
  // and eventually cancels the sub, which the webhook handles.
  //
  // Stripe only allows `payment_method_collection` on subscription-mode
  // sessions. Setting it on a one-time `payment` session (audit) is a
  // hard 400. So we gate it behind the mode.
  if (config.mode === "subscription") {
    params["payment_method_collection"] = "if_required";
  }

  if (prefillDomain) {
    params["custom_fields[0][text][default_value]"] = prefillDomain;
  }

  if (prefillEmail) {
    params["customer_email"] = prefillEmail;
  }

  const session = await stripeRequest("/checkout/sessions", env.STRIPE_SECRET_KEY, params);

  if (session.error) {
    console.log(`Stripe error: ${JSON.stringify(session.error)}`);
    // Diagnostic mode: append ?debug=1 to surface the actual Stripe
    // error message in the response. Without this we can only see the
    // failure via wrangler tail, which is unreliable in production
    // when checkouts fail intermittently. The diagnostic does NOT
    // leak the secret key -- it only echoes Stripe's error payload.
    const debug = url.searchParams.get("debug") === "1";
    return html(layout("Error", `
      <div class="empty">
        <h3>Something went wrong</h3>
        <p>Could not create checkout session. Please try again or contact <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a></p>
        ${debug ? `<pre style="margin-top:24px;padding:16px;background:var(--bg-edge);border:1px solid var(--line);border-radius:4px;font-size:11px;color:var(--text-mute);text-align:left;overflow:auto">${JSON.stringify(session.error, null, 2)}</pre>` : ""}
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

  // ---------- Agency event dispatch ----------
  //
  // Agency subscriptions carry metadata.agency_id on both the Checkout
  // Session and the Subscription. We resolve it up-front and peel off
  // the relevant events before falling through to the direct-client
  // path. This keeps the two billing stacks cleanly separated without
  // duplicating webhook plumbing.
  try {
    const agencyId = await resolveAgencyId(event, env);
    if (agencyId) {
      switch (event.type) {
        case "checkout.session.completed":
          await handleAgencyCheckoutCompleted(event, env);
          return new Response("OK", { status: 200 });
        case "customer.subscription.deleted":
          await handleAgencySubscriptionDeleted(event, env);
          return new Response("OK", { status: 200 });
        case "invoice.payment_failed":
          await handleAgencyInvoiceFailed(event, env);
          return new Response("OK", { status: 200 });
      }
    }
  } catch (e) {
    console.log(`Agency dispatch error (continuing as client event): ${e}`);
  }

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

      // Slug derivation. For custom domains the slug is domain-derived so
      // it reads naturally (acme.com -> "acme"). For generic email providers
      // (gmail, yahoo, etc.) falling back to the email domain would make
      // every gmail user share client_slug="gmail" -- multi-tenant leak.
      // In that case we derive from the email local part + short hash of the
      // full email so two gmail users never collide.
      const GENERIC_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "protonmail.com", "mail.com"];
      let clientSlug: string;
      if (!rawDomain && GENERIC_EMAIL_DOMAINS.includes(emailDomain)) {
        const emailLocal = email.split("@")[0].replace(/[^a-z0-9]/g, "-").slice(0, 40) || "user";
        const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
        const hashHex = Array.from(new Uint8Array(hashBuf)).slice(0, 4).map(b => b.toString(16).padStart(2, "0")).join("");
        clientSlug = `${emailLocal}-${hashHex}`;
      } else {
        clientSlug = provisionDomain.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/g, "-");
      }

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

      // Auto-provision the injection_configs row at the same time the
      // user lands. Without this, the snippet endpoint returns the
      // "not configured" no-op and the customer's snippet install
      // silently does nothing. We hit this exact bug with an existing
      // client (hawaii-theatre) where their team installed the
      // snippet correctly but our backend was never activated, so
      // their site loaded our JS and got 35 bytes of comment back
      // for weeks. Idempotent on the UNIQUE(client_slug) constraint.
      try {
        const snippetToken = Array.from(crypto.getRandomValues(new Uint8Array(8)))
          .map(b => b.toString(16).padStart(2, "0")).join("");
        await env.DB.prepare(
          `INSERT INTO injection_configs (client_slug, snippet_token, business_name, business_url)
             VALUES (?, ?, ?, ?)
           ON CONFLICT(client_slug) DO NOTHING`
        ).bind(slug, snippetToken, provisionDomain, `https://${provisionDomain}`).run();
      } catch (e) {
        // Don't block checkout if config creation fails. Log it so the
        // drift-detection cron can pick it up.
        console.log(`Failed to auto-create injection_config for ${slug}: ${e}`);
      }

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

        // Snippet delivery for self-signup paid plans. Audit is a
        // one-time deliverable with no ongoing schema injection, so
        // skip the snippet email for that tier. Signal + Amplify both
        // include schema auto-injection -- the snippet is required.
        if (plan === "signal" || plan === "amplify") {
          try {
            const domainRow = await env.DB.prepare(
              "SELECT * FROM domains WHERE id = ?"
            ).bind(domainId).first<Domain>();
            if (domainRow && !domainRow.snippet_email_sent_at) {
              const sent = await sendSnippetDeliveryEmail(env, { domain: domainRow, to: email });
              if (sent) {
                await env.DB.prepare(
                  "UPDATE domains SET snippet_email_sent_at = ? WHERE id = ?"
                ).bind(now, domainId).run();
                console.log(`[checkout] snippet email sent to ${email} for ${provisionDomain}`);
              }
            }
          } catch (e) {
            console.log(`[checkout] snippet email failed for ${email}: ${e}`);
          }
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

      // Send welcome email with magic link to customer.
      //
      // CRITICAL: fetch() does not throw on HTTP 4xx/5xx -- only on
      // network-layer failures. If the Resend API key is ever rotated,
      // revoked, or rate-limited, the call returns a non-2xx response
      // body and our previous try/catch would silently log nothing.
      // Result: paid customer, no welcome email, zero alert. We now
      // explicitly check resp.ok and treat any non-2xx as a failure
      // that fires the same admin_alerts row.
      if (env.RESEND_API_KEY) {
        try {
          // 72-hour TTL for the post-checkout welcome email. A new
          // customer who paid but doesn't open their inbox until the
          // next day shouldn't get locked out of the dashboard they
          // just bought.
          const magicToken = await createMagicLink(email, env, 72 * 60 * 60);
          if (magicToken) {
            const dashboardOrigin = env.DASHBOARD_ORIGIN || "https://app.neverranked.com";
            // Pulse customers go straight into the prompt-suggester
            // onboarding screen. Other plans land on the dashboard.
            const next = plan === "pulse" ? "/onboard/pulse" : "/";
            const loginUrl = `${dashboardOrigin}/auth/verify?token=${magicToken}&next=${encodeURIComponent(next)}`;
            const planConfig = PLANS[plan];

            const welcomeResp = await fetch("https://api.resend.com/emails", {
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
            if (!welcomeResp.ok) {
              const respText = await welcomeResp.text();
              throw new Error(`Resend send failed: HTTP ${welcomeResp.status} -- ${respText.slice(0, 300)}`);
            }
          } else {
            throw new Error("createMagicLink returned null (rate limited or user not found)");
          }
        } catch (e) {
          console.log(`Welcome email failed: ${e}`);
          // Surface this in /admin/inbox so Lance can manually resend the
          // magic link. Without the alert the user has a paid account but
          // no way to log in and no signal reaches ops.
          try {
            await env.DB.prepare(
              `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
                 VALUES ('_system', 'welcome_email_failed', ?, ?, ?)`
            ).bind(
              `Welcome email failed: ${email}`,
              `Checkout succeeded for ${email} (${plan}) but the welcome email with magic link did not send. Error: ${String(e).slice(0, 500)}. Resend manually.`,
              now,
            ).run();
          } catch (alertErr) {
            console.log(`Failed to insert welcome_email_failed alert: ${alertErr}`);
          }
        }

        // Send notification to admin (same explicit-status pattern as above)
        try {
          const planConfig = PLANS[plan];
          const adminResp = await fetch("https://api.resend.com/emails", {
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
          if (!adminResp.ok) {
            const respText = await adminResp.text();
            throw new Error(`Admin notify send failed: HTTP ${adminResp.status} -- ${respText.slice(0, 300)}`);
          }
        } catch (e) {
          console.log(`Admin notification failed: ${e}`);
          // Lower priority than the customer email but still worth a
          // log row so we can detect API key issues across both paths.
          try {
            await env.DB.prepare(
              `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
                 VALUES ('_system', 'admin_notify_failed', ?, ?, ?)`
            ).bind(
              `Admin notification failed for ${email} (${plan})`,
              `Customer welcome email may also have failed -- check welcome_email_failed alerts. Error: ${String(e).slice(0, 500)}.`,
              now,
            ).run();
          } catch { /* swallow */ }
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
          // Check both attribution paths: direct customer (user) and
          // agency subscription (agency.stripe_customer_id). Either may
          // hit, never both.
          const user = await env.DB.prepare(
            "SELECT email, name FROM users WHERE stripe_customer_id = ?"
          ).bind(customerId).first<{ email: string; name: string | null }>();
          const agencyRow = !user
            ? await env.DB.prepare(
                "SELECT id, name, contact_email FROM agencies WHERE stripe_customer_id = ?"
              ).bind(customerId).first<{ id: number; name: string; contact_email: string | null }>()
            : null;

          // Admin alert (existing behavior, names whichever attribution we found)
          const adminLabel = user?.email || agencyRow?.contact_email || customerId;
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "NeverRanked <reports@neverranked.com>",
              to: [env.ADMIN_EMAIL],
              subject: `Payment failed: ${adminLabel}${agencyRow ? " (agency)" : ""}`,
              html: `<p>Invoice payment failed.</p><p>${agencyRow ? "Agency" : "Customer"}: <strong>${adminLabel}</strong></p><p>Amount: $${(invoice.amount_due / 100).toFixed(2)}</p><p>Time: ${new Date().toISOString()}</p>`,
            }),
          });

          // CUSTOMER / agency notification: the actual leverage move.
          // Stripe retries automatically but the customer needs to know
          // NOW so they can update the card before the auto-cancel kicks in.
          const { sendPaymentFailedEmail } = await import("../email");
          const origin = env.DASHBOARD_ORIGIN || "https://app.neverranked.com";

          if (user?.email) {
            await sendPaymentFailedEmail(user.email, user.name, {
              amountDueCents: invoice.amount_due,
              nextRetryAt: invoice.next_payment_attempt || null,
              portalUrl: `${origin}/billing/portal`,
            }, env);
          } else if (agencyRow?.contact_email) {
            // Agency contact gets the same email but with the agency-side
            // billing portal as the action target.
            const { getAgency } = await import("../agency");
            const agencyFull = await getAgency(env, agencyRow.id);
            await sendPaymentFailedEmail(agencyRow.contact_email, null, {
              amountDueCents: invoice.amount_due,
              nextRetryAt: invoice.next_payment_attempt || null,
              portalUrl: `${origin}/agency/billing`,
            }, env, agencyFull);
          }
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

  // Agency admins -> use the agency's stripe customer + return to
  // /agency/billing. Direct customers -> their own user row.
  let customerId: string | null = user.stripe_customer_id || null;
  let returnPath = "/settings";
  if (user.role === "agency_admin" && user.agency_id) {
    const agency = await env.DB.prepare(
      "SELECT stripe_customer_id FROM agencies WHERE id = ?"
    ).bind(user.agency_id).first<{ stripe_customer_id: string | null }>();
    if (agency?.stripe_customer_id) {
      customerId = agency.stripe_customer_id;
      returnPath = "/agency/billing";
    }
  }

  if (!customerId) {
    return html(layout("Billing", `
      <div class="empty">
        <h3>No billing account</h3>
        <p>You don't have an active subscription. <a href="https://neverranked.com/#pricing" style="color:var(--gold)">View plans</a></p>
      </div>
    `, user), 404);
  }

  const origin = new URL(request.url).origin;
  const session = await stripeRequest("/billing_portal/sessions", env.STRIPE_SECRET_KEY, {
    customer: customerId,
    return_url: `${origin}${returnPath}`,
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
  let whatHappensNext: string;
  if (plan === "audit") {
    whatHappensNext = `<p style="margin:0 0 8px">Your full AEO audit is being prepared and will be delivered within 48 hours. In the meantime, your dashboard is live -- log in now to complete onboarding so we can start immediately.</p>`;
  } else if (plan === "pulse") {
    whatHappensNext = `<p style="margin:0 0 8px">Your seat is reserved. Click below to log in -- you will land on a 2-minute setup screen with 10 prompts we suggest tracking for you. Edit them, save, and we will run your first citation scan across ChatGPT, Perplexity, Gemini, Google AI Overviews, and Claude in the background. Initial results land in your dashboard within hours.</p>`;
  } else {
    whatHappensNext = `<p style="margin:0 0 8px">Your dashboard is live and ready. Log in now to complete onboarding -- it takes about 2 minutes and helps us tailor everything to your business.</p>`;
  }

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
      <p style="font-size:11px;color:#555;margin-top:12px">This link is valid for 72 hours.</p>
    </div>

    <div style="border-top:1px solid #1a1a1a;padding-top:24px;font-size:11px;color:#444;line-height:1.6">
      <p style="margin:0 0 4px">Questions? Reply to this email or reach us at hello@neverranked.com</p>
      <p style="margin:0">NeverRanked -- AI visibility for businesses that depend on being found.</p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * POST /checkout/pulse/waitlist — fully self-serve Pulse onboarding.
 *
 * Until the Stripe Price for Pulse exists, this is the entry point.
 * Once Stripe is wired (PLANS.pulse.comingSoon=false + priceId set),
 * /checkout/pulse routes to Stripe instead and the Stripe webhook
 * does the same provisioning. Either way, by the time the customer
 * clicks the magic link they land on /onboard/pulse with their plan
 * already set.
 *
 * Provisioning steps (idempotent on email + domain):
 *   1. Validate email + domain
 *   2. Create or find user, set client_slug
 *   3. Create or update domains row with plan='pulse'
 *   4. Create injection_configs row (snippet token)
 *   5. Generate magic link with next=/onboard/pulse
 *   6. Send welcome email
 *   7. Drop FYI row into admin_inbox so Lance sees the activity
 *      (urgency=low -- nothing is blocking on him)
 *   8. Show "check your email" page
 */
export async function handlePulseWaitlist(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let email = "";
  let rawDomain = "";
  let note = "";
  try {
    const form = await request.formData();
    email = (form.get("email") || "").toString().trim().toLowerCase();
    rawDomain = (form.get("domain") || "").toString().trim().toLowerCase()
      .replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    note = (form.get("note") || "").toString().trim().slice(0, 1000);
  } catch (e) {
    return html(layout("Bad request", `
      <div class="empty"><h3>Could not read form</h3><p>Try again or email lance@neverranked.com.</p></div>
    `), 400);
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  if (!EMAIL_RE.test(email) || !DOMAIN_RE.test(rawDomain)) {
    return html(layout("Missing fields", `
      <div class="empty"><h3>Email and a valid domain are both required</h3>
      <p><a href="/checkout/pulse" style="color:var(--gold)">Try again</a></p></div>
    `), 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const clientSlug = rawDomain.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/g, "-");

  // 1. User: find or create, set client_slug + plan=pulse
  let user = await env.DB.prepare(
    "SELECT id, client_slug FROM users WHERE email = ?"
  ).bind(email).first<{ id: number; client_slug: string | null }>();

  if (!user) {
    const result = await env.DB.prepare(
      "INSERT INTO users (email, role, plan, client_slug, created_at) VALUES (?, 'client', 'pulse', ?, ?)"
    ).bind(email, clientSlug, now).run();
    user = { id: Number(result.meta?.last_row_id ?? 0), client_slug: clientSlug };
  } else {
    // Idempotent: existing user re-submitting waitlist gets their
    // client_slug filled in if missing, plan upgraded to pulse if
    // they were unset. Won't downgrade Signal/Amplify customers.
    await env.DB.prepare(
      `UPDATE users
         SET client_slug = COALESCE(client_slug, ?),
             plan = COALESCE(plan, 'pulse')
       WHERE id = ?`
    ).bind(clientSlug, user.id).run();
    if (!user.client_slug) user.client_slug = clientSlug;
  }
  const slug = user.client_slug || clientSlug;

  // 2. Domains row: insert or update plan to pulse
  const existingDomain = await env.DB.prepare(
    "SELECT id, plan FROM domains WHERE client_slug = ? AND domain = ? LIMIT 1"
  ).bind(slug, rawDomain).first<{ id: number; plan: string | null }>();
  if (!existingDomain) {
    await env.DB.prepare(
      `INSERT INTO domains (client_slug, domain, plan, is_competitor, active, created_at, updated_at)
         VALUES (?, ?, 'pulse', 0, 1, ?, ?)`
    ).bind(slug, rawDomain, now, now).run();
  } else if (!existingDomain.plan) {
    // Don't overwrite a Signal/Amplify plan already set on this domain.
    await env.DB.prepare(
      "UPDATE domains SET plan = 'pulse', updated_at = ? WHERE id = ?"
    ).bind(now, existingDomain.id).run();
  }

  // 3. Injection config (snippet token) -- idempotent on UNIQUE(client_slug)
  try {
    const snippetToken = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare(
      `INSERT INTO injection_configs (client_slug, snippet_token, business_name, business_url)
         VALUES (?, ?, ?, ?)
       ON CONFLICT(client_slug) DO NOTHING`
    ).bind(slug, snippetToken, rawDomain, `https://${rawDomain}`).run();
  } catch (e) {
    console.log(`pulse_waitlist injection_config failed for ${slug}: ${e}`);
  }

  // 4. NVI subscription -- without this row the monthly NVI cron
  //    silently skips Pulse customers. Idempotent on UNIQUE(client_slug).
  //    delivery_day=1 means report fires on the 1st of every UTC month.
  try {
    await env.DB.prepare(
      `INSERT INTO nvi_subscriptions (client_slug, tier, active, delivery_email, delivery_day)
         VALUES (?, 'pulse', 1, ?, 1)
       ON CONFLICT(client_slug) DO UPDATE SET active = 1, delivery_email = excluded.delivery_email`
    ).bind(slug, email).run();
  } catch (e) {
    console.log(`pulse_waitlist nvi_subscription failed for ${slug}: ${e}`);
  }

  // 5. Magic link + welcome email -> drops them on /onboard/pulse
  let emailSent = false;
  if (env.RESEND_API_KEY) {
    try {
      const magicToken = await createMagicLink(email, env, 72 * 60 * 60);
      if (magicToken) {
        const dashboardOrigin = env.DASHBOARD_ORIGIN || "https://app.neverranked.com";
        const loginUrl = `${dashboardOrigin}/auth/verify?token=${magicToken}&next=${encodeURIComponent("/onboard/pulse")}`;
        const welcomeResp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "NeverRanked <reports@neverranked.com>",
            to: [email],
            subject: "Your Pulse seat is ready -- 2 minutes to set up",
            html: buildWelcomeEmail(PLANS.pulse, loginUrl, "pulse"),
          }),
        });
        emailSent = welcomeResp.ok;
        if (!welcomeResp.ok) {
          const respText = await welcomeResp.text();
          console.log(`Pulse welcome email failed: HTTP ${welcomeResp.status} -- ${respText.slice(0, 300)}`);
        }
      }
    } catch (e) {
      console.log(`Pulse welcome email exception: ${e}`);
    }
  }

  // 6. Low-urgency FYI in admin_inbox -- no manual action required.
  //    If the welcome email failed, mark high so Lance can resend.
  try {
    await env.DB.prepare(
      `INSERT INTO admin_inbox (kind, urgency, title, body, action_url, target_slug, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`
    ).bind(
      "pulse_signup",
      emailSent ? "low" : "high",
      emailSent
        ? `Pulse signup: ${email} (auto-onboarded)`
        : `Pulse signup: ${email} -- WELCOME EMAIL FAILED, resend manually`,
      `Domain: ${rawDomain}\nSlug: ${slug}\nNote: ${note || "(none)"}\nWelcome email: ${emailSent ? "sent" : "FAILED"}\nSubmitted: ${new Date(now * 1000).toISOString()}`,
      `/admin/clients/${encodeURIComponent(slug)}`,
      slug,
      now,
    ).run();
  } catch (e) {
    console.log(`pulse_signup admin_inbox insert failed: ${e}`);
  }

  // 7. Confirmation page
  return html(layout("Check your email", `
    <div style="max-width:520px;margin:80px auto;padding:0 24px;text-align:center">
      <div style="font-size:42px;color:var(--gold);margin-bottom:16px">&#10003;</div>
      <h1 style="font-family:var(--serif);font-weight:400;font-size:32px;margin:0 0 16px 0">Seat reserved. Check your email.</h1>
      <p style="font-size:15px;line-height:1.7;color:var(--text-mute);margin:0 0 28px 0">
        We sent a login link to <strong>${email.replace(/</g, "&lt;")}</strong>. Click it to land on a 2-minute setup screen with 10 prompts we suggest tracking for <strong>${rawDomain}</strong>. Edit them, save, and your first citation scan kicks off in the background.
      </p>
      <p style="font-family:var(--mono);font-size:12px;color:var(--text-faint);margin:0">
        No email after a minute? Check spam or
        <a href="mailto:lance@neverranked.com?subject=Pulse%20welcome%20email%20did%20not%20arrive" style="color:var(--gold)">tell Lance</a>.
      </p>
    </div>
  `));
}
