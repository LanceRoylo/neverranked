/**
 * Dashboard -- Onboarding drip emails for new paying clients
 *
 * Triggered by the weekly cron but checks daily-appropriate windows.
 * Day 1: drip_start set on first login (welcome email already sent at checkout)
 * Day 3: "Your first scan results" -- score highlight, one quick win
 * Day 7: "Your roadmap is ready" (Signal/Amplify) or "Want ongoing monitoring?" (Audit upsell)
 */

import type { Env, User, ScanResult } from "./types";

const DAY_IN_SECONDS = 86400;

interface DripUser {
  id: number;
  email: string;
  name: string | null;
  plan: string | null;
  client_slug: string | null;
  onboarding_drip_start: number;
  onboarding_drip_day3: number | null;
  onboarding_drip_day7: number | null;
}

export async function sendOnboardingDripEmails(env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  const now = Math.floor(Date.now() / 1000);

  // Find users who started onboarding drip and haven't finished
  const users = (await env.DB.prepare(
    `SELECT id, email, name, plan, client_slug, onboarding_drip_start, onboarding_drip_day3, onboarding_drip_day7
     FROM users
     WHERE onboarding_drip_start IS NOT NULL
       AND (onboarding_drip_day3 IS NULL OR onboarding_drip_day7 IS NULL)
       AND role = 'client'`
  ).all<DripUser>()).results;

  if (users.length === 0) return;

  let sent = 0;

  for (const user of users) {
    const daysSinceStart = (now - user.onboarding_drip_start) / DAY_IN_SECONDS;

    // Day 3 email: scan results + quick win
    if (!user.onboarding_drip_day3 && daysSinceStart >= 3) {
      const scan = await getLatestScan(user, env);
      const ok = await sendEmail(
        user.email,
        "Your AEO scan results are in",
        buildDay3Email(user, scan, env),
        env
      );
      if (ok) {
        await env.DB.prepare(
          "UPDATE users SET onboarding_drip_day3 = ? WHERE id = ?"
        ).bind(now, user.id).run();
        sent++;
      }
    }

    // Day 7 email: roadmap or upsell
    if (!user.onboarding_drip_day7 && daysSinceStart >= 7) {
      const ok = await sendEmail(
        user.email,
        user.plan === "audit"
          ? "What comes after the audit"
          : "Your SEO roadmap is taking shape",
        buildDay7Email(user, env),
        env
      );
      if (ok) {
        await env.DB.prepare(
          "UPDATE users SET onboarding_drip_day7 = ? WHERE id = ?"
        ).bind(now, user.id).run();
        sent++;
      }
    }

    // Rate limit
    if (sent % 5 === 0 && sent > 0) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (sent > 0) {
    console.log(`Onboarding drip: ${sent} emails sent`);
  }
}

async function getLatestScan(user: DripUser, env: Env): Promise<ScanResult | null> {
  if (!user.client_slug) return null;
  const result = await env.DB.prepare(
    `SELECT sr.* FROM scan_results sr
     JOIN domains d ON sr.domain_id = d.id
     WHERE d.client_slug = ? AND d.is_competitor = 0 AND sr.error IS NULL
     ORDER BY sr.scanned_at DESC LIMIT 1`
  ).bind(user.client_slug).first<ScanResult>();
  return result || null;
}

async function sendEmail(to: string, subject: string, html: string, env: Env): Promise<boolean> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NeverRanked <reports@neverranked.com>",
        to: [to],
        subject,
        html,
      }),
    });

    const result = await resp.json() as any;
    if (result.error) {
      console.log(`Drip email failed for ${to}: ${result.error.message}`);
      return false;
    }

    // Log it
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT INTO email_log (email, type, created_at) VALUES (?, 'onboarding_drip', ?)"
    ).bind(to, now).run();

    return true;
  } catch (e) {
    console.log(`Drip email error for ${to}: ${e}`);
    return false;
  }
}

// ---------- Email builders ----------

function buildDay3Email(user: DripUser, scan: ScanResult | null, env: Env): string {
  const dashboardOrigin = env.DASHBOARD_ORIGIN || "https://app.neverranked.com";
  const firstName = user.name?.split(" ")[0] || "";
  const greeting = firstName ? `${firstName}, your` : "Your";

  let scoreBlock: string;

  if (scan) {
    const score = scan.aeo_score;
    const grade = scan.grade;
    const gradeColor = grade === "A" ? "#4ade80" : grade === "B" ? "#c8a850" : grade === "C" ? "#f59e0b" : "#ef4444";

    // Parse one red flag as the "quick win"
    let quickWin = "";
    try {
      const flags = JSON.parse(scan.red_flags || "[]");
      if (flags.length > 0) {
        quickWin = `
          <div style="background:#0f1a0f;border:1px solid #1a2e1a;border-radius:4px;padding:16px;margin-top:16px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#4ade80;margin-bottom:8px">Quick win</div>
            <div style="font-size:13px;color:#ccc;line-height:1.6">${flags[0]}</div>
          </div>`;
      }
    } catch {}

    scoreBlock = `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:48px;font-weight:700;color:#fff">${score}</div>
        <div style="font-size:14px;color:${gradeColor};font-weight:600;margin-top:4px">Grade: ${grade}</div>
        <div style="font-size:12px;color:#666;margin-top:8px">out of 100</div>
      </div>
      ${quickWin}`;
  } else {
    scoreBlock = `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:14px;color:#888">Your first scan is being processed. Check your dashboard for results.</div>
      </div>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,system-ui,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px">

    <div style="margin-bottom:32px">
      <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">NeverRanked</span>
    </div>

    <h1 style="font-size:22px;font-weight:600;color:#ffffff;margin:0 0 8px;line-height:1.3">
      ${greeting} first scan results are in
    </h1>
    <p style="font-size:14px;color:#888;margin:0 0 32px">
      Here is where your site stands with AI-powered search engines.
    </p>

    <div style="background:#111;border:1px solid #222;border-radius:6px;padding:24px;margin-bottom:32px">
      ${scoreBlock}
    </div>

    <div style="background:#111;border:1px solid #222;border-radius:6px;padding:20px;margin-bottom:32px">
      <div style="font-size:13px;color:#ccc;line-height:1.7">
        <p style="margin:0 0 8px"><strong style="color:#fff">What this means:</strong> Your AEO score measures how well AI assistants can understand, trust, and recommend your business. The higher the score, the more likely you show up when potential customers ask AI for recommendations.</p>
        <p style="margin:0">Most businesses score between 30-50. Even small improvements can meaningfully change how often AI mentions you.</p>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:40px">
      <a href="${dashboardOrigin}" style="display:inline-block;background:#c8a850;color:#0a0a0a;font-size:14px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:4px;letter-spacing:0.3px">
        View full results
      </a>
    </div>

    <div style="border-top:1px solid #1a1a1a;padding-top:24px;font-size:11px;color:#444;line-height:1.6">
      <p style="margin:0 0 4px">Questions? Reply to this email or reach us at hello@neverranked.com</p>
      <p style="margin:0">NeverRanked -- AI visibility for businesses that depend on being found.</p>
    </div>

  </div>
</body>
</html>`;
}

function buildDay7Email(user: DripUser, env: Env): string {
  const dashboardOrigin = env.DASHBOARD_ORIGIN || "https://app.neverranked.com";
  const firstName = user.name?.split(" ")[0] || "";
  const isAudit = user.plan === "audit";

  if (isAudit) {
    // Upsell from audit to Signal
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,system-ui,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px">

    <div style="margin-bottom:32px">
      <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">NeverRanked</span>
    </div>

    <h1 style="font-size:22px;font-weight:600;color:#ffffff;margin:0 0 8px;line-height:1.3">
      ${firstName ? firstName + ", your" : "Your"} audit is just the starting line
    </h1>
    <p style="font-size:14px;color:#888;margin:0 0 32px">
      You have the diagnosis. Here is what ongoing monitoring looks like.
    </p>

    <div style="background:#111;border:1px solid #222;border-radius:6px;padding:24px;margin-bottom:24px">
      <div style="font-size:13px;color:#ccc;line-height:1.7">
        <p style="margin:0 0 12px">Your audit gave you a snapshot of where you stand. But AI search rankings shift constantly -- new competitors optimize, AI models retrain, and the landscape changes week to week.</p>
        <p style="margin:0"><strong style="color:#fff">NeverRanked Signal</strong> tracks your AEO score every week, alerts you to regressions, and gives you a prioritized roadmap so you always know what to fix next.</p>
      </div>
    </div>

    <div style="background:#111;border:1px solid #222;border-radius:6px;padding:20px;margin-bottom:32px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#c8a850;margin-bottom:12px">What Signal includes</div>
      <div style="font-size:13px;color:#ccc;line-height:2">
        Weekly automated scans and score tracking<br>
        Regression alerts before you lose ground<br>
        Competitor benchmarking<br>
        Prioritized fix roadmap updated every week<br>
        Monthly strategy call
      </div>
    </div>

    <div style="text-align:center;margin-bottom:40px">
      <a href="https://neverranked.com/#pricing" style="display:inline-block;background:#c8a850;color:#0a0a0a;font-size:14px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:4px;letter-spacing:0.3px">
        See Signal pricing
      </a>
      <p style="font-size:12px;color:#555;margin-top:12px">or reply to this email with questions</p>
    </div>

    <div style="border-top:1px solid #1a1a1a;padding-top:24px;font-size:11px;color:#444;line-height:1.6">
      <p style="margin:0 0 4px">This is the last onboarding email you will receive.</p>
      <p style="margin:0">NeverRanked -- AI visibility for businesses that depend on being found.</p>
    </div>

  </div>
</body>
</html>`;
  }

  // Signal / Amplify -- roadmap reinforcement
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,system-ui,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px">

    <div style="margin-bottom:32px">
      <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">NeverRanked</span>
    </div>

    <h1 style="font-size:22px;font-weight:600;color:#ffffff;margin:0 0 8px;line-height:1.3">
      ${firstName ? firstName + ", your" : "Your"} roadmap is taking shape
    </h1>
    <p style="font-size:14px;color:#888;margin:0 0 32px">
      One week in. Here is what is happening behind the scenes.
    </p>

    <div style="background:#111;border:1px solid #222;border-radius:6px;padding:24px;margin-bottom:24px">
      <div style="font-size:13px;color:#ccc;line-height:1.7">
        <p style="margin:0 0 12px">Your first week of scans are complete. We are building your prioritized AEO roadmap based on what the data shows -- the specific changes that will have the biggest impact on how AI recommends your business.</p>
        <p style="margin:0">Log into your dashboard to see your roadmap, track your score over time, and see how you compare to competitors.</p>
      </div>
    </div>

    <div style="background:#111;border:1px solid #222;border-radius:6px;padding:20px;margin-bottom:32px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#c8a850;margin-bottom:12px">This week</div>
      <div style="font-size:13px;color:#ccc;line-height:2">
        Baseline scans complete<br>
        Competitor benchmarks identified<br>
        Priority fixes queued in your roadmap<br>
        Weekly digest emails start next Monday
      </div>
    </div>

    <div style="text-align:center;margin-bottom:40px">
      <a href="${dashboardOrigin}" style="display:inline-block;background:#c8a850;color:#0a0a0a;font-size:14px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:4px;letter-spacing:0.3px">
        Open your dashboard
      </a>
    </div>

    <div style="border-top:1px solid #1a1a1a;padding-top:24px;font-size:11px;color:#444;line-height:1.6">
      <p style="margin:0 0 4px">Questions? Reply to this email or reach us at hello@neverranked.com</p>
      <p style="margin:0">NeverRanked -- AI visibility for businesses that depend on being found.</p>
    </div>

  </div>
</body>
</html>`;
}
