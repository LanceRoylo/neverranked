#!/usr/bin/env node
/**
 * kv-backup-to-sql.mjs: turn the free-check KV backup into idempotent SQL
 * for the D1 tables from dashboard migration 0131.
 *
 * Usage:
 *   node tools/schema-check/scripts/kv-backup-to-sql.mjs <backup-dir> <out.sql>
 *
 * <backup-dir> is the folder the plan's section 1a export wrote:
 * keys-*.json (wrangler kv key list output) and val-<key with ":" and "/"
 * replaced by "_">.json (one value per key).
 *
 * THE OUTPUT CONTAINS EMAIL ADDRESSES. Write it to the private docs folder,
 * never into this public repo, and never commit it. This script holds no
 * data of its own and is safe to keep here.
 *
 * What it writes (every statement is INSERT ... SELECT ... WHERE NOT EXISTS,
 * so running the file twice changes nothing):
 *   - free_check_leads: one row per capture (each entry in a lead's scans[]
 *     array is one email capture). source='kv_backfill',
 *     consent_version='legacy-2026-05', the old fine print as consent_text,
 *     followup_ok=0 (their two follow-ups were the drip, already sent).
 *     report_email_status/id come from the report_delivery record when its
 *     timestamp is within 15 minutes of the capture.
 *   - free_check_events: every scan and gate-impression event, plus one
 *     capture event per lead capture, classified like the Worker does where
 *     the old records allow it. Legacy rows carry no session id, so a
 *     browser-looking row is source 'legacy_page', never 'page'. That keeps
 *     them out of the people counts, which start at the first page-tagged
 *     row, while the admin page can still show them as history.
 *
 * No IP-derived value is written: the old KV scan events carried an
 * unsalted sha256 of the visitor IP, and it is dropped here.
 *
 * Internal rule (the plan's): test@example.com, any address whose local part
 * starts with "lance", and any hellomomentum.co or neverranked.com address
 * (subdomains included) are is_internal=1. Reserved example.* domains too.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [, , backupDir, outPath] = process.argv;
if (!backupDir || !outPath) {
  console.error("usage: node kv-backup-to-sql.mjs <backup-dir> <out.sql>");
  process.exit(2);
}

// Single source for the bot pattern: read it out of the Worker's bot-ua.ts
// rather than keeping a third copy.
const here = dirname(fileURLToPath(import.meta.url));
const botSrc = readFileSync(join(here, "..", "src", "bot-ua.ts"), "utf8");
const m = botSrc.match(/export const BOT_UA_RE =\s*\/(.+)\/([a-z]*);/);
if (!m) throw new Error("could not read BOT_UA_RE from src/bot-ua.ts");
const BOT_UA_RE = new RegExp(m[1], m[2]);
const isBot = (ua) => !ua || !String(ua).trim() || BOT_UA_RE.test(String(ua));

const LEGACY_CONSENT_VERSION = "legacy-2026-05";
const LEGACY_CONSENT_TEXT = "Your report now, plus two short follow-ups over the next week. Nothing after that.";

function sql(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.trunc(v)) : "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function is(v) {
  return v === null || v === undefined ? "IS NULL" : `= ${sql(v)}`;
}
const sec = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};

function internalReason(email) {
  const e = String(email).toLowerCase();
  const [local, host = ""] = e.split("@");
  if (e === "test@example.com") return "backfill_rule:test_address";
  if (local.startsWith("lance")) return "backfill_rule:lance";
  for (const d of ["hellomomentum.co", "neverranked.com"]) {
    if (host === d || host.endsWith("." + d)) return "backfill_rule:internal_domain";
  }
  for (const d of ["example.com", "example.org", "example.net"]) {
    if (host === d || host.endsWith("." + d)) return "backfill_rule:test_domain";
  }
  return null;
}

function classifyLegacyScan(v) {
  const ua = String(v.ua ?? "");
  const bot = isBot(ua) ? 1 : 0;
  if (v.source === "montaic") return { source: "montaic", is_internal: 1, is_bot: bot };
  if (/neverranked-mcp/i.test(ua)) return { source: "mcp", is_internal: 0, is_bot: bot };
  if (/neverranked-audittemplate/i.test(ua)) return { source: "audit-template", is_internal: 1, is_bot: bot };
  if (/neverranked-outreach/i.test(ua)) return { source: "outreach-scan", is_internal: 1, is_bot: bot };
  if (bot) return { source: "script", is_internal: 0, is_bot: 1 };
  return { source: "legacy_page", is_internal: 0, is_bot: 0 };
}

// ---- read the backup ----
const files = readdirSync(backupDir);
const keyNames = [];
for (const f of files.filter((f) => /^keys-.*\.json$/.test(f))) {
  for (const k of JSON.parse(readFileSync(join(backupDir, f), "utf8"))) keyNames.push(k.name);
}
const valueOf = (key) => {
  const p = join(backupDir, `val-${key.replace(/[:/]/g, "_")}.json`);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf8").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

const out = [];
const counts = { leads: 0, scan: 0, gate_impression: 0, capture: 0, capture_keys: 0, missing_values: 0 };
const eventInsert = (e) => {
  out.push(
    `INSERT INTO free_check_events (type, session_id, domain, source, is_internal, is_bot, ip_hash, user_agent, country, referrer, utm_source, utm_campaign, utm_content, created_at)\n` +
    `SELECT ${sql(e.type)}, NULL, ${sql(e.domain)}, ${sql(e.source)}, ${e.is_internal}, ${e.is_bot}, ${sql(e.ip_hash)}, ${sql(e.user_agent)}, NULL, ${sql(e.referrer)}, ${sql(e.utm_source)}, ${sql(e.utm_campaign)}, ${sql(e.utm_content)}, ${e.created_at}\n` +
    `WHERE NOT EXISTS (SELECT 1 FROM free_check_events WHERE type = ${sql(e.type)} AND created_at = ${e.created_at} AND domain ${is(e.domain)} AND ip_hash ${is(e.ip_hash)} AND source = ${sql(e.source)});`,
  );
  counts[e.type]++;
};

// Leads and their captures.
for (const key of keyNames.filter((k) => k.startsWith("lead:"))) {
  const lead = valueOf(key);
  if (!lead) { counts.missing_values++; continue; }
  const email = String(lead.email || key.slice(5)).trim().toLowerCase();
  const reason = internalReason(email);
  const delivery = valueOf(`report_delivery:${email}`);
  const deliveredAt = delivery ? sec(delivery.ts) : null;
  for (const s of Array.isArray(lead.scans) ? lead.scans : []) {
    const created = sec(s.date) ?? sec(lead.created);
    if (created === null || !s.domain) continue;
    const domain = String(s.domain).toLowerCase();
    const matched = deliveredAt !== null && Math.abs(deliveredAt - created) <= 15 * 60;
    out.push(
      `INSERT INTO free_check_leads (email, scan_id, url, domain, business_name, score, grade, consent_version, consent_text, followup_ok, email_verified_at, source, session_id, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ip_hash, user_agent, country, is_internal, internal_reason, report_email_status, report_email_id, created_at)\n` +
      `SELECT ${sql(email)}, NULL, ${sql(`https://${domain}/`)}, ${sql(domain)}, NULL, ${sql(typeof s.score === "number" ? s.score : null)}, ${sql(s.grade ?? null)}, ${sql(LEGACY_CONSENT_VERSION)}, ${sql(LEGACY_CONSENT_TEXT)}, 0, NULL, 'kv_backfill', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ${reason ? 1 : 0}, ${sql(reason)}, ${sql(matched ? delivery.status : null)}, ${sql(matched ? delivery.resend_id : null)}, ${created}\n` +
      `WHERE NOT EXISTS (SELECT 1 FROM free_check_leads WHERE source = 'kv_backfill' AND email = ${sql(email)} AND created_at = ${created});`,
    );
    counts.leads++;
    eventInsert({
      type: "capture", domain, source: "legacy_page", is_internal: reason ? 1 : 0, is_bot: 0,
      ip_hash: null, user_agent: null, referrer: null, utm_source: null, utm_campaign: null, utm_content: null, created_at: created,
    });
  }
}

// Scan events.
for (const key of keyNames.filter((k) => k.startsWith("event:scan:"))) {
  const v = valueOf(key);
  if (!v) { counts.missing_values++; continue; }
  const created = sec(v.ts);
  if (created === null) continue;
  const c = classifyLegacyScan(v);
  const utm = v.utm && typeof v.utm === "object" ? v.utm : {};
  eventInsert({
    type: "scan", domain: v.domain ? String(v.domain).toLowerCase() : null, ...c,
    // ip_hash is never carried into D1 (see the privacy note in
    // src/free-check-store.ts): an unsalted IP hash is reversible.
    ip_hash: null, user_agent: v.ua ? String(v.ua).slice(0, 300) : null, referrer: v.referrer ? String(v.referrer).slice(0, 500) : null,
    utm_source: utm.utm_source ?? utm.source ?? null, utm_campaign: utm.utm_campaign ?? utm.campaign ?? null, utm_content: utm.utm_content ?? utm.content ?? null,
    created_at: created,
  });
}

// Gate impressions (only the page ever sent these).
for (const key of keyNames.filter((k) => k.startsWith("event:gate_impression:"))) {
  const v = valueOf(key);
  if (!v) { counts.missing_values++; continue; }
  const created = sec(v.ts);
  if (created === null) continue;
  eventInsert({
    type: "gate_impression", domain: v.domain ? String(v.domain).toLowerCase() : null, source: "legacy_page", is_internal: 0, is_bot: 0,
    ip_hash: null, user_agent: null, referrer: null, utm_source: null, utm_campaign: null, utm_content: null, created_at: created,
  });
}

// Standalone capture events. Leads above already produce one capture event
// per capture, so these would double count. The backup held none; report it
// if that ever changes rather than guess.
counts.capture_keys = keyNames.filter((k) => k.startsWith("event:capture:")).length;

const header = [
  `-- Free-check KV backfill. Generated ${new Date().toISOString()} by tools/schema-check/scripts/kv-backup-to-sql.mjs`,
  `-- PRIVATE: contains email addresses. Do not copy into the public repo. Do not commit.`,
  `-- Idempotent: every statement is INSERT ... SELECT ... WHERE NOT EXISTS.`,
  `-- Rows: ${counts.leads} leads, ${counts.capture} capture events, ${counts.scan} scan events, ${counts.gate_impression} gate impressions.`,
  `-- Skipped: ${counts.capture_keys} event:capture keys (lead records already carry each capture), ${counts.missing_values} keys with no readable value.`,
  ``,
];
writeFileSync(outPath, header.join("\n") + out.join("\n") + "\n");
console.log(JSON.stringify({ out: outPath, statements: out.length, ...counts }));
