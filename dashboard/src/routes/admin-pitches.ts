/**
 * Route: /admin/pitches
 *
 * Internal pitch tracker view. Source of truth is
 * pitch/_meta/log.md in the marketing repo (LanceRoylo/neverranked).
 * This route fetches the raw markdown from GitHub on each request,
 * caches it for 5 minutes via the Cloudflare Cache API, parses the
 * markdown table, and renders the rows as an HTML table styled to
 * match admin-inbox.
 *
 * Lance edits the .md file in his usual git workflow. The dashboard
 * view auto-refreshes within 5 minutes of every push (or immediately
 * if the cache is cold).
 *
 * Admin-only at the route registration layer in index.ts.
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";

const SOURCE_URL =
  "https://raw.githubusercontent.com/LanceRoylo/neverranked/main/pitch/_meta/log.md";
const CACHE_KEY = "https://pitches-tracker.cache/log.md";
const CACHE_TTL_SECONDS = 300;

interface PitchRow {
  created: string;
  prospect: string;
  slug: string;
  sent: string;
  replied: string;
  read: string;
  notes: string;
}

function readBadge(read: string): string {
  const r = read.toLowerCase().trim();
  // Not-yet states: dash, em-dash, blank, question mark.
  if (!r || r === "—" || r === "-" || r === "?") {
    return `<span style="font-family:var(--mono);font-size:13px;color:var(--text-faint)">—</span>`;
  }
  // Affirmative states: anything mentioning "read" gets the green pill.
  if (r.includes("read") || r.includes("opened") || r === "yes") {
    return `<span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--green);border:1px solid var(--green);padding:2px 6px;border-radius:2px;white-space:nowrap">${esc(read)}</span>`;
  }
  // Anything else (custom note, partial state) gets a neutral muted pill.
  return `<span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-mute);border:1px solid var(--text-mute);padding:2px 6px;border-radius:2px;white-space:nowrap">${esc(read)}</span>`;
}

function fmtDate(s: string): string {
  if (!s || s === "—" || s === "-" || s === "?") return '<span style="color:var(--text-faint)">—</span>';
  return esc(s);
}

/**
 * Parse a GitHub-flavored markdown table into rows.
 * Expects the first table after a "## Active" heading.
 */
function parsePitchTable(markdown: string): PitchRow[] {
  const lines = markdown.split("\n");
  let inActive = false;
  let inTable = false;
  let headerSeen = false;
  const rows: PitchRow[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      inActive = line.toLowerCase().includes("active");
      inTable = false;
      headerSeen = false;
      continue;
    }
    if (!inActive) continue;
    if (!line.startsWith("|")) {
      if (inTable) break; // end of table block
      continue;
    }
    inTable = true;

    // First | row = header. Second | row = ---|---|--- separator.
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    if (/^\|[\s\-|:]+\|$/.test(line)) continue;

    // Data row.
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

    if (cells.length < 7) continue;
    rows.push({
      created: cells[0],
      prospect: cells[1],
      slug: cells[2].replace(/^`|`$/g, ""),
      sent: cells[3],
      replied: cells[4],
      read: cells[5],
      notes: cells[6],
    });
  }
  return rows;
}

async function fetchMarkdown(): Promise<string> {
  const cache = (caches as { default: Cache }).default;
  const cached = await cache.match(CACHE_KEY);
  if (cached) {
    return await cached.text();
  }
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "neverranked-dashboard/admin-pitches" },
  });
  if (!res.ok) {
    throw new Error(`pitch log fetch failed: ${res.status}`);
  }
  const text = await res.text();
  // Cache the response so subsequent requests within the TTL window are fast.
  const cacheRes = new Response(text, {
    headers: { "Cache-Control": `max-age=${CACHE_TTL_SECONDS}` },
  });
  await cache.put(CACHE_KEY, cacheRes);
  return text;
}

export async function handlePitches(user: User, _env: Env): Promise<Response> {
  let rows: PitchRow[] = [];
  let fetchError = "";
  try {
    const md = await fetchMarkdown();
    rows = parsePitchTable(md);
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "fetch failed";
  }

  const tableRows = rows
    .map(
      (r) => `
        <tr style="border-bottom:1px solid var(--line)">
          <td style="padding:14px 12px 14px 0;font-family:var(--mono);font-size:12px;color:var(--text-mute);white-space:nowrap">${fmtDate(r.created)}</td>
          <td style="padding:14px 12px;font-family:var(--serif);font-size:15px;color:var(--text)">${esc(r.prospect)}</td>
          <td style="padding:14px 12px;font-family:var(--mono);font-size:11px;color:var(--text-mute)">
            <a href="https://neverranked.com/pitch/${esc(r.slug)}/" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:underline;text-underline-offset:3px">/${esc(r.slug)}/</a>
          </td>
          <td style="padding:14px 12px;font-family:var(--mono);font-size:12px;color:var(--text-mute);white-space:nowrap">${fmtDate(r.sent)}</td>
          <td style="padding:14px 12px;font-family:var(--mono);font-size:12px;color:var(--text-mute);white-space:nowrap">${fmtDate(r.replied)}</td>
          <td style="padding:14px 12px">${readBadge(r.read)}</td>
          <td style="padding:14px 12px 14px 0;font-family:var(--mono);font-size:11px;color:var(--text-faint);line-height:1.5;max-width:32ch">${esc(r.notes)}</td>
        </tr>
      `,
    )
    .join("");

  const headerCell = (label: string) =>
    `<th style="padding:10px 12px;text-align:left;font-family:var(--label);text-transform:uppercase;letter-spacing:.14em;font-size:10px;color:var(--text-mute);font-weight:500;border-bottom:1px solid var(--line-strong)">${esc(label)}</th>`;

  const body = `
    <div style="max-width:1400px;margin:0 auto;padding:32px 24px">
      <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:24px">
        <h1 style="font-family:var(--serif);font-size:32px;font-weight:400;letter-spacing:-.02em;margin:0">Pitches</h1>
        <span style="font-family:var(--label);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--text-faint)">${rows.length} active</span>
      </div>
      <p style="font-family:var(--mono);font-size:12px;color:var(--text-faint);max-width:62ch;line-height:1.7;margin:0 0 32px">
        Source: <code style="font-size:11px">pitch/_meta/log.md</code> in the marketing repo. Cached five minutes. Edit the file in git, the view refreshes on next request after the cache expires.
      </p>

      ${fetchError ? `<div style="padding:18px;border:1px solid var(--red);border-radius:4px;color:var(--red);font-family:var(--mono);font-size:13px;margin-bottom:24px">Could not fetch pitch log: ${esc(fetchError)}</div>` : ""}

      ${rows.length === 0 && !fetchError ? `<div style="padding:24px;border:1px solid var(--line);border-radius:4px;color:var(--text-faint);font-family:var(--mono);font-size:13px">No active pitches in the log. Add a row to the Active table in pitch/_meta/log.md.</div>` : ""}

      ${rows.length > 0 ? `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              ${headerCell("Created")}
              ${headerCell("Prospect")}
              ${headerCell("URL")}
              ${headerCell("Sent")}
              ${headerCell("Replied")}
              ${headerCell("Read")}
              ${headerCell("Notes")}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      <div style="margin-top:32px;padding:16px;border:1px solid var(--line);border-radius:4px;background:rgba(255,255,255,0.02)">
        <div style="font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--text-mute);margin-bottom:8px">Quick edit</div>
        <div style="font-family:var(--mono);font-size:12px;color:var(--text-mute);line-height:1.7">
          Open <a href="https://github.com/LanceRoylo/neverranked/edit/main/pitch/_meta/log.md" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:underline">the file on GitHub</a> for in-browser editing, or edit locally and push. Cache clears on next request after five minutes.
        </div>
      </div>
      ` : ""}
    </div>
  `;

  return html(layout("Pitches · Admin", body, user));
}
