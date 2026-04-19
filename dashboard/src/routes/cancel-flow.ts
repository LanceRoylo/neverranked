/**
 * Dashboard -- Cancellation interstitial + exit survey
 *
 * Routes:
 *   GET  /settings/cancel  -> interstitial with options
 *   POST /settings/cancel  -> record survey + dispatch outcome
 *
 * Why this exists: previously the only path to cancel was through
 * Stripe's billing portal, which gave us zero signal on WHY anyone
 * left and no chance to offer alternatives. The interstitial is
 * intentionally NOT a dark pattern -- the user can proceed to
 * Stripe in one click. But before they do, we offer:
 *
 *   - Pause instead of cancel (cancel_at_period_end via Stripe API)
 *   - Talk to the founder (mailto:)
 *   - Update payment method only (often the real intent)
 *   - Cancel anyway (records reason, redirects to Stripe portal)
 *
 * The exit_surveys row is recorded regardless of the chosen
 * outcome so we have signal even on the "I just need to update my
 * card" cases.
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";

const REASONS: Array<{ value: string; label: string }> = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_seeing_value", label: "Not seeing the value yet" },
  { value: "missing_feature", label: "Missing a specific feature" },
  { value: "too_complicated", label: "Too complicated to use" },
  { value: "no_longer_need", label: "No longer need this" },
  { value: "other", label: "Other (tell us in the box)" },
];

export async function handleCancelFlowGet(user: User, env: Env, url: URL): Promise<Response> {
  const flash = url.searchParams.get("flash");
  const flashError = url.searchParams.get("error");
  const flashBlock = flash
    ? `<div class="flash">${esc(flash)}</div>`
    : flashError
    ? `<div class="flash flash-error">${esc(flashError)}</div>`
    : "";

  const reasonOptions = REASONS.map((r) =>
    `<label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--line);border-radius:4px;cursor:pointer;margin-bottom:6px">
      <input type="radio" name="reason" value="${r.value}" required>
      <span>${esc(r.label)}</span>
    </label>`
  ).join("");

  const body = `
    <div class="section-header">
      <h1>Before you <em>go</em></h1>
      <p class="section-sub">A few quick options. None of them are dark patterns -- if you want to cancel, the bottom button takes you straight to Stripe.</p>
    </div>

    ${flashBlock}

    <div style="display:flex;flex-direction:column;gap:14px;max-width:680px">
      <!-- Pause -->
      <form method="POST" action="/settings/cancel" class="card" style="border-color:var(--gold-dim)">
        <input type="hidden" name="outcome" value="paused_instead">
        <input type="hidden" name="reason" value="paused">
        <h3 style="margin:0 0 8px">Pause instead of cancel</h3>
        <p style="color:var(--text-faint);font-size:13px;line-height:1.6;margin:0 0 14px">
          We set your subscription to cancel at the end of the current billing period.
          You keep access until then, no further charges. Resume anytime.
        </p>
        <button type="submit" class="btn btn-ghost">Pause my subscription</button>
      </form>

      <!-- Talk to founder -->
      <form method="POST" action="/settings/cancel" class="card">
        <input type="hidden" name="outcome" value="requested_call">
        <input type="hidden" name="reason" value="wants_to_talk">
        <h3 style="margin:0 0 8px">15 minutes with Lance first</h3>
        <p style="color:var(--text-faint);font-size:13px;line-height:1.6;margin:0 0 14px">
          Sometimes a 15-minute conversation surfaces the actual problem (or shows
          you a feature you didn't know existed). Reply yes here and Lance will email
          to schedule.
        </p>
        <button type="submit" class="btn btn-ghost">Yes, let's talk first</button>
      </form>

      <!-- Update payment -->
      <form method="POST" action="/settings/cancel" class="card">
        <input type="hidden" name="outcome" value="abandoned">
        <input type="hidden" name="reason" value="update_payment">
        <h3 style="margin:0 0 8px">I just need to update my card</h3>
        <p style="color:var(--text-faint);font-size:13px;line-height:1.6;margin:0 0 14px">
          The Stripe billing portal handles card updates without canceling anything.
          We'll send you straight there.
        </p>
        <button type="submit" class="btn btn-ghost">Open Stripe billing portal</button>
      </form>

      <!-- Actually cancel -->
      <form method="POST" action="/settings/cancel" class="card" style="border-color:var(--red);border-width:1px">
        <input type="hidden" name="outcome" value="proceeded_to_cancel">
        <h3 style="margin:0 0 8px">Cancel my subscription</h3>
        <p style="color:var(--text-faint);font-size:13px;line-height:1.6;margin:0 0 16px">
          We'll send you to Stripe to finalize. Quick question first -- what made you decide to leave?
          (Honest answers help us actually fix things.)
        </p>
        <div style="display:flex;flex-direction:column;margin-bottom:12px">
          ${reasonOptions}
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label for="details" style="font-size:12px;color:var(--text-faint)">Anything else (optional)</label>
          <textarea id="details" name="details" rows="3" maxlength="2000" placeholder="What would have made you stay? What did you wish worked differently?" style="width:100%;font-family:var(--mono);font-size:13px"></textarea>
        </div>
        <button type="submit" class="btn" style="background:var(--red)">Continue to cancel</button>
      </form>
    </div>
  `;

  return html(layout("Before you go", body, user));
}

export async function handleCancelFlowPost(request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const outcome = (form.get("outcome") as string || "abandoned").trim();
  const reason = (form.get("reason") as string || "other").trim();
  const details = (form.get("details") as string || "").trim().slice(0, 2000) || null;
  const now = Math.floor(Date.now() / 1000);

  // Record the survey regardless of outcome -- signal is signal.
  try {
    await env.DB.prepare(
      `INSERT INTO exit_surveys
         (user_id, user_email, reason, details, outcome, client_slug, agency_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      user.id, user.email, reason, details, outcome,
      user.client_slug || null, user.agency_id || null, now,
    ).run();
  } catch (e) {
    console.log(`[cancel-flow] survey insert failed: ${e}`);
  }

  // Always file an admin alert so Lance sees the signal in the inbox.
  try {
    await env.DB.prepare(
      `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
         VALUES (?, 'cancel_intent', ?, ?, ?)`
    ).bind(
      user.client_slug || "_system",
      `Cancel-flow: ${user.email} -- outcome=${outcome}`,
      `Reason: ${reason}. ${details ? `Notes: ${details.slice(0, 300)}` : ""}`,
      now,
    ).run();
  } catch {}

  // Dispatch by outcome.
  switch (outcome) {
    case "paused_instead": {
      // Set cancel_at_period_end via Stripe so the user keeps access
      // until the end of the period and we don't double-charge.
      if (env.STRIPE_SECRET_KEY && user.stripe_subscription_id) {
        try {
          await fetch(`https://api.stripe.com/v1/subscriptions/${user.stripe_subscription_id}`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "cancel_at_period_end=true",
          });
        } catch (e) {
          console.log(`[cancel-flow] Stripe pause failed: ${e}`);
        }
      }
      return redirect("/settings?flash=" + encodeURIComponent(
        "Paused. Your subscription will end at the close of the current billing period. You can resume anytime by reopening the Stripe portal."
      ));
    }

    case "requested_call": {
      // Mailto opens the user's email client pre-addressed to Lance.
      // The admin_alert already fired above so Lance also sees it.
      const subject = encodeURIComponent(`I want to talk before canceling NeverRanked`);
      const body = encodeURIComponent(
        `Hi Lance,\n\nI was about to cancel NeverRanked but want to chat first.\n\nWhat I'm thinking:\n\n[your notes]\n\nWhen works for a 15-min call?\n\nThanks,\n${user.name || ""}`
      );
      return new Response(null, {
        status: 302,
        headers: { Location: `mailto:hello@neverranked.com?subject=${subject}&body=${body}` },
      });
    }

    case "abandoned":
    case "proceeded_to_cancel":
    default: {
      // Both go to Stripe portal. Difference: "proceeded_to_cancel"
      // has a real reason recorded; "abandoned" was the
      // update-payment intent and the survey row reflects that.
      if (env.STRIPE_SECRET_KEY && user.stripe_customer_id) {
        try {
          const origin = new URL(request.url).origin;
          const session = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              customer: user.stripe_customer_id,
              return_url: `${origin}/settings`,
            }).toString(),
          }).then((r) => r.json() as Promise<{ url?: string; error?: { message: string } }>);
          if (session.url) return redirect(session.url);
          console.log(`[cancel-flow] Stripe portal failed: ${session.error?.message}`);
        } catch (e) {
          console.log(`[cancel-flow] Stripe portal threw: ${e}`);
        }
      }
      return redirect("/settings?error=" + encodeURIComponent("Could not open billing portal. Email hello@neverranked.com."));
    }
  }
}
