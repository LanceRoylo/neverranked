/**
 * Dashboard — Client onboarding flow
 *
 * First-time clients land here to provide competitor domains.
 * Suggestions go to admin for one-click approval.
 */

import type { Env, User } from "../types";
import { layout, html, redirect, esc } from "../render";

export async function handleOnboarding(user: User, env: Env): Promise<Response> {
  // Admin doesn't need onboarding
  if (user.role === "admin") return redirect("/");

  // Already submitted? Show thank-you state
  const existing = (await env.DB.prepare(
    "SELECT * FROM competitor_suggestions WHERE client_slug = ? ORDER BY created_at"
  ).bind(user.client_slug).all<{ id: number; domain: string; label: string; status: string }>()).results;

  if (user.onboarded) {
    const body = `
      <div style="max-width:600px;margin:0 auto">
        <div class="label" style="margin-bottom:8px">Welcome</div>
        <h1 style="margin-bottom:32px">You're all <em>set</em></h1>
        <div style="padding:24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;margin-bottom:32px">
          <div style="font-size:14px;color:var(--text-soft);line-height:1.75">
            Your competitor suggestions have been submitted. We'll review them and add them to your dashboard shortly. You'll see side-by-side AEO comparisons once they're approved.
          </div>
          ${existing.length > 0 ? `
            <div style="margin-top:20px">
              <div class="label" style="margin-bottom:8px">Your suggestions</div>
              ${existing.map(s => {
                const statusColor = s.status === "approved" ? "var(--green)" : s.status === "rejected" ? "var(--red)" : "var(--text-faint)";
                const statusLabel = s.status === "approved" ? "Added" : s.status === "rejected" ? "Skipped" : "Pending review";
                return `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(251,248,239,.08);font-size:13px">
                    <span style="color:var(--text)">${esc(s.domain)}${s.label ? ` <span style="color:var(--text-faint)">(${esc(s.label)})</span>` : ''}</span>
                    <span style="font-family:var(--label);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${statusColor}">${statusLabel}</span>
                  </div>
                `;
              }).join("")}
            </div>
          ` : ''}
        </div>
        <a href="/" class="btn">Go to dashboard</a>
      </div>
    `;
    return html(layout("Welcome", body, user));
  }

  // Show onboarding form
  const body = `
    <div style="max-width:600px;margin:0 auto">
      <div class="label" style="margin-bottom:8px">Welcome to NeverRanked</div>
      <h1 style="margin-bottom:12px">Let's set up your <em>dashboard</em></h1>
      <p style="color:var(--text-faint);font-size:14px;line-height:1.7;margin-bottom:40px">
        We'll monitor your AEO readiness alongside your competitors so you can see exactly where you stand. Tell us who you compete with and we'll handle the rest.
      </p>

      <form method="POST" action="/onboarding">
        <div style="margin-bottom:32px">
          <div class="label" style="margin-bottom:16px">Who are your top competitors?</div>
          <p style="color:var(--text-faint);font-size:12px;margin-bottom:16px">
            Add 1-5 competitor websites. Just the domain is fine. We'll review and start tracking them.
          </p>

          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group" style="margin-bottom:0">
                <label>Competitor domain</label>
                <input type="text" name="domain_1" placeholder="competitor.com" style="width:100%">
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label>Who are they? (optional)</label>
                <input type="text" name="label_1" placeholder="Main competitor, CRM platform, etc.">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group" style="margin-bottom:0">
                <input type="text" name="domain_2" placeholder="another-competitor.com" style="width:100%">
              </div>
              <div class="form-group" style="margin-bottom:0">
                <input type="text" name="label_2" placeholder="Description (optional)">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group" style="margin-bottom:0">
                <input type="text" name="domain_3" placeholder="third-competitor.com" style="width:100%">
              </div>
              <div class="form-group" style="margin-bottom:0">
                <input type="text" name="label_3" placeholder="Description (optional)">
              </div>
            </div>

            <details style="margin-top:4px">
              <summary style="cursor:pointer;color:var(--text-faint);font-size:12px;font-family:var(--label);letter-spacing:.1em;text-transform:uppercase">Add more</summary>
              <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                  <div class="form-group" style="margin-bottom:0">
                    <input type="text" name="domain_4" placeholder="competitor.com" style="width:100%">
                  </div>
                  <div class="form-group" style="margin-bottom:0">
                    <input type="text" name="label_4" placeholder="Description (optional)">
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                  <div class="form-group" style="margin-bottom:0">
                    <input type="text" name="domain_5" placeholder="competitor.com" style="width:100%">
                  </div>
                  <div class="form-group" style="margin-bottom:0">
                    <input type="text" name="label_5" placeholder="Description (optional)">
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>

        <div style="display:flex;gap:12px;align-items:center">
          <button type="submit" class="btn">Submit</button>
          <a href="/onboarding/skip" style="color:var(--text-faint);font-size:12px;text-decoration:none;border-bottom:1px solid var(--line)">Skip for now</a>
        </div>
      </form>
    </div>
  `;

  return html(layout("Welcome", body, user));
}

/** Handle onboarding form submission */
export async function handleOnboardingSubmit(request: Request, user: User, env: Env): Promise<Response> {
  if (user.role === "admin") return redirect("/");

  const form = await request.formData();
  const now = Math.floor(Date.now() / 1000);
  let added = 0;

  for (let i = 1; i <= 5; i++) {
    const domain = (form.get(`domain_${i}`) as string || "").trim().toLowerCase()
      .replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    const label = (form.get(`label_${i}`) as string || "").trim() || null;

    if (!domain || domain.length < 3 || !domain.includes(".")) continue;

    try {
      await env.DB.prepare(
        "INSERT INTO competitor_suggestions (client_slug, suggested_by, domain, label, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)"
      ).bind(user.client_slug, user.id, domain, label, now).run();
      added++;
    } catch {
      // Skip duplicates
    }
  }

  // Mark user as onboarded
  await env.DB.prepare("UPDATE users SET onboarded = 1 WHERE id = ?").bind(user.id).run();

  return redirect("/onboarding");
}

/** Skip onboarding */
export async function handleOnboardingSkip(user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") {
    await env.DB.prepare("UPDATE users SET onboarded = 1 WHERE id = ?").bind(user.id).run();
  }
  return redirect("/");
}
