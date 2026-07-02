/**
 * Customer readout archive — /c/<slug>/readouts[/<YYYY-MM>]
 *
 * The permanent, browsable history of a customer's monthly reports. Each
 * delivered monthly_memos row is one report, frozen at delivery. A report
 * selector (dropdown) in the header lists every delivered report by number +
 * month; selecting one navigates to that report's own permanent URL, so every
 * report is bookmarkable and nothing is ever overwritten.
 *
 * Why this exists: before this, a customer could only ever see the single
 * latest readout (the pitch page overwrote on each refresh; delivered memos had
 * no customer-facing surface at all). Reports are meant to be immutable dated
 * artifacts — the same frozen-snapshot discipline as the teardowns.
 *
 * - Permalink is the month_key (stable forever). The report NUMBER is a derived
 *   display label (chronological position among delivered reports), so a bookmark
 *   keeps working even if an earlier month is backfilled later.
 * - Only DELIVERED reports are visible (delivered_at IS NOT NULL); drafts stay in
 *   /admin/memos.
 * - Auth is identical to the cockpit: admin, or the customer's own client_slug.
 */
import type { Env } from "../types";
import { getUser } from "../auth";
import { redirect, esc } from "../render";

interface ReportRow {
  month_key: string; // 'YYYY-MM'
  title: string | null;
  body_markdown: string;
  delivered_at: number;
}

function userCanView(user: { role?: string; client_slug?: string }, slug: string): boolean {
  if (user.role === "admin") return true;
  if (user.client_slug === slug) return true;
  return false;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 'YYYY-MM' -> 'Jul 2026' (parsed directly; no Date/timezone drift). */
function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${MONTHS[m - 1]} ${y}`;
}

/** Two-digit report number from a 1-based index. */
function reportNo(i: number): string {
  return String(i + 1).padStart(2, "0");
}

/**
 * Minimal, SAFE markdown -> HTML for report bodies. Escapes all HTML first,
 * then applies a fixed, closed set of transforms. Crucially, link hrefs are
 * scheme-validated (http/https/mailto only) — a report body can contain
 * competitor names lifted from AI-engine output (attacker-influenceable), so a
 * `javascript:`/`data:` href must never survive. No raw HTML passthrough.
 */
function renderReportMarkdown(md: string): string {
  const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const safeHref = (url: string): string | null => {
    const u = url.trim();
    if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u;
    if (u.startsWith("/")) return u; // internal relative link
    return null;
  };
  const inline = (s: string) =>
    escHtml(s)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
        const href = safeHref(url);
        return href
          ? `<a href="${href.replace(/"/g, "&quot;")}" rel="noopener noreferrer nofollow"${href.startsWith("/") ? "" : ' target="_blank"'}>${text}</a>`
          : text; // drop unsafe-scheme links, keep the text
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  const flushUl = () => { if (inUl) { out.push("</ul>"); inUl = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushUl(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.*)$/)))   { flushUl(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^##\s+(.*)$/)))  { flushUl(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^###\s+(.*)$/))) { flushUl(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^[*-]\s+(.*)$/))) {
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    flushUl();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushUl();
  return out.join("\n");
}

async function loadDeliveredReports(env: Env, slug: string): Promise<ReportRow[]> {
  return (await env.DB.prepare(
    `SELECT month_key, title, body_markdown, delivered_at
       FROM monthly_memos
      WHERE client_slug = ? AND delivered_at IS NOT NULL
      ORDER BY month_key ASC`,
  ).bind(slug).all<ReportRow>()).results;
}

function shell(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0b0b0c; color:#e8e8ea; font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 40px 24px 96px; }
  .top { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px; padding-bottom:20px; border-bottom:1px solid #26241f; margin-bottom:36px; }
  .top a.back { color:#8a857a; text-decoration:none; font-size:14px; }
  .top a.back:hover { color:#d4c596; }
  .sel label { display:block; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:#8a857a; margin-bottom:6px; }
  select { background:#151512; color:#e8e8ea; border:1px solid #38352d; border-radius:8px; padding:9px 12px; font-size:14px; min-width:220px; }
  select:hover { border-color:#d4c596; }
  .meta { font-size:13px; letter-spacing:.04em; text-transform:uppercase; color:#8a857a; margin-bottom:6px; }
  h1.report-title { font-weight:400; font-size:26px; margin:0 0 28px; letter-spacing:-.01em; }
  .body h2 { font-weight:500; font-size:20px; margin:34px 0 12px; color:#f2efe6; }
  .body h3 { font-weight:600; font-size:15px; letter-spacing:.02em; text-transform:uppercase; color:#b7b1a3; margin:26px 0 8px; }
  .body p { margin:0 0 14px; color:#dcd8d0; }
  .body ul { margin:0 0 16px; padding-left:22px; }
  .body li { margin:0 0 7px; color:#dcd8d0; }
  .body a { color:#d4c596; }
  .body code { background:#1a1916; padding:1px 5px; border-radius:4px; font-size:13px; }
  .empty { color:#8a857a; padding:48px 0; text-align:center; }
  .foot { margin-top:56px; padding-top:20px; border-top:1px solid #26241f; font-size:13px; color:#6f6a60; }
</style></head><body><div class="wrap">${inner}</div></body></html>`;
}

/** GET /c/<slug>/readouts — redirect to the latest report (or empty state). */
export async function handleReadoutsIndex(request: Request, env: Env, slug: string): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return redirect("/login?next=" + encodeURIComponent(`/c/${slug}/readouts`));
  if (!userCanView(user as any, slug)) return new Response("Forbidden", { status: 403 });

  const reports = await loadDeliveredReports(env, slug);
  if (reports.length === 0) {
    return new Response(shell("Reports", `
      <div class="top"><a class="back" href="/c/${esc(slug)}/">&larr; Back to dashboard</a></div>
      <div class="empty">Your reports will appear here.<br>The first one lands after your first monthly readout is delivered.</div>`),
      { status: 200, headers: { "content-type": "text/html;charset=utf-8" } });
  }
  const latest = reports[reports.length - 1];
  return redirect(`/c/${slug}/readouts/${latest.month_key}`);
}

/** GET /c/<slug>/readouts/<YYYY-MM> — one frozen report + the selector. */
export async function handleReadoutView(request: Request, env: Env, slug: string, monthKey: string): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return redirect("/login?next=" + encodeURIComponent(`/c/${slug}/readouts/${monthKey}`));
  if (!userCanView(user as any, slug)) return new Response("Forbidden", { status: 403 });

  const reports = await loadDeliveredReports(env, slug);
  const idx = reports.findIndex((r) => r.month_key === monthKey);
  if (idx === -1) {
    // Unknown or undelivered month: send them to the latest instead of a bare 404.
    return handleReadoutsIndex(request, env, slug);
  }
  const r = reports[idx];

  // Dropdown: newest first, current selected. Value = month_key (the permalink).
  const options = reports
    .map((rep, i) => ({ ...rep, no: reportNo(i) }))
    .reverse()
    .map((rep) =>
      `<option value="${esc(rep.month_key)}"${rep.month_key === monthKey ? " selected" : ""}>Report ${rep.no} &middot; ${esc(monthLabel(rep.month_key))}</option>`,
    ).join("");

  const selector = reports.length > 1
    ? `<div class="sel"><label for="rpt">Report</label>
         <select id="rpt" onchange="if(this.value)location.href='/c/${esc(slug)}/readouts/'+this.value">${options}</select></div>`
    : "";

  const delivered = new Date(r.delivered_at * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const title = r.title || `${monthLabel(monthKey)} readout`;

  const inner = `
    <div class="top">
      <a class="back" href="/c/${esc(slug)}/">&larr; Back to dashboard</a>
      ${selector}
    </div>
    <div class="meta">Report ${reportNo(idx)} &middot; ${esc(monthLabel(monthKey))} &middot; delivered ${esc(delivered)}</div>
    <h1 class="report-title">${esc(title)}</h1>
    <div class="body">${renderReportMarkdown(r.body_markdown)}</div>
    <div class="foot">This report is a frozen snapshot of what NeverRanked measured for ${esc(monthLabel(monthKey))}. Numbers do not change after delivery. Newer months appear as separate reports in the selector above.</div>`;

  return new Response(shell(`${title} · Report ${reportNo(idx)}`, inner), {
    status: 200,
    headers: { "content-type": "text/html;charset=utf-8" },
  });
}
