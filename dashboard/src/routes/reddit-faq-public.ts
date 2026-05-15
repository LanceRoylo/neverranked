/**
 * /reddit-faq/<slug>/public
 *
 * Unauthenticated read-only view of the live deployed Reddit-aware
 * FAQs for a given client_slug. Pulls from schema_injections where
 * status='approved' and schema_type='FAQPage' (the same data the
 * inject snippet serves to AI engines).
 *
 * Used as the "tab 5" demo surface during prospect meetings -- shows
 * what the deployed FAQs look like as a clean reader-style page,
 * without requiring an admin login.
 *
 * No new info disclosure: the FAQ JSON-LD is already public via the
 * snippet on the client's own domain and via /inject/<slug>.json.
 * This route is just a friendly render of that same public data.
 *
 * Set noindex,nofollow so the page does not pollute search results
 * (the FAQ canonical home is the client's own domain).
 */

import type { Env } from "../types";
import { esc } from "../render";

interface FaqQuestion {
  "@type": string;
  name: string;
  acceptedAnswer?: { "@type": string; text: string };
}

interface FaqSchema {
  "@type": string;
  url?: string;
  mainEntity?: FaqQuestion[];
}

function publicLayout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} | NeverRanked</title>
<style>
:root{--bg:#fdfcf8;--ink:#1a1a1a;--mute:#666;--faint:#999;--gold:#bfa04d;--line:#e5e5e5;--card:#fff}
*,*:before,*:after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;line-height:1.65;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:48px 24px 96px}
.kicker{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin-bottom:8px}
h1{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:400;font-size:38px;letter-spacing:-.02em;margin:0 0 6px;line-height:1.15}
.subtitle{font-size:13px;color:var(--mute);margin:0 0 28px}
.meta-row{display:flex;flex-wrap:wrap;gap:18px;font-size:11px;letter-spacing:.05em;color:var(--faint);padding:16px 0 28px;border-bottom:1px solid var(--line);margin-bottom:32px}
.meta-row strong{color:var(--ink);font-weight:500}
.faq{margin:0 0 28px;padding:24px 26px;background:var(--card);border:1px solid var(--line);border-radius:6px}
.faq-q{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-size:20px;line-height:1.35;margin:0 0 12px;color:var(--ink)}
.faq-a{font-size:14px;line-height:1.7;color:var(--mute);margin:0}
.count-badge{display:inline-block;font-size:11px;letter-spacing:.1em;color:var(--gold);font-weight:600;text-transform:uppercase;margin-right:8px;vertical-align:middle}
footer{margin-top:48px;padding-top:24px;border-top:1px solid var(--line);font-size:11px;color:var(--faint);text-align:center;line-height:1.7}
footer a{color:var(--gold);text-decoration:underline}
a{color:var(--gold)}
@media (max-width:600px){.wrap{padding:32px 18px 64px}h1{font-size:28px}.faq{padding:18px 18px}.faq-q{font-size:17px}}
</style>
</head>
<body>
<div class="wrap">${body}</div>
</body>
</html>`;
}

function notFoundPage(slug: string): Response {
  const body = `
    <div class="kicker">NeverRanked &middot; FAQ deployment</div>
    <h1>No live FAQ deployment</h1>
    <p style="color:var(--mute)">There is no FAQ deployment currently live for <strong>${esc(slug)}</strong>. Either this client has not deployed a FAQ schema, or the deployment is paused.</p>
    <footer>
      <p>What this page would normally show: the live Reddit-aware FAQ schema deployed to the client's own domain via the NeverRanked snippet.</p>
      <p><a href="https://neverranked.com">neverranked.com</a></p>
    </footer>
  `;
  return new Response(publicLayout("Not found", body), {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex,nofollow" },
  });
}

export async function handleRedditFaqPublic(slug: string, env: Env): Promise<Response> {
  // Slug validation: lowercase, alphanumeric + hyphens. Bounce anything else.
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    return notFoundPage(slug);
  }

  // Pull deployed FAQ + client metadata for the header.
  const [faqRow, clientRow] = await Promise.all([
    env.DB.prepare(
      `SELECT json_ld, updated_at FROM schema_injections
        WHERE client_slug = ? AND schema_type = 'FAQPage' AND status = 'approved'
        ORDER BY updated_at DESC LIMIT 1`,
    ).bind(slug).first<{ json_ld: string; updated_at: number }>(),
    env.DB.prepare(
      `SELECT business_name, business_url FROM injection_configs WHERE client_slug = ?`,
    ).bind(slug).first<{ business_name: string | null; business_url: string | null }>(),
  ]);

  if (!faqRow) return notFoundPage(slug);

  let schema: FaqSchema;
  try {
    schema = JSON.parse(faqRow.json_ld);
  } catch {
    return notFoundPage(slug);
  }

  const questions = Array.isArray(schema.mainEntity) ? schema.mainEntity : [];
  if (questions.length === 0) return notFoundPage(slug);

  const businessName = clientRow?.business_name || slug;
  const businessUrl = clientRow?.business_url || schema.url || `https://${slug}.com`;
  const deployedDate = new Date(faqRow.updated_at * 1000).toISOString().slice(0, 10);

  const faqCards = questions
    .filter((q) => q && q.name && q.acceptedAnswer?.text)
    .map((q, i) => `
      <div class="faq">
        <h2 class="faq-q"><span class="count-badge">FAQ ${i + 1}</span>${esc(q.name)}</h2>
        <p class="faq-a">${esc(q.acceptedAnswer!.text)}</p>
      </div>
    `).join("");

  const body = `
    <div class="kicker">NeverRanked &middot; Live FAQ deployment</div>
    <h1>${esc(businessName)}</h1>
    <p class="subtitle">Reddit-aware FAQ schema deployed to <a href="${esc(businessUrl)}">${esc(businessUrl.replace(/^https?:\/\//, ""))}</a></p>

    <div class="meta-row">
      <span><strong>${questions.length}</strong> live questions</span>
      <span>Deployed <strong>${deployedDate}</strong></span>
      <span>Format: <strong>FAQPage JSON-LD</strong></span>
      <span>Visible to: <strong>AI engines</strong></span>
    </div>

    ${faqCards}

    <footer>
      <p>This is a read-only view of the live FAQ schema injected on ${esc(businessUrl.replace(/^https?:\/\//, ""))} via the NeverRanked snippet. The schema is invisible to normal site visitors. AI engines (ChatGPT, Perplexity, Gemini, Claude with web, Bing AI) read it when grounding answers about the business.</p>
      <p style="margin-top:14px"><a href="https://neverranked.com">neverranked.com</a> &middot; <a href="https://neverranked.com/case-studies/hawaii-theatre/">Hawaii Theatre case study</a></p>
    </footer>
  `;

  return new Response(publicLayout(`${businessName} live FAQs`, body), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex,nofollow",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
