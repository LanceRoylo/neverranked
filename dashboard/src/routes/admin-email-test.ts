/**
 * Dashboard -- Admin email test-send tool
 *
 * Routes:
 *   GET  /admin/email-test  -> form
 *   POST /admin/email-test  -> dispatch + send
 *
 * Lets ops trigger a real Resend send of any transactional email
 * type to a chosen address, optionally branded as a specific agency.
 * Existed-driven: the visual QA workflow before this required
 * setting up a fake Mode-2 client and waiting for the actual flow to
 * fire. Now Lance picks the email type, recipient, and (optional)
 * agency and the email lands in his inbox in seconds.
 *
 * Reuses the live send functions so what arrives is identical to
 * what real users would see -- no separate "preview" template that
 * could drift from the real one.
 */

import type { Agency, Domain, Env, ScanResult, User } from "../types";
import { html, esc, redirect } from "../render";
import { layout } from "../render";
import { getAgency } from "../agency";
import {
  sendMagicLinkEmail,
  sendDigestEmail,
  sendRegressionAlert,
  sendInviteEmail,
  type DigestData,
} from "../email";
import {
  sendSnippetDeliveryEmail,
  sendSnippetNudgeDay7,
} from "../agency-emails";

type EmailType =
  | "magic_link"
  | "digest"
  | "regression"
  | "invite_teammate"
  | "snippet_delivery"
  | "snippet_nudge_day7";

const TYPE_LABELS: Record<EmailType, string> = {
  magic_link: "Magic-link sign-in",
  digest: "Weekly digest",
  regression: "Score regression alert",
  invite_teammate: "Agency invite (teammate)",
  snippet_delivery: "Snippet install instructions",
  snippet_nudge_day7: "Snippet nudge (day 7)",
};

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// GET /admin/email-test
// ---------------------------------------------------------------------------

export async function handleEmailTestGet(user: User | null, env: Env, url: URL): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const agencies = (await env.DB.prepare(
    "SELECT id, slug, name, status, contact_email FROM agencies ORDER BY name"
  ).all<{ id: number; slug: string; name: string; status: string; contact_email: string | null }>()).results;

  const flash = url.searchParams.get("flash");
  const flashError = url.searchParams.get("error");
  const flashBlock = flash
    ? `<div class="flash">${esc(flash)}</div>`
    : flashError
    ? `<div class="flash flash-error">${esc(flashError)}</div>`
    : "";

  const agencyOpts = `
    <option value="">(no agency / NeverRanked branding)</option>
    ${agencies.map(a => `<option value="${a.id}">${esc(a.name)} (${esc(a.status)})</option>`).join("")}
  `;

  const typeOpts = (Object.keys(TYPE_LABELS) as EmailType[])
    .map(k => `<option value="${k}">${esc(TYPE_LABELS[k])}</option>`)
    .join("");

  const body = `
    <div class="section-header">
      <h1>Email <em>test-send</em></h1>
      <p class="section-sub">Fire any transactional email to any address with optional agency branding. Useful for visual QA without setting up real clients.</p>
    </div>

    ${flashBlock}

    <div class="card" style="max-width:560px">
      <form method="POST" action="/admin/email-test">
        <div class="form-group">
          <label for="email-type">Email type</label>
          <select id="email-type" name="type" required>${typeOpts}</select>
        </div>

        <div class="form-group">
          <label for="recipient">Send to</label>
          <input id="recipient" name="recipient" type="email" required value="${esc(user.email)}" placeholder="you@neverranked.com">
          <p class="muted" style="font-size:12px;margin-top:6px">Defaults to your own email.</p>
        </div>

        <div class="form-group">
          <label for="agency">Agency branding</label>
          <select id="agency" name="agency_id">${agencyOpts}</select>
          <p class="muted" style="font-size:12px;margin-top:6px">
            For agency-scoped emails (snippet delivery / nudge), the picked agency's first
            active client is used as the sample. For digest / regression, a recent scan from
            anywhere in the system is used so the rendering is realistic.
          </p>
        </div>

        <div style="display:flex;gap:12px;margin-top:24px">
          <button type="submit" class="btn">Send test</button>
          <a href="/admin" class="btn btn-ghost">Back to cockpit</a>
        </div>
      </form>
    </div>
  `;

  return html(layout("Email test-send", body, user));
}

// ---------------------------------------------------------------------------
// POST /admin/email-test
// ---------------------------------------------------------------------------

export async function handleEmailTestPost(request: Request, user: User | null, env: Env): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const form = await request.formData();
  const type = (form.get("type") as string || "") as EmailType;
  const recipient = (form.get("recipient") as string || "").trim().toLowerCase();
  const agencyIdRaw = (form.get("agency_id") as string || "").trim();
  const agencyId = agencyIdRaw ? Number(agencyIdRaw) : null;

  if (!recipient || !recipient.includes("@")) {
    return redirect("/admin/email-test?error=" + encodeURIComponent("Recipient email is invalid."));
  }
  if (!type || !(type in TYPE_LABELS)) {
    return redirect("/admin/email-test?error=" + encodeURIComponent("Pick an email type."));
  }

  const agency = agencyId ? await getAgency(env, agencyId) : null;

  try {
    let outcome: { ok: boolean; note: string };

    switch (type) {
      case "magic_link": {
        const token = randomHex(32);
        const ok = await sendMagicLinkEmail(recipient, token, env, agency);
        outcome = { ok, note: ok ? `Magic link sent (token is for preview only -- not insertable into magic_links).` : "Resend rejected the send." };
        break;
      }

      case "digest": {
        // Find a real recent scan to use as sample data.
        const sample = await env.DB.prepare(
          `SELECT s.*, d.domain, d.client_slug
             FROM scan_results s
             JOIN domains d ON d.id = s.domain_id
            WHERE s.error IS NULL
            ORDER BY s.scanned_at DESC LIMIT 1`
        ).first<ScanResult & { domain: string; client_slug: string }>();
        if (!sample) {
          outcome = { ok: false, note: "No scan data found to build a digest. Run a scan first." };
          break;
        }
        const digests: DigestData[] = [{
          domain: sample.domain,
          domainId: sample.domain_id,
          clientSlug: sample.client_slug,
          latest: sample,
          previous: null,
        }];
        const ok = await sendDigestEmail(recipient, user.name, digests, env, undefined, undefined, undefined, undefined, agency);
        outcome = { ok, note: ok ? `Digest sent using ${sample.domain} as sample.` : "Resend rejected the send." };
        break;
      }

      case "regression": {
        const sample = await env.DB.prepare(
          `SELECT s.*, d.domain, d.id AS d_id
             FROM scan_results s
             JOIN domains d ON d.id = s.domain_id
            WHERE s.error IS NULL
            ORDER BY s.scanned_at DESC LIMIT 1`
        ).first<ScanResult & { domain: string; d_id: number }>();
        if (!sample) {
          outcome = { ok: false, note: "No scan data found. Run a scan first." };
          break;
        }
        const ok = await sendRegressionAlert(
          recipient, user.name,
          sample.domain, sample.d_id,
          Math.max(0, sample.aeo_score - 12), // pretend new score
          sample.aeo_score,                    // old score
          sample.grade,
          sample,
          env,
          agency,
        );
        outcome = { ok, note: ok ? `Regression alert sent using ${sample.domain} (synthetic 12 pt drop).` : "Resend rejected the send." };
        break;
      }

      case "invite_teammate": {
        if (!agency) {
          outcome = { ok: false, note: "Pick an agency to test the invite email." };
          break;
        }
        const token = randomHex(32);
        const inviteUrl = `https://app.neverranked.com/auth/invite?token=${token}`;
        const ok = await sendInviteEmail(recipient, inviteUrl, env, {
          agency, role: "agency_admin", inviterName: user.name, clientSlug: null,
        });
        outcome = { ok, note: ok ? "Invite (teammate) sent. The token is for preview only -- not redeemable." : "Resend rejected the send." };
        break;
      }

      case "snippet_delivery":
      case "snippet_nudge_day7": {
        if (!agency) {
          outcome = { ok: false, note: "Pick an agency for snippet emails." };
          break;
        }
        // Use the agency's first active client for a realistic domain context.
        // If they have none, fall back to ANY domain so the rendering can still
        // be QA'd (clearly noted in outcome).
        let sampleDomain = await env.DB.prepare(
          "SELECT * FROM domains WHERE agency_id = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
        ).bind(agency.id).first<Domain>();
        if (!sampleDomain) {
          sampleDomain = await env.DB.prepare(
            "SELECT * FROM domains WHERE is_competitor = 0 AND active = 1 LIMIT 1"
          ).first<Domain>();
        }
        if (!sampleDomain) {
          outcome = { ok: false, note: "No active domains in the system. Add one first." };
          break;
        }
        // Override the contact_email so the test goes to the requested
        // recipient regardless of who the agency contact actually is.
        const proxyAgency: Agency = { ...agency, contact_email: recipient };
        if (type === "snippet_delivery") {
          const ok = await sendSnippetDeliveryEmail(env, { agency: proxyAgency, domain: sampleDomain });
          outcome = { ok, note: ok ? `Snippet delivery sent (using ${sampleDomain.domain}).` : "Resend rejected the send." };
        } else {
          const ok = await sendSnippetNudgeDay7(env, { agency: proxyAgency, domain: sampleDomain, daysSinceDelivery: 7 });
          outcome = { ok, note: ok ? `Snippet day-7 nudge sent (using ${sampleDomain.domain}).` : "Resend rejected the send." };
        }
        break;
      }
    }

    const flashKind = outcome.ok ? "flash" : "error";
    return redirect(`/admin/email-test?${flashKind}=` + encodeURIComponent(outcome.note));
  } catch (e) {
    return redirect("/admin/email-test?error=" + encodeURIComponent(`Send threw: ${String(e).slice(0, 200)}`));
  }
}
