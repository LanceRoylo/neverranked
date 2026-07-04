/**
 * Dashboard -- /admin mission control (the operator front door)
 *
 * One screen that answers, in order: "is anything broken?", "what needs
 * me?", "take me to any customer or surface". Reliability first,
 * navigation second -- tuned to the stated priority: nothing breaks, and
 * if it does, know fast + know how to have it fixed.
 *
 * GREEN MEANS GREEN. Every signal is computed inside a try/catch and
 * defaults to "unknown" (grey), never "green". A tile can only be green
 * if its query actually ran and passed. A check that silently fails to
 * run shows grey, not a false all-clear.
 *
 * Every red signal carries a "Copy fix request" button: a fully-formed,
 * context-filled instruction (which surface, which signal, which tables)
 * so a fix session starts with everything it needs -- no re-explaining.
 *
 * All signals are synchronous D1 reads (mirrors /admin/health). No client
 * JS beyond the one clipboard handler. Server-render, refresh on reload.
 */

import type { Env, User } from "../types";
import { html, layout, esc } from "../render";
import { recentVerdictCounts } from "../lib/qa-auditor";
import { isReadoutShapeSnapshot } from "../lib/snapshot-shape";
import { countNeedsYouAlerts } from "../lib/alert-triage";

type Status = "green" | "yellow" | "red" | "unknown";

const SECONDS_PER_DAY = 86400;

// Mirrors health.ts CRON_EXPECTED_CADENCE (task -> expected seconds).
// Kept as a compact local copy so the hub is decoupled from health.ts's
// internals; if a cron cadence changes, update both.
const CRON_CADENCE: Record<string, number> = {
  daily_tasks: SECONDS_PER_DAY,
  auth_cleanup: SECONDS_PER_DAY,
  inbox_morning_summary: SECONDS_PER_DAY,
  anomaly_detection: SECONDS_PER_DAY,
  engine_health_check: SECONDS_PER_DAY,
  alert_dedupe: SECONDS_PER_DAY,
  qa_content_voice_sweep: SECONDS_PER_DAY,
  qa_citation_sanity_sweep: SECONDS_PER_DAY,
  qa_nvi_drift_sweep: SECONDS_PER_DAY,
  weekly_scans: 7 * SECONDS_PER_DAY,
  weekly_backup: 7 * SECONDS_PER_DAY,
  weekly_summary_email: 7 * SECONDS_PER_DAY,
};

const ENGINES = ["perplexity", "openai", "gemini", "anthropic", "bing", "google_ai_overview", "gemma"];

// engineStatus + cronStatus thresholds mirror dashboard/src/routes/health.ts.
// Keep them in sync if either side changes. The checker self-test tile
// asserts these against known-answer inputs, so an accidental drift here
// turns the self-test red rather than silently miscomputing.
function engineStatus(runs24h: number, empty24h: number): Status {
  if (runs24h === 0) return "red";
  const emptyRate = empty24h / runs24h;
  if (runs24h < 3 || emptyRate > 0.30) return "red";
  if (runs24h < 8 || emptyRate > 0.10) return "yellow";
  return "green";
}

function cronStatus(task: string, lastRan: number | null): Status {
  if (!lastRan) return "red";
  const expected = CRON_CADENCE[task];
  if (!expected) return "green";
  const age = Math.floor(Date.now() / 1000) - lastRan;
  if (age > 3 * expected) return "red";
  if (age > 1.5 * expected) return "yellow";
  return "green";
}

// Worst-of a set of green/yellow/red statuses (used to roll up a group of
// engines or crons into one tile). Never receives "unknown" -- that lives
// at the tile level (the whole query threw).
function worstGYR(list: Status[]): Status {
  if (list.includes("red")) return "red";
  if (list.includes("yellow")) return "yellow";
  return "green";
}

function dotColor(s: Status): string {
  return s === "green" ? "#5ec76a" : s === "yellow" ? "#e8c767" : s === "red" ? "#e07158" : "#6b6b72";
}

function dot(s: Status): string {
  const c = dotColor(s);
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};box-shadow:0 0 0 3px ${c}22;vertical-align:middle"></span>`;
}

function timeAgo(unixSeconds: number | null): string {
  if (!unixSeconds) return "never";
  const age = Math.floor(Date.now() / 1000) - unixSeconds;
  if (age < 60) return `${age}s ago`;
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  if (age < SECONDS_PER_DAY) return `${Math.floor(age / 3600)}h ago`;
  return `${Math.floor(age / SECONDS_PER_DAY)}d ago`;
}

interface Tile {
  key: string;
  label: string;
  status: Status;
  value: string;
  detail: string;
  href: string;
}

interface Incident {
  title: string;
  fix: string; // a fully-formed instruction to paste into a fix session
}

interface Pending {
  label: string;
  count: number | null; // null = query failed; render "—", never a fabricated 0
  href: string;
}

export async function handleHub(user: User, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - SECONDS_PER_DAY;
  const REPO = "https://github.com/LanceRoylo/neverranked";

  const tiles: Tile[] = [];
  const incidents: Incident[] = [];

  // --- Tile: citation engines (7) --------------------------------------
  try {
    const rows = (await env.DB.prepare(
      `SELECT engine, COUNT(*) as runs_24h,
              SUM(CASE WHEN length(response_text) = 0 THEN 1 ELSE 0 END) as empty_24h
       FROM citation_runs WHERE run_at > ? GROUP BY engine`
    ).bind(dayAgo).all<{ engine: string; runs_24h: number; empty_24h: number }>()).results;
    const m = new Map(rows.map((r) => [r.engine, r]));
    const statuses: Status[] = [];
    let healthy = 0;
    for (const e of ENGINES) {
      const r = m.get(e);
      const s = engineStatus(r?.runs_24h ?? 0, r?.empty_24h ?? 0);
      statuses.push(s);
      if (s === "green") healthy++;
      if (s === "red") {
        incidents.push({
          title: `Engine "${e}" is red`,
          fix: `In the NeverRanked dashboard worker (dashboard/ in the LanceRoylo/neverranked repo), the mission-control hub shows citation engine "${e}" as RED (${r?.runs_24h ?? 0} runs in the last 24h, ${r ? Math.round(((r.empty_24h) / Math.max(1, r.runs_24h)) * 100) : 0}% empty). Investigate: query citation_runs for engine='${e}' over the last 24-48h, check the engine_status row for '${e}', and confirm the daily_tasks cron fired (cron_runs). Diagnose why it stalled or is returning empty responses, and fix it.`,
        });
      }
    }
    const status = worstGYR(statuses);
    tiles.push({
      key: "engines",
      label: "Citation engines",
      status,
      value: `${healthy}/7 healthy`,
      detail: status === "green" ? "all engines firing" : "one or more engines flagged",
      href: "/admin/health",
    });
  } catch {
    tiles.push({ key: "engines", label: "Citation engines", status: "unknown", value: "—", detail: "check could not run", href: "/admin/health" });
  }

  // --- Tile: daily measurement heartbeat -------------------------------
  try {
    const row = await env.DB.prepare("SELECT MAX(run_at) as last FROM citation_runs").first<{ last: number | null }>();
    const rawLast = row?.last ?? null;
    // If the DB returns a non-numeric value, fail to unknown (via catch),
    // never let a NaN comparison silently fall through to green.
    if (rawLast !== null && !Number.isFinite(Number(rawLast))) throw new Error("run_at not numeric");
    const last = rawLast === null ? null : Number(rawLast);
    const age = last ? now - last : Infinity;
    let status: Status = "green";
    if (!last || age > 49 * 3600) status = "red"; // 49h = 2 daily cycles + 1h buffer
    else if (age > 25 * 3600) status = "yellow";
    if (status === "red") {
      incidents.push({
        title: "No measurement runs recently",
        fix: `In the NeverRanked dashboard, the mission-control hub shows NO citation_runs in the last ${last ? Math.round(age / 3600) + "h" : "(none ever)"}. The daily_tasks cron (06:00 UTC) drives citation runs. Check cron_runs for task_name='daily_tasks' (did it fire, what status), then check the citation runner path in dashboard/src/cron.ts. This is the "measurement went dark" case. Diagnose whether the cron did not fire or the runners errored, and fix it.`,
      });
    }
    tiles.push({
      key: "heartbeat",
      label: "Daily measurement",
      status,
      value: last ? timeAgo(last) : "never",
      detail: "last citation run",
      href: "/admin/health",
    });
  } catch {
    tiles.push({ key: "heartbeat", label: "Daily measurement", status: "unknown", value: "—", detail: "check could not run", href: "/admin/health" });
  }

  // --- Tile: cron heartbeats (12) --------------------------------------
  try {
    // Only a SUCCESS or PARTIAL run counts as a heartbeat. A task that ran and
    // FAILED still writes a cron_runs row (status='failure'), so an unfiltered
    // MAX(ran_at) would read a broken cron as "on time" and keep this tile green
    // through an outage — the exact green-means-green violation the hub exists to
    // prevent. Excluding failures makes a persistently-failing task go stale->red.
    const rows = (await env.DB.prepare(
      "SELECT task_name, MAX(ran_at) as last_ran FROM cron_runs WHERE status IN ('success','partial') GROUP BY task_name"
    ).all<{ task_name: string; last_ran: number }>()).results;
    const m = new Map(rows.map((r) => [r.task_name, r.last_ran]));
    const tasks = Object.keys(CRON_CADENCE);
    const statuses: Status[] = [];
    let ok = 0;
    for (const t of tasks) {
      const s = cronStatus(t, m.get(t) ?? null);
      statuses.push(s);
      if (s === "green") ok++;
      if (s === "red") {
        incidents.push({
          title: `Cron "${t}" is red`,
          fix: `In the NeverRanked dashboard, the cron task "${t}" is RED on mission control. Last ran ${timeAgo(m.get(t) ?? null)} (expected roughly every ${CRON_CADENCE[t] === SECONDS_PER_DAY ? "day" : "week"}). Check cron_runs for task_name='${t}' and the scheduled() handler in dashboard/src/cron.ts. Diagnose why it stopped firing (a thrown error mid-cron can skip later tasks) and fix it.`,
        });
      }
    }
    const status = worstGYR(statuses);
    tiles.push({
      key: "crons",
      label: "Cron heartbeats",
      status,
      value: `${ok}/${tasks.length} on time`,
      detail: status === "green" ? "all scheduled tasks current" : "a scheduled task is late",
      href: "/admin/health",
    });
  } catch {
    tiles.push({ key: "crons", label: "Cron heartbeats", status: "unknown", value: "—", detail: "check could not run", href: "/admin/health" });
  }

  // --- Tile: customer cockpits (split-brain + freshness detector) -------
  // Highest-stakes tile. RED = a legacy-SHAPE snapshot: the split-brain
  // clobber that silently renders a paying cockpit/memo/Atlas as zeros.
  // A legitimate zero-citation week is NOT broken, so SHAPE is the only
  // red signal. A stale (old) or empty latest snapshot is a softer
  // freshness YELLOW, so measurement that silently stopped is still caught
  // rather than sitting green off old data.
  try {
    const paying = (await env.DB.prepare(
      "SELECT client_slug, signed_at FROM customers WHERE status IN ('active','pilot')"
    ).all<{ client_slug: string; signed_at: number | null }>()).results;
    const payingCount = paying.length;

    const rows = (await env.DB.prepare(
      `SELECT cs.client_slug, cs.week_start, cs.engines_breakdown, cs.top_competitors, cs.total_queries
       FROM citation_snapshots cs
       WHERE cs.client_slug IN (SELECT client_slug FROM customers WHERE status IN ('active','pilot'))
         AND cs.week_start = (SELECT MAX(week_start) FROM citation_snapshots c2 WHERE c2.client_slug = cs.client_slug)`
    ).all<{ client_slug: string; week_start: number; engines_breakdown: string; top_competitors: string; total_queries: number }>()).results;

    const broken: string[] = []; // legacy shape -> RED (the clobber)
    const stale: string[] = [];  // old or empty latest snapshot -> YELLOW
    for (const r of rows) {
      if (!isReadoutShapeSnapshot(r.engines_breakdown, r.top_competitors)) {
        broken.push(r.client_slug);
        incidents.push({
          title: `Customer "${r.client_slug}" cockpit is broken`,
          fix: `URGENT, customer-facing. In the NeverRanked dashboard the paying customer "${r.client_slug}" has a LEGACY-shape citation_snapshots row for the latest week (week_start ${r.week_start}). Their cockpit (/c/${r.client_slug}/), monthly memo, and Atlas render zeros. This is the snapshot split-brain (see the dashboard_snapshot_shape_split_brain note). Fix: re-run the forensic to D1 bridge for ${r.client_slug} so the latest snapshot is readout-shape, then confirm isReadoutShapeSnapshot() passes and the cockpit shows real numbers.`,
        });
      } else if (typeof r.week_start !== "number" || (now - r.week_start) > 14 * SECONDS_PER_DAY || (r.total_queries ?? 0) === 0) {
        stale.push(r.client_slug);
      }
    }

    // A paying customer with NO snapshot row at all never appears in `rows`, so
    // it would otherwise be invisible and the tile could green while that
    // customer's cockpit is empty. Detect the missing ones; past the 4-day
    // onboarding grace (same as the cron watchdog) that is customer-facing RED.
    const haveSnap = new Set(rows.map((r) => r.client_slug));
    const GRACE = 4 * SECONDS_PER_DAY;
    const missingPastGrace: string[] = [];
    const missingInGrace: string[] = [];
    for (const c of paying) {
      if (haveSnap.has(c.client_slug)) continue;
      if (typeof c.signed_at === "number" && (now - c.signed_at) > GRACE) {
        missingPastGrace.push(c.client_slug);
        incidents.push({
          title: `Customer "${c.client_slug}" has no snapshot`,
          fix: `URGENT, customer-facing. Paying customer "${c.client_slug}" has NO citation_snapshots row, so their cockpit (/c/${c.client_slug}/), monthly memo, and Atlas have no data to show. They signed more than 4 days ago (past onboarding grace). Fix: run the onboarding bridge / measurement for ${c.client_slug} so a readout-shape snapshot exists.`,
        });
      } else {
        missingInGrace.push(c.client_slug);
      }
    }

    const redSlugs = [...broken, ...missingPastGrace];
    const yellowSlugs = [...stale, ...missingInGrace];
    let status: Status;
    let value: string;
    let detail: string;
    if (payingCount === 0) {
      status = "unknown"; value = "—"; detail = "no paying customers onboarded yet";
    } else if (redSlugs.length > 0) {
      status = "red"; value = `${redSlugs.length} broken`;
      detail = [
        broken.length ? `${broken.join(", ")} rendering zeros` : "",
        missingPastGrace.length ? `${missingPastGrace.join(", ")} have no snapshot` : "",
      ].filter(Boolean).join("; ");
    } else if (yellowSlugs.length > 0) {
      status = "yellow"; value = `${yellowSlugs.length} pending`;
      detail = [
        stale.length ? `${stale.join(", ")} stale/empty` : "",
        missingInGrace.length ? `${missingInGrace.join(", ")} onboarding (snapshot pending)` : "",
      ].filter(Boolean).join("; ");
    } else {
      status = "green"; value = `${rows.length} clean`; detail = "every cockpit reading fresh, real data";
    }
    tiles.push({ key: "snapshots", label: "Customer cockpits", status, value, detail, href: "/admin/scans" });
  } catch {
    tiles.push({ key: "snapshots", label: "Customer cockpits", status: "unknown", value: "—", detail: "check could not run", href: "/admin/scans" });
  }

  // --- Tile: scan freshness (owned domains) ----------------------------
  try {
    const rows = (await env.DB.prepare(
      `SELECT d.id, MAX(sr.scanned_at) as last_scan
       FROM domains d LEFT JOIN scan_results sr ON sr.domain_id = d.id
       WHERE d.active = 1 AND d.is_competitor = 0
       GROUP BY d.id`
    ).all<{ id: number; last_scan: number | null }>()).results;
    let fresh = 0, stale = 0, never = 0;
    for (const r of rows) {
      if (!r.last_scan) never++;
      else if (now - r.last_scan < 8 * SECONDS_PER_DAY) fresh++;
      else stale++;
    }
    // Weekly scan cadence, so staleness is a soft signal: any stale or
    // never-scanned owned domain is a yellow, never a red. No domains = unknown.
    let status: Status = "green";
    if (rows.length === 0) status = "unknown";
    else if (never > 0 || stale > 0) status = "yellow";
    tiles.push({
      key: "scans",
      label: "Domain scans",
      status,
      value: rows.length === 0 ? "—" : `${fresh} fresh`,
      detail: rows.length === 0 ? "no active domains" : `${stale} stale, ${never} never scanned`,
      href: "/admin/scans",
    });
  } catch {
    tiles.push({ key: "scans", label: "Domain scans", status: "unknown", value: "—", detail: "check could not run", href: "/admin/scans" });
  }

  // --- Tile: QA verdicts (24h) -----------------------------------------
  try {
    const qa = await recentVerdictCounts(env, 24);
    // Zero audits in 24h means the QA sweeps did not run, not "all clear",
    // so it renders unknown (grey), never a false green.
    const status: Status = qa.red > 0 ? "red" : qa.yellow > 0 ? "yellow" : qa.green > 0 ? "green" : "unknown";
    if (qa.red > 0) {
      incidents.push({
        title: `${qa.red} QA audit${qa.red === 1 ? "" : "s"} failed (24h)`,
        fix: `In the NeverRanked dashboard, the independent QA grader recorded ${qa.red} RED verdict(s) in the last 24h. Open /admin/qa, find the red audit(s), read the grader_reason, and determine whether a production output (schema, content draft, citation, NVI, or a cross-system check) is actually wrong. If real, fix the underlying generator; if a false positive, note why.`,
      });
    }
    tiles.push({
      key: "qa",
      label: "QA grader (24h)",
      status,
      value: `${qa.green}/${qa.yellow}/${qa.red}`,
      detail: status === "unknown" ? "no audits in 24h (sweeps may not have run)" : "green / yellow / red verdicts",
      href: "/admin/qa",
    });
  } catch {
    tiles.push({ key: "qa", label: "QA grader (24h)", status: "unknown", value: "—", detail: "check could not run", href: "/admin/qa" });
  }

  // --- Tile: checker self-test (verify the checkers themselves) ---------
  // Guards against a "false loop": a checker reporting green while its logic
  // is inverted or its query path is broken. Runs the checker functions
  // against KNOWN-ANSWER inputs, plus two permanent D1 canary snapshots (one
  // known-legacy, one known-readout) to prove the split-brain detector's
  // whole query path still works. Any failed assertion turns this RED:
  // do not trust the other tiles until it is green again.
  try {
    const fails: string[] = [];
    if (engineStatus(0, 0) !== "red") fails.push("engineStatus(0,0) not red");
    if (engineStatus(20, 0) !== "green") fails.push("engineStatus(20,0) not green");
    if (cronStatus("daily_tasks", now - 10 * SECONDS_PER_DAY) !== "red") fails.push("cronStatus(10d late) not red");
    if (cronStatus("daily_tasks", now - 60) !== "green") fails.push("cronStatus(fresh) not green");
    const KNOWN_LEGACY = '{"google_ai_overview":{"queries":10,"citations":2}}';
    const KNOWN_READOUT = '{"Perplexity":{"citations":5,"total":19,"share_pct":26.3}}';
    if (isReadoutShapeSnapshot(KNOWN_READOUT) !== true) fails.push("shape(readout) not true");
    if (isReadoutShapeSnapshot(KNOWN_LEGACY) !== false) fails.push("shape(legacy) not false");
    // End-to-end canary: two permanent rows the detector must classify
    // correctly (proves the real query path + columns + helper, not just
    // the pure function).
    const canaries = (await env.DB.prepare(
      "SELECT client_slug, engines_breakdown, top_competitors FROM citation_snapshots WHERE client_slug IN ('_canary_legacy','_canary_readout')"
    ).all<{ client_slug: string; engines_breakdown: string; top_competitors: string }>()).results;
    const cLegacy = canaries.find((c) => c.client_slug === "_canary_legacy");
    const cReadout = canaries.find((c) => c.client_slug === "_canary_readout");
    if (!cLegacy || !cReadout) {
      fails.push("canary rows missing from citation_snapshots");
    } else {
      if (isReadoutShapeSnapshot(cLegacy.engines_breakdown, cLegacy.top_competitors) !== false) fails.push("canary_legacy misclassified as readout");
      if (isReadoutShapeSnapshot(cReadout.engines_breakdown, cReadout.top_competitors) !== true) fails.push("canary_readout misclassified as legacy");
    }
    const status: Status = fails.length > 0 ? "red" : "green";
    if (fails.length > 0) {
      incidents.push({
        title: "Checker self-test failed",
        fix: `In the NeverRanked mission-control hub, the checker self-test failed these known-answer assertions: ${fails.join("; ")}. The monitoring logic itself is wrong (an inverted threshold, a changed helper such as isReadoutShapeSnapshot, or the canary rows in citation_snapshots were removed or altered). Do not trust the other status tiles until this is green. Investigate the self-test block in dashboard/src/routes/hub.ts and dashboard/src/lib/snapshot-shape.ts.`,
      });
    }
    tiles.push({
      key: "selftest",
      label: "Checker self-test",
      status,
      value: fails.length > 0 ? `${fails.length} failing` : "passing",
      detail: fails.length > 0 ? "the monitors are miscomputing" : "monitors verified against known answers",
      href: "/admin",
    });
  } catch {
    tiles.push({ key: "selftest", label: "Checker self-test", status: "unknown", value: "—", detail: "self-test could not run", href: "/admin" });
  }

  // --- Overall banner: green only if everything ran AND passed ----------
  const anyRed = tiles.some((t) => t.status === "red");
  const anyUnknown = tiles.some((t) => t.status === "unknown");
  const anyYellow = tiles.some((t) => t.status === "yellow");
  const overall: Status = anyRed ? "red" : anyUnknown ? "unknown" : anyYellow ? "yellow" : "green";
  const overallLabel =
    overall === "green" ? "All systems normal."
    : overall === "yellow" ? "Degraded. Some checks are flagged below. Review them to decide whether action is needed."
    : overall === "unknown" ? "One or more checks could not run. Status is unverified, not clear. Review the grey tiles."
    : "Something is broken. Fix requests are queued below, ready to copy.";

  // --- Pending queue: what needs me now --------------------------------
  async function count(sql: string): Promise<number | null> {
    try {
      const r = await env.DB.prepare(sql).first<{ n: number }>();
      const n = Number(r?.n ?? 0);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  const pending: Pending[] = [
    { label: "Alerts needing you", count: await countNeedsYouAlerts(env).catch(() => null), href: "/alerts" },
    { label: "Inbox items pending", count: await count("SELECT COUNT(*) as n FROM admin_inbox WHERE status = 'pending'"), href: "/admin/inbox" },
    { label: "NVI reports awaiting review", count: await count("SELECT COUNT(*) as n FROM nvi_reports WHERE status = 'pending'"), href: "/admin/nvi" },
    { label: "Content drafts held by QA", count: await count("SELECT COUNT(*) as n FROM content_drafts WHERE qa_level = 'held'"), href: "/admin/content-review" },
    { label: "Schema injections pending", count: await count("SELECT COUNT(*) as n FROM schema_injections WHERE status = 'pending'"), href: "/admin/inject" },
    { label: "Competitor suggestions", count: await count("SELECT COUNT(*) as n FROM competitor_suggestions WHERE status = 'pending'"), href: "/admin/inbox" },
    { label: "Agency applications", count: await count("SELECT COUNT(*) as n FROM agency_applications WHERE status = 'pending'"), href: "/admin/inbox" },
  ];
  const pendingActive = pending.filter((p) => p.count === null || p.count > 0);

  // --- Customers strip -------------------------------------------------
  const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM for readout link
  interface CustRow { client_slug: string; name: string | null; status: string; kind: string; }
  const custMap = new Map<string, CustRow>();
  try {
    const rows = (await env.DB.prepare(
      "SELECT client_slug, name, status FROM customers WHERE status IN ('active','pilot','paused') ORDER BY (status='active') DESC, COALESCE(signed_at, 0) DESC"
    ).all<{ client_slug: string; name: string; status: string }>()).results;
    for (const r of rows) custMap.set(r.client_slug, { client_slug: r.client_slug, name: r.name, status: r.status, kind: "customer" });
  } catch { /* customers table empty or unavailable -> fall through to kickoff slugs */ }
  // Merge in any slug that has a kickoff started but is not yet in customers
  // (e.g. Prince Waikiki pre-onboarding), plus resolve share tokens.
  const shareTokens = new Map<string, string>();
  const hasPreread = new Map<string, boolean>();
  try {
    const rows = (await env.DB.prepare(
      "SELECT client_slug, share_token, customer_json FROM kickoff_notes"
    ).all<{ client_slug: string; share_token: string | null; customer_json: string | null }>()).results;
    for (const r of rows) {
      if (r.share_token) shareTokens.set(r.client_slug, r.share_token);
      hasPreread.set(r.client_slug, !!(r.customer_json && r.customer_json.trim() && r.customer_json.trim() !== "{}"));
      if (!custMap.has(r.client_slug)) {
        custMap.set(r.client_slug, { client_slug: r.client_slug, name: null, status: "prospect", kind: "prospect" });
      }
    }
  } catch { /* kickoff_notes unavailable -> customers only */ }
  const customers = Array.from(custMap.values());

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const bannerColor = dotColor(overall);
  const ribbon = tiles.map((t) => `
    <a href="${t.href}" style="text-decoration:none;color:inherit;display:block">
      <div class="card" style="margin:0;padding:18px;border-left:3px solid ${dotColor(t.status)};transition:border-color .15s">
        <div class="label" style="margin-bottom:8px">${esc(t.label)}</div>
        <div style="display:flex;align-items:center;gap:9px">
          ${dot(t.status)}
          <span style="font-family:var(--serif);font-size:21px;color:var(--text)">${esc(t.value)}</span>
        </div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:6px;line-height:1.4">${esc(t.detail)}</div>
      </div>
    </a>`).join("");

  const incidentRows = incidents.length === 0
    ? ""
    : `<div class="card" style="border:1px solid rgba(224,113,88,.4);background:rgba(224,113,88,.04)">
        <div class="label" style="color:#e07158">Broken. Copy a fix request</div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
          ${incidents.map((inc) => `
            <div style="display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;padding:10px 12px;background:rgba(0,0,0,.2);border-radius:6px">
              <div style="display:flex;align-items:center;gap:9px">${dot("red")}<span style="font-size:14px;color:var(--text)">${esc(inc.title)}</span></div>
              <button type="button" class="hub-fix" data-fix="${esc(inc.fix)}" style="background:transparent;color:var(--gold);border:1px solid var(--gold);font-family:var(--label);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:7px 13px;border-radius:4px;cursor:pointer">Copy fix request</button>
            </div>`).join("")}
        </div>
      </div>`;

  const pendingRows = pendingActive.length === 0
    ? `<div style="padding:14px;color:var(--text-faint);font-size:13px">Nothing waiting on you. Inbox zero.</div>`
    : pendingActive.map((p) => `
      <a href="${p.href}" style="text-decoration:none;color:inherit;display:flex;align-items:center;justify-content:space-between;padding:11px 4px;border-bottom:1px solid var(--line)">
        <span style="font-size:14px;color:var(--text)">${esc(p.label)}</span>
        <span style="font-family:var(--serif);font-size:17px;color:${p.count === null ? "#6b6b72" : "var(--gold)"}">${p.count === null ? "—" : p.count}</span>
      </a>`).join("");

  function custBtn(label: string, href: string, external = false): string {
    return `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ""} style="font-family:var(--label);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);text-decoration:none;border:1px solid var(--line);border-radius:4px;padding:5px 10px;white-space:nowrap">${esc(label)}</a>`;
  }
  const customerRows = customers.length === 0
    ? `<div style="padding:14px;color:var(--text-faint);font-size:13px">No customers or kickoffs yet.</div>`
    : customers.map((c) => {
        const token = shareTokens.get(c.client_slug);
        const pre = hasPreread.get(c.client_slug);
        const badge = c.kind === "prospect"
          ? `<span style="font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#e8c767;border:1px solid rgba(232,199,103,.4);border-radius:3px;padding:1px 6px">kickoff</span>`
          : `<span style="font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-faint)">${esc(c.status)}</span>`;
        const title = c.name || c.client_slug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        return `
        <div style="padding:13px 0;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-family:var(--serif);font-size:16px;color:var(--text)">${esc(title)}</span>
            ${badge}
          </div>
          <div style="display:flex;gap:7px;flex-wrap:wrap">
            ${custBtn("Cockpit", `/c/${encodeURIComponent(c.client_slug)}/`)}
            ${custBtn("Atlas", `/c/${encodeURIComponent(c.client_slug)}/atlas/`)}
            ${custBtn("Kickoff", `/admin/kickoff/${encodeURIComponent(c.client_slug)}`)}
            ${token ? custBtn(pre ? "Pre-read (done)" : "Pre-read link", `/kickoff-intake/${encodeURIComponent(token)}`, true) : ""}
            ${custBtn("Readout", `/report/${encodeURIComponent(c.client_slug)}/${monthKey}`)}
          </div>
        </div>`;
      }).join("");

  const internalLinks: [string, string][] = [
    ["Cockpit", "/admin/cockpit"],
    ["Health", "/admin/health"],
    ["QA audits", "/admin/qa"],
    ["Decisions", "/admin/decisions"],
    ["Inbox", "/admin/inbox"],
    ["NVI", "/admin/nvi"],
    ["Content review", "/admin/content-review"],
    ["Manage clients", "/admin/manage"],
    ["Scan health", "/admin/scans"],
    ["Engagement", "/admin/engagement"],
    ["Leads", "/admin/leads"],
    ["Warm prospects", "/admin/warm-prospects"],
    ["Pitches", "/admin/pitches"],
  ];
  const externalLinks: [string, string][] = [
    ["Deploy status", `${REPO}/actions/workflows/deploy-dashboard.yml`],
    ["GitHub Actions", `${REPO}/actions`],
    ["Cloudflare", "https://dash.cloudflare.com"],
    ["Stripe", "https://dashboard.stripe.com"],
    ["Search Console", "https://search.google.com/search-console"],
    ["neverranked.com", "https://neverranked.com"],
    ["Grader", "https://check.neverranked.com"],
  ];
  function linkChip(label: string, href: string, external: boolean): string {
    return `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ""} style="text-decoration:none;color:var(--text);font-size:13px;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--bg-lift);display:block">${esc(label)}</a>`;
  }

  const body = `
    <div class="section-header">
      <h1>Mission control</h1>
      <div class="section-sub">See what is broken, what needs you, and reach any surface in one click. Refresh to recompute.</div>
    </div>

    <div class="card" style="border:2px solid ${bannerColor};background:${bannerColor}0a">
      <div style="display:flex;align-items:center;gap:14px">
        ${dot(overall)}
        <div style="font-size:18px;font-weight:500;color:var(--text)">${esc(overallLabel)}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:16px">
      ${ribbon}
    </div>

    ${incidentRows}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <div class="card">
        <div class="label">Needs you now</div>
        <div style="margin-top:8px">${pendingRows}</div>
      </div>
      <div class="card">
        <div class="label">Customers</div>
        <div style="margin-top:8px">${customerRows}</div>
      </div>
    </div>

    <div class="card">
      <div class="label">Launchpad</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:12px">
        ${internalLinks.map(([l, h]) => linkChip(l, h, false)).join("")}
      </div>
      <div class="label" style="margin-top:18px;color:var(--text-faint)">External</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px">
        ${externalLinks.map(([l, h]) => linkChip(l, h, true)).join("")}
      </div>
    </div>

    <script>
      (function(){
        document.querySelectorAll('.hub-fix').forEach(function(btn){
          btn.addEventListener('click', function(){
            var text = btn.getAttribute('data-fix') || '';
            if (navigator.clipboard) navigator.clipboard.writeText(text);
            var old = btn.textContent;
            btn.textContent = 'Copied';
            setTimeout(function(){ btn.textContent = old; }, 1600);
          });
        });
      })();
    </script>
  `;

  return html(layout("Mission control", body, user));
}
