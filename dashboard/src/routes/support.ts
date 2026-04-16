/**
 * Dashboard -- Support / Help page
 *
 * Contact form (sends via Resend to admin), quick-links to Learn articles,
 * account overview. Available to all authenticated users.
 */

import type { Env, User } from "../types";
import { layout, html, redirect, esc } from "../render";

export async function handleSupport(user: User, env: Env, url?: URL): Promise<Response> {
  const sent = url?.searchParams.get("sent") === "1";

  const flash = sent
    ? `<div style="margin-bottom:24px;padding:14px 20px;background:rgba(127,201,154,.08);border:1px solid var(--ok);border-radius:4px;font-size:13px;color:var(--ok)">Message sent. We'll get back to you within one business day.</div>`
    : "";

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">
        <a href="/" style="color:var(--text-mute)">Dashboard</a>
      </div>
      <h1><em>Support</em></h1>
      <p style="color:var(--text-faint);font-size:13px;margin-top:8px;max-width:520px;line-height:1.6">
        Need help with your AEO dashboard, have a question about your scan results, or want to discuss strategy? Reach out below.
      </p>
    </div>

    ${flash}

    <style>
      .support-grid { display:grid;grid-template-columns:1fr 320px;gap:32px;align-items:start }
      @media(max-width:768px) { .support-grid { grid-template-columns:1fr } }
    </style>
    <div class="support-grid">
      <!-- Contact form -->
      <div>
        <div class="card" style="padding:24px">
          <div class="label" style="margin-bottom:20px">Send us a message</div>
          <form method="POST" action="/support">
            <div style="margin-bottom:16px">
              <label style="display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px;font-family:var(--label)">Subject</label>
              <select name="subject" style="width:100%;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:10px 12px;font-family:var(--mono);font-size:13px;outline:none">
                <option value="general">General question</option>
                <option value="scan">Question about scan results</option>
                <option value="schema">Schema / structured data help</option>
                <option value="strategy">Strategy discussion</option>
                <option value="billing">Billing or account</option>
                <option value="bug">Bug report</option>
                <option value="feature">Feature request</option>
              </select>
            </div>
            <div style="margin-bottom:16px">
              <label style="display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px;font-family:var(--label)">Message</label>
              <textarea name="message" rows="6" required placeholder="What can we help with?" style="width:100%;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:10px 12px;font-family:var(--mono);font-size:13px;outline:none;resize:vertical;min-height:140px;line-height:1.5"></textarea>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <button type="submit" class="cta-button" style="padding:10px 28px;font-size:12px;letter-spacing:.06em">Send message</button>
              <span style="font-size:11px;color:var(--text-faint)">From: ${esc(user.email)}</span>
            </div>
          </form>
        </div>

        <!-- Direct email fallback -->
        <div style="margin-top:16px;padding:16px 20px;background:var(--bg-edge);border-radius:4px;font-size:12px;color:var(--text-faint);line-height:1.6">
          You can also email us directly at <a href="mailto:lance@neverranked.com" style="color:var(--gold);border-bottom:1px solid var(--gold-dim)">lance@neverranked.com</a>
        </div>
      </div>

      <!-- Sidebar -->
      <div>
        <!-- Quick links -->
        <div class="card" style="padding:20px;margin-bottom:16px">
          <div class="label" style="margin-bottom:14px">Quick answers</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${quickLink("What is an AEO score?", "/learn/what-is-aeo")}
            ${quickLink("Understanding your scan results", "/learn/reading-your-scan")}
            ${quickLink("How schema markup works", "/learn/schema-markup")}
            ${quickLink("Citation tracking explained", "/learn/citation-tracking")}
            ${quickLink("Browse all articles", "/learn")}
          </div>
        </div>

        <!-- Account summary -->
        <div class="card" style="padding:20px">
          <div class="label" style="margin-bottom:14px">Your account</div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-faint)">Email</span>
              <span>${esc(user.email)}</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-faint)">Plan</span>
              <span style="color:var(--gold)">${esc(planLabel(user.plan))}</span>
            </div>
            ${user.client_slug ? `
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-faint)">Client</span>
              <span>${esc(user.client_slug)}</span>
            </div>
            ` : ""}
          </div>
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
            <a href="/settings" style="font-size:12px;color:var(--gold);border-bottom:1px solid var(--gold-dim)">Account settings</a>
          </div>
        </div>
      </div>
    </div>
  `;

  return html(layout("Support", body, user), 200);
}

export async function handleSupportSubmit(request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const subject = String(form.get("subject") || "general");
  const message = String(form.get("message") || "").trim();

  if (!message) {
    return redirect("/support");
  }

  const subjectLabels: Record<string, string> = {
    general: "General question",
    scan: "Scan results question",
    schema: "Schema / structured data",
    strategy: "Strategy discussion",
    billing: "Billing / account",
    bug: "Bug report",
    feature: "Feature request",
  };

  const subjectLabel = subjectLabels[subject] || subject;
  const emailSubject = `[NeverRanked Support] ${subjectLabel} from ${user.email}`;

  // Send via Resend
  if (env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "NeverRanked Dashboard <notifications@neverranked.com>",
          to: [env.ADMIN_EMAIL || "lance@neverranked.com"],
          reply_to: user.email,
          subject: emailSubject,
          text: [
            `Support request from ${user.name || user.email}`,
            `Email: ${user.email}`,
            `Plan: ${planLabel(user.plan)}`,
            user.client_slug ? `Client: ${user.client_slug}` : "",
            `Category: ${subjectLabel}`,
            "",
            "---",
            "",
            message,
            "",
            "---",
            `Sent from app.neverranked.com/support at ${new Date().toISOString()}`,
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      });
    } catch (err) {
      console.error("Support email failed:", err);
    }
  }

  // Also log to DB for tracking
  try {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT INTO support_messages (user_id, client_slug, email, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(user.id, user.client_slug || null, user.email, subjectLabel, message, now)
      .run();
  } catch {
    // Table might not exist yet -- non-critical
  }

  return redirect("/support?sent=1");
}

// ---------- Helpers ----------

function quickLink(label: string, href: string): string {
  return `<a href="${esc(href)}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg);border:1px solid var(--line);border-radius:3px;font-size:12px;color:var(--text-mute);transition:border-color .2s,color .2s;text-decoration:none">
    <span style="color:var(--gold);font-size:14px;flex-shrink:0">?</span>
    <span>${esc(label)}</span>
  </a>`;
}

function planLabel(plan: string | null | undefined): string {
  if (!plan || plan === "none") return "Free";
  const labels: Record<string, string> = {
    audit: "Audit",
    signal: "Signal",
    amplify: "Amplify",
  };
  return labels[plan] || plan;
}
