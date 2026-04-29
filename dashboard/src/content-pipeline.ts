/**
 * Content pipeline automation (Phase B + C).
 *
 * Three jobs, all invoked from the daily cron:
 *
 *   runContentPipeline    -- generate drafts due in ~3 days, auto-publish
 *                            approved drafts on their scheduled date,
 *                            send reminder emails to clients with drafts
 *                            awaiting review
 *
 *   runContentOutcomeScan -- weekly, for each recently published piece,
 *                            check if the target keyword has earned new
 *                            citations since publish, record outcome stats
 *
 * Trust window: the first 3 approved drafts for a client require
 * explicit approval. After that, a QA-pass draft auto-approves and
 * auto-publishes on its scheduled date. Any QA-held draft always
 * waits for explicit action regardless of trust state.
 */

import type { Env, ScheduledDraft, ContentDraft, User, Agency } from "./types";
import { generateDraftInVoice, scoreDraftAgainstProfile } from "./voice-engine";
import { runContentQa } from "./content-qa";
import { getConnection, publishDraft } from "./cms";
import { getAgency } from "./agency";
import { logEmailDelivery } from "./email";

const GENERATE_LEAD_DAYS = 3;
const TRUST_WINDOW_APPROVALS = 3;

// ---------- helpers ----------

async function pastTrustWindow(clientSlug: string, env: Env): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM content_drafts WHERE client_slug = ? AND status = 'approved'",
  ).bind(clientSlug).first<{ cnt: number }>();
  return (row?.cnt || 0) >= TRUST_WINDOW_APPROVALS;
}

async function clientContactEmail(clientSlug: string, env: Env): Promise<{ email: string; name: string | null; agency: Agency | null } | null> {
  // Primary client user for this slug. If multiple users exist, prefer
  // the one most recently logged in -- they're the active reviewer.
  const user = await env.DB.prepare(
    `SELECT email, name, agency_id FROM users
       WHERE client_slug = ? AND role = 'client'
       ORDER BY COALESCE(last_login_at, 0) DESC, id DESC LIMIT 1`,
  ).bind(clientSlug).first<{ email: string; name: string | null; agency_id: number | null }>();
  if (!user) return null;
  const agency = user.agency_id ? await getAgency(env, user.agency_id) : null;
  return { email: user.email, name: user.name, agency };
}

// ---------- email helpers ----------

async function sendDraftReadyEmail(clientSlug: string, draftId: number, title: string, env: Env): Promise<void> {
  const contact = await clientContactEmail(clientSlug, env);
  if (!contact) return;
  const reviewUrl = `https://app.neverranked.com/drafts/${encodeURIComponent(clientSlug)}/${draftId}`;
  const brandName = contact.agency?.name || "Never Ranked";

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Draft ready email suppressed: ${contact.email} -> ${reviewUrl}`);
    return;
  }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${brandName} <reports@neverranked.com>`,
        to: [contact.email],
        subject: `Your draft is ready for review: ${title}`,
        text: `Your next content piece is drafted in your voice and ready for review.\n\nTitle: ${title}\n\nReview, edit, or approve it:\n${reviewUrl}\n\n— ${brandName}`,
        html: `
          <div style="font-family:monospace;font-size:14px;color:#333;max-width:520px;margin:0 auto;padding:40px 20px">
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#1a1a1a">${brandName}</p>
            <p style="margin:0 0 16px;color:#1a1a1a">Your next draft is ready.</p>
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:18px;color:#1a1a1a;line-height:1.4">${title}</p>
            <p style="margin:0 0 24px;color:#555;line-height:1.6">Written in your voice and checked by our QA pipeline. You've got a few days before its scheduled ship date to review, edit, or approve.</p>
            <a href="${reviewUrl}" style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:#c9a84c;font-family:monospace;font-size:13px;text-decoration:none;letter-spacing:.05em">Review draft</a>
          </div>
        `,
      }),
    });
    const status = resp.ok ? "queued" : "failed";
    await logEmailDelivery(env, { email: contact.email, type: "draft_ready", status, statusCode: resp.status });
  } catch (err) {
    console.error(`[content-pipeline] draft_ready email error: ${err}`);
  }
}

async function sendContentPublishedEmail(clientSlug: string, title: string, liveUrl: string, env: Env): Promise<void> {
  const contact = await clientContactEmail(clientSlug, env);
  if (!contact) return;
  const brandName = contact.agency?.name || "Never Ranked";
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV] Published email suppressed: ${contact.email} -> ${liveUrl}`);
    return;
  }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${brandName} <reports@neverranked.com>`,
        to: [contact.email],
        subject: `Live: ${title}`,
        text: `Your post is live on your site:\n\n${liveUrl}\n\nWe'll track whether it earns citations or moves your rankings over the next few weeks and report back.\n\n— ${brandName}`,
        html: `
          <div style="font-family:monospace;font-size:14px;color:#333;max-width:520px;margin:0 auto;padding:40px 20px">
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#1a1a1a">${brandName}</p>
            <p style="margin:0 0 12px;color:#1a1a1a;font-weight:500">Live.</p>
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:18px;color:#1a1a1a;line-height:1.4">${title}</p>
            <a href="${liveUrl}" style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:#c9a84c;font-family:monospace;font-size:13px;text-decoration:none;letter-spacing:.05em">View on your site</a>
            <p style="margin:24px 0 0;color:#888;font-size:12px;line-height:1.6">We'll track citation pickups and ranking movement over the next few weeks and surface results on your content calendar.</p>
          </div>
        `,
      }),
    });
    const status = resp.ok ? "queued" : "failed";
    await logEmailDelivery(env, { email: contact.email, type: "content_published", status, statusCode: resp.status });
  } catch (err) {
    console.error(`[content-pipeline] published email error: ${err}`);
  }
}

// ---------- PHASE B: pipeline steps ----------

/**
 * Check whether a client's pipeline is paused. Paused clients have their
 * planned + drafted rows skipped by the cron; ops or the customer un-
 * pauses by approving something or by clearing the flag manually.
 */
async function isClientPaused(clientSlug: string, env: Env): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT pipeline_paused_at FROM client_settings WHERE client_slug = ?",
  ).bind(clientSlug).first<{ pipeline_paused_at: number | null }>();
  return !!(row?.pipeline_paused_at);
}

/**
 * Read the per-client content restrictions (never-say list). Returns
 * raw text; the caller injects it into prompts. Null/empty means no
 * custom restrictions beyond the built-in defaults.
 */
async function getContentRestrictions(clientSlug: string, env: Env): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT content_restrictions FROM client_settings WHERE client_slug = ?",
  ).bind(clientSlug).first<{ content_restrictions: string | null }>();
  const text = row?.content_restrictions?.trim();
  return text ? text : null;
}

/**
 * Generate a draft for a scheduled_drafts row. Creates a content_drafts
 * row, writes the body via the voice engine, scores it, runs the QA
 * pipeline, and links the two. Emails the customer on success.
 */
async function generateForScheduled(item: ScheduledDraft, env: Env): Promise<void> {
  // Re-check it's still planned (concurrency safety).
  const fresh = await env.DB.prepare(
    "SELECT status FROM scheduled_drafts WHERE id = ?",
  ).bind(item.id).first<{ status: string }>();
  if (!fresh || fresh.status !== "planned") return;

  // Skip entirely if the client's pipeline is paused. Row stays
  // 'planned' so it'll resume on the next sweep once unpaused.
  if (await isClientPaused(item.client_slug, env)) {
    console.log(`[content-pipeline] client ${item.client_slug} paused; skipping sched ${item.id}`);
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // Create the content_drafts shell first so if generation fails we
  // can still surface the failure on the detail page.
  const insert = await env.DB.prepare(
    `INSERT INTO content_drafts (client_slug, kind, title, body_markdown, status, created_at, updated_at)
       VALUES (?, ?, ?, '', 'draft', ?, ?)`,
  ).bind(item.client_slug, item.kind, item.title, now, now).run();
  const draftId = (insert.meta.last_row_id as number | null) ?? 0;
  if (!draftId) return;

  // Content restrictions become a brief that's prepended to the
  // generation request so the voice engine avoids them at write time.
  // Still cross-checked by QA in case the model ignores them.
  const restrictions = await getContentRestrictions(item.client_slug, env);
  const brief = restrictions
    ? `Hard content rules for this piece -- do not violate these even implicitly:\n${restrictions}`
    : undefined;

  let body = "";
  try {
    const out = await generateDraftInVoice(env, item.client_slug, item.title, brief);
    body = out.body_markdown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "generation failed";
    await env.DB.prepare(
      "UPDATE scheduled_drafts SET status = 'failed', draft_id = ?, error = ?, updated_at = ? WHERE id = ?",
    ).bind(draftId, msg, now, item.id).run();
    console.error(`[content-pipeline] generate failed for sched ${item.id}: ${msg}`);
    return;
  }

  let score: number | null = null;
  try {
    const s = await scoreDraftAgainstProfile(env, item.client_slug, body);
    score = s?.score ?? null;
  } catch { /* non-fatal */ }

  let qaJson: string | null = null;
  let qaLevel: string | null = null;
  try {
    const qa = await runContentQa(env, {
      title: item.title,
      body,
      kind: item.kind,
      voiceScore: score,
      restrictions,
    });
    qaJson = JSON.stringify(qa);
    qaLevel = qa.level;
  } catch (err) {
    console.error(`[content-pipeline] QA failed for draft ${draftId}: ${err}`);
  }

  await env.DB.prepare(
    `UPDATE content_drafts SET body_markdown = ?, voice_score = ?, qa_result_json = ?, qa_level = ?, status = 'in_review', updated_at = ? WHERE id = ?`,
  ).bind(body, score, qaJson, qaLevel, now, draftId).run();

  await env.DB.prepare(
    "UPDATE scheduled_drafts SET status = 'drafted', draft_id = ?, updated_at = ? WHERE id = ?",
  ).bind(draftId, now, item.id).run();

  // Email the customer unless the draft was QA-held; in that case it
  // goes to the NR ops review queue and the customer waits for a human
  // to clear it before they see it at all.
  if (qaLevel !== "held") {
    await sendDraftReadyEmail(item.client_slug, draftId, item.title, env);
  } else {
    console.log(`[content-pipeline] draft ${draftId} held by QA, skipping customer email`);
  }
}

/**
 * Auto-publish an approved + not-held draft to WordPress on its
 * scheduled date. Respects the trust window: the first 3 approvals
 * still go through the customer's explicit Publish click. After that,
 * a cleanly-approved + QA-passing draft auto-ships here.
 */
async function maybeAutoPublish(item: ScheduledDraft, env: Env): Promise<void> {
  if (!item.draft_id) return;
  // Paused clients never auto-publish. Their approved drafts are still
  // publishable manually via the one-click Publish button.
  if (await isClientPaused(item.client_slug, env)) return;
  const draft = await env.DB.prepare(
    "SELECT * FROM content_drafts WHERE id = ? AND client_slug = ?",
  ).bind(item.draft_id, item.client_slug).first<ContentDraft>();
  if (!draft) return;

  // Hard rails that apply in all cases.
  if (draft.qa_level === "held") return;
  if (draft.status === "rejected") return;

  // Auto-approve after trust window if QA is pass and the customer
  // hasn't explicitly rejected.
  if (draft.status !== "approved") {
    const past = await pastTrustWindow(item.client_slug, env);
    if (!past) return; // still in trust window -- wait for explicit approve
    if (draft.qa_level !== "pass") return; // warn/null -- don't auto-ship
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "UPDATE content_drafts SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?",
    ).bind(now, now, draft.id).run();
    draft.status = "approved";
  }

  const conn = await getConnection(item.client_slug, env);
  if (!conn) {
    // No CMS connection yet -- email the customer so they can grab
    // the draft manually. Don't mark failed; customer may connect a
    // platform later and we'll retry on the next pipeline run.
    await sendDraftReadyEmail(item.client_slug, draft.id, item.title, env);
    return;
  }

  try {
    const { url: liveUrl, externalId } = await publishDraft(
      item.client_slug,
      {
        title: draft.title,
        content_markdown: draft.body_markdown || "",
        scheduled_date: null, // ship now, not scheduled-future
      },
      env,
    );
    const now = Math.floor(Date.now() / 1000);
    // wp_post_id column predates the multi-CMS abstraction. We keep
    // writing to it for back-compat (it's an INTEGER), parsing the
    // driver's externalId where possible. Webflow returns a UUID --
    // those won't fit, so we write 0 and rely on published_url for
    // routing back. A later migration can rename this column.
    const wpPostIdNumeric = /^\d+$/.test(externalId) ? Number(externalId) : 0;
    await env.DB.prepare(
      `UPDATE scheduled_drafts
         SET status = 'published', published_url = ?, wp_post_id = ?, published_at = ?, updated_at = ?
         WHERE id = ?`,
    ).bind(liveUrl, wpPostIdNumeric, now, now, item.id).run();
    await sendContentPublishedEmail(item.client_slug, item.title, liveUrl, env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "publish failed";
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "UPDATE scheduled_drafts SET status = 'failed', error = ?, updated_at = ? WHERE id = ?",
    ).bind(msg, now, item.id).run();
    console.error(`[content-pipeline] publish failed for sched ${item.id}: ${msg}`);
  }
}

/**
 * Main daily entry. Sweeps scheduled_drafts for actionable rows.
 */
export async function runContentPipeline(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const generateCutoff = now + GENERATE_LEAD_DAYS * 86400;

  // Rows due to have a draft generated. Planned + within lead window
  // + not already linked to a draft.
  const toDraft = (await env.DB.prepare(
    `SELECT * FROM scheduled_drafts
       WHERE status = 'planned' AND scheduled_date <= ? AND draft_id IS NULL
       ORDER BY scheduled_date ASC LIMIT 20`,
  ).bind(generateCutoff).all<ScheduledDraft>()).results;

  for (const item of toDraft) {
    try {
      await generateForScheduled(item, env);
    } catch (err) {
      console.error(`[content-pipeline] generate loop error on ${item.id}: ${err}`);
    }
  }

  // Rows due to publish today. Drafted or approved, not yet published,
  // scheduled_date has arrived.
  const toPublish = (await env.DB.prepare(
    `SELECT * FROM scheduled_drafts
       WHERE status IN ('drafted', 'approved') AND scheduled_date <= ? AND draft_id IS NOT NULL
       ORDER BY scheduled_date ASC LIMIT 20`,
  ).bind(now).all<ScheduledDraft>()).results;

  for (const item of toPublish) {
    try {
      await maybeAutoPublish(item, env);
    } catch (err) {
      console.error(`[content-pipeline] publish loop error on ${item.id}: ${err}`);
    }
  }
}

// ---------- PHASE C: outcome scan ----------

/**
 * Weekly sweep of recently published items. For each, check how many
 * citations the target keyword has earned since the publish date and
 * update the row so the calendar can surface the outcome.
 *
 * Kept deliberately simple: citation count since publish. Ranking
 * observations piggy-back on the existing GSC snapshots if present.
 */
export async function runContentOutcomeScan(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // Scan anything published in the last 90 days that we haven't checked
  // in the past 6 days. The longer we track a post the more the outcome
  // can change as AI engines re-index.
  const staleCutoff = now - 6 * 86400;
  const ninetyDaysAgo = now - 90 * 86400;

  const items = (await env.DB.prepare(
    `SELECT * FROM scheduled_drafts
       WHERE status = 'published'
         AND published_at IS NOT NULL
         AND published_at > ?
         AND (outcome_checked_at IS NULL OR outcome_checked_at < ?)
       ORDER BY published_at DESC LIMIT 40`,
  ).bind(ninetyDaysAgo, staleCutoff).all<ScheduledDraft>()).results;

  for (const item of items) {
    try {
      let earned = 0;
      // If the item is tied to a citation keyword, count successful
      // cites since publish.
      if (item.target_keyword_id) {
        const row = await env.DB.prepare(
          `SELECT COUNT(*) AS cnt FROM citation_runs
             WHERE keyword_id = ? AND client_cited = 1 AND run_at > ?`,
        ).bind(item.target_keyword_id, item.published_at || 0).first<{ cnt: number }>();
        earned = row?.cnt || 0;
      } else if (item.topic_source === "citation_gap" && item.source_ref) {
        // Legacy: source_ref is the keyword id string. Same query.
        const row = await env.DB.prepare(
          `SELECT COUNT(*) AS cnt FROM citation_runs
             WHERE keyword_id = ? AND client_cited = 1 AND run_at > ?`,
        ).bind(Number(item.source_ref), item.published_at || 0).first<{ cnt: number }>();
        earned = row?.cnt || 0;
      }

      // GSC rank tracking. Look up the most recent GSC snapshot for
      // this client, find the published_url in top_pages, record its
      // position as rank_current. Update rank_peak if better (lower),
      // stamp indexed_at the first time we see any impressions.
      let rankCurrent: number | null = item.rank_current ?? null;
      let rankPeak: number | null = item.rank_peak ?? null;
      let indexedAt: number | null = item.indexed_at ?? null;
      if (item.published_url) {
        const snap = await env.DB.prepare(
          `SELECT top_pages FROM gsc_snapshots
             WHERE client_slug = ?
             ORDER BY date_end DESC LIMIT 1`,
        ).bind(item.client_slug).first<{ top_pages: string }>();
        if (snap?.top_pages) {
          try {
            const pages = JSON.parse(snap.top_pages) as { page: string; impressions: number; position: number }[];
            // GSC returns pages as full URLs. Match exactly first; fall
            // back to path-only match in case of trailing-slash drift.
            const target = item.published_url;
            const targetPath = (() => { try { return new URL(target).pathname.replace(/\/+$/, ""); } catch { return null; } })();
            const match = pages.find(p => p.page === target)
              || (targetPath ? pages.find(p => { try { return new URL(p.page).pathname.replace(/\/+$/, "") === targetPath; } catch { return false; } }) : undefined);
            if (match) {
              const pos = Math.round(match.position);
              rankCurrent = pos;
              if (rankPeak === null || pos < rankPeak) rankPeak = pos;
              if (!indexedAt && match.impressions > 0) indexedAt = now;
            }
          } catch { /* malformed JSON, skip */ }
        }
      }

      await env.DB.prepare(
        `UPDATE scheduled_drafts
           SET earned_citations_count = ?,
               rank_current = ?,
               rank_peak = ?,
               indexed_at = ?,
               outcome_checked_at = ?,
               updated_at = ?
           WHERE id = ?`,
      ).bind(earned, rankCurrent, rankPeak, indexedAt, now, now, item.id).run();
    } catch (err) {
      console.error(`[content-pipeline] outcome scan failed for ${item.id}: ${err}`);
    }
  }
}
