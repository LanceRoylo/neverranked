/**
 * Dashboard -- Agency self-serve "add a client" flow
 *
 * Routes:
 *   GET  /agency/clients/new  -> form with plan + access mode pickers + live slot preview
 *   POST /agency/clients/new  -> validate, insert, reconcile slots, fire snippet email,
 *                                 trigger first scan + auto-roadmap
 *
 * Why this exists: previously agencies needed Lance (admin) to add a
 * new client. That broke at scale -- every new sale required ops to
 * provision the slot. Now agency_admins do it themselves.
 *
 * Reuses existing building blocks:
 *   reconcileAgencySlots()         -> Stripe quantity update + lazy Amplify create
 *   sendSnippetDeliveryEmail()     -> install instructions to agency contact
 *   scanDomain()                   -> first AEO scan
 *   autoGenerateRoadmap()          -> generate Phase 1 from scan findings
 *
 * Auth: agency_admin only. Hardcodes agency_id from user.agency_id
 * (never trusts the form). Blocks if agency status is not 'active'
 * or no Stripe subscription exists.
 */

import type { Env, User, Agency } from "../types";
import { layout, html, esc, redirect } from "../render";
import { getAgency, listAgencyClients, countActiveSlots } from "../agency";
import { reconcileAgencySlots } from "../agency-slots";
import { sendSnippetDeliveryEmail } from "../agency-emails";
import { scanDomain } from "../scanner";
import { autoGenerateRoadmap } from "../auto-provision";

// Wholesale base rates (for the form preview only -- actual billing uses
// Stripe's pricing API which carries the volume tiers). Keeping this in
// code avoids a Stripe roundtrip on every form render.
const SIGNAL_BASE = 800;
const AMPLIFY_BASE = 1800;

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;
const DOMAIN_PATTERN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

function autoSlugFromDomain(domain: string): string {
  // strip protocol/www, take the registrable, swap dots for dashes
  return domain
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .replace(/\./g, "-")
    .slice(0, 60);
}

async function loadAgencyForAddClient(
  user: User,
  env: Env,
): Promise<{ agency: Agency; blockReason?: string; trialEligible?: boolean }> {
  if (!user.agency_id) {
    return { agency: null as unknown as Agency, blockReason: "Your account isn't attached to an agency." };
  }
  const agency = await getAgency(env, user.agency_id);
  if (!agency) {
    return { agency: null as unknown as Agency, blockReason: "Agency not found." };
  }
  if (agency.status !== "active") {
    return { agency, blockReason: "Your agency status is not active. Contact ops." };
  }
  if (!agency.stripe_subscription_id) {
    // Trial path: an approved agency with no Stripe sub yet can add
    // exactly ONE client (trial=1) if they haven't used their trial
    // already. After that, they get bounced to /agency/billing.
    if (agency.trial_used) {
      return { agency, blockReason: "no_subscription" };
    }
    return { agency, trialEligible: true };
  }
  return { agency };
}

// ---------------------------------------------------------------------------
// GET /agency/clients/new
// ---------------------------------------------------------------------------

export async function handleAgencyAddClientGet(user: User | null, env: Env, url: URL): Promise<Response> {
  if (!user || user.role !== "agency_admin") return new Response("Forbidden", { status: 403 });
  const { agency, blockReason, trialEligible } = await loadAgencyForAddClient(user, env);

  // No subscription yet -> point them at billing instead of the form.
  if (blockReason === "no_subscription") {
    const body = `
      <div class="section-header">
        <h1>Add a <em>client</em></h1>
      </div>
      <div class="card" style="max-width:560px;border-color:var(--gold-dim)">
        <h3 style="margin-top:0">Activate your subscription first</h3>
        <p style="color:var(--text-faint);font-size:14px;line-height:1.7;margin-bottom:20px">
          Adding a client provisions a Signal or Amplify slot on your Stripe subscription.
          You don't have a subscription yet -- start one and we'll bring you back here.
        </p>
        <a href="/agency/billing" class="btn">Activate subscription &rarr;</a>
      </div>
    `;
    return html(layout("Add client", body, user));
  }
  if (blockReason) {
    return html(layout("Add client", `<div class="empty"><h3>Cannot add</h3><p>${esc(blockReason)}</p><p><a href="/agency" style="color:var(--gold)">Back to agency dashboard</a></p></div>`, user), 403);
  }

  // Pre-fill from query params if the user landed here from a previous error.
  const prefillSlug = (url.searchParams.get("slug") || "").trim();
  const prefillDomain = (url.searchParams.get("domain") || "").trim();
  // Trial clients are locked to Signal / internal -- the paid plan
  // picker is the second conversion lever, not part of the trial.
  const prefillPlan = trialEligible ? "signal" : (url.searchParams.get("plan") || "signal").trim();
  const prefillMode = trialEligible ? "internal" : (url.searchParams.get("mode") || "internal").trim();
  const errorMsg = url.searchParams.get("error") || "";

  const slots = await countActiveSlots(env, agency.id);

  const trialBanner = trialEligible ? `
      <div class="card" style="max-width:680px;border-color:var(--gold);background:var(--bg-edge);margin-bottom:18px">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <span style="color:var(--gold);font-weight:600;letter-spacing:.04em;font-size:12px;text-transform:uppercase">Trial</span>
          <div style="flex:1">
            <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:var(--text)">
              Add one client without billing to see the product work. Activate your Stripe subscription any time to add more or switch on Amplify.
            </p>
            <p style="margin:0;font-size:12px;line-height:1.7;color:var(--text-faint)">
              <strong style="color:var(--text)">Included:</strong> weekly AEO scans, citation tracking, roadmap, schema health.
              <strong style="color:var(--text)">Requires paid plan:</strong> more than one client, client portal invites, Amplify auto-push.
            </p>
          </div>
        </div>
      </div>
  ` : "";

  const body = `
    <div class="section-header">
      <h1>Add a <em>client</em></h1>
      <p class="section-sub">${trialEligible
        ? `This is your trial client. Provisioning is instant. The snippet install email goes to your agency contact (${esc(agency.contact_email || "no email on file")}).`
        : `Provisioning is instant. The snippet install email goes to your agency contact (${esc(agency.contact_email || "no email on file")}) the moment you click add.`}</p>
    </div>

    ${trialBanner}

    ${errorMsg ? `<div class="flash flash-error">${esc(errorMsg)}</div>` : ""}

    <form method="POST" action="/agency/clients/new" style="max-width:680px">
      <div class="card" style="margin-bottom:18px">
        <div class="form-group">
          <label for="domain">Client website</label>
          <input id="domain" name="domain" type="text" required maxlength="200"
                 value="${esc(prefillDomain)}" placeholder="acme.com"
                 oninput="(function(v){var s=document.getElementById('client_slug');if(!s.dataset.touched){s.value=v.toLowerCase().replace(/^https?:\\/\\//,'').replace(/^www\\./,'').replace(/\\/.*/,'').replace(/\\./g,'-').slice(0,60);}})(this.value)">
          <p class="muted" style="font-size:12px;margin-top:6px">Just the domain. We'll strip protocol and www automatically.</p>
        </div>

        <div class="form-group">
          <label for="client_slug">Client slug</label>
          <input id="client_slug" name="client_slug" type="text" required maxlength="60"
                 value="${esc(prefillSlug)}" placeholder="acme-co"
                 onfocus="this.dataset.touched='1'">
          <p class="muted" style="font-size:12px;margin-top:6px">Used in URLs (lowercase letters, numbers, dashes). Auto-derived from the domain unless you change it.</p>
        </div>
      </div>

      ${trialEligible ? `
      <div class="card" style="margin-bottom:18px">
        <div class="label" style="margin-bottom:10px;color:var(--gold)">Plan</div>
        <input type="hidden" name="plan" value="signal">
        <div style="padding:14px;border:1px solid var(--line);border-radius:4px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <strong>Signal (trial)</strong>
            <span style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">$0 until you activate billing</span>
          </div>
          <p style="font-size:12px;color:var(--text-faint);line-height:1.6;margin:6px 0 0">Weekly scoring, citation tracking, roadmap. Amplify auto-push unlocks when you activate a paid subscription.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="label" style="margin-bottom:10px;color:var(--gold)">Access mode</div>
        <input type="hidden" name="client_access" value="internal">
        <div style="padding:14px;border:1px solid var(--line);border-radius:4px">
          <strong>Internal</strong>
          <p style="font-size:12px;color:var(--text-faint);line-height:1.6;margin:6px 0 0">During trial, only your team sees the dashboard. Client-portal invites unlock when you activate a paid subscription.</p>
        </div>
      </div>
      ` : `
      <div class="card" style="margin-bottom:18px">
        <div class="label" style="margin-bottom:14px;color:var(--gold)">Plan</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px" id="plan-cards">
          <label style="cursor:pointer;display:block">
            <input type="radio" name="plan" value="signal" required ${prefillPlan === "signal" ? "checked" : ""} style="display:none">
            <div class="plan-card" data-plan="signal" style="padding:16px;border:2px solid ${prefillPlan === "signal" ? "var(--gold)" : "var(--line)"};border-radius:4px;transition:border-color .15s">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
                <strong>Signal</strong>
                <span style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">$${SIGNAL_BASE}/mo</span>
              </div>
              <p style="font-size:12px;color:var(--text-faint);line-height:1.6;margin:0">Weekly scoring, citation tracking, roadmap. Schema fixes you (or your dev) ship.</p>
            </div>
          </label>
          <label style="cursor:pointer;display:block">
            <input type="radio" name="plan" value="amplify" ${prefillPlan === "amplify" ? "checked" : ""} style="display:none">
            <div class="plan-card" data-plan="amplify" style="padding:16px;border:2px solid ${prefillPlan === "amplify" ? "var(--gold)" : "var(--line)"};border-radius:4px;transition:border-color .15s">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
                <strong>Amplify</strong>
                <span style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">$${AMPLIFY_BASE}/mo</span>
              </div>
              <p style="font-size:12px;color:var(--text-faint);line-height:1.6;margin:0">Everything in Signal PLUS NeverRanked auto-pushes schema fixes via the snippet.</p>
            </div>
          </label>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="label" style="margin-bottom:14px;color:var(--gold)">Access mode</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px" id="mode-cards">
          <label style="cursor:pointer;display:block">
            <input type="radio" name="client_access" value="internal" required ${prefillMode === "internal" ? "checked" : ""} style="display:none">
            <div class="mode-card" data-mode="internal" style="padding:16px;border:2px solid ${prefillMode === "internal" ? "var(--gold)" : "var(--line)"};border-radius:4px;transition:border-color .15s">
              <strong>Internal</strong>
              <p style="font-size:12px;color:var(--text-faint);line-height:1.6;margin:6px 0 0">Only your team sees the dashboard. You run reports for the client. Most agencies pick this.</p>
            </div>
          </label>
          <label style="cursor:pointer;display:block">
            <input type="radio" name="client_access" value="full" ${prefillMode === "full" ? "checked" : ""} style="display:none">
            <div class="mode-card" data-mode="full" style="padding:16px;border:2px solid ${prefillMode === "full" ? "var(--gold)" : "var(--line)"};border-radius:4px;transition:border-color .15s">
              <strong>Client portal</strong>
              <p style="font-size:12px;color:var(--text-faint);line-height:1.6;margin:6px 0 0">Your client logs in to a dashboard branded with your logo and color. Invite them via /agency/invites.</p>
            </div>
          </label>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px;background:var(--bg-edge)">
        <div class="label" style="margin-bottom:8px">Slot impact</div>
        <div id="slot-preview" style="font-size:14px;color:var(--text);line-height:1.6">
          <div>Signal slots: <strong id="preview-signal-from">${slots.signal}</strong> &rarr; <strong id="preview-signal-to">${slots.signal + (prefillPlan === "signal" ? 1 : 0)}</strong></div>
          <div>Amplify slots: <strong id="preview-amplify-from">${slots.amplify}</strong> &rarr; <strong id="preview-amplify-to">${slots.amplify + (prefillPlan === "amplify" ? 1 : 0)}</strong></div>
          <div class="muted" style="font-size:12px;margin-top:8px" id="preview-cost">+$${prefillPlan === "amplify" ? AMPLIFY_BASE : SIGNAL_BASE}/mo at base rate, prorated to today on your next invoice. Volume discounts apply automatically at 10 and 25 slots.</div>
        </div>
      </div>
      `}

      <div style="display:flex;gap:10px;align-items:center">
        <button type="submit" class="btn">${trialEligible ? "Start trial" : "Add client"}</button>
        <a href="/agency" class="btn btn-ghost">Cancel</a>
      </div>
    </form>

    <script>
      // Live preview: when the agency picks a different plan, update slot
      // count + cost inline. Pure DOM, no fetch.
      (function(){
        var SIGNAL_FROM = ${slots.signal};
        var AMPLIFY_FROM = ${slots.amplify};
        var SIGNAL_RATE = ${SIGNAL_BASE};
        var AMPLIFY_RATE = ${AMPLIFY_BASE};

        function setActive(group, value){
          document.querySelectorAll('#'+group+' [data-'+group.replace('-cards','')+']').forEach(function(el){
            var match = el.getAttribute('data-'+group.replace('-cards','')) === value;
            el.style.borderColor = match ? 'var(--gold)' : 'var(--line)';
          });
        }

        function recompute(){
          var plan = (document.querySelector('input[name=plan]:checked') || {}).value || 'signal';
          var addSig = plan === 'signal' ? 1 : 0;
          var addAmp = plan === 'amplify' ? 1 : 0;
          document.getElementById('preview-signal-to').textContent = SIGNAL_FROM + addSig;
          document.getElementById('preview-amplify-to').textContent = AMPLIFY_FROM + addAmp;
          var cost = plan === 'amplify' ? AMPLIFY_RATE : SIGNAL_RATE;
          document.getElementById('preview-cost').textContent =
            '+$' + cost + '/mo at base rate, prorated to today on your next invoice. Volume discounts apply automatically at 10 and 25 slots.';
          setActive('plan-cards', plan);
        }

        document.querySelectorAll('input[name=plan]').forEach(function(r){ r.addEventListener('change', recompute); });
        document.querySelectorAll('input[name=client_access]').forEach(function(r){
          r.addEventListener('change', function(){ setActive('mode-cards', r.value); });
        });
      })();
    </script>
  `;

  return html(layout("Add client", body, user));
}

// ---------------------------------------------------------------------------
// POST /agency/clients/new
// ---------------------------------------------------------------------------

export async function handleAgencyAddClientPost(request: Request, user: User | null, env: Env): Promise<Response> {
  if (!user || user.role !== "agency_admin") return new Response("Forbidden", { status: 403 });
  const { agency, blockReason, trialEligible } = await loadAgencyForAddClient(user, env);
  if (blockReason === "no_subscription") return redirect("/agency/billing?error=" + encodeURIComponent("Activate your subscription before adding clients."));
  if (blockReason) return redirect("/agency?error=" + encodeURIComponent(blockReason));
  const isTrial = !!trialEligible;

  const form = await request.formData();
  const domainRaw = ((form.get("domain") as string) || "").trim().toLowerCase();
  const slugRaw = ((form.get("client_slug") as string) || "").trim().toLowerCase();
  // Trial always forces Signal/internal regardless of what the client
  // posted -- defense-in-depth against tampered hidden inputs.
  const plan = isTrial ? "signal" : ((form.get("plan") as string) || "").trim().toLowerCase();
  const access = isTrial ? "internal" : ((form.get("client_access") as string) || "").trim().toLowerCase();

  // Normalize domain (strip protocol / www / path).
  const domain = domainRaw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  const slug = slugRaw || autoSlugFromDomain(domain);

  // Validation -- bounce back with prefill on any failure.
  const queryback = (msg: string) =>
    redirect(`/agency/clients/new?error=${encodeURIComponent(msg)}&slug=${encodeURIComponent(slug)}&domain=${encodeURIComponent(domain)}&plan=${encodeURIComponent(plan)}&mode=${encodeURIComponent(access)}`);

  if (!DOMAIN_PATTERN.test(domain)) return queryback("That doesn't look like a valid domain (e.g. acme.com).");
  if (!SLUG_PATTERN.test(slug)) return queryback("Slug must be lowercase letters, numbers, and dashes (3-60 chars, no leading/trailing dash).");
  if (plan !== "signal" && plan !== "amplify") return queryback("Pick a plan.");
  if (access !== "internal" && access !== "full") return queryback("Pick an access mode.");

  // Helpful dedupe error: if this domain already exists ANYWHERE on this
  // agency, name the existing slug. The DB unique constraint would also
  // fire but the silent admin-flow behavior was bad UX.
  const existingByDomain = await env.DB.prepare(
    "SELECT client_slug FROM domains WHERE domain = ? AND agency_id = ? AND is_competitor = 0 LIMIT 1"
  ).bind(domain, agency.id).first<{ client_slug: string }>();
  if (existingByDomain) {
    return queryback(`This domain is already on your account as "${existingByDomain.client_slug}". Use that slug instead, or remove the existing record first.`);
  }
  const existingBySlug = await env.DB.prepare(
    "SELECT domain FROM domains WHERE client_slug = ? AND is_competitor = 0 LIMIT 1"
  ).bind(slug).first<{ domain: string }>();
  if (existingBySlug) {
    return queryback(`The slug "${slug}" is already in use (by ${existingBySlug.domain}). Pick a different slug.`);
  }

  // INSERT
  const now = Math.floor(Date.now() / 1000);
  let newDomainId: number | null = null;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO domains
         (client_slug, domain, is_competitor, active,
          agency_id, plan, client_access, trial, activated_at, created_at, updated_at)
       VALUES (?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(slug, domain, agency.id, plan, access, isTrial ? 1 : 0, now, now, now).run();
    newDomainId = (result.meta?.last_row_id as number) || null;
  } catch (e) {
    console.log(`[agency-add-client] insert failed: ${e}`);
    return queryback("Could not save the client. Try again or contact ops.");
  }
  if (!newDomainId) return queryback("Could not save the client (no row id). Contact ops.");

  // Slot reconcile -> Stripe quantity update + lazy Amplify item create.
  // If Stripe rejects, roll back the domain insert so D1 and Stripe
  // stay in sync. Otherwise the agency would have an active client in
  // our DB that Stripe isn't billing, and neither side would know.
  //
  // Trial clients skip this entirely: there is no Stripe subscription
  // yet, so nothing to reconcile. The conversion webhook (or lazy
  // reconcile on /agency load) handles syncing when billing activates.
  if (!isTrial) {
    try {
      await reconcileAgencySlots(env, agency.id);
    } catch (e) {
      console.log(`[agency-add-client] reconcile failed for agency ${agency.id}: ${e}`);
      try {
        await env.DB.prepare("DELETE FROM domains WHERE id = ?").bind(newDomainId).run();
      } catch (delErr) {
        console.log(`[agency-add-client] rollback delete failed for domain ${newDomainId}: ${delErr}`);
      }
      return queryback("Billing update failed -- the client wasn't added. Try again, or contact ops if it keeps failing.");
    }

    // Slot event ledger row. Only logged after Stripe is in sync so the
    // ledger never shows an activation that got rolled back. Trial rows
    // are excluded -- they aren't billed slots yet.
    try {
      const slotsAfter = await countActiveSlots(env, agency.id);
      const after = plan === "amplify" ? slotsAfter.amplify : slotsAfter.signal;
      await env.DB.prepare(
        `INSERT INTO agency_slot_events
           (agency_id, domain_id, plan, event_type, quantity_before, quantity_after, note, created_at)
           VALUES (?, ?, ?, 'activated', ?, ?, ?, ?)`
      ).bind(agency.id, newDomainId, plan, after - 1, after, `Added by agency_admin user ${user.id} (self-serve)`, now).run();
    } catch (e) {
      console.log(`[agency-add-client] slot event log failed: ${e}`);
    }
  } else {
    // Lock the agency's trial -- they can't cycle through delete+re-add
    // to keep getting free clients. Cleared only by an admin action.
    try {
      await env.DB.prepare(
        "UPDATE agencies SET trial_used = 1, updated_at = ? WHERE id = ?"
      ).bind(now, agency.id).run();
    } catch (e) {
      console.log(`[agency-add-client] trial_used flag write failed: ${e}`);
    }
  }

  // Snippet delivery email -> agency contact gets the install instructions
  // immediately. Idempotent guard via snippet_email_sent_at.
  try {
    const newDomainRow = await env.DB.prepare("SELECT * FROM domains WHERE id = ?").bind(newDomainId).first();
    if (newDomainRow && agency.contact_email) {
      const sent = await sendSnippetDeliveryEmail(env, { agency, domain: newDomainRow as never });
      if (sent) {
        await env.DB.prepare("UPDATE domains SET snippet_email_sent_at = ? WHERE id = ?").bind(now, newDomainId).run();
      }
    }
  } catch (e) {
    console.log(`[agency-add-client] snippet email failed: ${e}`);
  }

  // First scan + auto-roadmap. Best-effort, fully async from the user's
  // perspective: by the time they refresh /agency, this should be done.
  try {
    const url = `https://${domain}/`;
    const result = await scanDomain(newDomainId, url, "manual", env);
    if (result && !result.error) {
      try {
        await autoGenerateRoadmap(slug, env);
      } catch (e) {
        console.log(`[agency-add-client] roadmap gen failed: ${e}`);
      }
    }
  } catch (e) {
    console.log(`[agency-add-client] first scan failed: ${e}`);
  }

  const flash = isTrial
    ? `Trial started for ${slug} (${domain}). Snippet install email sent to ${agency.contact_email || "your agency contact"}. First scan running in the background. Activate billing any time to add more clients.`
    : `Added ${slug} (${domain}). Snippet install email sent to ${agency.contact_email || "your agency contact"}. First scan running in the background.`;
  return redirect("/agency?flash=" + encodeURIComponent(flash));
}
