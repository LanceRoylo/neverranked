#!/usr/bin/env node
/* Every queue, one command.
 *
 * The standing instruction has always been to read admin_alerts, admin_inbox,
 * ops_alerts and cron_runs. On 2026-09-27 I had been reading admin_alerts only,
 * for days. admin_inbox turned out to hold nine pending items: a high-urgency
 * one stale for 147 days, four negative AI mentions for a client going into a
 * renewal conversation, and two unapproved public drafts reporting our own
 * switched-off measurement as a market-wide citation decline.
 *
 * None of that was hidden. It was in a queue I was not opening, because opening
 * it depended on remembering to. This removes the remembering.
 *
 *   node scripts/daily-check.mjs
 *
 * Read-only: every statement is a SELECT and the helper refuses anything else.
 */
import { execFileSync } from "node:child_process";

const q = (sql) => {
  if (!/^\s*(SELECT|WITH)\b/i.test(sql.trim())) throw new Error("read-only: " + sql.slice(0, 60));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = execFileSync("npx",
        ["wrangler", "d1", "execute", "neverranked-app", "--remote", "--json", "--command", sql],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], cwd: "dashboard" });
      const i = Math.min(...[out.indexOf("["), out.indexOf("{")].filter((n) => n >= 0));
      const parsed = JSON.parse(out.slice(i));
      if (!Array.isArray(parsed) && parsed.error) throw new Error(JSON.stringify(parsed.error).slice(0, 200));
      return parsed[0]?.results ?? [];
    } catch (e) {
      if (attempt === 3) throw e;   // transient 7403/10000 are common; a real error still surfaces
    }
  }
  return [];
};

const section = (t) => console.log(`\n${"=".repeat(64)}\n${t}\n${"=".repeat(64)}`);
const rows = (rs, fmt) => rs.length ? rs.forEach((r) => console.log("  " + fmt(r))) : console.log("  (none)");

// 1. Measurement first: everything else is about a machine that must be running.
section("MEASUREMENT, last 3 days");
rows(q(`SELECT ck.client_slug s, date(cr.run_at,'unixepoch') d, COUNT(*) runs,
               COUNT(DISTINCT cr.engine) eng, COUNT(DISTINCT cr.keyword_id) kw
          FROM citation_runs cr JOIN citation_keywords ck ON ck.id=cr.keyword_id
         WHERE cr.run_at >= unixepoch('now','-3 days')
         GROUP BY ck.client_slug, d ORDER BY d DESC, ck.client_slug`),
  (r) => `${r.d}  ${String(r.s).padEnd(16)} ${String(r.runs).padStart(4)} runs  ${r.eng} engines  ${r.kw} questions`);

// 2. UNREAD, not recent. An alert from five days ago that nobody read is the
//    point of the queue.
section("ADMIN ALERTS, unread (no time bound)");
rows(q(`SELECT id, COALESCE(client_slug,'-') s, type, substr(title,1,58) t,
               CAST((unixepoch()-created_at)/86400 AS INT) age
          FROM admin_alerts WHERE read_at IS NULL ORDER BY created_at DESC LIMIT 30`),
  (r) => `${String(r.age).padStart(3)}d  ${String(r.s).padEnd(16)} ${String(r.type).padEnd(24)} ${r.t}`);

// 3. The queue I was not opening.
section("ADMIN INBOX, pending");
// TWO ages, because they mean different things. addInboxItem upserts and
// refreshes the body without touching created_at, so "first" is when this
// problem was first ever seen and "last" is when it last fired. Reading the
// first as the second showed a failure carrying September figures as 146 days
// old, and nearly got it closed as stale.
rows(q(`SELECT kind, COALESCE(target_slug,'-') s, substr(title,1,48) t, urgency,
               CAST((unixepoch()-created_at)/86400 AS INT) first_age,
               CAST((unixepoch()-COALESCE(last_seen_at,created_at))/86400 AS INT) last_age
          FROM admin_inbox WHERE status NOT IN ('done','dismissed','resolved')
         ORDER BY COALESCE(last_seen_at,created_at) DESC`),
  (r) => `last ${String(r.last_age).padStart(3)}d / first ${String(r.first_age).padStart(3)}d  ${String(r.urgency).padEnd(6)} ${String(r.s).padEnd(15)} ${String(r.kind).padEnd(22)} ${r.t}`);

// 4. Drafts waiting on a human, and anything that publishes.
section("AWAITING REVIEW");
rows(q(`SELECT client_slug s, month_key m, datetime(updated_at,'unixepoch') u
          FROM monthly_memos WHERE delivered_at IS NULL ORDER BY month_key DESC`),
  (r) => `memo draft   ${String(r.s).padEnd(16)} ${r.m}  written ${r.u}`);

section("DONE");
console.log("  Anything above with age in the tens of days has been sitting. Check it is still true before acting.\n");
