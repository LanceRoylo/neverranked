/**
 * event-hygiene.ts — what may appear in a weekly digest.
 *
 * WHY THIS EXISTS. On 2026-08-16 the first automated v2 dispatch built
 * five digests against live data and the grader held every one. Four
 * complaints, one cause: `getPendingEvents` selected everything with
 * `delivered_in_digest_id IS NULL` and no time bound, so the three-month
 * delivery blackout had piled up a backlog that all arrived at once,
 * dated 7 to 84 days old and presented as this week's news.
 *
 * The grader was right on every count, and each complaint traces to a
 * specific row:
 *
 *   "Citations dropped to zero" (Jun 1, 77d) rendered beside a current
 *   18/18 coverage figure. Both true, months apart, contradictory when
 *   printed together as now.
 *
 *   "reached grade D" (Jun 15) and "reached grade C" (Jun 22) shown as
 *   two separate highlights for one domain. Sequential truths, absurd
 *   side by side.
 *
 *   A neverranked.com regression filed under client_slug 'montaic' in
 *   May, which made Montaic's section open with another company's
 *   domain. A real misfile, not a rendering slip.
 *
 * An event is a point-in-time fact. A digest is a claim about the
 * present. Anything that cannot honour that distinction must not print,
 * because the numbers beside it are always current.
 *
 * House rule this enforces (same discipline as the outreach machine): a
 * stale or misattributed fact is worse than a quiet week. "Nothing moved"
 * is a sentence this product can say with confidence.
 */

/** Beyond this age an event is history, not news. Two weeks covers a
 *  missed send plus a biweekly cadence client without ever reaching back
 *  into a previous month. */
export const EVENT_MAX_AGE_DAYS = 14;

export interface HygienicEvent {
  id?: number;
  kind: string;
  severity: "info" | "win" | "concern";
  title: string;
  body?: string | null;
  occurred_at: number;
}

export interface HygieneResult<T extends HygienicEvent> {
  keep: T[];
  /** Dropped events with the reason, so the caller can expire them in the
   *  database rather than leaving them to pile up and re-offend. */
  drop: Array<{ event: T; why: string }>;
}

/** Domains named in an event title, lowercased and bare. Matches the
 *  common shapes: example.com, www.example.com, sub.example.co.uk. */
export function domainsIn(text: string): string[] {
  const out: string[] = [];
  const re = /\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1].toLowerCase().replace(/^www\./, ""));
  }
  return out;
}

const bare = (d: string): string =>
  d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

/**
 * Decide what a client's digest may show.
 *
 * @param events        pending events for ONE client
 * @param clientDomains every domain in that client's cohort, own and
 *                      competitor. An event naming something outside it
 *                      belongs to a different client.
 * @param nowSec        current time, injected so tests are deterministic
 */
export function screenEvents<T extends HygienicEvent>(
  events: T[],
  clientDomains: string[],
  nowSec: number,
): HygieneResult<T> {
  const cohort = new Set(clientDomains.map(bare).filter(Boolean));
  const keep: T[] = [];
  const drop: Array<{ event: T; why: string }> = [];

  // Newest first, so dedupe keeps the most recent statement of a fact.
  const ordered = [...events].sort((a, b) => b.occurred_at - a.occurred_at);
  const seen = new Set<string>();

  for (const e of ordered) {
    const ageDays = Math.floor((nowSec - e.occurred_at) / 86400);
    if (ageDays > EVENT_MAX_AGE_DAYS) {
      drop.push({ event: e, why: `${ageDays}d old, older than the ${EVENT_MAX_AGE_DAYS}d window` });
      continue;
    }

    // Misattribution. Checked only when the cohort is known, because an
    // empty cohort means we cannot tell, and guessing would silently
    // suppress real news.
    const named = domainsIn(e.title);
    if (cohort.size > 0 && named.length > 0 && !named.some((d) => cohort.has(d))) {
      drop.push({ event: e, why: `names ${named[0]}, which is not in this client's cohort` });
      continue;
    }

    // One statement per fact. A "grade_up" for a domain twice in one
    // digest reads as self-contradiction even when both were true in
    // sequence; the newest wins because it is the one still standing.
    const key = `${e.kind}:${named[0] ?? "-"}`;
    if (seen.has(key)) {
      drop.push({ event: e, why: `superseded by a newer ${e.kind} for the same domain` });
      continue;
    }
    seen.add(key);
    keep.push(e);
  }

  // Restore chronological order for rendering.
  keep.sort((a, b) => a.occurred_at - b.occurred_at);
  return { keep, drop };
}
