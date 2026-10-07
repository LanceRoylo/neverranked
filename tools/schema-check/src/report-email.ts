/**
 * The emailed free-check result, and the new-lead alert to Lance.
 *
 * The result email is built from a ScanSummary: our stored copy of the scan
 * (free_check_scans), or, when that row is missing, the whitelisted fallback
 * from summaryFromClient(). It is never built from the browser's raw object,
 * which is what let anyone send HTML of their choosing from our domain.
 *
 * Every interpolated value is escaped or coerced here, including values that
 * "should" already be safe. The domain and the signal descriptions are ours,
 * the score is a number and the grade is a letter, but escaping costs nothing
 * and the one unescaped field is how the hole above existed.
 *
 * What the email contains is exactly what the gate promised (Appendix A, Body
 * A): each missing signal by name, and what it is, in plain words. Nothing
 * else. It carries no product pitch (Monitor is out of every customer line
 * until delivery is confirmed), so it stays a transactional message: the
 * result the visitor asked for, a reply line and an unsubscribe link.
 */

import { missingSignals, type ScanSummary, type MissingSignal } from "./missing-signals";
import { PAGE_COPY } from "./copy";

/** Replies to the result email (and the drip) land in the mailbox Lance's
 *  watcher reads, the same default dashboard/src/agency-emails.ts uses. */
export const REPLY_TO = "lance@hi.neverranked.com";

export function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const GRADE_COLOR: Record<string, string> = { A: "#27ae60", B: "#e8c767", C: "#e67e22", D: "#c0392b", F: "#c0392b" };

function safeGrade(g: unknown): string {
  const s = String(g ?? "").toUpperCase();
  return GRADE_COLOR[s] ? s : "F";
}

function safeScore(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}

export const RESULT_EMAIL_COPY = {
  heading: "Your result",
  noneMissing: "We found nothing missing from the signals this check reads.",
  confession: "This check reads your site. It does not ask an AI tool about you.",
  askYourself: "To see what an AI tool says, ask it the question your customer would ask. Not your business name. Their question. Then look at two things. Is your name in the answer? And whose websites do the links underneath point to?",
  reply: "Questions about your result? Reply to this email.",
  footer: "You received this because you asked for your result at check.neverranked.com.",
  unsubscribe: "Unsubscribe",
} as const;

export function missingHeadline(n: number): string {
  if (n === 0) return RESULT_EMAIL_COPY.noneMissing;
  return `${n} ${n === 1 ? PAGE_COPY.gateTitleOne : PAGE_COPY.gateTitleMany}`;
}

export interface ResultEmail {
  subject: string;
  html: string;
  text: string;
  missing: MissingSignal[];
}

export function buildReportEmail(summary: ScanSummary, opts: { unsubscribeUrl: string | null }): ResultEmail {
  const grade = safeGrade(summary.grade);
  const score = safeScore(summary.score);
  const domain = String(summary.domain || "").slice(0, 253);
  const color = GRADE_COLOR[grade];
  const missing = missingSignals(summary);
  const headline = missingHeadline(missing.length);
  const C = RESULT_EMAIL_COPY;

  const items = missing.map((m) => `
    <tr><td style="padding:14px 18px;border-bottom:1px solid #2a2a2a">
      <div style="font-family:Georgia,serif;font-size:15px;color:#fbf8ef;margin-bottom:4px">${escHtml(m.name)}</div>
      <div style="font-family:'Courier New',monospace;font-size:12px;color:#b0b0a8;line-height:1.6">${escHtml(m.what)}</div>
    </td></tr>`).join("");

  const unsub = opts.unsubscribeUrl
    ? ` <a href="${escHtml(opts.unsubscribeUrl)}" style="color:#bfa04d;text-decoration:underline">${escHtml(C.unsubscribe)}</a>`
    : "";

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Search Check</title></head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
<tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <tr><td style="padding-bottom:28px;border-bottom:1px solid #2a2a2a">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#e8c767">Never Ranked</td>
      <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888888">AI Search Check</td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:28px 0;text-align:center">
    <div style="display:inline-block;width:80px;height:80px;border-radius:50%;border:2px solid ${color};text-align:center;line-height:80px;font-family:Georgia,serif;font-size:42px;font-style:italic;color:${color}">${escHtml(grade)}</div>
    <div style="font-family:'Courier New',monospace;font-size:32px;color:#fbf8ef;margin-top:12px">${score}<span style="font-size:14px;color:#888888">/100</span></div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#888888;margin-top:8px">${escHtml(domain)}</div>
  </td></tr>

  <tr><td style="padding-bottom:24px">
    <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#e8c767;margin-bottom:12px">${escHtml(headline)}</div>
    ${missing.length ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">${items}
    </table>` : ""}
  </td></tr>

  <tr><td style="padding:22px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
    <div style="font-family:Georgia,serif;font-size:17px;font-style:italic;color:#fbf8ef;margin-bottom:10px">${escHtml(C.confession)}</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#b0b0a8;line-height:1.7">${escHtml(C.askYourself)}</div>
  </td></tr>

  <tr><td style="padding:24px 0;text-align:center">
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#888888">${escHtml(C.reply)}</div>
  </td></tr>

  <tr><td style="padding:20px 0;border-top:1px solid #2a2a2a">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#666666;line-height:1.6">${escHtml(C.footer)}${unsub}</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const textLines = [
    `Never Ranked, AI Search Check`,
    ``,
    `${domain}: ${score}/100, grade ${grade}`,
    ``,
    headline,
    ...missing.flatMap((m) => [``, m.name, m.what]),
    ``,
    C.confession,
    C.askYourself,
    ``,
    C.reply,
    ``,
    C.footer,
    ...(opts.unsubscribeUrl ? [`${C.unsubscribe}: ${opts.unsubscribeUrl}`] : []),
  ];

  return {
    subject: `Your AI search check: ${domain} scored ${score}/100`,
    html,
    text: textLines.join("\n"),
    missing,
  };
}

// ---------- New-lead alert (internal, to LEAD_ALERT_TO) ----------

export interface LeadAlertInput {
  leadId: number | null;
  email: string;
  domain: string;
  score: number | null;
  grade: string | null;
  createdAtMs: number;
  utm: { utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_content?: string | null; utm_term?: string | null };
  referrer: string | null;
  consentVersion: string;
  followupOk: boolean;
  country: string | null;
  reportEmailStatus: string | null;
}

/** "Oct 8, 10:14 AM HST". Hawaii has no daylight saving, so a fixed zone is exact. */
export function formatHst(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "Pacific/Honolulu",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " HST";
}

function oneLine(v: unknown, cap = 300): string {
  return String(v ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, cap);
}

export function buildLeadAlert(a: LeadAlertInput): { subject: string; text: string } {
  const attribution = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
    .map((k) => {
      const v = (a.utm as Record<string, string | null | undefined>)[k];
      return v ? `${k}=${oneLine(v, 100)}` : null;
    })
    .filter(Boolean)
    .join("  ");
  const lines = [
    `New free-check lead`,
    ``,
    `Domain:    ${oneLine(a.domain)}`,
    `Score:     ${a.score === null ? "unknown" : `${a.score}/100`}${a.grade ? ` (${oneLine(a.grade, 2)})` : ""}`,
    `Time:      ${formatHst(a.createdAtMs)}`,
    `Email:     ${oneLine(a.email)}`,
    `UTM:       ${attribution || "none"}`,
    `Referrer:  ${a.referrer ? oneLine(a.referrer) : "none"}`,
    `Consent:   ${oneLine(a.consentVersion)} (${a.followupOk ? "follow-up allowed" : "no follow-up"})`,
    `Country:   ${a.country ? oneLine(a.country, 8) : "unknown"}`,
    `Report:    ${a.reportEmailStatus ? oneLine(a.reportEmailStatus, 40) : "unknown"}`,
    `Lead id:   ${a.leadId ?? "not stored in D1 (see lead_d1_failed in KV)"}`,
    ``,
    `https://app.neverranked.com/admin/free-check`,
  ];
  return { subject: `New free-check lead: ${oneLine(a.domain, 100)}`, text: lines.join("\n") };
}
