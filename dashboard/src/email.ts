/**
 * Dashboard -- Email sending via Resend
 *
 * Magic link auth emails + weekly AEO digest emails.
 */

import type { Env, ScanResult, GscSnapshot } from "./types";
import { generateNarrative } from "./narrative";
import type { CitationDigestData } from "./citations";

export interface DigestData {
  domain: string;
  domainId: number;
  clientSlug: string;
  latest: ScanResult;
  previous: ScanResult | null;
}

export interface GscDigestData {
  clientSlug: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prevClicks: number | null;
  prevImpressions: number | null;
  topQuery: string | null;
  dateRange: string;
}

export async function sendMagicLinkEmail(
  email: string,
  token: string,
  env: Env
): Promise<boolean> {
  const loginUrl = `https://app.neverranked.com/auth/verify?token=${token}`;

  // If no Resend key, log to console (dev mode)
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Magic link for ${email}: ${loginUrl}`);
    return true;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Never Ranked <login@neverranked.com>",
        to: [email],
        subject: "Sign in to Never Ranked",
        text: `Click to sign in:\n\n${loginUrl}\n\nThis link expires in 15 minutes.\n\n— Never Ranked`,
        html: `
          <div style="font-family:monospace;font-size:14px;color:#333;max-width:480px;margin:0 auto;padding:40px 20px">
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#1a1a1a">Never Ranked</p>
            <p style="margin:0 0 24px">Click the button below to sign in to your dashboard.</p>
            <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:#e8c767;font-family:monospace;font-size:13px;text-decoration:none;letter-spacing:.05em">Sign in</a>
            <p style="margin:24px 0 0;font-size:12px;color:#888">This link expires in 15 minutes. If you did not request this, ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.log(`Magic link to ${email} failed: ${resp.status} ${errBody}`);
      return false;
    }

    console.log(`Magic link sent to ${email}`);
    return true;
  } catch (err) {
    console.error(`Magic link to ${email} error:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Weekly AEO digest
// ---------------------------------------------------------------------------

export interface RoadmapDigestData {
  clientSlug: string;
  total: number;
  done: number;
  inProgress: number;
  recentlyCompleted: string[];  // titles of items completed this week
}

/** Send a digest email to one recipient */
export async function sendDigestEmail(
  to: string,
  userName: string | null,
  digests: DigestData[],
  env: Env,
  citationData?: Map<string, CitationDigestData>,
  gscData?: Map<string, GscDigestData>,
  roadmapData?: Map<string, RoadmapDigestData>,
  unsubToken?: string
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Digest for ${to}: ${digests.map(d => `${d.domain} ${d.latest.aeo_score}`).join(", ")}`);
    return true;
  }

  if (digests.length === 0) return false;

  const subject = digests.length === 1
    ? buildSubjectSingle(digests[0])
    : `Weekly AEO Report -- ${digests.length} domains scanned`;

  const emailHtml = buildDigestHtml(userName, digests, citationData, gscData, roadmapData, unsubToken);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NeverRanked <reports@neverranked.com>",
        to: [to],
        subject,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`Digest to ${to} failed: ${res.status} ${err}`);
      return false;
    }

    console.log(`Digest sent to ${to}`);
    return true;
  } catch (e) {
    console.log(`Digest to ${to} error: ${e}`);
    return false;
  }
}

function buildSubjectSingle(d: DigestData): string {
  const diff = d.previous && !d.previous.error
    ? d.latest.aeo_score - d.previous.aeo_score
    : null;

  if (diff !== null && diff > 0) {
    return `${d.domain}: AEO score up ${diff} pts (${d.latest.aeo_score}/100)`;
  } else if (diff !== null && diff < 0) {
    return `${d.domain}: AEO score dropped ${Math.abs(diff)} pts (${d.latest.aeo_score}/100)`;
  }
  return `${d.domain}: AEO score ${d.latest.aeo_score}/100`;
}

// ---------------------------------------------------------------------------
// Score regression alerts
// ---------------------------------------------------------------------------

const REGRESSION_THRESHOLD = 5; // pts drop to trigger alert

export { REGRESSION_THRESHOLD };

/** Send a regression alert for a single domain */
export async function sendRegressionAlert(
  to: string,
  userName: string | null,
  domain: string,
  domainId: number,
  newScore: number,
  oldScore: number,
  newGrade: string,
  latest: ScanResult,
  env: Env
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Regression alert for ${to}: ${domain} ${oldScore} -> ${newScore}`);
    return true;
  }

  const drop = oldScore - newScore;
  const subject = `Alert: ${domain} AEO score dropped ${drop} pts (${newScore}/100)`;
  const emailHtml = buildRegressionHtml(userName, domain, domainId, newScore, oldScore, newGrade, latest);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NeverRanked <alerts@neverranked.com>",
        to: [to],
        subject,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`Regression alert to ${to} failed: ${res.status} ${err}`);
      return false;
    }

    console.log(`Regression alert sent to ${to}: ${domain} dropped ${drop} pts`);
    return true;
  } catch (e) {
    console.log(`Regression alert to ${to} error: ${e}`);
    return false;
  }
}

function buildRegressionHtml(
  userName: string | null,
  domain: string,
  domainId: number,
  newScore: number,
  oldScore: number,
  newGrade: string,
  latest: ScanResult
): string {
  const greeting = userName ? userName.split(" ")[0] : "there";
  const drop = oldScore - newScore;
  const narrative = generateNarrative(domain, latest, null);
  const topAction = narrative.actions[0] || null;
  const redFlags: string[] = JSON.parse(latest.red_flags);
  const newRedFlags = redFlags.slice(0, 3);

  const gradeColor = newGrade === "A" ? "#27ae60"
    : newGrade === "B" ? "#e8c767"
    : newGrade === "C" ? "#e67e22"
    : "#c0392b";

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Score Drop Alert</title>
</head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#e8c767">Never Ranked</td>
                <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#c0392b">Score Alert</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:32px 0 8px">
            <div style="font-family:Georgia,serif;font-size:16px;color:#fbf8ef;margin-bottom:12px">Hey ${escEmail(greeting)},</div>
            <div style="font-family:Georgia,serif;font-size:14px;color:#b0b0a8;line-height:1.6">We detected a score drop on <strong style="color:#fbf8ef">${escEmail(domain)}</strong>. Here's what we found.</div>
          </td>
        </tr>

        <!-- Score change -->
        <tr>
          <td style="padding:24px 0">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:24px;background:#1c1c1c;border:1px solid #c0392b;border-radius:4px">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="60" style="vertical-align:middle">
                        <div style="width:52px;height:52px;border-radius:50%;border:2px solid ${gradeColor};text-align:center;line-height:52px;font-family:Georgia,serif;font-size:28px;font-style:italic;color:${gradeColor}">${newGrade}</div>
                      </td>
                      <td style="vertical-align:middle;padding-left:16px">
                        <div style="font-family:'Courier New',monospace;font-size:28px;color:#fbf8ef;letter-spacing:-1px">${newScore}<span style="font-size:14px;color:#888888">/100</span></div>
                        <div style="font-size:13px;color:#c0392b;margin-top:2px">-${drop} pts from ${oldScore}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${newRedFlags.length > 0 ? `
        <!-- Key issues -->
        <tr>
          <td style="padding-bottom:24px">
            <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:12px">Issues detected</div>
            ${newRedFlags.map(f => `
              <div style="padding:10px 16px;margin-bottom:6px;background:#1c1c1c;border-left:3px solid #c0392b;font-family:Georgia,serif;font-size:13px;color:#b0b0a8">${escEmail(f)}</div>
            `).join("")}
          </td>
        </tr>
        ` : ""}

        ${topAction ? `
        <!-- What we recommend -->
        <tr>
          <td style="padding-bottom:24px">
            <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:12px">Recommended action</div>
            <div style="padding:16px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
              <div style="font-family:Georgia,serif;font-size:14px;color:#fbf8ef;margin-bottom:6px">${escEmail(topAction.action)}</div>
              <div style="font-family:Georgia,serif;font-size:12px;color:#888888;line-height:1.6">${escEmail(topAction.reason)}</div>
            </div>
          </td>
        </tr>
        ` : ""}

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:8px 0 32px">
            <a href="https://app.neverranked.com/domain/${domainId}" style="display:inline-block;padding:14px 32px;background:#e8c767;color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">View full report</a>
          </td>
        </tr>

        <!-- Reassurance -->
        <tr>
          <td style="padding:0 0 32px">
            <div style="font-family:Georgia,serif;font-size:13px;color:#888888;line-height:1.7;text-align:center">
              Score fluctuations happen as AI models retrain and sites change.<br>
              Your NeverRanked team is monitoring this.
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0;border-top:1px solid #2a2a2a">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:'Courier New',monospace;font-size:10px;color:#555555;line-height:1.6">
                  Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a><br>
                  You received this because your AEO score changed significantly.
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
  `.trim();
}

/** HTML-escape for email content */
function escEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCitationBlock(cd: CitationDigestData): string {
  const sharePct = (cd.citationShare * 100).toFixed(0);
  const prevPct = cd.previousShare !== null ? (cd.previousShare * 100).toFixed(0) : null;

  let deltaHtml = "";
  if (prevPct !== null) {
    const diff = Number(sharePct) - Number(prevPct);
    if (diff > 0) {
      deltaHtml = `<span style="color:#27ae60;font-size:13px;margin-left:8px">+${diff} pts</span>`;
    } else if (diff < 0) {
      deltaHtml = `<span style="color:#c0392b;font-size:13px;margin-left:8px">${diff} pts</span>`;
    } else {
      deltaHtml = `<span style="color:#888888;font-size:13px;margin-left:8px">no change</span>`;
    }
  }

  const competitorRows = cd.topCompetitors.slice(0, 3).map(c =>
    `<div style="padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:13px;color:#b0b0a8;display:flex;justify-content:space-between">
      <span>${escEmail(c.name)}</span>
      <span style="color:#888888">${c.count} mentions</span>
    </div>`
  ).join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
      <tr>
        <td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#e8c767;margin-bottom:16px">AI Citation Share</div>

          <div style="font-family:'Courier New',monospace;font-size:36px;color:#fbf8ef;letter-spacing:-1px">
            ${sharePct}<span style="font-size:16px;color:#888888">%</span>${deltaHtml}
          </div>
          <div style="font-family:Georgia,serif;font-size:13px;color:#888888;margin-top:4px;margin-bottom:16px">
            Cited in ${cd.keywordsWon} of ${cd.totalKeywords} tracked queries
          </div>

          ${cd.topCompetitors.length > 0 ? `
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:8px;margin-top:16px;padding-top:16px;border-top:1px solid #2a2a2a">Top competitors</div>
          ${competitorRows}
          ` : ""}
        </td>
      </tr>
    </table>
  `;
}

function buildGscBlock(gsc: GscDigestData): string {
  let clicksDelta = "";
  if (gsc.prevClicks !== null) {
    const diff = gsc.clicks - gsc.prevClicks;
    if (diff > 0) clicksDelta = '<span style="color:#27ae60;font-size:13px;margin-left:8px">+' + diff + '</span>';
    else if (diff < 0) clicksDelta = '<span style="color:#c0392b;font-size:13px;margin-left:8px">' + diff + '</span>';
  }

  let impDelta = "";
  if (gsc.prevImpressions !== null) {
    const diff = gsc.impressions - gsc.prevImpressions;
    if (diff > 0) impDelta = '<span style="color:#27ae60;font-size:13px;margin-left:8px">+' + diff.toLocaleString() + '</span>';
    else if (diff < 0) impDelta = '<span style="color:#c0392b;font-size:13px;margin-left:8px">' + diff.toLocaleString() + '</span>';
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
      <tr>
        <td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#e8c767;margin-bottom:16px">Google Search Performance</div>
          <div style="font-family:Georgia,serif;font-size:12px;color:#555555;margin-bottom:16px">${escEmail(gsc.dateRange)}</div>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="50%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Clicks</div>
                <div style="font-family:'Courier New',monospace;font-size:28px;color:#fbf8ef">${gsc.clicks.toLocaleString()}${clicksDelta}</div>
              </td>
              <td width="50%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Impressions</div>
                <div style="font-family:'Courier New',monospace;font-size:28px;color:#fbf8ef">${gsc.impressions.toLocaleString()}${impDelta}</div>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px">
            <tr>
              <td width="50%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">CTR</div>
                <div style="font-family:'Courier New',monospace;font-size:18px;color:#fbf8ef">${(gsc.ctr * 100).toFixed(1)}%</div>
              </td>
              <td width="50%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Avg Position</div>
                <div style="font-family:'Courier New',monospace;font-size:18px;color:#fbf8ef">${gsc.position.toFixed(1)}</div>
              </td>
            </tr>
          </table>

          ${gsc.topQuery ? `
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid #2a2a2a">
            <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Top query</div>
            <div style="font-family:Georgia,serif;font-size:14px;color:#b0b0a8;font-style:italic">${escEmail(gsc.topQuery)}</div>
          </div>
          ` : ""}
        </td>
      </tr>
    </table>
  `;
}

function buildRoadmapBlock(rd: RoadmapDigestData): string {
  const pct = rd.total > 0 ? Math.round((rd.done / rd.total) * 100) : 0;
  const recentList = rd.recentlyCompleted.slice(0, 3).map(t =>
    `<div style="padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:13px;color:#b0b0a8">${escEmail(t)}</div>`
  ).join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
      <tr>
        <td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#e8c767;margin-bottom:16px">Roadmap Progress</div>

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px">
            <tr>
              <td width="33%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Complete</div>
                <div style="font-family:'Courier New',monospace;font-size:24px;color:#27ae60">${rd.done}<span style="font-size:12px;color:#888888">/${rd.total}</span></div>
              </td>
              <td width="33%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">In Progress</div>
                <div style="font-family:'Courier New',monospace;font-size:24px;color:#e8c767">${rd.inProgress}</div>
              </td>
              <td width="34%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Progress</div>
                <div style="font-family:'Courier New',monospace;font-size:24px;color:#fbf8ef">${pct}<span style="font-size:12px;color:#888888">%</span></div>
              </td>
            </tr>
          </table>

          <!-- Progress bar -->
          <div style="height:6px;background:#2a2a2a;border-radius:3px;overflow:hidden;margin-bottom:${recentList ? '16' : '0'}px">
            <div style="height:100%;width:${pct}%;background:#27ae60;border-radius:3px"></div>
          </div>

          ${rd.recentlyCompleted.length > 0 ? `
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:8px;margin-top:16px;padding-top:16px;border-top:1px solid #2a2a2a">Completed this week</div>
          ${recentList}
          ` : ""}
        </td>
      </tr>
    </table>
  `;
}

function buildDigestHtml(userName: string | null, digests: DigestData[], citationData?: Map<string, CitationDigestData>, gscData?: Map<string, GscDigestData>, roadmapData?: Map<string, RoadmapDigestData>, unsubToken?: string): string {
  const greeting = userName ? userName.split(" ")[0] : "there";
  const scanDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const domainBlocks = digests.map(d => {
    const narrative = generateNarrative(d.domain, d.latest, d.previous);
    const diff = d.previous && !d.previous.error
      ? d.latest.aeo_score - d.previous.aeo_score
      : null;

    const gradeColor = d.latest.grade === "A" ? "#27ae60"
      : d.latest.grade === "B" ? "#e8c767"
      : d.latest.grade === "C" ? "#e67e22"
      : "#c0392b";

    let deltaText = "";
    let deltaColor = "#888888";
    if (diff !== null) {
      if (diff > 0) { deltaText = `+${diff} pts`; deltaColor = "#27ae60"; }
      else if (diff < 0) { deltaText = `${diff} pts`; deltaColor = "#c0392b"; }
      else { deltaText = "no change"; deltaColor = "#888888"; }
    }

    const topAction = narrative.actions[0] || null;

    return `
      <!-- Domain block -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
        <tr>
          <td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
            <!-- Domain name -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Georgia,serif;font-size:20px;font-style:italic;color:#fbf8ef;padding-bottom:16px">${escEmail(d.domain)}</td>
              </tr>
            </table>

            <!-- Score row -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px">
              <tr>
                <td width="60" style="vertical-align:middle">
                  <div style="width:52px;height:52px;border-radius:50%;border:2px solid ${gradeColor};text-align:center;line-height:52px;font-family:Georgia,serif;font-size:28px;font-style:italic;color:${gradeColor}">${d.latest.grade}</div>
                </td>
                <td style="vertical-align:middle;padding-left:16px">
                  <div style="font-family:'Courier New',monospace;font-size:28px;color:#fbf8ef;letter-spacing:-1px">${d.latest.aeo_score}<span style="font-size:14px;color:#888888">/100</span></div>
                  ${deltaText ? `<div style="font-size:13px;color:${deltaColor};margin-top:2px">${deltaText}</div>` : ""}
                </td>
              </tr>
            </table>

            <!-- Summary -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:${topAction ? '16' : '0'}px">
              <tr>
                <td style="font-family:Georgia,serif;font-size:14px;line-height:1.7;color:#b0b0a8;padding:16px;background:#171717;border-radius:4px">
                  ${escEmail(narrative.summary)}
                </td>
              </tr>
            </table>

            ${topAction ? `
            <!-- Top action -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:12px 16px;border-left:3px solid ${topAction.impact === 'high' ? '#c0392b' : topAction.impact === 'medium' ? '#e8c767' : '#888888'};font-size:13px;color:#b0b0a8;font-family:Georgia,serif">
                  <span style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888">Next step: </span><br>
                  <span style="color:#fbf8ef">${escEmail(topAction.action)}</span>
                </td>
              </tr>
            </table>
            ` : ""}
          </td>
        </tr>
      </table>
    `;
  }).join("");

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Weekly AEO Digest</title>
</head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">

<!-- Wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
  <tr>
    <td align="center" style="padding:32px 16px">

      <!-- Container -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#e8c767">Never Ranked</td>
                <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888888">Weekly Digest</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:32px 0 24px">
            <div style="font-family:Georgia,serif;font-size:16px;color:#fbf8ef;margin-bottom:8px">Hey ${escEmail(greeting)},</div>
            <div style="font-family:Georgia,serif;font-size:14px;color:#888888;line-height:1.6">Here's your weekly AEO scan from ${scanDate}.</div>
          </td>
        </tr>

        <!-- Domain blocks -->
        <tr>
          <td>
            ${domainBlocks}
          </td>
        </tr>

        <!-- Citation share blocks -->
        ${(() => {
          if (!citationData || citationData.size === 0) return "";
          const blocks: string[] = [];
          const slugsSeen = new Set<string>();
          for (const d of digests) {
            if (slugsSeen.has(d.clientSlug)) continue;
            slugsSeen.add(d.clientSlug);
            const cd = citationData.get(d.clientSlug);
            if (cd) blocks.push(buildCitationBlock(cd));
          }
          return blocks.length > 0 ? `<tr><td>${blocks.join("")}</td></tr>` : "";
        })()}

        <!-- Google Search Console blocks -->
        ${(() => {
          if (!gscData || gscData.size === 0) return "";
          const blocks: string[] = [];
          const slugsSeen = new Set<string>();
          for (const d of digests) {
            if (slugsSeen.has(d.clientSlug)) continue;
            slugsSeen.add(d.clientSlug);
            const gd = gscData.get(d.clientSlug);
            if (gd) blocks.push(buildGscBlock(gd));
          }
          return blocks.length > 0 ? `<tr><td>${blocks.join("")}</td></tr>` : "";
        })()}

        <!-- Roadmap progress blocks -->
        ${(() => {
          if (!roadmapData || roadmapData.size === 0) return "";
          const blocks: string[] = [];
          const slugsSeen = new Set<string>();
          for (const d of digests) {
            if (slugsSeen.has(d.clientSlug)) continue;
            slugsSeen.add(d.clientSlug);
            const rd = roadmapData.get(d.clientSlug);
            if (rd && rd.total > 0) blocks.push(buildRoadmapBlock(rd));
          }
          return blocks.length > 0 ? `<tr><td>${blocks.join("")}</td></tr>` : "";
        })()}

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:16px 0 32px">
            <a href="https://app.neverranked.com" style="display:inline-block;padding:14px 32px;background:#e8c767;color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">View dashboard</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0;border-top:1px solid #2a2a2a">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:'Courier New',monospace;font-size:10px;color:#555555;line-height:1.6">
                  Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a><br>
                  Scans run weekly. Scores reflect AI search engine readiness.${unsubToken ? `<br><a href="https://app.neverranked.com/digest/unsubscribe?token=${unsubToken}" style="color:#555555;text-decoration:underline">Unsubscribe from weekly digests</a>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
  `.trim();
}
