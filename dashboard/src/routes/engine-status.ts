/**
 * Dashboard -- /engine-status
 *
 * Public-facing engine health page. No auth, no client data exposure.
 * Aggregates citation_runs across all clients and reports per-engine
 * uptime, row volume, and integrity (empty-row rate). Built to answer
 * one question for visitors and clients: "is the data behind the
 * NeverRanked numbers actually reliable right now?"
 *
 * Complements /admin/health (admin-only operational view) by giving
 * the public a transparent window into the same signals. When the
 * State of AEO weekly carries a data-integrity caveat, this page
 * is where curious readers go to verify the claim.
 *
 * Single-page server-render. No client JS. Loads fast. Refreshes
 * on reload. Cache-Control: public, max-age=300 (5 min) so a
 * thundering herd doesn't overrun D1.
 */

import type { Env } from "../types";
import { html, layout, esc } from "../render";

// Thresholds for the public status surface. Slightly more forgiving
// than the internal /admin/health thresholds because the public view
// rolls up across all clients (more rows = more tolerance for noise).
const ENGINE_EMPTY_YELLOW = 0.15;
const ENGINE_EMPTY_RED = 0.35;
const ENGINE_MIN_ROWS_GREEN = 20;
const ENGINE_MIN_ROWS_YELLOW = 5;

const ENGINES = [
  { id: "openai", label: "ChatGPT", host: "OpenAI" },
  { id: "perplexity", label: "Perplexity", host: "Perplexity" },
  { id: "anthropic", label: "Claude", host: "Anthropic" },
  { id: "gemini", label: "Gemini", host: "Google" },
  { id: "bing", label: "Microsoft Copilot", host: "Microsoft" },
  { id: "google_ai_overview", label: "Google AI Overviews", host: "Google" },
  { id: "gemma", label: "Gemma", host: "Together AI (open-weight)" },
] as const;

interface EngineHealth {
  id: string;
  label: string;
  host: string;
  rows_24h: number;
  empty_24h: number;
  rows_7d: number;
  empty_7d: number;
  last_run_unix: number | null;
  status: "green" | "yellow" | "red" | "unknown";
  status_note: string;
}

async function getEngineHealth(env: Env, engineId: string): Promise<{ rows: number; empty: number; lastRun: number | null }> {
  const since = Math.floor(Date.now() / 1000) - 86400;
  const stmt = await env.DB.prepare(
    `SELECT
       COUNT(*) AS rows,
       SUM(CASE WHEN cited_entities IS NULL OR cited_entities = '[]' THEN 1 ELSE 0 END) AS empty,
       MAX(run_at) AS last_run
     FROM citation_runs
     WHERE engine = ? AND run_at >= ?`,
  ).bind(engineId, since).first<{ rows: number; empty: number; last_run: number | null }>();
  return {
    rows: Number(stmt?.rows || 0),
    empty: Number(stmt?.empty || 0),
    lastRun: stmt?.last_run ? Number(stmt.last_run) : null,
  };
}

async function getEngine7d(env: Env, engineId: string): Promise<{ rows: number; empty: number }> {
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  const stmt = await env.DB.prepare(
    `SELECT
       COUNT(*) AS rows,
       SUM(CASE WHEN cited_entities IS NULL OR cited_entities = '[]' THEN 1 ELSE 0 END) AS empty
     FROM citation_runs
     WHERE engine = ? AND run_at >= ?`,
  ).bind(engineId, since).first<{ rows: number; empty: number }>();
  return {
    rows: Number(stmt?.rows || 0),
    empty: Number(stmt?.empty || 0),
  };
}

function classifyHealth(rows: number, empty: number): { status: EngineHealth["status"]; note: string } {
  if (rows === 0) return { status: "red", note: "No rows in the last 24h. Engine may be unreachable or disabled." };
  if (rows < ENGINE_MIN_ROWS_YELLOW) return { status: "red", note: `Only ${rows} rows in last 24h. Below floor of ${ENGINE_MIN_ROWS_YELLOW}.` };
  const emptyRate = empty / rows;
  if (emptyRate >= ENGINE_EMPTY_RED) return { status: "red", note: `${Math.round(emptyRate * 100)}% of rows returned empty. Above threshold of ${Math.round(ENGINE_EMPTY_RED * 100)}%.` };
  if (rows < ENGINE_MIN_ROWS_GREEN) return { status: "yellow", note: `${rows} rows is below the healthy minimum (${ENGINE_MIN_ROWS_GREEN}). Functional but watch for volume drop.` };
  if (emptyRate >= ENGINE_EMPTY_YELLOW) return { status: "yellow", note: `${Math.round(emptyRate * 100)}% empty-row rate. Functional but elevated.` };
  return { status: "green", note: "Healthy. Volume and integrity within nominal range." };
}

function timeAgo(unix: number | null): string {
  if (!unix) return "never";
  const seconds = Math.floor(Date.now() / 1000) - unix;
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const STATUS_COLOR: Record<EngineHealth["status"], string> = {
  green: "#7fc99a",
  yellow: "#e8c767",
  red: "#c5544a",
  unknown: "rgba(251,248,239,.45)",
};

const STATUS_LABEL: Record<EngineHealth["status"], string> = {
  green: "Healthy",
  yellow: "Watch",
  red: "Degraded",
  unknown: "Unknown",
};

export async function handleEngineStatus(env: Env): Promise<Response> {
  const engineHealths: EngineHealth[] = [];
  for (const e of ENGINES) {
    const h24 = await getEngineHealth(env, e.id);
    const h7d = await getEngine7d(env, e.id);
    const { status, note } = classifyHealth(h24.rows, h24.empty);
    engineHealths.push({
      id: e.id,
      label: e.label,
      host: e.host,
      rows_24h: h24.rows,
      empty_24h: h24.empty,
      rows_7d: h7d.rows,
      empty_7d: h7d.empty,
      last_run_unix: h24.lastRun,
      status,
      status_note: note,
    });
  }

  const summary = {
    green: engineHealths.filter(e => e.status === "green").length,
    yellow: engineHealths.filter(e => e.status === "yellow").length,
    red: engineHealths.filter(e => e.status === "red").length,
  };

  const overallStatus: EngineHealth["status"] =
    summary.red > 0 ? "red" :
    summary.yellow > 0 ? "yellow" : "green";

  const overallNote =
    overallStatus === "green" ? "All seven engines healthy. Citation data behind every report is current and complete."
    : overallStatus === "yellow" ? `${summary.yellow} engine${summary.yellow === 1 ? "" : "s"} in watch state. Citation data is being collected but at reduced volume or elevated empty-row rate.`
    : `${summary.red} engine${summary.red === 1 ? "" : "s"} degraded. Recent citation data may be partial. This page is updated every 5 minutes.`;

  const body = `
    <div style="max-width:920px;margin:60px auto;padding:0 24px;font-family:var(--mono);">
      <div style="margin-bottom:32px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:var(--text-faint);margin-bottom:8px">NeverRanked / engine status</div>
        <h1 style="font-family:var(--serif);font-size:42px;font-weight:400;margin:0 0 12px;line-height:1.1">Citation engine health</h1>
        <div style="font-size:14px;color:var(--text-soft);line-height:1.6;max-width:680px">
          Live status of the seven AI engines we run citation queries through every weekday. Numbers below come from the last 24 hours of production runs. Updated every 5 minutes.
        </div>
      </div>

      <div style="margin-bottom:36px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;border-left:3px solid ${STATUS_COLOR[overallStatus]}">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px">
          <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${STATUS_COLOR[overallStatus]};box-shadow:0 0 12px ${STATUS_COLOR[overallStatus]}"></span>
          <span style="font-family:var(--label);text-transform:uppercase;letter-spacing:0.2em;font-size:13px;color:${STATUS_COLOR[overallStatus]};font-weight:600">${STATUS_LABEL[overallStatus]}</span>
          <span style="font-size:12px;color:var(--text-faint);font-family:var(--mono)">${summary.green} healthy · ${summary.yellow} watch · ${summary.red} degraded</span>
        </div>
        <div style="font-size:13px;color:var(--text-soft);line-height:1.6">${esc(overallNote)}</div>
      </div>

      <div style="margin-bottom:48px">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              <th style="text-align:left;padding:12px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.18em;font-size:10px;color:var(--text-faint);font-weight:500">Engine</th>
              <th style="text-align:left;padding:12px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.18em;font-size:10px;color:var(--text-faint);font-weight:500">Status</th>
              <th style="text-align:right;padding:12px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.18em;font-size:10px;color:var(--text-faint);font-weight:500">Rows (24h)</th>
              <th style="text-align:right;padding:12px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.18em;font-size:10px;color:var(--text-faint);font-weight:500">Empty %</th>
              <th style="text-align:right;padding:12px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.18em;font-size:10px;color:var(--text-faint);font-weight:500">Rows (7d)</th>
              <th style="text-align:right;padding:12px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.18em;font-size:10px;color:var(--text-faint);font-weight:500">Last run</th>
            </tr>
          </thead>
          <tbody>
            ${engineHealths.map(e => {
              const emptyRate24 = e.rows_24h > 0 ? Math.round((e.empty_24h / e.rows_24h) * 100) : 0;
              return `
                <tr style="border-bottom:1px solid var(--line)">
                  <td style="padding:14px 8px">
                    <div style="font-weight:500;color:var(--text)">${esc(e.label)}</div>
                    <div style="font-size:11px;color:var(--text-faint);font-family:var(--mono);margin-top:2px">${esc(e.host)}</div>
                  </td>
                  <td style="padding:14px 8px">
                    <span style="display:inline-flex;align-items:center;gap:8px">
                      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${STATUS_COLOR[e.status]}"></span>
                      <span style="font-size:11.5px;color:var(--text-soft)">${STATUS_LABEL[e.status]}</span>
                    </span>
                    <div style="font-size:10.5px;color:var(--text-faint);font-family:var(--mono);margin-top:3px;max-width:180px;line-height:1.4">${esc(e.status_note)}</div>
                  </td>
                  <td style="text-align:right;padding:14px 8px;font-family:var(--mono);color:var(--text-soft)">${e.rows_24h}</td>
                  <td style="text-align:right;padding:14px 8px;font-family:var(--mono);color:${emptyRate24 >= 35 ? "var(--red)" : emptyRate24 >= 15 ? "var(--gold)" : "var(--text-soft)"}">${emptyRate24}%</td>
                  <td style="text-align:right;padding:14px 8px;font-family:var(--mono);color:var(--text-faint)">${e.rows_7d}</td>
                  <td style="text-align:right;padding:14px 8px;font-family:var(--mono);color:var(--text-faint)">${esc(timeAgo(e.last_run_unix))}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div style="padding:24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;margin-bottom:24px">
        <div class="label" style="color:var(--gold);margin-bottom:14px">§ Why we publish this</div>
        <div style="font-size:13px;color:var(--text-soft);line-height:1.7;max-width:760px">
          NeverRanked sells citation tracking as a service. If our engine layer is unreliable, our reports are unreliable. Most analytics platforms hide their data-source health behind a marketing wall, which makes it impossible for buyers to verify the numbers. We publish ours because the alternative is asking buyers to trust us on faith.
        </div>
        <div style="font-size:13px;color:var(--text-soft);line-height:1.7;max-width:760px;margin-top:14px">
          When the State of AEO weekly report carries a data-integrity caveat, this page is where you verify what we said. Source code for the engine integrations lives in the public NeverRanked GitHub repo at <a href="https://github.com/LanceRoylo/neverranked" style="color:var(--gold)">github.com/LanceRoylo/neverranked</a>. The Gemma integration uses an open-weight model so anyone can re-run our prompts and verify our citation numbers independently.
        </div>
      </div>

      <div style="font-size:11px;color:var(--text-faint);font-family:var(--mono);text-align:center;margin-top:48px">
        Updated ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC · refreshes every 5 minutes · <a href="/" style="color:var(--text-faint);text-decoration:underline">back to neverranked.com</a>
      </div>
    </div>
  `;

  const fullHtml = layout("Engine status — NeverRanked", body, null);
  // Wrap html() so we can override Cache-Control. html() returns a Response
  // we can clone with custom headers for CDN caching.
  const baseResp = html(fullHtml);
  const headers = new Headers(baseResp.headers);
  headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  return new Response(baseResp.body, { status: baseResp.status, headers });
}
