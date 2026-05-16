/**
 * phase2-autopreview.ts — Phase 2 (dashboard side).
 *
 * Auto-builds the Preview + matching draft email for hot/very_warm
 * prospects, then digests them to Lance for one-click approval.
 * Approval (handlePreviewPublishPost, source='auto') publishes the
 * Preview and enqueues a send into outreach_preview_send_queue; the
 * outreach Worker drains that queue via the host /send path (it is
 * the sole send_log writer — Decision C). No Worker-to-Worker HTTP;
 * the shared neverranked-app D1 is the only boundary.
 *
 * INERT until config.phase2_autopreview_enabled (outreach_config,
 * default false) is flipped. Both the auto-build step here and the
 * outreach drain step no-op while the flag is off, so this ships
 * deployed-but-dormant exactly like the migration's PHASE5 gate.
 */
import type { Env } from "./types";

/** Shared inert flag — single source of truth, the same single-row
 * outreach_config the outreach Worker's limiter reads. */
export async function phase2Enabled(env: Env): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      "SELECT config_json FROM outreach_config WHERE id = 1",
    ).first<{ config_json: string }>();
    if (!row?.config_json) return false;
    return !!JSON.parse(row.config_json).phase2_autopreview_enabled;
  } catch {
    return false; // fail closed
  }
}

const AUTO_BUILD_TIERS = new Set(["hot", "very_warm"]);
const MAX_BUILDS_PER_RUN = 10;

/**
 * Auto-build step (dashboard daily cron). Reuses the EXACT manual
 * machinery: getProspectWarmth -> buildAutonomousPreview (grader
 * gates it; held ones return {error} and are silently skipped, never
 * surfaced) -> generateFollowupDraft (the same voice-clean email
 * that links the Preview). Idempotent: one auto-build per prospect
 * ever (source='auto' marker), and never touches a prospect who
 * already has an active Preview.
 */
export async function runAutoPreviewBuild(
  env: Env,
): Promise<{ built: number; skipped: number; gated?: boolean }> {
  if (!(await phase2Enabled(env))) return { built: 0, skipped: 0, gated: true };

  const { getProspectWarmth } = await import("./outreach/warmth");
  const {
    buildAutonomousPreview,
    getPreviewByProspectId,
  } = await import("./preview/generator");
  const { generateFollowupDraft, templateKindForTier } = await import(
    "./outreach/templates"
  );
  const { recordDraftedFollowup, getLastFollowupAction } = await import(
    "./outreach/warmth"
  );

  const warmth = await getProspectWarmth(env);
  const candidates = warmth.filter((p) => AUTO_BUILD_TIERS.has(p.tier));

  let built = 0;
  let skipped = 0;
  for (const w of candidates) {
    if (built >= MAX_BUILDS_PER_RUN) break;

    // Already has an active Preview, or was already auto-built once.
    const active = await getPreviewByProspectId(env, w.prospect_id);
    if (active) {
      skipped++;
      continue;
    }
    const priorAuto = await env.DB.prepare(
      "SELECT 1 FROM previews WHERE prospect_id = ? AND source = 'auto' LIMIT 1",
    )
      .bind(w.prospect_id)
      .first();
    if (priorAuto) {
      skipped++;
      continue;
    }

    const r = await buildAutonomousPreview(
      env,
      w.prospect_id,
      w.tier === "fading" ? "very_warm" : (w.tier as any),
      w.open_count,
    );
    if ("error" in r) {
      // Grader held it or build failed. Correct + silent — never
      // surface an overclaiming Preview. Marked so we don't retry
      // forever this run; a manual Rebuild is still available.
      skipped++;
      continue;
    }

    await env.DB.prepare(
      "UPDATE previews SET source = 'auto', auto_built_at = unixepoch() WHERE slug = ?",
    )
      .bind(r.slug)
      .run();

    // Build the matching draft email (same path as the manual
    // "Build Draft" — voice-clean, links the real Preview URL).
    try {
      const last = await getLastFollowupAction(env, w.prospect_id);
      const tk = templateKindForTier(w.tier);
      if (!(last && last.status === "drafted" && last.template_kind === tk)) {
        const draft = await generateFollowupDraft(env, {
          warmth: w,
          preview_url: `https://app.neverranked.com/preview/${r.slug}`,
        });
        if (draft) {
          await recordDraftedFollowup(env, {
            prospect_id: w.prospect_id,
            template_kind: tk,
            tier: w.tier,
            open_count: w.open_count,
            subject: draft.subject,
            body: draft.body,
          });
        }
      }
    } catch {
      /* draft is non-fatal; the Preview still stands for review */
    }

    built++;
  }
  return { built, skipped };
}

/**
 * Digest (dashboard daily cron, after the build). One email to
 * ADMIN_EMAIL listing auto-built Previews awaiting approval. A small
 * high-value list; a daily nudge until actioned is intentional, not
 * spam. No-op if nothing pending or the flag is off.
 */
export async function sendPhase2Digest(env: Env): Promise<void> {
  if (!(await phase2Enabled(env))) return;
  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL) return;

  const pending = (
    await env.DB.prepare(
      `SELECT p.prospect_id, p.slug,
              m.broker_name, m.brokerage_name, m.market
         FROM previews p
         JOIN outreach_prospects_master m ON m.id = p.prospect_id
        WHERE p.source = 'auto' AND p.status = 'draft'
          AND p.prospect_id NOT IN (
            SELECT prospect_id FROM outreach_preview_send_queue
          )
        ORDER BY p.auto_built_at DESC`,
    ).all<{
      prospect_id: number;
      slug: string;
      broker_name: string | null;
      brokerage_name: string | null;
      market: string | null;
    }>()
  ).results;

  if (!pending.length) return;

  const rows = pending
    .map(
      (p) =>
        `<li style="margin:0 0 10px"><a href="https://app.neverranked.com/admin/warm-prospects/${p.prospect_id}" style="color:#9c7a1f">${esc(p.broker_name || `Prospect #${p.prospect_id}`)}</a> — ${esc(p.brokerage_name || "")}${p.market ? ", " + esc(p.market) : ""}</li>`,
    )
    .join("");

  const html = `<div style="font-family:Georgia,serif;font-size:15px;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px">
  <p style="margin:0 0 16px">${pending.length} auto-built Preview${pending.length === 1 ? "" : "s"} ready for your review. Open each, glance, and Approve to send (or skip).</p>
  <ul style="margin:0 0 20px;padding-left:18px">${rows}</ul>
  <p style="margin:0;font-size:13px;color:#666">Nothing sends until you approve it in the dashboard.</p>
</div>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NeverRanked <login@neverranked.com>",
        to: [env.ADMIN_EMAIL],
        subject: `${pending.length} Preview${pending.length === 1 ? "" : "s"} ready to approve`,
        html,
      }),
    });
  } catch {
    /* digest is best-effort; pending items remain for next run */
  }
}

/** Enqueue a send after approval. Called from the publish handler
 * only for source='auto' Previews, only when the flag is on. The
 * outreach Worker drains this. UNIQUE(prospect_id, preview_slug)
 * makes a double-approve idempotent. */
export async function enqueuePreviewSend(
  env: Env,
  prospect_id: number,
  preview_slug: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO outreach_preview_send_queue
       (prospect_id, preview_slug, status) VALUES (?, ?, 'queued')`,
  )
    .bind(prospect_id, preview_slug)
    .run();
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
