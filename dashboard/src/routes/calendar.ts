/**
 * Content calendar -- the customer's "content runway" view.
 *
 * Three columns: This Month, Next Month, Published. Shows scheduled
 * drafts at every stage: planned (topic locked, no draft) -> drafted
 * (awaiting approval) -> approved (will auto-ship) -> published (live).
 *
 * The customer can:
 *   - Add a topic manually
 *   - Add a topic from the citation-gap suggestions surfaced below
 *   - Skip a planned topic they don't want
 *   - Edit the scheduled date (Phase B)
 *
 * Routes:
 *   GET  /calendar/:slug                    -> the runway view
 *   POST /calendar/:slug/add                -> create a scheduled_drafts row
 *   POST /calendar/:slug/skip/:id           -> mark as skipped
 */

import type { Env, User, ScheduledDraft } from "../types";
import { layout, html, esc, redirect } from "../render";
import { canAccessClient } from "../agency";
import { canUseDraftingFeature } from "../gating";
import { getConnection } from "../wordpress";

// ---------- helpers ----------

function monthStart(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), 1).getTime() / 1000);
}
function monthEnd(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime() / 1000) - 1;
}

function statusBadge(status: ScheduledDraft["status"]): string {
  const map: Record<string, { color: string; label: string; bg: string }> = {
    planned:   { color: "var(--text-faint)", label: "Planned", bg: "rgba(251,248,239,.04)" },
    drafted:   { color: "var(--gold)",       label: "Needs review", bg: "rgba(201,168,76,.14)" },
    approved:  { color: "var(--gold)",       label: "Approved", bg: "rgba(201,168,76,.08)" },
    published: { color: "var(--green)",      label: "Published", bg: "rgba(94,199,106,.10)" },
    skipped:   { color: "var(--text-faint)", label: "Skipped", bg: "rgba(251,248,239,.03)" },
    failed:    { color: "var(--red)",        label: "Failed", bg: "rgba(232,84,84,.10)" },
  };
  const s = map[status] || map.planned;
  return `<span style="font-family:var(--label);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${s.color};background:${s.bg};padding:3px 8px;border-radius:2px">${s.label}</span>`;
}

function itemCard(item: ScheduledDraft, clientSlug: string): string {
  const date = new Date(item.scheduled_date * 1000);
  const dateLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const canSkip = item.status === "planned" || item.status === "drafted";
  const draftHref = item.draft_id ? `/drafts/${esc(clientSlug)}/${item.draft_id}` : null;
  const liveHref = item.published_url;

  // Outcome line (Phase C): only rendered for published items. Shows
  // earned citations since publish, plus peak rank if we have it.
  let outcomeLine = "";
  if (item.status === "published" && item.published_at) {
    const daysLive = Math.max(0, Math.floor((Date.now() / 1000 - item.published_at) / 86400));
    const earned = item.earned_citations_count || 0;
    const rankPart = item.rank_peak ? ` &middot; peak rank #${item.rank_peak}` : "";
    const outcomeColor = earned > 0 ? "var(--green)" : "var(--text-faint)";
    outcomeLine = `
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-family:var(--mono);font-size:11px;color:${outcomeColor};line-height:1.5">
        ${earned > 0 ? `&uarr; ${earned} citation${earned === 1 ? "" : "s"} earned` : "no citations yet"}${rankPart}
        <span style="color:var(--text-faint)"> &middot; ${daysLive}d live</span>
      </div>
    `;
  }

  return `
    <div style="padding:14px 16px;background:var(--bg-lift);border:1px solid var(--line);border-radius:3px;margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px">
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${dateLabel}${item.kind !== "article" ? ` &middot; ${esc(item.kind)}` : ""}</div>
        ${statusBadge(item.status)}
      </div>
      <div style="font-family:var(--serif);font-size:16px;color:var(--text);line-height:1.35;margin-bottom:10px">
        ${draftHref ? `<a href="${draftHref}" style="color:var(--text);text-decoration:none;border-bottom:1px solid var(--line)">${esc(item.title)}</a>` : esc(item.title)}
      </div>
      <div style="display:flex;gap:10px;align-items:center;font-size:11px;color:var(--text-faint);flex-wrap:wrap">
        ${draftHref ? `<a href="${draftHref}" style="color:var(--gold);text-decoration:none">Open draft &rarr;</a>` : ""}
        ${liveHref ? `<a href="${esc(liveHref)}" target="_blank" rel="noopener" style="color:var(--green);text-decoration:none">View live &#8599;</a>` : ""}
        ${canSkip ? `
          <form method="POST" action="/calendar/${esc(clientSlug)}/skip/${item.id}" style="display:inline;margin-left:auto" onsubmit="return confirm('Skip this topic? We won\\'t draft or publish it.')">
            <button type="submit" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-family:var(--mono);font-size:11px;padding:0;text-decoration:underline">skip</button>
          </form>
        ` : ""}
        ${item.status === "failed" && item.error ? `<span style="color:var(--red);font-size:11px">${esc(item.error).slice(0, 80)}</span>` : ""}
      </div>
      ${outcomeLine}
    </div>
  `;
}

function emptyColumn(label: string): string {
  return `<div style="padding:20px 16px;border:1px dashed var(--line);border-radius:3px;font-family:var(--mono);font-size:12px;color:var(--text-faint);text-align:center">${label}</div>`;
}

// ---------- GET calendar ----------

export async function handleCalendarGet(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  if (!canUseDraftingFeature(user)) {
    // Drafts page already renders an Amplify nudge via renderUpgradeNudge;
    // for calendar, send them there rather than duplicate the surface.
    return redirect(`/drafts/${encodeURIComponent(clientSlug)}`);
  }

  // Month boundaries
  const now = new Date();
  const thisMonthStart = monthStart(now);
  const thisMonthEnd = monthEnd(now);
  const nextMonthStart = monthStart(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const nextMonthEnd = monthEnd(new Date(now.getFullYear(), now.getMonth() + 1, 1));

  // Pull every row for this client. Small table per client; full scan is fine.
  const rows = (await env.DB.prepare(
    `SELECT * FROM scheduled_drafts WHERE client_slug = ? ORDER BY scheduled_date ASC, id ASC`,
  ).bind(clientSlug).all<ScheduledDraft>()).results;

  const thisMonth = rows.filter(r => r.scheduled_date >= thisMonthStart && r.scheduled_date <= thisMonthEnd && r.status !== "published" && r.status !== "skipped");
  const nextMonth = rows.filter(r => r.scheduled_date >= nextMonthStart && r.scheduled_date <= nextMonthEnd && r.status !== "published" && r.status !== "skipped");
  const publishedAll = rows.filter(r => r.status === "published");
  const published = publishedAll.slice(0, 8);

  // Publishing connection state + pause state (for the header).
  const conn = await getConnection(clientSlug, env);
  const settings = await env.DB.prepare(
    "SELECT pipeline_paused_at, pipeline_pause_reason FROM client_settings WHERE client_slug = ?",
  ).bind(clientSlug).first<{ pipeline_paused_at: number | null; pipeline_pause_reason: string | null }>();

  // Roll-up stats for the Impact strip (Phase D). Only rendered when
  // the customer has at least one published piece.
  const totalPublished = publishedAll.length;
  const totalCitationsEarned = publishedAll.reduce((sum, r) => sum + (r.earned_citations_count || 0), 0);
  const indexedCount = publishedAll.filter(r => r.indexed_at !== null).length;
  const bestRank = publishedAll
    .map(r => r.rank_peak)
    .filter((r): r is number => r !== null && r !== undefined)
    .reduce<number | null>((best, r) => best === null || r < best ? r : best, null);

  // Surface topic suggestions from citation gaps the user isn't cited
  // on. Keeps this page the one place the customer goes to plan.
  const gaps = (await env.DB.prepare(`
    SELECT DISTINCT ck.keyword, ck.id
    FROM citation_runs cr
    JOIN citation_keywords ck ON ck.id = cr.keyword_id
    WHERE ck.client_slug = ?
      AND cr.client_cited = 0
      AND cr.cited_entities != '[]'
    ORDER BY cr.run_at DESC
    LIMIT 20
  `).bind(clientSlug).all<{ keyword: string; id: number }>()).results;

  // Default next-available slot: the next 7th of the month after today,
  // or the 21st, whichever is closer. Just a reasonable default so the
  // customer doesn't have to pick a date.
  const suggestedDate = (() => {
    const candidates = [
      new Date(now.getFullYear(), now.getMonth(), 7),
      new Date(now.getFullYear(), now.getMonth(), 21),
      new Date(now.getFullYear(), now.getMonth() + 1, 7),
      new Date(now.getFullYear(), now.getMonth() + 1, 21),
    ];
    for (const c of candidates) {
      if (c.getTime() > now.getTime()) return c;
    }
    return candidates[candidates.length - 1];
  })();
  const suggestedDateStr = suggestedDate.toISOString().slice(0, 10);

  const body = `
    <div style="margin-bottom:32px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div>
        <div class="label" style="margin-bottom:8px"><a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}</div>
        <h1>Content <em>calendar</em></h1>
        <p class="section-sub" style="margin-top:8px;max-width:720px">Your content runway. Plan the topics, the system drafts them in your voice, QA checks them, you approve, and they publish to WordPress on schedule.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="/publishing/${esc(clientSlug)}" class="btn btn-ghost">${conn ? "Publishing settings" : "Connect WordPress"}</a>
        <a href="#add-topic" class="btn" onclick="setTimeout(function(){var el=document.querySelector('#add-topic input[name=title]');if(el)el.focus();},50)">Add topic</a>
      </div>
    </div>

    ${settings?.pipeline_paused_at ? `
      <div style="margin-bottom:20px;padding:14px 18px;background:rgba(201,168,76,.08);border:1px solid var(--gold-dim);border-radius:3px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between">
          <div style="font-size:13px;color:var(--text);line-height:1.55">
            <strong>Pipeline is paused.</strong> We've stopped auto-generating drafts ${settings.pipeline_pause_reason === "two_rejections_in_a_row" ? "after two rejected drafts in a row" : ""}. Approve any pending draft to resume, or resume manually.
          </div>
          <form method="POST" action="/publishing/${esc(clientSlug)}/unpause" style="margin:0">
            <button type="submit" class="btn" style="white-space:nowrap">Resume pipeline</button>
          </form>
        </div>
      </div>
    ` : ""}

    ${!conn ? `
      <div style="margin-bottom:24px;padding:16px 20px;background:rgba(201,168,76,.08);border:1px solid var(--gold-dim);border-radius:3px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between">
          <div style="font-size:13px;color:var(--text)">
            <strong>Connect your WordPress site</strong> so approved drafts publish automatically on their scheduled date. Without this, we'll email you the finished drafts.
          </div>
          <a href="/publishing/${esc(clientSlug)}" class="btn btn-ghost" style="white-space:nowrap">Set up publishing &rarr;</a>
        </div>
      </div>
    ` : ""}

    ${totalPublished > 0 ? `
      <!-- Impact roll-up: the at-a-glance outcome strip. Only renders
           when the customer has actually shipped something. -->
      <div style="margin-bottom:28px;padding:22px 26px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <div class="label" style="margin-bottom:14px;color:var(--gold)">Impact</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:20px">
          <div>
            <div style="font-family:var(--serif);font-size:32px;color:var(--text);line-height:1;font-weight:400">${totalPublished}</div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:6px;letter-spacing:.06em">piece${totalPublished === 1 ? "" : "s"} shipped</div>
          </div>
          <div>
            <div style="font-family:var(--serif);font-size:32px;color:${totalCitationsEarned > 0 ? "var(--green)" : "var(--text)"};line-height:1;font-weight:400">${totalCitationsEarned > 0 ? "+" : ""}${totalCitationsEarned}</div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:6px;letter-spacing:.06em">citation${totalCitationsEarned === 1 ? "" : "s"} earned</div>
          </div>
          <div>
            <div style="font-family:var(--serif);font-size:32px;color:var(--text);line-height:1;font-weight:400">${indexedCount}<span style="font-size:18px;color:var(--text-faint)"> / ${totalPublished}</span></div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:6px;letter-spacing:.06em">indexed in Search Console</div>
          </div>
          <div>
            <div style="font-family:var(--serif);font-size:32px;color:var(--text);line-height:1;font-weight:400">${bestRank !== null ? "#" + bestRank : "--"}</div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:6px;letter-spacing:.06em">best rank achieved</div>
          </div>
        </div>
      </div>
    ` : ""}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:48px">
      <div>
        <div class="label" style="margin-bottom:12px">This month (${new Date().toLocaleDateString("en-US", { month: "long" })})</div>
        ${thisMonth.length > 0 ? thisMonth.map(i => itemCard(i, clientSlug)).join("") : emptyColumn("Nothing scheduled this month yet")}
      </div>
      <div>
        <div class="label" style="margin-bottom:12px">Next month</div>
        ${nextMonth.length > 0 ? nextMonth.map(i => itemCard(i, clientSlug)).join("") : emptyColumn("Add topics to queue up next month")}
      </div>
      <div>
        <div class="label" style="margin-bottom:12px">Recently published</div>
        ${published.length > 0 ? published.map(i => itemCard(i, clientSlug)).join("") : emptyColumn("Published posts will land here")}
      </div>
    </div>

    <section id="add-topic" style="margin-bottom:48px;padding:28px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;scroll-margin-top:24px">
      <div class="label" style="margin-bottom:8px;color:var(--gold)">Add a topic</div>
      <h2 style="margin:0 0 14px;font-family:var(--serif);font-size:22px;font-style:italic">What should we write about next?</h2>
      <form method="POST" action="/calendar/${esc(clientSlug)}/add" style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:12px;align-items:flex-end;max-width:920px">
        <div class="form-group" style="margin:0">
          <label>Topic / working title</label>
          <input type="text" name="title" placeholder="e.g. How chiropractors rank in ChatGPT when patients ask for a recommendation" required style="width:100%">
        </div>
        <div class="form-group" style="margin:0">
          <label>Format</label>
          <select name="kind" style="width:100%">
            <option value="article">Blog post</option>
            <option value="landing">Landing page</option>
            <option value="faq">FAQ page</option>
            <option value="service_page">Service page</option>
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label>Ship on</label>
          <input type="date" name="scheduled_date" value="${suggestedDateStr}" required style="width:100%">
        </div>
        <button type="submit" class="btn" style="white-space:nowrap;margin-bottom:0">Add to calendar</button>
      </form>
    </section>

    ${gaps.length > 0 ? `
    <section style="margin-bottom:48px">
      <div class="label" style="margin-bottom:12px">Suggested from your citation gaps</div>
      <p style="font-size:13px;color:var(--text-faint);line-height:1.65;max-width:680px;margin:0 0 16px">These are keywords where competitors are cited in AI results and you aren't. Great candidates for the next few pieces.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">
        ${gaps.slice(0, 12).map(g => `
          <form method="POST" action="/calendar/${esc(clientSlug)}/add" style="margin:0">
            <input type="hidden" name="title" value="${esc(g.keyword)}">
            <input type="hidden" name="kind" value="article">
            <input type="hidden" name="scheduled_date" value="${suggestedDateStr}">
            <input type="hidden" name="topic_source" value="citation_gap">
            <input type="hidden" name="source_ref" value="${g.id}">
            <button type="submit" style="display:block;width:100%;text-align:left;padding:12px 14px;background:var(--bg-lift);border:1px solid var(--line);border-radius:3px;cursor:pointer;transition:border-color .2s,background .15s;font-family:inherit" onmouseover="this.style.borderColor='var(--gold-dim)';this.style.background='var(--gold-wash)'" onmouseout="this.style.borderColor='var(--line)';this.style.background='var(--bg-lift)'">
              <div style="font-family:var(--serif);font-size:14px;color:var(--text);line-height:1.4;margin-bottom:4px">${esc(g.keyword)}</div>
              <div style="font-family:var(--mono);font-size:10px;color:var(--gold)">+ add to calendar</div>
            </button>
          </form>
        `).join("")}
      </div>
    </section>
    ` : ""}
  `;

  return html(layout("Calendar", body, user, clientSlug));
}

// ---------- POST add ----------

export async function handleCalendarAdd(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) return redirect("/");
  if (!canUseDraftingFeature(user)) return redirect("/settings");

  const form = await request.formData();
  const title = String(form.get("title") || "").trim();
  const kind = String(form.get("kind") || "article").trim();
  const scheduled_date_str = String(form.get("scheduled_date") || "").trim();
  const topic_source = String(form.get("topic_source") || "manual").trim();
  const source_ref = form.get("source_ref") ? String(form.get("source_ref")) : null;

  if (!title || title.length < 6) {
    return redirect(`/calendar/${encodeURIComponent(clientSlug)}`);
  }

  // Convert YYYY-MM-DD to unix seconds at 9am UTC (sensible ship time).
  let scheduled_date_s: number;
  if (scheduled_date_str) {
    const dt = new Date(scheduled_date_str + "T09:00:00Z");
    scheduled_date_s = Math.floor(dt.getTime() / 1000);
  } else {
    // Default: 2 weeks from now.
    scheduled_date_s = Math.floor(Date.now() / 1000) + 14 * 86400;
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO scheduled_drafts (
       client_slug, title, kind, topic_source, source_ref,
       scheduled_date, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?)`,
  ).bind(clientSlug, title, kind, topic_source, source_ref, scheduled_date_s, now, now).run();

  return redirect(`/calendar/${encodeURIComponent(clientSlug)}`);
}

// ---------- POST skip ----------

export async function handleCalendarSkip(clientSlug: string, id: number, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) return redirect("/");
  if (!canUseDraftingFeature(user)) return redirect("/settings");

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE scheduled_drafts SET status = 'skipped', updated_at = ? WHERE id = ? AND client_slug = ?",
  ).bind(now, id, clientSlug).run();

  return redirect(`/calendar/${encodeURIComponent(clientSlug)}`);
}
