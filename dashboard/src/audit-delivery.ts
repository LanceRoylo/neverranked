/**
 * Audit auto-delivery: the Stripe-checkout-complete handler for the
 * $750 audit plan. Replaces Lance's previous manual workflow (write
 * each audit by hand within 48 hours) with end-to-end automation:
 *
 *   Customer pays → webhook fires → audit auto-generates →
 *   saved to KV under a per-customer token → customer receives an
 *   email with a link → customer views their audit at a clean URL.
 *
 * Total time from payment to delivery: ~60 seconds. Customer can wait
 * for the email or watch their inbox; either way the deliverable is
 * theirs in roughly the time it takes to brew a cup of coffee.
 *
 * Storage: KV with a 1-year TTL. Long enough that the customer can
 * come back and review after the audit, short enough that we're not
 * holding stale brand snapshots forever. The token in the URL is HMAC
 * of email + client_slug, which means the URL can't be guessed from
 * either the email or the slug alone.
 */

import type { Env } from "./types";
import { buildAuditTemplateWithCache } from "./audit-template";
import { runAuditQa, recordQaRun, type QaRunResult } from "./audit-qa-agent";
import { addInboxItem } from "./admin-inbox";

const ANTHROPIC_VERSION = "2023-06-01";

const QA_MAX_ATTEMPTS = 3;

export interface AuditDeliveryOpts {
  email: string;
  brand: string;       // human-readable brand name
  domain: string;      // bare domain
  clientSlug: string;
  customerName?: string; // first name if available, e.g. "Jeff"
}

/**
 * HMAC token for the audit-view URL. Stable for the same
 * (email, client_slug) pair so the customer can re-view the audit
 * from the same link. Not guessable from either input alone.
 */
async function deriveAuditToken(env: Env, email: string, clientSlug: string): Promise<string> {
  const secret = (env as any).OUTREACH_UNSUBSCRIBE_SECRET || "neverranked-unsub-secret-change-me";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`audit:${email.toLowerCase()}:${clientSlug}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

/**
 * Generate the audit deliverable and save it to KV under the derived
 * token. Returns the public URL that points to the saved deliverable.
 *
 * Idempotent: if an audit already exists for this token, we
 * regenerate and overwrite. That gives Lance an obvious manual
 * re-trigger path: hit the same Stripe checkout webhook flow and the
 * audit refreshes.
 */
export interface GenerateAndStoreResult {
  token: string;
  url: string;
  qa: { verdict: "pass" | "warn" | "fail"; attempts: number; final_outcome: "shipped" | "regenerated" | "escalated" };
}

/**
 * Generate the audit, run it through the independent QA agent, and
 * (if QA passes) save it to KV. If QA fails, regenerate up to
 * QA_MAX_ATTEMPTS times. After exhausting attempts the audit is
 * escalated to admin_inbox and NOT stored -- meaning the email
 * delivery step (which reads the URL) sees no audit and can decide
 * to skip.
 *
 * Why block delivery on failure: at $750 a customer has paid for
 * quality. Better to escalate to Lance for manual review than to
 * ship a slop audit and damage the brand. With 3 attempts and
 * a tuned prompt, escalation should be rare -- the QA agent is the
 * safety net, not the primary author.
 */
export async function generateAndStoreAudit(env: Env, opts: AuditDeliveryOpts): Promise<GenerateAndStoreResult> {
  const token = await deriveAuditToken(env, opts.email, opts.clientSlug);
  const dashboardOrigin = (env as any).DASHBOARD_ORIGIN || "https://app.neverranked.com";
  const url = `${dashboardOrigin}/audit/view/${token}`;

  let html = "";
  let qa: QaRunResult | null = null;
  let attempt = 0;
  // E3 fix: cache scan results from the first attempt and reuse on
  // regen. Without this, attempts 2 and 3 re-run entity audit + AEO
  // scan + schema spider + competitive analysis from scratch (~25
  // subrequests each), blowing the Workers ~50-subrequest cap on
  // attempt 2 and silently failing the regen. With caching, attempts
  // 2 and 3 only re-run prose generation (LLM calls), staying well
  // within budget.
  let scanCache: Awaited<ReturnType<typeof buildAuditTemplateWithCache>>["scans"] | undefined;

  for (attempt = 1; attempt <= QA_MAX_ATTEMPTS; attempt++) {
    console.log(`[audit-delivery] generation attempt ${attempt}/${QA_MAX_ATTEMPTS} for ${opts.brand}${attempt > 1 ? " (using cached scans)" : ""}`);
    const built = await buildAuditTemplateWithCache(env, {
      brand: opts.brand,
      domain: opts.domain,
      customer_name: opts.customerName,
      scanCache,
    });
    html = built.html;
    // Capture the scans for the next attempt. After attempt 1 this
    // populates scanCache so attempt 2 skips ~25 subrequests.
    scanCache = built.scans;
    qa = await runAuditQa(env, {
      auditHtml: html,
      brand: opts.brand,
      domain: opts.domain,
      scanData: {
        brand: opts.brand, domain: opts.domain, customer_name: opts.customerName,
        client_slug: opts.clientSlug,
      },
    });
    console.log(`[audit-delivery] QA attempt ${attempt}: verdict=${qa.overall_verdict} blocks=${qa.blocking_failures} warns=${qa.warnings}`);

    if (qa.overall_verdict !== "fail") {
      // Pass or warn -- ship it. Record the success.
      await recordQaRun(env, {
        auditToken: token, clientSlug: opts.clientSlug, brand: opts.brand,
        artifactType: "audit", attemptNumber: attempt, result: qa,
        finalOutcome: "shipped",
      });
      break;
    }
    // Fail -- record and try again unless we're at max attempts.
    await recordQaRun(env, {
      auditToken: token, clientSlug: opts.clientSlug, brand: opts.brand,
      artifactType: "audit", attemptNumber: attempt, result: qa,
      finalOutcome: attempt >= QA_MAX_ATTEMPTS ? "escalated" : "regenerated",
    });
    if (attempt >= QA_MAX_ATTEMPTS) break;
  }

  if (qa && qa.overall_verdict === "fail") {
    // Escalate: do NOT store the audit, write an admin_inbox row so
    // Lance can investigate. Throw so the caller's email step skips.
    const reasons = qa.passes
      .filter((p) => !p.ok && p.severity === "block")
      .map((p) => `${p.category}: ${p.reason}`)
      .join("\n");
    try {
      await addInboxItem(env, {
        kind: "audit_qa_escalation",
        title: `Audit QA blocked after ${QA_MAX_ATTEMPTS} attempts: ${opts.brand}`,
        body: `**Customer:** ${opts.email}
**Brand:** ${opts.brand}
**Domain:** ${opts.domain}
**Client slug:** ${opts.clientSlug}
**QA token:** ${token}

**Blocking failures:**
${reasons}

The audit was generated ${QA_MAX_ATTEMPTS} times and the QA agent blocked every attempt. The customer has paid $750 but no audit has been sent. Inspect the QA run history in audit_qa_runs WHERE audit_token = '${token}' for the full trail. Decide whether to:

1. Manually fix the underlying scan data and re-trigger via /admin/deliver-audit
2. Override and ship the last attempt as-is (the HTML is still in the QA logs)
3. Tune the QA agent prompt if it's being too strict on this category`,
        target_type: "audit_qa_run",
        target_slug: opts.clientSlug,
        urgency: "high",
      });
    } catch (e) {
      console.log(`[audit-delivery] failed to escalate to admin_inbox: ${e}`);
    }
    throw new Error(`audit QA failed after ${QA_MAX_ATTEMPTS} attempts: ${reasons.slice(0, 200)}`);
  }

  // QA passed (or warned). Persist the audit.
  await env.LEADS.put(`audit:${token}`, html, { expirationTtl: 365 * 24 * 60 * 60 });
  const indexEntry = JSON.stringify({
    email: opts.email, brand: opts.brand, domain: opts.domain,
    client_slug: opts.clientSlug, generated_at: Math.floor(Date.now() / 1000),
    qa_verdict: qa?.overall_verdict, qa_attempts: attempt,
  });
  await env.LEADS.put(`audit-index:${token}`, indexEntry, { expirationTtl: 365 * 24 * 60 * 60 });

  return {
    token,
    url,
    qa: {
      verdict: qa?.overall_verdict || "pass",
      attempts: attempt,
      final_outcome: "shipped",
    },
  };
}

/**
 * Send the delivery email. Pattern matches existing welcome-email
 * handling in routes/checkout.ts (Resend, branded HTML, magic-link
 * fallback if email delivery fails).
 */
export async function sendAuditDeliveryEmail(
  env: Env,
  opts: AuditDeliveryOpts & { auditUrl: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const greeting = opts.customerName ? `${escHtml(opts.customerName)}` : "there";
  const dashboardOrigin = (env as any).DASHBOARD_ORIGIN || "https://app.neverranked.com";
  const subject = `Your AEO audit for ${opts.brand} is ready`;
  const text = `Hi ${greeting},

Your $750 AEO audit for ${opts.brand} (${opts.domain}) is ready to view.

${opts.auditUrl}

What's inside: an executive summary, an entity-graph audit across the eight identity surfaces AI engines weight, AEO scan findings on your homepage, a competitive comparison against your three closest rivals, and a 90-day roadmap of prioritized actions ranked by score lift.

The audit lives at the link above for one year. You can revisit it any time, share it with your team, or print it. Reply to this email if you have questions or want to talk through the findings.

If you decide to upgrade to Pulse ($497/mo) or Signal ($2,000/mo) within 30 days, the $750 audit fee is fully credited toward your first month.

Lance Roylo
NeverRanked
neverranked.com`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#0a0a0a">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#f4f1ea">
  <tr><td align="center" style="padding:40px 20px">
    <table role="presentation" style="max-width:560px;width:100%;background:#fffaf0;border-radius:6px;overflow:hidden;border:1px solid rgba(0,0,0,0.08)">
      <tr><td style="padding:48px 40px 24px">
        <div style="font-family:Georgia,serif;font-style:italic;font-size:28px;color:#0a0a0a;letter-spacing:-0.01em;margin-bottom:8px">NeverRanked</div>
        <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9c7a1f">Your audit is ready</div>
      </td></tr>
      <tr><td style="padding:0 40px 24px;font-size:16px;line-height:1.7;color:#1a1a1a">
        <p style="margin:0 0 16px">Hi ${greeting},</p>
        <p style="margin:0 0 16px">Your $750 AEO audit for <strong>${escHtml(opts.brand)}</strong> (${escHtml(opts.domain)}) is ready to view.</p>
        <p style="margin:0 0 28px;text-align:center">
          <a href="${escHtml(opts.auditUrl)}" style="display:inline-block;background:#c9a84c;color:#0a0a0a;padding:14px 28px;border-radius:3px;text-decoration:none;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-size:13px">View your audit</a>
        </p>
        <p style="margin:0 0 16px">Inside: an executive summary, an entity-graph audit across the eight identity surfaces AI engines weight, AEO scan findings on your homepage, a competitive comparison against your three closest rivals, and a 90-day roadmap of prioritized actions ranked by score lift.</p>
        <p style="margin:0 0 16px">The audit lives at the link above for a full year. Revisit it any time, share with your team, or print it. Reply to this email with questions or to talk through findings.</p>
      </td></tr>
      <tr><td style="padding:0 40px 32px">
        <div style="border-top:1px solid rgba(0,0,0,0.1);padding-top:24px;font-size:14px;line-height:1.65;color:#3a3a3a">
          If you upgrade to <strong>Pulse</strong> ($497/mo) or <strong>Signal</strong> ($2,000/mo) within 30 days, your $750 audit fee is fully credited toward your first month.
        </div>
      </td></tr>
      <tr><td style="padding:24px 40px 40px;font-size:12px;color:#666;background:#efe8d6">
        <div style="margin-bottom:4px">Lance Roylo · NeverRanked</div>
        <div><a href="${escHtml(dashboardOrigin)}" style="color:#9c7a1f">neverranked.com</a></div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NeverRanked <reports@neverranked.com>",
        to: [opts.email],
        subject,
        text,
        html,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, error: `Resend ${resp.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The end-to-end delivery: generate, store, and email. Wraps the two
 * steps so the webhook handler has a single function to await (or
 * fire-and-forget via ctx.waitUntil). Logs each phase so a failure
 * mid-pipeline is identifiable in wrangler tail without admin_inbox
 * dependencies.
 */
export async function deliverAuditOnCheckout(env: Env, opts: AuditDeliveryOpts): Promise<void> {
  const start = Date.now();
  console.log(`[audit-delivery] starting for ${opts.email} (${opts.brand} / ${opts.domain})`);
  let auditUrl: string;
  try {
    const generated = await generateAndStoreAudit(env, opts);
    auditUrl = generated.url;
    console.log(`[audit-delivery] generated + stored in ${Date.now() - start}ms: ${generated.url}`);
  } catch (e) {
    console.log(`[audit-delivery] generation failed: ${e instanceof Error ? e.message : e}`);
    return;
  }
  try {
    const result = await sendAuditDeliveryEmail(env, { ...opts, auditUrl });
    if (result.ok) {
      console.log(`[audit-delivery] email sent to ${opts.email}, total time ${Date.now() - start}ms`);
    } else {
      console.log(`[audit-delivery] email failed: ${result.error}`);
    }
  } catch (e) {
    console.log(`[audit-delivery] email threw: ${e instanceof Error ? e.message : e}`);
  }
}

function escHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c]!));
}
