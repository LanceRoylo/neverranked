/**
 * D1 writes and reads for the free check (tables from dashboard migration
 * 0131). The schema is single-sourced in dashboard/migrations. This Worker
 * binds the same database and never migrates it.
 *
 * Every timestamp is unix SECONDS, the same unit as admin_inbox and the rest
 * of neverranked-app.
 *
 * PRIVACY. No IP-derived value is written to these tables. ip_hash exists in
 * the schema but is always NULL: an unsalted hash of an IP is reversible by
 * brute force over the IPv4 space, and it would sit forever next to an
 * email. Nothing this week needs it. When the live AI check needs a per-IP
 * limit, it should use a daily-rotating keyed hash, never this column.
 */

import type { ScanSummary } from "./missing-signals";

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** Keep only the five UTM keys, as short plain strings. */
export function cleanUtm(v: unknown): Utm {
  const out: Utm = {};
  if (!v || typeof v !== "object") return out;
  for (const k of UTM_KEYS) {
    const raw = (v as Record<string, unknown>)[k];
    if (typeof raw !== "string") continue;
    const s = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100);
    if (s) out[k] = s;
  }
  return out;
}

export function cleanReferrer(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 500);
  return s || null;
}

export function cleanUa(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 300);
  return s || null;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export interface EventRow {
  type: "scan" | "gate_impression" | "capture" | "ai_check";
  session_id: string | null;
  domain: string | null;
  source: string;
  is_internal: 0 | 1;
  is_bot: 0 | 1;
  ip_hash: string | null;
  user_agent: string | null;
  country: string | null;
  referrer: string | null;
  utm: Utm;
  created_at: number;
}

export function eventStatement(db: D1Database, e: EventRow): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO free_check_events
       (type, session_id, domain, source, is_internal, is_bot, ip_hash, user_agent, country, referrer,
        utm_source, utm_campaign, utm_content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    e.type, e.session_id, e.domain, e.source, e.is_internal, e.is_bot, e.ip_hash, e.user_agent,
    e.country, e.referrer, e.utm.utm_source ?? null, e.utm.utm_campaign ?? null, e.utm.utm_content ?? null,
    e.created_at,
  );
}

export interface ScanRow {
  scan_id: string;
  session_id: string | null;
  url: string;
  domain: string;
  score: number;
  grade: string;
  summary: ScanSummary;
  created_at: number;
}

export function scanStatement(db: D1Database, s: ScanRow): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO free_check_scans (scan_id, session_id, url, domain, score, grade, summary_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(s.scan_id, s.session_id, s.url.slice(0, 2000), s.domain, s.score, s.grade, JSON.stringify(s.summary), s.created_at);
}

/** Scan ids are crypto.randomUUID(). Anything else is not ours. */
export function cleanScanId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
}

export async function loadScan(db: D1Database, scanId: string): Promise<{ url: string; domain: string; summary: ScanSummary } | null> {
  const row = await db.prepare(
    "SELECT url, domain, summary_json FROM free_check_scans WHERE scan_id = ?",
  ).bind(scanId).first<{ url: string; domain: string; summary_json: string | null }>();
  if (!row || !row.summary_json) return null;
  try {
    const summary = JSON.parse(row.summary_json) as ScanSummary;
    if (!summary || summary.v !== 1) return null;
    return { url: row.url, domain: row.domain, summary };
  } catch {
    return null;
  }
}

export interface LeadRow {
  email: string;
  scan_id: string | null;
  url: string;
  domain: string;
  business_name: string | null;
  score: number | null;
  grade: string | null;
  consent_version: string;
  consent_text: string;
  followup_ok: 0 | 1;
  source: "check_page" | "kv_backfill";
  session_id: string | null;
  referrer: string | null;
  utm: Utm;
  ip_hash: string | null;
  user_agent: string | null;
  country: string | null;
  is_internal: 0 | 1;
  internal_reason: string | null;
  unsubscribed_at: number | null;
  created_at: number;
}

/** Insert one capture. Returns the new row id. Throws on a D1 failure so the
 *  caller can fall back to the durable KV record. */
export async function insertLead(db: D1Database, l: LeadRow): Promise<number> {
  const row = await db.prepare(
    `INSERT INTO free_check_leads
       (email, scan_id, url, domain, business_name, score, grade, consent_version, consent_text, followup_ok,
        source, session_id, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        ip_hash, user_agent, country, is_internal, internal_reason, unsubscribed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
  ).bind(
    l.email, l.scan_id, l.url.slice(0, 2000), l.domain, l.business_name, l.score, l.grade, l.consent_version,
    l.consent_text, l.followup_ok, l.source, l.session_id, l.referrer,
    l.utm.utm_source ?? null, l.utm.utm_medium ?? null, l.utm.utm_campaign ?? null, l.utm.utm_content ?? null,
    l.utm.utm_term ?? null, l.ip_hash, l.user_agent, l.country, l.is_internal, l.internal_reason,
    l.unsubscribed_at, l.created_at,
  ).first<{ id: number }>();
  if (!row || typeof row.id !== "number") throw new Error("insert returned no id");
  return row.id;
}

/**
 * The admin inbox row for a new lead. Same SQL shape as the dashboard's
 * addInboxItem (dashboard/src/admin-inbox.ts), so the item shows in the inbox
 * and in the morning briefing. The dashboard's own immediate email does not
 * fire for a row written here, which is why the scan Worker sends its own
 * alert to LEAD_ALERT_TO.
 */
export function inboxStatement(
  db: D1Database,
  p: {
    leadId: number; title: string; body: string; urgency: "high" | "normal" | "low"; now: number;
    /** 'resolved' for an internal test capture: recorded, never left pending. */
    status?: "pending" | "resolved";
    resolutionNote?: string;
  },
): D1PreparedStatement {
  const status = p.status ?? "pending";
  return db.prepare(
    `INSERT INTO admin_inbox
       (kind, title, body, action_url, target_type, target_id, target_slug, urgency, status, resolved_at, resolution_note,
        created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, target_type, target_id) DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       action_url = excluded.action_url,
       urgency = excluded.urgency,
       last_seen_at = excluded.last_seen_at`,
  ).bind(
    "free_check_lead", p.title, p.body, "/admin/free-check", "free_check_lead", p.leadId, null, p.urgency, status,
    status === "resolved" ? p.now : null, status === "resolved" ? (p.resolutionNote ?? null) : null, p.now, p.now,
  );
}

export async function recordReportResult(
  db: D1Database,
  leadId: number,
  status: string,
  emailId: string | null,
): Promise<void> {
  await db.prepare(
    "UPDATE free_check_leads SET report_email_status = ?, report_email_id = ? WHERE id = ?",
  ).bind(status.slice(0, 200), emailId, leadId).run();
}

/** Stamp every row for this email. Used by /unsubscribe. */
export async function markUnsubscribed(db: D1Database, email: string, at: number): Promise<number> {
  const r = await db.prepare(
    "UPDATE free_check_leads SET unsubscribed_at = ? WHERE email = ? AND unsubscribed_at IS NULL",
  ).bind(at, email).run();
  return r.meta?.changes ?? 0;
}
