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
import { getCitationDigestData, type CitationDigestData } from "../citations";
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

/** What actually happened to the test digest, read from the row the send
 *  path just wrote. The boolean alone cannot tell a grader hold from a
 *  Resend refusal, and cannot tell a real delivery from one the global
 *  pause swallowed. */
async function describeDigestOutcome(
  env: Env,
  recipient: string,
  ok: boolean,
  sampleDomain: string,
): Promise<string> {
  let row: { status: string; error_message: string | null } | null = null;
  try {
    row = await env.DB.prepare(
      `SELECT status, error_message
         FROM email_delivery_log
        WHERE email = ? AND type = 'digest_test'
        ORDER BY id DESC LIMIT 1`,
    ).bind(recipient).first<{ status: string; error_message: string | null }>();
  } catch {
    // Fall through to the generic wording below.
  }

  const detail = (row?.error_message || "").trim();
  if (row?.status === "suppressed") {
    return `Digest passed the grader. EMAIL_GLOBAL_PAUSE is on, so nothing was mailed. Lift the pause to deliver.`;
  }
  if (row?.status === "queued") {
    return detail === "grader-bypassed"
      ? `Digest sent using ${sampleDomain} as sample. Grader was BYPASSED (DIGEST_GRADER_BYPASS=1).`
      : `Digest sent using ${sampleDomain} as sample.`;
  }
  if (row?.status === "failed" && detail.startsWith("held by grader")) {
    return `Held by the quality grader, not mailed. ${detail.replace(/^held by grader:\s*/i, "")}`;
  }
  if (row?.status === "failed" && detail.startsWith("grader crash")) {
    return `The grader crashed, so the digest was held fail-closed. ${detail}`;
  }
  if (row?.status === "failed") {
    return `Resend rejected the send.${detail ? ` ${detail.slice(0, 300)}` : ""}`;
  }
  return ok
    ? `Digest sent using ${sampleDomain} as sample.`
    : `Send did not complete and no delivery row was found. Check the Worker logs.`;
}

// ---------------------------------------------------------------------------
// GET /admin/email-test
// ---------------------------------------------------------------------------

export async function handleEmailTestGet(user: User | null, env: Env, url: URL): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const agencies = (await env.DB.prepare(
    "SELECT id, slug, name, status, contact_email FROM agencies ORDER BY name"
  ).all<{ id: number; slug: string; name: string; status: string; contact_email: string | null }>()).results;

  // Real clients only, and only those with a non-competitor domain that has
  // actually been scanned -- a slug you cannot build a digest for should not
  // be offerable. Free text here was a mistake: the field carried
  // "hawaii-theatre" as a PLACEHOLDER, which in the dark UI reads as a filled
  // value, so the first rehearsal silently ran with an empty slug.
  const digestClients = (await env.DB.prepare(
    `SELECT DISTINCT d.client_slug AS slug
       FROM domains d
       JOIN scan_results s ON s.domain_id = d.id AND s.error IS NULL
      WHERE d.client_slug IS NOT NULL AND d.is_competitor = 0
      ORDER BY d.client_slug`
  ).all<{ slug: string }>()).results;
  const clientSlugOptions = digestClients
    .map((c) => `<option value="${esc(c.slug)}">${esc(c.slug)}</option>`)
    .join("");

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
          <p class="muted" style="font-size:12px;margin-top:6px">Defaults to your own email. Client addresses are refused.</p>
        </div>

        <div class="form-group">
          <label for="digest_slug">Client slug (digest rehearsal only)</label>
          <select id="digest_slug" name="digest_slug">
            <option value="">(most recent scan anywhere -- NOT a client rehearsal)</option>
            ${clientSlugOptions}
          </select>
          <p class="muted" style="font-size:12px;margin-top:6px">
            Builds the digest from THIS client's real citations, real undelivered
            events and real pass framing, through the real grader. Blank picks the
            most recent scan. Events are not marked delivered, so the rehearsal
            does not consume the client's next digest.
          </p>
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

  // CSRF defense: this endpoint can fire emails to arbitrary recipients,
  // so reject any cross-origin POST. SameSite=Lax cookies already block
  // most cross-origin attacks, but the explicit Origin/Referer check is
  // belt-and-suspenders for the few user-agents or scenarios where
  // SameSite enforcement is weak.
  const allowedOrigins = new Set([
    env.DASHBOARD_ORIGIN || "https://app.neverranked.com",
    "https://app.neverranked.com",
    "https://neverranked-dashboard.lanceroylo.workers.dev",
  ]);
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  let sameOrigin = false;
  if (origin && allowedOrigins.has(origin)) sameOrigin = true;
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (allowedOrigins.has(refOrigin)) sameOrigin = true;
    } catch {
      // bad referer header -> treat as cross-origin
    }
  }
  if (!sameOrigin) {
    return new Response("Cross-origin POST rejected", { status: 403 });
  }

  const form = await request.formData();
  const type = (form.get("type") as string || "") as EmailType;
  const recipient = (form.get("recipient") as string || "").trim().toLowerCase();
  const agencyIdRaw = (form.get("agency_id") as string || "").trim();
  const agencyId = agencyIdRaw ? Number(agencyIdRaw) : null;
  const digestSlug = (form.get("digest_slug") as string || "").trim();

  if (!recipient || !recipient.includes("@")) {
    return redirect("/admin/email-test?error=" + encodeURIComponent("Recipient email is invalid."));
  }

  // BLAST-RADIUS GUARD. This tool sends REAL mail through the REAL send
  // path, and since 2026-08-26 the digest case carries a real client's
  // citations and undelivered events. A mistyped recipient would put an
  // unreviewed digest in a client's inbox, out of band and out of cadence.
  // A rehearsal goes to us, never to a customer contact.
  {
    const clientAddr = await env.DB.prepare(
      `SELECT 1 FROM users WHERE lower(email) = ? AND role = 'client'
       UNION ALL
       SELECT 1 FROM customers WHERE lower(COALESCE(primary_contact_email,'')) = ?`
    ).bind(recipient, recipient).first();
    if (clientAddr) {
      return redirect("/admin/email-test?error=" + encodeURIComponent(
        "Refused: that address belongs to a client. Test sends go to your own inbox."));
    }
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
        // REHEARSAL, not a smoke test. Until 2026-08-26 this built a digest
        // from one bare scan row and passed undefined for citations, GSC,
        // events and pass framing -- so it proved Resend worked and proved
        // nothing about whether a CLIENT's real digest survives the grader.
        // That is the question Gate 5 actually asks, and it was unanswered:
        // the last genuinely delivered client digest was 2026-05-11, 106
        // days before Prince's first send. This now assembles the SAME
        // inputs the Monday/pass-cadence cron assembles, so a pass here is
        // evidence about the real artifact.
        const sample = await env.DB.prepare(
          // is_competitor = 0 is NOT optional. Cohort competitors live in
          // `domains` tagged with the CLIENT's slug, so without this filter a
          // rehearsal builds the client's digest around a rival's scan. On
          // 2026-08-26 the first run mailed a digest built from
          // ritzcarlton.com -- a Prince competitor -- labelled as a test for
          // hawaii-theatre. cron.ts has always skipped these (`if
          // (d.is_competitor) continue`); this path did not.
          `SELECT s.*, d.domain, d.client_slug
             FROM scan_results s
             JOIN domains d ON d.id = s.domain_id
            WHERE s.error IS NULL
              AND d.is_competitor = 0
              AND (? = '' OR d.client_slug = ?)
            ORDER BY s.scanned_at DESC LIMIT 1`
        ).bind(digestSlug, digestSlug).first<ScanResult & { domain: string; client_slug: string }>();
        if (!sample) {
          outcome = { ok: false, note: digestSlug
            ? `No usable scan for client_slug '${digestSlug}'.`
            : "No scan data found to build a digest. Run a scan first." };
          break;
        }
        const slug = sample.client_slug;
        const digests: DigestData[] = [{
          domain: sample.domain,
          domainId: sample.domain_id,
          clientSlug: slug,
          latest: sample,
          previous: null,
        }];

        // Same assembly as cron.ts sendWeeklyDigests.
        const citationDataMap = new Map<string, CitationDigestData>();
        const cData = await getCitationDigestData(slug, env);
        if (cData) citationDataMap.set(slug, cData);

        const eventsByClient = new Map<string, Array<{ kind: string; severity: "info" | "win" | "concern"; title: string; body: string | null; occurred_at: number }>>();
        try {
          const { getPendingEvents } = await import("../client-events");
          const bundle = await getPendingEvents(env, slug);
          if (bundle.events.length > 0) {
            // NOT marked delivered: a rehearsal must not consume the real
            // digest's material. These events must still reach the client.
            eventsByClient.set(slug, bundle.events.map((e) => ({
              kind: e.kind, severity: e.severity, title: e.title,
              body: e.body ?? null, occurred_at: e.occurred_at,
            })));
          }
        } catch { /* events are optional */ }

        // Pass framing, so the rehearsal renders the same header a real
        // pass-cadence send would.
        let passInfoByClient: Map<string, { passesDone: number; target: number }> | undefined;
        try {
          const { newPassSince } = await import("../cron");
          const pass = await newPassSince(env, slug, new Date());
          if (pass) {
            passInfoByClient = new Map([[slug, { passesDone: pass.passesDone, target: pass.target }]]);
          }
        } catch { /* framing is optional */ }

        const ok = await sendDigestEmail(
          recipient, user.name, digests, env,
          citationDataMap, undefined, undefined, undefined, agency,
          undefined, eventsByClient, undefined, undefined,
          "digest_test", passInfoByClient,
        );
        // A false return here has three very different causes -- the
        // grader held the copy, the grader crashed, or Resend refused --
        // and reporting all of them as "Resend rejected the send" sent
        // this session chasing an email-infrastructure problem that did
        // not exist. The delivery log already recorded which one it was,
        // so read it back rather than infer. Same for the true return:
        // with EMAIL_GLOBAL_PAUSE on, "sent" is a lie.
        outcome = { ok, note: await describeDigestOutcome(env, recipient, ok, sample.domain) };
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
        const origin = env.DASHBOARD_ORIGIN || "https://app.neverranked.com";
        const inviteUrl = `${origin}/auth/invite?token=${token}`;
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
