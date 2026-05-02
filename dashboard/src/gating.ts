/**
 * Feature gating.
 *
 * Keeps plan-level access rules in one spot so the UI, route handlers,
 * and nav agree on who can see what.
 */

import type { User } from "./types";

/**
 * Voice + Drafts are Amplify-tier for clients. Admin and agency_admin
 * always have access so they can do the work on behalf of any client.
 *
 * Clients on Signal or Audit see the feature nav but land on a friendly
 * upgrade nudge rather than the feature itself.
 */
export function canUseDraftingFeature(user: User): boolean {
  if (user.role === "admin") return true;
  if (user.role === "agency_admin") return true;
  if (user.role === "client") return user.plan === "amplify";
  return false;
}

/**
 * Reddit reply briefs are Amplify-tier. Same access matrix as drafting:
 * admins and agency_admins can run them on behalf of any client.
 */
export function canUseRedditBriefs(user: User): boolean {
  return canUseDraftingFeature(user);
}

/** For plan-agnostic decisions about whether the user is a paying client. */
export function isPayingClient(user: User): boolean {
  if (user.role !== "client") return false;
  if (!user.plan) return false;
  return user.plan !== "none" && user.plan !== "churned";
}
