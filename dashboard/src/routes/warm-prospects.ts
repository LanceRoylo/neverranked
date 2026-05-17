/**
 * /admin/warm-prospects
 *
 * Lists multi-opener prospects sorted by signal tier. Per row:
 * tier badge, open count, recency, score. Click into a detail view
 * to generate a follow-up draft and mark sent.
 *
 *   GET  /admin/warm-prospects
 *   GET  /admin/warm-prospects/:prospect_id
 *   POST /admin/warm-prospects/:prospect_id/draft
 *   POST /admin/warm-prospects/:prospect_id/action/:action_id/sent
 *   POST /admin/warm-prospects/:prospect_id/action/:action_id/declined
 */

import type { Env, User } from "../types";
import { html, layout, esc, redirect } from "../render";
import {
  getProspectWarmth,
  getLastFollowupAction,
  recordDraftedFollowup,
  markFollowupSent,
  markFollowupDeclined,
  type SignalTier,
} from "../outreach/warmth";
import { isPrefetchOpen } from "../outreach/prefetch";
import { generateFollowupDraft, templateKindForTier, TEMPLATE_VERSION } from "../outreach/templates";
import { getPreviewByProspectId } from "../preview/generator";

const TIER_COLORS: Record<SignalTier, string> = {
  cold: "var(--text-faint)",
  warm: "#bfa04d",
  very_warm: "#e8c767",
  hot: "#dc6c6c",
  fading: "var(--text-mute)",
};

const TIER_LABELS: Record<SignalTier, string> = {
  cold: "Cold",
  warm: "Warm",
  very_warm: "Very warm",
  hot: "Hot",
  fading: "Fading",
};

function fmtAge(seconds: number): string {
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ===========================================================================
// GET /admin/warm-prospects
// ===========================================================================

export async function handleWarmProspectsIndex(user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") {
    return html(layout("Not authorized", `<div class="empty"><h3>Admin only</h3></div>`, user), 403);
  }

  const list = await getProspectWarmth(env);
  const now = Math.floor(Date.now() / 1000);

  const cardStyle = "margin-bottom:18px;padding:20px 22px;background:var(--bg-lift);border:1px solid var(--line);border-radius:6px";

  if (list.length === 0) {
    const body = `
      <h1>Warm <em>prospects</em></h1>
      <div style="${cardStyle};margin-top:24px;text-align:center;color:var(--text-mute)">
        <p style="margin:0 0 6px;font-size:15px">No multi-opener prospects yet.</p>
        <p style="margin:0;color:var(--text-faint);font-size:13px">As outreach prospects open emails 2+ times, they'll surface here ranked by signal strength.</p>
      </div>
    `;
    return html(layout("Warm prospects", body, user));
  }

  const rows = list.map((p) => `
    <tr style="border-bottom:1px solid var(--line)">
      <td style="padding:14px 12px;vertical-align:top">
        <div style="font-size:14px;color:var(--text);margin-bottom:3px">${esc(p.name || `Prospect #${p.prospect_id}`)}</div>
        <div style="color:var(--text-soft);font-size:12px;margin-bottom:2px">${esc(p.company_name || "")}${p.company_name && p.market ? " · " : ""}${esc(p.market || "")}</div>
        <div style="color:var(--text-faint);font-size:11.5px;font-family:var(--mono)">${esc(p.email || "")}${p.email ? " · " : ""}#${p.prospect_id}</div>
      </td>
      <td style="padding:14px 12px;vertical-align:top">
        <span style="display:inline-block;padding:3px 9px;background:rgba(191,160,77,0.15);color:${TIER_COLORS[p.tier]};font-family:var(--mono);font-size:11px;font-weight:600;border-radius:10px;border:1px solid ${TIER_COLORS[p.tier]}">${TIER_LABELS[p.tier]}</span>
      </td>
      <td style="padding:14px 12px;vertical-align:top;font-family:var(--mono);font-size:13px;color:var(--text-soft)">${p.open_count}</td>
      <td style="padding:14px 12px;vertical-align:top;color:var(--text-faint);font-size:12px;font-family:var(--mono)">${fmtAge(now - p.last_open_at)}</td>
      <td style="padding:14px 12px;vertical-align:top;font-family:var(--mono);font-size:13px;color:var(--text-soft)">${p.score}</td>
      <td style="padding:14px 12px;vertical-align:top;text-align:right">
        <a href="/admin/warm-prospects/${p.prospect_id}" style="padding:7px 14px;background:var(--gold);color:#1a1814;border:0;text-decoration:none;font-size:12px;font-weight:600;border-radius:3px;font-family:inherit">Open</a>
      </td>
    </tr>
  `).join("");

  const body = `
    <div style="margin-bottom:24px;max-width:760px">
      <h1>Warm <em>prospects</em></h1>
      <p style="color:var(--text-mute);margin-top:10px;line-height:1.6;font-size:14px">
        Outreach prospects ranked by signal strength. Multiple opens, fast re-engagement, and forwarding behavior all lift the score. Click any row to draft a voice-clean follow-up email gated to the right tier.
      </p>
      <p style="color:var(--text-faint);margin-top:8px;line-height:1.6;font-size:12px">
        Two steps per lead: <strong>Build Preview</strong> first (the personalized brief page at a private URL the lead clicks), then <strong>Build Draft</strong> (the follow-up email that links to that Preview URL). Build Preview before Build Draft so the email has a URL to point at.
      </p>
    </div>

    <div style="${cardStyle}">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid var(--line)">
            <th style="text-align:left;padding:10px 12px;font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);font-weight:500">Prospect</th>
            <th style="text-align:left;padding:10px 12px;font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);font-weight:500">Tier</th>
            <th style="text-align:left;padding:10px 12px;font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);font-weight:500">Opens</th>
            <th style="text-align:left;padding:10px 12px;font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);font-weight:500">Last</th>
            <th style="text-align:left;padding:10px 12px;font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);font-weight:500">Score</th>
            <th style="padding:10px 12px"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  return html(layout("Warm prospects", body, user));
}

// ===========================================================================
// GET /admin/warm-prospects/:prospect_id
// ===========================================================================

export async function handleWarmProspectDetail(
  prospect_id: number,
  user: User,
  env: Env,
  request?: Request,
): Promise<Response> {
  if (user.role !== "admin") {
    return html(layout("Not authorized", `<div class="empty"><h3>Admin only</h3></div>`, user), 403);
  }
  // Build errors from /preview/build redirect here with ?build_error=...
  // so the user sees why their click didn't produce a Preview.
  let buildError: string | null = null;
  if (request) {
    try {
      const u = new URL(request.url);
      buildError = u.searchParams.get("build_error");
    } catch { /* skip */ }
  }

  const allWarmth = await getProspectWarmth(env);
  const warmth = allWarmth.find((p) => p.prospect_id === prospect_id);
  if (!warmth) {
    return html(layout("Not found", `<div class="empty"><h3>Prospect not in warmth list (needs 2+ opens)</h3></div>`, user), 404);
  }

  // Open timeline -- the actual rows from email_opens for this prospect
  const opens = (
    await env.DB.prepare(
      `SELECT opened_at, ip_hash, ua FROM email_opens
        WHERE prospect_id = ?
        ORDER BY opened_at ASC`,
    ).bind(prospect_id).all<{ opened_at: number; ip_hash: string | null; ua: string | null }>()
  ).results;

  // Auto-retire stale drafts: 'drafted' rows created under an older
  // TEMPLATE_VERSION get declined on page load so stale advice never
  // shows; the re-draft dedup then kicks in (row no longer 'drafted').
  //
  // FOOTGUN GUARD (2026-05-16): TEMPLATE_VERSION is a hand-maintained
  // epoch and MUST be in the past. It was once set to a FUTURE time,
  // so `created_at < TEMPLATE_VERSION` was always true and EVERY
  // freshly built draft was silently auto-declined (the "Build Draft
  // does nothing" bug). A future watermark is a misconfiguration, not
  // a signal to nuke everything — skip the retire entirely and warn,
  // so the failure mode is "stale drafts linger" (safe, visible), not
  // "all drafts silently destroyed".
  const nowEpoch = Math.floor(Date.now() / 1000);
  if (TEMPLATE_VERSION > nowEpoch) {
    console.warn(
      `[warm-prospects] TEMPLATE_VERSION (${TEMPLATE_VERSION}) is in the FUTURE ` +
        `(now=${nowEpoch}). Skipping auto-retire to avoid silently declining ` +
        `every draft. Fix TEMPLATE_VERSION to a past epoch.`,
    );
  } else {
    await env.DB.prepare(
      `UPDATE outreach_followup_actions
          SET status = 'declined',
              declined_at = unixepoch(),
              declined_reason = 'auto-retired by template version upgrade'
        WHERE prospect_id = ?
          AND status = 'drafted'
          AND created_at < ?`,
    ).bind(prospect_id, TEMPLATE_VERSION).run();
  }

  // Follow-up history for this prospect
  const history = (
    await env.DB.prepare(
      `SELECT id, template_kind, status, subject, body, created_at, sent_at, declined_at, declined_reason
         FROM outreach_followup_actions
        WHERE prospect_id = ?
        ORDER BY created_at DESC`,
    ).bind(prospect_id).all<{
      id: number; template_kind: string; status: string;
      subject: string | null; body: string | null;
      created_at: number; sent_at: number | null; declined_at: number | null;
      declined_reason: string | null;
    }>()
  ).results;

  const lastAction = history[0];
  const latestDraft = history.find((h) => h.status === "drafted");

  const cardStyle = "margin-bottom:18px;padding:20px 22px;background:var(--bg-lift);border:1px solid var(--line);border-radius:6px";

  const summaryCard = `
    <div style="${cardStyle}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">${esc(warmth.company_name || `Prospect #${prospect_id}`)} · #${prospect_id}</div>
          <h2 style="margin:0 0 4px;font-size:20px;color:var(--text)">${esc(warmth.name || `Prospect #${prospect_id}`)}</h2>
          <div style="color:var(--text-soft);font-size:13px;font-family:var(--mono)">${esc(warmth.email || "no email on file")}${warmth.market ? " · " + esc(warmth.market) : ""}</div>
          <div style="color:var(--text-faint);font-size:13px;margin-top:4px">${TIER_LABELS[warmth.tier]} · ${warmth.open_count} opens · score ${warmth.score}</div>
        </div>
        <span style="display:inline-block;padding:5px 12px;background:rgba(191,160,77,0.15);color:${TIER_COLORS[warmth.tier]};font-family:var(--mono);font-size:12px;font-weight:600;border-radius:12px;border:1px solid ${TIER_COLORS[warmth.tier]}">${TIER_LABELS[warmth.tier]}</span>
      </div>
      <table style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--line);border-radius:4px;background:var(--bg-edge);font-size:13px">
        <tr><td style="padding:8px 12px;color:var(--text-faint);width:35%">First open</td><td style="padding:8px 12px;color:var(--text);font-family:var(--mono)">${new Date(warmth.first_open_at * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</td></tr>
        <tr><td style="padding:8px 12px;color:var(--text-faint)">Last open</td><td style="padding:8px 12px;color:var(--text);font-family:var(--mono)">${new Date(warmth.last_open_at * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</td></tr>
        <tr><td style="padding:8px 12px;color:var(--text-faint)">Hours since last</td><td style="padding:8px 12px;color:var(--text);font-family:var(--mono)">${warmth.hours_since_last.toFixed(1)}h</td></tr>
        ${warmth.hours_between_first_two !== null ? `<tr><td style="padding:8px 12px;color:var(--text-faint)">Time to second open</td><td style="padding:8px 12px;color:var(--text);font-family:var(--mono)">${warmth.hours_between_first_two.toFixed(1)}h</td></tr>` : ""}
        <tr><td style="padding:8px 12px;color:var(--text-faint)">Distinct IPs</td><td style="padding:8px 12px;color:var(--text);font-family:var(--mono)">${warmth.ip_diversity}${warmth.ip_diversity >= 2 ? " (possibly forwarded)" : ""}</td></tr>
        ${warmth.prefetch_count > 0 ? `<tr><td style="padding:8px 12px;color:var(--text-faint)">Filtered (proxy/bot)</td><td style="padding:8px 12px;color:var(--text-faint);font-family:var(--mono)">${warmth.prefetch_count} ignored</td></tr>` : ""}
      </table>
    </div>
  `;

  // Annotate each open with its pre-fetch verdict so a dimmed row in
  // the timeline tells you why the count doesn't match the row total.
  const annotatedOpens = opens.map((o) => ({ ...o, verdict: isPrefetchOpen(o.ua) }));
  const realCount = annotatedOpens.filter((o) => !o.verdict.isPrefetch).length;
  const proxyCount = annotatedOpens.length - realCount;

  const opensTimeline = `
    <div style="${cardStyle}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;gap:10px;flex-wrap:wrap">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold)">Open timeline</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${realCount} real${proxyCount > 0 ? ` · ${proxyCount} proxy/bot (dimmed)` : ""}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        ${annotatedOpens.map((o, i) => {
          const dim = o.verdict.isPrefetch;
          const rowStyle = dim ? "opacity:0.42" : "";
          const tag = dim ? `<span style="display:inline-block;margin-left:8px;padding:1px 6px;background:rgba(255,255,255,0.06);color:var(--text-faint);font-size:10px;border-radius:3px;font-family:var(--mono);text-transform:uppercase;letter-spacing:0.05em">${o.verdict.reason}</span>` : "";
          return `<tr style="border-bottom:1px solid var(--line);${rowStyle}">
            <td style="padding:8px 12px;color:var(--text-faint);font-family:var(--mono);width:60px">#${i + 1}</td>
            <td style="padding:8px 12px;color:var(--text);font-family:var(--mono)">${new Date(o.opened_at * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC${tag}</td>
            <td style="padding:8px 12px;color:var(--text-faint);font-family:var(--mono);font-size:11px">${o.ip_hash ? o.ip_hash.slice(0, 12) + "..." : "no ip"}</td>
          </tr>`;
        }).join("")}
      </table>
    </div>
  `;

  const draftCard = latestDraft
    ? `<div style="${cardStyle}">
         <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;gap:12px;flex-wrap:wrap">
           <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold)">Drafted follow-up · ${TIER_LABELS[(latestDraft.template_kind as SignalTier) ?? "warm"]} tier</div>
           <div style="color:var(--text-faint);font-size:11px;font-family:var(--mono)">${fmtAge(Math.floor(Date.now() / 1000) - latestDraft.created_at)}</div>
         </div>
         <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">Subject</div>
         <div style="color:var(--text);font-size:14.5px;margin-bottom:14px;font-weight:600;padding:10px 12px;background:var(--bg-edge);border:1px solid var(--line);border-radius:3px">${esc(latestDraft.subject || "")}</div>
         <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">Body</div>
         <div style="color:var(--text);font-size:14px;line-height:1.65;padding:14px 16px;background:var(--bg-edge);border:1px solid var(--line);border-radius:3px;white-space:pre-wrap;margin-bottom:14px">${esc(latestDraft.body || "")}</div>
         <div style="display:flex;gap:8px;flex-wrap:wrap">
           <button type="button" class="copy-btn" data-copy="Subject: ${esc(latestDraft.subject || "")}\n\n${esc(latestDraft.body || "")}"
                   style="padding:9px 18px;background:var(--gold);color:#1a1814;border:0;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Copy subject + body</button>
           <form method="POST" action="/admin/warm-prospects/${prospect_id}/action/${latestDraft.id}/sent" style="margin:0">
             <button type="submit" style="padding:9px 18px;background:transparent;color:#7fc99a;border:1px solid #7fc99a;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Mark as sent</button>
           </form>
           <form method="POST" action="/admin/warm-prospects/${prospect_id}/action/${latestDraft.id}/declined" style="margin:0">
             <button type="submit" style="padding:9px 18px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Decline this template</button>
           </form>
           <form method="POST" action="/admin/warm-prospects/${prospect_id}/regenerate/${latestDraft.id}" style="margin:0">
             <button type="submit" style="padding:9px 18px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit" title="Discard this draft and generate a new one with the latest template rules">Regenerate</button>
           </form>
         </div>
       </div>`
    : `<div style="${cardStyle}">
         <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:14px">Step 2 · The email · No draft yet</div>
         <p style="color:var(--text-mute);font-size:14px;line-height:1.6;margin:0 0 14px"><strong>This builds the follow-up EMAIL</strong> — voice-clean, scaled to this prospect's signal tier, with the Preview URL linked inside it. Build the Preview first (step 1) so the email has a URL to point at. Uses Claude, ~10 to 20 seconds.</p>
         <form method="POST" action="/admin/warm-prospects/${prospect_id}/draft" style="margin:0">
           <button type="submit" style="padding:10px 22px;background:var(--gold);color:#1a1814;border:0;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Build Draft (the email)</button>
         </form>
       </div>`;

  // Preview card: only show for hot tier (per Lance's spec). Either
  // surfaces the existing Preview's URL + status, or offers a Build
  // Preview button if one hasn't been generated yet.
  let previewCard = "";
  // Preview card shows for hot AND very_warm. buildAutonomousPreview
  // scales depth by tier, so very_warm gets a proportionate (shorter)
  // Preview while hot gets the full treatment. Gate widened 2026-05-14:
  // a fast double-open from two IPs is real buying signal and the
  // CTA philosophy is "send a URL, not a meeting" regardless of tier.
  if (warmth.tier === "hot" || warmth.tier === "very_warm") {
    const existingPreview = await getPreviewByProspectId(env, prospect_id);
    if (existingPreview) {
      const previewUrl = `https://app.neverranked.com/preview/${existingPreview.slug}`;
      const statusColor = existingPreview.status === "published" ? "#7fc99a" : "var(--gold)";
      previewCard = `
        <div style="${cardStyle};border-color:${statusColor}">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;flex-wrap:wrap;gap:10px">
            <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:${statusColor}">Preview · ${esc(existingPreview.status)}</div>
            <div style="color:var(--text-faint);font-size:11px;font-family:var(--mono)">${existingPreview.viewed_count > 0 ? `viewed ${existingPreview.viewed_count}x` : "not viewed yet"}</div>
          </div>
          <div style="font-family:var(--mono);font-size:12px;color:var(--text-soft);padding:8px 12px;background:var(--bg-edge);border:1px solid var(--line);border-radius:3px;margin-bottom:14px">${esc(previewUrl)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a href="${esc(previewUrl)}" target="_blank" rel="noopener" style="padding:9px 18px;background:transparent;color:var(--gold);text-decoration:none;font-weight:600;font-size:13px;border:1px solid var(--gold);border-radius:4px">Open Preview ↗</a>
            <button type="button" class="copy-btn" data-copy="${esc(previewUrl)}"
                    style="padding:9px 18px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Copy URL</button>
            <a href="/admin/preview/${esc(existingPreview.slug)}/edit" style="padding:9px 18px;background:var(--gold);color:#1a1814;text-decoration:none;font-weight:600;font-size:13px;border-radius:4px">Edit Preview</a>
            <form method="POST" action="/admin/warm-prospects/${prospect_id}/preview/rebuild" style="margin:0" onsubmit="return confirm('Rebuild discards this draft and regenerates the Preview under the current template. Continue?')">
              <button type="submit" style="padding:9px 18px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit" title="Archive this Preview and generate a fresh one with the latest template + prompt">Rebuild</button>
            </form>
          </div>
        </div>
      `;
    } else {
      previewCard = `
        <div style="${cardStyle}">
          <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Step 1 · The URL · Preview not built yet</div>
          <p style="color:var(--text-mute);font-size:14px;line-height:1.6;margin:0 0 14px"><strong>This builds the personalized brief PAGE</strong> at a private URL (app.neverranked.com/preview/&lt;slug&gt;) — the link the lead clicks. The system looks up prospect intel, runs a lightweight scan on their domain, and writes a brief with depth scaled to the signal tier (hot gets the deepest). ~10 to 20 seconds, then edit before publishing. <strong>Do this before Build Draft</strong> — the email links to this URL.</p>
          <form method="POST" action="/admin/warm-prospects/${prospect_id}/preview/build" style="margin:0">
            <button type="submit" style="padding:10px 22px;background:var(--gold);color:#1a1814;border:0;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Build Preview (the URL)</button>
          </form>
        </div>
      `;
    }
  }

  const historyCard = history.length > 1
    ? `<div style="${cardStyle}">
         <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);margin-bottom:14px">Follow-up history</div>
         ${history.map((h) => `<div style="padding:10px 0;border-bottom:1px solid var(--line);font-size:12.5px">
            <span style="font-family:var(--mono);color:${h.status === "sent" ? "#7fc99a" : h.status === "declined" ? "var(--text-faint)" : "var(--gold)"};text-transform:uppercase;letter-spacing:0.1em;font-size:10px;margin-right:8px">${h.status}</span>
            <span style="color:var(--text-soft)">${esc(h.template_kind)} tier</span>
            <span style="color:var(--text-faint);margin-left:8px">${new Date(h.created_at * 1000).toISOString().slice(0, 10)}</span>
            ${h.declined_reason ? `<div style="color:var(--text-faint);font-size:11px;margin-top:4px;margin-left:0;font-style:italic">${esc(h.declined_reason)}</div>` : ""}
          </div>`).join("")}
       </div>`
    : "";

  // Copy-to-clipboard script reused from the actions surface pattern.
  const copyScript = `<script>
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.copy-btn');
      if (!btn) return;
      e.preventDefault();
      const value = btn.getAttribute('data-copy') || '';
      if (!value) return;
      const originalText = btn.textContent;
      function flash() {
        btn.textContent = 'Copied';
        setTimeout(function() { btn.textContent = originalText; }, 1400);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(flash).catch(function() {});
      }
    });
  </script>`;

  const body = `
    <div style="margin-bottom:8px">
      <div class="label" style="margin-bottom:8px"><a href="/admin/warm-prospects" style="color:var(--text-mute)">Warm prospects</a> / Prospect #${prospect_id}</div>
    </div>
    ${summaryCard}
    ${buildError ? `<div style="margin-bottom:18px;padding:18px 22px;background:rgba(220,108,108,0.08);border:1px solid #dc6c6c;border-radius:6px">
      <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#dc6c6c;margin-bottom:6px">Build failed</div>
      <p style="margin:0;color:var(--text);font-size:13.5px;line-height:1.55">${esc(buildError)}</p>
    </div>` : ""}
    ${previewCard}
    ${draftCard}
    ${opensTimeline}
    ${historyCard}
    ${copyScript}
  `;

  return html(layout(`Warm prospect #${prospect_id}`, body, user));
}

// ===========================================================================
// POST handlers
// ===========================================================================

export async function handleProspectDraft(prospect_id: number, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") return redirect("/");

  const allWarmth = await getProspectWarmth(env);
  const warmth = allWarmth.find((p) => p.prospect_id === prospect_id);
  if (!warmth) return redirect("/admin/warm-prospects");

  // Don't re-draft if there's an existing un-actioned draft at this tier.
  const last = await getLastFollowupAction(env, prospect_id);
  if (last && last.status === "drafted" && last.template_kind === templateKindForTier(warmth.tier)) {
    return redirect(`/admin/warm-prospects/${prospect_id}`);
  }

  // If a Preview already exists for this prospect, weave the real
  // URL into the follow-up draft so the email points at the actual
  // brief instead of a placeholder.
  const existingPreview = await getPreviewByProspectId(env, prospect_id);
  const previewUrl = existingPreview
    ? `https://app.neverranked.com/preview/${existingPreview.slug}`
    : undefined;

  const draft = await generateFollowupDraft(env, {
    warmth,
    preview_url: previewUrl,
  });
  if (!draft) {
    return redirect(`/admin/warm-prospects/${prospect_id}`);
  }
  await recordDraftedFollowup(env, {
    prospect_id,
    template_kind: templateKindForTier(warmth.tier),
    tier: warmth.tier,
    open_count: warmth.open_count,
    subject: draft.subject,
    body: draft.body,
  });
  return redirect(`/admin/warm-prospects/${prospect_id}`);
}

export async function handleProspectActionSent(
  prospect_id: number, action_id: number, user: User, env: Env,
): Promise<Response> {
  if (user.role !== "admin") return redirect("/");
  await markFollowupSent(env, action_id, user.id);
  const { recordLanceDecision } = await import("../lib/decision-log");
  await recordLanceDecision(env, user.id, {
    artifact_type: "prospect_followup",
    artifact_id: action_id,
    decision_kind: "sent",
    new_state: "sent",
    metadata: { prospect_id },
  });
  return redirect(`/admin/warm-prospects/${prospect_id}`);
}

export async function handleProspectActionDeclined(
  prospect_id: number, action_id: number, user: User, env: Env,
): Promise<Response> {
  if (user.role !== "admin") return redirect("/");
  await markFollowupDeclined(env, action_id, null, user.id);
  const { recordLanceDecision } = await import("../lib/decision-log");
  await recordLanceDecision(env, user.id, {
    artifact_type: "prospect_followup",
    artifact_id: action_id,
    decision_kind: "decline",
    new_state: "declined",
    metadata: { prospect_id },
  });
  return redirect(`/admin/warm-prospects/${prospect_id}`);
}

/**
 * Discard the current draft and regenerate with the latest template
 * rules. Useful after a prompt update -- the existing drafted row
 * gets marked 'declined' so it's preserved for audit, then a fresh
 * draft replaces it.
 */
export async function handleProspectRegenerate(
  prospect_id: number, action_id: number, user: User, env: Env,
): Promise<Response> {
  if (user.role !== "admin") return redirect("/");
  // Decline the existing draft so dedup logic lets us re-draft.
  await markFollowupDeclined(env, action_id, "Regenerated by admin", user.id);
  const { recordLanceDecision } = await import("../lib/decision-log");
  await recordLanceDecision(env, user.id, {
    artifact_type: "prospect_followup",
    artifact_id: action_id,
    decision_kind: "regenerate",
    prior_state: "drafted",
    new_state: "declined",
    metadata: { prospect_id, intent: "redraft_with_latest_templates" },
  });
  // Now re-draft using the latest templates.
  return handleProspectDraft(prospect_id, user, env);
}
