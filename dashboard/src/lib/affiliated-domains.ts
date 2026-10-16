/**
 * affiliated-domains.ts — a client's group's sites, read from migration 0130.
 *
 * Decided 2026-10-05 (decision C). A parent hotel group's page for the hotel
 * is cited by AI tools, and it is neither the client's own site nor a third
 * party to get listed on. It is listed separately (source type "affiliated")
 * and never counted as the client's own site, in the readout snapshot and in
 * the memo inputs alike.
 */
import type { Env } from "../types";
import type { AffiliatedDomain } from "./classify-source";

/** Active rows for one client. Empty when the table is absent, which before
 *  the migration is applied is the normal state: no affiliated domains and no
 *  change to any figure. */
export async function loadAffiliatedDomains(env: Env, clientSlug: string): Promise<AffiliatedDomain[]> {
  try {
    return (await env.DB.prepare(
      "SELECT domain, path_prefix FROM client_affiliated_domains WHERE client_slug = ? AND active = 1",
    ).bind(clientSlug).all<AffiliatedDomain>()).results ?? [];
  } catch (e) {
    console.log(`[affiliated] ${clientSlug}: none loaded (${e instanceof Error ? e.message : String(e)})`);
    return [];
  }
}
