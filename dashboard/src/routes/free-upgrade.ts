/**
 * POST /free/upgrade?plan=<plan>
 *
 * Free-to-paid upgrade entry point. Authenticated via the
 * nr_free cookie. Builds a Stripe Checkout session that carries
 * the free_user_id in metadata so the webhook can reconcile the
 * existing free_users + domains rows into the new paid stack
 * without duplicating the domain or losing scan history.
 *
 * Note: this is a parallel, minimal Stripe-session builder
 * rather than a wrapper around handleCheckout(), because we need
 * to inject metadata[free_user_id] which handleCheckout does not
 * currently expose. The build is small enough that duplication
 * is cheaper than threading another arg through the heavily-
 * used checkout path.
 */

import type { Env } from "../types";
import { html, layout, redirect } from "../render";
import { getFreeUser } from "../free-auth";
import { PLANS } from "./checkout";

export async function handleFreeUpgrade(request: Request, env: Env): Promise<Response> {
  const user = await getFreeUser(request, env);
  if (!user) return redirect("/free/signup");

  if (!env.STRIPE_SECRET_KEY) {
    return html(layout("Upgrade unavailable", `
      <div style="max-width:440px;margin:80px auto;text-align:center">
        <h1 style="margin-bottom:12px"><em>Upgrade unavailable</em></h1>
        <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
          Payments are temporarily unavailable. Email <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a> and we will get you upgraded manually.
        </p>
      </div>
    `), 500);
  }

  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") || "pulse";
  const config = PLANS[plan];
  if (!config || config.comingSoon) {
    return redirect("https://neverranked.com/pricing");
  }

  const origin = url.origin;
  const params: Record<string, string> = {
    "success_url": `${origin}/checkout/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    "cancel_url": `${origin}/free`,
    "mode": config.mode,
    "line_items[0][price]": config.priceId,
    "line_items[0][quantity]": "1",
    "payment_method_types[0]": "card",
    "allow_promotion_codes": "true",
    "customer_email": user.email,
    "metadata[plan]": plan,
    "metadata[free_user_id]": String(user.id),
    "metadata[from_free]": "1",
    // Pre-fill the domain field so the user does not have to
    // retype what they already gave us at signup.
    "custom_fields[0][key]": "domain",
    "custom_fields[0][label][type]": "custom",
    "custom_fields[0][label][custom]": "Domain to monitor",
    "custom_fields[0][type]": "text",
    "custom_fields[0][optional]": "false",
  };

  const body = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[free-upgrade] Stripe session create failed: ${resp.status} ${err}`);
    return html(layout("Upgrade failed", `
      <div style="max-width:440px;margin:80px auto;text-align:center">
        <h1 style="margin-bottom:12px"><em>Something went wrong</em></h1>
        <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
          We could not start your upgrade. Try again in a moment, or email <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a>.
        </p>
        <a href="/free" class="btn btn-ghost">Back to my dashboard</a>
      </div>
    `), 500);
  }

  const session = (await resp.json()) as { url: string };
  return redirect(session.url);
}
