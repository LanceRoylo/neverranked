/**
 * client_faqs CRUD operations + integration with schema_injections.
 *
 * Every approve/edit/reject mutation also rebuilds the live FAQPage
 * schema for the client by collecting all status='approved' rows
 * and emitting a fresh schema_injections row. The snippet picks up
 * changes within the Cloudflare cache TTL (default 1 hour).
 */

import type { Env } from "../types";

export type FAQReviewStatus = "proposed" | "approved" | "rejected" | "removed";
export type RejectionCategory = "off_topic" | "voice" | "category" | "other";

export interface ClientFAQ {
  id: number;
  client_slug: string;
  question: string;
  answer_proposed: string;
  answer_current: string;
  source: string;
  evidence_json: string | null;
  status: FAQReviewStatus;
  reviewer_user_id: number | null;
  reviewed_at: number | null;
  edited_at: number | null;
  rejection_reason: string | null;
  rejection_category: string | null;
  deployment_id: number | null;
  created_at: number;
  superseded_at: number | null;
}

function normalizeQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Insert a new FAQ candidate as 'proposed'. Idempotent on
 * (client_slug, question_normalized): if the question already exists
 * for this client, we DO NOT insert a duplicate. Rejected questions
 * stay rejected; approved questions stay approved; the regen cron
 * never re-asks an already-answered question.
 */
export async function proposeFAQ(
  env: Env,
  input: {
    client_slug: string;
    question: string;
    answer: string;
    source: string;
    evidence?: Record<string, unknown>;
    deployment_id?: number;
  },
): Promise<{ ok: boolean; faq_id?: number; already_existed?: boolean }> {
  const normalized = normalizeQuestion(input.question);
  const existing = await env.DB.prepare(
    `SELECT id, status FROM client_faqs
       WHERE client_slug = ? AND question_normalized = ? LIMIT 1`,
  ).bind(input.client_slug, normalized).first<{ id: number; status: string }>();
  if (existing) {
    return { ok: true, faq_id: existing.id, already_existed: true };
  }
  const result = await env.DB.prepare(
    `INSERT INTO client_faqs
       (client_slug, question, question_normalized,
        answer_proposed, answer_current, source, evidence_json,
        status, deployment_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, unixepoch())`,
  ).bind(
    input.client_slug,
    input.question.trim(),
    normalized,
    input.answer,
    input.answer,
    input.source,
    input.evidence ? JSON.stringify(input.evidence) : null,
    input.deployment_id ?? null,
  ).run();
  return { ok: true, faq_id: Number(result.meta?.last_row_id ?? 0) };
}

export async function getClientFAQs(
  env: Env,
  clientSlug: string,
  statuses: FAQReviewStatus[] = ["proposed", "approved", "rejected"],
): Promise<ClientFAQ[]> {
  const placeholders = statuses.map(() => "?").join(",");
  return (await env.DB.prepare(
    `SELECT * FROM client_faqs
      WHERE client_slug = ? AND status IN (${placeholders})
        AND superseded_at IS NULL
      ORDER BY status ASC, created_at DESC`,
  ).bind(clientSlug, ...statuses).all<ClientFAQ>()).results;
}

export async function approveFAQ(
  env: Env,
  faq_id: number,
  user_id: number | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE client_faqs SET status = 'approved', reviewer_user_id = ?,
            reviewed_at = ? WHERE id = ?`,
  ).bind(user_id, now, faq_id).run();
  // Trigger schema rebuild for the client this FAQ belongs to.
  const row = await env.DB.prepare(
    `SELECT client_slug FROM client_faqs WHERE id = ?`,
  ).bind(faq_id).first<{ client_slug: string }>();
  if (row) await rebuildClientFAQSchema(env, row.client_slug);
}

export async function editFAQAnswer(
  env: Env,
  faq_id: number,
  new_answer: string,
  user_id: number | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // Editing also approves -- there's no "edit but not approve" state.
  // Editing a previously-approved FAQ keeps it approved and re-deploys.
  await env.DB.prepare(
    `UPDATE client_faqs
        SET answer_current = ?, status = 'approved',
            reviewer_user_id = ?, edited_at = ?, reviewed_at = ?
      WHERE id = ?`,
  ).bind(new_answer.trim(), user_id, now, now, faq_id).run();
  const row = await env.DB.prepare(
    `SELECT client_slug FROM client_faqs WHERE id = ?`,
  ).bind(faq_id).first<{ client_slug: string }>();
  if (row) await rebuildClientFAQSchema(env, row.client_slug);
}

export async function rejectFAQ(
  env: Env,
  faq_id: number,
  category: RejectionCategory,
  reason: string | null,
  user_id: number | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE client_faqs
        SET status = 'rejected', rejection_category = ?,
            rejection_reason = ?, reviewer_user_id = ?, reviewed_at = ?
      WHERE id = ?`,
  ).bind(category, reason, user_id, now, faq_id).run();
  const row = await env.DB.prepare(
    `SELECT client_slug FROM client_faqs WHERE id = ?`,
  ).bind(faq_id).first<{ client_slug: string }>();
  if (row) await rebuildClientFAQSchema(env, row.client_slug);
}

export async function removeFAQFromLive(
  env: Env,
  faq_id: number,
  user_id: number | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE client_faqs
        SET status = 'removed', reviewer_user_id = ?, reviewed_at = ?
      WHERE id = ?`,
  ).bind(user_id, now, faq_id).run();
  const row = await env.DB.prepare(
    `SELECT client_slug FROM client_faqs WHERE id = ?`,
  ).bind(faq_id).first<{ client_slug: string }>();
  if (row) await rebuildClientFAQSchema(env, row.client_slug);
}

export async function restoreRejectedFAQ(
  env: Env,
  faq_id: number,
  user_id: number | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE client_faqs
        SET status = 'proposed', rejection_category = NULL,
            rejection_reason = NULL, reviewer_user_id = ?, reviewed_at = ?
      WHERE id = ?`,
  ).bind(user_id, now, faq_id).run();
}

/**
 * Rebuild the live FAQPage schema_injections row for a client from
 * the current set of status='approved' FAQs. Called after every
 * approve/edit/reject/remove mutation.
 */
async function rebuildClientFAQSchema(env: Env, clientSlug: string): Promise<void> {
  const approved = (await env.DB.prepare(
    `SELECT question, answer_current FROM client_faqs
      WHERE client_slug = ? AND status = 'approved' AND superseded_at IS NULL`,
  ).bind(clientSlug).all<{ question: string; answer_current: string }>()).results;

  // Pull business_url for the FAQPage's url field.
  const ctx = await env.DB.prepare(
    `SELECT business_url FROM injection_configs WHERE client_slug = ?`,
  ).bind(clientSlug).first<{ business_url: string | null }>();

  if (approved.length === 0) {
    // No approved FAQs -> mark any live FAQPage as superseded.
    await env.DB.prepare(
      `UPDATE schema_injections
          SET status = 'superseded', updated_at = unixepoch()
        WHERE client_slug = ? AND schema_type = 'FAQPage' AND status = 'approved'`,
    ).bind(clientSlug).run();
    return;
  }

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    ...(ctx?.business_url ? { url: ctx.business_url } : {}),
    mainEntity: approved.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer_current },
    })),
  };
  const jsonLd = JSON.stringify(schema, null, 2);

  // Supersede the previous live FAQPage row, write a new one.
  await env.DB.prepare(
    `UPDATE schema_injections
        SET status = 'superseded', updated_at = unixepoch()
      WHERE client_slug = ? AND schema_type = 'FAQPage' AND status = 'approved'`,
  ).bind(clientSlug).run();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO schema_injections
       (client_slug, schema_type, json_ld, target_pages, status, approved_at, created_at, updated_at)
     VALUES (?, 'FAQPage', ?, '*', 'approved', ?, ?, ?)`,
  ).bind(clientSlug, jsonLd, now, now, now).run();
}
