/**
 * Hawaii Theatre Center -- Event schema re-scrape cron.
 *
 * Pulls the list of active shows from
 * https://www.hawaiitheatre.com/upcoming-events/ and rewrites the
 * Event rows in schema_injections for client_slug='hawaii-theatre'.
 *
 * Runs daily from runDailyTasks(). Cheap (one fetch + ~30 DB writes),
 * and events change often enough that daily refresh is the right
 * cadence. Events that drop off the page (sold out / cancelled / past)
 * are removed from the schema set on the next run.
 *
 * Page is built with Elementor + JetEngine. Each card is a section
 * with class `elementor-element-33c4d34` containing:
 *   - Salesforce ticket URL (also the dedupe key via the event ID)
 *   - Image
 *   - Date text ("May 1, 2026")
 *   - Title (h2)
 *
 * If the page markup changes upstream, parse_count drops and we
 * file an admin_alerts row so we know to re-write the regexes.
 */
import type { Env } from "./types";
import { createAlertIfFresh } from "./admin-alerts";

const SOURCE_URL = "https://www.hawaiitheatre.com/upcoming-events/";
const CLIENT_SLUG = "hawaii-theatre";
const TARGET_PAGES = ["/upcoming-events*"];

const MONTHS: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

const LOCATION = {
  "@type": "PerformingArtsTheater",
  name: "Hawaii Theatre Center",
  address: {
    "@type": "PostalAddress",
    streetAddress: "1130 Bethel Street",
    addressLocality: "Honolulu",
    addressRegion: "HI",
    postalCode: "96813",
    addressCountry: "US",
  },
  url: "https://www.hawaiitheatre.com",
};

const ORGANIZER = {
  "@type": "Organization",
  name: "Hawaii Theatre Center",
  url: "https://www.hawaiitheatre.com",
};

interface RawEvent {
  title: string | null;
  dateText: string | null;
  ticketUrl: string | null;
  image: string | null;
}

interface EventSchema {
  "@context": string;
  "@type": "Event";
  "@id": string;
  name: string;
  startDate: string;
  eventStatus: string;
  eventAttendanceMode: string;
  location: typeof LOCATION;
  organizer: typeof ORGANIZER;
  image: string;
  url: string;
  offers: {
    "@type": "Offer";
    url: string;
    availability: string;
    validFrom: string;
  };
}

/** Decode the small set of HTML entities we see on the source page. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function parseEvents(html: string): RawEvent[] {
  // Split on each event card opening tag. The first chunk is preamble.
  const parts = html.split(/<section [^>]*elementor-element-33c4d34[^>]*>/).slice(1);
  const events: RawEvent[] = [];
  for (const card of parts) {
    const imgMatch = card.match(
      /<a href="(https:\/\/hawaiitheatre\.my\.salesforce-sites\.com\/ticket\/[^"]+)">\s*<img[^>]+src="([^"]+)"/
    );
    const dateMatch = card.match(/jet-listing-dynamic-field__content"\s*>\s*([^<]+?)\s*<\/div>/);
    const titleMatch = card.match(
      /<h2 class="elementor-heading-title elementor-size-default">([^<]+)<\/h2>/
    );
    events.push({
      title: titleMatch ? decodeEntities(titleMatch[1].trim()) : null,
      dateText: dateMatch ? dateMatch[1].trim() : null,
      ticketUrl: imgMatch ? imgMatch[1] : null,
      image: imgMatch ? imgMatch[2] : null,
    });
  }
  return events;
}

function parseDate(s: string): string | null {
  const m = s.match(/(\w+)\s+(\d+),\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(parseInt(m[2], 10)).padStart(2, "0")}`;
}

function salesforceId(url: string): string | null {
  const m = url.match(/\/events\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

function toSchema(ev: RawEvent, todayIso: string): EventSchema | null {
  if (!ev.title || !ev.dateText || !ev.ticketUrl || !ev.image) return null;
  const startDate = parseDate(ev.dateText);
  const sid = salesforceId(ev.ticketUrl);
  if (!startDate || !sid) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `https://www.hawaiitheatre.com/event/${sid}`,
    name: ev.title,
    startDate,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: LOCATION,
    organizer: ORGANIZER,
    image: ev.image,
    url: ev.ticketUrl,
    offers: {
      "@type": "Offer",
      url: ev.ticketUrl,
      availability: "https://schema.org/InStock",
      validFrom: todayIso,
    },
  };
}

export interface RefreshResult {
  fetched: number;
  parsed: number;
  complete: number;
  added: number;
  removed: number;
  unchanged: number;
  error?: string;
  // Step-by-step trace fields populated when dryRun=true. Empty in
  // normal cron runs to keep the response shape small.
  trace?: {
    step: string;
    ok: boolean;
    detail?: string;
  }[];
}

/**
 * Stale-data self-check. Called at the start of every refresh. If the
 * last successful write was more than STALE_THRESHOLD_HOURS ago, fires
 * a fresh admin_alert (deduped 24h) so a silent failure of the inner
 * cron path never goes more than ~36h without surfacing. This is the
 * "defense-in-depth" layer that catches the May-9-to-May-28 silent
 * failure pattern (cron parent runs, inner refresh throws, error is
 * caught and console-logged, schema_injections stays stale, nobody
 * notices until a customer asks).
 */
const STALE_THRESHOLD_HOURS = 36;

async function checkStaleness(env: Env): Promise<{ stale: boolean; ageHours: number | null; lastAt: number | null }> {
  try {
    const row = await env.DB.prepare(
      "SELECT MAX(approved_at) AS last_at FROM schema_injections " +
      "WHERE client_slug = ? AND schema_type = 'Event' AND status = 'approved'"
    ).bind(CLIENT_SLUG).first<{ last_at: number | null }>();
    const lastAt = row?.last_at ?? null;
    if (!lastAt) return { stale: true, ageHours: null, lastAt: null };
    const now = Math.floor(Date.now() / 1000);
    const ageHours = (now - lastAt) / 3600;
    return { stale: ageHours > STALE_THRESHOLD_HOURS, ageHours, lastAt };
  } catch {
    // If we can't even query the table, treat as stale so the alert
    // fires. Better to over-alert than silently miss a DB failure.
    return { stale: true, ageHours: null, lastAt: null };
  }
}

/**
 * Refresh the HTC event-schema injections from the live /upcoming-events/
 * page. Runs daily under runDailyTasks (cron.ts).
 *
 * Options:
 *   dryRun: if true, runs the full fetch + parse + diff but skips the
 *           D1 batch write AND skips firing customer-feed alerts. Returns
 *           the same RefreshResult shape PLUS a step-by-step `trace`
 *           field so the caller can see exactly where execution stops on
 *           failure. Used by /health/htc-events?dryrun=1 for no-auth
 *           root-cause diagnostics.
 *   skipStalenessCheck: if true, suppresses the up-front staleness alert.
 *           Useful when called manually after a known fix so the
 *           previous-state stale alert doesn't fire one last time.
 */
export async function refreshHawaiiTheatreEvents(
  env: Env,
  opts: { dryRun?: boolean; skipStalenessCheck?: boolean } = {},
): Promise<RefreshResult> {
  const dryRun = !!opts.dryRun;
  const result: RefreshResult = {
    fetched: 0, parsed: 0, complete: 0, added: 0, removed: 0, unchanged: 0,
    trace: dryRun ? [] : undefined,
  };
  const trace = (step: string, ok: boolean, detail?: string) => {
    if (dryRun && result.trace) result.trace.push({ step, ok, detail });
  };

  // Up-front staleness check. Fires an admin_alert if data is older
  // than STALE_THRESHOLD_HOURS (~36h). This is the "defense-in-depth"
  // monitor that catches silent inner-cron failures. Even if THIS
  // refresh succeeds, we still want a record that the prior state
  // was stale so we can investigate.
  const staleness = await checkStaleness(env);
  trace("staleness_check", true, `last_age_hours=${staleness.ageHours?.toFixed(1) ?? "null"} stale=${staleness.stale}`);
  if (!dryRun && !opts.skipStalenessCheck && staleness.stale) {
    await createAlertIfFresh(env, {
      clientSlug: CLIENT_SLUG,
      type: "htc_events_stale",
      title: `HTC events: stale data (${staleness.ageHours ? staleness.ageHours.toFixed(1) + "h" : "never written"})`,
      detail: `schema_injections last refresh was ${staleness.ageHours ? staleness.ageHours.toFixed(1) + " hours" : "never"} ago. Threshold is ${STALE_THRESHOLD_HOURS}h. The daily refresh has been silently failing or being skipped. Check /health/htc-events?dryrun=1 for the step-by-step diagnostic.`,
    });
  }

  let html: string;
  try {
    const resp = await fetch(SOURCE_URL, {
      headers: { "User-Agent": "NeverRanked-Scraper/1.0 (+https://neverranked.com)" },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    html = await resp.text();
    result.fetched = html.length;
    trace("fetch", true, `${html.length} bytes`);
  } catch (e) {
    result.error = `fetch failed: ${e}`;
    trace("fetch", false, String(e));
    if (!dryRun) {
      await createAlertIfFresh(env, {
        clientSlug: CLIENT_SLUG,
        type: "htc_events_fetch_failed",
        title: "HTC events scrape: fetch failed",
        detail: `Could not fetch ${SOURCE_URL}: ${e}`,
      });
    }
    return result;
  }

  const raw = parseEvents(html);
  result.parsed = raw.length;
  trace("parse", raw.length > 0, `chunks=${raw.length}`);

  const todayIso = new Date().toISOString().slice(0, 10);
  const fresh: EventSchema[] = [];
  for (const ev of raw) {
    const s = toSchema(ev, todayIso);
    if (s) fresh.push(s);
  }
  result.complete = fresh.length;
  trace("schema_build", fresh.length > 0, `complete=${fresh.length} of ${raw.length}`);

  // If parser produces zero rows from a non-empty page, the markup
  // probably changed -- bail out before we wipe live schemas.
  if (result.fetched > 1000 && fresh.length === 0) {
    result.error = "parser produced 0 events from a non-empty page";
    if (!dryRun) {
      await createAlertIfFresh(env, {
        clientSlug: CLIENT_SLUG,
        type: "htc_events_parser_drift",
        title: "HTC events scrape: parser drift suspected",
        detail: `Page returned ${result.fetched} bytes but parser produced 0 events. Check selectors in htc-events-cron.ts.`,
      });
    }
    return result;
  }

  // Diff against existing rows so the alert log shows what changed.
  // Wrapped in try/catch (previously uncaught) so D1 SELECT failures
  // surface as admin_alerts instead of silently propagating up to
  // cron.ts and getting swallowed by its outer catch.
  let existing: { json_ld: string }[] = [];
  try {
    existing = (await env.DB.prepare(
      "SELECT json_ld FROM schema_injections WHERE client_slug = ? AND schema_type = 'Event'"
    ).bind(CLIENT_SLUG).all<{ json_ld: string }>()).results;
    trace("d1_select_existing", true, `rows=${existing.length}`);
  } catch (e) {
    result.error = `d1 SELECT failed: ${e}`;
    trace("d1_select_existing", false, String(e));
    if (!dryRun) {
      await createAlertIfFresh(env, {
        clientSlug: CLIENT_SLUG,
        type: "htc_events_db_failed",
        title: "HTC events scrape: D1 SELECT failed",
        detail: `Could not read existing schema_injections rows for diff: ${e}. Inner refresh has likely been failing silently here.`,
      });
    }
    return result;
  }

  const existingIds = new Set<string>();
  for (const row of existing) {
    try {
      const id = JSON.parse(row.json_ld)["@id"];
      if (typeof id === "string") existingIds.add(id);
    } catch { /* skip malformed row */ }
  }
  const freshIds = new Set(fresh.map((s) => s["@id"]));
  for (const id of freshIds) {
    if (existingIds.has(id)) result.unchanged++;
    else result.added++;
  }
  for (const id of existingIds) {
    if (!freshIds.has(id)) result.removed++;
  }

  // Idempotent rewrite. Wrapped so a single statement failing doesn't
  // leave us with a partial set. D1 batch is atomic across statements.
  // Dry-run mode skips the actual write so the caller can see what
  // WOULD happen without disturbing live data.
  const stmts = [
    env.DB.prepare(
      "DELETE FROM schema_injections WHERE client_slug = ? AND schema_type = 'Event'"
    ).bind(CLIENT_SLUG),
  ];
  const tp = JSON.stringify(TARGET_PAGES);
  for (const s of fresh) {
    stmts.push(env.DB.prepare(
      "INSERT INTO schema_injections (client_slug, schema_type, json_ld, target_pages, status, approved_at) " +
      "VALUES (?, 'Event', ?, ?, 'approved', unixepoch())"
    ).bind(CLIENT_SLUG, JSON.stringify(s), tp));
  }
  if (dryRun) {
    trace("d1_batch_write", true, `SKIPPED (dryrun); ${stmts.length} statements prepared`);
  } else {
    try {
      await env.DB.batch(stmts);
      trace("d1_batch_write", true, `${stmts.length} statements committed`);
    } catch (e) {
      result.error = `d1 batch failed: ${e}`;
      trace("d1_batch_write", false, String(e));
      await createAlertIfFresh(env, {
        clientSlug: CLIENT_SLUG,
        type: "htc_events_db_failed",
        title: "HTC events scrape: D1 batch write failed",
        detail: `Batch write of ${stmts.length} statements failed: ${e}. This is most likely where the silent 18-day failure pattern lives.`,
      });
      return result;
    }
  }

  // Surface real state changes in the customer-visible activity
  // feed. Quiet runs (only unchanged) don't write an alert -- no
  // signal value, just feed noise. createAlertIfFresh dedupes
  // within 24h so manual triggers don't multi-post. Skipped on
  // dryRun so diagnostic calls don't pollute Greg's activity feed.
  if (!dryRun && (result.added > 0 || result.removed > 0)) {
    const parts: string[] = [];
    if (result.added > 0) parts.push(`${result.added} added`);
    if (result.removed > 0) parts.push(`${result.removed} removed`);
    await createAlertIfFresh(env, {
      clientSlug: CLIENT_SLUG,
      type: "deploy",
      title: `Event refresh: ${parts.join(", ")}. ${result.complete} events live.`,
      detail: result.removed > 0
        ? "Shows that dropped off /upcoming-events/ (sold out, cancelled, or past) had their schemas removed. New shows on the page got schema deployed."
        : "New shows added to /upcoming-events/ got Event schema deployed.",
      windowHours: 1, // tight window so a real same-day change still surfaces
    });
  }

  console.log(
    `[htc-events] parsed=${result.parsed} complete=${result.complete} ` +
    `added=${result.added} removed=${result.removed} unchanged=${result.unchanged}`
  );
  return result;
}
