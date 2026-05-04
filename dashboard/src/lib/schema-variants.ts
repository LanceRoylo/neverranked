/**
 * Schema variant management — the A/B testing foundation.
 *
 * Every schema_injections row belongs to a "variant" (A, B, C, ...)
 * within its (client_slug, schema_type, target_pages) tuple. Only one
 * variant is "live" at a time; older variants stay in the table with
 * superseded_at set so we can match citation_runs back to whichever
 * variant was live when the run happened.
 *
 * Two helpers:
 *
 *   nextVariantLetter(env, slug, schemaType, targetPathsJson)
 *     Returns "A" if no prior variants exist for this tuple, else
 *     the next letter after the highest existing one. Generators
 *     call this when inserting.
 *
 *   markDeployed(env, injectionId)
 *     Stamps deployed_at = now on the new row, and stamps
 *     superseded_at + superseded_by_id on whichever variant was
 *     previously live for the same tuple. Idempotent: re-calling
 *     for an already-deployed row is a no-op.
 *
 * What we do NOT do here:
 *   - The actual A/B test scoring (that's lib/schema-impact.ts, next
 *     iteration). This file is just bookkeeping.
 *   - Variant rollout splits (showing FAQ-A to half of crawler hits
 *     and FAQ-B to the other half). For now variants are sequential,
 *     not concurrent. Still gives us before/after correlation.
 */
import type { Env } from "../types";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Returns the next variant letter for this tuple. "A" for first. */
export async function nextVariantLetter(
  env: Env,
  clientSlug: string,
  schemaType: string,
  targetPagesJson: string,
): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT variant FROM schema_injections
       WHERE client_slug = ? AND schema_type = ? AND target_pages = ?
       ORDER BY id DESC LIMIT 1`
  ).bind(clientSlug, schemaType, targetPagesJson).first<{ variant: string | null }>();
  if (!row || !row.variant) return "A";
  const idx = ALPHABET.indexOf(row.variant);
  if (idx < 0 || idx >= ALPHABET.length - 1) return "A"; // wrap or unrecognized -> reset
  return ALPHABET[idx + 1];
}

/** Stamps deployed_at on the new row and supersedes any prior live
 *  variant for the same tuple. Call at the moment a schema goes from
 *  'pending' to 'active'/'deployed'. */
export async function markDeployed(env: Env, injectionId: number): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT id, client_slug, schema_type, target_pages, deployed_at FROM schema_injections WHERE id = ?"
  ).bind(injectionId).first<{
    id: number;
    client_slug: string;
    schema_type: string;
    target_pages: string;
    deployed_at: number | null;
  }>();
  if (!row) return;
  if (row.deployed_at) return; // already stamped, idempotent

  const now = Math.floor(Date.now() / 1000);

  // 1. Find the prior live variant for this tuple (if any) and supersede it
  const prior = await env.DB.prepare(
    `SELECT id FROM schema_injections
       WHERE client_slug = ? AND schema_type = ? AND target_pages = ?
         AND id != ?
         AND deployed_at IS NOT NULL
         AND superseded_at IS NULL
       ORDER BY deployed_at DESC LIMIT 1`
  ).bind(row.client_slug, row.schema_type, row.target_pages, row.id)
   .first<{ id: number }>();

  if (prior) {
    await env.DB.prepare(
      "UPDATE schema_injections SET superseded_at = ?, superseded_by_id = ? WHERE id = ?"
    ).bind(now, row.id, prior.id).run();
  }

  // 2. Stamp the new row as deployed
  await env.DB.prepare(
    "UPDATE schema_injections SET deployed_at = ? WHERE id = ?"
  ).bind(now, row.id).run();
}

/** Look up which variant was live for a (client, schema_type, target)
 *  tuple at a specific Unix timestamp. Used by citation correlation
 *  to attribute runs to the variant that was on the page when the AI
 *  engine queried it. Returns the schema_injections.id or null. */
export async function variantLiveAt(
  env: Env,
  clientSlug: string,
  schemaType: string,
  targetPagesJson: string,
  atUnix: number,
): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM schema_injections
       WHERE client_slug = ? AND schema_type = ? AND target_pages = ?
         AND deployed_at IS NOT NULL
         AND deployed_at <= ?
         AND (superseded_at IS NULL OR superseded_at > ?)
       ORDER BY deployed_at DESC LIMIT 1`
  ).bind(clientSlug, schemaType, targetPagesJson, atUnix, atUnix)
   .first<{ id: number }>();
  return row?.id ?? null;
}

/** Variant history for one (client, type, target) tuple. Used by the
 *  admin variant manager UI (next iteration) and by the customer NVI
 *  "what we deployed and what it did" section. */
export async function variantHistory(
  env: Env,
  clientSlug: string,
  schemaType: string,
  targetPagesJson: string,
): Promise<Array<{
  id: number;
  variant: string | null;
  status: string;
  deployed_at: number | null;
  superseded_at: number | null;
  quality_score: number | null;
  created_at: number;
}>> {
  const rows = await env.DB.prepare(
    `SELECT id, variant, status, deployed_at, superseded_at, quality_score, created_at
       FROM schema_injections
       WHERE client_slug = ? AND schema_type = ? AND target_pages = ?
       ORDER BY created_at ASC`
  ).bind(clientSlug, schemaType, targetPagesJson).all<{
    id: number;
    variant: string | null;
    status: string;
    deployed_at: number | null;
    superseded_at: number | null;
    quality_score: number | null;
    created_at: number;
  }>();
  return rows.results || [];
}
