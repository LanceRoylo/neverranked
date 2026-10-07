/**
 * The day-3 and day-7 drip emails.
 *
 * THE DRIP IS OFF. scheduled() in index.ts returns unless DRIP_ENABLED is "1"
 * (decision 2, 2026-10-07), and /api/admin/drip-force refuses on the same
 * flag. It sent with no approval, outside the outreach engine's gate.
 * Follow-ups now belong to the supervised outreach lane. Retire this file
 * entirely once that lane is live.
 *
 * Until then the templates are kept SAFE to send in case the flag is ever
 * flipped:
 *   - Gone: the score-78 threshold presented as the point where AI engines
 *     start to cite a site (78 is the 75th percentile of scanned sites, never
 *     a measured threshold), the line that engines were already endorsing
 *     cleaner competitors (an engine-endorsement verb and a causal claim),
 *     the "every week without action" urgency, the unverified "in those
 *     seven days" bullets and the Monitor pitch (Monitor is out of every
 *     customer line until delivery is confirmed).
 *   - Every drip email REQUIRES a working unsubscribe link and the postal
 *     address. The builders take both as mandatory arguments, and the sender
 *     in index.ts refuses to send when POSTAL_ADDRESS is unset, so flipping
 *     the flag can never send a CAN-SPAM-incomplete email. The address is a
 *     Worker secret, not a constant here, because this repo is public.
 */

import { escHtml } from "./report-email";

/** What the footer of every drip email must carry. Both are required. */
export interface DripCompliance {
  unsubscribeUrl: string;
  postalAddress: string;
}

export interface DripScan {
  domain: string;
  score: number;
  grade: string;
}

export const DRIP_COPY = {
  day3Heading: "A second look at your result",
  day3Confession: "This check reads your site. It does not ask an AI tool about you.",
  day3Ask: "To see what an AI tool says, ask it the question your customer would ask. Not your business name. Their question. Then look at two things. Is your name in the answer? And whose websites do the links underneath point to?",
  day7Heading: "A week later",
  day7Body: "AI answers change from one asking to the next. Running the check again shows whether your site changed. It does not show whether the answers did.",
  day7Rescan: "Run the check again",
  reply: "Questions about your result? Reply to this email.",
  unsubscribe: "Unsubscribe",
  stop: "or reply STOP and we will take you off the list.",
} as const;

function score(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}

function shell(label: string, inner: string, footer: string, c: DripCompliance): string {
  if (!c || !c.unsubscribeUrl || !c.postalAddress || !c.postalAddress.trim()) {
    // Refuse rather than render an email without its unsubscribe link or
    // postal address.
    throw new Error("drip email needs an unsubscribe link and a postal address");
  }
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(label)}</title></head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
<tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
  <tr><td style="padding-bottom:28px;border-bottom:1px solid #2a2a2a">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#e8c767">Never Ranked</td>
      <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888888">${escHtml(label)}</td>
    </tr></table>
  </td></tr>
${inner}
  <tr><td style="padding:24px 0;border-top:1px solid #2a2a2a">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#666666;line-height:1.6">${footer}<br>${escHtml(c.postalAddress.trim())}<br><a href="${escHtml(c.unsubscribeUrl)}" style="color:#bfa04d;text-decoration:underline">${escHtml(DRIP_COPY.unsubscribe)}</a> ${escHtml(DRIP_COPY.stop)}</div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function replyBlock(): string {
  return `
  <tr><td style="padding:8px 0 24px;text-align:center">
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#888888">${escHtml(DRIP_COPY.reply)}</div>
  </td></tr>`;
}

export function dripDay3Subject(scan: DripScan): string {
  return `${String(scan.domain).slice(0, 120)}: a second look at your result`;
}

export function buildDripDay3Email(scan: DripScan, c: DripCompliance): string {
  const domain = String(scan.domain || "");
  const inner = `
  <tr><td style="padding:28px 0">
    <div style="font-family:Georgia,serif;font-size:22px;font-style:italic;color:#fbf8ef;margin-bottom:8px">${escHtml(DRIP_COPY.day3Heading)}</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#b0b0a8;line-height:1.8;margin-bottom:18px">${escHtml(domain)} scored <strong style="color:#fbf8ef">${score(scan.score)}/100</strong> on this check.</div>
    <div style="font-family:Georgia,serif;font-size:16px;font-style:italic;color:#fbf8ef;margin-bottom:10px">${escHtml(DRIP_COPY.day3Confession)}</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#b0b0a8;line-height:1.7">${escHtml(DRIP_COPY.day3Ask)}</div>
  </td></tr>
${replyBlock()}`;
  return shell("Day 3", inner, `You received this because you scanned ${escHtml(domain)} at check.neverranked.com<br>This is email 2 of 3. No further emails after this series.`, c);
}

export function dripDay7Subject(scan: DripScan): string {
  return `A week later: ${String(scan.domain).slice(0, 120)}`;
}

export function buildDripDay7Email(scan: DripScan, c: DripCompliance): string {
  const domain = String(scan.domain || "");
  const inner = `
  <tr><td style="padding:28px 0">
    <div style="font-family:Georgia,serif;font-size:22px;font-style:italic;color:#fbf8ef;margin-bottom:8px">${escHtml(DRIP_COPY.day7Heading)}</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#b0b0a8;line-height:1.8;margin-bottom:18px">Seven days ago, ${escHtml(domain)} scored <strong style="color:#fbf8ef">${score(scan.score)}/100</strong> on this check.</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#b0b0a8;line-height:1.7;margin-bottom:24px">${escHtml(DRIP_COPY.day7Body)}</div>
    <div style="text-align:center">
      <a href="https://check.neverranked.com/?url=${encodeURIComponent(domain)}" style="display:inline-block;padding:14px 32px;border:1px solid #e8c767;color:#e8c767;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">${escHtml(DRIP_COPY.day7Rescan)}</a>
    </div>
  </td></tr>
${replyBlock()}`;
  return shell("Week 1", inner, `You received this because you scanned ${escHtml(domain)} at check.neverranked.com<br>This is the last email in this series. No further emails.`, c);
}
