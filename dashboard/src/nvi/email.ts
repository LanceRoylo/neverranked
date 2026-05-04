/**
 * NVI report delivery via Resend.
 *
 * Sends the rendered PDF as an email attachment. Email body is a
 * short narrative wrapping the insight + action so the message is
 * readable without opening the attachment, plus a download link
 * (signed R2 URL) for accessibility.
 *
 * Triggered manually via the admin inbox approve+send flow. The
 * monthly cron auto-fires the runner but admin still has to approve
 * + send -- human-in-the-loop is the entire deal.
 */
import type { Env } from "../types";
import { fetchNviPdf } from "./pdf";
import { gradeBand } from "../../../packages/aeo-analyzer/src/grade-bands";

export interface SendResult {
  ok: boolean;
  reason?: string;
  toAddress?: string;
}

export async function sendNviReport(
  env: Env,
  reportId: number,
): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, reason: "RESEND_API_KEY not set" };
  }

  // Load the report + subscription
  const report = await env.DB.prepare(
    `SELECT r.*, s.delivery_email
       FROM nvi_reports r
       LEFT JOIN nvi_subscriptions s ON s.client_slug = r.client_slug
       WHERE r.id = ?`
  ).bind(reportId).first<{
    id: number;
    client_slug: string;
    reporting_period: string;
    tier: string;
    ai_presence_score: number;
    prev_score: number | null;
    insight: string;
    action: string;
    pdf_r2_key: string | null;
    status: string;
    delivery_email: string | null;
  }>();

  if (!report) return { ok: false, reason: `report ${reportId} not found` };
  if (report.status !== "approved") {
    return { ok: false, reason: `status is ${report.status}, must be 'approved'` };
  }
  if (!report.pdf_r2_key) return { ok: false, reason: "PDF not yet rendered" };
  if (!report.delivery_email) return { ok: false, reason: "subscription has no delivery_email" };

  // Pull the PDF from R2
  const pdf = await fetchNviPdf(env, report.pdf_r2_key);
  if (!pdf) return { ok: false, reason: "PDF not found in R2" };

  // Resolve client name
  const cfg = await env.DB.prepare(
    "SELECT business_name FROM injection_configs WHERE client_slug = ?"
  ).bind(report.client_slug).first<{ business_name: string | null }>();
  const clientName = cfg?.business_name || prettifySlug(report.client_slug);

  const period = formatPeriod(report.reporting_period);
  const band = gradeBand(report.ai_presence_score);
  const delta = report.prev_score !== null
    ? report.ai_presence_score - report.prev_score
    : null;
  const deltaStr = delta === null
    ? "(first report)"
    : delta > 0
      ? `(up ${delta} from last month)`
      : delta < 0
        ? `(down ${Math.abs(delta)} from last month)`
        : "(no change from last month)";

  const subject = `${clientName} NVI report, ${period} (Grade ${band.grade}, ${report.ai_presence_score}/100)`;

  const text = `Your Neverranked Visibility Index report for ${period} is attached.

This month: AI Presence Score ${report.ai_presence_score} of 100, Grade ${band.grade}. ${deltaStr}

Insight:
${report.insight}

Recommended action this month:
${report.action}

The full report is attached as a PDF.

Lance
Neverranked
neverranked.com`;

  const html = `<div style="font-family:Georgia,serif;font-size:14px;color:#1a1a1a;max-width:560px;margin:0 auto;padding:40px 20px;line-height:1.65">
  <p style="margin:0 0 24px;font-style:italic;font-size:20px">Neverranked Visibility Index</p>
  <p style="margin:0 0 8px;font-size:13px;letter-spacing:.06em;color:#666;text-transform:uppercase">${esc(period)} report &middot; ${esc(clientName)}</p>
  <h2 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0 0 6px;color:#1a1a1a">AI Presence ${report.ai_presence_score} <span style="color:#9c7a1f">/ 100</span></h2>
  <p style="margin:0 0 24px;font-size:13px;color:#666">Grade ${esc(band.grade)} &middot; ${esc(deltaStr)}</p>

  <p style="margin:0 0 8px;font-size:11px;letter-spacing:.12em;color:#9c7a1f;text-transform:uppercase">Insight</p>
  <p style="margin:0 0 24px">${esc(report.insight)}</p>

  <p style="margin:0 0 8px;font-size:11px;letter-spacing:.12em;color:#9c7a1f;text-transform:uppercase">Action this month</p>
  <p style="margin:0 0 32px">${esc(report.action)}</p>

  <p style="margin:0 0 24px;font-size:13px;color:#666">The full report (engine breakdown, prompt-by-prompt results, methodology) is attached as a PDF.</p>

  <p style="margin:32px 0 0;font-style:italic;font-size:14px">Lance Roylo</p>
  <p style="margin:0;font-size:12px;color:#888">Neverranked &middot; <a href="https://neverranked.com" style="color:#9c7a1f">neverranked.com</a></p>
</div>`;

  const pdfB64 = arrayBufferToBase64(pdf.bytes);
  const attachmentFilename = `nvi-${report.client_slug}-${report.reporting_period}.pdf`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Lance from Neverranked <reports@neverranked.com>",
        to: [report.delivery_email],
        reply_to: "lance@neverranked.com",
        subject,
        text,
        html,
        attachments: [
          {
            filename: attachmentFilename,
            content: pdfB64,
          },
        ],
      }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      return { ok: false, reason: `Resend ${resp.status}: ${err.slice(0, 200)}` };
    }
  } catch (e) {
    return { ok: false, reason: `Resend error: ${e}` };
  }

  // Stamp sent
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE nvi_reports SET status = 'sent', sent_at = ? WHERE id = ?"
  ).bind(now, reportId).run();

  return { ok: true, toAddress: report.delivery_email };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return btoa(binary);
}

function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function prettifySlug(slug: string): string {
  return slug.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
