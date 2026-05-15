/**
 * Schema audit log — append-only record of every mutation to
 * customer-deployed schema_injections rows.
 *
 * Called after every approve / edit / pause / archive / unapprove on a
 * schema_injection. The log row records: who, what, when, the SHA-256
 * hash of the payload at that moment, and (for edits) the previous
 * payload's hash. Lets us prove what was on a customer's site at any
 * point in time without trusting the schema_injections row itself
 * (which may have been edited or deleted).
 *
 * NEVER UPDATE OR DELETE rows in schema_audit_log. The append-only
 * property is the whole point.
 */

import type { Env } from "../types";

export type SchemaAuditAction = "approve" | "edit" | "pause" | "archive" | "unapprove";

interface RecordAuditInput {
  env: Env;
  actorUserId: number;     // who triggered the mutation (usually Lance, id=2)
  actorEmail?: string | null;
  request?: Request;        // for IP hashing; safe to omit
  clientSlug: string;
  schemaInjectionId: number | null;
  schemaType: string;
  action: SchemaAuditAction;
  jsonLd: string;          // current payload (what is now live, or what was just deployed)
  priorJsonLd?: string;    // previous payload, for 'edit' actions
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function recordSchemaAudit(opts: RecordAuditInput): Promise<void> {
  const { env, actorUserId, actorEmail, request, clientSlug, schemaInjectionId, schemaType, action, jsonLd, priorJsonLd } = opts;

  // Best-effort: never let an audit-log failure block the actual schema
  // mutation. If the audit insert throws (DB hiccup, schema mismatch,
  // anything), we surface to console and continue. The trade-off here
  // is intentional -- a failed audit log entry is bad (gap in record)
  // but a blocked approval is worse (broken UX). We can detect gaps
  // by comparing audit rows to schema_injections.approved_at via cron.
  try {
    const jsonHash = await sha256Hex(jsonLd || "");
    const priorHash = priorJsonLd ? await sha256Hex(priorJsonLd) : null;
    const preview = (jsonLd || "").slice(0, 280);

    // IP hash for the approver. Best-effort: in admin contexts the IP
    // comes from CF-Connecting-IP. Hashed + truncated so we have a
    // bot-detection / replay-detection signal without storing raw IPs.
    let ipHash: string | null = null;
    if (request) {
      const rawIp = request.headers.get("CF-Connecting-IP")
                 || request.headers.get("X-Forwarded-For")
                 || "";
      if (rawIp) {
        const fullHash = await sha256Hex(rawIp);
        ipHash = fullHash.slice(0, 16);
      }
    }

    await env.DB.prepare(`
      INSERT INTO schema_audit_log
        (client_slug, schema_injection_id, schema_type, action, json_ld_hash, json_ld_preview, prior_hash, actor_user_id, actor_email, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      clientSlug,
      schemaInjectionId,
      schemaType,
      action,
      jsonHash,
      preview,
      priorHash,
      actorUserId,
      actorEmail ?? null,
      ipHash,
    ).run();
  } catch (err) {
    console.error("schema-audit-log failed:", err instanceof Error ? err.message : String(err));
  }
}
