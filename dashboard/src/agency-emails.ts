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

// ---------------------------------------------------------------------------
// Snippet-not-detected nudge emails (Day 7 + Day 14 tiers)
// ---------------------------------------------------------------------------

interface SnippetNudgeOpts {
  agency: Agency;
  domain: Domain;
  daysSinceDelivery: number;
}

/**
 * Day 7 nudge: polite reminder. Framing: "the snippet is the ONLY
 * thing standing between your client and the schema fixes we've
 * already built." Gives them the tag again so they don't have to
 * dig up the original email.
 */
export async function sendSnippetNudgeDay7(
  env: Env,
  opts: SnippetNudgeOpts,
): Promise<boolean> {
  const { agency, domain, daysSinceDelivery } = opts;
  const to = agency.contact_email;
  if (!to) return false;

  const tag = snippetTag(domain.client_slug);
  const subject = `Snippet not detected on ${domain.domain} yet`;

  const text = [
    `Hi,`,
    ``,
    `Heads up: it has been ${daysSinceDelivery} days since I sent over the snippet for ${domain.domain}, and our scanner still doesn't see it on the site.`,
    ``,
    `Here's the tag again so you don't have to dig through your inbox:`,
    ``,
    tag,
    ``,
    `Paste inside the <head> of the site-wide layout template. Once it's live, we push schema updates automatically and the AEO score starts climbing within the week.`,
    ``,
    `If your client's webmaster is the right person to do this, feel free to forward them this email. Happy to explain what it does on a quick call if that helps.`,
    ``,
    `Lance`,
    `NeverRanked`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;font-size:15px;line-height:1.65;padding:0 20px">
<p style="margin:0 0 20px">Hi,</p>
<p style="margin:0 0 20px">Heads up: it has been <strong>${daysSinceDelivery} days</strong> since I sent over the snippet for <strong>${escHtml(domain.domain)}</strong>, and our scanner still doesn't see it on the site.</p>
<p style="margin:0 0 12px">Here's the tag again so you don't have to dig through your inbox:</p>
<div style="margin:0 0 20px;padding:16px 20px;background:#0f0f0f;border-radius:4px;overflow-x:auto">
  <code style="color:#e8c767;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.6;white-space:pre;word-break:normal">${escHtml(tag)}</code>
</div>
<p style="margin:0 0 14px">Paste inside the <code>&lt;head&gt;</code> of the site-wide layout template. Once it's live, we push schema updates automatically and the AEO score starts climbing within the week.</p>
<p style="margin:0 0 20px">If your client's webmaster is the right person to do this, feel free to forward them this email. Happy to explain what it does on a quick call if that helps.</p>
<p style="margin:0 0 6px">Lance</p>
<p style="margin:0;color:#888;font-size:13px">NeverRanked</p>
</body></html>`;

  return sendResend(env, to, subject, text, html);
}

/**
 * Schema drift alert. Fires when a snippet that was previously
 * installed has disappeared from the client's homepage. Treat this
 * differently from a first-time install nudge: the agency already
 * knew it was live, so this is a real change they probably didn't
 * intend.
 */
export async function sendSnippetDriftAlert(
  env: Env,
  opts: { agency: Agency; domain: Domain },
): Promise<boolean> {
  const { agency, domain } = opts;
  const to = agency.contact_email;
  if (!to) return false;

  const tag = snippetTag(domain.client_slug);
  const subject = `Snippet removed from ${domain.domain}`;

  const text = [
    `Hi,`,
    ``,
    `Quick heads up: the NeverRanked snippet that was live on ${domain.domain} has disappeared from the homepage. Most likely the webmaster removed it during a change or the CMS template regenerated without it.`,
    ``,
    `While it's missing, we can't push schema updates to the site and the AEO score will start drifting. No dramatic change overnight, but left long enough the AI citation signals fade.`,
    ``,
    `Put the tag back in the <head>:`,
    ``,
    tag,
    ``,
    `If the client's team removed it on purpose and you'd rather pause monitoring, let me know and I'll flag the account. Otherwise a re-install is usually the 2-minute fix it sounds like.`,
    ``,
    `Lance`,
    `NeverRanked`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;font-size:15px;line-height:1.65;padding:0 20px">
<p style="margin:0 0 20px">Hi,</p>
<p style="margin:0 0 20px">Quick heads up: the NeverRanked snippet that was live on <strong>${escHtml(domain.domain)}</strong> has disappeared from the homepage. Most likely the webmaster removed it during a change or the CMS template regenerated without it.</p>
<p style="margin:0 0 20px">While it's missing, we can't push schema updates to the site and the AEO score will start drifting. No dramatic change overnight, but left long enough the AI citation signals fade.</p>
<p style="margin:0 0 12px">Put the tag back in the <code>&lt;head&gt;</code>:</p>
<div style="margin:0 0 20px;padding:16px 20px;background:#0f0f0f;border-radius:4px;overflow-x:auto">
  <code style="color:#e8c767;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.6;white-space:pre;word-break:normal">${escHtml(tag)}</code>
</div>
<p style="margin:0 0 20px">If the client's team removed it on purpose and you'd rather pause monitoring, let me know and I'll flag the account. Otherwise a re-install is usually the 2-minute fix it sounds like.</p>
<p style="margin:0 0 6px">Lance</p>
<p style="margin:0;color:#888;font-size:13px">NeverRanked</p>
</body></html>`;

  return sendResend(env, to, subject, text, html);
}

/**
 * Roadmap stall nudge. Fires when a client's roadmap has in-progress
 * items that haven't moved in 14+ days. We already create an admin
 * alert for ops visibility; this email loops the agency in so they
 * can unblock their team or their client.
 */
export async function sendRoadmapStallNudge(
  env: Env,
  opts: {
    agency: Agency;
    clientSlug: string;
    stalledCount: number;
    daysStale: number;
    sampleTitles: string[];
  },
): Promise<boolean> {
  const { agency, clientSlug, stalledCount, daysStale, sampleTitles } = opts;
  const to = agency.contact_email;
  if (!to) return false;

  const subject = `${clientSlug}: ${stalledCount} roadmap item${stalledCount === 1 ? "" : "s"} stalled ${daysStale} days`;
  const sampleList = sampleTitles.slice(0, 3).map((t) => `- ${t}`).join("\n");

  const text = [
    `Hi,`,
    ``,
    `Quick check-in on ${clientSlug}. ${stalledCount} roadmap item${stalledCount === 1 ? " has" : "s have"} been in-progress for ${daysStale} days with no update:`,
    ``,
    sampleList,
    ``,
    `Usually this means either (1) the client's team is blocked on something specific, (2) the work was done but nobody marked it complete, or (3) it got deprioritized and should be archived.`,
    ``,
    `If you want, I can look at the scan and tell you which items are detected as complete (we auto-mark when the scanner sees the fix land). Just reply and I'll pull the report.`,
    ``,
    `Lance`,
    `NeverRanked`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;font-size:15px;line-height:1.65;padding:0 20px">
<p style="margin:0 0 20px">Hi,</p>
<p style="margin:0 0 20px">Quick check-in on <strong>${escHtml(clientSlug)}</strong>. <strong>${stalledCount}</strong> roadmap item${stalledCount === 1 ? " has" : "s have"} been in-progress for <strong>${daysStale} days</strong> with no update:</p>
<ul style="margin:0 0 20px;padding-left:20px;color:var(--text-soft)">
${sampleTitles.slice(0, 3).map((t) => `<li style="margin-bottom:4px">${escHtml(t)}</li>`).join("")}
</ul>
<p style="margin:0 0 20px">Usually this means either (1) the client's team is blocked on something specific, (2) the work was done but nobody marked it complete, or (3) it got deprioritized and should be archived.</p>
<p style="margin:0 0 20px">If you want, I can look at the scan and tell you which items are detected as complete (we auto-mark when the scanner sees the fix land). Just reply and I'll pull the report.</p>
<p style="margin:0 0 6px">Lance</p>
<p style="margin:0;color:#888;font-size:13px">NeverRanked</p>
</body></html>`;

  return sendResend(env, to, subject, text, html);
}

/**
 * Day 14 nudge: different angle. Acknowledges the hesitation,
 * offers concierge help. Goal is to break the inertia without
 * nagging.
 */
export async function sendSnippetNudgeDay14(
  env: Env,
  opts: SnippetNudgeOpts,
): Promise<boolean> {
  const { agency, domain, daysSinceDelivery } = opts;
  const to = agency.contact_email;
  if (!to) return false;

  const subject = `Want me to help install ${domain.domain}'s snippet?`;

  const text = [
    `Hi,`,
    ``,
    `Still no snippet detected on ${domain.domain} (${daysSinceDelivery} days in). No judgment. This is the single most common place agency rollouts stall, usually because the client's webmaster is in the middle of something else.`,
    ``,
    `A few ways I can help:`,
    ``,
    `1. Send the client's webmaster a 90-second Loom showing exactly where the tag goes for their specific CMS.`,
    `2. Hop on a 10-minute call with you or them and talk through it.`,
    `3. If the site is on WordPress, Webflow, Squarespace, or Wix, just tell me which and I'll send the exact panel to paste into.`,
    ``,
    `Which works best? Just reply and we'll unblock it.`,
    ``,
    `Lance`,
    `NeverRanked`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;font-size:15px;line-height:1.65;padding:0 20px">
<p style="margin:0 0 20px">Hi,</p>
<p style="margin:0 0 20px">Still no snippet detected on <strong>${escHtml(domain.domain)}</strong> (${daysSinceDelivery} days in). No judgment. This is the single most common place agency rollouts stall, usually because the client's webmaster is in the middle of something else.</p>
<p style="margin:0 0 14px">A few ways I can help:</p>
<ol style="margin:0 0 20px;padding-left:20px">
  <li style="margin-bottom:8px">Send the client's webmaster a 90-second Loom showing exactly where the tag goes for their specific CMS.</li>
  <li style="margin-bottom:8px">Hop on a 10-minute call with you or them and talk through it.</li>
  <li style="margin-bottom:8px">If the site is on WordPress, Webflow, Squarespace, or Wix, just tell me which and I'll send the exact panel to paste into.</li>
</ol>
<p style="margin:0 0 20px">Which works best? Just reply and we'll unblock it.</p>
<p style="margin:0 0 6px">Lance</p>
<p style="margin:0;color:#888;font-size:13px">NeverRanked</p>
</body></html>`;

  return sendResend(env, to, subject, text, html);
}
