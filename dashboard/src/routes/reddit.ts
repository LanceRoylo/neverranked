/**
 * Dashboard -- /reddit/<slug>
 *
 * Phase 5: Reddit presence audit. Shows which subreddits AI engines
 * have been citing on the client's tracked keywords, whether the
 * client was named in the same response, and surfaces the biggest
 * presence gaps (subreddits cited often where client never appears).
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";
import { canAccessClient } from "../agency";
import { canUseRedditBriefs } from "../gating";
import { getRedditSummary } from "../reddit-citations";

const ENGINE_LABELS: Record<string, string> = {
  perplexity: "Perplexity",
  openai: "ChatGPT",
  gemini: "Gemini",
  anthropic: "Claude",
};

export async function handleReddit(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  const summary = await getRedditSummary(clientSlug, 90, env);
  const showBriefs = canUseRedditBriefs(user);

  // Pre-load any existing briefs for these threads so we can link to the
  // cached view directly instead of re-fetching on click.
  const existingBriefs = new Map<string, number>();
  if (showBriefs && summary.totalCitations > 0) {
    const rows = (await env.DB.prepare(
      "SELECT id, thread_url FROM reddit_briefs WHERE client_slug = ?",
    ).bind(clientSlug).all<{ id: number; thread_url: string }>()).results;
    for (const r of rows) existingBriefs.set(r.thread_url, r.id);
  }

  if (summary.totalCitations === 0) {
    const body = `
      <div style="margin-bottom:32px">
        <div class="label" style="margin-bottom:8px">Dashboard / ${esc(clientSlug)}</div>
        <h1>Reddit <em>presence</em></h1>
      </div>
      <div class="empty-hero">
        <div class="empty-hero-eyebrow">No Reddit citations yet</div>
        <h2 class="empty-hero-title">No Reddit threads have been cited on your tracked queries in the last 90 days.</h2>
        <p class="empty-hero-body">When AI engines (Perplexity, ChatGPT, Gemini) cite reddit.com URLs while answering your tracked queries, they'll show up here grouped by subreddit. The most actionable view is "competitors get cited via r/X but you don't" -- once any data exists you'll see it ranked at the top.</p>
      </div>
    `;
    return html(layout("Reddit presence", body, user, clientSlug));
  }

  const presencePct = Math.round((summary.clientPresentCount / summary.totalCitations) * 100);
  const presenceColor = presencePct >= 50 ? "var(--green)" : presencePct >= 20 ? "var(--yellow)" : "var(--red)";

  const subredditRows = summary.subreddits.map(s => {
    const present = s.client_present_count;
    const total = s.total_citations;
    const presentPct = Math.round((present / total) * 100);
    const gapBadge = present === 0
      ? `<span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--red);border:1px solid var(--red);padding:2px 6px;border-radius:2px">Absence gap</span>`
      : present < total
      ? `<span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--yellow);border:1px solid var(--yellow);padding:2px 6px;border-radius:2px">Partial</span>`
      : `<span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--green);border:1px solid var(--green);padding:2px 6px;border-radius:2px">Present</span>`;

    const threadList = s.threads.slice(0, 8).map(t => {
      const date = new Date(t.run_at * 1000).toISOString().slice(0, 10);
      const eng = ENGINE_LABELS[t.engine] || t.engine;
      const tick = t.client_cited === 1
        ? `<span style="color:var(--green);margin-right:8px" title="You were cited in the same response">✓</span>`
        : `<span style="color:var(--text-faint);margin-right:8px" title="You were not cited in this response">·</span>`;
      let briefBtn = "";
      if (showBriefs) {
        const existingId = existingBriefs.get(t.thread_url);
        if (existingId) {
          briefBtn = `<a href="/reddit/${esc(clientSlug)}/brief/${existingId}" style="margin-left:12px;font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--green);border:1px solid var(--green);padding:2px 6px;border-radius:2px;text-decoration:none">View brief</a>`;
        } else {
          briefBtn = `<button type="button" data-thread="${esc(t.thread_url)}" class="briefGenBtn" style="margin-left:12px;font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);background:transparent;border:1px solid var(--line);padding:2px 6px;border-radius:2px;cursor:pointer">Generate brief</button>`;
        }
      }
      return `<li style="padding:6px 0;border-bottom:1px dotted var(--line);font-size:13px;display:flex;align-items:center;flex-wrap:wrap"><span>${tick}<a href="${esc(t.thread_url)}" target="_blank" rel="noopener" style="color:var(--text);text-decoration:underline">${esc(t.thread_url.replace("https://www.reddit.com",""))}</a> <span style="color:var(--text-faint);margin-left:8px">${esc(eng)} · ${date}</span></span>${briefBtn}</li>`;
    }).join("");

    const moreNote = s.threads.length > 8
      ? `<div style="color:var(--text-faint);font-size:12px;margin-top:8px">+ ${s.threads.length - 8} more threads cited</div>`
      : "";

    return `
      <div style="border:1px solid var(--line);border-radius:6px;padding:20px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <div style="font-size:18px;font-weight:500">r/${esc(s.subreddit)}</div>
            <div style="color:var(--text-muted);font-size:13px;margin-top:2px">${total} citation${total === 1 ? "" : "s"} · you in ${present} (${presentPct}%)</div>
          </div>
          ${gapBadge}
        </div>
        <ul style="list-style:none;padding:0;margin:0">${threadList}</ul>
        ${moreNote}
      </div>
    `;
  }).join("");

  const body = `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px">Dashboard / ${esc(clientSlug)}</div>
      <h1>Reddit <em>presence</em></h1>
      <p style="color:var(--text-muted);max-width:680px;margin-top:8px">
        Reddit threads are one of the heaviest non-corporate citation sources for Perplexity / ChatGPT / Gemini. Subreddits where competitors are cited but you aren't named are the biggest absence gaps -- and the fastest to close. A substantive comment from your team that actually helps the question-asker often gets you cited within a week.
      </p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
      <div style="border:1px solid var(--line);border-radius:6px;padding:24px">
        <div class="label" style="margin-bottom:12px">Reddit citations (90d)</div>
        <div style="font-size:48px;font-weight:300;letter-spacing:-0.02em">${summary.totalCitations}</div>
        <div style="color:var(--text-muted);font-size:13px;margin-top:8px">
          Distinct reddit threads cited by AI engines for your tracked queries.
        </div>
      </div>
      <div style="border:1px solid var(--line);border-radius:6px;padding:24px">
        <div class="label" style="margin-bottom:12px">Your presence</div>
        <div style="font-size:48px;font-weight:300;letter-spacing:-0.02em;color:${presenceColor}">${presencePct}%</div>
        <div style="color:var(--text-muted);font-size:13px;margin-top:8px">
          You were named in ${summary.clientPresentCount} of ${summary.totalCitations} reddit-sourced responses.
        </div>
      </div>
    </div>

    <div style="margin-bottom:16px">
      <h2 style="font-size:20px;margin:0">Subreddits, ranked by absence gap</h2>
      <p style="color:var(--text-muted);font-size:13px;margin-top:4px">
        Sorted so the biggest opportunity -- many citations, you absent -- is at the top. Click any thread to read it, find a real comment to engage on, and post as a practitioner not a marketer.
      </p>
    </div>

    ${subredditRows}

    <div style="border:1px solid var(--line);border-radius:6px;padding:20px;background:var(--bg-faint);font-size:13px;color:var(--text-muted);margin-top:24px">
      <strong style="color:var(--text)">How this is computed.</strong> Every Perplexity / ChatGPT / Gemini response we run for your tracked keywords surfaces a list of cited URLs. We extract reddit.com thread URLs, group them by subreddit, and join them to whether you were cited in the same response. A "present" (✓) row means you were named in the model's answer alongside the reddit thread.${showBriefs ? ` <strong style="color:var(--text)">Generate brief</strong> reads the thread plus the subreddit's rules and produces a 4-section strategic brief -- gap, your angle, tone notes, don't-do list -- so a real human on your team can write a real reply. We never draft the comment itself; that's how Reddit accounts get burned.` : ""}
    </div>
    ${showBriefs ? `<script>
      document.querySelectorAll('.briefGenBtn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const threadUrl = btn.getAttribute('data-thread');
          const original = btn.textContent;
          btn.disabled = true; btn.textContent = 'Generating...';
          try {
            const r = await fetch('/reddit/${esc(clientSlug)}/brief', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ thread_url: threadUrl })
            });
            const j = await r.json();
            if (j.view_url) { location.href = j.view_url; return; }
            btn.textContent = j.error === 'amplify_required' ? 'Amplify only' : 'Failed';
            setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500);
          } catch (e) {
            btn.textContent = 'Failed';
            setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500);
          }
        });
      });
    </script>` : ""}
  `;

  return html(layout("Reddit presence", body, user, clientSlug));
}
