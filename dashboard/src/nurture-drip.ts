/**
 * Dashboard -- Nurture drip emails for free check tool users
 *
 * Triggered daily by the cron handler.
 * Day 14: "The Deeper Problem" -- educate on what drives the score, link to blog content
 * Day 30: "The 90-Day Window" -- compounding advantage, soft CTA for paid audit
 *
 * Target: users who ran the free check but have NOT purchased a paid plan.
 * Suppression: day 30 is suppressed if user has a paid plan by then.
 */

import type { Env } from "./types";

const DAY_IN_SECONDS = 86400;

interface NurtureUser {
  id: number;
  email: string;
  name: string | null;
  plan: string | null;
  nurture_day14_sent: number | null;
  nurture_day30_sent: number | null;
  created_at: number;
}

export async function sendNurtureDripEmails(env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  const now = Math.floor(Date.now() / 1000);

  // Users who signed up (via free check), have no paid plan, and haven't finished nurture
  const users = (await env.DB.prepare(
    `SELECT id, email, name, plan, nurture_day14_sent, nurture_day30_sent, created_at
     FROM users
     WHERE role = 'client'
       AND (nurture_day14_sent IS NULL OR nurture_day30_sent IS NULL)
       AND created_at IS NOT NULL`
  ).all<NurtureUser>()).results;

  if (users.length === 0) return;

  let sent = 0;

  for (const user of users) {
    const daysSinceCreation = (now - user.created_at) / DAY_IN_SECONDS;

    // Day 14: educational email (send to all users, paid or free)
    if (!user.nurture_day14_sent && daysSinceCreation >= 14) {
      const ok = await sendEmail(
        user.email,
        "Your AEO score is a symptom, not the diagnosis",
        buildDay14Email(user),
        env
      );
      if (ok) {
        await env.DB.prepare(
          "UPDATE users SET nurture_day14_sent = ? WHERE id = ?"
        ).bind(now, user.id).run();
        sent++;
      }
    }

    // Day 30: conversion email (suppress if user already has a paid plan)
    if (!user.nurture_day30_sent && daysSinceCreation >= 30) {
      if (user.plan && user.plan !== "free") {
        // Already converted -- mark as sent to stop checking
        await env.DB.prepare(
          "UPDATE users SET nurture_day30_sent = ? WHERE id = ?"
        ).bind(now, user.id).run();
        continue;
      }

      const ok = await sendEmail(
        user.email,
        "The businesses starting AEO now will own the answer by Q3",
        buildDay30Email(user),
        env
      );
      if (ok) {
        await env.DB.prepare(
          "UPDATE users SET nurture_day30_sent = ? WHERE id = ?"
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
    console.log(`Nurture drip: ${sent} emails sent`);
  }
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
      console.log(`Nurture email failed for ${to}: ${result.error.message}`);
      return false;
    }

    return true;
  } catch (e) {
    console.log(`Nurture email error for ${to}: ${e}`);
    return false;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Day 14 -- "The Deeper Problem"
// Educational, no hard sell. Links to 3 blog articles.
// Creative lever: Reframe
// ---------------------------------------------------------------------------

function buildDay14Email(user: NurtureUser): string {
  const firstName = user.name?.split(" ")[0] || "there";

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your AEO Score</title>
</head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#e8c767">Never Ranked</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 0 0">
            <div style="font-family:Georgia,serif;font-size:15px;color:#fbf8ef;line-height:1.8">

              <p style="margin:0 0 20px">Hey ${esc(firstName)},</p>

              <p style="margin:0 0 20px">Two weeks ago you checked your AI visibility score. Whether you scored a 30 or a 70, the number itself is not the interesting part.</p>

              <p style="margin:0 0 20px">The interesting part is what the score measures.</p>

              <p style="margin:0 0 20px">When someone asks ChatGPT for a recommendation in your industry, the model does not search the internet in real time. It pulls from structured data, entity signals, review patterns, and content architecture that it has already indexed. Your score reflects how much of that information exists for your business and how well the model can parse it.</p>

              <p style="margin:0 0 12px;color:#e8c767;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase">Three things that move the score</p>

              <p style="margin:0 0 20px"><strong style="color:#fbf8ef">1. Schema markup.</strong> <span style="color:#b0b0a8">Not the generic kind your website builder added. The specific types that AI models use to build entity understanding. Organization, LocalBusiness, FAQPage with questions that match what users actually ask the model.</span></p>

              <p style="margin:0 0 20px"><strong style="color:#fbf8ef">2. Entity consistency.</strong> <span style="color:#b0b0a8">Your business name, address, description, and categories need to match across every platform the model checks. Google Business Profile, Yelp, industry directories, your own website. Inconsistency is a trust signal the model weighs heavily.</span></p>

              <p style="margin:0 0 20px"><strong style="color:#fbf8ef">3. Content that answers predicted questions.</strong> <span style="color:#b0b0a8">AI models predict what users will ask next. If your website has content structured around those exact questions, the model has something to cite. If it does not, the model cites whoever does.</span></p>

            </div>
          </td>
        </tr>

        <!-- Blog links -->
        <tr>
          <td style="padding:24px 0">
            <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:16px">Read more</div>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
              <tr>
                <td style="padding:14px 16px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
                  <a href="https://neverranked.com/blog/schema-markup-ai-search/" style="font-family:Georgia,serif;font-size:14px;color:#e8c767;text-decoration:none">How schema markup works for AI search</a>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
              <tr>
                <td style="padding:14px 16px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
                  <a href="https://neverranked.com/blog/why-chatgpt-recommends-your-competitor/" style="font-family:Georgia,serif;font-size:14px;color:#e8c767;text-decoration:none">Why your competitor shows up instead of you</a>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:14px 16px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
                  <a href="https://neverranked.com/blog/aeo-score-what-it-means/" style="font-family:Georgia,serif;font-size:14px;color:#e8c767;text-decoration:none">What your AEO score actually measures</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Closing -->
        <tr>
          <td style="padding:8px 0 32px">
            <div style="font-family:Georgia,serif;font-size:15px;color:#b0b0a8;line-height:1.8">
              <p style="margin:0 0 20px">Your score will update in your next weekly digest. If you have not logged into the dashboard yet, that is where the full breakdown lives.</p>
              <p style="margin:0 0 4px;color:#fbf8ef">Lance</p>
              <p style="margin:0;font-family:'Courier New',monospace;font-size:11px;color:#888888">Never Ranked</p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0;border-top:1px solid #2a2a2a">
            <div style="font-family:'Courier New',monospace;font-size:10px;color:#555555;line-height:1.6">
              Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a><br>
              You received this because you ran an AI visibility check on neverranked.com.
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`.trim();
}

// ---------------------------------------------------------------------------
// Day 30 -- "The 90-Day Window"
// Conversion email. Soft sell for the $500 audit.
// Creative lever: Specificity + Tension Hold
// ---------------------------------------------------------------------------

function buildDay30Email(user: NurtureUser): string {
  const firstName = user.name?.split(" ")[0] || "there";

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The 90-Day Window</title>
</head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#e8c767">Never Ranked</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 0 0">
            <div style="font-family:Georgia,serif;font-size:15px;color:#fbf8ef;line-height:1.8">

              <p style="margin:0 0 20px">Hey ${esc(firstName)},</p>

              <p style="margin:0 0 20px">A month ago you checked your AI visibility. Since then, the models have retrained at least once. New data has been indexed. The competitive landscape in your market has shifted.</p>

              <p style="margin:0 0 20px">Here is what we are seeing across every industry we track:</p>

              <p style="margin:0 0 20px">The gap between businesses that are visible to AI search and businesses that are not is widening. Not because the invisible businesses are getting worse. Because the visible ones are compounding.</p>

              <p style="margin:0 0 20px;color:#b0b0a8">AI citation share works like compound interest. Once a model starts citing your business, your content gets more engagement, which generates more signals, which makes the model more confident in citing you again. The businesses that started optimizing 90 days ago are pulling ahead. The ones that start today will catch up. The ones that wait until next quarter will be chasing a target that keeps moving.</p>

              <p style="margin:0 0 20px">AEO takes 90 days to show measurable results. That math does not change regardless of when you start. But the businesses starting now will see movement by Q3.</p>

            </div>
          </td>
        </tr>

        <!-- Audit offer -->
        <tr>
          <td style="padding:8px 0 24px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#e8c767;margin-bottom:16px">Full AEO Audit -- $500</div>
                  <div style="font-family:Georgia,serif;font-size:13px;color:#b0b0a8;line-height:1.8">
                    Six deliverables. 48-hour turnaround.<br><br>
                    AI citation share analysis<br>
                    Schema coverage audit<br>
                    Entity consistency check<br>
                    Content gap analysis<br>
                    Competitor signal comparison<br>
                    90-day implementation roadmap<br><br>
                    <span style="color:#fbf8ef">No retainer. No ongoing commitment. Just the audit and the roadmap.</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:8px 0 24px">
            <a href="https://neverranked.com/#pricing" style="display:inline-block;padding:14px 32px;background:#e8c767;color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">Get your audit</a>
          </td>
        </tr>

        <!-- Closing -->
        <tr>
          <td style="padding:8px 0 32px">
            <div style="font-family:Georgia,serif;font-size:15px;color:#b0b0a8;line-height:1.8">
              <p style="margin:0 0 20px">Your free dashboard and weekly tracking keep running either way. The data is yours.</p>
              <p style="margin:0 0 20px">Reply to this email if you have questions. I read every one.</p>
              <p style="margin:0 0 4px;color:#fbf8ef">Lance</p>
              <p style="margin:0;font-family:'Courier New',monospace;font-size:11px;color:#888888">Never Ranked</p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0;border-top:1px solid #2a2a2a">
            <div style="font-family:'Courier New',monospace;font-size:10px;color:#555555;line-height:1.6">
              Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a><br>
              You received this because you ran an AI visibility check on neverranked.com.<br>
              This is the last nurture email you will receive.
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`.trim();
}
