/**
 * Routes: /discover/<slug> + /discover/<slug>/generate + per-suggestion
 * accept / dismiss POSTs.
 *
 * Customer-accessible (anyone with canAccessClient on the slug). Lists
 * AI-generated prompt suggestions awaiting review, with one-click
 * Accept (graduates to citation_keywords) or Dismiss (silent skip).
 *
 * Generate button is rate-limited to once per 24h per client via an
 * automation_log row -- prevents anyone from burning through API spend
 * by mashing the button.
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";
import { canAccessClient } from "../agency";
import {
  getPendingSuggestions,
  generateAndStorePromptSuggestions,
  acceptSuggestion,
  dismissSuggestion,
} from "../prompt-discovery";

const GEN_RATE_KIND = "prompt_discovery_generate";
const GEN_RATE_HOURS = 24;

function fmtAge(seconds: number): string {
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function categoryBadge(cat: string | null): string {
  const colors: Record<string, string> = {
    problem: "var(--red)",
    recommendation: "var(--green)",
    comparison: "var(--yellow)",
    scenario: "var(--gold)",
    gsc: "var(--text-mute)",
  };
  const c = cat ?? "primary";
  const color = colors[c] ?? "var(--text-mute)";
  return `<span style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${color};border:1px solid ${color};padding:1px 5px;border-radius:2px;margin-right:8px">${esc(c)}</span>`;
}

async function getLastGenerateAt(env: Env, slug: string): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT MAX(created_at) AS last FROM automation_log WHERE kind = ? AND target_slug = ?`,
  ).bind(GEN_RATE_KIND, slug).first<{ last: number | null }>();
  return row?.last ?? null;
}

export async function handleDiscoverList(slug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  const pending = await getPendingSuggestions(env, slug);
  const trackedRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM citation_keywords WHERE client_slug = ? AND active = 1`,
  ).bind(slug).first<{ n: number }>();
  const trackedCount = trackedRow?.n ?? 0;

  const lastGen = await getLastGenerateAt(env, slug);
  const now = Math.floor(Date.now() / 1000);
  const cooldownLeft = lastGen ? Math.max(0, lastGen + GEN_RATE_HOURS * 3600 - now) : 0;
  const canGenerate = cooldownLeft === 0;

  const pendingHtml = pending.length === 0 ? `
    <div style="border:1px dashed var(--line);border-radius:6px;padding:32px 24px;text-align:center;color:var(--text-mute);font-size:13px">
      <strong style="color:var(--text);font-size:14px;display:block;margin-bottom:6px">No pending suggestions</strong>
      ${trackedCount === 0
        ? "Click <em>Generate suggestions</em> to get started. We'll read your business context and propose 15 realistic prompts your prospects might type into ChatGPT, Perplexity, Gemini, and Claude."
        : "All caught up. You can generate more suggestions every 24 hours."}
    </div>
  ` : pending.map(s => `
    <div style="border:1px solid var(--line);border-radius:6px;padding:16px;margin-bottom:10px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
      <div style="flex:1;min-width:0">
        <div style="margin-bottom:8px;display:flex;align-items:center;flex-wrap:wrap">
          ${categoryBadge(s.category)}
          <span style="color:var(--text-faint);font-size:11px">${fmtAge(now - s.created_at)} ago &middot; ${esc(s.source)}</span>
        </div>
        <div style="font-size:14px;line-height:1.55;color:var(--text-soft)">${esc(s.prompt)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
        <form method="POST" action="/discover/${esc(slug)}/${s.id}/accept" style="margin:0">
          <button type="submit" class="btn" style="padding:6px 12px;font-size:11px">Track</button>
        </form>
        <form method="POST" action="/discover/${esc(slug)}/${s.id}/dismiss" style="margin:0">
          <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:11px;color:var(--text-mute)">Dismiss</button>
        </form>
      </div>
    </div>
  `).join("");

  const cooldownLabel = cooldownLeft >= 3600
    ? `${Math.ceil(cooldownLeft / 3600)}h until you can generate more`
    : `${Math.ceil(cooldownLeft / 60)}m until you can generate more`;

  const generateForm = canGenerate
    ? `<form method="POST" action="/discover/${esc(slug)}/generate" style="margin:0">
        <button type="submit" class="btn" style="padding:8px 18px;font-size:13px">Generate suggestions</button>
      </form>`
    : `<button class="btn btn-ghost" disabled style="padding:8px 18px;font-size:13px;opacity:0.5;cursor:not-allowed">Cooldown &middot; ${cooldownLabel}</button>`;

  const body = `
    <div style="margin-bottom:24px">
      <div class="label" style="margin-bottom:8px"><a href="/citations/${esc(slug)}" style="color:var(--text-mute)">Citations</a> / Discover</div>
      <h1>Discover <em>new prompts</em></h1>
      <p style="color:var(--text-mute);max-width:680px;margin-top:8px">
        AI-suggested prompts your prospects might type into ChatGPT, Perplexity, Gemini, and Claude. Generated from your business context (description, schema, top organic queries). Review and one-click <strong style="color:var(--text)">Track</strong> the ones worth monitoring.
      </p>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
      <div style="font-size:13px;color:var(--text-soft)">
        <strong style="color:var(--text)">${trackedCount}</strong> keywords tracked &middot; <strong style="color:var(--text)">${pending.length}</strong> pending suggestions
      </div>
      ${generateForm}
    </div>

    ${pendingHtml}

    <div style="border:1px solid var(--line);border-radius:6px;padding:16px 20px;background:var(--bg-edge);font-size:12px;color:var(--text-mute);margin-top:24px;line-height:1.7">
      <strong style="color:var(--text)">How this works.</strong> We read your business name, URL, description, recent scan results, and top organic search queries. We send that to Claude with a prompt asking for realistic AI-assistant queries -- conversational sentences a real person would type, not Google-style keyword strings. Each candidate runs through our human-tone guard (no "feel free to", no em dashes, no marketing fluff) before showing up here. Accepted prompts go into your weekly Monday citation tracking.
    </div>
  `;

  return html(layout("Discover", body, user, slug));
}

export async function handleDiscoverGenerate(slug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) {
    return redirect("/");
  }

  const lastGen = await getLastGenerateAt(env, slug);
  const now = Math.floor(Date.now() / 1000);
  if (lastGen && now - lastGen < GEN_RATE_HOURS * 3600) {
    return redirect(`/discover/${encodeURIComponent(slug)}`);
  }

  // Mark the attempt FIRST so a retry-loop can't blow through API spend
  // even if generation throws. Detail logged so we can see successes/failures.
  await env.DB.prepare(
    `INSERT INTO automation_log (kind, target_type, target_id, target_slug, reason, detail, created_at)
       VALUES (?, 'client', NULL, ?, ?, '{}', ?)`,
  ).bind(GEN_RATE_KIND, slug, "Prompt discovery generation triggered", now).run();

  try {
    const result = await generateAndStorePromptSuggestions(env, slug, 15);
    await env.DB.prepare(
      `UPDATE automation_log SET detail = ? WHERE kind = ? AND target_slug = ? AND created_at = ?`,
    ).bind(JSON.stringify(result), GEN_RATE_KIND, slug, now).run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[discover] generation failed for ${slug}: ${msg}`);
    await env.DB.prepare(
      `UPDATE automation_log SET detail = ? WHERE kind = ? AND target_slug = ? AND created_at = ?`,
    ).bind(JSON.stringify({ error: msg }), GEN_RATE_KIND, slug, now).run();
  }

  return redirect(`/discover/${encodeURIComponent(slug)}`);
}

export async function handleDiscoverAction(
  slug: string,
  suggestionId: number,
  action: "accept" | "dismiss",
  user: User,
  env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) {
    return redirect("/");
  }
  if (action === "accept") {
    await acceptSuggestion(env, slug, suggestionId, user.id);
  } else {
    await dismissSuggestion(env, slug, suggestionId, user.id);
  }
  return redirect(`/discover/${encodeURIComponent(slug)}`);
}
