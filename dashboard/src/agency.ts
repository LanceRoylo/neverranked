/**
 * Dashboard -- Agency access control and branding helpers
 *
 * Centralizes every check that asks "can this user see this client?" and
 * "what branding should this page render with?" so that route handlers
 * can stay simple and we never drift from the agency authorization model.
 *
 * Access rules (highest privilege wins):
 *   - role='admin'         -> sees everything
 *   - role='agency_admin'  -> sees all clients where domains.agency_id = user.agency_id
 *   - role='client'        -> sees clients where domains.client_slug = user.client_slug
 *
 * Branding rules:
 *   - If the viewing user is agency_admin, branding is that agency.
 *   - If the viewing user is a client of an agency-owned domain with
 *     client_access='full', branding is that agency.
 *   - Otherwise, branding is NeverRanked.
 */

import type { Agency, BrandingContext, Domain, Env, User } from "./types";

/** Fetch an agency row by primary key, or null. */
export async function getAgency(env: Env, agencyId: number): Promise<Agency | null> {
  const row = await env.DB.prepare(
    "SELECT * FROM agencies WHERE id = ?"
  ).bind(agencyId).first<Agency>();
  return row || null;
}

/** Fetch an agency row by slug, or null. */
export async function getAgencyBySlug(env: Env, slug: string): Promise<Agency | null> {
  const row = await env.DB.prepare(
    "SELECT * FROM agencies WHERE slug = ?"
  ).bind(slug).first<Agency>();
  return row || null;
}

/** Fetch the primary domain row for a client_slug (not counting competitors). */
export async function getDomainBySlug(env: Env, clientSlug: string): Promise<Domain | null> {
  const row = await env.DB.prepare(
    "SELECT * FROM domains WHERE client_slug = ? AND is_competitor = 0 LIMIT 1"
  ).bind(clientSlug).first<Domain>();
  return row || null;
}

/**
 * Does this user have access to this client_slug? Accepts admin, the
 * agency_admin of the agency that owns the client, or the client itself.
 */
export async function canAccessClient(env: Env, user: User, clientSlug: string): Promise<boolean> {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "client") return user.client_slug === clientSlug;
  if (user.role === "agency_admin") {
    if (!user.agency_id) return false;
    const domain = await getDomainBySlug(env, clientSlug);
    if (!domain) return false;
    return domain.agency_id === user.agency_id;
  }
  return false;
}

/**
 * Guard for route handlers. Returns null if authorized, or a Response
 * (redirect or 403) if not. Usage:
 *     const deny = await requireClientAccess(env, user, slug);
 *     if (deny) return deny;
 */
export async function requireClientAccess(env: Env, user: User | null, clientSlug: string): Promise<Response | null> {
  if (!user) {
    return new Response(null, { status: 302, headers: { Location: "/login" } });
  }
  const ok = await canAccessClient(env, user, clientSlug);
  if (!ok) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

/**
 * Compute the branding context for the current request. Requires the
 * viewer's user record and (optionally) the client_slug being viewed.
 *
 * Returns an agency-branded context only when the agency is active AND
 * the viewer is allowed to see agency branding (agency_admin, or a
 * Mode-2 client of an agency-owned domain).
 */
export async function getBrandingContext(env: Env, user: User | null, clientSlug?: string | null): Promise<BrandingContext> {
  const fallback: BrandingContext = { source: "neverranked", showPoweredBy: false };
  if (!user) return fallback;

  // Admins always see NeverRanked branding so they never get confused
  // about which account they're operating on.
  if (user.role === "admin") return fallback;

  if (user.role === "agency_admin") {
    if (!user.agency_id) return fallback;
    const agency = await getAgency(env, user.agency_id);
    if (!agency || agency.status !== "active") return fallback;
    return { source: "agency", agency, showPoweredBy: true };
  }

  if (user.role === "client") {
    const slug = clientSlug || user.client_slug;
    if (!slug) return fallback;
    const domain = await getDomainBySlug(env, slug);
    if (!domain || !domain.agency_id) return fallback;
    // Mode 1 clients shouldn't reach this code path because they can't
    // log in, but belt and suspenders: only show agency branding for
    // Mode 2 (client_access='full').
    if (domain.client_access !== "full") return fallback;
    const agency = await getAgency(env, domain.agency_id);
    if (!agency || agency.status !== "active") return fallback;
    return { source: "agency", agency, showPoweredBy: true };
  }

  return fallback;
}

/**
 * List the clients (primary domains) owned by an agency, active first.
 * Used for the /agency dashboard.
 */
export async function listAgencyClients(env: Env, agencyId: number): Promise<Domain[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM domains
       WHERE agency_id = ? AND is_competitor = 0
       ORDER BY active DESC, created_at DESC`
  ).bind(agencyId).all<Domain>();
  return rows.results || [];
}

/**
 * Count active slots for an agency by plan. Used for billing display
 * and for reconciling with Stripe subscription_item quantities.
 */
export async function countActiveSlots(env: Env, agencyId: number): Promise<{ signal: number; amplify: number }> {
  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN plan = 'signal' AND active = 1 THEN 1 ELSE 0 END) AS signal,
       SUM(CASE WHEN plan = 'amplify' AND active = 1 THEN 1 ELSE 0 END) AS amplify
       FROM domains
       WHERE agency_id = ? AND is_competitor = 0`
  ).bind(agencyId).first<{ signal: number | null; amplify: number | null }>();
  return {
    signal: row?.signal || 0,
    amplify: row?.amplify || 0,
  };
}
