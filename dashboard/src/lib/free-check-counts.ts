/**
 * free-check-counts.ts: the free check's funnel, counted in PEOPLE.
 *
 * The briefing used to print "Free-scan events recorded: 116", which was
 * every key under event:scan: in KV, i.e. every API call over 90 days: our
 * MCP tool, the keyed Montaic lane, the audit template, curl and the
 * leaderboard script. None of them is a person checking their site.
 *
 * The scan Worker now classifies every call at write time
 * (tools/schema-check/src/free-check-classify.ts) into free_check_events. A
 * row is a person when source = 'page' (it carried the page's session id),
 * is_internal = 0 and is_bot = 0, and its stored user agent does not match
 * the CURRENT bot pattern (bot-ua.ts). The re-check can only remove rows, so
 * extending the pattern later also cleans rows written before the extension.
 *
 * This module only counts. It is pure, so the briefing, the admin page and
 * the cockpit compute the same numbers from the same rows (loaded by
 * free-check-load.ts), and the tests can pin them.
 *
 * Rules, each one a lesson from a number that misled:
 *   - people are distinct sessions, not rows (one person checking three
 *     domains ran one check session, not three people)
 *   - the capture rate has the SAME population on both sides: person
 *     sessions that saw the ask and then gave an email, over person sessions
 *     that saw the ask. It can never exceed 100%. Captures from anywhere
 *     else (no page session, so an old cached page or a direct API call)
 *     are a separate line, flagged as an unverified source
 *   - the rate prints as counts ("4 of 15") until the 7-day ask count
 *     reaches 30. A percentage of 7 is noise wearing a decimal point
 *   - the funnel counts nothing from before the first page-tagged row
 *     ("counting from"), so backfilled legacy rows and pre-deploy traffic
 *     never mix with the new basis. The note stays for 14 days
 *   - new leads are listed regardless of the counting basis: a real person
 *     who left an email is never hidden by a bookkeeping rule
 *   - excluded traffic is shown by source, never silently dropped
 */

import { isBotUserAgent } from "./bot-ua";

export interface FcEventRow {
  type: string;
  source: string;
  is_internal: number;
  is_bot: number;
  session_id: string | null;
  domain?: string | null;
  user_agent?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
  created_at: number;
}

export interface FcLeadRow {
  id: number;
  email: string;
  domain: string;
  score: number | null;
  grade: string | null;
  source: string;
  is_internal: number;
  session_id: string | null;
  utm_source: string | null;
  utm_medium?: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  referrer: string | null;
  consent_version: string;
  created_at: number;
}

export interface WindowCounts {
  ranCheck: number;
  sawAsk: number;
  /** Person sessions that saw the ask and then gave an email. <= sawAsk. */
  gaveEmail: number;
  /** Real (non-internal) captures that did not come from a session counted
   *  above: no page session, or the ask was never logged for it. */
  otherCaptures: number;
  aiCheck: number;
  excluded: number;
  excludedBySource: Record<string, number>;
}

export interface FreeCheckCounts {
  now: number;
  countingFrom: number | null;
  day: WindowCounts;
  week: WindowCounts;
  /** Non-internal check-page leads in the last 24h, newest first. Never
   *  filtered by countingFrom. */
  newLeads: FcLeadRow[];
}

export const DAY = 86_400;
export const PERCENT_MIN_ASKS = 30;
export const BASIS_NOTE_DAYS = 14;

export function isPersonEvent(e: Pick<FcEventRow, "source" | "is_internal" | "is_bot"> & { user_agent?: string | null }): boolean {
  if (e.source !== "page" || e.is_internal || e.is_bot) return false;
  if (e.user_agent && isBotUserAgent(e.user_agent)) return false;
  return true;
}

/** Which bucket an excluded row is reported under. Non-page callers by
 *  their source; page rows by why they were excluded. */
export function excludedBucket(e: Pick<FcEventRow, "source" | "is_internal" | "is_bot"> & { user_agent?: string | null }): string {
  if (e.source !== "page") return e.source || "unknown";
  if (e.is_bot || (e.user_agent && isBotUserAgent(e.user_agent))) return "bots";
  return "internal";
}

/** A real lead: a capture on the check page that is not one of us or a bot
 *  (the Worker stores bot captures with is_internal = 1). */
export function isRealLead(l: Pick<FcLeadRow, "is_internal" | "source">): boolean {
  return !l.is_internal && l.source === "check_page";
}

export function countWindow(events: FcEventRow[], leads: FcLeadRow[], from: number, to: number): WindowCounts {
  const ran = new Set<string>();
  const saw = new Set<string>();
  const ai = new Set<string>();
  const excludedBySource: Record<string, number> = {};
  let excluded = 0;
  events.forEach((e, i) => {
    if (e.created_at < from || e.created_at > to) return;
    if (!isPersonEvent(e)) {
      excluded++;
      const b = excludedBucket(e);
      excludedBySource[b] = (excludedBySource[b] || 0) + 1;
      return;
    }
    const k = e.session_id || `row:${i}`;
    if (e.type === "scan") ran.add(k);
    else if (e.type === "gate_impression") saw.add(k);
    else if (e.type === "ai_check") ai.add(k);
  });
  const gaveSessions = new Set<string>();
  const otherEmails = new Set<string>();
  for (const l of leads) {
    if (l.created_at < from || l.created_at > to) continue;
    if (!isRealLead(l)) continue;
    if (l.session_id && saw.has(l.session_id)) gaveSessions.add(l.session_id);
    else otherEmails.add(l.email.toLowerCase());
  }
  return {
    ranCheck: ran.size,
    sawAsk: saw.size,
    gaveEmail: gaveSessions.size,
    otherCaptures: otherEmails.size,
    aiCheck: ai.size,
    excluded,
    excludedBySource,
  };
}

function zero(): WindowCounts {
  return { ranCheck: 0, sawAsk: 0, gaveEmail: 0, otherCaptures: 0, aiCheck: 0, excluded: 0, excludedBySource: {} };
}

export function freeCheckCounts(
  events: FcEventRow[],
  leads: FcLeadRow[],
  now: number,
  countingFrom: number | null,
): FreeCheckCounts {
  const newLeads = leads
    .filter((l) => l.created_at >= now - DAY && l.created_at <= now && isRealLead(l))
    .sort((a, b) => b.created_at - a.created_at);
  if (countingFrom === null) {
    return { now, countingFrom, day: zero(), week: zero(), newLeads };
  }
  const dayFrom = Math.max(now - DAY, countingFrom);
  const weekFrom = Math.max(now - 7 * DAY, countingFrom);
  return {
    now,
    countingFrom,
    day: countWindow(events, leads, dayFrom, now),
    week: countWindow(events, leads, weekFrom, now),
    newLeads,
  };
}

/**
 * The briefing subject counts what needs Lance. A new lead also has a
 * pending admin_inbox item, so without this it was counted twice ("1 needs
 * you, 1 new lead" for one person). Pending free-check lead items from the
 * last 24h are reported as new leads instead. Older pending lead items still
 * count as needing him.
 */
export function needsYouExcludingNewLeads(needsYou: number, pendingNewLeadItems: number, newLeadCount: number): number {
  return Math.max(0, needsYou - Math.min(pendingNewLeadItems, newLeadCount));
}

// ---------- Rendering ----------

/** "Oct 8, 10:14 AM HST". Hawaii has no daylight saving. */
export function hst(sec: number, withDate = true): string {
  const d = new Date(sec * 1000);
  const time = d.toLocaleTimeString("en-US", { timeZone: "Pacific/Honolulu", hour: "numeric", minute: "2-digit" });
  if (!withDate) return `${time} HST`;
  const date = d.toLocaleDateString("en-US", { timeZone: "Pacific/Honolulu", month: "short", day: "numeric" });
  return `${date}, ${time} HST`;
}

export function ymdHst(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

export function attribution(l: Pick<FcLeadRow, "utm_source" | "utm_campaign" | "utm_content" | "referrer">): string {
  const utm = [l.utm_source, l.utm_campaign, l.utm_content].filter((x): x is string => !!x && !!x.trim());
  if (utm.length) return utm.join(" / ");
  if (l.referrer) {
    try { return `ref ${new URL(l.referrer).hostname}`; } catch { return `ref ${l.referrer.slice(0, 60)}`; }
  }
  return "direct";
}

/** A lead with no page session came from an old cached page or a direct
 *  API call. Still a lead, but its source is unverified. */
export function unverifiedSource(l: Pick<FcLeadRow, "session_id">): boolean {
  return !l.session_id;
}

export function excludedSummary(w: WindowCounts): string {
  const parts = Object.entries(w.excludedBySource)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k} ${n}`);
  return parts.length ? `(${parts.join(", ")})` : "";
}

/** "4, which is 4 of 15 who saw the ask" (counts until 30 asks, then a %).
 *  gave is always a subset of saw, so this can never pass 100%. */
export function conversionPhrase(gave: number, saw: number): string {
  if (saw === 0) return `${gave}`;
  const g = Math.min(gave, saw);
  if (saw < PERCENT_MIN_ASKS) return `${g}, which is ${g} of ${saw} who saw the ask`;
  return `${g}, which is ${g} of ${saw} who saw the ask, ${Math.round((100 * g) / saw)}%`;
}

export function showBasisNote(c: FreeCheckCounts): boolean {
  return c.countingFrom !== null && c.now - c.countingFrom < BASIS_NOTE_DAYS * DAY;
}

const BASIS_NOTE = "The old line counted every API call over 90 days.";
const OTHER_NOTE = "no page session, or the ask was not logged: unverified source";

function leadLine(l: FcLeadRow): string {
  return `${l.domain}  ${hst(l.created_at)}  ${attribution(l)}  ${l.email}${unverifiedSource(l) ? "  (unverified source: no page session)" : ""}`;
}

export function renderFreeCheckText(c: FreeCheckCounts): string[] {
  const lines: string[] = [];
  lines.push(`FREE CHECK (people only. Internal callers and bots are excluded below)`);
  if (c.countingFrom === null) {
    lines.push(`  No page-tagged rows yet. Counting starts with the first check-page visit after the scan Worker deploy.`);
    lines.push(`  ${BASIS_NOTE}`);
  } else {
    const pad = (s: string) => s.padEnd(22);
    const num = (n: number) => String(n).padEnd(4);
    lines.push(`  ${pad("Ran a check")} ${num(c.day.ranCheck)}(last 7 days: ${c.week.ranCheck})`);
    lines.push(`  ${pad("Saw the email ask")} ${num(c.day.sawAsk)}(last 7 days: ${c.week.sawAsk})`);
    lines.push(`  ${pad("Gave an email")} ${num(c.day.gaveEmail)}(last 7 days: ${conversionPhrase(c.week.gaveEmail, c.week.sawAsk)})`);
    if (c.week.otherCaptures > 0) {
      lines.push(`  ${pad("Other captures")} ${num(c.day.otherCaptures)}(last 7 days: ${c.week.otherCaptures}. ${OTHER_NOTE})`);
    }
    if (c.week.aiCheck > 0) {
      lines.push(`  ${pad("Live AI check run")} ${num(c.day.aiCheck)}(last 7 days: ${c.week.aiCheck})`);
    }
    lines.push(`  ${pad("Excluded")} ${num(c.day.excluded)}${excludedSummary(c.day)}`.trimEnd());
    if (showBasisNote(c)) lines.push(`  Counting from ${ymdHst(c.countingFrom)}. ${BASIS_NOTE}`);
  }
  lines.push(`NEW LEADS (last 24h)`);
  if (c.newLeads.length === 0) lines.push(`  none`);
  for (const l of c.newLeads) lines.push(`  ${leadLine(l)}`);
  return lines;
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderFreeCheckHtml(c: FreeCheckCounts): string {
  const h3 = `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#555;margin:24px 0 8px">`;
  const box = `<div style="font-family:'SF Mono',Menlo,monospace;font-size:12px;line-height:1.8">`;
  let body: string;
  if (c.countingFrom === null) {
    body = `<div>No page-tagged rows yet. Counting starts with the first check-page visit after the scan Worker deploy.</div><div style="color:#888">${escapeHtml(BASIS_NOTE)}</div>`;
  } else {
    const row = (label: string, day: number, week: string) =>
      `<div>${escapeHtml(label)}: <strong>${day}</strong> <span style="color:#888">(last 7 days: ${escapeHtml(week)})</span></div>`;
    body = [
      row("Ran a check", c.day.ranCheck, String(c.week.ranCheck)),
      row("Saw the email ask", c.day.sawAsk, String(c.week.sawAsk)),
      row("Gave an email", c.day.gaveEmail, conversionPhrase(c.week.gaveEmail, c.week.sawAsk)),
      c.week.otherCaptures > 0 ? row("Other captures", c.day.otherCaptures, `${c.week.otherCaptures}. ${OTHER_NOTE}`) : "",
      c.week.aiCheck > 0 ? row("Live AI check run", c.day.aiCheck, String(c.week.aiCheck)) : "",
      `<div>Excluded: <strong>${c.day.excluded}</strong> <span style="color:#888">${escapeHtml(excludedSummary(c.day))}</span></div>`,
      showBasisNote(c) ? `<div style="color:#888">Counting from ${escapeHtml(ymdHst(c.countingFrom))}. ${escapeHtml(BASIS_NOTE)}</div>` : "",
    ].join("");
  }
  const leads = c.newLeads.length === 0
    ? `<div style="color:#888">none</div>`
    : c.newLeads.map((l) =>
        `<div style="padding:4px 0;border-bottom:1px solid #eee"><strong>${escapeHtml(l.domain)}</strong> <span style="color:#999">${escapeHtml(hst(l.created_at))}</span> ${escapeHtml(attribution(l))} <span style="color:#555">${escapeHtml(l.email)}</span>${unverifiedSource(l) ? ` <span style="color:#b45309">unverified source: no page session</span>` : ""}</div>`,
      ).join("");
  return `${h3}Free check (people only)</h3>
${box}${body}</div>
${h3}New leads (last 24h)</h3>
${box}${leads}</div>`;
}
