/**
 * Public agency application flow.
 *
 * Prospects who reply positively to outreach get pointed here. They
 * fill in agency name, contact, size, and notes. The row lands in
 * agency_applications (status='pending') and a row goes into
 * admin_alerts so Lance sees it in /admin/inbox.
 *
 * No auth. Rate-limited lightly to deter bored drive-by submissions
 * (1 application per email per 24h -- duplicates are swallowed with a
 * friendly thanks-we-got-it message rather than an error).
 */
'use strict';

import type { Env } from "../types";
import { html, redirect, esc } from "../render";
import { CSS } from "../styles";

function publicLayout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#121212">
<title>${esc(title)} — Never Ranked</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="grain" aria-hidden="true"></div>
<main class="page" style="max-width:720px;margin:0 auto;padding-top:48px">
  <div style="font-family:var(--serif);font-size:20px;font-style:italic;color:var(--gold);margin-bottom:48px">Never Ranked</div>
  ${body}
</main>
</body>
</html>`;
}

export async function handleAgencyApplyGet(): Promise<Response> {
  const body = `
    <div class="label" style="margin-bottom:8px">Partner application</div>
    <h1 style="margin-bottom:12px">Become a <em>NeverRanked agency</em></h1>
    <p style="color:var(--text-faint);font-size:15px;line-height:1.7;margin-bottom:32px">
      Agencies we partner with get wholesale pricing, white-labeled reports, and a dedicated slot for each of their clients. Apply below. We reply within 24 hours.
    </p>
    <form method="POST" action="/agency/apply" class="card" style="padding:28px;display:flex;flex-direction:column;gap:20px">
      <div class="form-group">
        <label>Agency name</label>
        <input type="text" name="agency_name" required maxlength="120" placeholder="e.g. Acme Digital">
      </div>
      <div class="form-group">
        <label>Your name</label>
        <input type="text" name="contact_name" required maxlength="120" placeholder="First and last">
      </div>
      <div class="form-group">
        <label>Work email</label>
        <input type="email" name="contact_email" required maxlength="200" placeholder="you@agency.com">
      </div>
      <div class="form-group">
        <label>Agency website</label>
        <input type="url" name="website" required maxlength="200" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>How many clients do you expect to run through us in the first 90 days?</label>
        <input type="number" name="estimated_clients" min="1" max="500" placeholder="e.g. 5">
      </div>
      <div class="form-group">
        <label>Anything we should know?</label>
        <textarea name="notes" rows="4" maxlength="2000" placeholder="Type of clients, current SEO stack, questions, etc."></textarea>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:4px">
        <a href="https://neverranked.com" style="font-size:12px;color:var(--text-faint)">&larr; Back to neverranked.com</a>
        <button type="submit" class="btn">Submit application</button>
      </div>
    </form>
    <p style="margin-top:24px;font-size:12px;color:var(--text-faint);line-height:1.6">
      What happens next. We review the application, usually same-day. If there's a fit, you get a login link and a short Stripe checkout to activate your agency account (Signal $800/slot, Amplify $1,800/slot, volume pricing kicks in at 10 and 25 slots). Your first client is the fastest path to revenue, so we move quickly.
    </p>
  `;
  return html(publicLayout("Partner application", body));
}

export async function handleAgencyApplyPost(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const agencyName = String(form.get("agency_name") || "").trim().slice(0, 120);
  const contactName = String(form.get("contact_name") || "").trim().slice(0, 120);
  const contactEmail = String(form.get("contact_email") || "").trim().toLowerCase().slice(0, 200);
  const website = String(form.get("website") || "").trim().slice(0, 200);
  const estimatedClientsRaw = String(form.get("estimated_clients") || "").trim();
  const estimatedClients = estimatedClientsRaw ? Math.min(500, Math.max(0, parseInt(estimatedClientsRaw, 10) || 0)) : null;
  const notes = String(form.get("notes") || "").trim().slice(0, 2000);

  // Minimal validation -- client-side required attrs catch most; the
  // server re-checks so a scripted bypass just sees an error, not an
  // empty row in the table.
  if (!agencyName || !contactName || !contactEmail || !website || !contactEmail.includes("@")) {
    return html(publicLayout("Partner application", `
      <h1>Missing required fields</h1>
      <p style="color:var(--text-faint);margin:16px 0 32px">Agency name, your name, work email, and website are all required.</p>
      <a href="/agency/apply" class="btn">Back to application</a>
    `), 400);
  }

  // Duplicate suppression. If this email has a pending or approved
  // application in the last 24h, don't insert a second one. Swallow it
  // silently behind the same thank-you page so a confused prospect
  // doesn't see an error -- their original submission is already in
  // our inbox.
  const now = Math.floor(Date.now() / 1000);
  const existing = await env.DB.prepare(
    `SELECT id FROM agency_applications
       WHERE contact_email = ? AND created_at > ? AND status IN ('pending', 'approved')
       LIMIT 1`
  ).bind(contactEmail, now - 86400).first<{ id: number }>();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO agency_applications
         (agency_name, contact_name, contact_email, website, estimated_clients, notes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).bind(agencyName, contactName, contactEmail, website, estimatedClients, notes, now).run();

    // Admin alert -- shows up in /admin/inbox as an unread notification.
    await env.DB.prepare(
      `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
         VALUES ('_system', 'agency_application', ?, ?, ?)`
    ).bind(
      `New agency application: ${agencyName}`,
      `${contactName} (${contactEmail}) from ${website}. Estimated ${estimatedClients ?? '?'} clients in first 90 days.`,
      now,
    ).run();
  }

  return html(publicLayout("Thanks", `
    <div class="label" style="margin-bottom:8px">Got it</div>
    <h1 style="margin-bottom:12px">Thanks, <em>${esc(contactName.split(' ')[0] || 'there')}</em>.</h1>
    <p style="color:var(--text-faint);font-size:15px;line-height:1.7;margin-bottom:24px">
      We got your application for <strong style="color:var(--text)">${esc(agencyName)}</strong>. We review these within 24 hours. If there's a fit, you'll get a login link at <strong style="color:var(--text)">${esc(contactEmail)}</strong> with next steps. If the inbox goes quiet for more than a day, reply to the original outreach thread and we'll fast-track you.
    </p>
    <a href="https://neverranked.com" style="color:var(--gold);font-size:13px">Back to neverranked.com &rarr;</a>
  `));
}
