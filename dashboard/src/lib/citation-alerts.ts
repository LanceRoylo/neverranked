/**
 * Citation alerts — diff detection + digest email delivery.
 *
 * Two responsibilities:
 *
 * 1) detectAndRecordAlerts(env, runId, keywordId, engine, clientSlug)
 *    Called from citations.ts after every INSERT into citation_runs.
 *    Compares the new state to the most recent prior run for the same
 *    (keyword, engine) tuple. If client_cited transitioned (gained or
 *    lost), writes a citation_alerts row.
 *
 *    Plan-gated: only fires for clients on Signal+ (realTimeAlerts
 *    feature flag). Pulse customers run monthly so per-tick diffs
 *    aren't useful.
 *
 *    First-ever run for a (keyword, engine) tuple does NOT fire a
 *    "gained" alert -- there's no prior state to diff against. The
 *    first time we see a client cited counts as the initial baseline,
 *    not a gain.
 *
 * 2) sendPendingDigests(env)
 *    Called from the cron after the weekly citation run completes.
 *    Groups all alerts with notified_at IS NULL by client_slug, sends
 *    one digest email per customer, marks them notified.
 *
 *    Send-cap: max 1 digest per client per cron tick. The query
 *    naturally enforces this since it groups by client_slug.
 */
import type { Env } from "../types";
import { clientHasFeature } from "./plan-limits";

interface AlertCandidate {
  client_slug: string;
  keyword_id: number;
  engine: string;
  new_run_id: number;
  new_client_cited: number;
  new_prominence: number | null;
}

/** Compares the just-inserted run to the prior run for the same
 *  (keyword, engine) and writes a citation_alerts row when status
 *  changed. Idempotent: re-running the same diff produces the same
 *  alert (we don't double-write because we always read the latest
 *  prior run, not "the run before the one we just wrote"). */
export async function detectAndRecordAlerts(
  env: Env,
  candidate: AlertCandidate,
): Promise<void> {
  // Plan gate: skip the work entirely for clients that don't get alerts.
  // Cheaper than computing the diff and discarding it later.
  if (!(await clientHasFeature(env, candidate.client_slug, "realTimeAlerts"))) {
    return;
  }

  // Find the most recent prior run for this (keyword, engine).
  // STRICTLY BEFORE new_run_id so we don't accidentally compare a row
  // to itself.
  const prior = await env.DB.prepare(
    `SELECT id, client_cited, prominence
       FROM citation_runs
       WHERE keyword_id = ? AND engine = ? AND id < ?
       ORDER BY id DESC
       LIMIT 1`
  ).bind(candidate.keyword_id, candidate.engine, candidate.new_run_id)
   .first<{ id: number; client_cited: number; prominence: number | null }>();

  // No prior run -- this is the baseline, no alert.
  if (!prior) return;

  let alertKind: "gained" | "lost" | null = null;
  if (prior.client_cited === 0 && candidate.new_client_cited === 1) {
    alertKind = "gained";
  } else if (prior.client_cited === 1 && candidate.new_client_cited === 0) {
    alertKind = "lost";
  }
  if (!alertKind) return;

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO citation_alerts
       (client_slug, keyword_id, engine, alert_kind, prev_run_id, new_run_id,
        prev_prominence, new_prominence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    candidate.client_slug,
    candidate.keyword_id,
    candidate.engine,
    alertKind,
    prior.id,
    candidate.new_run_id,
    prior.prominence,
    candidate.new_prominence,
    now,
  ).run();
}

/** Send one digest email per client_slug with pending alerts. Called
 *  from the cron after each citation run completes. Idempotent on
 *  notified_at -- if Resend errors we don't mark the alerts notified
 *  and the next tick retries. */
export async function sendPendingDigests(env: Env): Promise<{ digestsSent: number; alertsCleared: number }> {
  if (!env.RESEND_API_KEY) {
    console.log("[citation-alerts] RESEND_API_KEY not set, skipping digests");
    return { digestsSent: 0, alertsCleared: 0 };
  }

  // Find clients with pending alerts.
  const clients = (await env.DB.prepare(
    `SELECT client_slug, COUNT(*) AS n
       FROM citation_alerts
       WHERE notified_at IS NULL
       GROUP BY client_slug
       ORDER BY MIN(created_at) ASC`
  ).all<{ client_slug: string; n: number }>()).results;

  let digestsSent = 0;
  let alertsCleared = 0;

  for (const c of clients) {
    // Pull the alerts for this client + the keyword text via JOIN.
    const alerts = (await env.DB.prepare(
      `SELECT ca.id, ca.alert_kind, ca.engine, ca.prev_prominence, ca.new_prominence,
              ck.keyword
         FROM citation_alerts ca
         JOIN citation_keywords ck ON ck.id = ca.keyword_id
         WHERE ca.client_slug = ? AND ca.notified_at IS NULL
         ORDER BY ca.alert_kind ASC, ck.keyword ASC`
    ).bind(c.client_slug).all<{
      id: number;
      alert_kind: string;
      engine: string;
      prev_prominence: number | null;
      new_prominence: number | null;
      keyword: string;
    }>()).results;

    if (alerts.length === 0) continue;

    // Resolve a delivery email for this client. Prefer the user's email
    // (more likely to be read) over a generic notification list.
    const userRow = await env.DB.prepare(
      "SELECT email FROM users WHERE client_slug = ? AND role = 'client' AND email_alerts != 0 ORDER BY id ASC LIMIT 1"
    ).bind(c.client_slug).first<{ email: string }>();
    if (!userRow?.email) {
      console.log(`[citation-alerts] no deliverable email for ${c.client_slug}, skipping`);
      continue;
    }

    const subject = buildSubject(alerts);
    const html = buildDigestHtml(c.client_slug, alerts);

    let delivered = false;
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "NeverRanked <reports@neverranked.com>",
          to: [userRow.email],
          subject,
          html,
        }),
      });
      delivered = resp.ok;
      if (!resp.ok) {
        const txt = await resp.text();
        console.log(`[citation-alerts] Resend ${resp.status} for ${c.client_slug}: ${txt.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`[citation-alerts] send exception for ${c.client_slug}: ${e}`);
    }

    if (delivered) {
      const now = Math.floor(Date.now() / 1000);
      const ids = alerts.map((a) => a.id);
      // SQLite IN-list with a parameterized binding for each id.
      const placeholders = ids.map(() => "?").join(",");
      await env.DB.prepare(
        `UPDATE citation_alerts SET notified_at = ? WHERE id IN (${placeholders})`
      ).bind(now, ...ids).run();
      digestsSent++;
      alertsCleared += ids.length;
    }
  }

  console.log(`[citation-alerts] sent ${digestsSent} digests covering ${alertsCleared} alerts`);
  return { digestsSent, alertsCleared };
}

const ENGINE_LABEL: Record<string, string> = {
  perplexity: "Perplexity",
  openai: "ChatGPT",
  gemini: "Gemini",
  anthropic: "Claude",
  google_ai_overview: "Google AI Overviews",
};

function buildSubject(alerts: Array<{ alert_kind: string }>): string {
  const gained = alerts.filter((a) => a.alert_kind === "gained").length;
  const lost = alerts.filter((a) => a.alert_kind === "lost").length;
  if (gained > 0 && lost === 0) {
    return gained === 1
      ? `New AI citation: 1 prompt where you started getting cited`
      : `New AI citations: ${gained} prompts where you started getting cited`;
  }
  if (lost > 0 && gained === 0) {
    return lost === 1
      ? `Lost citation: 1 prompt where you stopped getting cited`
      : `Lost citations: ${lost} prompts where you stopped getting cited`;
  }
  return `${gained} new, ${lost} lost — citation changes this week`;
}

function buildDigestHtml(
  clientSlug: string,
  alerts: Array<{ alert_kind: string; engine: string; keyword: string; prev_prominence: number | null; new_prominence: number | null }>
): string {
  const gained = alerts.filter((a) => a.alert_kind === "gained");
  const lost = alerts.filter((a) => a.alert_kind === "lost");
  const dashUrl = `https://app.neverranked.com/citations/${encodeURIComponent(clientSlug)}`;

  const renderRow = (a: typeof alerts[0]) => {
    const engine = ENGINE_LABEL[a.engine] || a.engine;
    const positionNote = a.alert_kind === "gained" && a.new_prominence
      ? ` <span style="color:#888">(rank ${a.new_prominence})</span>`
      : a.alert_kind === "lost" && a.prev_prominence
      ? ` <span style="color:#888">(was rank ${a.prev_prominence})</span>`
      : "";
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1a1a1a;font-size:13px;color:#ccc">
          <strong style="color:#fff">"${escapeHtml(a.keyword)}"</strong><br>
          <span style="color:#888;font-size:12px">${engine}${positionNote}</span>
        </td>
      </tr>`;
  };

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,system-ui,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px">

    <div style="margin-bottom:32px">
      <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">NeverRanked</span>
    </div>

    <h1 style="font-size:22px;font-weight:600;color:#ffffff;margin:0 0 8px;line-height:1.3">
      Citation changes this week
    </h1>
    <p style="font-size:13px;color:#888;margin:0 0 32px">
      ${alerts.length} change${alerts.length === 1 ? "" : "s"} since the last citation scan.
    </p>

    ${gained.length > 0 ? `
    <div style="background:#0e1a0f;border:1px solid #1f3a22;border-radius:6px;padding:20px 24px;margin-bottom:20px">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#4ade80;margin-bottom:12px">
        Gained &mdash; ${gained.length} new citation${gained.length === 1 ? "" : "s"}
      </div>
      <table style="width:100%;border-collapse:collapse">${gained.map(renderRow).join("")}</table>
    </div>` : ""}

    ${lost.length > 0 ? `
    <div style="background:#1a0e0e;border:1px solid #3a1f1f;border-radius:6px;padding:20px 24px;margin-bottom:20px">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#ef4444;margin-bottom:12px">
        Lost &mdash; ${lost.length} dropped citation${lost.length === 1 ? "" : "s"}
      </div>
      <table style="width:100%;border-collapse:collapse">${lost.map(renderRow).join("")}</table>
    </div>` : ""}

    <div style="text-align:center;margin:32px 0 40px">
      <a href="${dashUrl}" style="display:inline-block;background:#c8a850;color:#0a0a0a;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:4px;letter-spacing:0.3px">
        See full citation history &rarr;
      </a>
    </div>

    <div style="border-top:1px solid #1a1a1a;padding-top:24px;font-size:11px;color:#444;line-height:1.6">
      <p style="margin:0 0 4px">You receive these alerts because you are on Signal or Amplify. Pulse customers see this data in their monthly NVI report instead.</p>
      <p style="margin:0">Reply to this email or reach us at hello@neverranked.com</p>
    </div>

  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
