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
 * is_internal = 0 and is_bot = 0. This module only counts. It is pure, so
 * the briefing and the admin page compute the same numbers from the same
 * rows, and the tests can pin them.
 *
 * Rules, each one a lesson from a number that misled:
 *   - people are distinct sessions, not rows (one person checking three
 *     domains ran one check session, not three people)
 *   - "Gave an email" counts distinct non-internal emails in the leads table
 *   - the capture rate prints as counts ("4 of 15") until the 7-day ask
 *     count reaches 30. A percentage of 7 is noise wearing a decimal point
 *   - nothing is counted from before the first page-tagged row ("counting
 *     from"), so backfilled legacy rows and pre-deploy traffic never mix
 *     with the new basis. The note stays for 14 days, so a drop from about
 *     116 to single digits reads as a change of basis, not a collapse
 *   - excluded traffic is shown by source, never silently dropped
 */

export interface FcEventRow {
  type: string;
  source: string;
  is_internal: number;
  is_bot: number;
  session_id: string | null;
  ip_hash: string | null;
  domain?: string | null;
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
  gaveEmail: number;
  aiCheck: number;
  excluded: number;
  excludedBySource: Record<string, number>;
}

export interface FreeCheckCounts {
  now: number;
  countingFrom: number | null;
  day: WindowCounts;
  week: WindowCounts;
  /** Non-internal check-page leads in the last 24h, newest first. */
  newLeads: FcLeadRow[];
}

export const DAY = 86_400;
export const PERCENT_MIN_ASKS = 30;
export const BASIS_NOTE_DAYS = 14;

export function isPersonEvent(e: Pick<FcEventRow, "source" | "is_internal" | "is_bot">): boolean {
  return e.source === "page" && !e.is_internal && !e.is_bot;
}

/** Which bucket an excluded row is reported under. Non-page callers by
 *  their source; page rows by why they were excluded. */
export function excludedBucket(e: Pick<FcEventRow, "source" | "is_internal" | "is_bot">): string {
  if (e.source !== "page") return e.source || "unknown";
  if (e.is_bot) return "bots";
  return "internal";
}

function personKey(e: FcEventRow, i: number): string {
  return e.session_id || (e.ip_hash ? `ip:${e.ip_hash}` : `row:${i}`);
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
    const k = personKey(e, i);
    if (e.type === "scan") ran.add(k);
    else if (e.type === "gate_impression") saw.add(k);
    else if (e.type === "ai_check") ai.add(k);
  });
  const emails = new Set<string>();
  for (const l of leads) {
    if (l.created_at < from || l.created_at > to) continue;
    if (l.is_internal || l.source !== "check_page") continue;
    emails.add(l.email.toLowerCase());
  }
  return { ranCheck: ran.size, sawAsk: saw.size, gaveEmail: emails.size, aiCheck: ai.size, excluded, excludedBySource };
}

const ZERO: WindowCounts = { ranCheck: 0, sawAsk: 0, gaveEmail: 0, aiCheck: 0, excluded: 0, excludedBySource: {} };

export function freeCheckCounts(
  events: FcEventRow[],
  leads: FcLeadRow[],
  now: number,
  countingFrom: number | null,
): FreeCheckCounts {
  if (countingFrom === null) {
    return { now, countingFrom, day: { ...ZERO, excludedBySource: {} }, week: { ...ZERO, excludedBySource: {} }, newLeads: [] };
  }
  const dayFrom = Math.max(now - DAY, countingFrom);
  const weekFrom = Math.max(now - 7 * DAY, countingFrom);
  const newLeads = leads
    .filter((l) => l.created_at >= dayFrom && l.created_at <= now && !l.is_internal && l.source === "check_page")
    .sort((a, b) => b.created_at - a.created_at);
  return {
    now,
    countingFrom,
    day: countWindow(events, leads, dayFrom, now),
    week: countWindow(events, leads, weekFrom, now),
    newLeads,
  };
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

export function excludedSummary(w: WindowCounts): string {
  const parts = Object.entries(w.excludedBySource)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k} ${n}`);
  return parts.length ? `(${parts.join(", ")})` : "";
}

/** "4, which is 4 of 15 who saw the ask" (counts until 30 asks, then a %). */
export function conversionPhrase(gave: number, saw: number): string {
  if (saw === 0) return `${gave}`;
  if (saw < PERCENT_MIN_ASKS) return `${gave}, which is ${gave} of ${saw} who saw the ask`;
  return `${gave}, which is ${gave} of ${saw} who saw the ask, ${Math.round((100 * gave) / saw)}%`;
}

export function showBasisNote(c: FreeCheckCounts): boolean {
  return c.countingFrom !== null && c.now - c.countingFrom < BASIS_NOTE_DAYS * DAY;
}

const BASIS_NOTE = "The old line counted every API call over 90 days.";

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
    if (c.week.aiCheck > 0) {
      lines.push(`  ${pad("Live AI check run")} ${num(c.day.aiCheck)}(last 7 days: ${c.week.aiCheck})`);
    }
    lines.push(`  ${pad("Excluded")} ${num(c.day.excluded)}${excludedSummary(c.day)}`.trimEnd());
    if (showBasisNote(c)) lines.push(`  Counting from ${ymdHst(c.countingFrom)}. ${BASIS_NOTE}`);
  }
  lines.push(`NEW LEADS (last 24h)`);
  if (c.newLeads.length === 0) lines.push(`  none`);
  for (const l of c.newLeads) {
    lines.push(`  ${l.domain}  ${hst(l.created_at)}  ${attribution(l)}  ${l.email}`);
  }
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
      c.week.aiCheck > 0 ? row("Live AI check run", c.day.aiCheck, String(c.week.aiCheck)) : "",
      `<div>Excluded: <strong>${c.day.excluded}</strong> <span style="color:#888">${escapeHtml(excludedSummary(c.day))}</span></div>`,
      showBasisNote(c) ? `<div style="color:#888">Counting from ${escapeHtml(ymdHst(c.countingFrom))}. ${escapeHtml(BASIS_NOTE)}</div>` : "",
    ].join("");
  }
  const leads = c.newLeads.length === 0
    ? `<div style="color:#888">none</div>`
    : c.newLeads.map((l) =>
        `<div style="padding:4px 0;border-bottom:1px solid #eee"><strong>${escapeHtml(l.domain)}</strong> <span style="color:#999">${escapeHtml(hst(l.created_at))}</span> ${escapeHtml(attribution(l))} <span style="color:#555">${escapeHtml(l.email)}</span></div>`,
      ).join("");
  return `${h3}Free check (people only)</h3>
${box}${body}</div>
${h3}New leads (last 24h)</h3>
${box}${leads}</div>`;
}
