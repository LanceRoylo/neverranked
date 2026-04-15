/**
 * Dashboard — Client onboarding flow
 *
 * First-time clients land here to provide competitor domains.
 * Suggestions go to admin for one-click approval.
 */

import type { Env, User } from "../types";
import { layout, html, redirect, esc } from "../render";
import { scanDomain } from "../scanner";
import { autoGenerateRoadmap } from "../auto-provision";

export async function handleOnboarding(user: User, env: Env): Promise<Response> {
  // Admin doesn't need onboarding
  if (user.role === "admin") return redirect("/");

  // Already submitted? Show completion state
  const existing = (await env.DB.prepare(
    "SELECT * FROM competitor_suggestions WHERE client_slug = ? ORDER BY created_at"
  ).bind(user.client_slug).all<{ id: number; domain: string; label: string; status: string }>()).results;

  if (user.onboarded) {
    // Fetch their primary domain + latest scan for status
    const primaryDomain = user.client_slug ? await env.DB.prepare(
      "SELECT d.domain, sr.aeo_score, sr.grade FROM domains d LEFT JOIN scan_results sr ON sr.domain_id = d.id AND sr.id = (SELECT MAX(id) FROM scan_results WHERE domain_id = d.id) WHERE d.client_slug = ? AND d.is_competitor = 0 AND d.active = 1 LIMIT 1"
    ).bind(user.client_slug).first<{ domain: string; aeo_score: number | null; grade: string | null }>() : null;

    // Count competitor domains being scanned
    const compCount = user.client_slug ? (await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM domains WHERE client_slug = ? AND is_competitor = 1 AND active = 1"
    ).bind(user.client_slug).first<{ cnt: number }>())?.cnt || 0 : 0;

    // Check roadmap status
    const roadmapItems = user.client_slug ? (await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM roadmap_items WHERE client_slug = ?"
    ).bind(user.client_slug).first<{ cnt: number }>())?.cnt || 0 : 0;

    const gradeColor = primaryDomain?.grade === "A" ? "var(--gold)" : primaryDomain?.grade === "B" ? "var(--gold-dim)" : "var(--text-faint)";

    const body = `
      <div style="max-width:640px;margin:0 auto">
        <div class="label" style="margin-bottom:8px">Setup complete</div>
        <h1 style="margin-bottom:32px">Your dashboard is <em>live</em></h1>

        <!-- Status cards -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px">
          <div class="card" style="text-align:center;padding:24px">
            <div class="label" style="margin-bottom:12px">Your site</div>
            ${primaryDomain?.aeo_score != null ? `
              <div style="font-family:var(--serif);font-size:42px;font-style:italic;color:${gradeColor}">${primaryDomain.grade}</div>
              <div style="font-family:var(--mono);font-size:20px;color:var(--text);margin-top:4px">${primaryDomain.aeo_score}<span style="font-size:12px;color:var(--text-faint)">/100</span></div>
              <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:8px">${esc(primaryDomain.domain)}</div>
            ` : `
              <div style="font-family:var(--mono);font-size:13px;color:var(--text-faint);line-height:1.6">
                ${primaryDomain ? `Scanning ${esc(primaryDomain.domain)}...` : 'Setting up...'}
              </div>
            `}
          </div>
          <div class="card" style="padding:24px">
            <div class="label" style="margin-bottom:16px">What's happening</div>
            <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="color:var(--gold)">+</span>
                <span style="color:var(--text-soft)">Domain scanned</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <span style="color:${compCount > 0 ? 'var(--gold)' : 'var(--text-faint)'}">${compCount > 0 ? '+' : '-'}</span>
                <span style="color:var(--text-soft)">${compCount} competitor${compCount !== 1 ? 's' : ''} ${compCount > 0 ? 'tracking' : 'added'}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <span style="color:${roadmapItems > 0 ? 'var(--gold)' : 'var(--text-faint)'}">${roadmapItems > 0 ? '+' : '-'}</span>
                <span style="color:var(--text-soft)">${roadmapItems > 0 ? `${roadmapItems}-item roadmap generated` : 'Roadmap generating...'}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <span style="color:var(--gold)">+</span>
                <span style="color:var(--text-soft)">Weekly scans scheduled</span>
              </div>
            </div>
          </div>
        </div>

        ${existing.length > 0 ? `
          <div class="card" style="margin-bottom:24px">
            <div class="label" style="margin-bottom:12px">Competitors</div>
            ${existing.map(s => {
              const statusColor = s.status === "approved" ? "var(--gold)" : s.status === "rejected" ? "var(--text-faint)" : "var(--gold)";
              const statusLabel = s.status === "approved" ? "Tracking" : s.status === "rejected" ? "Removed" : "Tracking";
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(251,248,239,.08);font-size:13px">
                  <span style="color:var(--text)">${esc(s.domain)}${s.label ? ` <span style="color:var(--text-faint)">(${esc(s.label)})</span>` : ''}</span>
                  <span style="font-family:var(--label);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${statusColor}">${statusLabel}</span>
                </div>
              `;
            }).join("")}
          </div>
        ` : ''}

        <div style="padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;margin-bottom:32px;font-family:var(--mono);font-size:12px;color:var(--text-faint);line-height:1.7">
          Your first full report is ready. Weekly scans run every Monday at 6am UTC and results appear in your dashboard within the hour. You'll also get a weekly digest email with your score, changes, and top action items.
        </div>

        <a href="/" class="btn">Go to dashboard</a>
      </div>
    `;
    return html(layout("Welcome", body, user));
  }

  // Check if user already has a domain provisioned (from Stripe checkout)
  const hasDomain = user.client_slug ? await env.DB.prepare(
    "SELECT id FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(user.client_slug).first() : null;

  // Fetch initial scan score if available (to show as context)
  let scanScore: { aeo_score: number; grade: string } | null = null;
  if (hasDomain) {
    scanScore = await env.DB.prepare(
      "SELECT aeo_score, grade FROM scan_results WHERE domain_id = ? ORDER BY id DESC LIMIT 1"
    ).bind((hasDomain as any).id).first<{ aeo_score: number; grade: string }>();
  }

  const stepLabel = hasDomain ? 'Last step' : 'Step 1 of 2';

  // Show onboarding form
  const body = `
    <div style="max-width:600px;margin:0 auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="label">Welcome to NeverRanked</div>
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">${stepLabel}</div>
      </div>
      <h1 style="margin-bottom:12px">Let's set up your <em>dashboard</em></h1>
      <p style="color:var(--text-faint);font-size:14px;line-height:1.7;margin-bottom:32px">
        This takes about 60 seconds. We need to know who you compete with so we can track your AEO position relative to theirs.
      </p>

      ${scanScore ? `
      <div class="card" style="text-align:center;margin-bottom:32px;padding:28px">
        <div class="label" style="margin-bottom:12px">Your starting score</div>
        <div style="display:inline-flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;border:2px solid ${scanScore.grade === 'A' || scanScore.grade === 'B' ? 'var(--gold)' : 'var(--text-faint)'};margin-bottom:8px">
          <span style="font-family:var(--serif);font-size:38px;font-style:italic;color:${scanScore.grade === 'A' || scanScore.grade === 'B' ? 'var(--gold)' : 'var(--text-faint)'}">${esc(scanScore.grade)}</span>
        </div>
        <div style="font-family:var(--mono);font-size:18px;color:var(--text)">${scanScore.aeo_score}<span style="font-size:12px;color:var(--text-faint)">/100</span></div>
        <div style="font-family:var(--mono);font-size:12px;color:var(--text-faint);margin-top:8px">
          ${scanScore.aeo_score >= 75 ? "Strong foundation. Let's see how you compare to your competitors."
            : scanScore.aeo_score >= 50 ? "Room to grow. Adding competitors will show you exactly where to focus."
            : "We have work to do. Competitor data will help us prioritize your roadmap."}
        </div>
      </div>
      ` : ''}

      <form method="POST" action="/onboarding">
        ${!hasDomain ? `
        <div style="margin-bottom:32px">
          <div class="label" style="margin-bottom:16px">What's your domain?</div>
          <p style="color:var(--text-faint);font-size:12px;margin-bottom:16px">
            The website we'll scan weekly and optimize for AI visibility.
          </p>
          <div class="form-group">
            <input type="text" name="primary_domain" placeholder="yourbusiness.com" required style="width:100%;max-width:400px">
          </div>
        </div>
        ` : ''}

        <div style="margin-bottom:32px">
          <div class="label" style="margin-bottom:12px">Who are your top competitors?</div>
          <p style="color:var(--text-faint);font-size:12px;margin-bottom:8px">
            We'll scan them on the same schedule and show you side-by-side AEO scores, citation rates, and where they rank in AI answers vs. you.
          </p>
          <p style="color:var(--text-faint);font-size:11px;margin-bottom:16px">
            Just the domain is fine. You can always add more later from your dashboard.
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
          <button type="submit" class="btn">Start tracking</button>
          <a href="/onboarding/skip" style="color:var(--text-faint);font-size:12px;text-decoration:none;border-bottom:1px solid var(--line)">I'll add competitors later</a>
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

  // Handle primary domain if provided
  const primaryDomain = (form.get("primary_domain") as string || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  if (primaryDomain && primaryDomain.length >= 3 && primaryDomain.includes(".")) {
    const clientSlug = primaryDomain.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/g, "-");

    // Set client_slug if not already set
    if (!user.client_slug) {
      await env.DB.prepare(
        "UPDATE users SET client_slug = ? WHERE id = ? AND client_slug IS NULL"
      ).bind(clientSlug, user.id).run();
      user.client_slug = clientSlug;
    }

    // Add domain if it doesn't exist
    const existingDomain = await env.DB.prepare(
      "SELECT id FROM domains WHERE domain = ? AND client_slug = ?"
    ).bind(primaryDomain, user.client_slug).first<{ id: number }>();

    if (!existingDomain) {
      const domResult = await env.DB.prepare(
        "INSERT INTO domains (client_slug, domain, is_competitor, active, created_at, updated_at) VALUES (?, ?, 0, 1, ?, ?)"
      ).bind(user.client_slug, primaryDomain, now, now).run();
      const domainId = Number(domResult.meta?.last_row_id ?? 0);

      // Run initial scan + generate roadmap
      if (domainId) {
        try {
          const scanResult = await scanDomain(domainId, `https://${primaryDomain}/`, "onboard", env);
          if (scanResult && !scanResult.error) {
            await autoGenerateRoadmap(user.client_slug, scanResult, env);
          }
        } catch (e) {
          console.log(`Onboarding scan failed: ${e}`);
        }
      }
    }
  }

  // Handle competitor suggestions — auto-approve and add immediately
  let added = 0;
  for (let i = 1; i <= 5; i++) {
    const domain = (form.get(`domain_${i}`) as string || "").trim().toLowerCase()
      .replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    const label = (form.get(`label_${i}`) as string || "").trim() || null;

    if (!domain || domain.length < 3 || !domain.includes(".")) continue;

    try {
      // Record the suggestion as approved immediately
      await env.DB.prepare(
        "INSERT INTO competitor_suggestions (client_slug, suggested_by, domain, label, status, created_at) VALUES (?, ?, ?, ?, 'approved', ?)"
      ).bind(user.client_slug, user.id, domain, label, now).run();

      // Add as competitor domain right away
      const existingComp = await env.DB.prepare(
        "SELECT id FROM domains WHERE domain = ? AND client_slug = ?"
      ).bind(domain, user.client_slug).first();

      if (!existingComp) {
        await env.DB.prepare(
          "INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active, created_at, updated_at) VALUES (?, ?, 1, ?, 1, ?, ?)"
        ).bind(user.client_slug, domain, label, now, now).run();

        // Trigger initial scan of the new competitor
        const newDomain = await env.DB.prepare(
          "SELECT id FROM domains WHERE domain = ? AND client_slug = ? AND is_competitor = 1"
        ).bind(domain, user.client_slug).first<{ id: number }>();
        if (newDomain) {
          try {
            await scanDomain(newDomain.id, `https://${domain}/`, "onboard", env);
          } catch (e) {
            console.log(`Competitor scan failed for ${domain}: ${e}`);
          }
        }
      }

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
