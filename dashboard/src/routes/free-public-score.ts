/**
 * GET /score/<domain>
 *
 * Public AEO score history page for free-tier users who opted
 * into public history via /free/settings. Renders nothing useful
 * if the domain has not opted in (404) or the current score is
 * below the publication floor (40), in which case it shows a
 * neutral "rebuilding" placeholder.
 *
 * The page is `noindex,nofollow` until at least 4 weeks of
 * history have accumulated so week-one snapshots do not get
 * crawled and indexed.
 *
 * Spec: content/strategy/free-monitoring-tier.md decision #4.
 */

import type { Env } from "../types";
import { html, esc } from "../render";

const SCORE_FLOOR = 40;
const INDEX_AFTER_WEEKS = 4;
const WEEK_SECONDS = 7 * 24 * 60 * 60;

interface FreeUserPublic {
  id: number;
  domain: string;
  created_at: number;
  public_history: number;
}

interface ScanRow {
  aeo_score: number;
  grade: string;
  scanned_at: number;
}

function sparkline(scans: ScanRow[]): string {
  if (scans.length < 2) return "";
  const max = 100;
  const w = 600;
  const h = 100;
  const points = scans
    .slice()
    .reverse()
    .map((s, i) => {
      const x = (i / (scans.length - 1)) * w;
      const y = h - (s.aeo_score / max) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;display:block">
      <polyline fill="none" stroke="#e8c767" stroke-width="2" points="${points}"/>
    </svg>
  `;
}

function publicLayout(title: string, body: string, robots: "index" | "noindex"): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${robots},${robots === "noindex" ? "nofollow" : "follow"}">
<title>${esc(title)} | NeverRanked</title>
<meta name="description" content="Public AEO score history measured weekly by NeverRanked across seven AI engines.">
<style>
:root{--bg:#fdfcf8;--ink:#1a1a1a;--mute:#666;--faint:#999;--gold:#bfa04d;--line:#e5e5e5}
*,*:before,*:after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;line-height:1.65;-webkit-font-smoothing:antialiased}
.wrap{max-width:680px;margin:0 auto;padding:64px 24px}
h1{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:400;font-size:36px;letter-spacing:-.02em;margin:0 0 8px}
.kicker{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin-bottom:8px}
.score{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-size:120px;line-height:1;text-align:center;margin:48px 0 8px}
.score-meta{text-align:center;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-bottom:48px}
.section{border-top:1px solid var(--line);padding:32px 0}
.section-label{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin-bottom:12px}
.engines{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--mute);margin:8px 0 0}
.engines span{padding:3px 10px;background:#f5f0e3;border-radius:3px}
footer{border-top:1px solid var(--line);margin-top:48px;padding-top:24px;font-size:11px;color:var(--faint);text-align:center}
footer a{color:var(--gold);text-decoration:underline}
a{color:var(--gold)}
@media (max-width:600px){.score{font-size:96px}}
</style>
</head>
<body>
<div class="wrap">${body}</div>
</body>
</html>`;
}

function rebuildingPage(domain: string): string {
  return publicLayout("Score rebuilding", `
    <div class="kicker">NeverRanked &middot; Public AEO score</div>
    <h1>${esc(domain)}</h1>
    <div style="text-align:center;margin:64px 0">
      <p style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:var(--mute);margin:0">Score hidden, currently rebuilding.</p>
      <p style="font-size:12px;color:var(--faint);margin:16px 0 0">Public scores reappear once the domain stabilizes above the publication floor.</p>
    </div>
    <footer>
      <p>Measurement methodology: <a href="https://neverranked.com/state-of-aeo/">neverranked.com/state-of-aeo</a></p>
    </footer>
  `, "noindex");
}

function notFoundPage(): Response {
  return html(publicLayout("Not found", `
    <div class="kicker">NeverRanked</div>
    <h1>No public score</h1>
    <p style="color:var(--mute)">This domain is not publishing a public AEO score. The owner can enable this from their /free dashboard, or you can <a href="https://app.neverranked.com/free/signup">claim a score for your own domain</a>.</p>
    <footer>
      <p><a href="https://neverranked.com">neverranked.com</a></p>
    </footer>
  `, "noindex"), 404);
}

export async function handleFreePublicScore(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  // URL pattern: /score/<domain>
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "score") return notFoundPage();
  const domain = parts[1].toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return notFoundPage();

  const user = await env.DB.prepare(
    "SELECT id, domain, created_at, public_history FROM free_users WHERE domain = ? AND public_history = 1"
  ).bind(domain).first<FreeUserPublic>();

  if (!user) return notFoundPage();

  const scans = (await env.DB.prepare(
    `SELECT sr.aeo_score, sr.grade, sr.scanned_at
     FROM scan_results sr
     JOIN domains d ON sr.domain_id = d.id
     WHERE d.free_user_id = ?
     ORDER BY sr.scanned_at DESC
     LIMIT 12`
  ).bind(user.id).all<ScanRow>()).results;

  if (scans.length === 0) return rebuildingPage(domain);

  const latest = scans[0];

  // Score floor: protect users from publishing a bad-week snapshot.
  if (latest.aeo_score < SCORE_FLOOR) {
    return html(rebuildingPage(domain));
  }

  // Indexability: noindex until 4 weeks of history have accumulated.
  const now = Math.floor(Date.now() / 1000);
  const ageWeeks = (now - user.created_at) / WEEK_SECONDS;
  const robots = scans.length >= INDEX_AFTER_WEEKS && ageWeeks >= INDEX_AFTER_WEEKS
    ? "index"
    : "noindex";

  const lastScanDate = new Date(latest.scanned_at * 1000).toISOString().slice(0, 10);
  const sparklineSvg = sparkline(scans);

  const body = `
    <div class="kicker">NeverRanked &middot; Public AEO score</div>
    <h1>${esc(domain)}</h1>
    <p style="font-size:13px;color:var(--mute);margin:0">Measured weekly across seven AI engines. Methodology is public, the measurement code is open, and the underlying open-weight engine in the set (Gemma) lets anyone reproduce these numbers.</p>

    <div class="score">${latest.aeo_score}</div>
    <div class="score-meta">Grade ${esc(latest.grade)} &middot; ${scans.length} ${scans.length === 1 ? "scan" : "weeks"} of history &middot; Last update ${esc(lastScanDate)}</div>

    ${sparklineSvg ? `<div style="margin:0 0 32px">${sparklineSvg}</div>` : ""}

    <div class="section">
      <div class="section-label">Engines measured</div>
      <div class="engines">
        <span>ChatGPT</span>
        <span>Perplexity</span>
        <span>Gemini</span>
        <span>Claude</span>
        <span>Microsoft Copilot</span>
        <span>Google AI Overviews</span>
        <span>Gemma (open-weight)</span>
      </div>
    </div>

    <div class="section">
      <div class="section-label">How this number is computed</div>
      <p style="margin:0 0 8px;color:var(--mute)">The AEO score (0-100) reflects how well a domain is structured for AI engines to cite. We measure schema markup, llms.txt presence, agent-readiness signals, and citation surface across the seven engines listed above.</p>
      <p style="margin:0;color:var(--mute)">Full methodology: <a href="https://neverranked.com/state-of-aeo/">neverranked.com/state-of-aeo</a></p>
    </div>

    <footer>
      <p>Published by <a href="https://neverranked.com">NeverRanked</a> on behalf of the domain owner. Public history toggle controlled by the owner from /free.</p>
    </footer>
  `;

  return html(publicLayout(`AEO score for ${domain}`, body, robots));
}
