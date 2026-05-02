/**
 * Routes: /reddit/<slug>/brief (POST) + /reddit/<slug>/brief/<id> (GET).
 *
 * Phase 5B: Amplify-only. POST takes {thread_url} and returns the brief
 * (cached after first call); GET renders the brief page with the
 * "this is a brief, not a draft" framing front and center.
 */

import type { Env, User, RedditBriefData, RedditThreadSnapshot } from "../types";
import { layout, html, esc } from "../render";
import { canAccessClient } from "../agency";
import { canUseRedditBriefs } from "../gating";
import { generateOrGetBrief } from "../reddit-briefs";

const SUBREDDIT_RE = /^https?:\/\/(?:www\.)?reddit\.com\/r\/([^/]+)\/comments\/[^/]+/i;

export async function handleBriefGenerate(
  clientSlug: string,
  user: User,
  env: Env,
  request: Request,
): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });
  }
  if (!canUseRedditBriefs(user)) {
    return new Response(JSON.stringify({ error: "amplify_required" }), { status: 403, headers: { "content-type": "application/json" } });
  }

  let body: { thread_url?: string; regenerate?: boolean };
  try {
    body = await request.json() as { thread_url?: string; regenerate?: boolean };
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const threadUrl = (body.thread_url ?? "").trim();
  const m = threadUrl.match(SUBREDDIT_RE);
  if (!m) {
    return new Response(JSON.stringify({ error: "invalid_thread_url" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const subreddit = m[1].toLowerCase();

  try {
    const result = await generateOrGetBrief(env, {
      clientSlug,
      threadUrl,
      subreddit,
      userId: user.id,
      regenerate: body.regenerate === true,
    });
    return new Response(JSON.stringify({
      id: result.id,
      cached: result.cached,
      view_url: `/reddit/${encodeURIComponent(clientSlug)}/brief/${result.id}`,
    }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: "generation_failed", detail: msg }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
}

export async function handleBriefView(
  clientSlug: string,
  briefId: number,
  user: User,
  env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  if (!canUseRedditBriefs(user)) {
    return html(layout("Amplify required", `
      <div class="empty"><h3>Reddit reply briefs are an Amplify feature</h3>
      <p style="color:var(--text-muted)">Upgrade to Amplify to generate per-thread reply briefs for your team.</p></div>`, user), 403);
  }

  const row = await env.DB.prepare(
    `SELECT id, thread_url, subreddit, brief_json, thread_snapshot, created_at, updated_at
       FROM reddit_briefs WHERE id = ? AND client_slug = ?`,
  ).bind(briefId, clientSlug).first<{
    id: number; thread_url: string; subreddit: string;
    brief_json: string; thread_snapshot: string;
    created_at: number; updated_at: number;
  }>();

  if (!row) {
    return html(layout("Brief not found", `<div class="empty"><h3>Brief not found</h3></div>`, user), 404);
  }

  let brief: RedditBriefData;
  let snapshot: RedditThreadSnapshot;
  try {
    brief = JSON.parse(row.brief_json) as RedditBriefData;
    snapshot = JSON.parse(row.thread_snapshot) as RedditThreadSnapshot;
  } catch {
    return html(layout("Brief corrupted", `<div class="empty"><h3>Brief data could not be parsed</h3></div>`, user), 500);
  }

  const updated = new Date(row.updated_at * 1000).toISOString().slice(0, 10);
  const toneList = brief.tone_notes.map((b) => `<li>${esc(b)}</li>`).join("");
  const dontList = brief.dont_do.map((b) => `<li>${esc(b)}</li>`).join("");
  const commentsBlock = snapshot.top_comments.map((c, i) => `
    <div style="border-left:2px solid var(--line);padding:8px 12px;margin:8px 0;font-size:13px">
      <div style="color:var(--text-faint);font-size:11px;margin-bottom:4px">Comment ${i + 1} &middot; ${c.score} pts &middot; u/${esc(c.author)}</div>
      <div style="white-space:pre-wrap;color:var(--text-muted)">${esc(c.body)}</div>
    </div>`).join("");

  const body = `
    <div style="margin-bottom:24px">
      <div class="label" style="margin-bottom:8px"><a href="/reddit/${esc(clientSlug)}" style="color:var(--text-muted)">Reddit presence</a> / Brief</div>
      <h1>r/${esc(row.subreddit)} <em>reply brief</em></h1>
      <p style="color:var(--text-muted);margin-top:8px">
        <a href="${esc(row.thread_url)}" target="_blank" rel="noopener" style="color:var(--text-muted);text-decoration:underline">${esc(row.thread_url)}</a>
        <span style="margin-left:12px;font-size:12px">Generated ${updated}</span>
      </p>
    </div>

    <div style="border:2px solid var(--red);border-radius:6px;padding:20px;margin-bottom:32px;background:rgba(220,38,38,0.04)">
      <div style="font-family:var(--label);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin-bottom:8px">Brief, not a draft</div>
      <div style="font-size:15px;line-height:1.55;color:var(--text)">
        <strong>Write the reply yourself in your own words.</strong> The bullets below are strategic input -- the gap, the angle, the tone, the no-gos. Pasting any of this verbatim will read as AI, get downvoted, and burn the account. Reddit rewards practitioners speaking from real experience, not marketers running a play.
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <div style="border:1px solid var(--line);border-radius:6px;padding:20px">
        <div class="label" style="margin-bottom:10px">The gap</div>
        <div style="font-size:15px;line-height:1.5">${esc(brief.gap) || "<span style='color:var(--text-faint)'>(model returned empty)</span>"}</div>
      </div>
      <div style="border:1px solid var(--line);border-radius:6px;padding:20px">
        <div class="label" style="margin-bottom:10px">Your angle</div>
        <div style="font-size:15px;line-height:1.5">${esc(brief.angle) || "<span style='color:var(--text-faint)'>(model returned empty)</span>"}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px">
      <div style="border:1px solid var(--line);border-radius:6px;padding:20px">
        <div class="label" style="margin-bottom:10px">Tone notes (what r/${esc(row.subreddit)} expects)</div>
        <ul style="padding-left:18px;margin:0;font-size:14px;line-height:1.6">${toneList}</ul>
      </div>
      <div style="border:1px solid var(--line);border-radius:6px;padding:20px">
        <div class="label" style="margin-bottom:10px">Don't do</div>
        <ul style="padding-left:18px;margin:0;font-size:14px;line-height:1.6">${dontList}</ul>
      </div>
    </div>

    <details style="border:1px solid var(--line);border-radius:6px;padding:16px;margin-bottom:24px">
      <summary style="cursor:pointer;font-family:var(--label);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted)">Original thread snapshot (what we read when we wrote this brief)</summary>
      <div style="margin-top:16px">
        <div style="font-size:16px;font-weight:500;margin-bottom:8px">${esc(snapshot.op_title)}</div>
        ${snapshot.op_body ? `<div style="white-space:pre-wrap;font-size:14px;color:var(--text-muted);line-height:1.55">${esc(snapshot.op_body)}</div>` : ""}
        ${snapshot.top_comments.length > 0 ? `<div style="margin-top:16px"><div class="label" style="margin-bottom:8px">Top existing comments</div>${commentsBlock}</div>` : ""}
      </div>
    </details>

    <form method="POST" action="/reddit/${esc(clientSlug)}/brief" id="regenForm" style="margin-top:16px">
      <input type="hidden" name="thread_url" value="${esc(row.thread_url)}">
      <button type="button" id="regenBtn" class="btn btn-secondary" style="font-size:13px">Regenerate brief</button>
    </form>
    <script>
      document.getElementById('regenBtn').addEventListener('click', async () => {
        const btn = document.getElementById('regenBtn');
        btn.disabled = true; btn.textContent = 'Regenerating...';
        try {
          const r = await fetch('/reddit/${esc(clientSlug)}/brief', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ thread_url: ${JSON.stringify(row.thread_url)}, regenerate: true })
          });
          const j = await r.json();
          if (j.view_url) location.href = j.view_url; else { btn.textContent = 'Failed -- try again'; btn.disabled = false; }
        } catch (e) { btn.textContent = 'Failed -- try again'; btn.disabled = false; }
      });
    </script>
  `;

  return html(layout("Reddit brief", body, user, clientSlug));
}
