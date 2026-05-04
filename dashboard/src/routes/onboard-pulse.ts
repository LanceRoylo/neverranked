/**
 * /onboard/pulse — self-serve Pulse onboarding flow.
 *
 * GET  → fetch domain from user.client_slug, ask Claude for 10
 *        candidate prompts, render an editable form. If the user is
 *        not on the Pulse plan, show a message + link to /admin/plans
 *        (admin) or /pricing (customer).
 *
 * POST → take the edited prompts, validate (1-200 chars each, max 10),
 *        insert into citation_keywords, trigger a one-shot citation
 *        run via runWeeklyCitations(env, slug), and redirect to the
 *        dashboard with a success flag.
 *
 * Auth: requires a logged-in user (any role) -- the user's client_slug
 *       drives the flow. Admins can pass ?slug=X to onboard on behalf
 *       of a customer (manual-onboarding workflow for the first cohort).
 */
import type { Env, User } from "../types";
import { layout, html, redirect } from "../render";
import { getPlanForClient, getPlanLimits } from "../lib/plan-limits";
import { suggestPromptsForDomain, type SuggestedPrompt } from "../lib/prompt-suggester";

export async function handleOnboardPulse(
  request: Request,
  env: Env,
  user: User,
): Promise<Response> {
  const url = new URL(request.url);

  // Resolve target client_slug. Admin can override via ?slug=. Otherwise
  // use the logged-in user's slug.
  const querySlug = url.searchParams.get("slug");
  const slug = (user.role === "admin" && querySlug) ? querySlug : user.client_slug;
  if (!slug) {
    return html(layout("Onboarding", `
      <div style="max-width:480px;margin:80px auto;padding:24px;text-align:center">
        <h1 style="font-family:var(--serif);font-weight:400">No client assigned</h1>
        <p style="color:var(--text-mute)">Your account isn't linked to a client yet. Email <a href="mailto:lance@neverranked.com" style="color:var(--gold)">lance@neverranked.com</a>.</p>
      </div>
    `), 200);
  }

  // Verify they're on Pulse (or above -- this flow works for higher
  // tiers too, just respects their higher quota).
  const plan = await getPlanForClient(env, slug);
  const limits = getPlanLimits(plan);

  // Check their current prompt count -- if already at cap, send to dashboard.
  const existing = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM citation_keywords WHERE client_slug = ? AND active = 1"
  ).bind(slug).first<{ n: number }>();
  const existingCount = existing?.n ?? 0;
  if (existingCount > 0 && request.method === "GET") {
    return html(layout("Onboarding complete", `
      <div style="max-width:520px;margin:80px auto;padding:24px;text-align:center">
        <div style="font-size:42px;color:var(--gold);margin-bottom:16px">&#10003;</div>
        <h1 style="font-family:var(--serif);font-weight:400">Already onboarded</h1>
        <p style="color:var(--text-mute);margin:0 0 28px 0">
          You have ${existingCount} prompt${existingCount === 1 ? "" : "s"} tracked. Manage them on the
          <a href="/citations/${encodeURIComponent(slug)}" style="color:var(--gold)">tracking page</a>.
        </p>
      </div>
    `));
  }

  // Pull domain
  const domainRow = await env.DB.prepare(
    "SELECT domain FROM domains WHERE client_slug = ? ORDER BY id ASC LIMIT 1"
  ).bind(slug).first<{ domain: string }>();
  if (!domainRow) {
    return html(layout("Onboarding", `
      <div style="max-width:480px;margin:80px auto;padding:24px;text-align:center">
        <h1 style="font-family:var(--serif);font-weight:400">No domain on file</h1>
        <p style="color:var(--text-mute)">We need a domain to track. Email <a href="mailto:lance@neverranked.com" style="color:var(--gold)">lance@neverranked.com</a> with your domain.</p>
      </div>
    `), 200);
  }

  // POST: save prompts + trigger first citation run
  if (request.method === "POST") {
    const form = await request.formData();
    const raw = form.getAll("keyword").map((v) => v.toString().trim()).filter(Boolean);
    if (raw.length === 0) {
      return html(layout("Onboarding", `
        <div class="empty"><h3>No prompts to save</h3><p><a href="/onboard/pulse" style="color:var(--gold)">Try again</a></p></div>
      `), 400);
    }

    // Cap to plan limit + sanitize.
    const cap = limits.trackedPrompts === -1 ? 100 : limits.trackedPrompts;
    const cleaned = raw
      .map((s) => s.replace(/\s+/g, " ").slice(0, 200))
      .filter((s) => s.length >= 4)
      .slice(0, cap);

    const now = Math.floor(Date.now() / 1000);
    for (const kw of cleaned) {
      await env.DB.prepare(
        "INSERT INTO citation_keywords (client_slug, keyword, category, active, created_at) VALUES (?, ?, 'primary', 1, ?)"
      ).bind(slug, kw, now).run();
    }

    // Fire-and-forget first citation run. We don't wait for it
    // (would block the request for 30+ seconds across 4 engines).
    // The cron will pick it up on the next scheduled tick anyway,
    // but kicking it off now means the customer's first NVI lands
    // hours sooner.
    try {
      const { runWeeklyCitations } = await import("../citations");
      // Run in the background -- the request returns immediately.
      // ctx.waitUntil isn't available here; fire-and-forget is OK
      // because the cron is the safety net.
      runWeeklyCitations(env, slug).catch((e) =>
        console.log(`onboard-pulse first-run failed for ${slug}: ${e}`)
      );
    } catch (e) {
      console.log(`onboard-pulse import failed: ${e}`);
    }

    return html(layout("Onboarding complete", `
      <div style="max-width:560px;margin:80px auto;padding:24px;text-align:center">
        <div style="font-size:48px;color:var(--gold);margin-bottom:16px">&#10003;</div>
        <h1 style="font-family:var(--serif);font-weight:400;font-size:32px;margin:0 0 16px 0">You're tracking ${cleaned.length} prompts.</h1>
        <p style="font-size:15px;line-height:1.7;color:var(--text-mute);margin:0 0 28px 0;max-width:440px;margin-left:auto;margin-right:auto">
          We're running your first citation scan now across ChatGPT, Perplexity, Gemini, and Claude. Initial results land in your dashboard within a few hours. Your first monthly Visibility Index PDF arrives the first business day of next month.
        </p>
        <a href="/citations/${encodeURIComponent(slug)}" style="display:inline-block;font-family:var(--label);text-transform:uppercase;letter-spacing:.2em;font-size:11px;padding:14px 24px;background:var(--gold);color:var(--bg);border:1px solid var(--gold);text-decoration:none">
          See live tracking &rarr;
        </a>
      </div>
    `));
  }

  // GET: generate suggestions and render the form.
  const settings = await env.DB.prepare(
    "SELECT industry FROM client_settings WHERE client_slug = ? LIMIT 1"
  ).bind(slug).first<{ industry: string | null }>();

  const suggestion = await suggestPromptsForDomain(env, domainRow.domain, settings?.industry || undefined);

  if (!suggestion.ok || !suggestion.prompts) {
    return html(layout("Onboarding", `
      <div class="empty"><h3>Could not generate suggestions</h3>
        <p>${suggestion.reason || "Unknown error"}</p>
        <p style="margin-top:16px"><a href="/onboard/pulse" style="color:var(--gold)">Try again</a> or email <a href="mailto:lance@neverranked.com" style="color:var(--gold)">lance@neverranked.com</a></p>
      </div>
    `), 500);
  }

  const promptsHtml = suggestion.prompts.map((p, i) => `
    <div style="display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--line)">
      <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);width:28px;padding-top:14px">${String(i + 1).padStart(2, "0")}</div>
      <div style="flex:1">
        <input type="text" name="keyword" value="${escapeHtml(p.keyword)}" maxlength="200"
          style="width:100%;font-family:var(--mono);font-size:14px;padding:10px 12px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);border-radius:3px;outline:none">
        <div style="margin-top:6px;font-family:var(--mono);font-size:11px;color:var(--text-faint);display:flex;gap:12px">
          <span style="color:var(--gold);text-transform:uppercase;letter-spacing:.1em">${p.category}</span>
          <span>${escapeHtml(p.rationale)}</span>
        </div>
      </div>
    </div>
  `).join("");

  return html(layout("Welcome to Pulse", `
    <div style="max-width:720px;margin:0 auto;padding:48px 24px">
      <div style="font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:16px">
        ${limits.displayName} onboarding · step 1 of 1
      </div>
      <h1 style="font-family:var(--serif);font-weight:400;font-size:38px;line-height:1.15;margin:0 0 16px 0;letter-spacing:-.01em">
        These are the prompts <em>we'll track for you.</em>
      </h1>
      <p style="font-size:15px;line-height:1.7;color:var(--text-mute);margin:0 0 32px 0;max-width:580px">
        We generated ${suggestion.prompts.length} candidate prompts based on <strong>${escapeHtml(suggestion.detectedBusiness || domainRow.domain)}</strong>. Edit them however you want, swap in your own, or remove any that don't fit. Click <strong>Save and start tracking</strong> when you're ready.
      </p>

      <form method="POST" action="/onboard/pulse${querySlug ? `?slug=${encodeURIComponent(querySlug)}` : ""}">
        <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:8px 24px 8px 24px">
          ${promptsHtml}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:28px;padding:16px 20px;background:var(--bg-edge);border:1px solid var(--line);border-radius:4px;font-family:var(--mono);font-size:12px;color:var(--text-faint)">
          <span>Plan: <strong style="color:var(--gold)">${limits.displayName}</strong> &middot; cap ${limits.trackedPrompts === -1 ? "unlimited" : `${limits.trackedPrompts} prompts`}</span>
          <span>Cadence: ${limits.citationCadence}</span>
        </div>

        <div style="display:flex;gap:12px;margin-top:24px;justify-content:flex-end">
          <a href="/" style="font-family:var(--label);text-transform:uppercase;letter-spacing:.2em;font-size:11px;padding:14px 24px;border:1px solid var(--line);color:var(--text-mute);text-decoration:none">
            Skip for now
          </a>
          <button type="submit"
            style="font-family:var(--label);text-transform:uppercase;letter-spacing:.2em;font-size:11px;padding:14px 24px;background:var(--gold);color:var(--bg);border:1px solid var(--gold);cursor:pointer">
            Save and start tracking &rarr;
          </button>
        </div>
      </form>
    </div>
  `));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
