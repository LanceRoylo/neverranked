/**
 * NeverRanked Schema & AEO Health Check — Cloudflare Worker
 *
 * Serves the single-page UI at root and exposes POST /api/check
 * that fetches a target URL, extracts technical signals, and returns
 * a graded JSON report.
 */

export interface Env {
  LEADS: KVNamespace;
  // neverranked-app, shared with the dashboard. Schema is owned by
  // dashboard/migrations (0131 for the free-check tables). This Worker never
  // migrates it.
  DB: D1Database;
  RESEND_API_KEY?: string;
  // Admin-secret for the /api/admin/* family. Provisioned as a secret.
  ADMIN_SECRET?: string;
  // The day-3 / day-7 drip only runs when this is exactly "1". Default off
  // (decision 2, 2026-10-07). See drip-email.ts for why.
  DRIP_ENABLED?: string;
  // Comma list of addresses that are us. Secret, because this repo is public.
  INTERNAL_EMAILS?: string;
  // Where the immediate new-lead alert goes. Secret or var, never hard-coded.
  // Unset means no alert email (the admin inbox item is still written).
  LEAD_ALERT_TO?: string;
  // Optional shared secret for the keyed Montaic API lane. When set,
  // a request carrying a matching X-API-Key header bypasses the per-IP
  // rate limit and is tagged as source "montaic" in telemetry. The
  // worker only READS this value — it is provisioned via
  // `wrangler secret put MONTAIC_API_KEY` and never generated here.
  MONTAIC_API_KEY?: string;
}

// True when the request carries the configured Montaic API key. Used to
// open a keyed, attributable, rate-limit-bypassing lane on the /api/*
// scoring routes. Returns false whenever MONTAIC_API_KEY is unset, so
// the public behavior is unchanged until the secret is provisioned.
function isKeyed(request: Request, env: Env): boolean {
  return !!env.MONTAIC_API_KEY && request.headers.get("X-API-Key") === env.MONTAIC_API_KEY;
}

// ---------- Rate limiting (in-memory, per-isolate) ----------

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Paginate KV.list to get all keys with a given prefix. Single list()
// calls return only the alphabetically-first 1000 keys per page (which
// is the OLDEST 1000 for epoch-prefixed keys). Past 1000 total keys,
// a non-paginated call hides the newest events entirely. This helper
// loops with the cursor until list_complete. Mirrors
// dashboard/src/lib/kv-paginate.ts in the dashboard worker. The two
// workers can't share code so this is duplicated by design.
async function listAllKvKeys(
  kv: KVNamespace,
  prefix: string,
  maxPages = 10,
): Promise<{ name: string }[]> {
  const all: { name: string }[] = [];
  let cursor: string | undefined = undefined;
  for (let page = 0; page < maxPages; page++) {
    const r = await kv.list({ prefix, limit: 1000, cursor });
    all.push(...r.keys);
    if (r.list_complete) break;
    cursor = (r as any).cursor;
    if (!cursor) break;
  }
  return all;
}

// ---------- Shared analysis logic (packages/aeo-analyzer) ----------

import { buildReport, buildReportFollowingSnippets, reportReadNothing, gradeSchema, gradeBucket } from "../../../packages/aeo-analyzer/src";
import { agentReadinessCheck, llmsTxtCheck } from "./scoring-ports";
import { isPublicHttpUrl } from "./url-safety";
import { PAGE_COPY, KIT_QUESTIONS, UNSUB_COPY } from "./copy";
import { CURRENT_CONSENT_VERSION, consentFor } from "./consent";
import { classifyRequest, cleanSessionId, internalEmail } from "./free-check-classify";
import { isBotUserAgent } from "./bot-ua";
import { extractIdentity } from "./identity";
import { missingSignals, summaryFromClient, type ScanSummary } from "./missing-signals";
import { buildReportEmail, buildLeadAlert } from "./report-email";
import { buildDripDay3Email, buildDripDay7Email, dripDay3Subject, dripDay7Subject } from "./drip-email";
import {
  cleanUtm, cleanReferrer, cleanUa, nowSeconds, eventStatement, scanStatement, cleanScanId, loadScan,
  insertLead, inboxStatement, recordReportResult, markUnsubscribed, type EventRow,
} from "./free-check-store";

// The link-preview image. /images/check-og.png never existed (404), so the
// LinkedIn card showed no image. og.jpg is the site's own card and returns 200.
const OG_IMAGE = "https://neverranked.com/og.jpg";

/** Escape a string for an HTML attribute or text node. */
function attr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- HTML UI ----------

const HTML_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#121212">
<title>AI Search Check: see how AI tools read your site | Never Ranked</title>
<meta name="description" content="${attr(PAGE_COPY.metaDescription)}">
<link rel="canonical" href="https://check.neverranked.com/">
<meta name="robots" content="index, follow">
<meta property="og:title" content="AI Search Check: see how AI tools read your site">
<meta property="og:description" content="${attr(PAGE_COPY.ogDescription)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://check.neverranked.com/">
<meta property="og:site_name" content="Never Ranked">
<meta property="og:image" content="${OG_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="AI Search Check: see how AI tools read your site">
<meta name="twitter:description" content="Free check. See how AI tools read your website, and what's missing.">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23121212'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-family='Georgia,serif' font-size='22' fill='%23e8c767' font-style='italic'%3EN%3C/text%3E%3C/svg%3E">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "AI Search Check",
      "applicationCategory": "WebApplication",
      "operatingSystem": "Any",
      "url": "https://check.neverranked.com",
      "description": ${JSON.stringify(PAGE_COPY.metaDescription)},
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "creator": {
        "@type": "Organization",
        "name": "Never Ranked",
        "url": "https://neverranked.com"
      }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does this tool check?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": ${JSON.stringify(PAGE_COPY.faqWhatChecks)}
          }
        },
        {
          "@type": "Question",
          "name": "Why does this matter?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": ${JSON.stringify(PAGE_COPY.faqWhy)}
          }
        },
        {
          "@type": "Question",
          "name": "Is this tool free?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": ${JSON.stringify(PAGE_COPY.faqFree)}
          }
        },
        {
          "@type": "Question",
          "name": "What’s the difference between this check and a full engagement?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "This check looks at your website. A full engagement measures what AI tools actually say about your category. We ask the same 18 real customer questions across six AI tools: four that cite live sources (Perplexity, ChatGPT search, Gemini grounded, Google AI Overviews) plus two that answer from model knowledge (Claude, Gemma). We also run Bing organic as a classic-search control, which makes seven measured surfaces. We hand your team a clear list of what to fix. Monitoring is $199 a month per category. A full audit with a pre-registered method and a written readout is $750 a month per category after a $950 baseline month."
          }
        }
      ]
    }
  ]
}
</script>
<style>
:root{
  --bg:#121212;
  --bg-lift:#1c1c1c;
  --bg-edge:#242424;
  --gold:#e8c767;
  --gold-dim:#bfa04d;
  --gold-wash:rgba(232,199,103,.14);
  --text:#fbf8ef;
  --text-soft:rgba(251,248,239,.98);
  --text-mute:rgba(251,248,239,.86);
  --text-faint:rgba(251,248,239,.78);
  --line:rgba(251,248,239,.28);
  --line-strong:rgba(251,248,239,.44);
  --serif:"Playfair Display",Georgia,serif;
  --mono:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --label:"Barlow Condensed","Arial Narrow",sans-serif;
  --gutter:clamp(20px,4vw,64px);
  --max:1120px;
  --ease:cubic-bezier(.2,.7,.2,1);
}

*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{
  background:var(--bg);
  color:var(--text);
  font-family:var(--mono);
  font-size:14px;
  line-height:1.65;
  font-weight:300;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
  text-rendering:optimizeLegibility;
  overflow-x:hidden;
  min-height:100vh;
}
img,svg{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
button:active{transform:translateY(1px)}
::selection{background:var(--gold);color:var(--bg)}

/* keyboard focus ring — only fires for keyboard users, no change for mouse */
a:focus-visible,button:focus-visible,input:focus-visible{
  outline:2px solid var(--gold);
  outline-offset:2px;
  border-radius:2px;
}

/* tabular figures so the instrument's headline numbers stay aligned */
.grade-circle .letter,.aeo-score span,.schema-summary-count,
.email-gate-count,.flag-summary-count,.comp-bar-score,
.grade-dist-pct,.tech-summary-count{
  font-variant-numeric:tabular-nums;
  font-feature-settings:'tnum' 1;
}

/* respect reduced-motion: kill decorative loops, keep final states */
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.001ms !important;
    animation-iteration-count:1 !important;
    transition-duration:.001ms !important;
    scroll-behavior:auto !important;
  }
  .grain{animation:none}
  .loading .dot{animation:none}
  button:active{transform:none}
}

/* grain overlay */
.grain{
  position:fixed;inset:-50%;
  width:200%;height:200%;
  pointer-events:none;z-index:100;
  opacity:.14;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  background-size:260px 260px;
  animation:grain 1.2s steps(6) infinite;
}
@keyframes grain{
  0%{transform:translate(0,0)}
  20%{transform:translate(-3%,2%)}
  40%{transform:translate(2%,-3%)}
  60%{transform:translate(-2%,-2%)}
  80%{transform:translate(3%,3%)}
  100%{transform:translate(0,0)}
}

/* vignette */
body::before{
  content:"";position:fixed;inset:0;
  pointer-events:none;z-index:99;
  background:
    radial-gradient(120% 80% at 50% 0%,transparent 40%,rgba(0,0,0,.45) 100%),
    radial-gradient(80% 60% at 50% 100%,transparent 45%,rgba(0,0,0,.4) 100%);
}

/* layout */
.wrap{
  width:100%;max-width:var(--max);
  margin:0 auto;padding:0 var(--gutter);
  position:relative;
}

/* nav */
.nav{
  padding:28px var(--gutter);
  display:flex;align-items:center;
  justify-content:space-between;
  position:relative;z-index:10;
}
.nav .mark{
  font-family:var(--serif);
  font-style:italic;font-size:22px;
  letter-spacing:-.01em;
  color:var(--gold);
}
.nav .tool-name{
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.18em;
  font-size:11px;
  color:var(--text-mute);
}

/* hero */
.hero{
  text-align:center;
  padding:60px 0 40px;
  position:relative;z-index:10;
}
.hero h1{
  font-family:var(--serif);
  font-size:clamp(32px,5.5vw,56px);
  font-weight:400;
  letter-spacing:-.02em;
  line-height:1.08;
  margin-bottom:20px;
  text-wrap:balance;
}
/* visually hidden, available to assistive tech */
.sr-only{
  position:absolute;width:1px;height:1px;padding:0;margin:-1px;
  overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;
}
.hero h1 em{font-style:italic;color:var(--gold)}
.hero .sub{
  font-family:var(--mono);
  font-size:13px;
  color:var(--text-faint);
  max-width:520px;
  margin:0 auto 36px;
  line-height:1.7;
}

/* input area */
.input-area{
  display:flex;gap:12px;
  max-width:600px;margin:0 auto;
  position:relative;z-index:10;
}
.input-area input{
  flex:1;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:4px;
  padding:14px 18px;
  font-family:var(--mono);
  font-size:14px;
  color:var(--text);
  outline:none;
  transition:border-color .3s var(--ease);
}
.input-area input:focus{border-color:var(--gold)}
.input-area input::placeholder{color:var(--text-faint)}
.input-area button{
  background:var(--gold);
  border:1px solid var(--gold);
  color:var(--bg);
  padding:14px 28px;
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.18em;
  font-size:12px;
  font-weight:500;
  border-radius:4px;
  transition:background .35s var(--ease),border-color .35s var(--ease);
  white-space:nowrap;
}
.input-area button:hover{background:#f0e2b0;border-color:#f0e2b0;color:var(--bg)}
.input-area button:disabled{opacity:.4;cursor:not-allowed}

/* loading */
.loading{
  display:none;
  text-align:center;
  padding:40px 0;
  position:relative;z-index:10;
}
.loading.active{display:block}
.loading .dot{
  display:inline-block;
  width:10px;height:10px;
  background:var(--gold);
  border-radius:50%;
  animation:pulse 1.2s ease-in-out infinite;
  margin-right:12px;
}
@keyframes pulse{
  0%,100%{opacity:1;transform:scale(1)}
  50%{opacity:.4;transform:scale(.7)}
}
.loading .text{
  font-family:var(--mono);
  font-size:13px;
  color:var(--text-mute);
}

/* error */
.error-msg{
  display:none;
  text-align:center;
  padding:20px;
  margin:20px auto;
  max-width:600px;
  background:rgba(200,60,60,.08);
  border:1px solid rgba(200,60,60,.3);
  border-radius:4px;
  color:#e8a0a0;
  font-size:13px;
  position:relative;z-index:10;
}
.error-msg.active{display:block}

/* results */
.results{
  display:none;
  padding:20px 0 80px;
  position:relative;z-index:10;
}
.results.active{display:block}

/* grade card */
.grade-section{
  text-align:center;
  padding:40px 0;
  animation:fadeUp .6s var(--ease) both;
}
/* directional band — shown above the gate before email capture */
.grade-band-domain{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-faint);
  text-transform:uppercase;
  letter-spacing:.12em;
  margin-bottom:24px;
}
.grade-band-headline{
  font-family:var(--serif);
  font-size:42px;
  color:var(--text);
  line-height:1.2;
  margin-bottom:16px;
}
.grade-band-headline strong{
  color:var(--gold);
  font-weight:400;
}
.grade-band-sub{
  font-size:15px;
  color:var(--text-mute);
  max-width:480px;
  margin:0 auto;
  line-height:1.5;
}
/* above-gate comparison: shows the gap visually before the email ask,
   exact score still withheld */
.grade-band-compare{
  max-width:420px;
  margin:28px auto 0;
  text-align:left;
}
.gbc-bar{
  display:flex;align-items:center;gap:12px;
  margin-bottom:10px;
}
.gbc-label{
  font-family:var(--mono);
  font-size:11px;
  color:var(--text-faint);
  width:118px;
  flex-shrink:0;
  text-align:right;
}
.gbc-track{
  flex:1;height:8px;
  background:var(--bg-lift);
  border-radius:4px;overflow:hidden;
}
.gbc-fill{
  height:100%;width:0;border-radius:4px;
  transition:width .9s var(--ease);
}
.gbc-you{background:var(--gold)}
.gbc-bench{background:var(--gold-dim);opacity:.5}
.gbc-caption{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-faint);
  line-height:1.6;
  margin-top:14px;
  text-align:center;
}
@media (max-width:640px){
  .grade-band-headline{font-size:32px}
  .grade-band-sub{font-size:14px;padding:0 20px}
  .gbc-label{width:92px;font-size:10px}
}
.grade-circle{
  display:inline-flex;
  align-items:center;justify-content:center;
  width:140px;height:140px;
  border-radius:50%;
  margin-bottom:16px;
  position:relative;
}
/* The score ring: a real gauge that sweeps to the AI-ready score. The arc
   length IS the score, so the ring reads the number before the eye reaches
   the digits. Track is a faint full circle; the gold arc draws over it. */
.grade-ring{
  position:absolute;inset:0;width:100%;height:100%;
  transform:rotate(-90deg); /* start the sweep at 12 o'clock */
}
.grade-ring circle{fill:none;stroke-width:6;}
.grade-ring .gr-track{stroke:rgba(212,197,150,.13);}
.grade-ring .gr-arc{
  stroke:var(--gold);
  stroke-linecap:round;
  /* dasharray + offset set inline per score; the sweep is animated in JS so
     it can sync with the count-up and respect reduced-motion. */
  transition:stroke-dashoffset 1s cubic-bezier(.22,1,.36,1);
}
.grade-circle.grade-c .gr-arc,.grade-circle.grade-d .gr-arc,.grade-circle.grade-f .gr-arc{
  stroke:var(--text-faint);
}
.grade-circle .letter{
  font-family:var(--serif);
  font-size:64px;
  font-weight:400;
  color:var(--gold);
  position:relative;z-index:1;
}
.grade-circle.grade-c .letter,.grade-circle.grade-d .letter,.grade-circle.grade-f .letter{
  color:var(--text-faint);
}
@media (prefers-reduced-motion:reduce){ .grade-ring .gr-arc{transition:none;} }
.aeo-score{
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.2em;
  font-size:12px;
  color:var(--text-mute);
  margin-top:8px;
}
.aeo-score span{
  color:var(--gold);
  font-size:20px;
  font-weight:500;
  letter-spacing:0;
}
.grade-domain{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-faint);
  margin-top:12px;
  word-break:break-all;
  max-width:640px;
  margin-left:auto;
  margin-right:auto;
  padding:0 20px;
  line-height:1.5;
}

/* Agency pitch-link mode: hide NeverRanked's own conversion surfaces so the
   prospect only sees the agency's branding + CTA. The scan itself, the grade,
   the insights, and the technical findings all stay visible because those
   are the product being resold. */
body.agency-mode .hero-trust,
body.agency-mode #cta-pricing,
body.agency-mode .cta-features,
body.agency-mode .social-proof,
body.agency-mode .email-gate,
body.agency-mode #email-gate,
body.agency-mode .dashboard-preview-section,
body.agency-mode #dashboard-preview{
  display:none !important;
}
body.agency-mode #agency-cta-card{display:block !important}

/* Channel mode: the recipient is an AGENCY OWNER who clicked our own cold
   email (utm_campaign=agency-cold), not an agency's client. Opposite of
   agency-mode: we keep the scan, the grade, AND our pricing visible (their
   cost basis for the resale margin), and add one reseller card at the top of
   the CTA section that reframes the self-scan as the wedge they run on their
   clients, routing to /for-agencies. Distinct from ref_name agency-mode. */
#channel-cta-card{display:none}
body.channel-mode #channel-cta-card{display:block}

/* section labels */
.section-label{
  display:flex;align-items:center;gap:14px;
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.22em;
  font-size:11px;
  color:var(--text-mute);
  margin:48px 0 24px;
}
.section-label .num{color:var(--gold);font-weight:500}
.section-label .rule{flex:1;height:1px;background:var(--line)}

/* schema coverage grid */
.schema-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
  gap:12px;
}
.schema-card{
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:4px;
  padding:16px 18px;
  display:flex;align-items:center;gap:12px;
  animation:fadeUp .5s var(--ease) both;
}
.schema-card .icon{
  font-family:var(--mono);
  font-size:16px;
  width:24px;text-align:center;
}
.schema-card .icon.present{color:var(--gold)}
.schema-card .icon.missing{color:var(--text-faint)}
.schema-card .name{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-mute);
}
.schema-card.is-present{border-color:rgba(232,199,103,.25)}

/* technical signals */
.tech-list{display:flex;flex-direction:column;gap:8px}
.tech-row{
  display:flex;align-items:flex-start;gap:16px;
  padding:14px 18px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:4px;
  animation:fadeUp .5s var(--ease) both;
}
.tech-row .label{
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.15em;
  font-size:11px;
  color:var(--text-faint);
  min-width:130px;
  padding-top:2px;
}
.tech-row .value{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-mute);
  flex:1;
  word-break:break-word;
}
.tech-row .status{
  width:8px;height:8px;
  border-radius:50%;
  margin-top:5px;
  flex-shrink:0;
}
.tech-row .status.good{background:#5cb85c}
.tech-row .status.warning{background:var(--gold-dim)}
.tech-row .status.bad{background:#c85050}

/* red flags */
.flags-list{display:flex;flex-direction:column;gap:8px}
.flag-card{
  padding:14px 18px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-left:3px solid var(--gold-dim);
  border-radius:4px;
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-mute);
  line-height:1.6;
  animation:fadeUp .5s var(--ease) both;
}

/* anonymized lead-magnet summary cards (replaces the named
   schema cards / tech rows / specific flag descriptions; rolled
   out 2026-05-28 to stop the grader from giving away the
   proprietary fix list to non-paying visitors) */
.schema-summary{
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:6px;
  padding:28px 32px;
  animation:fadeUp .5s var(--ease) both;
}
.schema-summary-headline{
  display:flex;align-items:baseline;gap:10px;
  flex-wrap:wrap;
  margin-bottom:16px;
}
.schema-summary-count{
  font-family:var(--serif);
  font-size:42px;
  font-weight:400;
  color:var(--gold);
  line-height:1;
}
.schema-summary-of{
  font-family:var(--mono);
  font-size:13px;
  color:var(--text-faint);
  letter-spacing:.06em;
}
.schema-summary-label{
  font-family:var(--mono);
  font-size:11px;
  color:var(--text-mute);
  letter-spacing:.1em;
  text-transform:uppercase;
  line-height:1.5;
  flex:1;
  min-width:200px;
}
.schema-summary-bar{
  height:6px;background:var(--line);
  border-radius:3px;overflow:hidden;
  margin-bottom:16px;
}
.schema-summary-fill{
  height:100%;background:var(--gold);
  border-radius:3px;
  transition:width 600ms cubic-bezier(0.23,1,0.32,1);
}
.schema-summary-sub{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-faint);
  line-height:1.65;
}
.tech-summary{
  display:flex;flex-direction:column;gap:6px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:6px;
  padding:18px 22px;
  animation:fadeUp .5s var(--ease) both;
}
.tech-summary-row{
  display:flex;align-items:center;gap:14px;
  padding:8px 0;
  font-family:var(--mono);
  font-size:12px;
}
.tech-summary-dot{
  width:10px;height:10px;border-radius:50%;flex-shrink:0;
}
.tech-summary-dot-bad{background:#c85050}
.tech-summary-dot-warn{background:var(--gold-dim)}
.tech-summary-dot-good{background:#5cb85c}
.tech-summary-label{
  text-transform:uppercase;
  letter-spacing:.12em;
  color:var(--text-mute);
  flex:1;
}
.tech-summary-count{
  font-family:var(--serif);
  font-size:20px;
  color:var(--text);
  min-width:30px;text-align:right;
}
.flag-summary{
  display:flex;align-items:center;gap:20px;
  padding:18px 22px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-left:3px solid var(--gold-dim);
  border-radius:4px;
  animation:fadeUp .5s var(--ease) both;
}
.flag-summary-count{
  font-family:var(--serif);
  font-size:36px;
  font-weight:400;
  color:var(--gold);
  line-height:1;
  flex-shrink:0;
}
.flag-summary-text{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-mute);
  line-height:1.65;
}
/* CTA-card replaces the old quick-wins-grid items */
.qw-cta-card{
  background:var(--bg-lift);
  border:1px solid rgba(232,199,103,.3);
  border-radius:6px;
  padding:32px 36px;
  animation:fadeUp .5s var(--ease) both;
}
.qw-cta-headline{
  font-family:var(--serif);
  font-size:22px;
  font-weight:400;
  color:var(--text);
  line-height:1.3;
  margin-bottom:14px;
}
.qw-cta-body{
  font-family:var(--mono);
  font-size:13px;
  color:var(--text-mute);
  line-height:1.7;
  margin-bottom:24px;
}
.qw-cta-body strong{
  color:var(--gold);
}
.qw-cta-actions{
  display:flex;align-items:center;gap:18px;flex-wrap:wrap;
}
.qw-cta-button{
  display:inline-block;
  padding:14px 26px;
  background:var(--gold);
  color:var(--bg);
  font-family:var(--mono);
  font-size:12px;
  letter-spacing:.1em;
  text-transform:uppercase;
  text-decoration:none;
  border-radius:3px;
  font-weight:600;
  transition:background 160ms ease;
}
.qw-cta-button:hover{background:#f0e2b0}
.qw-cta-note{
  font-family:var(--mono);
  font-size:11px;
  color:var(--text-faint);
  letter-spacing:.06em;
}

/* cta section */
.cta-section{
  margin-top:64px;
  padding:40px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:6px;
  text-align:center;
  animation:fadeUp .6s var(--ease) .3s both;
}
.cta-section h3{
  font-family:var(--serif);
  font-size:24px;
  margin-bottom:16px;
}
.cta-section p{
  font-family:var(--mono);
  font-size:13px;
  color:var(--text-faint);
  max-width:560px;
  margin:0 auto 24px;
  line-height:1.7;
}
.cta-section a.btn{
  display:inline-block;
  border:1px solid var(--gold);
  color:var(--gold);
  padding:14px 32px;
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.18em;
  font-size:12px;
  font-weight:500;
  border-radius:4px;
  transition:background .35s var(--ease),color .35s var(--ease);
}
.cta-section a.btn:hover{background:var(--gold);color:var(--bg)}

/* footer */
.footer{
  padding:48px 0;
  text-align:center;
  position:relative;z-index:10;
}
.footer .built{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-faint);
}
.footer a{color:var(--gold-dim);transition:color .3s;display:inline-block;padding:6px 4px;min-height:44px;line-height:32px}
.footer a:hover{color:var(--gold)}
/* comfortable mobile tap zone for bare inline price-discovery links (#20) */
.tap-link{display:inline-block;padding:8px 4px;min-height:44px;line-height:28px}
.footer .email{
  margin-top:8px;
  font-family:var(--mono);
  font-size:11px;
  color:var(--text-faint);
}

/* animations */
@keyframes fadeUp{
  from{opacity:0;transform:translateY(16px)}
  to{opacity:1;transform:translateY(0)}
}

/* email capture */
/* Email gate: shown between the score and the full details. Converts
   anonymous scans into known leads before revealing the breakdown. */
.email-gate{
  margin:32px 0;padding:32px 28px;
  background:linear-gradient(180deg,var(--bg-lift),var(--bg-edge));
  border:1px solid var(--gold-dim);border-radius:4px;text-align:center;
  animation:fadeUp .5s var(--ease) .1s both;
}
.email-gate-head{
  display:flex;align-items:baseline;justify-content:center;gap:12px;margin-bottom:4px;
}
.email-gate-count{
  font-family:var(--serif);font-size:48px;font-style:italic;color:var(--gold);line-height:1;
}
.email-gate-title{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:var(--text-soft);
}
.email-gate-teaser{
  margin:16px auto 20px;max-width:520px;text-align:left;
}
.email-gate-teaser ul{list-style:none;padding:0;margin:0}
.email-gate-teaser li{
  padding:10px 0;border-bottom:1px solid var(--line);
  font-family:var(--mono);font-size:13px;color:var(--text-soft);
}
.email-gate-teaser li:last-child{border-bottom:none}
.email-gate-teaser li::before{content:'\u00D7';color:var(--gold);margin-right:10px;font-weight:700}
.email-gate-body{max-width:560px;margin:0 auto}
.email-gate-body p{
  font-family:var(--mono);font-size:13px;color:var(--text-soft);
  line-height:1.7;margin:0 0 18px;
}
.email-gate-form{
  display:flex;gap:10px;justify-content:center;max-width:440px;margin:0 auto 10px;flex-wrap:wrap;
}
.email-gate-form input{
  flex:1;min-width:220px;padding:14px 16px;
  background:var(--bg);border:1px solid var(--line-strong);border-radius:3px;
  color:var(--text);font-family:var(--mono);font-size:14px;outline:none;
  transition:border-color .2s var(--ease);
}
.email-gate-form input:focus{border-color:var(--gold)}
.email-gate-form input::placeholder{color:var(--text-faint)}
.email-gate-form button{
  padding:14px 26px;background:var(--gold);color:var(--bg);border:0;border-radius:3px;
  font-family:var(--label);text-transform:uppercase;letter-spacing:.16em;font-size:11px;font-weight:600;
  cursor:pointer;transition:background .2s var(--ease);white-space:nowrap;
}
.email-gate-form button:hover{background:#f0e2b0}
.email-gate-form button:disabled{opacity:.4;cursor:not-allowed}
.email-gate-privacy{
  font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:8px;
}
@media (max-width:640px){
  .email-gate-head{flex-direction:column;gap:4px}
  .email-gate-count{font-size:40px}
  .email-gate-form input{width:100%}
}
.email-gate-sent{
  margin:24px auto;max-width:560px;text-align:center;
  font-family:var(--mono);font-size:13px;color:var(--gold);
}

/* "Ask it yourself" kit */
.ask-kit{margin:40px 0 8px;animation:fadeUp .5s var(--ease) .15s both}
.ask-kit-lead{
  font-family:var(--mono);font-size:13px;color:var(--text-soft);line-height:1.7;margin:0 0 16px;
}
.ask-kit-fields{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 16px}
.ask-kit-field{flex:1;min-width:200px;display:flex;flex-direction:column;gap:6px}
.ask-kit-field span{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.16em;font-size:10px;color:var(--text-faint);
}
.ask-kit-field input{
  padding:10px 12px;background:var(--bg);border:1px solid var(--line-strong);border-radius:3px;
  color:var(--text);font-family:var(--mono);font-size:13px;outline:none;width:100%;
}
.ask-kit-field input:focus{border-color:var(--gold)}
.ask-kit-field input::placeholder{color:var(--text-faint)}
.ask-kit-questions{list-style:none;padding:0;margin:0 0 16px;counter-reset:q}
.ask-kit-questions li{
  display:flex;align-items:center;justify-content:space-between;gap:14px;
  padding:12px 14px;margin:0 0 8px;background:var(--bg-lift);border:1px solid var(--line);border-radius:3px;
}
.ask-kit-q{font-family:var(--serif);font-style:italic;font-size:16px;color:var(--text);line-height:1.4;overflow-wrap:anywhere}
.ask-kit-copy{
  flex:none;padding:8px 14px;border:1px solid var(--gold-dim);border-radius:3px;color:var(--gold);
  font-family:var(--label);text-transform:uppercase;letter-spacing:.14em;font-size:10px;
}
.ask-kit-copy:hover{background:var(--gold-wash)}
.ask-kit-after{font-family:var(--mono);font-size:12px;color:var(--text-faint);line-height:1.7;margin:0}
@media (max-width:640px){
  .ask-kit-questions li{flex-direction:column;align-items:flex-start}
}

.email-capture{
  margin:32px 0 0;
  padding:24px 28px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:4px;
  animation:fadeUp .5s var(--ease) .2s both;
}
.email-capture-inner{
  display:flex;align-items:center;gap:20px;
}
.email-capture-icon{
  font-size:24px;flex-shrink:0;
  opacity:.6;
}
.email-capture-title{
  font-family:var(--mono);
  font-size:14px;color:var(--text);
}
.email-capture-sub{
  font-family:var(--mono);
  font-size:11px;color:var(--text-faint);
  margin-top:2px;
}
.email-capture-form{
  display:flex;gap:8px;margin-left:auto;flex-shrink:0;
}
.email-capture-form input{
  background:var(--bg-edge);
  border:1px solid var(--line);
  border-radius:4px;
  padding:10px 14px;
  font-family:var(--mono);
  font-size:13px;
  color:var(--text);
  outline:none;
  width:200px;
  transition:border-color .3s var(--ease);
}
.email-capture-form input:focus{border-color:var(--gold)}
.email-capture-form input::placeholder{color:var(--text-faint)}
.email-capture-form button{
  background:var(--gold);
  color:var(--bg);
  border:none;
  padding:10px 20px;
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.15em;
  font-size:11px;
  font-weight:600;
  border-radius:4px;
  cursor:pointer;
  white-space:nowrap;
  transition:opacity .2s;
}
.email-capture-form button:disabled{opacity:.4;cursor:not-allowed}
.email-success{
  font-family:var(--mono);
  font-size:13px;
  color:var(--text-faint);
  margin-top:12px;
}

/* competitor teaser */
.comp-teaser{
  animation:fadeUp .5s var(--ease) .3s both;
}
.comp-teaser-inner{
  padding:24px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:4px;
}
.comp-teaser-bars{
  display:flex;flex-direction:column;gap:14px;
  margin-bottom:20px;
}
.comp-bar{
  display:flex;align-items:center;gap:14px;
}
.comp-bar-label{
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.15em;
  font-size:10px;
  color:var(--gold);
  min-width:90px;
}
.comp-bar-track{
  flex:1;height:8px;
  background:rgba(251,248,239,.06);
  border-radius:4px;overflow:hidden;
}
.comp-bar-fill{
  height:100%;border-radius:4px;
  transition:width .8s var(--ease);
}
.comp-bar-you{background:var(--gold)}
.comp-bar-avg{background:var(--text-faint);width:52%}
.comp-bar-score{
  font-family:var(--mono);
  font-size:14px;
  font-weight:400;
  color:var(--gold);
  min-width:32px;
  text-align:right;
}
.comp-gap-line{
  font-family:var(--mono);
  font-size:13px;
  color:var(--text-mute);
  margin:14px 0 4px;
  letter-spacing:.01em;
}
.comp-gap-num{
  color:var(--gold);
  font-size:16px;
  font-variant-numeric:tabular-nums;
  font-feature-settings:'tnum' 1;
}
.comp-teaser-text{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-faint);
  line-height:1.7;
}

/* updated cta */
.cta-buttons{
  display:flex;gap:16px;
  justify-content:center;
  margin-bottom:24px;
}
.btn-primary{
  display:inline-block;
  background:var(--gold) !important;
  color:var(--bg) !important;
  border:1px solid var(--gold);
  padding:14px 32px;
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.18em;
  font-size:12px;
  font-weight:600;
  border-radius:4px;
  transition:background .3s var(--ease);
}
.btn-primary:hover{background:#f0e2b0 !important}
.btn-ghost-link{
  display:inline-block;
  border:1px solid var(--line) !important;
  color:var(--text-faint) !important;
  padding:14px 32px;
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.18em;
  font-size:12px;
  font-weight:500;
  border-radius:4px;
  transition:border-color .3s var(--ease),color .3s var(--ease);
}
.btn-ghost-link:hover{border-color:var(--text-mute) !important;color:var(--text-mute) !important}
.cta-features{
  display:flex;gap:20px;
  justify-content:center;
  flex-wrap:wrap;
  font-family:var(--mono);
  font-size:11px;
  color:var(--text-faint);
}
.cta-features span::before{
  content:"+";
  color:var(--gold);
  margin-right:6px;
  font-weight:500;
}

/* grade insight */
.grade-insight{
  max-width:520px;margin:0 auto 8px;
  font-family:var(--mono);
  font-size:13px;color:var(--text-faint);
  line-height:1.75;text-align:center;
  animation:fadeUp .5s var(--ease) .1s both;
}
.grade-insight strong{color:var(--text);font-weight:400}
.grade-insight em{color:var(--gold);font-style:normal}

/* quick wins */
.quick-wins{animation:fadeUp .5s var(--ease) .2s both}
.quick-wins-grid{display:flex;flex-direction:column;gap:10px}
.qw-item{
  display:flex;align-items:flex-start;gap:14px;
  padding:16px 20px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:4px;
}
.qw-item .qw-icon{
  width:28px;height:28px;
  display:flex;align-items:center;justify-content:center;
  border-radius:50%;flex-shrink:0;
  font-family:var(--mono);font-size:13px;font-weight:500;
}
.qw-icon.easy{background:rgba(39,174,96,.12);color:#27ae60}
.qw-icon.medium{background:var(--gold-wash);color:var(--gold)}
.qw-icon.hard{background:rgba(200,80,80,.12);color:#c85050}
.qw-item .qw-body{flex:1}
.qw-item .qw-title{
  font-family:var(--mono);font-size:13px;color:var(--text);
  margin-bottom:4px;
}
.qw-item .qw-desc{
  font-family:var(--mono);font-size:11px;color:var(--text-faint);
  line-height:1.6;
}
.qw-item .qw-diff{
  font-family:var(--label);font-size:9px;
  letter-spacing:.12em;text-transform:uppercase;
  padding:3px 8px;border-radius:2px;
  flex-shrink:0;align-self:center;
}
.qw-diff.easy{background:rgba(39,174,96,.1);color:#27ae60}
.qw-diff.medium{background:var(--gold-wash);color:var(--gold)}
.qw-diff.hard{background:rgba(200,80,80,.1);color:#c85050}

/* grade distribution */
.grade-dist{margin-top:20px}
.grade-dist-row{
  display:flex;align-items:center;gap:10px;
  margin-bottom:8px;
}
.grade-dist-label{
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.1em;
  font-size:10px;
  min-width:20px;text-align:center;
}
.grade-dist-track{
  flex:1;height:20px;
  background:rgba(251,248,239,.04);
  border-radius:2px;overflow:hidden;
  position:relative;
}
.grade-dist-fill{
  height:100%;border-radius:2px;
  transition:width .8s var(--ease);
}
.grade-dist-pct{
  font-family:var(--mono);font-size:11px;
  min-width:36px;text-align:right;
  color:var(--text-faint);
}
.grade-dist-you{
  position:absolute;top:-2px;bottom:-2px;
  width:2px;background:var(--gold);
  z-index:2;
  transition:left .8s var(--ease);
}
.grade-dist-you::after{
  content:"You";
  position:absolute;top:-16px;left:50%;transform:translateX(-50%);
  font-family:var(--label);font-size:8px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--gold);white-space:nowrap;
}

/* dashboard preview */
.dash-preview{
  margin-top:48px;
  position:relative;
  animation:fadeUp .6s var(--ease) .3s both;
}
.dash-preview-label{
  font-family:var(--label);
  text-transform:uppercase;letter-spacing:.22em;
  font-size:11px;color:var(--text-mute);
  margin-bottom:20px;
  display:flex;align-items:center;gap:14px;
}
.dash-preview-label .rule{flex:1;height:1px;background:var(--line)}
.dash-preview-frame{
  position:relative;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:6px;
  overflow:hidden;
  padding:24px;
}
.dash-preview-blur{
  filter:blur(3px);
  opacity:.55;
  pointer-events:none;
  user-select:none;
}
.dash-preview-overlay{
  position:absolute;inset:0;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  background:rgba(18,18,18,.5);
  z-index:2;
}
.dash-preview-overlay h4{
  font-family:var(--serif);
  font-size:20px;font-weight:400;
  color:var(--text);margin-bottom:8px;
}
.dash-preview-overlay p{
  font-family:var(--mono);font-size:12px;
  color:var(--text-faint);margin-bottom:20px;
}
.dash-mock-row{display:flex;gap:16px;margin-bottom:16px}
.dash-mock-kpi{
  flex:1;padding:16px;
  background:var(--bg-edge);border-radius:4px;
  border:1px solid rgba(251,248,239,.06);
}
.dash-mock-kpi .kpi-label{
  font-family:var(--label);font-size:9px;
  letter-spacing:.12em;text-transform:uppercase;
  color:var(--text-faint);margin-bottom:8px;
}
.dash-mock-kpi .kpi-val{
  font-family:var(--serif);font-size:24px;
  font-style:italic;color:var(--text);
}
.dash-mock-kpi .kpi-delta{
  font-family:var(--mono);font-size:10px;
  margin-top:4px;
}
.dash-mock-chart{
  height:60px;padding:12px 16px;
  background:var(--bg-edge);border-radius:4px;
  border:1px solid rgba(251,248,239,.06);
  display:flex;align-items:flex-end;gap:4px;
}
.dash-mock-bar{
  flex:1;background:var(--gold-dim);border-radius:1px;
  opacity:.6;
}

/* social proof */
.social-proof{
  display:flex;gap:24px;justify-content:center;
  margin-bottom:24px;
  font-family:var(--mono);font-size:11px;
  color:var(--text-faint);
}
.social-proof span{
  display:flex;align-items:center;gap:6px;
}
.social-proof .sp-num{
  color:var(--gold);font-weight:400;
  font-size:13px;
}

/* responsive */
@media(max-width:600px){
  .input-area{flex-direction:column}
  .input-area button{width:100%}
  .schema-grid{grid-template-columns:1fr 1fr}
  .tech-row{flex-direction:column;gap:6px}
  .tech-row .label{min-width:unset}
  .cta-section{padding:28px 20px}
  .email-capture-inner{flex-direction:column;align-items:flex-start;gap:12px}
  .email-capture-form{margin-left:0;width:100%}
  .email-capture-form input{flex:1;width:auto}
  .cta-buttons{flex-direction:column;align-items:center}
  .comp-bar-label{min-width:70px;font-size:10px}
  .dash-mock-row{flex-direction:column;gap:8px}
  .qw-item{flex-wrap:wrap}
  .social-proof{flex-direction:column;align-items:center;gap:8px}
}
</style>

<!-- Retargeting pixels intentionally not loaded. Add the Meta + LinkedIn tags here when paid acquisition is live. -->

</head>
<body>
<div class="grain"></div>

<nav class="nav">
  <a href="https://neverranked.com" class="mark">N</a>
  <span class="tool-name">AI Search Check</span>
</nav>

<main class="wrap">
  <!-- Agency pitch banner: shown only when ref_name URL param is present.
       Lets an agency reseller share a branded audit URL with their prospect.
       Populated by the boot script below; hidden by default so the default
       check.neverranked.com experience is unchanged. -->
  <div id="agency-banner" style="display:none;margin:0 auto 32px;max-width:820px;padding:18px 24px;background:linear-gradient(135deg,var(--bg-lift) 0%,rgba(201,168,76,.08) 100%);border:1px solid var(--gold-dim);border-radius:4px">
    <div style="font-family:var(--label);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);margin-bottom:6px">§ Prepared for you</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="font-family:var(--mono);font-size:13px;color:var(--text);line-height:1.5">
        This AI search check was prepared by <strong id="agency-banner-name" style="color:var(--gold);font-weight:500"></strong>.
        <span style="color:var(--text-faint);display:block;font-size:11px;margin-top:4px">They work with Never Ranked to run and interpret this report for their clients.</span>
      </div>
      <a id="agency-banner-cta" href="#" style="white-space:nowrap;padding:10px 18px;background:var(--gold);color:#080808;font-family:var(--label);text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:500;text-decoration:none;border-radius:2px">Book a call &rarr;</a>
    </div>
  </div>

  <section class="hero">
    <h1>See what AI tools can read from <em>your site</em>.</h1>
    <p class="sub">${attr(PAGE_COPY.heroSub)}</p>
    <div class="input-area">
      <label for="url-input" class="sr-only">Your website URL</label>
      <input type="url" id="url-input" placeholder="https://example.com" autocomplete="url" spellcheck="false">
      <button id="run-btn" type="button">Run check</button>
    </div>
    <!-- Trust + price-discovery in the hero. Was buried below the fold; now visible
         the moment users decide whether to engage. -->
    <div class="hero-trust" style="margin-top:18px;display:flex;gap:18px;flex-wrap:wrap;justify-content:center;align-items:center;font-family:var(--mono);font-size:11px;color:var(--text-faint)">
      <span><strong style="color:var(--text)">10</strong> categories measured</span>
      <span style="opacity:.4">&middot;</span>
      <span>every number public</span>
      <span style="opacity:.4">&middot;</span>
      <a href="https://neverranked.com/pricing" id="hero-pricing-link" class="tap-link" style="color:var(--gold);text-decoration:none;border-bottom:1px solid var(--gold-dim)">See pricing &rarr;</a>
    </div>
  </section>

  <div class="loading" id="loading" role="status" aria-live="polite">
    <span class="dot"></span>
    <span class="text" id="loading-text">Analyzing...</span>
  </div>

  <div class="error-msg" id="error-msg" role="alert"></div>

  <section class="results" id="results">
    <div class="grade-section" id="grade-section" aria-live="polite"></div>
    <div class="grade-insight" id="grade-insight"></div>

    <!-- Email gate: teaser + capture. Hidden once email is captured.
         One version since 2026-10-07: both A/B tests (gate copy, gate
         level) closed without reaching their own 50-per-arm threshold, and
         the decision was made on honesty. The score stays visible above the
         gate ("your score is free"), the body promises only what the email
         contains, and the fine print is the versioned consent line stored
         with every capture (consent.ts). -->
    <div class="email-gate" id="email-gate" style="display:none">
      <div class="email-gate-head">
        <div class="email-gate-count" id="email-gate-count">-</div>
        <div class="email-gate-title" id="email-gate-title">${attr(PAGE_COPY.gateTitleMany)}</div>
      </div>
      <div class="email-gate-teaser" id="email-gate-teaser"></div>
      <div class="email-gate-body">
        <p id="email-gate-body-text">${attr(PAGE_COPY.gateBody)}</p>
        <div class="email-gate-form">
          <label for="gate-email-input" class="sr-only">Your work email</label>
          <input type="email" id="gate-email-input" placeholder="you@company.com" autocomplete="email">
          <button type="button" id="gate-email-btn">${attr(PAGE_COPY.gateButton)}</button>
        </div>
        <div class="email-gate-privacy">${attr(PAGE_COPY.gateConsent)}</div>
      </div>
    </div>
    <div class="email-gate-sent" id="email-gate-sent" role="status" aria-live="polite" style="display:none">${attr(PAGE_COPY.gateSent)}</div>

    <!-- "Ask it yourself" kit (plan section 4 fallback, 2026-10-07). No
         email needed and no API cost. Three fixed question templates,
         prefilled with the category and town the scanned page states in its
         own JSON-LD, editable, each with a copy button. -->
    <div class="ask-kit" id="ask-kit" style="display:none">
      <div class="section-label"><span class="num">&sect;</span> ${attr(PAGE_COPY.kitLabel)} <span class="rule"></span></div>
      <p class="ask-kit-lead">${attr(PAGE_COPY.kitLead)}</p>
      <div class="ask-kit-fields">
        <label class="ask-kit-field"><span>${attr(PAGE_COPY.kitCategoryLabel)}</span><input type="text" id="ask-kit-category" maxlength="40" placeholder="${attr(PAGE_COPY.kitCategoryPlaceholder)}" autocomplete="off" spellcheck="false"></label>
        <label class="ask-kit-field"><span>${attr(PAGE_COPY.kitTownLabel)}</span><input type="text" id="ask-kit-town" maxlength="40" placeholder="${attr(PAGE_COPY.kitTownPlaceholder)}" autocomplete="off" spellcheck="false"></label>
      </div>
      <ol class="ask-kit-questions" id="ask-kit-questions"></ol>
      <p class="ask-kit-after">${attr(PAGE_COPY.kitAfter)}</p>
    </div>

    <!-- Gated details: hidden until email captured -->
    <div id="gated-details" style="display:none">

    <div class="section-label"><span class="num">01</span> AI-readability signal coverage <span class="rule"></span></div>
    <div class="schema-grid" id="schema-grid"></div>

    <div class="section-label"><span class="num">02</span> Technical signal summary <span class="rule"></span></div>
    <div class="tech-list" id="tech-list"></div>

    <div class="section-label" id="flags-label" style="display:none"><span class="num">03</span> Trust-and-clarity flags <span class="rule"></span></div>
    <div class="flags-list" id="flags-list"></div>

    <!-- Competitor teaser with grade distribution -->
    <div class="comp-teaser" id="comp-teaser">
      <div class="section-label"><span class="num">04</span> How you compare <span class="rule"></span></div>
      <div class="comp-teaser-inner">
        <div class="comp-teaser-bars">
          <div class="comp-bar">
            <div class="comp-bar-label">You</div>
            <div class="comp-bar-track"><div class="comp-bar-fill comp-bar-you" id="comp-bar-you"></div></div>
            <div class="comp-bar-score" id="comp-score-you"></div>
          </div>
          <div class="comp-bar">
            <div class="comp-bar-label" style="color:var(--text-faint)" id="comp-bar-bench-label">Top quartile audited</div>
            <div class="comp-bar-track"><div class="comp-bar-fill" id="comp-bar-bench-fill" style="background:var(--gold-dim);width:78%;opacity:.5"></div></div>
            <div class="comp-bar-score" style="color:var(--text-faint)" id="comp-bar-bench-score"></div>
          </div>
        </div>
        <div class="comp-gap-line" id="comp-gap-line" style="display:none"></div>
        <div class="grade-dist" id="grade-dist"></div>
        <div class="comp-teaser-text" id="comp-teaser-text"></div>
      </div>
    </div>

    <!-- Quick wins -->
    <div class="quick-wins" id="quick-wins" style="display:none">
      <div class="section-label"><span class="num">05</span> See what AI says in your category <span class="rule"></span></div>
      <div class="quick-wins-grid" id="quick-wins-grid"></div>
      <div style="margin-top:16px;font-family:var(--mono);font-size:11px;color:var(--text-faint);line-height:1.7">
        This check looks at your website. The full engagement measures what AI tools actually say about your business: who they name, who they name instead of you, and what to do about it.
      </div>
    </div>

    </div><!-- /#gated-details -->

    <!-- Dashboard preview -->
    <div class="dash-preview">
      <div class="dash-preview-label">What a NeverRanked engagement produces <span class="rule"></span></div>
      <div class="dash-preview-frame" style="padding:24px 28px">
        <p style="font-size:14px;color:#b9b9bd;line-height:1.7;margin:0 0 14px">This check looks at your website. The full engagement asks the AI tools your customers actually use (ChatGPT, Google's AI answers, Perplexity, and three others) what they say about your category. Who gets named and who does not. And the specific moves the data points at.</p>
        <p style="font-size:14px;color:#b9b9bd;line-height:1.7;margin:0 0 18px">See the published look at AI answers for Hawaii consumer banking for the shape of what an engagement produces: <a href="https://neverranked.com/teardowns/bank-honolulu/" style="color:var(--gold);text-decoration:underline;text-underline-offset:3px">/teardowns/bank-honolulu/</a></p>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <a href="https://neverranked.com/pricing" id="cta-preview" class="btn-ghost-link" style="padding:12px 28px;border-radius:4px;text-decoration:none;font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:11px;font-weight:600">Monitor this monthly</a>
          <a href="https://neverranked.com/methodology/" style="font-family:var(--mono);font-size:11px;color:var(--gold);border-bottom:1px solid var(--gold-dim);padding-bottom:2px;text-decoration:none;transition:border-color .3s">or read the full methodology</a>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div class="cta-section">
      <!-- Channel-mode card: shown only when utm_campaign=agency-cold (an
           agency owner clicked OUR cold email). Reframes the self-scan as the
           wedge they resell to their own clients and routes to /for-agencies
           (which carries the margin calculator). Hidden by default; the
           body.channel-mode class reveals it. Distinct from ref_name
           agency-mode, which white-labels this page for an agency's client. -->
      <div id="channel-cta-card" style="max-width:640px;margin:0 auto 8px;padding:28px 30px;background:var(--bg-lift);border:1px solid var(--gold-dim);border-left:2px solid var(--gold);border-radius:4px">
        <div style="font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:10px;color:var(--gold);margin-bottom:12px">§ You run an agency</div>
        <h3 style="font-family:var(--serif);font-size:24px;font-style:italic;line-height:1.25;margin:0 0 14px;color:var(--text)">The check you just ran is the one you run on your clients.</h3>
        <p style="font-size:14px;color:var(--text-faint);line-height:1.7;margin:0 0 20px">White-labeled to your shop, it is the wedge you put in front of any prospect. The measurement behind it is the layer no agency builds in-house at these margins. You resell the engagement at your markup, your team executes the punch list, and your client keeps you as the expert. We stay upstream, and we never contact your clients.</p>
        <a href="https://neverranked.com/pricing/" style="display:inline-block;padding:12px 28px;background:var(--gold);color:#080808;font-family:var(--label);text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:500;text-decoration:none;border-radius:2px">See pricing &rarr;</a>
        <p style="margin:14px 0 0;font-family:var(--mono);font-size:11px;color:var(--text-faint);line-height:1.6">Or <a href="https://neverranked.com/for-agencies/" style="color:var(--gold);border-bottom:1px solid var(--gold-dim);text-decoration:none">see the channel and margin math &rarr;</a> first. The first step is one client category on Monitor at $199 a month, and those payments credit in full toward the audit baseline inside 90 days. Your cost is the list rate below. What you charge your client is yours.</p>
      </div>
      <h3 id="cta-headline">This check looks at your site.<br>The full engagement looks at <em>what AI says about you.</em></h3>
      <p id="cta-subtext">The check above measures what's on your website. A NeverRanked engagement measures what AI tools actually say when someone asks about your category: which competitors get named, which AI tool names who, and a prioritized punch list you or your agency execute. The check is a starting point. The engagement tells you what's actually happening.</p>

      <div class="social-proof">
        <span><span class="sp-num">6</span> AI tools</span>
        <span><span class="sp-num">18</span> real questions per category</span>
        <span><span class="sp-num">3</span> full passes per month</span>
      </div>

      <!-- Agency-mode CTA: single "Book a call with [agency]" card that
           replaces the NeverRanked tier pricing when ref_name is set. -->
      <div id="agency-cta-card" style="display:none;max-width:460px;margin:32px auto;padding:28px;background:var(--bg-lift);border:1px solid var(--gold-dim);border-radius:4px;text-align:center">
        <div style="font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:10px;color:var(--gold);margin-bottom:12px">§ Next step</div>
        <h3 style="font-family:var(--serif);font-size:22px;font-style:italic;margin-bottom:10px;color:var(--text)">Talk to <em id="agency-cta-name" style="color:var(--gold)">your agency</em></h3>
        <p style="font-size:13px;color:var(--text-faint);line-height:1.6;margin-bottom:22px">The scan above is the starting point. Your agency will walk you through what the findings mean and what the fix looks like in your timeline and budget.</p>
        <a id="agency-cta-btn" href="#" style="display:inline-block;padding:12px 28px;background:var(--gold);color:#080808;font-family:var(--label);text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:500;text-decoration:none;border-radius:2px">Book a call &rarr;</a>
        <div id="agency-cta-contact" style="margin-top:14px;font-family:var(--mono);font-size:11px;color:var(--text-faint)"></div>
      </div>

      <div id="cta-pricing-intro" style="text-align:center;margin:24px 0 4px;font-family:var(--label);text-transform:uppercase;letter-spacing:.16em;font-size:11px;color:var(--text-faint)">What it costs to keep watching</div>
      <div class="cta-pricing" id="cta-pricing" style="display:flex;gap:16px;justify-content:center;margin:14px 0 28px;flex-wrap:wrap">
        <div style="text-align:center;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--gold-dim);border-radius:4px;flex:1;min-width:180px;max-width:280px">
          <div style="font-family:var(--serif);font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Monitor</div>
          <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text)">$199<span style="font-size:14px;color:var(--text-faint)">/mo</span></div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);margin:8px 0 4px;line-height:1.5">Per category, month to month<br>Named or not named across 6 AI tools</div>
        </div>
        <div style="text-align:center;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;flex:1;min-width:180px;max-width:280px">
          <div style="font-family:var(--serif);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Audit</div>
          <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text)">$750<span style="font-size:14px;color:var(--text-faint)">/mo</span></div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);margin:8px 0 4px;line-height:1.5">Per category, after a $950 baseline month<br>Pre-registered method, written readout</div>
        </div>
      </div>
      <div style="text-align:center;margin-top:12px"><a href="https://neverranked.com/pricing" class="tap-link" style="font-family:var(--label);font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:.14em;text-decoration:underline">See what is included &rarr;</a></div>

      <div class="cta-features">
        <span>6-tool measurement, plus a search control</span>
        <span>Cohort competitor analysis</span>
        <span>Source-type classifier</span>
        <span>Position-in-answer depth</span>
        <span>Drift detection</span>
        <span>Research memo deliverable</span>
      </div>
      <div style="text-align:center;margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:10px">
        <a href="https://neverranked.com/teardowns/bank-honolulu/" class="tap-link" style="font-family:var(--mono);font-size:11px;color:var(--gold);text-decoration:none;border-bottom:1px solid var(--gold-dim)">See the published Hawaii consumer banking teardown</a>
        <a href="mailto:Lance@hi.neverranked.com?subject=Engagement%20inquiry" class="tap-link" style="font-family:var(--mono);font-size:11px;color:var(--text-faint);text-decoration:none">Want the full engagement on your category? <span style="color:var(--gold);border-bottom:1px solid var(--gold-dim);padding-bottom:1px">Email Lance &rarr;</span></a>
      </div>
    </div>

  </section>
</main>

<footer class="footer">
  <p class="built">Built by <a href="https://neverranked.com">Never Ranked</a></p>
  <p class="email"><a href="mailto:hello@neverranked.com">hello@neverranked.com</a></p>
</footer>

<script>
(function(){
  // Customer copy, single-sourced in src/copy.ts and guarded by
  // dashboard/test/free-check-copy-guards.test.ts.
  var NR_COPY = ${JSON.stringify(PAGE_COPY)};
  var NR_KIT_QUESTIONS = ${JSON.stringify(KIT_QUESTIONS)};
  var NR_CONSENT_VERSION = ${JSON.stringify(CURRENT_CONSENT_VERSION)};
  const input = document.getElementById('url-input');
  const btn = document.getElementById('run-btn');
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');
  const errorMsg = document.getElementById('error-msg');
  const results = document.getElementById('results');
  const gradeSection = document.getElementById('grade-section');
  const schemaGrid = document.getElementById('schema-grid');
  const techList = document.getElementById('tech-list');
  const flagsLabel = document.getElementById('flags-label');
  const flagsList = document.getElementById('flags-list');

  function escHtml(s){
    const d=document.createElement('div');
    d.textContent=s;
    return d.innerHTML;
  }

  function normalizeUrl(val){
    val = val.trim();
    if(!val) return '';
    if(!/^https?:\\/\\//i.test(val)) val = 'https://'+val;
    return val;
  }

  // runCheck replaced by runCheckFinal below

  function renderResults(data){
    // One gate level since 2026-10-07: the score, grade and insight line are
    // always visible above the gate ("your score is free"). The aggressive
    // variant, which hid the score until an email was given, is deleted. It
    // contradicted the free score and never reached its own sample threshold.
    var gradeClass = 'grade-'+String(data.grade).toLowerCase();
    // Show the exact URL scanned (host + path), not just the hostname. A
    // prospect scanning /products/foo vs the homepage can see why the score
    // differs when they check the same domain at two different URLs.
    var scannedDisplay = (data.url || data.domain || '')
      .replace(/^https?:\\/\\//i,'').replace(/^www\\./i,'').replace(/\\/$/,'');
    var score = Number(data.aeo_score) || 0;

    // Score-band insight (Appendix A). Plain text: no claim that a score
    // decides whether AI tools name anyone.
    var insightText = score >= 80 ? NR_COPY.insight80
      : score >= 65 ? NR_COPY.insight65
      : score >= 45 ? NR_COPY.insight45
      : NR_COPY.insightLow;
    // r=54 ring (viewBox 120): circumference 2*pi*54 = 339.292. The arc is
    // drawn fully then hidden by an offset; animateGradeRing() sweeps it to the
    // score. data-score carries the target so the reveal can find it.
    gradeSection.innerHTML =
      '<div class="grade-circle '+escHtml(gradeClass)+'" data-score="'+score+'" role="img" aria-label="Grade '+escHtml(String(data.grade))+'">'+
        '<svg class="grade-ring" viewBox="0 0 120 120" aria-hidden="true">'+
          '<circle class="gr-track" cx="60" cy="60" r="54"></circle>'+
          '<circle class="gr-arc" cx="60" cy="60" r="54" stroke-dasharray="339.292" stroke-dashoffset="339.292"></circle>'+
        '</svg>'+
        '<span class="letter">'+escHtml(String(data.grade))+'</span>'+
      '</div>'+
      '<div class="aeo-score">AI-ready score: <span>'+score+'</span>/100</div>'+
      '<div class="grade-domain">'+escHtml(scannedDisplay)+'</div>';
    var insight = document.getElementById('grade-insight');
    if (insight) insight.textContent = insightText;
    animateGradeRing(gradeSection);

    // Schema coverage — aggregated to a coverage summary, no named
    // schemas. Naming the specific schemas the visitor is missing
    // (LocalBusiness, FAQPage, Organization, etc.) gives away the
    // proprietary fix list. We show the SIZE of the gap, not the gap.
    // The full named breakdown lives in the emailed report.
    schemaGrid.innerHTML='';
    var schemaTotal = data.schema_coverage.length;
    var schemaPresent = data.schema_coverage.filter(function(s){return s.present;}).length;
    var schemaMissing = schemaTotal - schemaPresent;
    var schemaPct = schemaTotal ? Math.round((schemaPresent/schemaTotal)*100) : 0;
    var schemaSummary = document.createElement('div');
    schemaSummary.className = 'schema-summary';
    schemaSummary.innerHTML =
      '<div class="schema-summary-headline">'+
        '<span class="schema-summary-count">'+schemaPresent+'</span>'+
        '<span class="schema-summary-of">of '+schemaTotal+'</span>'+
        '<span class="schema-summary-label">critical AI-readability signals present on your site</span>'+
      '</div>'+
      '<div class="schema-summary-bar"><div class="schema-summary-fill" style="width:'+schemaPct+'%"></div></div>'+
      '<div class="schema-summary-sub">'+
        (schemaMissing > 0
          ? schemaMissing+' '+NR_COPY.schemaMissingSuffix
          : 'Strong coverage. The next layer of work is whether AI tools are actually citing you, which only the full measurement can answer.')+
      '</div>';
    schemaGrid.appendChild(schemaSummary);

    // Technical signals — aggregated to severity counts, no named
    // labels. Same logic: naming the specific failing signals (meta
    // description, canonical tag, etc.) gives away the fix list.
    techList.innerHTML='';
    var techBad = data.technical_signals.filter(function(t){return t.status==='bad';}).length;
    var techWarn = data.technical_signals.filter(function(t){return t.status==='warning';}).length;
    var techGood = data.technical_signals.filter(function(t){return t.status==='good';}).length;
    var techTotal = data.technical_signals.length;
    var techSummary = document.createElement('div');
    techSummary.className = 'tech-summary';
    techSummary.innerHTML =
      '<div class="tech-summary-row tech-summary-row-bad">'+
        '<span class="tech-summary-dot tech-summary-dot-bad"></span>'+
        '<span class="tech-summary-label">Blocking issues</span>'+
        '<span class="tech-summary-count">'+techBad+'</span>'+
      '</div>'+
      '<div class="tech-summary-row tech-summary-row-warn">'+
        '<span class="tech-summary-dot tech-summary-dot-warn"></span>'+
        '<span class="tech-summary-label">Warnings</span>'+
        '<span class="tech-summary-count">'+techWarn+'</span>'+
      '</div>'+
      '<div class="tech-summary-row tech-summary-row-good">'+
        '<span class="tech-summary-dot tech-summary-dot-good"></span>'+
        '<span class="tech-summary-label">Passing</span>'+
        '<span class="tech-summary-count">'+techGood+'</span>'+
      '</div>';
    techList.appendChild(techSummary);

    // Red flags — count only, no specific labels. The aggressive-gate
    // teaser (above the gate) already shows 2 named flags as the carrot;
    // post-gate we tighten back to count-only because the visitor is now
    // a captured lead, not a conversion target. The full list lives in
    // the emailed report.
    flagsList.innerHTML='';
    if(data.red_flags.length>0){
      flagsLabel.style.display='flex';
      var flagSummary = document.createElement('div');
      flagSummary.className = 'flag-summary';
      flagSummary.innerHTML =
        '<div class="flag-summary-count">'+data.red_flags.length+'</div>'+
        '<div class="flag-summary-text">'+
          (data.red_flags.length === 1 ? NR_COPY.flagOne : NR_COPY.flagMany)+
        '</div>';
      flagsList.appendChild(flagSummary);
    }else{
      flagsLabel.style.display='none';
    }

    // Update the "AI-cited sites" benchmark bar with real percentile
    // data when window.NR_BENCHMARK is available (computed daily from
    // actual scan_results). Falls back to the original hardcoded
    // numbers if not available.
    if (window.NR_BENCHMARK && window.NR_BENCHMARK.p75) {
      var bench = window.NR_BENCHMARK;
      var benchLabel = document.getElementById('comp-bar-bench-label');
      var benchFill = document.getElementById('comp-bar-bench-fill');
      var benchScore = document.getElementById('comp-bar-bench-score');
      if (benchLabel) benchLabel.textContent = 'Top 25% (live data)';
      if (benchFill) benchFill.style.width = bench.p75 + '%';
      if (benchScore) benchScore.textContent = bench.p75 + '+';
    }

    // Grade distribution. Real percentages from NR_BENCHMARK when
    // available; otherwise the historical defaults (which are close
    // enough to a normal distribution to not actively mislead).
    var distEl = document.getElementById('grade-dist');
    var defaultGrades = [
      {label:'A',pct:8,color:'var(--gold)'},
      {label:'B',pct:18,color:'var(--gold-dim)'},
      {label:'C',pct:38,color:'var(--text-faint)'},
      {label:'D',pct:28,color:'rgba(200,80,80,.6)'},
      {label:'F',pct:8,color:'rgba(200,80,80,.4)'}
    ];
    var gradeColors = {
      'A':'var(--gold)','B':'var(--gold-dim)','C':'var(--text-faint)',
      'D':'rgba(200,80,80,.6)','F':'rgba(200,80,80,.4)'
    };
    var grades = (window.NR_BENCHMARK && window.NR_BENCHMARK.gradeDistribution)
      ? window.NR_BENCHMARK.gradeDistribution.map(function(g){
          return { label: g.label, pct: g.pct, color: gradeColors[g.label] || 'var(--text-faint)' };
        })
      : defaultGrades;
    var distHtml = '';
    grades.forEach(function(g){
      var isYou = (data.grade === g.label);
      distHtml += '<div class="grade-dist-row">'+
        '<div class="grade-dist-label" style="color:'+(isYou?'var(--gold)':'var(--text-faint)')+'">'+g.label+'</div>'+
        '<div class="grade-dist-track">'+
          '<div class="grade-dist-fill" style="width:'+g.pct+'%;background:'+g.color+(isYou?'':';opacity:.4')+'"></div>'+
          (isYou?'<div class="grade-dist-you" style="left:'+data.aeo_score+'%"></div>':'')+
        '</div>'+
        '<div class="grade-dist-pct">'+(isYou?'<span style="color:var(--gold)">You</span>':g.pct+'%')+'</div>'+
      '</div>';
    });
    distEl.innerHTML = distHtml;

    // The grade-aware "competitor teaser" lines are gone (2026-10-07). They
    // said the sites AI engines cite "cluster at the top of this scale" and
    // that a visitor was "not yet in the conversation", which nothing we have
    // measured supports. The bars and the one comparison line below say what
    // is true: where this score sits against the sites we have checked.
    var compText = document.getElementById('comp-teaser-text');
    if(compText){ compText.textContent = ''; compText.style.display = 'none'; }
    // One-line gap to the top quarter of sites we have checked (live p75
    // when present, 78 otherwise). It is a distribution fact about scans,
    // never a citation threshold.
    var compGapLine = document.getElementById('comp-gap-line');
    if(compGapLine){
      var benchP75 = (window.NR_BENCHMARK && window.NR_BENCHMARK.p75) ? window.NR_BENCHMARK.p75 : 78;
      var gapToTarget = benchP75 - score;
      if(gapToTarget > 0){
        compGapLine.innerHTML = '<span class="comp-gap-num">'+gapToTarget+'</span> '+escHtml(NR_COPY.comparisonSuffix);
        compGapLine.style.display = 'block';
      } else {
        compGapLine.style.display = 'none';
      }
    }

    // What used to live here: a "Quick wins" block listing 5 specific
    // named fixes (e.g., "Add Organization schema") with descriptions,
    // difficulty ratings, and rationale. That was structurally a free
    // consulting deliverable — a sophisticated visitor could read the
    // 5 named fixes, walk through neverranked.com/schema-library/ and
    // /templates/, and ship the work themselves without ever paying.
    // The funnel discipline now (locked 2026-05-28):
    //   1. This automated check shows the SHAPE of the gap (counts).
    //   2. Monitor shows CITATION REALITY (which
    //      competitor firms AI names in their category, whether they
    //      appear). NOT a fix list.
    //   3. The paid engagement names the fixes (per-query playbook +
    //      research memo + punch list).
    // The CTA below routes to step 2, with copy that honestly
    // describes what step 2 produces.
    var qwSection = document.getElementById('quick-wins');
    var qwGrid = document.getElementById('quick-wins-grid');
    // Compute the gap shape so the CTA copy is grade-aware.
    var schemaMissingCount = data.schema_coverage.filter(function(s){return !s.present;}).length;
    var techBadCount = data.technical_signals.filter(function(t){return t.status==='bad';}).length;
    var flagsCount = (data.red_flags || []).length;
    var totalGaps = schemaMissingCount + techBadCount + flagsCount;

    qwSection.style.display = 'block';
    qwGrid.innerHTML = '';
    var ctaCard = document.createElement('div');
    ctaCard.className = 'qw-cta-card';
    // Honest framing of the three-step funnel (locked 2026-05-28):
    //   1. This automated check shows the SHAPE of the gap on the
    //      visitor's own site (signal coverage, technical issues).
    //   2. Monitor shows the CITATION REALITY
    //      (which competitor firms AI names in their category,
    //      whether they appear, where in the answer). It does NOT
    //      name fixes; that would collapse the funnel and damage
    //      the paid engagement's positioning.
    //   3. The paid engagement names the specific fixes via the
    //      per-query playbook + research memo + punch list.
    // The earlier version of this copy promised fix-naming in the
    // free diagnostic, retired 2026-07-19 and replaced by Monitor.
    ctaCard.innerHTML =
      '<div class="qw-cta-headline">See whether AI is naming you in your category right now.</div>'+
      '<div class="qw-cta-body">'+
        'This automated check reads your own site. It does not show what AI actually says about your category. Monitor runs your category across all 6 AI tools every month and shows '+
        '<strong>which competitors are being named</strong>, whether you appear in those answers, and what changed since last month.'+
      '</div>'+
      '<div class="qw-cta-actions">'+
        '<a class="qw-cta-button" href="https://neverranked.com/pricing">See what monitoring costs &rarr;</a>'+
        '<div class="qw-cta-note">$199 a month per category. Month to month.</div>'+
      '</div>';
    qwGrid.appendChild(ctaCard);

    // Dashboard mock: populate score and chart bars
    var mockScore = document.getElementById('mock-score');
    if(mockScore) mockScore.textContent = data.aeo_score;
    var mockChart = document.getElementById('mock-chart');
    if(mockChart){
      mockChart.innerHTML = '';
      var heights = [35,42,40,48,45,52,50,58,55,62,60,data.aeo_score];
      heights.forEach(function(h){
        var bar = document.createElement('div');
        bar.className = 'dash-mock-bar';
        bar.style.height = Math.max(h * 0.6, 4) + '%';
        mockChart.appendChild(bar);
      });
    }

    // The grade-aware CTA overrides are gone (2026-10-07). They told a low
    // scorer that AI search could not see them at all and that AI engines
    // were naming their competitors, neither of which this check measures.
    // The static headline and subtext in the markup show for every score.

    results.classList.add('active');
    gradeSection.scrollIntoView({behavior:'smooth',block:'start'});
  }

  // ---------- Session + attribution ----------
  // One id per tab session, sent with every call. The scan Worker counts a
  // row as a person only when it carries this id and client:'page', which
  // scripts, our MCP tool, Montaic and the audit template never send.
  var SESSION_KEY = 'nr_session_id';
  function newSessionId(){
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  var sessionId = (function(){
    try {
      var v = sessionStorage.getItem(SESSION_KEY);
      if (v) return v;
      v = newSessionId();
      sessionStorage.setItem(SESSION_KEY, v);
      return v;
    } catch (e) {
      return newSessionId();
    }
  })();

  // Referrer + UTM params from the landing URL, sent with scans and captures.
  var _ref = document.referrer || '';
  var _sp = new URLSearchParams(window.location.search);
  var _utm = {};
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){
    if(_sp.get(k)) _utm[k] = _sp.get(k);
  });

  var lastReportData = null;

  function renderResultsWrapped(data){
    lastReportData = data;
    renderResults(data);

    // Fire retargeting events on scan completion
    if(typeof fbq==='function') fbq('track','ViewContent',{content_name:'aeo_check',value:data.aeo_score});
    if(typeof lintrk==='function') lintrk('track',{conversion_id:0});

    // Update competitor teaser bar
    var compBarYou = document.getElementById('comp-bar-you');
    var compScoreYou = document.getElementById('comp-score-you');
    if(compBarYou && compScoreYou){
      compBarYou.style.width = (Number(data.aeo_score) || 0)+'%';
      compScoreYou.textContent = String(Number(data.aeo_score) || 0);
    }
    // Text-equivalent for the comparison (#26): the bars convey the gap by
    // width alone, so a screen reader gets two bare numbers with no stated
    // relationship. Give the group a spoken summary.
    var compInner = document.querySelector('.comp-teaser-inner');
    if(compInner){
      compInner.setAttribute('role','group');
      compInner.setAttribute('aria-label','Your AI-readability score '+(Number(data.aeo_score) || 0)+' out of 100, versus the top quartile of sites we have audited.');
    }
    // Retired checkout links removed 2026-06-22, and the retired offers
    // they pointed at removed 2026-08-18. The on-page CTAs link to
    // neverranked.com/pricing and must NOT be overwritten with dead
    // app.neverranked.com/checkout/* URLs.

    // Email gate: show teaser + count, or auto-reveal if already captured
    updateEmailGate(data);
    renderAskKit(data);
  }

  // ---------- Email gate ----------
  var CAPTURED_EMAIL_KEY = 'nr_captured_email';
  function getCapturedEmail(){
    try { return localStorage.getItem(CAPTURED_EMAIL_KEY) || ''; } catch(e){ return ''; }
  }
  function setCapturedEmail(email){
    try { localStorage.setItem(CAPTURED_EMAIL_KEY, email); } catch(e){}
  }
  var emailGateEl = document.getElementById('email-gate');
  var gateEmailInput = document.getElementById('gate-email-input');
  var gateEmailBtn = document.getElementById('gate-email-btn');
  var gateCount = document.getElementById('email-gate-count');
  var gateTeaser = document.getElementById('email-gate-teaser');
  var gateTitle = document.getElementById('email-gate-title');
  var gateSent = document.getElementById('email-gate-sent');
  var gatedDetails = document.getElementById('gated-details');
  var GATE_IMPRESSION_KEY = 'nr_gate_impression_logged';

  // Log that this session SAW the email ask, once per session. This is the
  // denominator of the capture rate the briefing reports.
  function logGateImpression(reportData) {
    try {
      if (sessionStorage.getItem(GATE_IMPRESSION_KEY) === '1') return;
      sessionStorage.setItem(GATE_IMPRESSION_KEY, '1');
    } catch (e) {}
    try {
      fetch('/api/gate-impression', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          session_id: sessionId,
          client: 'page',
          scan_id: reportData && reportData.scan_id ? reportData.scan_id : null,
          domain: reportData ? reportData.domain : null,
          score: reportData ? reportData.aeo_score : null,
          consent_version: NR_CONSENT_VERSION
        })
      }).catch(function(){});
    } catch (e) {}
  }

  function animateGradeRing(root){
    if(!root) return;
    var circle = root.querySelector('.grade-circle');
    var arc = root.querySelector('.gr-arc');
    if(!circle || !arc) return;
    var C = 339.292;
    var score = Number(circle.getAttribute('data-score')) || 0;
    if(score < 0) score = 0; if(score > 100) score = 100;
    var target = C * (1 - score / 100);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    if(reduce || !window.requestAnimationFrame){
      arc.style.transition = 'none';
      arc.style.strokeDashoffset = String(target);
      return;
    }
    // Start empty (markup already sets offset = C), then sweep on the next
    // frames so the CSS transition on .gr-arc fires.
    arc.style.strokeDashoffset = String(C);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      arc.style.strokeDashoffset = String(target);
    }); });
  }

  function revealGatedDetails(justSent){
    if(gatedDetails) gatedDetails.style.display = 'block';
    if(emailGateEl) emailGateEl.style.display = 'none';
    if(gateSent) gateSent.style.display = justSent ? 'block' : 'none';
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    // Animate the in-report bar fills (#12). Their widths were baked into
    // markup while #gated-details was display:none, so the CSS width
    // transition never fired and they painted flat. Re-run them from 0
    // now that the container is visible (skip under reduced-motion).
    if(!reduceMotion && window.requestAnimationFrame){
      var fills = (gatedDetails || document).querySelectorAll('.schema-summary-fill,.grade-dist-fill,.comp-bar-fill');
      fills.forEach(function(el){
        var w = el.style.width;
        if(!w || w === '0%') return;
        el.setAttribute('data-target-w', w);  // stash before zeroing
        el.style.transition = 'none';
        el.style.width = '0%';
      });
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        fills.forEach(function(el){
          var w = el.getAttribute('data-target-w');
          if(!w) return;
          el.style.transition = '';  // restore CSS transition, then animate to target
          el.style.width = w;
        });
      }); });
    }
  }

  // The count in the gate title is the number of items the email names. The
  // scan Worker builds that list (missing_signals) from the same function the
  // email uses, so the two cannot disagree.
  function missingList(data){
    if (Array.isArray(data.missing_signals)) return data.missing_signals;
    // A response without the list (an older Worker). Count missing schema
    // types and failing technical signals, once each.
    var out = [];
    (data.schema_coverage || []).forEach(function(s){ if(!s.present) out.push({ name: s.type + ' schema' }); });
    (data.technical_signals || []).forEach(function(t){ if(t.status === 'bad') out.push({ name: t.label }); });
    return out;
  }

  function updateEmailGate(data){
    if(!emailGateEl || !gatedDetails) return;
    var missing = missingList(data);
    var total = missing.length;

    if(gateCount) gateCount.textContent = total > 0 ? String(total) : '';
    if(gateTitle) gateTitle.textContent = total === 1 ? NR_COPY.gateTitleOne : (total > 1 ? NR_COPY.gateTitleMany : NR_COPY.gateTitleNone);
    if(gateSent) gateSent.style.display = 'none';

    // Teaser: the first two names. What each one is comes in the email.
    if(gateTeaser){
      var names = missing.slice(0, 2).map(function(m){ return String(m && m.name || ''); }).filter(Boolean);
      gateTeaser.innerHTML = names.length
        ? '<ul>' + names.map(function(n){ return '<li>' + escHtml(n) + '</li>'; }).join('') + '</ul>'
        : '';
    }

    if(getCapturedEmail()){
      revealGatedDetails(false);
    } else {
      emailGateEl.style.display = 'block';
      gatedDetails.style.display = 'none';
      if(gateEmailBtn){
        gateEmailBtn.disabled = false;
        gateEmailBtn.textContent = NR_COPY.gateButton;
      }
      if(gateEmailInput) gateEmailInput.value = '';
      logGateImpression(data);
    }
  }

  // Only the fields the Worker accepts as a fallback. Normally it ignores
  // this and builds the email from its own stored copy (scan_id).
  function fallbackReport(d){
    return {
      domain: d.domain,
      aeo_score: d.aeo_score,
      grade: d.grade,
      schema_coverage: (d.schema_coverage || []).map(function(s){ return { type: s.type, present: !!s.present }; }),
      technical_signals: (d.technical_signals || []).map(function(t){ return { label: t.label, status: t.status }; })
    };
  }

  async function submitGateEmail(){
    if(!gateEmailInput || !gateEmailBtn) return;
    var email = gateEmailInput.value.trim();
    if(!email || email.indexOf('@') < 1 || email.indexOf('.') === -1){ gateEmailInput.focus(); return; }
    if(!lastReportData) return;

    gateEmailBtn.disabled = true;
    gateEmailBtn.textContent = NR_COPY.gateButtonBusy;

    try{
      var resp = await fetch('/api/send-report', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: email,
          scan_id: lastReportData.scan_id || null,
          session_id: sessionId,
          client: 'page',
          consent_version: NR_CONSENT_VERSION,
          referrer: _ref || null,
          utm: Object.keys(_utm).length ? _utm : null,
          report: fallbackReport(lastReportData)
        })
      });
      if(!resp.ok) throw new Error('Failed');
      setCapturedEmail(email);
      revealGatedDetails(true);
      // Retargeting events
      if(typeof fbq === 'function') fbq('track', 'Lead');
      if(typeof lintrk === 'function') lintrk('track', {conversion_id: 0});
    } catch(e) {
      gateEmailBtn.textContent = 'Try again';
      gateEmailBtn.disabled = false;
    }
  }

  if(gateEmailBtn) gateEmailBtn.addEventListener('click', submitGateEmail);
  if(gateEmailInput) gateEmailInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter') submitGateEmail();
  });

  // ---------- "Ask it yourself" kit ----------
  // Three fixed questions, filled from the category and town the scanned
  // page states in its own JSON-LD (data.identity), editable, each with a
  // copy button. No email, no API call, no cost.
  var kitEl = document.getElementById('ask-kit');
  var kitCat = document.getElementById('ask-kit-category');
  var kitTown = document.getElementById('ask-kit-town');
  var kitList = document.getElementById('ask-kit-questions');

  function kitPlural(w){
    var lower = w.toLowerCase();
    var last = lower.slice(-1), last2 = lower.slice(-2);
    if (last === 's') return w;
    if (last === 'x' || last === 'z' || last2 === 'ch' || last2 === 'sh') return w + 'es';
    if (last === 'y' && 'aeiou'.indexOf(lower.charAt(lower.length - 2)) === -1) return w.slice(0, -1) + 'ies';
    return w + 's';
  }
  function kitArticle(w){
    if (w.slice(0, 4).toUpperCase() === 'HVAC') return 'an';
    return 'aeiou'.indexOf(w.charAt(0).toLowerCase()) !== -1 ? 'an' : 'a';
  }
  function kitQuestions(){
    var cat = kitCat ? kitCat.value.trim() : '';
    var town = kitTown ? kitTown.value.trim() : '';
    var townText = town || NR_COPY.kitTownPlaceholder;
    return NR_KIT_QUESTIONS.map(function(q){
      var plural = cat ? kitPlural(cat) : NR_COPY.kitCategoryPlaceholder;
      var singular = cat || NR_COPY.kitCategoryPlaceholder;
      var article = cat ? kitArticle(cat) : '';
      return q.split('{article} ').join(article ? article + ' ' : '')
        .split('{plural}').join(plural)
        .split('{singular}').join(singular)
        .split('{town}').join(townText);
    });
  }
  function copyText(text, btn){
    function done(){
      if(!btn) return;
      btn.textContent = NR_COPY.kitCopied;
      setTimeout(function(){ btn.textContent = NR_COPY.kitCopy; }, 1600);
    }
    function fallback(){
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {}
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
        return;
      }
    } catch (e) {}
    fallback();
  }
  function paintKit(){
    if(!kitList) return;
    var qs = kitQuestions();
    if(kitList.children.length !== qs.length){
      kitList.innerHTML = '';
      qs.forEach(function(){
        var li = document.createElement('li');
        var span = document.createElement('span');
        span.className = 'ask-kit-q';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ask-kit-copy';
        b.textContent = NR_COPY.kitCopy;
        b.addEventListener('click', function(){ copyText(span.textContent || '', b); });
        li.appendChild(span);
        li.appendChild(b);
        kitList.appendChild(li);
      });
    }
    qs.forEach(function(q, i){
      var span = kitList.children[i].querySelector('.ask-kit-q');
      if(span) span.textContent = q;
    });
  }
  function renderAskKit(data){
    if(!kitEl) return;
    var id = (data && data.identity) || {};
    if(kitCat) kitCat.value = typeof id.category === 'string' ? id.category.slice(0, 40) : '';
    if(kitTown) kitTown.value = typeof id.town === 'string' ? id.town.slice(0, 40) : '';
    paintKit();
    kitEl.style.display = 'block';
  }
  if(kitCat) kitCat.addEventListener('input', paintKit);
  if(kitTown) kitTown.addEventListener('input', paintKit);

  // Agency pitch-link mode. When ref_name is present in the URL, an agency
  // reseller has sent this link to their prospect. We swap:
  //   - show the agency banner at the top with their name + book-a-call CTA
  //   - replace the NeverRanked pricing CTAs with a single "Talk to [agency]"
  //     block so the prospect talks to the agency, not us
  //   - keep everything else (scan, grade, insights, signals) intact because
  //     that is the product value the agency is reselling
  //
  // The entire block is wrapped in try/catch so a DOM lookup failure here
  // can never prevent the primary Run Check handler from wiring up below.
  // Our failures should never take down the main tool.
  var _agency = null;
  try {
    var _refName = _sp.get('ref_name');
    if (_refName) {
      _agency = {
        name: _refName,
        email: _sp.get('ref_email') || '',
        phone: _sp.get('ref_phone') || '',
        website: _sp.get('ref_website') || ''
      };
      document.body.classList.add('agency-mode');
      var banner = document.getElementById('agency-banner');
      var bannerName = document.getElementById('agency-banner-name');
      var bannerCta = document.getElementById('agency-banner-cta');
      if (banner && bannerName) {
        bannerName.textContent = _agency.name;
        banner.style.display = 'block';
      }
      if (bannerCta) {
        if (_agency.email) {
          bannerCta.href = 'mailto:' + _agency.email + '?subject=' + encodeURIComponent('AI search audit follow-up');
        } else if (_agency.website) {
          bannerCta.href = _agency.website;
          bannerCta.setAttribute('target','_blank');
          bannerCta.setAttribute('rel','noopener');
        } else {
          bannerCta.style.display = 'none';
        }
      }
      // Also populate the bottom-of-page agency CTA card (shown when the
      // NeverRanked pricing tiers are hidden by body.agency-mode CSS).
      var ctaName = document.getElementById('agency-cta-name');
      var ctaBtn = document.getElementById('agency-cta-btn');
      var ctaContact = document.getElementById('agency-cta-contact');
      if (ctaName) ctaName.textContent = _agency.name;
      if (ctaBtn) {
        if (_agency.email) {
          ctaBtn.href = 'mailto:' + _agency.email + '?subject=' + encodeURIComponent('AI search audit follow-up');
        } else if (_agency.website) {
          ctaBtn.href = _agency.website;
          ctaBtn.setAttribute('target','_blank');
          ctaBtn.setAttribute('rel','noopener');
        } else {
          ctaBtn.style.display = 'none';
        }
      }
      if (ctaContact) {
        var contactBits = [];
        if (_agency.email) contactBits.push(_agency.email);
        if (_agency.phone) contactBits.push(_agency.phone);
        ctaContact.textContent = contactBits.join(' · ');
      }
    }
  } catch (e) {
    // Never let agency-mode setup block the core Run Check flow
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Agency mode setup failed:', e);
    }
  }

  // Channel mode: the visitor is an AGENCY OWNER who clicked OUR cold email
  // (utm_campaign=agency-cold), not an agency's prospect. Reveal the reseller
  // card that reframes their own self-scan as the wedge they run on clients,
  // routing to /for-agencies. Suppressed when ref_name agency-mode is active
  // (that is the agency's client, a different audience). Wrapped in try/catch
  // so it can never block the core Run Check flow.
  try {
    if (_utm.utm_campaign === 'agency-cold' && !_agency) {
      document.body.classList.add('channel-mode');
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Channel mode setup failed:', e);
    }
  }

  // Auto-scan via ?url= param. Used by outreach emails ("See the full scan
  // yourself: https://check.neverranked.com/?url=agency.com") so the
  // recipient lands on a pre-filled, auto-running scan and sees their real
  // score without any click beyond the email link itself.
  var _prefill = _sp.get('url');
  if (_prefill) {
    try {
      input.value = _prefill;
      // Defer one tick so the input is visually updated before the scan
      // kicks off and the UI enters the loading state.
      setTimeout(function(){ runCheckFinal(); }, 50);
    } catch (e) { /* ignore */ }
  } else if (window.matchMedia && window.matchMedia('(min-width:700px)').matches) {
    // Autofocus the URL field on desktop only (#17) — removes a click at
    // the activation moment. Skipped on mobile so we don't force the
    // keyboard open on load, and skipped when a ?url= scan is auto-running.
    try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
  }

  // Rebind
  function showInputError(msg){
    errorMsg.textContent = msg;
    errorMsg.classList.add('active');
    input.focus();
  }

  async function runCheckFinal(){
    const raw = (input.value || '').trim();
    // Activation-moment feedback (#6): empty and malformed input used to
    // fail silently (refocus only) or POST garbage and surface a generic
    // backend error. Give a visible, friendly inline message instead.
    if(!raw){ showInputError('Enter your site URL to run the check.'); return; }
    const url = normalizeUrl(raw);
    let domain, parsed;
    try{ parsed = new URL(url); domain = parsed.hostname; }
    catch{ showInputError('That does not look like a valid URL. Try yoursite.com.'); return; }
    if(!domain || domain.indexOf('.') === -1){
      showInputError('That does not look like a valid URL. Try yoursite.com.'); return;
    }

    btn.disabled=true;
    errorMsg.classList.remove('active');
    results.classList.remove('active');
    loading.classList.add('active');

    // Staged loader (#10): a multi-second multi-engine scan should look
    // like work, not a frozen line. Advance through the real checks. Copy
    // maps to what the scanner actually does (no hype, no emoji).
    const stages = [
      'Fetching '+domain+'…',
      'Reading the markup AI crawlers see…',
      'Checking schema and structured data…',
      'Testing agent-readiness and llms.txt…',
      NR_COPY.loading
    ];
    let si = 0;
    loadingText.textContent = stages[0];
    const reduceLoad = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const stageTimer = reduceLoad ? null : setInterval(function(){
      si = Math.min(si + 1, stages.length - 1);
      loadingText.textContent = stages[si];
    }, 1400);

    // Abort guard (#7): the one fetch the visitor waits on had no timeout,
    // so a slow or blocking target site (our best prospects) could pulse
    // forever. Cap it and resolve into the branded error UI.
    const controller = ('AbortController' in window) ? new AbortController() : null;
    const slowTimer = setTimeout(function(){
      loadingText.textContent = 'Still reading the site… slow or large pages take a moment.';
    }, 12000);
    const abortTimer = controller ? setTimeout(function(){ controller.abort(); }, 25000) : null;

    try{
      const resp = await fetch('/api/check',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url, referrer:_ref, utm:Object.keys(_utm).length?_utm:undefined, session_id:sessionId, client:'page'}),
        signal: controller ? controller.signal : undefined
      });
      let data = {};
      try{ data = await resp.json(); }catch{ data = {}; }
      if(!resp.ok){ const e = new Error('http'); e.serverMsg = data && data.error; throw e; }
      renderResultsWrapped(data);
    }catch(err){
      // Error hardening (#21): only surface server-provided diagnostics or
      // a branded fallback — never a raw 'Failed to fetch' / JSON parse
      // string in the styled card at the moment trust matters most.
      let msg;
      if(err && err.name === 'AbortError'){
        msg = 'The scan is taking longer than expected, which often means the site is slow or blocking automated requests, the same thing AI crawlers hit. Try again, or point us at the homepage.';
      } else if(err && err.serverMsg){
        msg = err.serverMsg;
      } else {
        msg = 'We could not complete the scan. The site may be slow, unreachable, or blocking automated requests. Try again, or point us at the homepage.';
      }
      errorMsg.textContent = msg;
      errorMsg.classList.add('active');
    }finally{
      if(stageTimer) clearInterval(stageTimer);
      clearTimeout(slowTimer);
      if(abortTimer) clearTimeout(abortTimer);
      loading.classList.remove('active');
      btn.disabled=false;
    }
  }

  btn.addEventListener('click',runCheckFinal);
  input.addEventListener('keydown',function(e){
    if(e.key==='Enter')runCheckFinal();
  });
})();
</script>
</body>
</html>`;

// ---------- Report email builder ----------

function escHtml(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Parse robots.txt for AI crawlers that are fully disallowed (Disallow: /).
// CITATION crawlers vs TRAINING crawlers. Blocking these is NOT the same thing,
// and saying it is was a real overstatement in this tool.
//
// Found 2026-09-01 scanning a Honolulu surgeon's site: robots.txt blocked
// GPTBot, Google-Extended, CCBot and ClaudeBot, and this tool reported that
// the engines "cannot cite the site". Only part of that is true. GPTBot is
// OpenAI's TRAINING crawler; ChatGPT's live citations come from OAI-SearchBot,
// which that site did not block. Google-Extended is a training opt-out and does
// not govern AI Overviews. CCBot feeds Common Crawl. Blocking those affects
// whether a model LEARNS the site, not whether it can CITE it today.
//
// ClaudeBot is different: Anthropic fetches with it, so blocking it does stop
// Claude reading the page.
//
// This distinction matters because the claim goes into cold outreach. A
// prospect's agency that knows GPTBot from OAI-SearchBot would catch the
// overstatement instantly, and an overstated claim is the one thing this
// product cannot afford. Same failure class as the Copilot retraction.
const CITATION_BOTS = new Set([
  "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "anthropic-ai",
  "PerplexityBot", "Perplexity-User",
]);

function aiBotsFlagText(blocked: string[]): string {
  const all = blocked.includes("all crawlers (User-agent: *)");
  const cite = blocked.filter((b) => CITATION_BOTS.has(b));
  const train = blocked.filter((b) => !CITATION_BOTS.has(b) && b !== "all crawlers (User-agent: *)");

  if (all) {
    return `robots.txt disallows all crawlers (User-agent: *)${train.length || cite.length ? `, and names ${[...cite, ...train].join(", ")} explicitly` : ""}. Nothing can read the site, so nothing can cite it. Fix this before anything else.`;
  }
  const parts: string[] = [];
  if (cite.length) {
    parts.push(`robots.txt blocks ${cite.join(", ")}, which ${cite.length === 1 ? "is a crawler an AI engine uses to READ pages when answering" : "are crawlers AI engines use to READ pages when answering"}. Those engines cannot see the site, so they cannot cite it.`);
  }
  if (train.length) {
    parts.push(`${cite.length ? "Also blocked: " : "robots.txt blocks "}${train.join(", ")}. Those are mainly TRAINING crawlers, so blocking them affects whether models learn the site over time rather than whether they can cite it today.`);
  }
  if (cite.length) parts.push("Allow the citation crawlers in robots.txt before anything else.");
  else parts.push("Worth confirming this matches what was intended: a site can allow citation while refusing training, and these directives are often a host default rather than a deliberate choice.");
  return parts.join(" ");
}

// Heuristic, not a full robots.txt engine: groups consecutive User-agent lines,
// and if that group disallows "/", flags any AI bot (or "*") it names.
//
// BUG FIXED 2026-09-01: this only ended a group on a Disallow, and ignored
// Allow entirely. Cloudflare's managed robots.txt opens with
//
//     User-agent: *
//     Content-Signal: search=yes,ai-train=no,use=reference
//     Allow: /
//
//     User-agent: GPTBot
//     Disallow: /
//
// so the "*" group ended with an Allow, no Disallow was ever recorded, and the
// NEXT User-agent was appended to the SAME group -- inheriting that group's
// "Disallow: /". Every site on Cloudflare's managed AI-bot blocking therefore
// reported "all crawlers (User-agent: *)" blocked, capped at score 35 / grade F,
// with the flag text asserting nothing could read the site. The file said
// Allow: /. That is the opposite.
//
// Now: any rule line (Allow or Disallow) closes a group, and a group carrying
// "Allow: /" without "Disallow: /" is not treated as blocking.
function blockedAiBots(robotsTxt: string): string[] {
  const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "cohere-ai", "Bytespider", "Amazonbot", "Meta-ExternalAgent"];
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let cur: { agents: string[]; disallow: string[]; allow: string[] } | null = null;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const val = m[2].trim();
    if (field === "user-agent") {
      // ANY rule line closes the group, not just Disallow. See the bug note above.
      if (cur && (cur.disallow.length > 0 || cur.allow.length > 0)) cur = null;
      if (!cur) { cur = { agents: [], disallow: [], allow: [] }; groups.push(cur); }
      cur.agents.push(val);
    } else if (field === "disallow" && cur) {
      cur.disallow.push(val);
    } else if (field === "allow" && cur) {
      cur.allow.push(val);
    }
  }
  const blocked = new Set<string>();
  for (const g of groups) {
    if (!g.disallow.includes("/")) continue;
    if (g.allow.includes("/")) continue; // explicit site-wide Allow wins
    for (const a of g.agents) {
      if (a === "*") blocked.add("all crawlers (User-agent: *)");
      else if (AI_BOTS.some((b) => b.toLowerCase() === a.toLowerCase())) blocked.add(a);
    }
  }
  return [...blocked];
}

// buildReportEmail moved to report-email.ts (2026-10-07): it is built from
// our stored scan summary, escapes every field and names each missing signal.

// ---------- Drip sequence ----------

const DRIP_DAY_3 = 3;
const DRIP_DAY_7 = 7;

interface LeadData {
  email: string;
  scans: { domain: string; score: number; grade: string; date: string }[];
  created: string;
  lastScan: string;
  drip_day3_sent?: boolean;
  drip_day7_sent?: boolean;
}

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

type ResendResult = { ok: boolean; id: string | null; status: number; error: string | null };

async function sendResend(env: Env, payload: Record<string, unknown>): Promise<ResendResult> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    let body: any = null;
    try { body = await resp.json(); } catch {}
    if (resp.ok) {
      return { ok: true, id: body?.id ?? null, status: resp.status, error: null };
    }
    const err = body?.message || body?.error || `HTTP ${resp.status}`;
    return { ok: false, id: null, status: resp.status, error: String(err) };
  } catch (e) {
    return { ok: false, id: null, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function recordDelivery(
  env: Env,
  kind: "drip_day3" | "drip_day7" | "report",
  email: string,
  result: ResendResult,
): Promise<void> {
  const key = kind === "report"
    ? `report_delivery:${email}`
    : `drip_delivery:${email}:${kind === "drip_day3" ? "day3" : "day7"}`;
  const record = {
    email,
    kind,
    status: result.ok ? "sent" : "failed",
    resend_id: result.id,
    http_status: result.status,
    error: result.error,
    ts: new Date().toISOString(),
  };
  try {
    await env.LEADS.put(key, JSON.stringify(record), { expirationTtl: 365 * 24 * 60 * 60 });
  } catch (e) {
    console.error("delivery-record-failed", key, e instanceof Error ? e.message : String(e));
  }
}

async function runDripSequence(env: Env): Promise<void> {
  // Off unless explicitly enabled (decision 2, 2026-10-07). Checked here as
  // well as in scheduled() so no other caller can start it by accident.
  if (env.DRIP_ENABLED !== "1") return;
  if (!env.RESEND_API_KEY) return;

  // List all leads from KV (paginated; see listAllKvKeys helper above)
  const allKeys = await listAllKvKeys(env.LEADS, "lead:");
  const list = { keys: allKeys };
  let sent = 0;

  for (const key of list.keys) {
    const raw = await env.LEADS.get(key.name);
    if (!raw) continue;

    const lead: LeadData = JSON.parse(raw);
    const age = daysSince(lead.created);
    let updated = false;

    // Day 3: Competitor comparison email
    if (age >= DRIP_DAY_3 && !lead.drip_day3_sent) {
      const latestScan = lead.scans[lead.scans.length - 1];
      if (latestScan) {
        const result = await sendResend(env, {
          from: "NeverRanked <reports@neverranked.com>",
          to: [lead.email],
          subject: dripDay3Subject(latestScan),
          html: buildDripDay3Email(latestScan),
        });
        await recordDelivery(env, "drip_day3", lead.email, result);
        if (result.ok) {
          lead.drip_day3_sent = true;
          updated = true;
          sent++;
        } else {
          console.error(`Drip day3 failed for ${lead.email}: status=${result.status} error=${result.error}`);
        }
      }
    }

    // Day 7: Re-scan nudge + monitoring pitch
    if (age >= DRIP_DAY_7 && !lead.drip_day7_sent) {
      const latestScan = lead.scans[lead.scans.length - 1];
      if (latestScan) {
        const result = await sendResend(env, {
          from: "NeverRanked <reports@neverranked.com>",
          to: [lead.email],
          subject: dripDay7Subject(latestScan),
          html: buildDripDay7Email(latestScan),
        });
        await recordDelivery(env, "drip_day7", lead.email, result);
        if (result.ok) {
          lead.drip_day7_sent = true;
          updated = true;
          sent++;
        } else {
          console.error(`Drip day7 failed for ${lead.email}: status=${result.status} error=${result.error}`);
        }
      }
    }

    if (updated) {
      // No TTL: a lead record never expires (2026-10-07).
      await env.LEADS.put(key.name, JSON.stringify(lead));
    }

    // Rate limit: 200ms between sends
    if (sent > 0 && sent % 5 === 0) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`Drip sequence complete: ${sent} emails sent`);
}

// The drip templates live in drip-email.ts.

// ---------- Fetch failure descriptions ----------
// Maps upstream HTTP status codes to specific, diagnostic messages. Cloudflare
// edge errors (520-527) deserve their own explanation because they usually
// indicate a real configuration problem on the target site's infrastructure,
// not a user-input error. AI crawlers will hit the same wall, so this doubles
// as a useful diagnostic for the prospect.
function describeFetchFailure(status: number): string {
  switch (status) {
    case 400:
      return "The site rejected the request (HTTP 400). The URL may be malformed or the server may require additional headers.";
    case 401:
      return "The site requires authentication (HTTP 401). AI crawlers cannot access pages behind a login, so they cannot read anything gated this way.";
    case 403:
      return "The site is blocking our scanner (HTTP 403). If your firewall or bot filter is too aggressive, it may also be blocking GPTBot, ClaudeBot, and PerplexityBot. Check your robots.txt and WAF rules.";
    case 404:
      return "That URL returns a 404. Double-check the address, or point us at the homepage.";
    case 429:
      return "The site rate-limited our request (HTTP 429). Try again in a minute, or check whether your host is throttling automated requests too aggressively.";
    case 500:
      return "The site returned a server error (HTTP 500). The origin is throwing an unhandled exception. Worth a look in your application logs.";
    case 502:
      return "Bad Gateway (HTTP 502). A proxy or CDN in front of the site could not reach the origin server. Usually a temporary infrastructure issue, but if it persists it will block AI crawlers the same way.";
    case 503:
      return "Service Unavailable (HTTP 503). The origin is down or overloaded, or maintenance mode is on. AI systems will treat this as an unreachable source.";
    case 504:
      return "Gateway Timeout (HTTP 504). The origin took too long to respond. If this is consistent, AI crawlers will skip the site entirely.";
    case 520:
      return "Cloudflare returned an unknown error from the origin (HTTP 520). The origin server sent an empty or malformed response. This is a site-owner issue and it blocks AI crawlers from citing the content.";
    case 521:
      return "Cloudflare cannot reach the origin server (HTTP 521). The origin is down or blocking Cloudflare's IPs. Fix this or AI systems will see the same dead end.";
    case 522:
      return "The origin server timed out on Cloudflare (HTTP 522). The origin is unresponsive or too slow to complete the handshake. AI crawlers will give up the same way.";
    case 523:
      return "Cloudflare could not find the origin (HTTP 523). Usually a DNS or routing misconfiguration between Cloudflare and the origin.";
    case 524:
      return "The origin took too long to generate a response (HTTP 524). Cloudflare connected, but the origin never finished. Anything this slow gets dropped by AI crawlers.";
    case 525:
      return "SSL handshake failed between Cloudflare and the origin (HTTP 525). The origin’s certificate setup is broken. Fix this first. Nothing (AI tools included) can read the site cleanly until it’s sorted.";
    case 526:
      return "The origin’s SSL certificate is invalid (HTTP 526). Cloudflare refused to trust the cert on the underlying server. This is a site-owner configuration error. AI tools, Google, and our scanner all hit the same wall. Fixing the cert is the first step before anything else can read the site.";
    case 527:
      return "Cloudflare lost its connection to the origin mid-request (HTTP 527). Usually an origin network or firewall issue.";
    default:
      if (status >= 500) {
        return `The site returned a server error (HTTP ${status}). Something is wrong on the origin or its CDN. Worth investigating before AI crawlers hit the same error.`;
      }
      if (status >= 400) {
        return `The site refused the request (HTTP ${status}). Check that the URL is public and not gated by a firewall, bot filter, or login.`;
      }
      return `Could not fetch the site (HTTP ${status}). Make sure the URL is publicly accessible.`;
  }
}

// ---------- Worker handler ----------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key, X-Internal-Source",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Agent-readiness scorer (ported from the MCP agent_readiness_check
    // tool). Pass { url, vertical? }, get back the Action-schema
    // coverage grade. Mirrors /api/check structure: CORS, optional
    // keyed bypass, JSON-body validation, 10s fetch timeout (inside the
    // port), error handling. Response carries the NeverRanked
    // attribution literal.
    if (url.pathname === "/api/agent-readiness" && request.method === "POST") {
      const keyed = isKeyed(request, env);
      const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
      if (!keyed && isRateLimited(ip)) {
        return Response.json({ error: "Rate limited. Try again in a minute." }, { status: 429, headers: corsHeaders });
      }
      let body: { url?: string; vertical?: string };
      try { body = await request.json(); }
      catch { return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: corsHeaders }); }
      const targetUrl = body.url?.trim();
      if (!targetUrl) return Response.json({ error: "Provide a URL." }, { status: 400, headers: corsHeaders });
      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch { return Response.json({ error: "Invalid URL. Include https://." }, { status: 400, headers: corsHeaders }); }

      try {
        const result = await agentReadinessCheck({ url: targetUrl, vertical: body.vertical?.trim() || undefined });
        return Response.json(result, { headers: corsHeaders });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Agent-readiness scan failed.";
        const blocked = /HTTP 4\d\d|blocking automated/.test(msg);
        return Response.json({ error: msg }, { status: blocked ? 422 : 502, headers: corsHeaders });
      }
    }

    // llms.txt scorer (ported from the MCP llms_txt_check tool). Pass
    // { url }, get back the /llms.txt completeness grade. Same route
    // shape as /api/check: CORS, optional keyed bypass, JSON-body
    // validation, 10s fetch timeout (inside the port), error handling.
    // Response carries the NeverRanked attribution literal.
    if (url.pathname === "/api/llms-txt" && request.method === "POST") {
      const keyed = isKeyed(request, env);
      const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
      if (!keyed && isRateLimited(ip)) {
        return Response.json({ error: "Rate limited. Try again in a minute." }, { status: 429, headers: corsHeaders });
      }
      let body: { url?: string };
      try { body = await request.json(); }
      catch { return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: corsHeaders }); }
      const targetUrl = body.url?.trim();
      if (!targetUrl) return Response.json({ error: "Provide a URL." }, { status: 400, headers: corsHeaders });
      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch { return Response.json({ error: "Invalid URL. Include https://." }, { status: 400, headers: corsHeaders }); }

      try {
        const result = await llmsTxtCheck({ url: targetUrl });
        return Response.json(result, { headers: corsHeaders });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "llms.txt scan failed.";
        return Response.json({ error: msg }, { status: 502, headers: corsHeaders });
      }
    }

    // Phase 6B: Public schema scorer. Single-purpose endpoint --
    // pass a URL, get the schema completeness grade per JSON-LD
    // block back. Lighter than /api/check (no full AEO report,
    // no email capture, no UTM tracking). Designed to be embedded
    // in marketing copy and used as a focused lead magnet for the
    // 18pp citation-penalty story.
    if (url.pathname === "/api/schema-score" && request.method === "POST") {
      const keyed = isKeyed(request, env);
      const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
      if (!keyed && isRateLimited(ip)) {
        return Response.json({ error: "Rate limited. Try again in a minute." }, { status: 429, headers: corsHeaders });
      }
      let body: { url?: string };
      try { body = await request.json(); }
      catch { return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: corsHeaders }); }
      const targetUrl = body.url?.trim();
      if (!targetUrl) return Response.json({ error: "Provide a URL." }, { status: 400, headers: corsHeaders });
      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch { return Response.json({ error: "Invalid URL. Include https://." }, { status: 400, headers: corsHeaders }); }
      if (!isPublicHttpUrl(targetUrl)) return Response.json({ error: "That address can't be scanned." }, { status: 400, headers: corsHeaders });

      let html: string;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const resp = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 NeverRanked-SchemaScore/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);
        if (!resp.ok) return Response.json({ error: `HTTP ${resp.status}` }, { status: 422, headers: corsHeaders });
        html = await resp.text();
      } catch (err: unknown) {
        const msg = err instanceof Error && err.name === "AbortError" ? "Timed out (10s)." : "Could not reach the site.";
        return Response.json({ error: msg }, { status: 422, headers: corsHeaders });
      }

      // Extract every JSON-LD block on the page and grade each.
      const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
      const graded: { detected_type: string | null; score: number; bucket: "green" | "gold" | "red"; issues: string[]; meets_deploy_threshold: boolean; source?: "inline" | "injected" }[] = [];
      for (const b of blocks) {
        const inner = b.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
        try {
          const parsedJson = JSON.parse(inner);
          const arr = Array.isArray(parsedJson) ? parsedJson
            : Array.isArray((parsedJson as Record<string, unknown>)?.["@graph"]) ? ((parsedJson as Record<string, unknown>)["@graph"] as unknown[])
            : [parsedJson];
          for (const node of arr) {
            const grade = gradeSchema(node as object);
            graded.push({
              detected_type: grade.detectedType,
              score: grade.score,
              bucket: gradeBucket(grade.score),
              issues: grade.issues,
              meets_deploy_threshold: grade.meetsDeployThreshold,
              source: "inline",
            });
          }
        } catch {
          graded.push({ detected_type: null, score: 0, bucket: "red", issues: ["Block failed to parse as JSON."], meets_deploy_threshold: false, source: "inline" });
        }
      }

      // NeverRanked-injected schema augmentation. We do a raw HTML fetch
      // (no JS execution), so any schema deployed via our inject snippet
      // wouldn't appear in the loop above. The page references
      // app.neverranked.com/inject/<slug>.js (or .json); we fetch the
      // .json sibling endpoint and grade those blocks too. This makes
      // the score reflect what the customer actually deployed -- not
      // just what's in the static HTML. Fail-open: any error keeps the
      // existing graded set unchanged.
      let injectionSlug: string | null = null;
      let injectedCount = 0;
      const injectMatch = html.match(/app\.neverranked\.com\/inject\/([a-z0-9_-]+)\.(?:js|json)/i);
      if (injectMatch) {
        injectionSlug = injectMatch[1].toLowerCase();
        try {
          const injCtl = new AbortController();
          const injTimeout = setTimeout(() => injCtl.abort(), 5_000);
          const injResp = await fetch(`https://app.neverranked.com/inject/${injectionSlug}.json`, {
            headers: { "Accept": "application/json" },
            signal: injCtl.signal,
          });
          clearTimeout(injTimeout);
          if (injResp.ok) {
            const injData = await injResp.json() as { schemas?: { ld?: unknown }[] };
            for (const s of (injData.schemas ?? [])) {
              if (!s || typeof s !== "object" || !("ld" in s) || !s.ld) continue;
              try {
                const node = s.ld as object;
                const grade = gradeSchema(node);
                graded.push({
                  detected_type: grade.detectedType,
                  score: grade.score,
                  bucket: gradeBucket(grade.score),
                  issues: grade.issues,
                  meets_deploy_threshold: grade.meetsDeployThreshold,
                  source: "injected",
                });
                injectedCount++;
              } catch { /* skip bad node, keep going */ }
            }
          }
        } catch { /* fail open -- network/timeout/parse errors don't break the scan */ }
      }

      // Aggregate: overall = average of per-block scores, weighted
      // toward the lowest because a single broken block tanks
      // citations. Weighting: simple min-skewed average = 0.6*min +
      // 0.4*mean. Empirically aligns with the 18pp penalty observation.
      const scores = graded.map(g => g.score);
      const overall = scores.length === 0 ? 0
        : Math.round(0.6 * Math.min(...scores) + 0.4 * (scores.reduce((a, b) => a + b, 0) / scores.length));
      const overallBucket = gradeBucket(overall);

      // Citation-penalty estimate: under 60 you're in the 18pp
      // penalty zone; 60-79 partial penalty (~9pp); 80+ no penalty.
      const penaltyPp = overall >= 80 ? 0 : overall >= 60 ? 9 : 18;

      return Response.json({
        url: targetUrl,
        domain: parsed.hostname,
        blocks_found: blocks.length,
        nodes_graded: graded.length,
        overall_score: overall,
        overall_bucket: overallBucket,
        citation_penalty_pp: penaltyPp,
        per_node: graded,
        injection: injectionSlug ? {
          slug: injectionSlug,
          schemas_added: injectedCount,
          note: injectedCount > 0
            ? `${injectedCount} schema block${injectedCount === 1 ? "" : "s"} graded from your NeverRanked injection (not visible to raw HTML scrapers, but real for AI engines that execute JavaScript).`
            : "NeverRanked injection snippet detected but no schemas returned -- check your /admin/inject configuration.",
        } : null,
        explanation: penaltyPp === 0
          ? "Schema is in the green zone. AI engines are unlikely to discount citations from this site for schema reasons."
          : penaltyPp === 9
          ? "Partial schema -- the 730-citation study found ~9pp citation penalty in this range. Fix the issues below to clear the green-zone threshold."
          : "Critical schema gaps detected. Empirical research shows ~18pp citation penalty for partial / generic schema vs no schema at all. Either fix the issues or remove the schema entirely until you can implement it correctly.",
      }, { headers: corsHeaders });
    }

    // API endpoint
    if (url.pathname === "/api/check" && request.method === "POST") {
      // Keyed Montaic lane bypasses the per-IP rate limit and is tagged
      // "montaic" in telemetry. Unkeyed traffic behaves exactly as before.
      const keyed = isKeyed(request, env);
      // Rate limiting
      const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
      if (!keyed && isRateLimited(ip)) {
        return Response.json(
          { error: "Rate limit exceeded. Please wait a moment before trying again." },
          { status: 429, headers: corsHeaders }
        );
      }

      let body: { url?: string; referrer?: string; utm?: Record<string, string>; session_id?: string; client?: string };
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid request body." }, { status: 400, headers: corsHeaders });
      }

      const targetUrl = body.url?.trim();
      const referrer = body.referrer?.trim() || "";
      const utm = body.utm || {};
      const sessionId = cleanSessionId(body.session_id);
      if (!targetUrl) {
        return Response.json({ error: "Please provide a URL." }, { status: 400, headers: corsHeaders });
      }

      // Validate URL
      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        return Response.json({ error: "Invalid URL. Please include https://." }, { status: 400, headers: corsHeaders });
      }
      if (!isPublicHttpUrl(targetUrl)) {
        return Response.json({ error: "That address can't be scanned." }, { status: 400, headers: corsHeaders });
      }

      // Fetch target
      let html: string;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const resp = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 NeverRanked-SchemaCheck/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);

        if (!resp.ok) {
          return Response.json(
            { error: describeFetchFailure(resp.status) },
            { status: 422, headers: corsHeaders }
          );
        }

        html = await resp.text();
      } catch (err: unknown) {
        const message = err instanceof Error && err.name === "AbortError"
          ? "Request timed out (10s). The site may be too slow or blocking requests."
          : "Could not reach the site. Check the URL and make sure it is publicly accessible.";
        return Response.json({ error: message }, { status: 422, headers: corsHeaders });
      }

      // Use the snippet-following variant so any schema deployed via
      // a NeverRanked /inject/<slug>.js snippet on the page is fetched
      // and graded too. Without this, customers running the free check
      // on their own snippet-installed sites see a falsely low score
      // (a raw HTML scrape can't see client-side-injected schema).
      const report = await buildReportFollowingSnippets(targetUrl, html);

      // AN EMPTY READ IS NOT A ZERO. Some hosts serve an empty 200 to
      // Workers egress IPs (bot protection; found 2026-08-13 when the
      // outreach pipeline wrote "scores 0/100" about sites that render
      // fine in a browser — fifoagency.com graded 0 here and 60/C an
      // hour later). A fetched page with content can never score 0, so
      // all-empty signals mean the fetch failed and the honest answer
      // is the same 422 a 403 gets, not a grade F. This also fixes the
      // verify links already sitting in sent cold email: a recipient
      // re-running their scan now sees this error instead of a false 0.
      if (reportReadNothing(report)) {
        return Response.json(
          {
            error:
              "The site responded but sent our scanner an empty page — no title, headings, text, or structured data. " +
              "This usually means a firewall or bot filter serves automated requests a blank response. " +
              "We don't score what we can't read. Worth knowing: if it blanks our scanner, check whether it does the same to GPTBot, ClaudeBot, and PerplexityBot.",
          },
          { status: 422, headers: corsHeaders }
        );
      }

      // Crawlability gate. The analyzer scores schema, llms.txt, and authority
      // signals but never gates on whether crawlers are even allowed in. A page
      // that sends `noindex`, or a robots.txt that blocks the AI crawlers, is
      // uncitable no matter how strong its schema, so it must not score high.
      // Caught here in the free-check path (where prospects self-serve) so a
      // gagged site grades honestly -- including our own noindex site.
      // Crawl facts kept for the stored summary, so the emailed result can name
      // a noindex or a robots.txt block as plainly as the page's red flag does.
      const crawl: { noindex: boolean; nofollow: boolean; blocked: string[] } = { noindex: false, nofollow: false, blocked: [] };
      try {
        const robotsMeta = (report.signals.robots_meta || "").toLowerCase();
        const noindex = /noindex/.test(robotsMeta);
        const nofollow = /nofollow/.test(robotsMeta);
        crawl.noindex = noindex;
        crawl.nofollow = nofollow;
        let aiBotsBlocked: string[] = [];
        try {
          const rc = new AbortController();
          const rt = setTimeout(() => rc.abort(), 6000);
          const rr = await fetch(new URL("/robots.txt", targetUrl).toString(), {
            headers: { "User-Agent": "NeverRanked-SchemaCheck/1.0" },
            signal: rc.signal,
          });
          clearTimeout(rt);
          if (rr.ok) aiBotsBlocked = blockedAiBots(await rr.text());
        } catch { /* robots.txt unreachable -> treat as not blocking */ }
        crawl.blocked = aiBotsBlocked;

        if (noindex || aiBotsBlocked.length > 0) {
          report.aeo_score = Math.min(report.aeo_score, 35);
          report.grade = report.aeo_score >= 90 ? "A" : report.aeo_score >= 75 ? "B" : report.aeo_score >= 60 ? "C" : report.aeo_score >= 40 ? "D" : "F";
          const lead = noindex
            ? "This page sends noindex to crawlers, which tells AI engines not to index it. It cannot be cited no matter how strong the schema is. Fix this first. Nothing else on this list matters until the page is indexable."
            : aiBotsFlagText(aiBotsBlocked);
          report.red_flags.unshift(lead);
          if (nofollow && !noindex) report.red_flags.splice(1, 0, "The page also sends nofollow, so crawlers will not follow its links to the rest of the site.");
        }
      } catch { /* never let the crawlability gate break the report */ }

      // ---- Who called (classified once, written to D1) ----
      // Any X-Internal-Source value is internal now, not only outreach-scan.
      const internalSource = request.headers.get("X-Internal-Source") || "";
      const ua = request.headers.get("User-Agent") || "";
      const cls = classifyRequest({ userAgent: ua, internalSource, keyed, client: body.client, sessionId });
      const rawIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
      const ipHash = rawIp ? await sha256Hex(rawIp) : "";
      const country = ((request as any).cf?.country as string | undefined) || null;
      const createdAt = nowSeconds();
      const cleanedUtm = cleanUtm(utm);

      const eventRow: EventRow = {
        type: "scan",
        session_id: sessionId,
        domain: report.domain,
        source: cls.source,
        is_internal: cls.is_internal,
        is_bot: cls.is_bot,
        ip_hash: ipHash || null,
        user_agent: cleanUa(ua),
        country,
        referrer: cleanReferrer(referrer),
        utm: cleanedUtm,
        created_at: createdAt,
      };

      // Page-originated scans get a scan_id and a stored summary, so the
      // email endpoint builds the result from OUR copy, not the browser's.
      let pageExtras: Record<string, unknown> = {};
      const isPage = cls.source === "page";
      const statements: D1PreparedStatement[] = [];
      if (env.DB) {
        try {
          if (isPage) {
            const scanId = crypto.randomUUID();
            const identity = extractIdentity(html);
            const summary: ScanSummary = {
              v: 1,
              url: targetUrl,
              domain: report.domain,
              score: report.aeo_score,
              grade: report.grade,
              schema_coverage: report.schema_coverage.map((c) => ({ type: c.type, present: c.present })),
              technical_signals: report.technical_signals.map((t) => ({ label: t.label, status: t.status })),
              red_flags: report.red_flags.slice(0, 30).map((f) => String(f).slice(0, 600)),
              crawl,
              client_side_rendered: !!report.client_side_rendered,
              jsonld_parse_errors: report.signals.jsonld_parse_errors || 0,
              schema_types: report.signals.schema_types.slice(0, 30).map((t) => String(t).slice(0, 80)),
              identity,
            };
            statements.push(scanStatement(env.DB, {
              scan_id: scanId, session_id: sessionId, url: targetUrl, domain: report.domain,
              score: report.aeo_score, grade: report.grade, summary, created_at: createdAt,
            }));
            pageExtras = {
              scan_id: scanId,
              missing_signals: missingSignals(summary).map((m) => ({ key: m.key, name: m.name })),
              identity: { category: identity.category, town: identity.town },
            };
          }
          statements.push(eventStatement(env.DB, eventRow));
          await env.DB.batch(statements);
        } catch (e) {
          // The scan result still goes back to the visitor. Without a stored
          // row, send-report falls back to the whitelisted client copy.
          console.error("free-check-d1-scan-failed", e instanceof Error ? e.message : String(e));
          if (pageExtras.scan_id) delete pageExtras.scan_id;
        }
      }
      if (isPage && !pageExtras.missing_signals) {
        // D1 unbound or failed: still give the page its count and prefill.
        const identity = extractIdentity(html);
        pageExtras.missing_signals = missingSignals({
          schema_coverage: report.schema_coverage, technical_signals: report.technical_signals, crawl,
          client_side_rendered: !!report.client_side_rendered, jsonld_parse_errors: report.signals.jsonld_parse_errors || 0,
        }).map((m) => ({ key: m.key, name: m.name }));
        pageExtras.identity = { category: identity.category, town: identity.town };
      }

      // Internal-source filter (KV, unchanged): the outreach pipeline's scans
      // stay out of the legacy KV event log. They are now counted in D1 with
      // source "outreach-scan" and excluded from the people counts there.
      if (internalSource === "outreach-scan") {
        return Response.json({ ...report, ...pageExtras }, { headers: corsHeaders });
      }

      // Legacy KV scan log, kept unchanged for now so the old readers keep
      // working. D1 (above) is the record the briefing reads.
      //
      // Write-time dedup: when a visitor scans on the marketing homepage
      // demo and then clicks "See full report" -> check.neverranked.com
      // auto-runs the same scan a second time with ?url=. Same person,
      // same domain, two events. We use a short-TTL dedup key
      // (dedup:scan:<domain>:<ip_hash>, TTL 60s) and skip the second
      // event if seen recently.
      try {
        const dedupKey = `dedup:scan:${report.domain}:${ipHash}`;
        const recent = ipHash ? await env.LEADS.get(dedupKey) : null;
        if (!recent) {
          const scanKey = `event:scan:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
          const eventData: Record<string, unknown> = {
            type: "free_scan",
            domain: report.domain,
            score: report.aeo_score,
            grade: report.grade,
            ts: new Date().toISOString(),
            ip_hash: ipHash,
            ua,
            source: keyed ? "montaic" : "direct",
          };
          if (referrer) eventData.referrer = referrer;
          if (Object.keys(utm).length > 0) eventData.utm = utm;
          await env.LEADS.put(scanKey, JSON.stringify(eventData), { expirationTtl: 90 * 24 * 60 * 60 });
          // Set dedup marker (only if we have an ip_hash to scope it)
          if (ipHash) {
            await env.LEADS.put(dedupKey, "1", { expirationTtl: 60 });
          }
        }
      } catch (e) {
        console.error("scan-log-failed", e instanceof Error ? e.message : String(e));
      }

      return Response.json({ ...report, ...pageExtras }, { headers: corsHeaders });
    }

    // ── /api/gate-impression: a page session SAW the email ask ──
    // Called once per session by the page JS. The denominator of the capture
    // rate. Written to D1 (classified) and, for continuity, to KV.
    if (url.pathname === "/api/gate-impression" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      if (isRateLimited(ip)) {
        return Response.json({ ok: false }, { status: 429, headers: corsHeaders });
      }
      let imp: { session_id?: string; client?: string; scan_id?: string; domain?: string; score?: number; consent_version?: string };
      try { imp = await request.json(); } catch {
        return Response.json({ ok: false }, { status: 400, headers: corsHeaders });
      }
      const sessionId = cleanSessionId(imp.session_id);
      const domain = typeof imp.domain === "string" ? imp.domain.toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 253) || null : null;
      const consentVersion = consentFor(imp.consent_version).version;
      try {
        const key = `event:gate_impression:${consentVersion}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        await env.LEADS.put(key, JSON.stringify({
          type: "gate_impression",
          consent_version: consentVersion,
          domain,
          score: typeof imp.score === "number" ? imp.score : null,
          ts: new Date().toISOString(),
        }), { expirationTtl: 90 * 24 * 60 * 60 });
      } catch (e) {
        console.error("gate-impression-log-failed", e instanceof Error ? e.message : String(e));
      }
      if (env.DB) {
        try {
          const ua = request.headers.get("User-Agent") || "";
          const cls = classifyRequest({
            userAgent: ua,
            internalSource: request.headers.get("X-Internal-Source") || "",
            keyed: false,
            client: imp.client,
            sessionId,
          });
          const rawIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
          await eventStatement(env.DB, {
            type: "gate_impression",
            session_id: sessionId,
            domain,
            source: cls.source,
            is_internal: cls.is_internal,
            is_bot: cls.is_bot,
            ip_hash: rawIp ? await sha256Hex(rawIp) : null,
            user_agent: cleanUa(ua),
            country: ((request as any).cf?.country as string | undefined) || null,
            referrer: null,
            utm: {},
            created_at: nowSeconds(),
          }).run();
        } catch (e) {
          console.error("gate-impression-d1-failed", e instanceof Error ? e.message : String(e));
        }
      }
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    // /api/ab-stats was removed 2026-10-07 with both A/B tests. Neither arm
    // reached the code's own 50-impression threshold, so there is no winner
    // to read, and the gate now has one version.

    // ── /api/send-report: capture the email, store it durably, send the result ──
    //
    // Order matters, and every step after the first is allowed to fail
    // without losing the capture:
    //   1. free_check_leads row FIRST, with the consent words looked up here
    //      from consent_version (never taken from the browser)
    //   2. lead:<email> and event:capture:* in KV with NO expiry. If step 1
    //      failed, also lead_d1_failed:<ts> so a reconcile can recover it
    //   3. admin_inbox item + capture event (D1)
    //   4. the result email, built from OUR stored scan (free_check_scans by
    //      scan_id), falling back to a whitelisted client copy only when no
    //      stored row exists. Resend's answer is written back to the lead row
    //   5. an immediate alert to LEAD_ALERT_TO for every non-internal capture
    if (url.pathname === "/api/send-report" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      if (isRateLimited(ip)) {
        return Response.json({ error: "Rate limit exceeded." }, { status: 429, headers: corsHeaders });
      }

      let body: {
        email?: unknown; report?: unknown; scan_id?: unknown; session_id?: unknown; client?: unknown;
        consent_version?: unknown; referrer?: unknown; utm?: unknown;
      };
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid request." }, { status: 400, headers: corsHeaders });
      }

      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      // Server-side check mirrors client validation -- belt and suspenders.
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return Response.json({ error: "Valid email and report required." }, { status: 400, headers: corsHeaders });
      }

      const scanId = cleanScanId(body.scan_id);
      const sessionId = cleanSessionId(body.session_id);
      let stored: Awaited<ReturnType<typeof loadScan>> = null;
      if (scanId && env.DB) {
        try { stored = await loadScan(env.DB, scanId); }
        catch (e) { console.error("free-check-load-scan-failed", e instanceof Error ? e.message : String(e)); }
      }
      const summary: ScanSummary | null = stored ? stored.summary : summaryFromClient(body.report);
      if (!summary) {
        return Response.json({ error: "Valid email and report required." }, { status: 400, headers: corsHeaders });
      }
      const scanUrl = stored ? stored.url : summary.url;

      const consent = consentFor(body.consent_version);
      const ua = request.headers.get("User-Agent") || "";
      const cls = classifyRequest({
        userAgent: ua,
        internalSource: request.headers.get("X-Internal-Source") || "",
        keyed: false,
        client: typeof body.client === "string" ? body.client : null,
        sessionId,
      });
      const internal = internalEmail(email, env.INTERNAL_EMAILS);
      const isInternal = internal.internal || cls.is_internal === 1;
      const internalReason = internal.reason ?? (cls.is_internal ? `source:${cls.source}` : null);
      const rawIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
      const ipHash = rawIp ? await sha256Hex(rawIp) : null;
      const country = ((request as any).cf?.country as string | undefined) || null;
      const utm = cleanUtm(body.utm);
      const referrer = cleanReferrer(body.referrer);
      const createdAt = nowSeconds();
      const nowIso = new Date().toISOString();

      // A person who unsubscribed earlier still gets the result they just
      // asked for (that is transactional), but the new row carries the flag.
      let priorUnsub: number | null = null;
      try {
        if (await env.LEADS.get(`unsubscribed:${email}`)) priorUnsub = createdAt;
      } catch { /* treat as not unsubscribed */ }

      // 1. D1 lead row first.
      let leadId: number | null = null;
      let d1Error: string | null = null;
      if (env.DB) {
        try {
          leadId = await insertLead(env.DB, {
            email,
            scan_id: stored ? scanId : null,
            url: scanUrl,
            domain: summary.domain,
            business_name: summary.identity?.name ?? null,
            score: summary.score,
            grade: summary.grade,
            consent_version: consent.version,
            consent_text: consent.text,
            followup_ok: consent.followup_ok,
            source: "check_page",
            session_id: sessionId,
            referrer,
            utm,
            ip_hash: ipHash,
            user_agent: cleanUa(ua),
            country,
            is_internal: isInternal ? 1 : 0,
            internal_reason: internalReason,
            unsubscribed_at: priorUnsub,
            created_at: createdAt,
          });
        } catch (e) {
          d1Error = e instanceof Error ? e.message : String(e);
          console.error("free-check-lead-d1-failed", d1Error);
        }
      } else {
        d1Error = "DB binding missing";
      }

      // 2. KV, with no expiry. The capture can never be lost to a D1 hiccup.
      try {
        const leadKey = `lead:${email}`;
        const existing = await env.LEADS.get(leadKey);
        let leadData: any = { email, scans: [], created: nowIso };
        if (existing) { try { leadData = JSON.parse(existing); } catch { /* keep the fresh record */ } }
        if (!Array.isArray(leadData.scans)) leadData.scans = [];
        leadData.scans.push({ domain: summary.domain, score: summary.score, grade: summary.grade, date: nowIso });
        leadData.lastScan = nowIso;
        leadData.consent_version = consent.version;
        await env.LEADS.put(leadKey, JSON.stringify(leadData));

        const captureKey = `event:capture:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        await env.LEADS.put(captureKey, JSON.stringify({
          type: "email_captured",
          domain: summary.domain,
          score: summary.score,
          consent_version: consent.version,
          d1_lead_id: leadId,
          ts: nowIso,
        }));

        if (leadId === null) {
          const failKey = `lead_d1_failed:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
          await env.LEADS.put(failKey, JSON.stringify({
            error: d1Error,
            email, scan_id: scanId, session_id: sessionId, url: scanUrl, domain: summary.domain,
            score: summary.score, grade: summary.grade, consent_version: consent.version,
            followup_ok: consent.followup_ok, referrer, utm, ip_hash: ipHash, user_agent: cleanUa(ua), country,
            is_internal: isInternal ? 1 : 0, internal_reason: internalReason, created_at: createdAt,
          }));
        }
      } catch (e) {
        console.error("free-check-lead-kv-failed", e instanceof Error ? e.message : String(e));
      }

      // 3. Admin inbox item + capture event.
      if (env.DB) {
        try {
          const statements: D1PreparedStatement[] = [
            eventStatement(env.DB, {
              type: "capture",
              session_id: sessionId,
              domain: summary.domain,
              source: cls.source,
              is_internal: isInternal ? 1 : 0,
              is_bot: cls.is_bot,
              ip_hash: ipHash,
              user_agent: cleanUa(ua),
              country,
              referrer,
              utm,
              created_at: createdAt,
            }),
          ];
          if (leadId !== null) {
            const attribution = [utm.utm_source, utm.utm_campaign, utm.utm_content].filter(Boolean).join(" / ") || (referrer ? `referrer ${referrer}` : "direct");
            statements.push(inboxStatement(env.DB, {
              leadId,
              title: isInternal ? `Internal test capture: ${summary.domain}` : `New free-check lead: ${summary.domain}`,
              body: [
                `Email: ${email}`,
                `Score: ${summary.score}/100 (${summary.grade})`,
                `Attribution: ${attribution}`,
                `Consent: ${consent.version}${consent.followup_ok ? " (follow-up allowed)" : " (no follow-up)"}`,
                isInternal ? `Internal: ${internalReason}` : "",
              ].filter(Boolean).join("\n"),
              urgency: isInternal ? "low" : "high",
              now: createdAt,
            }));
          }
          await env.DB.batch(statements);
        } catch (e) {
          console.error("free-check-inbox-or-event-failed", e instanceof Error ? e.message : String(e));
        }
      }

      // 4. The result email, with a working unsubscribe link (the consent
      //    line promises one in every email).
      let unsubscribeUrl: string | null = null;
      try {
        const token = crypto.randomUUID();
        await env.LEADS.put(`unsub:${token}`, JSON.stringify({ email, lead_id: leadId, created: nowIso }));
        unsubscribeUrl = `${url.origin}/unsubscribe?t=${token}`;
      } catch (e) {
        console.error("free-check-unsub-token-failed", e instanceof Error ? e.message : String(e));
      }

      let reportStatus = "not_sent: RESEND_API_KEY unset";
      let reportId: string | null = null;
      if (env.RESEND_API_KEY) {
        const mail = buildReportEmail(summary, { unsubscribeUrl });
        const payload: Record<string, unknown> = {
          from: "NeverRanked <reports@neverranked.com>",
          to: [email],
          reply_to: "hello@neverranked.com",
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        };
        if (unsubscribeUrl) {
          payload.headers = {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          };
        }
        const result = await sendResend(env, payload);
        await recordDelivery(env, "report", email, result);
        reportStatus = result.ok ? "sent" : `failed: HTTP ${result.status} ${result.error ?? ""}`.trim();
        reportId = result.id;
        if (!result.ok) {
          console.error(`Report email failed for lead ${leadId ?? "(kv only)"}: status=${result.status} error=${result.error}`);
        }
      }
      if (leadId !== null && env.DB) {
        try { await recordReportResult(env.DB, leadId, reportStatus, reportId); }
        catch (e) { console.error("free-check-report-status-failed", e instanceof Error ? e.message : String(e)); }
      }

      // 5. Immediate alert to Lance for a real lead (decision 12). The address
      //    is a Worker secret, never in this public repo. Unset = skip.
      if (!isInternal && env.LEAD_ALERT_TO && env.RESEND_API_KEY) {
        const to = env.LEAD_ALERT_TO.split(",").map((s) => s.trim()).filter(Boolean);
        if (to.length) {
          const alert = buildLeadAlert({
            leadId,
            email,
            domain: summary.domain,
            score: summary.score,
            grade: summary.grade,
            createdAtMs: createdAt * 1000,
            utm,
            referrer,
            consentVersion: consent.version,
            followupOk: consent.followup_ok === 1,
            country,
            reportEmailStatus: reportStatus,
          });
          ctx.waitUntil(
            sendResend(env, { from: "NeverRanked <reports@neverranked.com>", to, subject: alert.subject, text: alert.text })
              .then((r) => { if (!r.ok) console.error(`lead-alert failed: status=${r.status} error=${r.error}`); }),
          );
        }
      }

      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    // ── /unsubscribe: the link in every result email ──
    // GET shows a confirm button (mail scanners prefetch links, so a GET must
    // never unsubscribe on its own). POST does it, which is also what an
    // RFC 8058 one-click List-Unsubscribe-Post sends.
    if (url.pathname === "/unsubscribe" && (request.method === "GET" || request.method === "POST")) {
      const token = (url.searchParams.get("t") || "").toLowerCase();
      const page = (msg: string, form: boolean, status = 200) => new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(UNSUB_COPY.title)} | Never Ranked</title></head>` +
        `<body style="margin:0;background:#121212;color:#fbf8ef;font-family:Georgia,serif"><main style="max-width:520px;margin:0 auto;padding:64px 20px">` +
        `<p style="font-style:italic;color:#e8c767;font-size:20px;margin:0 0 24px">Never Ranked</p>` +
        `<p style="font-family:'Courier New',monospace;font-size:14px;line-height:1.7">${escHtml(msg)}</p>` +
        (form ? `<form method="post" action="/unsubscribe?t=${escHtml(token)}"><button type="submit" style="margin-top:12px;padding:12px 24px;background:#e8c767;color:#121212;border:0;border-radius:2px;font-family:'Courier New',monospace;font-size:12px;letter-spacing:1px;text-transform:uppercase;cursor:pointer">${escHtml(UNSUB_COPY.button)}</button></form>` : "") +
        `</main></body></html>`,
        { status, headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } },
      );
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token)) return page(UNSUB_COPY.invalid, false, 400);
      let rec: { email?: string } | null = null;
      try { const raw = await env.LEADS.get(`unsub:${token}`); rec = raw ? JSON.parse(raw) : null; } catch { rec = null; }
      if (!rec || typeof rec.email !== "string") return page(UNSUB_COPY.invalid, false, 404);
      if (request.method === "GET") return page(UNSUB_COPY.ask, true);
      const at = nowSeconds();
      try {
        await env.LEADS.put(`unsubscribed:${rec.email}`, JSON.stringify({ at: new Date(at * 1000).toISOString(), token }));
      } catch (e) { console.error("unsubscribe-kv-failed", e instanceof Error ? e.message : String(e)); }
      if (env.DB) {
        try { await markUnsubscribed(env.DB, rec.email, at); }
        catch (e) { console.error("unsubscribe-d1-failed", e instanceof Error ? e.message : String(e)); }
      }
      return page(UNSUB_COPY.done, false);
    }

    // Admin: recent audit-tool events (scans + captures) for the
    // outreach dashboard's audit-tool activity feed. Returns reverse
    // chronological with sensible per-event payload (domain, score,
    // grade, ts, captured-flag, referrer/utm summary).
    //
    // Auth: ?key=ADMIN_SECRET (matches the rest of the /api/admin/* family)
    // Query: ?limit=<N> (default 30, max 200)
    //
    // Shape: { events: [{ type, domain, score, grade, ts, captured?,
    //                     referrer?, utm?, variant? }, ...] }
    if (url.pathname === "/api/admin/recent-events" && request.method === "GET") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
      }
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 200);

      try {
        // Pull both scans and captures, merge, sort by ts desc.
        const events: any[] = [];

        // KV keys are sorted lexicographically. Our keys embed Date.now()
        // in millis, so the highest-numbered keys are most recent. We
        // paginate to get ALL keys (single list calls cap at oldest 1000
        // past the namespace size); then sort in-memory for newest-first.
        const scanAllKeys = await listAllKvKeys(env.LEADS, "event:scan:");
        const captureAllKeys = await listAllKvKeys(env.LEADS, "event:capture:");
        // Slice to a generous tail so per-item KV.get calls stay bounded.
        const scanList = { keys: scanAllKeys.slice(-500) };
        const captureList = { keys: captureAllKeys.slice(-200) };

        // Captured emails by domain so the scan event can be enriched
        // with a "captured" flag (visible in the dashboard feed)
        const capturedDomains = new Set<string>();
        for (const k of captureList.keys) {
          try {
            const raw = await env.LEADS.get(k.name);
            if (!raw) continue;
            const c = JSON.parse(raw);
            if (c.domain) capturedDomains.add(String(c.domain).toLowerCase());
          } catch {}
        }

        for (const k of scanList.keys) {
          try {
            const raw = await env.LEADS.get(k.name);
            if (!raw) continue;
            const e = JSON.parse(raw);
            events.push({
              type: e.type || "free_scan",
              domain: e.domain,
              score: e.score,
              grade: e.grade,
              ts: e.ts,
              referrer: e.referrer || null,
              utm: e.utm || null,
              captured: e.domain ? capturedDomains.has(String(e.domain).toLowerCase()) : false,
            });
          } catch {}
        }

        events.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
        return Response.json({
          as_of: new Date().toISOString(),
          events: events.slice(0, limit),
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({
          error: e instanceof Error ? e.message : "scan failed",
        }, { status: 500, headers: corsHeaders });
      }
    }

    // Admin: referrer attribution breakdown (last 500 scan events)
    if (url.pathname === "/api/admin/referrers" && request.method === "GET") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
      }

      try {
        // Paginate to find newest scans across the full namespace.
        const allScanKeys = await listAllKvKeys(env.LEADS, "event:scan:");
        const list = { keys: allScanKeys.slice(-500) };
        const referrerCounts: Record<string, number> = {};
        const utmCounts: Record<string, number> = {};
        let total = 0;

        for (const key of list.keys) {
          const raw = await env.LEADS.get(key.name);
          if (!raw) continue;
          total++;
          try {
            const evt = JSON.parse(raw);
            const ref = evt.referrer || "(direct)";
            // Normalize referrer to hostname
            let refHost = "(direct)";
            if (ref && ref !== "(direct)") {
              try { refHost = new URL(ref).hostname; } catch { refHost = ref; }
            }
            referrerCounts[refHost] = (referrerCounts[refHost] || 0) + 1;

            if (evt.utm?.utm_source) {
              const src = `${evt.utm.utm_source}/${evt.utm.utm_medium || "none"}`;
              utmCounts[src] = (utmCounts[src] || 0) + 1;
            }
          } catch {}
        }

        // Sort descending
        const referrers = Object.entries(referrerCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([source, count]) => ({ source, count, pct: Math.round((count / total) * 100) }));
        const utmSources = Object.entries(utmCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([source, count]) => ({ source, count }));

        return Response.json({ total, referrers, utmSources }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: "Failed to read events" }, { status: 500, headers: corsHeaders });
      }
    }

    // Admin: one-time cleanup of historical pipeline-scan pollution.
    // Before the X-Internal-Source filter on POST /api/check was deployed
    // on 2026-05-13, the outreach pipeline's AEO scans were being logged
    // to KV as if they were real visitor scans. This inflated the
    // free-check activity dashboard counts and polluted "Where visitors
    // came from" attribution. Filter is now live going forward; this
    // endpoint removes the pre-deploy pollution.
    //
    // Detection (a scan event is pipeline pollution if EITHER):
    //   1. ua contains "NeverRanked-Outreach" -- exclusive to the
    //      outreach project's aeo-scan.js client. Strongest signal.
    //   2. domain starts with "www." AND no utm AND no referrer --
    //      fallback for older pipeline calls that may not have had the
    //      UA set yet. Pipeline calls https://www.xxx.com (full URL with
    //      protocol), real recipient clicks canonicalize to xxx.com.
    //
    // Default mode is DRY-RUN: walk KV, identify polluted keys, return
    // counts + sample. No deletion. To actually delete add ?confirm=yes.
    //
    // Safe to leave deployed: admin-secret gated, dry-run default,
    // idempotent (re-running after a real-run is a no-op).
    if (url.pathname === "/api/admin/cleanup-pipeline-scans" && request.method === "POST") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
      }
      const confirm = url.searchParams.get("confirm") === "yes";
      const start = Math.max(0, parseInt(url.searchParams.get("start") || "0", 10) || 0);

      // Cloudflare Workers cap at 1000 subrequests per invocation. Each
      // KV.get() and KV.delete() counts as one. Process at most
      // BATCH_KEYS keys per call (each requires a get; deletes only run
      // for matches so are usually a smaller second pass). Returns a
      // cursor so the caller can loop until done.
      const BATCH_KEYS = 400;

      try {
        const allScanKeys = await listAllKvKeys(env.LEADS, "event:scan:");
        const totalKeys = allScanKeys.length;
        const end = Math.min(start + BATCH_KEYS, totalKeys);
        const chunk = allScanKeys.slice(start, end);

        const polluted: { key: string; domain: string; ts: string; reason: string }[] = [];
        let scanned = 0;

        for (const key of chunk) {
          const raw = await env.LEADS.get(key.name);
          if (!raw) continue;
          scanned++;
          let evt: any;
          try { evt = JSON.parse(raw); } catch { continue; }
          if (evt.type !== "free_scan") continue;

          const ua = String(evt.ua || "");
          const domain = String(evt.domain || "");
          const hasUtm = evt.utm && (evt.utm.utm_source || evt.utm.source);
          const hasReferrer = !!evt.referrer;

          let reason = "";
          if (ua.includes("NeverRanked-Outreach")) {
            reason = "ua=NeverRanked-Outreach";
          } else if (domain.startsWith("www.") && !hasUtm && !hasReferrer) {
            reason = "www-prefix+no-utm+no-referrer";
          }
          if (reason) {
            polluted.push({ key: key.name, domain, ts: evt.ts || "", reason });
          }
        }

        let deleted = 0;
        if (confirm) {
          for (const p of polluted) {
            await env.LEADS.delete(p.key);
            deleted++;
          }
        }

        const moreRemaining = end < totalKeys;
        const baseUrl = `${url.origin}/api/admin/cleanup-pipeline-scans?key=${secret}${confirm ? "&confirm=yes" : ""}&start=${end}`;

        return Response.json({
          mode: confirm ? "real-run" : "dry-run",
          batch_start: start,
          batch_end: end,
          total_keys: totalKeys,
          scanned,
          identified: polluted.length,
          deleted,
          sample: polluted.slice(0, 5).map(p => ({ domain: p.domain, ts: p.ts, reason: p.reason })),
          more_remaining: moreRemaining,
          next_call: moreRemaining ? baseUrl : null,
          hint: confirm
            ? (moreRemaining ? "Batch deleted. Call next_call to continue." : "All batches processed.")
            : (moreRemaining ? "Dry-run batch done. Add ?confirm=yes to delete, then walk via next_call." : "Dry-run done. Add ?confirm=yes for real-run."),
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({
          error: "Cleanup failed",
          message: e instanceof Error ? e.message : String(e),
        }, { status: 500, headers: corsHeaders });
      }
    }

    // Admin: force-fire a drip email immediately (bypass age check)
    // Use to verify the delivery pipeline without waiting 3-7 days.
    if (url.pathname === "/api/admin/drip-force" && request.method === "POST") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
      }
      // The drip is off (decision 2). Forcing a send would bypass the flag.
      if (env.DRIP_ENABLED !== "1") {
        return Response.json({ error: "Drip is disabled (DRIP_ENABLED is not \"1\")." }, { status: 409, headers: corsHeaders });
      }
      const email = url.searchParams.get("email");
      const day = url.searchParams.get("day");
      if (!email || (day !== "3" && day !== "7")) {
        return Response.json({ error: "Required: ?email=...&day=3|7" }, { status: 400, headers: corsHeaders });
      }
      const raw = await env.LEADS.get(`lead:${email}`);
      if (!raw) {
        return Response.json({ error: `No lead found for ${email}` }, { status: 404, headers: corsHeaders });
      }
      const lead: LeadData = JSON.parse(raw);
      const latestScan = lead.scans[lead.scans.length - 1];
      if (!latestScan) {
        return Response.json({ error: "Lead has no scans" }, { status: 400, headers: corsHeaders });
      }
      const isDay3 = day === "3";
      const result = await sendResend(env, {
        from: "NeverRanked <reports@neverranked.com>",
        to: [lead.email],
        subject: isDay3 ? dripDay3Subject(latestScan) : dripDay7Subject(latestScan),
        html: isDay3 ? buildDripDay3Email(latestScan) : buildDripDay7Email(latestScan),
      });
      await recordDelivery(env, isDay3 ? "drip_day3" : "drip_day7", lead.email, result);
      if (result.ok) {
        if (isDay3) lead.drip_day3_sent = true; else lead.drip_day7_sent = true;
        await env.LEADS.put(`lead:${email}`, JSON.stringify(lead));
      }
      return Response.json({ forced: true, day, email, result }, { headers: corsHeaders });
    }

    // Admin: drip + report email delivery truth-check
    if (url.pathname === "/api/admin/drip-status" && request.method === "GET") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
      }

      try {
        // Paginate so the leads list reflects ALL leads, not the oldest 1000.
        const allLeadKeys = await listAllKvKeys(env.LEADS, "lead:");
        const leadsList = { keys: allLeadKeys };
        const leadRaws = await Promise.all(leadsList.keys.map((k) => env.LEADS.get(k.name)));
        const leads = leadRaws
          .map((r) => { try { return r ? JSON.parse(r) as LeadData : null; } catch { return null; } })
          .filter((l): l is LeadData => !!l);

        const deliveryReads = await Promise.all(
          leads.flatMap((l) => [
            env.LEADS.get(`drip_delivery:${l.email}:day3`),
            env.LEADS.get(`drip_delivery:${l.email}:day7`),
            env.LEADS.get(`report_delivery:${l.email}`),
          ])
        );

        const rows = leads.map((lead, i) => {
          const day3Raw = deliveryReads[i * 3];
          const day7Raw = deliveryReads[i * 3 + 1];
          const reportRaw = deliveryReads[i * 3 + 2];
          const parse = (raw: string | null) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
          return {
            email: lead.email,
            created: lead.created,
            age_days: daysSince(lead.created),
            flag_drip_day3_sent: !!lead.drip_day3_sent,
            flag_drip_day7_sent: !!lead.drip_day7_sent,
            day3_delivery: parse(day3Raw) || (lead.drip_day3_sent ? { status: "unknown", note: "sent before delivery tracking added 2026-04-24" } : null),
            day7_delivery: parse(day7Raw) || (lead.drip_day7_sent ? { status: "unknown", note: "sent before delivery tracking added 2026-04-24" } : null),
            report_delivery: parse(reportRaw),
          };
        });

        return Response.json({ count: rows.length, leads: rows }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: corsHeaders });
      }
    }

    // Serve HTML UI -- inject the latest benchmark so client-side JS
    // can render real percentile / grade-distribution comparisons
    // instead of hardcoded fake numbers. Falls back to defaults if
    // the dashboard cron hasn't computed them yet.
    let benchmarkJson = "null";
    try {
      const raw = await env.LEADS.get("benchmark:aeo_score");
      if (raw) benchmarkJson = raw;
    } catch (e) {
      console.log(`[check] benchmark KV read failed: ${e}`);
    }
    const benchmarkScript = `<script>window.NR_BENCHMARK = ${benchmarkJson};</script>`;
    const html = HTML_PAGE.replace("</head>", `${benchmarkScript}</head>`);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        // Shorter cache so freshly-computed benchmarks reach users within
        // a few minutes instead of an hour.
        "Cache-Control": "public, max-age=300",
        ...corsHeaders,
      },
    });
  },

  // ---------- Drip sequence cron (daily at 14:00 UTC) ----------
  // OFF unless DRIP_ENABLED is exactly "1" (decision 2, 2026-10-07). The
  // drip sent two commercial emails per lead with no approval and no
  // unsubscribe link. Follow-ups belong to the supervised outreach lane.

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (env.DRIP_ENABLED !== "1") return;
    ctx.waitUntil(runDripSequence(env));
  },
};
