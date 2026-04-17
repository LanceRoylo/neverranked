/**
 * Dashboard -- Agency lifecycle emails
 *
 * Emails we send TO the agency (not TO their clients). Branded as
 * NeverRanked since these are operational / setup messages, not
 * client-facing deliverables.
 *
 * Functions here are all fire-and-forget from the route handler's
 * perspective -- they log Resend failures to console but never throw,
 * so a mail hiccup doesn't roll back a domain insert or a Stripe sync.
 */

import type { Env, Agency, Domain } from "./types";

const BRAND_FROM = "NeverRanked <hello@neverranked.com>";

function escHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendResend(
  env: Env,
  to: string,
  subject: string,
  text: string,
  html: string,
  replyTo?: string,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Would send "${subject}" to ${to}`);
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
        from: BRAND_FROM,
        to: [to],
        subject,
        text,
        html,
        reply_to: replyTo || "lance@neverranked.com",
      }),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      console.log(`[agency-emails] Resend HTTP ${resp.status} for ${to}: ${err.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.log(`[agency-emails] send failed for ${to}: ${e}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Snippet delivery email
// ---------------------------------------------------------------------------

/**
 * Build the exact snippet tag the agency needs to paste on their
 * client's site. This is the single source of truth for the URL
 * shape -- if we ever change the injector route, update it here.
 */
function snippetTag(clientSlug: string): string {
  return `<script async src="https://app.neverranked.com/inject/${clientSlug}.js"></script>`;
}

interface SnippetEmailOpts {
  agency: Agency;
  domain: Domain;
}

/**
 * Email the agency contact with the snippet tag for a newly-added
 * client. Includes paste instructions, why-it-matters, and a clear
 * how-to-verify step.
 *
 * Returns true if the email was sent (or dev-logged), false on
 * Resend error. Caller is responsible for flipping
 * domains.snippet_email_sent_at on success.
 */
export async function sendSnippetDeliveryEmail(
  env: Env,
  opts: SnippetEmailOpts,
): Promise<boolean> {
  const { agency, domain } = opts;
  const to = agency.contact_email;
  if (!to) {
    console.log(`[agency-emails] agency ${agency.id} has no contact_email, skipping snippet email`);
    return false;
  }

  const tag = snippetTag(domain.client_slug);
  const subject = `Install snippet for ${domain.domain}`;
  const checkUrl = `https://check.neverranked.com/?url=${encodeURIComponent(domain.domain)}`;

  const text = [
    `Hi,`,
    ``,
    `${domain.domain} is provisioned on NeverRanked. One step left to turn on the schema auto-injection: paste the tag below inside the <head> section of that site's HTML.`,
    ``,
    `Snippet:`,
    ``,
    tag,
    ``,
    `Where to paste: in the <head> of every page (or the site-wide layout template). Most CMS platforms have a "Custom Header HTML" field for exactly this.`,
    ``,
    `Why it matters: once installed, we push schema updates to ${domain.domain} automatically. No dev work needed going forward. When the weekly scan finds new gaps we can fix with schema, the fix lands on the live site within the hour.`,
    ``,
    `How to verify: view the source of ${domain.domain} and search for "neverranked.com/inject". You should see the tag. Or run a scan here:`,
    `${checkUrl}`,
    ``,
    `Questions? Reply to this email. I'll see it within the hour.`,
    ``,
    `Lance`,
    `NeverRanked`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;font-size:15px;line-height:1.65;padding:0 20px">

<p style="margin:0 0 20px">Hi,</p>

<p style="margin:0 0 20px"><strong>${escHtml(domain.domain)}</strong> is provisioned on NeverRanked. One step left to turn on the schema auto-injection: paste the tag below inside the <code>&lt;head&gt;</code> section of that site's HTML.</p>

<div style="margin:24px 0;padding:16px 20px;background:#0f0f0f;border-radius:4px;overflow-x:auto">
  <code style="color:#e8c767;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.6;white-space:pre;word-break:normal">${escHtml(tag)}</code>
</div>

<p style="margin:0 0 14px"><strong>Where to paste:</strong> in the <code>&lt;head&gt;</code> of every page (or the site-wide layout template). Most CMS platforms have a "Custom Header HTML" field for exactly this.</p>

<p style="margin:0 0 14px"><strong>Why it matters:</strong> once installed, we push schema updates to the site automatically. No dev work needed going forward. When the weekly scan finds new gaps we can fix with schema, the fix lands on the live site within the hour.</p>

<p style="margin:0 0 14px"><strong>How to verify:</strong> view the source of ${escHtml(domain.domain)} and search for <code>neverranked.com/inject</code>. You should see the tag. Or run a scan here:</p>

<p style="margin:0 0 24px"><a href="${escHtml(checkUrl)}" style="color:#1a1a1a;border-bottom:1px solid #e8c767;text-decoration:none;font-family:'SF Mono',Menlo,monospace;font-size:13px">${escHtml(checkUrl)}</a></p>

<p style="margin:0 0 20px;color:#555">Questions? Reply to this email. I'll see it within the hour.</p>

<p style="margin:0 0 6px">Lance</p>
<p style="margin:0;color:#888;font-size:13px">NeverRanked</p>

</body></html>`;

  return sendResend(env, to, subject, text, html);
}
