/**
 * Dashboard -- Email sending via Resend
 *
 * Magic link auth emails + weekly AEO digest emails.
 */

import type { Agency, Env, ScanResult, GscSnapshot } from "./types";
import { generateNarrative } from "./narrative";
import type { CitationDigestData } from "./citations";
import { buildStateOfAeoBlock, type StateOfAeoLatest } from "./state-of-aeo";

// Default brand visuals used when no agency override is supplied.
const NR_BRAND_NAME = "Never Ranked";
const NR_PRIMARY = "#e8c767";

/** Resolve display name + accent color for an email, falling back to NeverRanked. */
function brandFor(agency: Agency | null | undefined): { name: string; color: string; logo: string | null } {
  if (agency && agency.status === "active") {
    return {
      name: agency.name || NR_BRAND_NAME,
      color: agency.primary_color || NR_PRIMARY,
      logo: agency.logo_url || null,
    };
  }
  return { name: NR_BRAND_NAME, color: NR_PRIMARY, logo: null };
}

/** "Powered by NeverRanked" footer block, only included when agency-branded. */
function poweredByBlock(agency: Agency | null | undefined): string {
  if (!agency || agency.status !== "active") return "";
  return `<p style="margin:24px 0 0;font-size:11px;color:#aaa;text-align:center">Powered by Never Ranked</p>`;
}

/**
 * Record one transactional email send attempt to email_delivery_log.
 * Closes the observability gap that bit us debugging the magic-link
 * issue: previously failures only printed to console.log and were
 * invisible without an active wrangler tail session.
 *
 * Best-effort: a logging failure must NEVER break the send flow, so
 * the catch swallows everything.
 */
export async function logEmailDelivery(
  env: Env,
  opts: {
    email: string;
    type: string;
    status: "queued" | "failed";
    statusCode?: number | null;
    errorMessage?: string | null;
    agencyId?: number | null;
    targetId?: number | null;
  }
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO email_delivery_log
         (email, type, status, status_code, error_message, agency_id, target_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      opts.email,
      opts.type,
      opts.status,
      opts.statusCode ?? null,
      opts.errorMessage ? String(opts.errorMessage).slice(0, 500) : null,
      opts.agencyId ?? null,
      opts.targetId ?? null,
      Math.floor(Date.now() / 1000),
    ).run();
  } catch {
    // Logging is observability, not core. A failure here cannot block
    // the send pipeline.
  }
}

export interface DigestData {
  domain: string;
  domainId: number;
  clientSlug: string;
  latest: ScanResult;
  previous: ScanResult | null;
}

export interface GscDigestData {
  clientSlug: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prevClicks: number | null;
  prevImpressions: number | null;
  topQuery: string | null;
  dateRange: string;
}

export async function sendMagicLinkEmail(
  email: string,
  token: string,
  env: Env,
  agency?: Agency | null
): Promise<boolean> {
  const loginUrl = `https://app.neverranked.com/auth/verify?token=${token}`;
  const brand = brandFor(agency);
  const headerHtml = brand.logo
    ? `<p style="margin:0 0 24px"><img src="${brand.logo}" alt="${brand.name}" style="max-height:32px;max-width:240px"></p>`
    : `<p style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#1a1a1a">${brand.name}</p>`;

  // If no Resend key, log to console (dev mode)
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Magic link for ${email}: ${loginUrl}`);
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
        from: `${brand.name} <login@neverranked.com>`,
        to: [email],
        subject: `Sign in to ${brand.name}`,
        text: `Click to sign in:\n\n${loginUrl}\n\nThis link expires in 15 minutes.\n\n${brand.name}`,
        html: `
          <div style="font-family:monospace;font-size:14px;color:#333;max-width:480px;margin:0 auto;padding:40px 20px">
            ${headerHtml}
            <p style="margin:0 0 24px">Click the button below to sign in to your dashboard.</p>
            <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:${brand.color};font-family:monospace;font-size:13px;text-decoration:none;letter-spacing:.05em">Sign in</a>
            <p style="margin:24px 0 0;font-size:12px;color:#888">This link expires in 15 minutes. If you did not request this, ignore this email.</p>
            ${poweredByBlock(agency)}
          </div>
        `,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.log(`Magic link to ${email} failed: ${resp.status} ${errBody}`);
      await logEmailDelivery(env, { email, type: "magic_link", status: "failed", statusCode: resp.status, errorMessage: errBody, agencyId: agency?.id });
      return false;
    }

    console.log(`Magic link sent to ${email}`);
    await logEmailDelivery(env, { email, type: "magic_link", status: "queued", statusCode: resp.status, agencyId: agency?.id });
    return true;
  } catch (err) {
    console.error(`Magic link to ${email} error:`, err);
    await logEmailDelivery(env, { email, type: "magic_link", status: "failed", errorMessage: String(err), agencyId: agency?.id });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Free-tier magic link
// ---------------------------------------------------------------------------

export async function sendFreeMagicLinkEmail(
  email: string,
  token: string,
  domain: string,
  env: Env
): Promise<boolean> {
  const verifyUrl = `https://app.neverranked.com/free/auth?token=${token}`;

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Free magic link for ${email} (${domain}): ${verifyUrl}`);
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
        from: "NeverRanked <scores@neverranked.com>",
        to: [email],
        subject: `Confirm your weekly AEO score for ${domain}`,
        text: `Click to confirm and see your first score:\n\n${verifyUrl}\n\nThis link expires in 15 minutes. After confirming, you will get a fresh AEO score for ${domain} every Monday, plus an alert if the score drops materially during the week.\n\nNeverRanked`,
        html: `
          <div style="font-family:monospace;font-size:14px;color:#333;max-width:480px;margin:0 auto;padding:40px 20px">
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#1a1a1a">NeverRanked</p>
            <p style="margin:0 0 16px">You are one click away from a weekly AEO score for <strong>${domain}</strong>.</p>
            <p style="margin:0 0 24px;color:#555">Every Monday we measure how your domain shows up across the seven AI engines we track and email you the result. If the score drops materially during the week, you also get an alert.</p>
            <a href="${verifyUrl}" style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:#e8c767;font-family:monospace;font-size:13px;text-decoration:none;letter-spacing:.05em">See my score</a>
            <p style="margin:24px 0 0;font-size:12px;color:#888">This link expires in 15 minutes. If you did not request this, ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.log(`Free magic link to ${email} failed: ${resp.status} ${errBody}`);
      await logEmailDelivery(env, { email, type: "magic_link", status: "failed", statusCode: resp.status, errorMessage: errBody });
      return false;
    }

    console.log(`Free magic link sent to ${email}`);
    await logEmailDelivery(env, { email, type: "magic_link", status: "queued", statusCode: resp.status });
    return true;
  } catch (err) {
    console.error(`Free magic link to ${email} error:`, err);
    await logEmailDelivery(env, { email, type: "magic_link", status: "failed", errorMessage: String(err) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Free-tier weekly digest + score-drop alert
// ---------------------------------------------------------------------------

interface FreeDigestData {
  email: string;
  domain: string;
  score: number;
  grade: string;
  prevScore: number | null;
  unsubToken: string;
}

export async function sendFreeWeeklyDigestEmail(
  d: FreeDigestData,
  env: Env
): Promise<boolean> {
  const trendBlock = d.prevScore !== null
    ? (d.score === d.prevScore
        ? `Same as last week.`
        : d.score > d.prevScore
          ? `Up ${d.score - d.prevScore} from last week.`
          : `Down ${d.prevScore - d.score} from last week.`)
    : `First weekly score.`;

  const dashboardUrl = "https://app.neverranked.com/free";
  const stateOfAeoUrl = "https://neverranked.com/state-of-aeo/";
  const unsubUrl = `https://app.neverranked.com/free/unsubscribe?token=${d.unsubToken}`;
  const upgradeUrl = "https://neverranked.com/pricing";

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Free weekly digest for ${d.email} (${d.domain}): score=${d.score}, trend=${trendBlock}`);
    return true;
  }

  // Migrated 2026-05-11 PM to use sendEmailViaResend() with QA preflight.
  // Free weekly digest goes to free-tier users -- template-fail here
  // would damage trust with the funnel-top audience. Preflight catches
  // unsubstituted placeholders, banned recipients, suppression-list
  // hits, and brand-voice violations. Red verdicts BLOCK the send.
  const subject = `Your AEO score this week: ${d.score}/100`;
  const textBody = `${d.domain}\n\nAEO score: ${d.score}/100 (grade ${d.grade})\n${trendBlock}\n\nFull dashboard: ${dashboardUrl}\nThis week's Citation Tape: ${stateOfAeoUrl}\n\nFree shows the score. Paid shows what to fix and the citation tracking across all seven engines. See paid tiers: ${upgradeUrl}\n\nUnsubscribe: ${unsubUrl}`;
  const htmlBody = `
          <div style="font-family:monospace;font-size:14px;color:#333;max-width:520px;margin:0 auto;padding:40px 20px">
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#1a1a1a">NeverRanked</p>
            <p style="margin:0 0 8px;font-family:monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#888">Weekly AEO score</p>
            <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:24px;font-weight:400">${d.domain}</h1>
            <div style="text-align:center;margin:32px 0">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:72px;line-height:1;color:#1a1a1a">${d.score}</div>
              <div style="margin-top:8px;font-family:monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#888">Grade ${d.grade}</div>
              <p style="margin:16px 0 0;font-size:13px;color:#555">${trendBlock}</p>
            </div>
            <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#e8c767;font-family:monospace;font-size:12px;text-decoration:none;letter-spacing:.05em">Open dashboard</a>
            <div style="border-top:1px solid #e5e5e5;margin:32px 0;padding-top:24px">
              <p style="margin:0 0 12px;font-family:monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#888">This week in The Citation Tape</p>
              <p style="margin:0 0 12px;font-size:13px;color:#555">NeverRanked's standing measurement of what AI engines cite when answering questions about brands we track.</p>
              <a href="${stateOfAeoUrl}" style="font-family:monospace;font-size:12px;color:#bfa04d;text-decoration:underline">Read this week's report &rarr;</a>
            </div>
            <div style="background:#fafafa;padding:24px;border-radius:6px;margin:24px 0">
              <p style="margin:0 0 8px;font-family:Georgia,serif;font-style:italic;font-size:16px">Want to fix the score?</p>
              <p style="margin:0 0 12px;font-size:13px;color:#555">Free shows the score. Paid shows <em>what to fix</em> and the citation tracking across all seven engines.</p>
              <a href="${upgradeUrl}" style="font-family:monospace;font-size:12px;color:#bfa04d;text-decoration:underline">See paid tiers &rarr;</a>
            </div>
            <p style="margin:32px 0 0;font-size:11px;color:#888">
              <a href="${unsubUrl}" style="color:#888">Unsubscribe</a>
            </p>
          </div>
        `;

  const { sendEmailViaResend, QAPreflightError } = await import("./lib/qa-email-preflight");
  try {
    const result = await sendEmailViaResend(env, {
      from: "NeverRanked <scores@neverranked.com>",
      to: d.email,
      subject,
      text: textBody,
      html: htmlBody,
      artifact_ref: "free_weekly_digest",
    }, { blocking: true });

    if (!result.ok) {
      const errBody = result.error ?? `status ${result.status}`;
      console.log(`Free digest to ${d.email} failed: ${errBody}`);
      await logEmailDelivery(env, { email: d.email, type: "digest", status: "failed", statusCode: result.status, errorMessage: errBody });
      return false;
    }

    await logEmailDelivery(env, { email: d.email, type: "digest", status: "queued", statusCode: result.status });
    return true;
  } catch (err) {
    if (err instanceof QAPreflightError) {
      console.log(`Free digest BLOCKED by QA preflight for ${d.email}: ${err.audit.reasoning}`);
      await logEmailDelivery(env, { email: d.email, type: "digest", status: "failed", errorMessage: `QA preflight blocked: ${err.audit.reasoning}` });
      return false;
    }
    console.error(`Free digest to ${d.email} error:`, err);
    await logEmailDelivery(env, { email: d.email, type: "digest", status: "failed", errorMessage: String(err) });
    return false;
  }
}

interface FreeAlertData {
  email: string;
  domain: string;
  prevScore: number;
  currScore: number;
  bandCrossing: "green-to-yellow" | "yellow-to-red" | "green-to-red" | null;
  unsubToken: string;
}

export async function sendFreeScoreDropAlertEmail(
  d: FreeAlertData,
  env: Env
): Promise<boolean> {
  const drop = d.prevScore - d.currScore;
  const dashboardUrl = "https://app.neverranked.com/free";
  const upgradeUrl = "https://neverranked.com/pricing";
  const unsubUrl = `https://app.neverranked.com/free/unsubscribe?token=${d.unsubToken}`;

  const bandLabel = d.bandCrossing
    ? d.bandCrossing === "green-to-yellow"
      ? "Crossed from green (80+) to yellow (60-79)."
      : d.bandCrossing === "yellow-to-red"
        ? "Crossed from yellow (60-79) to red (under 60)."
        : "Crossed from green (80+) all the way through yellow into red."
    : "";

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Free score-drop alert for ${d.email} (${d.domain}): ${d.prevScore} -> ${d.currScore}. ${bandLabel}`);
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
        from: "NeverRanked <scores@neverranked.com>",
        to: [d.email],
        subject: `Score alert: ${d.prevScore} → ${d.currScore} for ${d.domain}`,
        text: `Your AEO score for ${d.domain} dropped ${drop} points this week.\n\n${d.prevScore} → ${d.currScore}\n${bandLabel}\n\nFree shows the alert. Pulse subscribers get the diagnosis: which schema changed, which engine stopped citing, which competitor moved.\n\nDashboard: ${dashboardUrl}\nUpgrade to Pulse: ${upgradeUrl}\n\nUnsubscribe: ${unsubUrl}`,
        html: `
          <div style="font-family:monospace;font-size:14px;color:#333;max-width:520px;margin:0 auto;padding:40px 20px">
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#1a1a1a">NeverRanked</p>
            <p style="margin:0 0 8px;font-family:monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c93a3a">Score drop alert</p>
            <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-style:italic;font-size:24px;font-weight:400">${d.domain}</h1>
            <div style="text-align:center;margin:32px 0">
              <div style="display:inline-flex;align-items:baseline;gap:16px;font-family:Georgia,serif;font-style:italic">
                <span style="font-size:48px;color:#888">${d.prevScore}</span>
                <span style="font-size:20px;color:#888">→</span>
                <span style="font-size:64px;color:#c93a3a">${d.currScore}</span>
              </div>
              <p style="margin:12px 0 0;font-size:13px;color:#555">${bandLabel || `Down ${drop} points.`}</p>
            </div>
            <div style="background:#fafafa;padding:24px;border-radius:6px;margin:24px 0">
              <p style="margin:0 0 8px;font-family:Georgia,serif;font-style:italic;font-size:16px">Pulse subscribers get the diagnosis, not just the alert.</p>
              <p style="margin:0 0 12px;font-size:13px;color:#555">Which schema changed, which engine stopped citing, which competitor moved. Free shows the alert. Pulse shows the cause and the fix.</p>
              <a href="${upgradeUrl}" style="font-family:monospace;font-size:12px;color:#bfa04d;text-decoration:underline">See Pulse &rarr;</a>
            </div>
            <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#e8c767;font-family:monospace;font-size:12px;text-decoration:none;letter-spacing:.05em">Open dashboard</a>
            <p style="margin:32px 0 0;font-size:11px;color:#888">
              <a href="${unsubUrl}" style="color:#888">Unsubscribe</a>
            </p>
          </div>
        `,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.log(`Free alert to ${d.email} failed: ${resp.status} ${errBody}`);
      await logEmailDelivery(env, { email: d.email, type: "score_drop_alert", status: "failed", statusCode: resp.status, errorMessage: errBody });
      return false;
    }

    await logEmailDelivery(env, { email: d.email, type: "score_drop_alert", status: "queued", statusCode: resp.status });
    return true;
  } catch (err) {
    console.error(`Free alert to ${d.email} error:`, err);
    await logEmailDelivery(env, { email: d.email, type: "score_drop_alert", status: "failed", errorMessage: String(err) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Agency invites (teammate or client)
// ---------------------------------------------------------------------------

export async function sendInviteEmail(
  email: string,
  inviteUrl: string,
  env: Env,
  opts: {
    agency: Agency;
    role: "agency_admin" | "client";
    inviterName: string | null;
    clientSlug: string | null;
  }
): Promise<boolean> {
  const brand = brandFor(opts.agency);
  const isTeammate = opts.role === "agency_admin";
  const inviterLabel = opts.inviterName ? opts.inviterName : "Someone";
  const subject = isTeammate
    ? `${inviterLabel} invited you to ${brand.name} on Never Ranked`
    : `${brand.name} invited you to your AEO dashboard`;
  const heading = isTeammate
    ? `You're invited to join ${brand.name}`
    : `Welcome to your dashboard`;
  const sub = isTeammate
    ? `${inviterLabel} added you as a teammate. You'll be able to manage every client on the ${brand.name} account.`
    : `${brand.name} set up an AEO dashboard for you. Click below to sign in -- this link is good for 7 days.`;

  const headerHtml = brand.logo
    ? `<p style="margin:0 0 24px"><img src="${brand.logo}" alt="${brand.name}" style="max-height:32px;max-width:240px"></p>`
    : `<p style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#1a1a1a">${brand.name}</p>`;

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Invite for ${email}: ${inviteUrl}`);
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
        from: `${brand.name} <login@neverranked.com>`,
        to: [email],
        subject,
        text: `${heading}\n\n${sub}\n\nAccept invite: ${inviteUrl}\n\nThis link is good for 7 days.`,
        html: `
          <div style="font-family:monospace;font-size:14px;color:#333;max-width:480px;margin:0 auto;padding:40px 20px">
            ${headerHtml}
            <p style="margin:0 0 12px;font-family:Georgia,serif;font-size:20px;color:#1a1a1a">${heading}</p>
            <p style="margin:0 0 24px;line-height:1.6">${sub}</p>
            <a href="${inviteUrl}" style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:${brand.color};font-family:monospace;font-size:13px;text-decoration:none;letter-spacing:.05em">Accept invite</a>
            <p style="margin:24px 0 0;font-size:12px;color:#888">This link is good for 7 days. If you weren't expecting it, ignore this email.</p>
            ${poweredByBlock(opts.agency)}
          </div>
        `,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.log(`Invite to ${email} failed: ${resp.status} ${errBody}`);
      await logEmailDelivery(env, { email, type: "invite", status: "failed", statusCode: resp.status, errorMessage: errBody, agencyId: opts.agency.id });
      return false;
    }
    console.log(`Invite sent to ${email}`);
    await logEmailDelivery(env, { email, type: "invite", status: "queued", statusCode: resp.status, agencyId: opts.agency.id });
    return true;
  } catch (err) {
    console.error(`Invite to ${email} error:`, err);
    await logEmailDelivery(env, { email, type: "invite", status: "failed", errorMessage: String(err), agencyId: opts.agency.id });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Weekly AEO digest
// ---------------------------------------------------------------------------

export interface RoadmapDigestData {
  clientSlug: string;
  total: number;
  done: number;
  inProgress: number;
  recentlyCompleted: string[];  // titles of items completed this week
  // Citation-gap delta surfaces the auto-roadmap activity: new items
  // generated from gap detection in the last 7 days, and gap-driven
  // items auto-resolved (closed because the underlying gap closed
  // in citation_runs). Both are subsets of the larger totals above.
  newGapItems?: string[];       // titles added in last 7 days where refresh_source='citation_gap'
  gapResolved?: string[];       // titles closed in last 7 days where completed_by='citation_gap'
}

/** Send a digest email to one recipient */
export interface DigestEvent {
  kind: string;
  severity: "info" | "win" | "concern";
  title: string;
  body: string | null;
  occurred_at: number;
}

export async function sendDigestEmail(
  to: string,
  userName: string | null,
  digests: DigestData[],
  env: Env,
  citationData?: Map<string, CitationDigestData>,
  gscData?: Map<string, GscDigestData>,
  roadmapData?: Map<string, RoadmapDigestData>,
  unsubToken?: string,
  agency?: Agency | null,
  stateOfAeo?: StateOfAeoLatest | null,
  eventsByClient?: Map<string, DigestEvent[]>,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Digest for ${to}: ${digests.map(d => `${d.domain} ${d.latest.aeo_score}`).join(", ")}`);
    return true;
  }

  if (digests.length === 0) return false;

  const brand = brandFor(agency);
  const subject = digests.length === 1
    ? buildSubjectSingle(digests[0], citationData)
    : buildSubjectMulti(digests, citationData);

  const emailHtml = buildDigestHtml(userName, digests, citationData, gscData, roadmapData, unsubToken, agency, stateOfAeo, eventsByClient);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brand.name} <reports@neverranked.com>`,
        to: [to],
        subject,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`Digest to ${to} failed: ${res.status} ${err}`);
      await logEmailDelivery(env, { email: to, type: "digest", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }

    console.log(`Digest sent to ${to}`);
    await logEmailDelivery(env, { email: to, type: "digest", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    console.log(`Digest to ${to} error: ${e}`);
    await logEmailDelivery(env, { email: to, type: "digest", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

function buildSubjectSingle(d: DigestData, citationData?: Map<string, CitationDigestData>): string {
  // Prefer citation-share movement as the headline when available. It's
  // the more meaningful signal for Signal-tier clients — AEO score is
  // the input; citation share is the outcome that drives revenue.
  const cd = citationData?.get(d.clientSlug);
  if (cd && cd.previousShare !== null) {
    const shareDiff = (cd.citationShare - cd.previousShare) * 100;
    const currPct = Math.round(cd.citationShare * 100);
    if (shareDiff >= 3) {
      return `${d.domain}: citation share up ${Math.round(shareDiff)} pts to ${currPct}%`;
    } else if (shareDiff <= -3) {
      return `${d.domain}: citation share down ${Math.round(Math.abs(shareDiff))} pts to ${currPct}%`;
    } else if (cd.keywordsWon > 0 && cd.keywordsLost === 0) {
      return `${d.domain}: gained ${cd.keywordsWon} new citation${cd.keywordsWon === 1 ? "" : "s"} this week`;
    } else if (cd.keywordsLost > 0 && cd.keywordsWon === 0) {
      return `${d.domain}: lost ${cd.keywordsLost} citation${cd.keywordsLost === 1 ? "" : "s"} this week`;
    } else if (cd.keywordsWon > 0 || cd.keywordsLost > 0) {
      return `${d.domain}: ${cd.keywordsWon} citation${cd.keywordsWon === 1 ? "" : "s"} gained, ${cd.keywordsLost} lost this week`;
    }
    return `${d.domain}: citation share held at ${currPct}% this week`;
  }
  if (cd) {
    const currPct = Math.round(cd.citationShare * 100);
    return `${d.domain}: first citation read, ${currPct}% share across ${cd.totalKeywords} tracked queries`;
  }

  // Fallback: AEO score framing when no citation data is available.
  const diff = d.previous && !d.previous.error
    ? d.latest.aeo_score - d.previous.aeo_score
    : null;

  if (diff !== null && diff > 0) {
    return `${d.domain}: AEO score up ${diff} pts (${d.latest.aeo_score}/100)`;
  } else if (diff !== null && diff < 0) {
    return `${d.domain}: AEO score dropped ${Math.abs(diff)} pts (${d.latest.aeo_score}/100)`;
  }
  return `${d.domain}: AEO score ${d.latest.aeo_score}/100`;
}

// Subject builder for multi-domain digests. Surfaces aggregate movement
// across domains if citation data is present, otherwise falls back to
// the generic count subject.
function buildSubjectMulti(digests: DigestData[], citationData?: Map<string, CitationDigestData>): string {
  if (citationData && citationData.size > 0) {
    let gainedTotal = 0;
    let lostTotal = 0;
    let movers = 0;
    for (const d of digests) {
      const cd = citationData.get(d.clientSlug);
      if (!cd) continue;
      gainedTotal += cd.keywordsWon;
      lostTotal += cd.keywordsLost;
      if (cd.previousShare !== null && Math.abs(cd.citationShare - cd.previousShare) > 0.02) movers++;
    }
    if (movers >= Math.ceil(digests.length / 2) && (gainedTotal > 0 || lostTotal > 0)) {
      return `Weekly citation report -- ${gainedTotal} gained, ${lostTotal} lost across ${digests.length} domains`;
    }
  }
  return `Weekly AEO Report -- ${digests.length} domains scanned`;
}

// ---------------------------------------------------------------------------
// Score regression alerts
// ---------------------------------------------------------------------------

const REGRESSION_THRESHOLD = 5; // pts drop to trigger alert

export { REGRESSION_THRESHOLD };

// ---------------------------------------------------------------------------
// Annual recap (year in review)
// ---------------------------------------------------------------------------

export interface AnnualRecapData {
  domain: string;
  clientSlug: string;
  yearLabel: string;             // e.g., "2025"
  scoreNow: number | null;
  scoreYearAgo: number | null;
  scoreDelta: number | null;
  citationShareNow: number | null;
  citationShareYearAgo: number | null;
  roadmapCompleted: number;
  schemaFixesShipped: number;
  bestMonth: string | null;       // e.g., "August" - month with biggest score gain
  bestMonthGain: number | null;
  totalScans: number;
}

export async function sendAnnualRecapEmail(
  to: string,
  userName: string | null,
  data: AnnualRecapData,
  env: Env,
  agency?: Agency | null,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Annual recap for ${to}: ${data.domain} ${data.yearLabel}`);
    return true;
  }

  const greeting = userName ? userName.split(" ")[0] : "there";
  const brand = brandFor(agency);
  const subject = data.scoreDelta && data.scoreDelta > 0
    ? `${data.domain}: ${data.yearLabel} year in review (+${data.scoreDelta} pts)`
    : `${data.domain}: ${data.yearLabel} year in review`;

  const headerHtml = brand.logo
    ? `<td><img src="${brand.logo}" alt="${escEmail(brand.name)}" style="max-height:28px;max-width:200px"></td>`
    : `<td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:${brand.color}">${escEmail(brand.name)}</td>`;
  const footerLine = agency
    ? `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">Never Ranked</a>`
    : `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a>`;

  const scoreLine = data.scoreNow !== null && data.scoreYearAgo !== null
    ? `${data.scoreNow}/100 (${data.scoreDelta && data.scoreDelta > 0 ? "+" : ""}${data.scoreDelta} pts on the year, started at ${data.scoreYearAgo})`
    : data.scoreNow !== null ? `${data.scoreNow}/100 (no full-year baseline yet)` : "no scan recorded";

  const citationLine = data.citationShareNow !== null && data.citationShareYearAgo !== null
    ? `${(data.citationShareNow * 100).toFixed(0)}% share now, was ${(data.citationShareYearAgo * 100).toFixed(0)}% a year ago`
    : data.citationShareNow !== null ? `${(data.citationShareNow * 100).toFixed(0)}% share` : "not yet tracked";

  const text = [
    `Hey ${greeting},`,
    ``,
    `Here's the ${data.yearLabel} year-in-review for ${data.domain}.`,
    ``,
    `AEO score: ${scoreLine}`,
    `Citation share: ${citationLine}`,
    `Roadmap items completed: ${data.roadmapCompleted}`,
    `Schema fixes pushed live: ${data.schemaFixesShipped}`,
    `Total weekly scans: ${data.totalScans}`,
    data.bestMonth ? `Best month: ${data.bestMonth} (+${data.bestMonthGain} pts)` : ``,
    ``,
    `Compounding work, made visible. Onward to the next year.`,
    ``,
    `Full historical chart:`,
    `https://app.neverranked.com/domain/${data.clientSlug}`,
    ``,
    `-- ${brand.name}`,
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${brand.name} <reports@neverranked.com>`,
        to: [to], subject, text,
        html: `
<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212"><tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <tr><td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${headerHtml}<td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${brand.color}">${escEmail(data.yearLabel)} in review</td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:36px 0 24px">
    <div style="font-family:Georgia,serif;font-size:16px;color:#fbf8ef;margin-bottom:14px">Hey ${escEmail(greeting)},</div>
    <div style="font-family:Georgia,serif;font-size:22px;font-style:italic;color:#fbf8ef;line-height:1.4">
      <strong style="color:${brand.color}">${escEmail(data.domain)}</strong> in <strong>${escEmail(data.yearLabel)}</strong>.
    </div>
  </td></tr>

  <tr><td style="padding:0 0 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 8px">
      <tr><td style="padding:18px 22px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
        <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:6px">AEO Score</div>
        <div style="font-family:Georgia,serif;font-size:18px;color:#fbf8ef">${escEmail(scoreLine)}</div>
      </td></tr>
      <tr><td style="padding:18px 22px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
        <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:6px">Citation share</div>
        <div style="font-family:Georgia,serif;font-size:18px;color:#fbf8ef">${escEmail(citationLine)}</div>
      </td></tr>
      <tr><td style="padding:18px 22px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
        <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:6px">Work shipped</div>
        <div style="font-family:Georgia,serif;font-size:14px;color:#b0b0a8;line-height:1.8">
          <strong style="color:#fbf8ef">${data.roadmapCompleted}</strong> roadmap items completed<br>
          <strong style="color:#fbf8ef">${data.schemaFixesShipped}</strong> schema fixes pushed live by ${escEmail(brand.name)}<br>
          <strong style="color:#fbf8ef">${data.totalScans}</strong> weekly scans${data.bestMonth ? `<br>Best month: <strong style="color:#fbf8ef">${escEmail(data.bestMonth)}</strong> (+${data.bestMonthGain} pts)` : ""}
        </div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:8px 0 24px">
    <div style="font-family:Georgia,serif;font-size:14px;color:#b0b0a8;line-height:1.7;font-style:italic">
      Compounding work, made visible. Onward to the next year.
    </div>
  </td></tr>

  <tr><td align="center" style="padding:0 0 32px">
    <a href="https://app.neverranked.com/domain/${escEmail(data.clientSlug)}" style="display:inline-block;padding:14px 32px;background:${brand.color};color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">Full historical chart</a>
  </td></tr>

  <tr><td style="padding:24px 0;border-top:1px solid #2a2a2a">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#555;line-height:1.6">${footerLine}<br>Sent once a year, on January 1st.</div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      await logEmailDelivery(env, { email: to, type: "annual_recap", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }
    await logEmailDelivery(env, { email: to, type: "annual_recap", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    await logEmailDelivery(env, { email: to, type: "annual_recap", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dormancy check-in (engagement-decline churn defense)
// ---------------------------------------------------------------------------

export async function sendDormancyCheckInEmail(
  to: string,
  userName: string | null,
  opts: {
    domain: string;
    clientSlug: string;
    daysSinceLogin: number;
    scoreNow: number | null;
    scoreThen: number | null;
    roadmapDoneSinceLogin: number;
    fixesShippedSinceLogin: number;
  },
  env: Env,
  agency?: Agency | null,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Dormancy check-in for ${to}: ${opts.domain} (${opts.daysSinceLogin}d)`);
    return true;
  }

  const greeting = userName ? userName.split(" ")[0] : "there";
  const brand = brandFor(agency);
  const subject = `${opts.domain}: what changed while you were away`;
  const scoreLine = opts.scoreNow !== null && opts.scoreThen !== null
    ? (opts.scoreNow > opts.scoreThen
        ? `Score went up ${opts.scoreNow - opts.scoreThen} pts (${opts.scoreThen} -> ${opts.scoreNow})`
        : opts.scoreNow < opts.scoreThen
        ? `Score moved ${opts.scoreNow - opts.scoreThen} pts (${opts.scoreThen} -> ${opts.scoreNow})`
        : `Score steady at ${opts.scoreNow}`)
    : opts.scoreNow !== null ? `Latest score: ${opts.scoreNow}/100` : "No new scan since last login";

  const text = [
    `Hi ${greeting},`,
    ``,
    `Noticed you haven't been by the dashboard in ${opts.daysSinceLogin} days. Quick recap of what NeverRanked did for ${opts.domain} while you were away:`,
    ``,
    `  ${scoreLine}`,
    `  ${opts.roadmapDoneSinceLogin} roadmap item${opts.roadmapDoneSinceLogin === 1 ? "" : "s"} completed`,
    `  ${opts.fixesShippedSinceLogin} schema fix${opts.fixesShippedSinceLogin === 1 ? "" : "es"} pushed live`,
    ``,
    `Worth a look:`,
    `https://app.neverranked.com/domain/${opts.clientSlug}`,
    ``,
    `If something is broken or you don't want these check-ins, just reply.`,
    ``,
    `-- ${brand.name}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${brand.name} <reports@neverranked.com>`,
        to: [to], subject, text,
        html: `
<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;font-size:15px;line-height:1.65;padding:0 20px">
<p style="margin:0 0 20px">Hi ${escEmail(greeting)},</p>
<p style="margin:0 0 20px">Noticed you haven't been by the dashboard in <strong>${opts.daysSinceLogin} days</strong>. Quick recap of what ${escEmail(brand.name)} did for <strong>${escEmail(opts.domain)}</strong> while you were away:</p>
<ul style="margin:0 0 20px;padding-left:20px;color:#333">
  <li style="margin-bottom:6px">${escEmail(scoreLine)}</li>
  <li style="margin-bottom:6px"><strong>${opts.roadmapDoneSinceLogin}</strong> roadmap item${opts.roadmapDoneSinceLogin === 1 ? "" : "s"} completed</li>
  <li style="margin-bottom:6px"><strong>${opts.fixesShippedSinceLogin}</strong> schema fix${opts.fixesShippedSinceLogin === 1 ? "" : "es"} pushed live</li>
</ul>
<div style="margin:24px 0">
  <a href="https://app.neverranked.com/domain/${escEmail(opts.clientSlug)}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:${brand.color};font-family:monospace;font-size:13px;text-decoration:none;letter-spacing:.05em">Open dashboard &rarr;</a>
</div>
<p style="margin:0 0 6px;color:#888;font-size:13px">If something is broken or you don't want these check-ins, just reply.</p>
<p style="margin:8px 0 0;color:#888;font-size:13px">${escEmail(brand.name)}</p>
</body></html>`,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      await logEmailDelivery(env, { email: to, type: "dormancy_check_in", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }
    await logEmailDelivery(env, { email: to, type: "dormancy_check_in", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    await logEmailDelivery(env, { email: to, type: "dormancy_check_in", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Activation milestones (the moments worth celebrating)
// ---------------------------------------------------------------------------
//
// Three separate emails for three distinct user-visible wins:
//   1. Snippet detected for the first time          (activation unlocks)
//   2. AEO grade improved                           (visible quality win)
//   3. Roadmap phase completed                      (cumulative effort win)
//
// All three follow the same shape: short, celebratory but not corny,
// agency-branded for Mode-2 clients, link straight to the relevant
// dashboard page. Each fires at most once per (client, milestone)
// guarded by an admin_alerts row.

function milestoneEmailHtml(opts: {
  brand: { name: string; color: string; logo: string | null };
  greeting: string;
  tag: string;             // e.g., "Snippet detected"
  tagColor: string;        // e.g., "#27ae60"
  headline: string;        // big title line
  body: string;            // body paragraph(s)
  ctaLabel: string;
  ctaUrl: string;
  footerLine: string;
}): string {
  const headerHtml = opts.brand.logo
    ? `<td><img src="${opts.brand.logo}" alt="${escEmail(opts.brand.name)}" style="max-height:28px;max-width:200px"></td>`
    : `<td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:${opts.brand.color}">${escEmail(opts.brand.name)}</td>`;
  return `
<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212"><tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
  <tr><td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${headerHtml}<td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${opts.tagColor}">${opts.tag}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:36px 0 24px">
    <div style="font-family:Georgia,serif;font-size:16px;color:#fbf8ef;margin-bottom:14px">Hey ${escEmail(opts.greeting)},</div>
    <div style="font-family:Georgia,serif;font-size:18px;color:#fbf8ef;line-height:1.5;margin-bottom:18px">${opts.headline}</div>
    <div style="font-family:Georgia,serif;font-size:14px;color:#b0b0a8;line-height:1.8">${opts.body}</div>
  </td></tr>
  <tr><td align="center" style="padding:8px 0 32px">
    <a href="${escEmail(opts.ctaUrl)}" style="display:inline-block;padding:14px 32px;background:${opts.brand.color};color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">${escEmail(opts.ctaLabel)}</a>
  </td></tr>
  <tr><td style="padding:24px 0;border-top:1px solid #2a2a2a">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#555;line-height:1.6">${opts.footerLine}</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export async function sendSnippetDetectedEmail(
  to: string,
  userName: string | null,
  opts: { domain: string; clientSlug: string; daysSinceDelivery: number },
  env: Env,
  agency?: Agency | null,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Snippet-detected email for ${to}: ${opts.domain}`);
    return true;
  }
  const greeting = userName ? userName.split(" ")[0] : "there";
  const brand = brandFor(agency);
  const subject = `${opts.domain}: snippet is live -- autonomous fixes are turned on`;
  const text = [
    `Hey ${greeting},`,
    ``,
    `Just detected the NeverRanked snippet on ${opts.domain}. The autonomous side of the platform is now turned on.`,
    ``,
    `What changes from here:`,
    `  - Schema fixes the scanner finds will be pushed to ${opts.domain} automatically every week`,
    `  - The roadmap items in the "Handled by NeverRanked" section will now ship without you doing anything`,
    `  - Daily drift checks will alert you if the snippet ever disappears from the site`,
    ``,
    `${opts.daysSinceDelivery > 7 ? `(Took ${opts.daysSinceDelivery} days from when we sent the install instructions -- thanks for getting it across the line.)` : ""}`,
    ``,
    `Dashboard:`,
    `https://app.neverranked.com/domain/${opts.clientSlug}`,
    ``,
    `-- ${brand.name}`,
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${brand.name} <alerts@neverranked.com>`,
        to: [to], subject, text,
        html: milestoneEmailHtml({
          brand, greeting,
          tag: "Snippet live", tagColor: "#27ae60",
          headline: `The snippet is live on <strong style="color:${brand.color}">${escEmail(opts.domain)}</strong>. Autonomous fixes are now turned on.`,
          body: `From here, schema fixes the scanner finds will be pushed to ${escEmail(opts.domain)} automatically every week. Roadmap items in the "Handled by NeverRanked" section will ship without you doing anything. Daily drift checks will catch it if the snippet ever disappears.${opts.daysSinceDelivery > 7 ? `<br><br><em style="color:#888">Took ${opts.daysSinceDelivery} days from delivery -- thanks for getting it across the line.</em>` : ""}`,
          ctaLabel: "Open dashboard", ctaUrl: `https://app.neverranked.com/domain/${opts.clientSlug}`,
          footerLine: `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">${agency ? "Never Ranked" : "NeverRanked"}</a><br>You received this because we detected your install for the first time.`,
        }),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      await logEmailDelivery(env, { email: to, type: "snippet_detected", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }
    await logEmailDelivery(env, { email: to, type: "snippet_detected", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    await logEmailDelivery(env, { email: to, type: "snippet_detected", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

export async function sendGradeUpEmail(
  to: string,
  userName: string | null,
  opts: { domain: string; clientSlug: string; newGrade: string; previousGrade: string; newScore: number },
  env: Env,
  agency?: Agency | null,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Grade-up email for ${to}: ${opts.domain} ${opts.previousGrade}->${opts.newGrade}`);
    return true;
  }
  const greeting = userName ? userName.split(" ")[0] : "there";
  const brand = brandFor(agency);
  const subject = `${opts.domain} just hit grade ${opts.newGrade}`;
  const text = [
    `Hey ${greeting},`,
    ``,
    `${opts.domain} just moved from grade ${opts.previousGrade} to grade ${opts.newGrade} (${opts.newScore}/100).`,
    ``,
    `That's a real category jump in how AI engines perceive the site's authority. Grades aren't fine-grained -- they only move when something material shifts.`,
    ``,
    `Dashboard:`,
    `https://app.neverranked.com/domain/${opts.clientSlug}`,
    ``,
    `-- ${brand.name}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${brand.name} <alerts@neverranked.com>`,
        to: [to], subject, text,
        html: milestoneEmailHtml({
          brand, greeting,
          tag: `Grade ${opts.newGrade}`, tagColor: "#27ae60",
          headline: `<strong style="color:${brand.color}">${escEmail(opts.domain)}</strong> just hit grade <strong style="color:#fbf8ef">${escEmail(opts.newGrade)}</strong>.`,
          body: `Up from grade ${escEmail(opts.previousGrade)}. Latest score: <strong style="color:#fbf8ef">${opts.newScore}/100</strong>.<br><br>That's a real category jump in how AI engines perceive the site's authority. Grades only move when something material shifts.`,
          ctaLabel: "Open dashboard", ctaUrl: `https://app.neverranked.com/domain/${opts.clientSlug}`,
          footerLine: `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">${agency ? "Never Ranked" : "NeverRanked"}</a><br>You received this because your grade improved.`,
        }),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      await logEmailDelivery(env, { email: to, type: "grade_up", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }
    await logEmailDelivery(env, { email: to, type: "grade_up", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    await logEmailDelivery(env, { email: to, type: "grade_up", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

export async function sendPhaseCompleteEmail(
  to: string,
  userName: string | null,
  opts: { domain: string; clientSlug: string; phaseTitle: string; phaseNumber: number; itemsCompleted: number; nextPhaseTitle: string | null },
  env: Env,
  agency?: Agency | null,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Phase-complete email for ${to}: ${opts.domain} phase ${opts.phaseNumber}`);
    return true;
  }
  const greeting = userName ? userName.split(" ")[0] : "there";
  const brand = brandFor(agency);
  const subject = `${opts.domain}: Phase ${opts.phaseNumber} (${opts.phaseTitle}) is complete`;
  const text = [
    `Hey ${greeting},`,
    ``,
    `Phase ${opts.phaseNumber} (${opts.phaseTitle}) is now complete on ${opts.domain}. ${opts.itemsCompleted} item${opts.itemsCompleted === 1 ? "" : "s"} delivered.`,
    ``,
    opts.nextPhaseTitle
      ? `Phase ${opts.phaseNumber + 1} (${opts.nextPhaseTitle}) is unlocked and ready.`
      : `That's the full roadmap. We'll keep monitoring and surface new opportunities as AI engines evolve.`,
    ``,
    `Dashboard:`,
    `https://app.neverranked.com/roadmap/${opts.clientSlug}`,
    ``,
    `-- ${brand.name}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${brand.name} <alerts@neverranked.com>`,
        to: [to], subject, text,
        html: milestoneEmailHtml({
          brand, greeting,
          tag: `Phase ${opts.phaseNumber} complete`, tagColor: brand.color,
          headline: `Phase ${opts.phaseNumber} (<em>${escEmail(opts.phaseTitle)}</em>) is complete on <strong style="color:${brand.color}">${escEmail(opts.domain)}</strong>.`,
          body: `${opts.itemsCompleted} item${opts.itemsCompleted === 1 ? "" : "s"} delivered.<br><br>${opts.nextPhaseTitle ? `Phase ${opts.phaseNumber + 1} (<em>${escEmail(opts.nextPhaseTitle)}</em>) is unlocked and ready.` : `That's the full roadmap. We'll keep monitoring and surface new opportunities as AI engines evolve.`}`,
          ctaLabel: "Open roadmap", ctaUrl: `https://app.neverranked.com/roadmap/${opts.clientSlug}`,
          footerLine: `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">${agency ? "Never Ranked" : "NeverRanked"}</a><br>You received this because a roadmap phase completed.`,
        }),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      await logEmailDelivery(env, { email: to, type: "phase_complete", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }
    await logEmailDelivery(env, { email: to, type: "phase_complete", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    await logEmailDelivery(env, { email: to, type: "phase_complete", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Billing notifications (involuntary churn defense)
// ---------------------------------------------------------------------------

/**
 * Notify the customer when an invoice payment fails. Stripe will retry
 * automatically, but the customer needs to know NOW so they can update
 * their card before the auto-cancel kicks in. Failure-to-notify is the
 * #1 source of involuntary churn.
 */
export async function sendPaymentFailedEmail(
  to: string,
  userName: string | null,
  opts: { amountDueCents: number; nextRetryAt: number | null; portalUrl: string },
  env: Env,
  agency?: Agency | null,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Payment failed email for ${to}: $${(opts.amountDueCents / 100).toFixed(2)}`);
    return true;
  }

  const greeting = userName ? userName.split(" ")[0] : "there";
  const brand = brandFor(agency);
  const amount = `$${(opts.amountDueCents / 100).toFixed(2)}`;
  const retryStr = opts.nextRetryAt
    ? new Date(opts.nextRetryAt * 1000).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "in a few days";

  const subject = `Payment failed -- update your card to keep ${brand.name} active`;
  const text = [
    `Hi ${greeting},`,
    ``,
    `Heads up: the most recent invoice charge of ${amount} didn't go through. This usually means an expired card, an insufficient balance, or the bank flagging the transaction.`,
    ``,
    `Stripe will retry automatically (next attempt: ${retryStr}), but the cleanest fix is to update your payment method now so the retry succeeds:`,
    ``,
    opts.portalUrl,
    ``,
    `If the retry fails too many times your subscription will pause and access will be suspended. We'd much rather catch this now than lose you to a card issue.`,
    ``,
    `Reply if anything is wrong on our end.`,
    ``,
    `-- ${brand.name}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brand.name} <billing@neverranked.com>`,
        to: [to],
        subject,
        text,
        html: `
<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;font-size:15px;line-height:1.65;padding:0 20px">
<p style="margin:0 0 20px">Hi ${escEmail(greeting)},</p>
<p style="margin:0 0 20px">Heads up: the most recent invoice charge of <strong>${amount}</strong> didn't go through. This usually means an expired card, an insufficient balance, or the bank flagging the transaction.</p>
<p style="margin:0 0 20px">Stripe will retry automatically (next attempt: <strong>${escEmail(retryStr)}</strong>), but the cleanest fix is to update your payment method now so the retry succeeds:</p>
<div style="margin:24px 0">
  <a href="${escEmail(opts.portalUrl)}" style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:${brand.color};font-family:monospace;font-size:13px;text-decoration:none;letter-spacing:.05em">Update payment method &rarr;</a>
</div>
<p style="margin:0 0 20px;color:#555">If the retry fails too many times your subscription will pause and access will be suspended. We'd much rather catch this now than lose you to a card issue.</p>
<p style="margin:0 0 20px;color:#555">Reply if anything is wrong on our end.</p>
<p style="margin:0;color:#888;font-size:13px">${escEmail(brand.name)}</p>
</body></html>`,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`Payment-failed email to ${to} failed: ${res.status} ${err}`);
      await logEmailDelivery(env, { email: to, type: "payment_failed", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }
    await logEmailDelivery(env, { email: to, type: "payment_failed", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    console.log(`Payment-failed email to ${to} error: ${e}`);
    await logEmailDelivery(env, { email: to, type: "payment_failed", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

/**
 * 30-day warning before a card on file expires. Stripe doesn't email
 * the customer about this; without this, they get caught off guard
 * when the next charge fails.
 */
export async function sendCardExpiringEmail(
  to: string,
  userName: string | null,
  opts: { last4: string; expMonth: number; expYear: number; portalUrl: string },
  env: Env,
  agency?: Agency | null,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Card-expiring email for ${to}: ending ${opts.last4}, ${opts.expMonth}/${opts.expYear}`);
    return true;
  }

  const greeting = userName ? userName.split(" ")[0] : "there";
  const brand = brandFor(agency);
  const expLabel = `${String(opts.expMonth).padStart(2, "0")}/${String(opts.expYear).slice(-2)}`;
  const subject = `Your card on file expires soon (${expLabel})`;

  const text = [
    `Hi ${greeting},`,
    ``,
    `Quick heads up: the card you have on file (ending ${opts.last4}) expires ${expLabel}. To avoid your next ${brand.name} renewal failing, update it now:`,
    ``,
    opts.portalUrl,
    ``,
    `Takes 30 seconds. We'd rather catch this before the renewal than after.`,
    ``,
    `-- ${brand.name}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brand.name} <billing@neverranked.com>`,
        to: [to],
        subject,
        text,
        html: `
<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;font-size:15px;line-height:1.65;padding:0 20px">
<p style="margin:0 0 20px">Hi ${escEmail(greeting)},</p>
<p style="margin:0 0 20px">Quick heads up: the card you have on file (ending <strong>${escEmail(opts.last4)}</strong>) expires <strong>${escEmail(expLabel)}</strong>. To avoid your next ${escEmail(brand.name)} renewal failing, update it now:</p>
<div style="margin:24px 0">
  <a href="${escEmail(opts.portalUrl)}" style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:${brand.color};font-family:monospace;font-size:13px;text-decoration:none;letter-spacing:.05em">Update card on file &rarr;</a>
</div>
<p style="margin:0 0 20px;color:#555">Takes 30 seconds. We'd rather catch this before the renewal than after.</p>
<p style="margin:0;color:#888;font-size:13px">${escEmail(brand.name)}</p>
</body></html>`,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`Card-expiring email to ${to} failed: ${res.status} ${err}`);
      await logEmailDelivery(env, { email: to, type: "card_expiring", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }
    await logEmailDelivery(env, { email: to, type: "card_expiring", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    console.log(`Card-expiring email to ${to} error: ${e}`);
    await logEmailDelivery(env, { email: to, type: "card_expiring", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Citation lost (mirror of first-citation -- the warning side)
// ---------------------------------------------------------------------------

/**
 * Sent when a client who had AI citations last week suddenly has zero
 * this week. The compounding work the platform sells depends on
 * citations holding -- losing them is a real business signal worth
 * flagging immediately, not waiting for the weekly digest.
 *
 * Different tone from regression alert (which is about score). This
 * one is about the AI engines forgetting you. Frames the drop as
 * something to investigate, not catastrophize.
 */
export async function sendCitationLostEmail(
  to: string,
  userName: string | null,
  opts: {
    domain: string;
    clientSlug: string;
    previousCitations: number;
    previousQueries: number;
    daysBetween: number;
  },
  env: Env,
  agency?: Agency | null,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Citation-lost email for ${to}: ${opts.domain}`);
    return true;
  }

  const greeting = userName ? userName.split(" ")[0] : "there";
  const brand = brandFor(agency);
  const subject = `${opts.domain}: AI citations dropped to zero this week`;

  const text = [
    `Hey ${greeting},`,
    ``,
    `Heads up: ${opts.domain} had ${opts.previousCitations} AI engine citations last week (out of ${opts.previousQueries} tracked queries) but zero this week.`,
    ``,
    `What this usually means:`,
    `  - The page that was being cited changed substantially (new copy, new layout, removed schema)`,
    `  - A competitor moved up and is now being cited instead`,
    `  - The AI engines retrained and the new model has a different preference`,
    `  - Less commonly: a technical issue (snippet removed, page returning errors, robots.txt change)`,
    ``,
    `What to do:`,
    `  1. Check the citation page in the dashboard to see which keywords lost their cites`,
    `  2. Re-run a scan to confirm the page is still healthy from a technical standpoint`,
    `  3. If the page hasn't changed but citations dropped, this is competitive movement -- ` +
      `look at what cited competitors are doing differently`,
    ``,
    `Citations dashboard:`,
    `https://app.neverranked.com/citations/${opts.clientSlug}`,
    ``,
    `Domain dashboard:`,
    `https://app.neverranked.com/domain/${opts.clientSlug}`,
    ``,
    `-- ${brand.name}`,
  ].join("\n");

  const headerHtml = brand.logo
    ? `<td><img src="${brand.logo}" alt="${escEmail(brand.name)}" style="max-height:28px;max-width:200px"></td>`
    : `<td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:${brand.color}">${escEmail(brand.name)}</td>`;
  const footerLine = agency
    ? `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">Never Ranked</a>`
    : `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${brand.name} <alerts@neverranked.com>`,
        to: [to],
        subject,
        text,
        html: `
<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212"><tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <tr><td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${headerHtml}<td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#c0392b">Citations dropped</td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:32px 0 24px">
    <div style="font-family:Georgia,serif;font-size:16px;color:#fbf8ef;margin-bottom:14px">Hey ${escEmail(greeting)},</div>
    <div style="font-family:Georgia,serif;font-size:18px;color:#fbf8ef;line-height:1.5;margin-bottom:8px">
      <strong style="color:${brand.color}">${escEmail(opts.domain)}</strong> had <strong>${opts.previousCitations}</strong> AI engine citation${opts.previousCitations === 1 ? "" : "s"} last week. This week: <strong style="color:#c0392b">zero</strong>.
    </div>
  </td></tr>

  <tr><td style="padding:0 0 16px">
    <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:10px">What this usually means</div>
    <ul style="margin:0 0 16px;padding-left:20px;font-family:Georgia,serif;font-size:14px;color:#b0b0a8;line-height:1.8">
      <li>The page that was being cited changed substantially (new copy, layout, removed schema)</li>
      <li>A competitor moved up and is now being cited instead</li>
      <li>AI engines retrained and the new model has different preferences</li>
      <li>Less commonly: a technical issue (snippet removed, errors, robots.txt change)</li>
    </ul>
  </td></tr>

  <tr><td style="padding:0 0 16px">
    <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:10px">What to do</div>
    <ol style="margin:0 0 16px;padding-left:20px;font-family:Georgia,serif;font-size:14px;color:#b0b0a8;line-height:1.8">
      <li>Check which keywords lost their cites in the citations dashboard</li>
      <li>Re-run a scan to confirm the page is still healthy</li>
      <li>If the page hasn't changed, this is competitive movement -- look at what cited competitors are doing differently</li>
    </ol>
  </td></tr>

  <tr><td align="center" style="padding:8px 0 32px">
    <a href="https://app.neverranked.com/citations/${escEmail(opts.clientSlug)}" style="display:inline-block;padding:14px 32px;background:${brand.color};color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">Open citations</a>
  </td></tr>

  <tr><td style="padding:24px 0;border-top:1px solid #2a2a2a">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#555;line-height:1.6">${footerLine}<br>You received this because we detected a citation drop on a domain you follow.</div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      await logEmailDelivery(env, { email: to, type: "citation_lost", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }
    await logEmailDelivery(env, { email: to, type: "citation_lost", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    await logEmailDelivery(env, { email: to, type: "citation_lost", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Monthly recap
// ---------------------------------------------------------------------------

export interface MonthlyRecapData {
  domain: string;
  clientSlug: string;
  monthLabel: string;          // e.g., "March 2026"
  scoreNow: number | null;
  scoreThen: number | null;    // ~30d ago, null if no prior scan
  scoreDelta: number | null;
  citationShareNow: number | null;
  citationShareThen: number | null;
  citationsGainedThisMonth: number;  // newly cited keywords (rough)
  roadmapCompleted: number;
  schemaFixesShipped: number;
  newCitationKeywordsCount: number;  // cumulative citation queries we now hit
}

export async function sendMonthlyRecapEmail(
  to: string,
  userName: string | null,
  data: MonthlyRecapData,
  env: Env,
  agency?: Agency | null,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Monthly recap for ${to}: ${data.domain} ${data.monthLabel}`);
    return true;
  }

  const greeting = userName ? userName.split(" ")[0] : "there";
  const brand = brandFor(agency);
  const subject = data.scoreDelta && data.scoreDelta > 0
    ? `${data.domain}: AEO recap for ${data.monthLabel} (+${data.scoreDelta} pts)`
    : `${data.domain}: AEO recap for ${data.monthLabel}`;

  const headerHtml = brand.logo
    ? `<td><img src="${brand.logo}" alt="${escEmail(brand.name)}" style="max-height:28px;max-width:200px"></td>`
    : `<td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:${brand.color}">${escEmail(brand.name)}</td>`;
  const footerLine = agency
    ? `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">Never Ranked</a>`
    : `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a>`;

  const scoreLine = data.scoreNow !== null
    ? (data.scoreDelta !== null
        ? `${data.scoreNow}/100 (${data.scoreDelta > 0 ? "+" : ""}${data.scoreDelta} from last month's ${data.scoreThen})`
        : `${data.scoreNow}/100 (first month, no comparison yet)`)
    : "no scan recorded this month";

  const citationLine = data.citationShareNow !== null
    ? `${(data.citationShareNow * 100).toFixed(0)}% citation share`
      + (data.citationShareThen !== null
        ? ` (was ${(data.citationShareThen * 100).toFixed(0)}% last month)`
        : ` (first month tracked)`)
    : "no citation data yet";

  const text = [
    `Hey ${greeting},`,
    ``,
    `Here's the ${data.monthLabel} recap for ${data.domain}.`,
    ``,
    `AEO score: ${scoreLine}`,
    `Citation share: ${citationLine}`,
    `Roadmap items completed this month: ${data.roadmapCompleted}`,
    `Schema fixes pushed live by NeverRanked: ${data.schemaFixesShipped}`,
    ``,
    `Full breakdown and historical chart:`,
    `https://app.neverranked.com/domain/${data.clientSlug}`,
    ``,
    `-- ${brand.name}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brand.name} <reports@neverranked.com>`,
        to: [to],
        subject,
        text,
        html: `
<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212"><tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <tr><td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${headerHtml}<td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888">Monthly recap</td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:32px 0 24px">
    <div style="font-family:Georgia,serif;font-size:16px;color:#fbf8ef;margin-bottom:8px">Hey ${escEmail(greeting)},</div>
    <div style="font-family:Georgia,serif;font-size:14px;color:#888888;line-height:1.6">Here's the <strong style="color:#fbf8ef">${escEmail(data.monthLabel)}</strong> recap for <strong style="color:#fbf8ef">${escEmail(data.domain)}</strong>.</div>
  </td></tr>

  <tr><td style="padding:0 0 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 8px">
      <tr><td style="padding:18px 22px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
        <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:6px">AEO Score</div>
        <div style="font-family:Georgia,serif;font-size:18px;color:#fbf8ef">${escEmail(scoreLine)}</div>
      </td></tr>
      <tr><td style="padding:18px 22px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
        <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:6px">Citation share</div>
        <div style="font-family:Georgia,serif;font-size:18px;color:#fbf8ef">${escEmail(citationLine)}</div>
      </td></tr>
      <tr><td style="padding:18px 22px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
        <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:6px">Work shipped</div>
        <div style="font-family:Georgia,serif;font-size:14px;color:#b0b0a8;line-height:1.8">
          <strong style="color:#fbf8ef">${data.roadmapCompleted}</strong> roadmap item${data.roadmapCompleted === 1 ? "" : "s"} completed<br>
          <strong style="color:#fbf8ef">${data.schemaFixesShipped}</strong> schema fix${data.schemaFixesShipped === 1 ? "" : "es"} pushed live by NeverRanked
        </div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td align="center" style="padding:24px 0 32px">
    <a href="https://app.neverranked.com/domain/${escEmail(data.clientSlug)}" style="display:inline-block;padding:14px 32px;background:${brand.color};color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">Full dashboard</a>
  </td></tr>

  <tr><td style="padding:24px 0;border-top:1px solid #2a2a2a">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#555;line-height:1.6">
      ${footerLine}<br>
      Sent on the 1st of every month. Reply to opt out.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`Monthly recap to ${to} failed: ${res.status} ${err}`);
      await logEmailDelivery(env, { email: to, type: "monthly_recap", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }
    console.log(`Monthly recap sent to ${to} for ${data.clientSlug}`);
    await logEmailDelivery(env, { email: to, type: "monthly_recap", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    console.log(`Monthly recap to ${to} error: ${e}`);
    await logEmailDelivery(env, { email: to, type: "monthly_recap", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

// ---------------------------------------------------------------------------
// First-citation celebration
// ---------------------------------------------------------------------------

/**
 * The first time the citation tracker detects ANY AI engine citing
 * this client for ANY tracked keyword, fire a celebration email.
 * This is the dopamine-hit moment that anchors NeverRanked's value
 * for the user. Without it the win arrives silently inside a weekly
 * snapshot and never registers as a thing to remember.
 *
 * Sent to all client-role + admin-role users bound to this client_slug,
 * plus the agency contact when agency-owned. Branded as the agency
 * if Mode-2 client_access; otherwise NeverRanked.
 */
export async function sendFirstCitationEmail(
  to: string,
  userName: string | null,
  opts: {
    domain: string;
    clientSlug: string;
    engineName: string;       // e.g., "ChatGPT"
    keyword: string;
    citationsThisRun: number;
    totalQueries: number;
  },
  env: Env,
  agency?: Agency | null,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] First-citation for ${to}: ${opts.domain} cited by ${opts.engineName} for "${opts.keyword}"`);
    return true;
  }

  const greeting = userName ? userName.split(" ")[0] : "there";
  const brand = brandFor(agency);
  const subject = `${opts.domain} just got cited by ${opts.engineName} for the first time`;

  const headerHtml = brand.logo
    ? `<td><img src="${brand.logo}" alt="${escEmail(brand.name)}" style="max-height:28px;max-width:200px"></td>`
    : `<td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:${brand.color}">${escEmail(brand.name)}</td>`;
  const footerLine = agency
    ? `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">Never Ranked</a>`
    : `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a>`;

  const text = [
    `Hey ${greeting},`,
    ``,
    `Real signal moment to share: ${opts.domain} just got cited by an AI engine for the first time.`,
    ``,
    `What we detected:`,
    `  Engine: ${opts.engineName}`,
    `  Query:  "${opts.keyword}"`,
    `  This week's cited / total queries: ${opts.citationsThisRun} / ${opts.totalQueries}`,
    ``,
    `This is the thing that's hard to fake and hard to engineer. It only happens when AI engines decide -- on their own -- that ${opts.domain} is a credible source for that question. The schema work, the content work, the technical work -- this is what it adds up to.`,
    ``,
    `You can see the full citation breakdown and which engines are picking you up here:`,
    `https://app.neverranked.com/citations/${opts.clientSlug}`,
    ``,
    `Now we double down. The more queries you're cited for, the more compounding momentum.`,
    ``,
    `-- ${brand.name}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brand.name} <alerts@neverranked.com>`,
        to: [to],
        subject,
        text,
        html: `
<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
  <tr><td align="center" style="padding:32px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

      <tr><td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${headerHtml}
            <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#27ae60">First citation</td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:36px 0 12px">
        <div style="font-family:Georgia,serif;font-size:16px;color:#fbf8ef;margin-bottom:14px">Hey ${escEmail(greeting)},</div>
        <div style="font-family:Georgia,serif;font-size:18px;color:#fbf8ef;line-height:1.5;margin-bottom:8px">
          <strong style="color:${brand.color}">${escEmail(opts.domain)}</strong> just got cited by <strong style="color:#fbf8ef">${escEmail(opts.engineName)}</strong> for the first time.
        </div>
      </td></tr>

      <tr><td style="padding:0 0 24px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:24px;background:#1c1c1c;border:1px solid #27ae60;border-radius:4px">
            <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:14px">What we detected</div>
            <div style="font-family:Georgia,serif;font-size:14px;color:#b0b0a8;line-height:1.7">
              <div><strong style="color:#fbf8ef">Engine:</strong> ${escEmail(opts.engineName)}</div>
              <div><strong style="color:#fbf8ef">Query:</strong> "${escEmail(opts.keyword)}"</div>
              <div><strong style="color:#fbf8ef">This week:</strong> ${opts.citationsThisRun} cited of ${opts.totalQueries} queries</div>
            </div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 0 24px">
        <div style="font-family:Georgia,serif;font-size:14px;color:#b0b0a8;line-height:1.8">
          This is the thing that's hard to fake and hard to engineer. It only happens when AI engines decide -- on their own -- that ${escEmail(opts.domain)} is a credible source for that question. The schema work, the content work, the technical work -- this is what it adds up to.
        </div>
      </td></tr>

      <tr><td align="center" style="padding:8px 0 32px">
        <a href="https://app.neverranked.com/citations/${escEmail(opts.clientSlug)}" style="display:inline-block;padding:14px 32px;background:${brand.color};color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">See full citation breakdown</a>
      </td></tr>

      <tr><td style="padding:0 0 32px">
        <div style="font-family:Georgia,serif;font-size:13px;color:#888888;line-height:1.7;text-align:center">
          Now we double down. The more queries you're cited for, the more compounding momentum.
        </div>
      </td></tr>

      <tr><td style="padding:24px 0;border-top:1px solid #2a2a2a">
        <div style="font-family:'Courier New',monospace;font-size:10px;color:#555555;line-height:1.6">
          ${footerLine}<br>
          You received this because we detected your site's first AI citation.
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`First-citation email to ${to} failed: ${res.status} ${err}`);
      await logEmailDelivery(env, { email: to, type: "first_citation", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id });
      return false;
    }
    console.log(`First-citation email sent to ${to} for ${opts.clientSlug}`);
    await logEmailDelivery(env, { email: to, type: "first_citation", status: "queued", statusCode: res.status, agencyId: agency?.id });
    return true;
  } catch (e) {
    console.log(`First-citation email to ${to} error: ${e}`);
    await logEmailDelivery(env, { email: to, type: "first_citation", status: "failed", errorMessage: String(e), agencyId: agency?.id });
    return false;
  }
}

/** Send a regression alert for a single domain */
export async function sendRegressionAlert(
  to: string,
  userName: string | null,
  domain: string,
  domainId: number,
  newScore: number,
  oldScore: number,
  newGrade: string,
  latest: ScanResult,
  env: Env,
  agency?: Agency | null
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Regression alert for ${to}: ${domain} ${oldScore} -> ${newScore}`);
    return true;
  }

  const drop = oldScore - newScore;
  const brand = brandFor(agency);
  const subject = `Alert: ${domain} AEO score dropped ${drop} pts (${newScore}/100)`;
  const emailHtml = buildRegressionHtml(userName, domain, domainId, newScore, oldScore, newGrade, latest, agency);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brand.name} <alerts@neverranked.com>`,
        to: [to],
        subject,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`Regression alert to ${to} failed: ${res.status} ${err}`);
      await logEmailDelivery(env, { email: to, type: "regression", status: "failed", statusCode: res.status, errorMessage: err, agencyId: agency?.id, targetId: domainId });
      return false;
    }

    console.log(`Regression alert sent to ${to}: ${domain} dropped ${drop} pts`);
    await logEmailDelivery(env, { email: to, type: "regression", status: "queued", statusCode: res.status, agencyId: agency?.id, targetId: domainId });
    return true;
  } catch (e) {
    console.log(`Regression alert to ${to} error: ${e}`);
    await logEmailDelivery(env, { email: to, type: "regression", status: "failed", errorMessage: String(e), agencyId: agency?.id, targetId: domainId });
    return false;
  }
}

function buildRegressionHtml(
  userName: string | null,
  domain: string,
  domainId: number,
  newScore: number,
  oldScore: number,
  newGrade: string,
  latest: ScanResult,
  agency?: Agency | null
): string {
  const greeting = userName ? userName.split(" ")[0] : "there";
  const drop = oldScore - newScore;
  const narrative = generateNarrative(domain, latest, null);
  const topAction = narrative.actions[0] || null;
  const redFlags: string[] = JSON.parse(latest.red_flags);
  const newRedFlags = redFlags.slice(0, 3);

  const brand = brandFor(agency);
  const headerCellHtml = brand.logo
    ? `<td><img src="${brand.logo}" alt="${escEmail(brand.name)}" style="max-height:28px;max-width:200px"></td>`
    : `<td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:${brand.color}">${escEmail(brand.name)}</td>`;
  const teamLine = agency
    ? `Your ${escEmail(brand.name)} team is monitoring this.`
    : `Your NeverRanked team is monitoring this.`;
  const footerLine = agency
    ? `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">Never Ranked</a>`
    : `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a>`;

  const gradeColor = newGrade === "A" ? "#27ae60"
    : newGrade === "B" ? "#e8c767"
    : newGrade === "C" ? "#e67e22"
    : "#c0392b";

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Score Drop Alert</title>
</head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${headerCellHtml}
                <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#c0392b">Score Alert</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:32px 0 8px">
            <div style="font-family:Georgia,serif;font-size:16px;color:#fbf8ef;margin-bottom:12px">Hey ${escEmail(greeting)},</div>
            <div style="font-family:Georgia,serif;font-size:14px;color:#b0b0a8;line-height:1.6">We detected a score drop on <strong style="color:#fbf8ef">${escEmail(domain)}</strong>. Here's what we found.</div>
          </td>
        </tr>

        <!-- Score change -->
        <tr>
          <td style="padding:24px 0">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:24px;background:#1c1c1c;border:1px solid #c0392b;border-radius:4px">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="60" style="vertical-align:middle">
                        <div style="width:52px;height:52px;border-radius:50%;border:2px solid ${gradeColor};text-align:center;line-height:52px;font-family:Georgia,serif;font-size:28px;font-style:italic;color:${gradeColor}">${newGrade}</div>
                      </td>
                      <td style="vertical-align:middle;padding-left:16px">
                        <div style="font-family:'Courier New',monospace;font-size:28px;color:#fbf8ef;letter-spacing:-1px">${newScore}<span style="font-size:14px;color:#888888">/100</span></div>
                        <div style="font-size:13px;color:#c0392b;margin-top:2px">-${drop} pts from ${oldScore}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${newRedFlags.length > 0 ? `
        <!-- Key issues -->
        <tr>
          <td style="padding-bottom:24px">
            <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:12px">Issues detected</div>
            ${newRedFlags.map(f => `
              <div style="padding:10px 16px;margin-bottom:6px;background:#1c1c1c;border-left:3px solid #c0392b;font-family:Georgia,serif;font-size:13px;color:#b0b0a8">${escEmail(f)}</div>
            `).join("")}
          </td>
        </tr>
        ` : ""}

        ${topAction ? `
        <!-- What we recommend -->
        <tr>
          <td style="padding-bottom:24px">
            <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:12px">Recommended action</div>
            <div style="padding:16px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
              <div style="font-family:Georgia,serif;font-size:14px;color:#fbf8ef;margin-bottom:6px">${escEmail(topAction.action)}</div>
              <div style="font-family:Georgia,serif;font-size:12px;color:#888888;line-height:1.6">${escEmail(topAction.reason)}</div>
            </div>
          </td>
        </tr>
        ` : ""}

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:8px 0 32px">
            <a href="https://app.neverranked.com/domain/${domainId}" style="display:inline-block;padding:14px 32px;background:${brand.color};color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">View full report</a>
          </td>
        </tr>

        <!-- Reassurance -->
        <tr>
          <td style="padding:0 0 32px">
            <div style="font-family:Georgia,serif;font-size:13px;color:#888888;line-height:1.7;text-align:center">
              Score fluctuations happen as AI models retrain and sites change.<br>
              ${teamLine}
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0;border-top:1px solid #2a2a2a">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:'Courier New',monospace;font-size:10px;color:#555555;line-height:1.6">
                  ${footerLine}<br>
                  You received this because your AEO score changed significantly.
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
  `.trim();
}

/** HTML-escape for email content */
function escEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCitationBlock(cd: CitationDigestData): string {
  const sharePct = (cd.citationShare * 100).toFixed(0);
  const prevPct = cd.previousShare !== null ? (cd.previousShare * 100).toFixed(0) : null;

  let deltaHtml = "";
  if (prevPct !== null) {
    const diff = Number(sharePct) - Number(prevPct);
    if (diff > 0) {
      deltaHtml = `<span style="color:#27ae60;font-size:13px;margin-left:8px">+${diff} pts</span>`;
    } else if (diff < 0) {
      deltaHtml = `<span style="color:#c0392b;font-size:13px;margin-left:8px">${diff} pts</span>`;
    } else {
      deltaHtml = `<span style="color:#888888;font-size:13px;margin-left:8px">no change</span>`;
    }
  }

  const competitorRows = cd.topCompetitors.slice(0, 3).map(c =>
    `<div style="padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:13px;color:#b0b0a8;display:flex;justify-content:space-between">
      <span>${escEmail(c.name)}</span>
      <span style="color:#888888">${c.count} mentions</span>
    </div>`
  ).join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
      <tr>
        <td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#e8c767;margin-bottom:16px">AI Citation Share</div>

          <div style="font-family:'Courier New',monospace;font-size:36px;color:#fbf8ef;letter-spacing:-1px">
            ${sharePct}<span style="font-size:16px;color:#888888">%</span>${deltaHtml}
          </div>
          <div style="font-family:Georgia,serif;font-size:13px;color:#888888;margin-top:4px;margin-bottom:16px">
            Cited in ${cd.keywordsWon} of ${cd.totalKeywords} tracked queries
          </div>

          ${cd.topCompetitors.length > 0 ? `
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:8px;margin-top:16px;padding-top:16px;border-top:1px solid #2a2a2a">Top competitors</div>
          ${competitorRows}
          ` : ""}
        </td>
      </tr>
    </table>
  `;
}

function buildGscBlock(gsc: GscDigestData): string {
  let clicksDelta = "";
  if (gsc.prevClicks !== null) {
    const diff = gsc.clicks - gsc.prevClicks;
    if (diff > 0) clicksDelta = '<span style="color:#27ae60;font-size:13px;margin-left:8px">+' + diff + '</span>';
    else if (diff < 0) clicksDelta = '<span style="color:#c0392b;font-size:13px;margin-left:8px">' + diff + '</span>';
  }

  let impDelta = "";
  if (gsc.prevImpressions !== null) {
    const diff = gsc.impressions - gsc.prevImpressions;
    if (diff > 0) impDelta = '<span style="color:#27ae60;font-size:13px;margin-left:8px">+' + diff.toLocaleString() + '</span>';
    else if (diff < 0) impDelta = '<span style="color:#c0392b;font-size:13px;margin-left:8px">' + diff.toLocaleString() + '</span>';
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
      <tr>
        <td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#e8c767;margin-bottom:16px">Google Search Performance</div>
          <div style="font-family:Georgia,serif;font-size:12px;color:#555555;margin-bottom:16px">${escEmail(gsc.dateRange)}</div>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="50%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Clicks</div>
                <div style="font-family:'Courier New',monospace;font-size:28px;color:#fbf8ef">${gsc.clicks.toLocaleString()}${clicksDelta}</div>
              </td>
              <td width="50%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Impressions</div>
                <div style="font-family:'Courier New',monospace;font-size:28px;color:#fbf8ef">${gsc.impressions.toLocaleString()}${impDelta}</div>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px">
            <tr>
              <td width="50%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">CTR</div>
                <div style="font-family:'Courier New',monospace;font-size:18px;color:#fbf8ef">${(gsc.ctr * 100).toFixed(1)}%</div>
              </td>
              <td width="50%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Avg Position</div>
                <div style="font-family:'Courier New',monospace;font-size:18px;color:#fbf8ef">${gsc.position.toFixed(1)}</div>
              </td>
            </tr>
          </table>

          ${gsc.topQuery ? `
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid #2a2a2a">
            <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Top query</div>
            <div style="font-family:Georgia,serif;font-size:14px;color:#b0b0a8;font-style:italic">${escEmail(gsc.topQuery)}</div>
          </div>
          ` : ""}
        </td>
      </tr>
    </table>
  `;
}

function buildRoadmapBlock(rd: RoadmapDigestData): string {
  const pct = rd.total > 0 ? Math.round((rd.done / rd.total) * 100) : 0;
  const recentList = rd.recentlyCompleted.slice(0, 3).map(t =>
    `<div style="padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:13px;color:#b0b0a8">${escEmail(t)}</div>`
  ).join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
      <tr>
        <td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#e8c767;margin-bottom:16px">Roadmap Progress</div>

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px">
            <tr>
              <td width="33%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Complete</div>
                <div style="font-family:'Courier New',monospace;font-size:24px;color:#27ae60">${rd.done}<span style="font-size:12px;color:#888888">/${rd.total}</span></div>
              </td>
              <td width="33%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">In Progress</div>
                <div style="font-family:'Courier New',monospace;font-size:24px;color:#e8c767">${rd.inProgress}</div>
              </td>
              <td width="34%" style="vertical-align:top">
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:4px">Progress</div>
                <div style="font-family:'Courier New',monospace;font-size:24px;color:#fbf8ef">${pct}<span style="font-size:12px;color:#888888">%</span></div>
              </td>
            </tr>
          </table>

          <!-- Progress bar -->
          <div style="height:6px;background:#2a2a2a;border-radius:3px;overflow:hidden;margin-bottom:${recentList ? '16' : '0'}px">
            <div style="height:100%;width:${pct}%;background:#27ae60;border-radius:3px"></div>
          </div>

          ${rd.recentlyCompleted.length > 0 ? `
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:8px;margin-top:16px;padding-top:16px;border-top:1px solid #2a2a2a">Completed this week</div>
          ${recentList}
          ` : ""}
          ${rd.gapResolved && rd.gapResolved.length > 0 ? `
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#27ae60;margin-bottom:8px;margin-top:16px;padding-top:16px;border-top:1px solid #2a2a2a">Citation gap closed this week</div>
          ${rd.gapResolved.slice(0, 3).map(t => `<div style="padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:13px;color:#b0b0a8">${escEmail(t)}</div>`).join("")}
          ` : ""}
          ${rd.newGapItems && rd.newGapItems.length > 0 ? `
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#e8c767;margin-bottom:8px;margin-top:16px;padding-top:16px;border-top:1px solid #2a2a2a">New gap-driven items this week</div>
          ${rd.newGapItems.slice(0, 3).map(t => `<div style="padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:13px;color:#b0b0a8">${escEmail(t)}</div>`).join("")}
          <div style="font-size:11px;color:#888888;margin-top:8px;line-height:1.6">Each item is backed by AI engine citation evidence for your tracked queries. Open your roadmap for the full action briefs.</div>
          ` : ""}
        </td>
      </tr>
    </table>
  `;
}

function buildDigestHtml(userName: string | null, digests: DigestData[], citationData?: Map<string, CitationDigestData>, gscData?: Map<string, GscDigestData>, roadmapData?: Map<string, RoadmapDigestData>, unsubToken?: string, agency?: Agency | null, stateOfAeo?: StateOfAeoLatest | null, eventsByClient?: Map<string, DigestEvent[]>): string {
  const brand = brandFor(agency);
  const headerCellHtml = brand.logo
    ? `<td><img src="${brand.logo}" alt="${escEmail(brand.name)}" style="max-height:28px;max-width:200px"></td>`
    : `<td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:${brand.color}">${escEmail(brand.name)}</td>`;
  const ctaColor = brand.color;
  const footerLine = agency
    ? `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">Never Ranked</a>`
    : `Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a>`;
  const greeting = userName ? userName.split(" ")[0] : "there";
  const scanDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const domainBlocks = digests.map(d => {
    const narrative = generateNarrative(d.domain, d.latest, d.previous);
    const diff = d.previous && !d.previous.error
      ? d.latest.aeo_score - d.previous.aeo_score
      : null;

    const gradeColor = d.latest.grade === "A" ? "#27ae60"
      : d.latest.grade === "B" ? "#e8c767"
      : d.latest.grade === "C" ? "#e67e22"
      : "#c0392b";

    let deltaText = "";
    let deltaColor = "#888888";
    if (diff !== null) {
      if (diff > 0) { deltaText = `+${diff} pts`; deltaColor = "#27ae60"; }
      else if (diff < 0) { deltaText = `${diff} pts`; deltaColor = "#c0392b"; }
      else { deltaText = "no change"; deltaColor = "#888888"; }
    }

    const topAction = narrative.actions[0] || null;

    return `
      <!-- Domain block -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
        <tr>
          <td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
            <!-- Domain name -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Georgia,serif;font-size:20px;font-style:italic;color:#fbf8ef;padding-bottom:16px">${escEmail(d.domain)}</td>
              </tr>
            </table>

            <!-- Score row -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px">
              <tr>
                <td width="60" style="vertical-align:middle">
                  <div style="width:52px;height:52px;border-radius:50%;border:2px solid ${gradeColor};text-align:center;line-height:52px;font-family:Georgia,serif;font-size:28px;font-style:italic;color:${gradeColor}">${d.latest.grade}</div>
                </td>
                <td style="vertical-align:middle;padding-left:16px">
                  <div style="font-family:'Courier New',monospace;font-size:28px;color:#fbf8ef;letter-spacing:-1px">${d.latest.aeo_score}<span style="font-size:14px;color:#888888">/100</span></div>
                  ${deltaText ? `<div style="font-size:13px;color:${deltaColor};margin-top:2px">${deltaText}</div>` : ""}
                </td>
              </tr>
            </table>

            <!-- Summary -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:${topAction ? '16' : '0'}px">
              <tr>
                <td style="font-family:Georgia,serif;font-size:14px;line-height:1.7;color:#b0b0a8;padding:16px;background:#171717;border-radius:4px">
                  ${escEmail(narrative.summary)}
                </td>
              </tr>
            </table>

            ${topAction ? `
            <!-- Top action -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:12px 16px;border-left:3px solid ${topAction.impact === 'high' ? '#c0392b' : topAction.impact === 'medium' ? '#e8c767' : '#888888'};font-size:13px;color:#b0b0a8;font-family:Georgia,serif">
                  <span style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888">Next step: </span><br>
                  <span style="color:#fbf8ef">${escEmail(topAction.action)}</span>
                </td>
              </tr>
            </table>
            ` : ""}
          </td>
        </tr>
      </table>
    `;
  }).join("");

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Weekly AEO Digest</title>
</head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">

<!-- Wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
  <tr>
    <td align="center" style="padding:32px 16px">

      <!-- Container -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${headerCellHtml}
                <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888888">Weekly Digest</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:32px 0 24px">
            <div style="font-family:Georgia,serif;font-size:16px;color:#fbf8ef;margin-bottom:8px">Hey ${escEmail(greeting)},</div>
            <div style="font-family:Georgia,serif;font-size:14px;color:#888888;line-height:1.6">Here's your weekly AEO scan from ${scanDate}.</div>
          </td>
        </tr>

        <!-- This week's highlights: events that used to fire their own
             dedicated emails (citation gained / lost, grade up,
             snippet detected, regression, phase complete, etc.) now
             roll up into one section per digest. Respects the inbox. -->
        ${(() => {
          if (!eventsByClient || eventsByClient.size === 0) return "";
          const slugsSeen = new Set<string>();
          const sections: string[] = [];
          for (const d of digests) {
            if (slugsSeen.has(d.clientSlug)) continue;
            slugsSeen.add(d.clientSlug);
            const evs = eventsByClient.get(d.clientSlug);
            if (!evs || evs.length === 0) continue;
            const items = evs.slice(0, 8).map((e) => {
              const accent = e.severity === "win" ? "#7fc99a" : e.severity === "concern" ? "#dc6c6c" : "#bfa04d";
              return `<tr><td style="padding:10px 0;border-bottom:1px solid #2a2620">
                <div style="font-family:Georgia,serif;font-size:14px;color:#fbf8ef;margin-bottom:4px"><span style="display:inline-block;width:8px;height:8px;background:${accent};border-radius:50%;margin-right:8px;vertical-align:middle"></span>${escEmail(e.title)}</div>
                ${e.body ? `<div style="font-family:Georgia,serif;font-size:13px;color:#888;margin-left:16px;line-height:1.5">${escEmail(e.body)}</div>` : ""}
              </td></tr>`;
            }).join("");
            sections.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 20px">
              <tr><td style="padding:0 0 8px"><div style="font-family:monospace;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#bfa04d">${escEmail(d.domain)} this week</div></td></tr>
              ${items}
            </table>`);
          }
          return sections.length > 0 ? `<tr><td style="padding-bottom:8px">${sections.join("")}</td></tr>` : "";
        })()}

        <!-- Domain blocks -->
        <tr>
          <td>
            ${domainBlocks}
          </td>
        </tr>

        <!-- Citation share blocks -->
        ${(() => {
          if (!citationData || citationData.size === 0) return "";
          const blocks: string[] = [];
          const slugsSeen = new Set<string>();
          for (const d of digests) {
            if (slugsSeen.has(d.clientSlug)) continue;
            slugsSeen.add(d.clientSlug);
            const cd = citationData.get(d.clientSlug);
            if (cd) blocks.push(buildCitationBlock(cd));
          }
          return blocks.length > 0 ? `<tr><td>${blocks.join("")}</td></tr>` : "";
        })()}

        <!-- Google Search Console blocks -->
        ${(() => {
          if (!gscData || gscData.size === 0) return "";
          const blocks: string[] = [];
          const slugsSeen = new Set<string>();
          for (const d of digests) {
            if (slugsSeen.has(d.clientSlug)) continue;
            slugsSeen.add(d.clientSlug);
            const gd = gscData.get(d.clientSlug);
            if (gd) blocks.push(buildGscBlock(gd));
          }
          return blocks.length > 0 ? `<tr><td>${blocks.join("")}</td></tr>` : "";
        })()}

        <!-- Roadmap progress blocks -->
        ${(() => {
          if (!roadmapData || roadmapData.size === 0) return "";
          const blocks: string[] = [];
          const slugsSeen = new Set<string>();
          for (const d of digests) {
            if (slugsSeen.has(d.clientSlug)) continue;
            slugsSeen.add(d.clientSlug);
            const rd = roadmapData.get(d.clientSlug);
            if (rd && rd.total > 0) blocks.push(buildRoadmapBlock(rd));
          }
          return blocks.length > 0 ? `<tr><td>${blocks.join("")}</td></tr>` : "";
        })()}

        <!-- State of AEO industry block (skipped on white-label sends) -->
        ${(() => {
          if (!stateOfAeo || agency) return "";
          const block = buildStateOfAeoBlock(stateOfAeo);
          return block ? `<tr><td>${block}</td></tr>` : "";
        })()}

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:16px 0 32px">
            <a href="https://app.neverranked.com" style="display:inline-block;padding:14px 32px;background:${ctaColor};color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">View dashboard</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0;border-top:1px solid #2a2a2a">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:'Courier New',monospace;font-size:10px;color:#555555;line-height:1.6">
                  ${footerLine}<br>
                  Scans run weekly. Scores reflect AI search engine readiness.${unsubToken ? `<br><a href="https://app.neverranked.com/digest/unsubscribe?token=${unsubToken}" style="color:#555555;text-decoration:underline">Unsubscribe from weekly digests</a>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
  `.trim();
}

// ---------------------------------------------------------------------------
// 2FA state-change notifications
// ---------------------------------------------------------------------------

export type TwoFactorEvent =
  | "enrolled"
  | "disabled_self"
  | "disabled_admin"
  | "recovery_code_used";

export async function sendTwoFactorStateChangeEmail(
  email: string,
  event: TwoFactorEvent,
  env: Env,
  opts: { remainingRecoveryCodes?: number } = {},
): Promise<boolean> {
  const subjectMap: Record<TwoFactorEvent, string> = {
    enrolled: "Two-factor authentication turned on",
    disabled_self: "Two-factor authentication turned off",
    disabled_admin: "Two-factor authentication was reset by an admin",
    recovery_code_used: "A recovery code was used on your account",
  };
  const bodyMap: Record<TwoFactorEvent, string> = {
    enrolled: "You turned on 2FA. You'll be prompted for a 6-digit code the next time you sign in.",
    disabled_self: "You disabled 2FA. Your account is now protected only by magic-link sign-in. If this wasn't you, reply to this email immediately.",
    disabled_admin: "A NeverRanked admin reset 2FA on your account. You should set it up again from Settings. If you did not request this, reply to this email immediately.",
    recovery_code_used: "Someone signed in using one of your 2FA recovery codes. If this wasn't you, reply to this email and we'll lock the account.",
  };
  const remainingLine = event === "recovery_code_used" && typeof opts.remainingRecoveryCodes === "number"
    ? `<p style="margin:0 0 12px;font-size:12px;color:#888">Recovery codes remaining: ${opts.remainingRecoveryCodes}. Generate new ones from Settings if you're running low.</p>`
    : "";

  const subject = subjectMap[event];
  const body = bodyMap[event];
  const when = new Date().toUTCString();

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] 2FA state email to ${email}: ${subject}`);
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
        from: `Never Ranked <security@neverranked.com>`,
        to: [email],
        reply_to: "support@neverranked.com",
        subject,
        text: `${body}\n\nTime: ${when}\n\nIf this wasn't you, reply to this email right away.\n\nNever Ranked`,
        html: `
          <div style="font-family:monospace;font-size:14px;color:#333;max-width:480px;margin:0 auto;padding:40px 20px">
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#1a1a1a">Never Ranked</p>
            <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a">${subject}</p>
            <p style="margin:0 0 16px;line-height:1.6">${body}</p>
            ${remainingLine}
            <p style="margin:24px 0 0;font-size:12px;color:#888">Time: ${when}</p>
            <p style="margin:8px 0 0;font-size:12px;color:#888">If this wasn't you, reply to this email right away.</p>
          </div>
        `,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.log(`2FA state email to ${email} (${event}) failed: ${resp.status} ${errBody}`);
      await logEmailDelivery(env, { email, type: `2fa_${event}`, status: "failed", statusCode: resp.status, errorMessage: errBody });
      return false;
    }

    await logEmailDelivery(env, { email, type: `2fa_${event}`, status: "queued", statusCode: resp.status });
    return true;
  } catch (err) {
    console.error(`2FA state email to ${email} (${event}) error:`, err);
    await logEmailDelivery(env, { email, type: `2fa_${event}`, status: "failed", errorMessage: String(err) });
    return false;
  }
}
