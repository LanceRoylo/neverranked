/**
 * NeverRanked Schema & AEO Health Check — Cloudflare Worker
 *
 * Serves the single-page UI at root and exposes POST /api/check
 * that fetches a target URL, extracts technical signals, and returns
 * a graded JSON report.
 */

export interface Env {
  LEADS: KVNamespace;
  RESEND_API_KEY?: string;
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

// ---------- Shared analysis logic (packages/aeo-analyzer) ----------

import { buildReport } from "../../../packages/aeo-analyzer/src";

// ---------- HTML UI ----------

const HTML_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#121212">
<title>Schema & AEO Health Check — Never Ranked</title>
<meta name="description" content="Free instant graded report on your website's schema coverage, technical SEO signals, and AEO readiness. No signup required.">
<link rel="canonical" href="https://check.neverranked.com/">
<meta name="robots" content="index, follow">
<meta property="og:title" content="Schema & AEO Health Check — Never Ranked">
<meta property="og:description" content="Enter your URL. Get an instant grade on schema coverage, technical signals, and AEO readiness. Free. No signup.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://check.neverranked.com/">
<meta property="og:site_name" content="Never Ranked">
<meta property="og:image" content="https://neverranked.com/images/check-og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Schema & AEO Health Check — Never Ranked">
<meta name="twitter:description" content="Free instant AEO readiness report for any URL.">
<meta name="twitter:image" content="https://neverranked.com/images/check-og.png">
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
      "name": "Schema & AEO Health Check",
      "applicationCategory": "WebApplication",
      "operatingSystem": "Any",
      "url": "https://check.neverranked.com",
      "description": "Free instant graded report on your website's schema coverage, technical SEO signals, and AEO readiness.",
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
            "text": "Schema coverage (JSON-LD structured data), technical SEO signals (title, meta description, canonical, OG tags, heading structure), and AEO (Answer Engine Optimization) readiness for AI search engines."
          }
        },
        {
          "@type": "Question",
          "name": "What is AEO?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Answer Engine Optimization — making your site citable by AI engines like ChatGPT, Perplexity, and Google AI Overviews. It goes beyond traditional SEO to optimize for how AI models select and cite sources."
          }
        },
        {
          "@type": "Question",
          "name": "Is this tool free?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, completely free with no signup required. Enter any URL and get an instant graded report."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between this and the full audit?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "This is a surface scan of one page. The full $500 audit covers AI citations across ChatGPT, Perplexity, and Gemini, competitor teardown, keyword gap analysis, and produces a 90-day roadmap with six deliverables."
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
  --text-faint:rgba(251,248,239,.68);
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
::selection{background:var(--gold);color:var(--bg)}

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
  background:transparent;
  border:1px solid var(--gold);
  color:var(--gold);
  padding:14px 28px;
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.18em;
  font-size:12px;
  font-weight:500;
  border-radius:4px;
  transition:background .35s var(--ease),color .35s var(--ease);
  white-space:nowrap;
}
.input-area button:hover{background:var(--gold);color:var(--bg)}
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
.grade-circle{
  display:inline-flex;
  align-items:center;justify-content:center;
  width:140px;height:140px;
  border-radius:50%;
  border:2px solid var(--gold);
  margin-bottom:16px;
  position:relative;
}
.grade-circle .letter{
  font-family:var(--serif);
  font-size:72px;
  font-weight:400;
  color:var(--gold);
}
.grade-circle.grade-c .letter,.grade-circle.grade-d .letter,.grade-circle.grade-f .letter{
  color:var(--text-faint);
}
.grade-circle.grade-c,.grade-circle.grade-d,.grade-circle.grade-f{
  border-color:var(--text-faint);
}
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
.footer a{color:var(--gold-dim);transition:color .3s}
.footer a:hover{color:var(--gold)}
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
  cursor:pointer;transition:opacity .2s;white-space:nowrap;
}
.email-gate-form button:hover{opacity:.88}
.email-gate-form button:disabled{opacity:.4;cursor:not-allowed}
.email-gate-privacy{
  font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:8px;
}
@media (max-width:640px){
  .email-gate-head{flex-direction:column;gap:4px}
  .email-gate-count{font-size:40px}
  .email-gate-form input{width:100%}
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
  transition:opacity .3s var(--ease);
}
.btn-primary:hover{opacity:.85}
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
  .comp-bar-label{min-width:70px;font-size:9px}
  .dash-mock-row{flex-direction:column;gap:8px}
  .qw-item{flex-wrap:wrap}
  .social-proof{flex-direction:column;align-items:center;gap:8px}
}
</style>

<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'YOUR_PIXEL_ID');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1"/></noscript>

<!-- LinkedIn Insight Tag -->
<script type="text/javascript">
_linkedin_partner_id="YOUR_PARTNER_ID";
window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script>
<script type="text/javascript">
(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}
var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");
b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";
s.parentNode.insertBefore(b,s);})(window.lintrk);
</script>
<noscript><img height="1" width="1" style="display:none" alt="" src="https://px.ads.linkedin.com/collect/?pid=YOUR_PARTNER_ID&fmt=gif"/></noscript>

</head>
<body>
<div class="grain"></div>

<nav class="nav">
  <a href="https://neverranked.com" class="mark">N</a>
  <span class="tool-name">Schema & AEO (Answer Engine Optimization) Health Check</span>
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
        This AEO audit was prepared by <strong id="agency-banner-name" style="color:var(--gold);font-weight:500"></strong>.
        <span style="color:var(--text-faint);display:block;font-size:11px;margin-top:4px">They work with Never Ranked to run and interpret this scan for their clients.</span>
      </div>
      <a id="agency-banner-cta" href="#" style="white-space:nowrap;padding:10px 18px;background:var(--gold);color:#080808;font-family:var(--label);text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:500;text-decoration:none;border-radius:2px">Book a call &rarr;</a>
    </div>
  </div>

  <section class="hero">
    <h1>How ready is your site<br>for <em>AI search</em>?</h1>
    <p class="sub">Enter your URL. Get an instant grade on schema coverage, technical signals, and AEO readiness. Free. No signup.</p>
    <div class="input-area">
      <input type="url" id="url-input" placeholder="https://example.com" autocomplete="url" spellcheck="false">
      <button id="run-btn" type="button">Run check</button>
    </div>
    <!-- Trust + price-discovery in the hero. Was buried below the fold; now visible
         the moment users decide whether to engage. -->
    <div class="hero-trust" style="margin-top:18px;display:flex;gap:18px;flex-wrap:wrap;justify-content:center;align-items:center;font-family:var(--mono);font-size:11px;color:var(--text-faint)">
      <span><strong style="color:var(--text)">2,400+</strong> sites scanned</span>
      <span style="opacity:.4">&middot;</span>
      <span><strong style="color:var(--text)">4</strong> AI engines tracked</span>
      <span style="opacity:.4">&middot;</span>
      <a href="https://neverranked.com/#pricing" id="hero-pricing-link" style="color:var(--gold);text-decoration:none;border-bottom:1px solid var(--gold-dim);padding-bottom:1px">See pricing &rarr;</a>
    </div>
  </section>

  <div class="loading" id="loading">
    <span class="dot"></span>
    <span class="text" id="loading-text">Analyzing...</span>
  </div>

  <div class="error-msg" id="error-msg"></div>

  <section class="results" id="results">
    <div class="grade-section" id="grade-section"></div>
    <div class="grade-insight" id="grade-insight"></div>

    <!-- Email gate: teaser + capture. Hidden once email is captured. -->
    <div class="email-gate" id="email-gate" style="display:none">
      <div class="email-gate-head">
        <div class="email-gate-count" id="email-gate-count">-</div>
        <div class="email-gate-title">more issues detected</div>
      </div>
      <div class="email-gate-teaser" id="email-gate-teaser"></div>
      <div class="email-gate-body">
        <p>See every schema gap, technical signal, and priority fix. Delivered free to your inbox so you can share it with your team.</p>
        <div class="email-gate-form">
          <input type="email" id="gate-email-input" placeholder="you@company.com" autocomplete="email">
          <button type="button" id="gate-email-btn">Unlock full report</button>
        </div>
        <div class="email-gate-privacy">We email you the full report. No spam. Unsubscribe anytime.</div>
      </div>
    </div>

    <!-- Gated details: hidden until email captured -->
    <div id="gated-details" style="display:none">

    <div class="section-label"><span class="num">01</span> Schema Coverage <span class="rule"></span></div>
    <div class="schema-grid" id="schema-grid"></div>

    <div class="section-label"><span class="num">02</span> Technical Signals <span class="rule"></span></div>
    <div class="tech-list" id="tech-list"></div>

    <div class="section-label" id="flags-label" style="display:none"><span class="num">03</span> Red Flags <span class="rule"></span></div>
    <div class="flags-list" id="flags-list"></div>

    <!-- Competitor teaser with grade distribution -->
    <div class="comp-teaser" id="comp-teaser">
      <div class="section-label"><span class="num">04</span> Where you fall <span class="rule"></span></div>
      <div class="comp-teaser-inner">
        <div class="comp-teaser-bars">
          <div class="comp-bar">
            <div class="comp-bar-label">You</div>
            <div class="comp-bar-track"><div class="comp-bar-fill comp-bar-you" id="comp-bar-you"></div></div>
            <div class="comp-bar-score" id="comp-score-you"></div>
          </div>
          <div class="comp-bar">
            <div class="comp-bar-label" style="color:var(--text-faint)" id="comp-bar-bench-label">AI-cited sites</div>
            <div class="comp-bar-track"><div class="comp-bar-fill" id="comp-bar-bench-fill" style="background:var(--gold-dim);width:78%;opacity:.5"></div></div>
            <div class="comp-bar-score" style="color:var(--text-faint)" id="comp-bar-bench-score">78+</div>
          </div>
        </div>
        <div class="grade-dist" id="grade-dist"></div>
        <div class="comp-teaser-text" id="comp-teaser-text"></div>
      </div>
    </div>

    <!-- Quick wins -->
    <div class="quick-wins" id="quick-wins" style="display:none">
      <div class="section-label"><span class="num">05</span> What to fix first <span class="rule"></span></div>
      <div class="quick-wins-grid" id="quick-wins-grid"></div>
      <div style="margin-top:16px;font-family:var(--mono);font-size:11px;color:var(--text-faint);line-height:1.7">
        These are the highest-impact fixes based on your scan. A full audit covers content gaps, citation analysis across ChatGPT, Perplexity, and Gemini, and produces a 90-day action plan.
      </div>
    </div>

    </div><!-- /#gated-details -->

    <!-- Dashboard preview -->
    <div class="dash-preview">
      <div class="dash-preview-label">What NeverRanked clients see <span class="rule"></span></div>
      <div class="dash-preview-frame">
        <div class="dash-preview-blur">
          <div class="dash-mock-row">
            <div class="dash-mock-kpi">
              <div class="kpi-label">AEO Score</div>
              <div class="kpi-val" id="mock-score">--</div>
              <div class="kpi-delta" style="color:#27ae60">+12 this month</div>
            </div>
            <div class="dash-mock-kpi">
              <div class="kpi-label">Citation Rate</div>
              <div class="kpi-val">34%</div>
              <div class="kpi-delta" style="color:var(--gold)">2 of 4 engines</div>
            </div>
            <div class="dash-mock-kpi">
              <div class="kpi-label">vs. Top Competitor</div>
              <div class="kpi-val">+8</div>
              <div class="kpi-delta" style="color:#27ae60">Ahead</div>
            </div>
            <div class="dash-mock-kpi">
              <div class="kpi-label">Roadmap</div>
              <div class="kpi-val">67%</div>
              <div class="kpi-delta" style="color:var(--text-faint)">Phase 1 of 3</div>
            </div>
          </div>
          <div class="dash-mock-chart" id="mock-chart"></div>
        </div>
        <div class="dash-preview-overlay">
          <h4>Your dashboard is one step away</h4>
          <p>Weekly scans. Competitor tracking. A roadmap built from your data.</p>
          <div style="display:flex;align-items:center;gap:16px;justify-content:center;flex-wrap:wrap">
            <a href="https://app.neverranked.com/checkout/signal" id="cta-preview" class="btn-primary" style="padding:12px 28px;border-radius:4px;text-decoration:none;font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:11px;font-weight:600">Start monitoring</a>
            <a href="https://app.neverranked.com/demo" style="font-family:var(--mono);font-size:11px;color:var(--gold);border-bottom:1px solid var(--gold-dim);padding-bottom:2px;text-decoration:none;transition:border-color .3s">or explore the live demo</a>
          </div>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div class="cta-section">
      <h3 id="cta-headline">This is a snapshot.<br>Your competitors are <em>moving now.</em></h3>
      <p id="cta-subtext">AI search indexes refresh weekly. Competitors add schema, publish content, climb rankings. A one-time scan tells you where you were. NeverRanked tells you where you are heading.</p>

      <div class="social-proof">
        <span><span class="sp-num">2,400+</span> sites scanned</span>
        <span><span class="sp-num">4</span> AI engines tracked</span>
        <span><span class="sp-num">Weekly</span> automated scans</span>
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

      <div class="cta-pricing" id="cta-pricing" style="display:flex;gap:16px;justify-content:center;margin:28px 0;flex-wrap:wrap">
        <div id="cta-tier-audit" style="text-align:center;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;flex:1;min-width:140px;max-width:200px">
          <div style="font-family:var(--serif);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">One-time audit</div>
          <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text)">$500</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);margin:8px 0 4px;line-height:1.5">Full AEO teardown<br>90-day roadmap</div>
          <a href="https://app.neverranked.com/checkout/audit" id="cta-audit" class="btn btn-ghost-link" style="margin-top:8px;font-size:10px;display:inline-block">Get audit</a>
        </div>
        <div id="cta-tier-signal" style="text-align:center;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--gold-dim);border-radius:4px;flex:1;min-width:140px;max-width:200px;position:relative">
          <div style="font-family:var(--serif);font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Signal</div>
          <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text)">$2,000<span style="font-size:14px;color:var(--text-faint)">/mo</span></div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);margin:8px 0 4px;line-height:1.5">Weekly scans + alerts<br>Competitor benchmarks</div>
          <a href="https://app.neverranked.com/checkout/signal" id="cta-signal" class="btn btn-primary" style="margin-top:8px;font-size:10px;display:inline-block">Start monitoring</a>
        </div>
        <div id="cta-tier-amplify" style="text-align:center;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;flex:1;min-width:140px;max-width:200px">
          <div style="font-family:var(--serif);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Amplify</div>
          <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text)">$4,500<span style="font-size:14px;color:var(--text-faint)">/mo</span></div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);margin:8px 0 4px;line-height:1.5">Full-service AEO<br>We do the work</div>
          <a href="https://app.neverranked.com/checkout/amplify" id="cta-amplify" class="btn btn-ghost-link" style="margin-top:8px;font-size:10px;display:inline-block">Go full service</a>
        </div>
      </div>

      <div class="cta-features">
        <span>Weekly scans</span>
        <span>Score tracking</span>
        <span>Competitor benchmarks</span>
        <span>Action roadmap</span>
        <span>Regression alerts</span>
        <span>Citation tracking</span>
      </div>
      <div style="text-align:center;margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:10px">
        <a href="https://app.neverranked.com/demo" style="font-family:var(--mono);font-size:11px;color:var(--gold);text-decoration:none;border-bottom:1px solid var(--gold-dim);padding-bottom:1px">See what the full dashboard looks like first</a>
        <a href="mailto:hello@neverranked.com" class="btn btn-ghost-link" style="font-size:10px">Not sure which plan? Talk to us</a>
      </div>
    </div>

    <!-- Post-capture confirmation: this used to be a SECOND email capture
         form (redundant with the gate above). Removed the duplicate form;
         this block now only carries the post-send "we got it" message and
         the email-input/btn ids the gate's JS still references. The hidden
         input + button keep the existing event wiring intact. -->
    <div class="email-capture" id="email-capture" style="display:none">
      <div class="email-capture-inner">
        <input type="email" id="email-input" placeholder="" autocomplete="email" hidden>
        <button type="button" id="email-btn" hidden>Send</button>
      </div>
      <div class="email-success" id="email-success" style="display:none">
        <span style="color:var(--gold)">Sent.</span> Check your inbox for the full report.<br>
        <span style="font-size:12px;color:var(--text-faint)">We'll follow up in 3 days with a competitor comparison and again in 7 days with a re-scan check-in.</span>
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
    // Grade
    var gradeClass = 'grade-'+data.grade.toLowerCase();
    // Show the exact URL scanned (host + path), not just the hostname. A
    // prospect scanning /products/foo vs the homepage can see why the score
    // differs when they check the same domain at two different URLs.
    var scannedDisplay = (data.url || data.domain || '')
      .replace(/^https?:\\/\\//i,'').replace(/^www\\./i,'').replace(/\\/$/,'');
    gradeSection.innerHTML=
      '<div class="grade-circle '+gradeClass+'">'+
        '<span class="letter">'+data.grade+'</span>'+
      '</div>'+
      '<div class="aeo-score">AEO Readiness: <span>'+data.aeo_score+'</span>/100</div>'+
      '<div class="grade-domain">'+escHtml(scannedDisplay)+'</div>';

    // Grade-specific insight
    var insight = document.getElementById('grade-insight');
    var score = data.aeo_score;
    var insightText = '';
    if(score >= 80){
      insightText = 'Your site is in strong shape for AI search. The technical foundation is there. The question is whether you are <em>maintaining this lead</em> as competitors catch up -- and whether AI engines are actually <strong>citing you</strong> when it counts.';
    } else if(score >= 65){
      insightText = 'You are close to the threshold where AI engines start picking favorites. A few targeted fixes could push you into the <em>citation zone</em>. Right now, competitors with slightly better structure are getting chosen over you.';
    } else if(score >= 45){
      insightText = 'Your site has gaps that AI engines notice. When ChatGPT, Perplexity, or Gemini need to cite a source in your space, they are <em>skipping you</em> for competitors with cleaner structure. The fixes below are where to start.';
    } else {
      insightText = 'AI engines cannot reliably parse your site. You are <em>invisible</em> to the fastest-growing search channel. The gap between you and AI-optimized competitors is widening every week.';
    }
    insight.innerHTML = insightText;

    // Schema coverage
    schemaGrid.innerHTML='';
    data.schema_coverage.forEach(function(s,i){
      var card=document.createElement('div');
      card.className='schema-card'+(s.present?' is-present':'');
      card.style.animationDelay=(i*0.06)+'s';
      card.innerHTML=
        '<span class="icon '+(s.present?'present':'missing')+'">'+(s.present?'+':'-')+'</span>'+
        '<span class="name">'+escHtml(s.type)+'</span>';
      schemaGrid.appendChild(card);
    });

    // Technical signals
    techList.innerHTML='';
    data.technical_signals.forEach(function(t,i){
      var row=document.createElement('div');
      row.className='tech-row';
      row.style.animationDelay=(i*0.06)+'s';
      row.innerHTML=
        '<span class="status '+t.status+'"></span>'+
        '<span class="label">'+escHtml(t.label)+'</span>'+
        '<span class="value">'+escHtml(t.value)+'</span>';
      techList.appendChild(row);
    });

    // Red flags
    flagsList.innerHTML='';
    if(data.red_flags.length>0){
      flagsLabel.style.display='flex';
      data.red_flags.forEach(function(f,i){
        var card=document.createElement('div');
        card.className='flag-card';
        card.style.animationDelay=(i*0.06)+'s';
        card.textContent=f;
        flagsList.appendChild(card);
      });
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

    // Competitor teaser text (grade-aware)
    var compText = document.getElementById('comp-teaser-text');
    if(score >= 75){
      compText.textContent = 'You are in the top tier. But this scan checks one page at one point in time. NeverRanked monitors your full site weekly and shows you exactly which competitors are closing the gap.';
    } else if(score >= 50){
      compText.textContent = 'Sites scoring above 78 are the ones AI engines consistently cite. You are close, but close is not enough when AI picks one winner per query. NeverRanked tracks the gap in real time.';
    } else {
      compText.textContent = 'The sites getting cited by AI engines score 78 or higher. At '+score+', you are not in the conversation. NeverRanked shows you exactly what to fix and tracks your climb week over week.';
    }

    // Quick wins
    var qwSection = document.getElementById('quick-wins');
    var qwGrid = document.getElementById('quick-wins-grid');
    var wins = [];

    // Missing schema = easy wins
    var schemaWins = {
      'Organization': {desc:'Tells AI engines who you are. Foundational for brand citations.',diff:'easy'},
      'BreadcrumbList': {desc:'Helps AI understand your site hierarchy. Copy-paste implementation.',diff:'easy'},
      'FAQPage': {desc:'Directly feeds AI answer boxes. High citation impact.',diff:'easy'},
      'Article': {desc:'Marks your content as authoritative source material for AI.',diff:'easy'},
      'LocalBusiness': {desc:'Critical for local AI queries. Address, hours, service area.',diff:'easy'},
      'Product': {desc:'Makes product details machine-readable for shopping queries.',diff:'medium'},
      'HowTo': {desc:'Structures step-by-step content that AI engines love to cite.',diff:'easy'},
      'Review': {desc:'Adds social proof that AI engines weigh for trustworthiness.',diff:'medium'},
      'WebSite': {desc:'Enables sitelinks search box and site-level signals.',diff:'easy'},
      'Event': {desc:'Surfaces events in AI responses and knowledge panels.',diff:'easy'}
    };
    data.schema_coverage.forEach(function(s){
      if(!s.present && schemaWins[s.type] && wins.length < 5){
        wins.push({title:'Add '+s.type+' schema', desc:schemaWins[s.type].desc, diff:schemaWins[s.type].diff});
      }
    });

    // Technical signal issues
    data.technical_signals.forEach(function(t){
      if(wins.length >= 5) return;
      if(t.status === 'bad'){
        var desc = 'Currently failing. ';
        if(t.label.toLowerCase().indexOf('meta')>=0) desc += 'AI engines use this to understand page relevance.';
        else if(t.label.toLowerCase().indexOf('heading')>=0) desc += 'Heading structure helps AI parse your content hierarchy.';
        else if(t.label.toLowerCase().indexOf('canonical')>=0) desc += 'Without this, AI engines may index the wrong version of your page.';
        else if(t.label.toLowerCase().indexOf('og')>=0 || t.label.toLowerCase().indexOf('open graph')>=0) desc += 'Social and AI preview cards depend on this.';
        else desc += 'This signal affects how AI engines evaluate your page.';
        wins.push({title:'Fix: '+t.label, desc:desc, diff:'medium'});
      }
    });

    // Red flags as harder wins
    data.red_flags.forEach(function(f){
      if(wins.length >= 5) return;
      wins.push({title:f, desc:'Flagged as a structural issue. Fixing this removes a penalty signal AI engines may factor in.', diff:'hard'});
    });

    if(wins.length > 0){
      qwSection.style.display = 'block';
      qwGrid.innerHTML = '';
      wins.forEach(function(w,i){
        var item = document.createElement('div');
        item.className = 'qw-item';
        item.style.animationDelay = (i*0.06)+'s';
        var icon = w.diff === 'easy' ? '+' : w.diff === 'medium' ? '~' : '!';
        item.innerHTML =
          '<div class="qw-icon '+w.diff+'">'+icon+'</div>'+
          '<div class="qw-body">'+
            '<div class="qw-title">'+escHtml(w.title)+'</div>'+
            '<div class="qw-desc">'+escHtml(w.desc)+'</div>'+
          '</div>'+
          '<div class="qw-diff '+w.diff+'">'+w.diff+'</div>';
        qwGrid.appendChild(item);
      });
    } else {
      qwSection.style.display = 'none';
    }

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

    // Grade-aware CTA headline and recommended plan highlight. All DOM
    // references are null-guarded so the post-scan flow never throws when an
    // element has been removed or hidden (e.g. agency-mode swap).
    var ctaHeadline = document.getElementById('cta-headline');
    var ctaSubtext = document.getElementById('cta-subtext');
    var tierAudit = document.getElementById('cta-tier-audit');
    var tierSignal = document.getElementById('cta-tier-signal');
    var tierAmplify = document.getElementById('cta-tier-amplify');

    function setHeadline(html){ if(ctaHeadline) ctaHeadline.innerHTML = html; }
    function setSubtext(txt){ if(ctaSubtext) ctaSubtext.textContent = txt; }
    function setBorder(el, color){ if(el) el.style.borderColor = color; }
    function recolorBtn(tier, primary){
      if(!tier) return;
      var b = tier.querySelector('.btn');
      if(!b) return;
      b.className = primary ? 'btn btn-primary' : 'btn btn-ghost-link';
      b.style.fontSize = '10px';
      b.style.display = 'inline-block';
      b.style.marginTop = '8px';
    }

    if(score >= 75){
      setHeadline("You're ahead. <em>Stay there.</em>");
      setSubtext('AI search indexes refresh weekly. Your score today does not guarantee your score next month. NeverRanked tracks every shift so you never lose ground.');
      setBorder(tierSignal, 'var(--gold)');
    } else if(score >= 50){
      setHeadline("You're close to the top.<br><em>One push gets you there.</em>");
      setSubtext('You have a foundation. What you need is a roadmap to close the gap and monitoring to make sure you stay there. That is exactly what NeverRanked does.');
      setBorder(tierSignal, 'var(--gold)');
    } else if(score >= 30){
      setHeadline("Your competitors are already <em>ahead.</em>");
      setSubtext('At this score, AI engines are choosing your competitors every time. The good news: the fixes are known and the path is clear. NeverRanked builds the roadmap and tracks your climb.');
      setBorder(tierSignal, 'var(--line)');
      setBorder(tierAmplify, 'var(--gold)');
      recolorBtn(tierAmplify, true);
      recolorBtn(tierSignal, false);
    } else {
      setHeadline("You are <em>invisible</em> to AI search.");
      setSubtext('AI engines cannot parse your site well enough to cite it. Every week without action, the gap grows. NeverRanked provides the full-service fix: we audit, build the roadmap, and execute.');
      setBorder(tierSignal, 'var(--line)');
      setBorder(tierAmplify, 'var(--gold)');
      recolorBtn(tierAmplify, true);
      recolorBtn(tierSignal, false);
    }

    results.classList.add('active');
    gradeSection.scrollIntoView({behavior:'smooth',block:'start'});
  }

  // Email capture
  const emailInput = document.getElementById('email-input');
  const emailBtn = document.getElementById('email-btn');
  const emailForm = document.getElementById('email-form');
  const emailSuccess = document.getElementById('email-success');
  let lastReportData = null;

  async function sendReport(){
    const email = emailInput.value.trim();
    // Strict email format check -- prevents bad addresses bouncing in
    // the drip sequence and seeding garbage into LEADS KV.
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){emailInput.focus();return;}
    if(!lastReportData) return;

    emailBtn.disabled=true;
    emailBtn.textContent='Sending...';

    try{
      const resp = await fetch('/api/send-report',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:email,report:lastReportData})
      });
      if(!resp.ok) throw new Error('Failed');
      if (emailForm) emailForm.style.display='none';
      if (emailSuccess) emailSuccess.style.display='block';
      // Fire conversion events for retargeting
      if(typeof fbq==='function') fbq('track','Lead');
      if(typeof lintrk==='function') lintrk('track',{conversion_id:0});
    }catch{
      emailBtn.textContent='Retry';
      emailBtn.disabled=false;
    }
  }

  emailBtn.addEventListener('click',sendReport);
  emailInput.addEventListener('keydown',function(e){
    if(e.key==='Enter')sendReport();
  });

  // Override renderResults to store data and update competitor bar
  const origRender = renderResults;
  function renderResultsWrapped(data){
    lastReportData = data;
    origRender(data);

    // Fire retargeting events on scan completion
    if(typeof fbq==='function') fbq('track','ViewContent',{content_name:'aeo_check',value:data.aeo_score});
    if(typeof lintrk==='function') lintrk('track',{conversion_id:0});

    // Update competitor teaser bar
    const compBarYou = document.getElementById('comp-bar-you');
    const compScoreYou = document.getElementById('comp-score-you');
    if(compBarYou && compScoreYou){
      compBarYou.style.width = data.aeo_score+'%';
      compScoreYou.textContent = data.aeo_score;
    }

    // Update CTA links with domain param
    var domain = data.domain || '';
    var ctaAudit = document.getElementById('cta-audit');
    var ctaSignal = document.getElementById('cta-signal');
    var ctaAmplify = document.getElementById('cta-amplify');
    var ctaPreview = document.getElementById('cta-preview');
    if(ctaAudit) ctaAudit.href = 'https://app.neverranked.com/checkout/audit?domain='+encodeURIComponent(domain);
    if(ctaSignal) ctaSignal.href = 'https://app.neverranked.com/checkout/signal?domain='+encodeURIComponent(domain);
    if(ctaAmplify) ctaAmplify.href = 'https://app.neverranked.com/checkout/amplify?domain='+encodeURIComponent(domain);
    if(ctaPreview) ctaPreview.href = 'https://app.neverranked.com/checkout/signal?domain='+encodeURIComponent(domain);

    // Reset email capture (guarded — the email-form element was removed from
    // the HTML when we killed the duplicate capture section; these null-safe
    // checks keep the post-scan flow from throwing on missing elements).
    if (emailForm) emailForm.style.display='flex';
    if (emailSuccess) emailSuccess.style.display='none';
    if (emailBtn) { emailBtn.textContent='Send'; emailBtn.disabled=false; }
    if (emailInput) emailInput.value='';

    // Email gate: show teaser + hidden-count, or auto-reveal if already captured
    updateEmailGate(data);
  }

  // ---------- Email gate: teaser + capture before full report is revealed ----------
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
  var gatedDetails = document.getElementById('gated-details');

  function revealGatedDetails(){
    if(gatedDetails) gatedDetails.style.display = 'block';
    if(emailGateEl) emailGateEl.style.display = 'none';
    // Bottom-of-page email form is redundant once they've unlocked — hide it
    var bottomCapture = document.getElementById('email-capture');
    if(bottomCapture) bottomCapture.style.display = 'none';
  }

  function updateEmailGate(data){
    if(!emailGateEl || !gatedDetails) return;

    // Count hidden issues: all red flags + missing critical schemas + failing tech signals
    var flags = (data.red_flags || []).length;
    var missingSchemas = ((data.schema_coverage || []).filter(function(s){ return !s.present; })).length;
    var failingTech = ((data.technical_signals || []).filter(function(t){ return t.status === 'fail' || t.status === 'warn'; })).length;
    var total = flags + missingSchemas + failingTech;

    if(gateCount) gateCount.textContent = String(total || '');

    // Teaser: top 2 red flags (or top missing schemas if no red flags)
    var teaserItems = [];
    if((data.red_flags || []).length > 0){
      teaserItems = data.red_flags.slice(0, 2);
    } else if(missingSchemas > 0){
      teaserItems = (data.schema_coverage || [])
        .filter(function(s){ return !s.present; })
        .slice(0, 2)
        .map(function(s){ return 'Missing ' + s.type + ' schema'; });
    }

    if(gateTeaser){
      if(teaserItems.length > 0){
        gateTeaser.innerHTML = '<ul>' + teaserItems.map(function(msg){
          var safe = String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          return '<li>' + safe + '</li>';
        }).join('') + '</ul>';
      } else {
        gateTeaser.innerHTML = '';
      }
    }

    // If already captured before, skip the gate entirely
    if(getCapturedEmail()){
      revealGatedDetails();
    } else {
      emailGateEl.style.display = 'block';
      gatedDetails.style.display = 'none';
      if(gateEmailBtn){
        gateEmailBtn.disabled = false;
        gateEmailBtn.textContent = 'Unlock full report';
      }
      if(gateEmailInput) gateEmailInput.value = '';
    }
  }

  async function submitGateEmail(){
    if(!gateEmailInput || !gateEmailBtn) return;
    var email = gateEmailInput.value.trim();
    if(!email || !email.includes('@') || !email.includes('.')){ gateEmailInput.focus(); return; }
    if(!lastReportData) return;

    gateEmailBtn.disabled = true;
    gateEmailBtn.textContent = 'Unlocking...';

    try{
      var resp = await fetch('/api/send-report', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: email, report: lastReportData})
      });
      if(!resp.ok) throw new Error('Failed');
      setCapturedEmail(email);
      revealGatedDetails();
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

  // Capture referrer + UTM params on page load for attribution
  var _ref = document.referrer || '';
  var _sp = new URLSearchParams(window.location.search);
  var _utm = {};
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){
    if(_sp.get(k)) _utm[k] = _sp.get(k);
  });

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
          bannerCta.href = 'mailto:' + _agency.email + '?subject=' + encodeURIComponent('AEO audit follow-up');
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
          ctaBtn.href = 'mailto:' + _agency.email + '?subject=' + encodeURIComponent('AEO audit follow-up');
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
  }

  // Rebind
  async function runCheckFinal(){
    const url = normalizeUrl(input.value);
    if(!url){input.focus();return;}

    let domain;
    try{domain=new URL(url).hostname}catch{domain=url}

    btn.disabled=true;
    errorMsg.classList.remove('active');
    results.classList.remove('active');
    loading.classList.add('active');
    loadingText.textContent='Analyzing '+domain+'...';

    try{
      const resp = await fetch('/api/check',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url, referrer:_ref, utm:Object.keys(_utm).length?_utm:undefined})
      });
      const data = await resp.json();
      if(!resp.ok) throw new Error(data.error||'Check failed');
      renderResultsWrapped(data);
    }catch(err){
      errorMsg.textContent=err.message||'Something went wrong. Please try again.';
      errorMsg.classList.add('active');
    }finally{
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

function buildReportEmail(report: any): string {
  const gradeColor = report.grade === "A" ? "#27ae60"
    : report.grade === "B" ? "#e8c767"
    : report.grade === "C" ? "#e67e22"
    : "#c0392b";

  const schemaRows = (report.schema_coverage || []).map((s: any) => `
    <tr>
      <td style="padding:8px 16px;font-family:'Courier New',monospace;font-size:13px;color:#b0b0a8;border-bottom:1px solid #2a2a2a">${escHtml(s.type)}</td>
      <td style="padding:8px 16px;text-align:center;border-bottom:1px solid #2a2a2a"><span style="color:${s.present ? '#27ae60' : '#c0392b'}">${s.present ? 'Found' : 'Missing'}</span></td>
    </tr>
  `).join("");

  const flagRows = (report.red_flags || []).map((f: string) => `
    <div style="padding:10px 16px;margin-bottom:6px;background:#1c1c1c;border-left:3px solid #c0392b;font-family:'Courier New',monospace;font-size:12px;color:#b0b0a8">${escHtml(f)}</div>
  `).join("");

  return `
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AEO Report</title></head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
<tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <!-- Header -->
  <tr><td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#e8c767">Never Ranked</td>
      <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888888">AEO (Answer Engine Optimization) Report</td>
    </tr></table>
  </td></tr>

  <!-- Score -->
  <tr><td style="padding:32px 0;text-align:center">
    <div style="display:inline-block;width:80px;height:80px;border-radius:50%;border:2px solid ${gradeColor};text-align:center;line-height:80px;font-family:Georgia,serif;font-size:42px;font-style:italic;color:${gradeColor}">${report.grade}</div>
    <div style="font-family:'Courier New',monospace;font-size:32px;color:#fbf8ef;margin-top:12px">${report.aeo_score}<span style="font-size:14px;color:#888888">/100</span></div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#888888;margin-top:8px">${escHtml(report.domain)}</div>
  </td></tr>

  <!-- Schema coverage -->
  <tr><td style="padding-bottom:24px">
    <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:12px">Schema Coverage</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
      ${schemaRows}
    </table>
  </td></tr>

  ${flagRows ? `
  <!-- Red flags -->
  <tr><td style="padding-bottom:24px">
    <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888888;margin-bottom:12px">Red Flags (${report.red_flags.length})</div>
    ${flagRows}
  </td></tr>
  ` : ""}

  <!-- CTA -->
  <tr><td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px;text-align:center">
    <div style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#fbf8ef;margin-bottom:12px">This is a snapshot. Want ongoing monitoring?</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#888888;line-height:1.7;margin-bottom:20px">NeverRanked tracks your AEO score weekly, benchmarks you against competitors, and gives you a clear action plan.</div>
    <a href="https://app.neverranked.com/checkout/signal?domain=${encodeURIComponent(report.domain)}" style="display:inline-block;padding:14px 32px;background:#e8c767;color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">Start monitoring — $2,000/mo</a>
    <div style="margin-top:12px">
      <a href="https://app.neverranked.com/checkout/audit?domain=${encodeURIComponent(report.domain)}" style="font-family:'Courier New',monospace;font-size:11px;color:#bfa04d;text-decoration:none">One-time audit: $500</a>
      <span style="color:#555555;margin:0 8px">|</span>
      <a href="https://app.neverranked.com/checkout/amplify?domain=${encodeURIComponent(report.domain)}" style="font-family:'Courier New',monospace;font-size:11px;color:#bfa04d;text-decoration:none">Full service: $4,500/mo</a>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 0;border-top:1px solid #2a2a2a;margin-top:24px">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#555555;line-height:1.6">
      Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a><br>
      You received this because you requested an AEO report at check.neverranked.com
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`.trim();
}

// ---------- Drip sequence ----------

const DRIP_DAY_3 = 3;
const DRIP_DAY_7 = 7;
const INDUSTRY_AVG = 52;

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

async function runDripSequence(env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  // List all leads from KV
  const list = await env.LEADS.list({ prefix: "lead:" });
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
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "NeverRanked <reports@neverranked.com>",
              to: [lead.email],
              subject: `${latestScan.domain} vs. the industry: where you stand`,
              html: buildDripDay3Email(latestScan, lead.email),
            }),
          });
          lead.drip_day3_sent = true;
          updated = true;
          sent++;
        } catch (e) {
          console.log(`Drip day3 failed for ${lead.email}: ${e}`);
        }
      }
    }

    // Day 7: Re-scan nudge + monitoring pitch
    if (age >= DRIP_DAY_7 && !lead.drip_day7_sent) {
      const latestScan = lead.scans[lead.scans.length - 1];
      if (latestScan) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "NeverRanked <reports@neverranked.com>",
              to: [lead.email],
              subject: `A week later: has ${latestScan.domain} moved?`,
              html: buildDripDay7Email(latestScan, lead.email),
            }),
          });
          lead.drip_day7_sent = true;
          updated = true;
          sent++;
        } catch (e) {
          console.log(`Drip day7 failed for ${lead.email}: ${e}`);
        }
      }
    }

    if (updated) {
      await env.LEADS.put(key.name, JSON.stringify(lead), { expirationTtl: 365 * 24 * 60 * 60 });
    }

    // Rate limit: 200ms between sends
    if (sent > 0 && sent % 5 === 0) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`Drip sequence complete: ${sent} emails sent`);
}

function buildDripDay3Email(scan: { domain: string; score: number; grade: string }, email: string): string {
  const diff = scan.score - INDUSTRY_AVG;
  const diffLabel = diff > 0 ? `+${diff} above` : diff < 0 ? `${Math.abs(diff)} below` : "right at";
  const diffColor = diff > 0 ? "#27ae60" : diff < 0 ? "#c0392b" : "#e8c767";

  const narrative = diff >= 15
    ? "You are well ahead of the pack. But competitors are catching up fast as AEO (Answer Engine Optimization) becomes mainstream. Maintaining this lead takes active work."
    : diff >= 5
    ? "You are ahead of most, but the gap is smaller than you think. A few schema changes from a competitor could close it in weeks."
    : diff >= 0
    ? "You are right around the industry average. That means you are invisible to AI engines -- they will pick whoever optimizes first."
    : diff >= -10
    ? "You are behind the curve. AI engines are already choosing your competitors over you for the queries that matter."
    : "You are significantly behind. Every day without action is a day your competitors pull further ahead in AI search results.";

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Competitor Comparison</title></head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
<tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <!-- Header -->
  <tr><td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#e8c767">Never Ranked</td>
      <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888888">Day 3 Update</td>
    </tr></table>
  </td></tr>

  <!-- Comparison -->
  <tr><td style="padding:32px 0">
    <div style="font-family:Georgia,serif;font-size:22px;font-style:italic;color:#fbf8ef;margin-bottom:8px">How do you compare?</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#888888;margin-bottom:28px">${escHtml(scan.domain)} vs. industry average</div>

    <!-- Score bars -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px">
      <tr>
        <td style="padding:8px 0;font-family:'Courier New',monospace;font-size:12px;color:#b0b0a8;width:100px">${escHtml(scan.domain)}</td>
        <td style="padding:8px 0">
          <div style="background:#1c1c1c;border-radius:2px;height:24px;position:relative">
            <div style="background:${diffColor};height:24px;border-radius:2px;width:${Math.min(scan.score, 100)}%;max-width:100%"></div>
            <span style="position:absolute;right:8px;top:4px;font-family:'Courier New',monospace;font-size:12px;color:#fbf8ef">${scan.score}</span>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-family:'Courier New',monospace;font-size:12px;color:#888888">Industry avg</td>
        <td style="padding:8px 0">
          <div style="background:#1c1c1c;border-radius:2px;height:24px;position:relative">
            <div style="background:#555555;height:24px;border-radius:2px;width:${INDUSTRY_AVG}%"></div>
            <span style="position:absolute;right:8px;top:4px;font-family:'Courier New',monospace;font-size:12px;color:#888888">${INDUSTRY_AVG}</span>
          </div>
        </td>
      </tr>
    </table>

    <div style="font-family:'Courier New',monospace;font-size:13px;color:${diffColor};margin-bottom:16px">${diffLabel} the industry average</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#b0b0a8;line-height:1.7">${narrative}</div>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px;text-align:center">
    <div style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#fbf8ef;margin-bottom:12px">See where your competitors actually score.</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#888888;line-height:1.7;margin-bottom:20px">NeverRanked clients get side-by-side competitor benchmarks, weekly scans, regression alerts, and a phased action roadmap. Real domains. Real scores. Not averages.</div>
    <a href="https://app.neverranked.com/checkout/signal?domain=${encodeURIComponent(scan.domain)}" style="display:inline-block;padding:14px 32px;background:#e8c767;color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">Start monitoring — $2,000/mo</a>
    <div style="margin-top:12px">
      <a href="https://app.neverranked.com/checkout/audit?domain=${encodeURIComponent(scan.domain)}" style="font-family:'Courier New',monospace;font-size:11px;color:#bfa04d;text-decoration:none">Or get a one-time audit for $500</a>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 0;border-top:1px solid #2a2a2a;margin-top:24px">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#555555;line-height:1.6">
      Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a><br>
      You received this because you scanned ${escHtml(scan.domain)} at check.neverranked.com<br>
      This is email 2 of 3. No further emails after this series.
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`.trim();
}

function buildDripDay7Email(scan: { domain: string; score: number; grade: string }, email: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Score Update</title></head>
<body style="margin:0;padding:0;background:#121212;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#121212">
<tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <!-- Header -->
  <tr><td style="padding-bottom:32px;border-bottom:1px solid #2a2a2a">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#e8c767">Never Ranked</td>
      <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888888">Week 1 Check-in</td>
    </tr></table>
  </td></tr>

  <!-- Content -->
  <tr><td style="padding:32px 0">
    <div style="font-family:Georgia,serif;font-size:22px;font-style:italic;color:#fbf8ef;margin-bottom:8px">A week has passed.</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#888888;margin-bottom:28px">Has anything changed for ${escHtml(scan.domain)}?</div>

    <div style="font-family:'Courier New',monospace;font-size:12px;color:#b0b0a8;line-height:1.8;margin-bottom:24px">
      Seven days ago, ${escHtml(scan.domain)} scored <strong style="color:#fbf8ef">${scan.score}/100</strong> on AEO (Answer Engine Optimization) readiness.<br><br>
      In those seven days:<br>
      &bull; Google may have updated AI Overviews<br>
      &bull; ChatGPT refreshed its source index<br>
      &bull; Your competitors may have added schema<br>
      &bull; Perplexity re-crawled millions of pages<br><br>
      One scan tells you where you were. Monitoring tells you where you are heading.
    </div>

    <!-- Re-scan CTA -->
    <div style="text-align:center;margin-bottom:28px">
      <a href="https://check.neverranked.com" style="display:inline-block;padding:14px 32px;border:1px solid #e8c767;color:#e8c767;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">Re-scan your site free</a>
    </div>
  </td></tr>

  <!-- Monitoring pitch -->
  <tr><td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
    <div style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#fbf8ef;margin-bottom:12px">Stop checking manually.</div>
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#888888;line-height:1.7;margin-bottom:20px">
      NeverRanked clients get automatic weekly scans, trend tracking, regression alerts, competitor benchmarks, and a phased action plan. All in one dashboard.
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:6px 0;font-family:'Courier New',monospace;font-size:11px;color:#b0b0a8">&#8635; Weekly AEO scans</td>
        <td style="padding:6px 0;font-family:'Courier New',monospace;font-size:11px;color:#b0b0a8">&#9670; Phased roadmap</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-family:'Courier New',monospace;font-size:11px;color:#b0b0a8">&#9888; Regression alerts</td>
        <td style="padding:6px 0;font-family:'Courier New',monospace;font-size:11px;color:#b0b0a8">&#9646;&#9646; Competitor tracking</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-family:'Courier New',monospace;font-size:11px;color:#b0b0a8">&#9993; Weekly digest</td>
        <td style="padding:6px 0;font-family:'Courier New',monospace;font-size:11px;color:#b0b0a8">&#8599; Shareable reports</td>
      </tr>
    </table>

    <div style="text-align:center;margin-top:20px">
      <a href="https://app.neverranked.com/checkout/signal?domain=${encodeURIComponent(scan.domain)}" style="display:inline-block;padding:14px 32px;background:#e8c767;color:#080808;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:2px">Start monitoring — $2,000/mo</a>
    </div>
    <div style="text-align:center;margin-top:12px">
      <a href="https://app.neverranked.com/checkout/audit?domain=${encodeURIComponent(scan.domain)}" style="font-family:'Courier New',monospace;font-size:11px;color:#bfa04d;text-decoration:none">One-time audit: $500</a>
      <span style="color:#555555;margin:0 8px">|</span>
      <a href="https://app.neverranked.com/checkout/amplify?domain=${encodeURIComponent(scan.domain)}" style="font-family:'Courier New',monospace;font-size:11px;color:#bfa04d;text-decoration:none">Full service: $4,500/mo</a>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 0;border-top:1px solid #2a2a2a;margin-top:24px">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#555555;line-height:1.6">
      Powered by <a href="https://neverranked.com" style="color:#bfa04d;text-decoration:none">NeverRanked</a><br>
      You received this because you scanned ${escHtml(scan.domain)} at check.neverranked.com<br>
      This is the last email in this series. No further emails.
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`.trim();
}

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
      return "The site requires authentication (HTTP 401). AI crawlers cannot access pages behind a login, so anything gated this way is invisible to ChatGPT, Perplexity, and Google AI Overviews.";
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
      return "SSL handshake failed between Cloudflare and the origin (HTTP 525). The origin's certificate setup is broken. Fix this before worrying about AEO, because nothing can fetch the site cleanly.";
    case 526:
      return "The origin's SSL certificate is invalid (HTTP 526). Cloudflare refused to trust the cert on the underlying server. This is a site-owner configuration error. AI crawlers, Google, and our scanner all hit the same wall. Fixing the origin cert is the first step before any AEO work can matter.";
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
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // API endpoint
    if (url.pathname === "/api/check" && request.method === "POST") {
      // Rate limiting
      const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
      if (isRateLimited(ip)) {
        return Response.json(
          { error: "Rate limit exceeded. Please wait a moment before trying again." },
          { status: 429, headers: corsHeaders }
        );
      }

      let body: { url?: string; referrer?: string; utm?: Record<string, string> };
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid request body." }, { status: 400, headers: corsHeaders });
      }

      const targetUrl = body.url?.trim();
      const referrer = body.referrer?.trim() || "";
      const utm = body.utm || {};
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

      const report = buildReport(targetUrl, html);

      // Log anonymous scan event to KV (with referrer/UTM attribution).
      // Enriched with ip_hash + user-agent so we can dedupe unique humans
      // and filter out internal/test traffic in the admin report.
      try {
        const ua = request.headers.get("User-Agent") || "";
        const rawIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
        const ipHash = rawIp ? await sha256Hex(rawIp) : "";
        const scanKey = `event:scan:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        const eventData: Record<string, unknown> = {
          type: "free_scan",
          domain: report.domain,
          score: report.aeo_score,
          grade: report.grade,
          ts: new Date().toISOString(),
          ip_hash: ipHash,
          ua,
        };
        if (referrer) eventData.referrer = referrer;
        if (Object.keys(utm).length > 0) eventData.utm = utm;
        await env.LEADS.put(scanKey, JSON.stringify(eventData), { expirationTtl: 90 * 24 * 60 * 60 });
      } catch (e) {
        console.error("scan-log-failed", e instanceof Error ? e.message : String(e));
      }

      return Response.json(report, { headers: corsHeaders });
    }

    // Send report via email + capture lead
    if (url.pathname === "/api/send-report" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      if (isRateLimited(ip)) {
        return Response.json({ error: "Rate limit exceeded." }, { status: 429, headers: corsHeaders });
      }

      let body: { email?: string; report?: any };
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid request." }, { status: 400, headers: corsHeaders });
      }

      const email = body.email?.trim().toLowerCase();
      const report = body.report;

      // Server-side check mirrors client validation -- belt and suspenders.
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !report) {
        return Response.json({ error: "Valid email and report required." }, { status: 400, headers: corsHeaders });
      }

      // Store lead in KV
      const leadKey = `lead:${email}`;
      const now = new Date().toISOString();
      const existing = await env.LEADS.get(leadKey);
      const leadData = existing ? JSON.parse(existing) : { email, scans: [], created: now };
      leadData.scans.push({
        domain: report.domain,
        score: report.aeo_score,
        grade: report.grade,
        date: now,
      });
      leadData.lastScan = now;
      await env.LEADS.put(leadKey, JSON.stringify(leadData), { expirationTtl: 365 * 24 * 60 * 60 });

      // Log email capture event
      try {
        const captureKey = `event:capture:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        await env.LEADS.put(captureKey, JSON.stringify({
          type: "email_captured",
          domain: report.domain,
          score: report.aeo_score,
          ts: new Date().toISOString(),
        }), { expirationTtl: 90 * 24 * 60 * 60 });
      } catch (e) {
        console.error("capture-log-failed", e instanceof Error ? e.message : String(e));
      }

      // Send email if RESEND_API_KEY is set
      if (env.RESEND_API_KEY) {
        try {
          const emailHtml = buildReportEmail(report);
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "NeverRanked <reports@neverranked.com>",
              to: [email],
              subject: `Your AEO Report: ${report.domain} scored ${report.aeo_score}/100`,
              html: emailHtml,
            }),
          });
        } catch (e) {
          console.log(`Report email failed: ${e}`);
        }
      }

      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    // Admin: referrer attribution breakdown (last 500 scan events)
    if (url.pathname === "/api/admin/referrers" && request.method === "GET") {
      const secret = url.searchParams.get("key");
      if (!secret || secret !== (env as any).ADMIN_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
      }

      try {
        const list = await env.LEADS.list({ prefix: "event:scan:", limit: 500 });
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

  // ---------- Drip sequence cron (runs daily at 2pm UTC) ----------

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDripSequence(env));
  },
};
