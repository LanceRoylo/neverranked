/**
 * Dashboard -- Competitor suggestion sanity checks
 *
 * The existing competitor-add flow auto-approves everything as long as
 * the domain looks roughly like a domain. That's fine for 95% of
 * suggestions but lets garbage through (client's own domain, localhost,
 * spam domains, IPs).
 *
 * This module runs the sanity checks BEFORE the auto-approve happens.
 * If any check fails, the suggestion goes to status='pending' and
 * surfaces in the admin cockpit for manual review instead of silently
 * becoming a tracked competitor.
 */

import type { Env } from "./types";

// Obvious non-public / internal domains that shouldn't ever be tracked
// as a competitor. Kept small and strict -- the goal is to catch
// garbage, not to be a comprehensive blocklist.
const INTERNAL_PATTERNS: RegExp[] = [
  /^localhost(\.|$)/i,
  /\.local$/i,
  /\.localhost$/i,
  /\.test$/i,
  /\.example(\.|$)/i,
  /\.invalid$/i,
  /^\d+\.\d+\.\d+\.\d+$/, // bare IPv4
  /^[0-9a-f:]+$/i,         // bare IPv6
];

// Common spam / placeholder domains. Add to this list over time as we
// see real instances.
const BLOCKLIST: Set<string> = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "asdf.com",
]);

export interface CompetitorSanityResult {
  ok: boolean;
  reason?: string; // human-readable, shown in admin_alerts if check fails
}

/**
 * Run sanity checks against a proposed competitor domain. Returns ok:true
 * if the suggestion should be auto-approved, or ok:false with a reason
 * if it should go to pending for manual review.
 */
export async function validateCompetitorSuggestion(
  env: Env,
  clientSlug: string,
  domain: string,
): Promise<CompetitorSanityResult> {
  const lower = String(domain || "").trim().toLowerCase();

  if (!lower || lower.length < 4 || !lower.includes(".")) {
    return { ok: false, reason: "domain too short or missing TLD" };
  }

  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(lower)) {
      return { ok: false, reason: `internal / non-public domain (${lower})` };
    }
  }

  if (BLOCKLIST.has(lower)) {
    return { ok: false, reason: `blocklisted placeholder domain (${lower})` };
  }

  // Reject if the suggested domain is the client's OWN primary domain.
  // Happens more than you'd think -- someone typos and the form accepts it.
  const ownDomain = await env.DB.prepare(
    "SELECT domain FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(clientSlug).first<{ domain: string }>();
  if (ownDomain && ownDomain.domain.toLowerCase() === lower) {
    return { ok: false, reason: `domain is the client's own primary (${lower})` };
  }

  // If the domain is already tracked as a primary (non-competitor) anywhere
  // in the platform, that's a sign somebody else's client is being mis-added
  // as a competitor. Flag for manual review rather than auto-approve.
  const trackedAsPrimary = await env.DB.prepare(
    "SELECT id FROM domains WHERE domain = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(lower).first<{ id: number }>();
  if (trackedAsPrimary) {
    return { ok: false, reason: `domain is already tracked as a primary client elsewhere (${lower})` };
  }

  return { ok: true };
}
