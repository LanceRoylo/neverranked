/**
 * owned-path.ts: a client's own pages on a shared domain, read from
 * migration 0134.
 *
 * Added 2026-11-11 for a client that is one venue of a group whose venues
 * share a single domain. Own-site matching was host-only, so the group's
 * other venues' pages counted as the client's own site. See ownedUrlMatch in
 * classify-source.ts for the rule itself.
 */
import type { Env } from "../types";
import { normPathPrefix } from "./classify-source";

/** The client's owned path prefix, normalised ('/hawaii'), or '' for none.
 *  '' when the table is absent, which before the migration is applied is the
 *  normal state: host-only matching and no change to any figure. */
export async function loadOwnedPathPrefix(env: Env, clientSlug: string): Promise<string> {
  try {
    const row = await env.DB.prepare(
      "SELECT path_prefix FROM client_owned_paths WHERE client_slug = ? AND active = 1 LIMIT 1",
    ).bind(clientSlug).first<{ path_prefix: string | null }>();
    return normPathPrefix(row?.path_prefix);
  } catch (e) {
    console.log(`[owned-path] ${clientSlug}: none loaded (${e instanceof Error ? e.message : String(e)})`);
    return "";
  }
}
