/**
 * Dashboard -- Agency self-serve client controls
 *
 * Routes:
 *   POST /agency/clients/:domainId/pause
 *   POST /agency/clients/:domainId/resume
 *
 * Lets an agency_admin pause or resume a client without involving ops.
 * Each action:
 *   1. Verifies the domain belongs to the user's agency (defense in depth)
 *   2. Reads slot counts BEFORE the change so we can record before/after
 *   3. Flips domains.active
 *   4. Writes a row to agency_slot_events (audit ledger)
 *   5. Calls reconcileAgencySlots() to push the new quantity to Stripe
 *   6. Redirects to /agency with a flash describing the slot delta
 *
 * Stripe handles proration automatically on subscription_item quantity
 * updates, so we don't compute prorated_amount client-side. The agency's
 * next invoice will reflect the change.
 */

import type { Agency, Domain, Env, User } from "../types";
import { redirect } from "../render";
import { getAgency, countActiveSlots } from "../agency";
import { reconcileAgencySlots } from "../agency-slots";

async function loadAgencyAndDomain(
  domainId: number,
  user: User | null,
  env: Env
): Promise<{ agency: Agency; domain: Domain } | Response> {
  if (!user) return new Response(null, { status: 302, headers: { Location: "/login" } });
  if (user.role !== "agency_admin" || !user.agency_id) {
    return new Response("Forbidden", { status: 403 });
  }

  const agency = await getAgency(env, user.agency_id);
  if (!agency) return new Response("Agency not found", { status: 404 });

  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE id = ? AND agency_id = ? AND is_competitor = 0"
  ).bind(domainId, user.agency_id).first<Domain>();
  if (!domain) {
    // Either the domain doesn't exist or it's not owned by this agency.
    // Don't distinguish (no info leak).
    return new Response("Forbidden", { status: 403 });
  }

  return { agency, domain };
}

function planLabel(plan: string | null): string {
  if (plan === "signal") return "Signal";
  if (plan === "amplify") return "Amplify";
  return "slot";
}

export async function handleAgencyPauseClient(
  domainId: number,
  user: User | null,
  env: Env
): Promise<Response> {
  const loaded = await loadAgencyAndDomain(domainId, user, env);
  if (loaded instanceof Response) return loaded;
  const { agency, domain } = loaded;

  if (domain.active === 0) {
    return redirect("/agency?flash=" + encodeURIComponent(`${domain.client_slug} is already paused.`));
  }

  const slotsBefore = await countActiveSlots(env, agency.id);
  const beforeForPlan = domain.plan === "amplify" ? slotsBefore.amplify : slotsBefore.signal;
  const afterForPlan = Math.max(0, beforeForPlan - 1);

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE domains SET active = 0, updated_at = ? WHERE id = ?"
  ).bind(now, domain.id).run();

  await env.DB.prepare(
    `INSERT INTO agency_slot_events
       (agency_id, domain_id, plan, event_type, quantity_before, quantity_after, note, created_at)
       VALUES (?, ?, ?, 'paused', ?, ?, ?, ?)`
  ).bind(
    agency.id,
    domain.id,
    domain.plan || "signal",
    beforeForPlan,
    afterForPlan,
    `Paused by agency_admin user ${user!.id}`,
    now,
  ).run();

  // Push to Stripe. Don't block UX on a Stripe hiccup -- log and continue.
  try {
    await reconcileAgencySlots(env, agency.id);
  } catch (e) {
    console.log(`[agency-clients] reconcile after pause failed for agency ${agency.id}: ${e}`);
  }

  const msg = `Paused ${domain.client_slug}. ${planLabel(domain.plan)} slots: ${beforeForPlan} -> ${afterForPlan}. Your next invoice will be prorated.`;
  return redirect("/agency?flash=" + encodeURIComponent(msg));
}

export async function handleAgencyResumeClient(
  domainId: number,
  user: User | null,
  env: Env
): Promise<Response> {
  const loaded = await loadAgencyAndDomain(domainId, user, env);
  if (loaded instanceof Response) return loaded;
  const { agency, domain } = loaded;

  if (domain.active === 1) {
    return redirect("/agency?flash=" + encodeURIComponent(`${domain.client_slug} is already active.`));
  }

  const slotsBefore = await countActiveSlots(env, agency.id);
  const beforeForPlan = domain.plan === "amplify" ? slotsBefore.amplify : slotsBefore.signal;
  const afterForPlan = beforeForPlan + 1;

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE domains SET active = 1, updated_at = ? WHERE id = ?"
  ).bind(now, domain.id).run();

  await env.DB.prepare(
    `INSERT INTO agency_slot_events
       (agency_id, domain_id, plan, event_type, quantity_before, quantity_after, note, created_at)
       VALUES (?, ?, ?, 'resumed', ?, ?, ?, ?)`
  ).bind(
    agency.id,
    domain.id,
    domain.plan || "signal",
    beforeForPlan,
    afterForPlan,
    `Resumed by agency_admin user ${user!.id}`,
    now,
  ).run();

  try {
    await reconcileAgencySlots(env, agency.id);
  } catch (e) {
    console.log(`[agency-clients] reconcile after resume failed for agency ${agency.id}: ${e}`);
  }

  const msg = `Resumed ${domain.client_slug}. ${planLabel(domain.plan)} slots: ${beforeForPlan} -> ${afterForPlan}. Your next invoice will be prorated.`;
  return redirect("/agency?flash=" + encodeURIComponent(msg));
}
