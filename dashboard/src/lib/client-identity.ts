/* Who counts as the customer.
 *
 * A business is not a domain. Prince Waikiki is princewaikiki.com, and it is
 * also hawaiiprincehotel.com, princehotel.com, "Prince Waikiki", and "Hawaii
 * Prince Hotel Waikiki" -- the name it carried before it rebranded, which is
 * the one the model-knowledge engines still use. Scoring a single domain
 * string recorded all of that as absence. See migration 0121.
 *
 * Two questions, deliberately kept apart, because conflating them is the bug
 * this file exists to stop:
 *
 *   NAMED  -- did the engine name this business at all? Meaningful on every
 *             surface, and the only meaningful question on a model-knowledge
 *             surface, which retrieves nothing and recalls its URLs.
 *   OWNED  -- did the engine cite a page the business controls? Meaningful
 *             only where retrieval is real.
 *
 * A match through a LEGACY identity is a real match AND a finding: the engine
 * knows the business under an identity it has stopped using. */

export type IdentityStatus = "canonical" | "legacy" | "deny";
export interface IdentityRow { kind: "domain" | "name"; value: string; status: IdentityStatus; note?: string | null }

export interface IdentitySet {
  slug: string;
  domains: Map<string, IdentityStatus>;
  names: Array<{ value: string; status: IdentityStatus; re: RegExp }>;
}

export function normHost(h: string): string {
  return h.toLowerCase().replace(/^www\./, "").replace(/\.$/, "").trim();
}

/** Word-boundary match. Without this, "prince" matches Princeville Resort on
 *  Kauai -- a different property on a different island, and the exact false
 *  positive the first pass at this produced. */
export function nameRegex(name: string): RegExp {
  const escaped = name.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i");
}

export function buildIdentitySet(slug: string, rows: IdentityRow[]): IdentitySet {
  const domains = new Map<string, IdentityStatus>();
  const names: IdentitySet["names"] = [];
  for (const r of rows) {
    if (r.kind === "domain") domains.set(normHost(r.value), r.status);
    else names.push({ value: r.value, status: r.status, re: nameRegex(r.value) });
  }
  // Longest name first: "Hawaii Prince Hotel Waikiki" must win over the
  // substring "Hawaii Prince Hotel", or every legacy full name is recorded
  // under the shorter identity and the two can never be told apart.
  names.sort((a, b) => b.value.length - a.value.length);
  return { slug, domains, names };
}

export interface IdentityVerdict {
  named: boolean;
  owned: boolean;
  /** Matched ONLY through an identity the business no longer uses. */
  stale: boolean;
  /** The identity that matched, for auditing a number back to its cause. */
  via: string | null;
}

const MISS: IdentityVerdict = { named: false, owned: false, stale: false, via: null };

/** Deny always wins, on both axes, however the match was reached. */
export function identifyEntity(
  ent: { name?: string | null; url?: string | null },
  ids: IdentitySet,
): IdentityVerdict {
  let host: string | null = null;
  if (ent.url) {
    try { host = normHost(new URL(ent.url.trim()).hostname); }
    catch { const m = String(ent.url).match(/^(?:https?:\/\/)?([^/\s?#]+)/i); host = m ? normHost(m[1]) : null; }
  }

  if (host && ids.domains.get(host) === "deny") return MISS;

  const text = (ent.name ?? "").trim();
  const denied = text ? ids.names.find((n) => n.status === "deny" && n.re.test(text)) : undefined;
  if (denied) return MISS;

  const hostStatus = host ? ids.domains.get(host) : undefined;
  const owned = hostStatus === "canonical" || hostStatus === "legacy";
  const hit = text ? ids.names.find((n) => n.status !== "deny" && n.re.test(text)) : undefined;
  const named = owned || !!hit;
  if (!named) return MISS;

  // Stale only when NOTHING current matched. A canonical name on a legacy
  // domain is a live identity, not a stale one.
  const currentMatch = hostStatus === "canonical" || hit?.status === "canonical";
  return {
    named: true,
    owned,
    stale: !currentMatch,
    via: hit?.value ?? host ?? null,
  };
}

/** Does any entity in this response point at the customer? */
export function identifyEntities(
  ents: Array<{ name?: string | null; url?: string | null }>,
  ids: IdentitySet,
): IdentityVerdict {
  let best: IdentityVerdict = MISS;
  for (const e of ents) {
    const v = identifyEntity(e, ids);
    if (!v.named) continue;
    // A live identity anywhere in the answer outranks a stale one: the answer
    // as a whole is not stale if any part of it used the current identity.
    if (!best.named || (best.stale && !v.stale) || (!best.owned && v.owned && best.stale === v.stale)) best = v;
    if (best.named && best.owned && !best.stale) break;
  }
  return best;
}

export async function loadIdentitySet(env: { DB: D1Database }, slug: string): Promise<IdentitySet> {
  const rows = (await env.DB.prepare(
    `SELECT kind, value, status, note FROM client_identities WHERE client_slug = ?`,
  ).bind(slug).all<IdentityRow>()).results ?? [];
  return buildIdentitySet(slug, rows);
}
