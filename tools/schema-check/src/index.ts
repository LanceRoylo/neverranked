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
}

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
}
</style>
</head>
<body>
<div class="grain"></div>

<nav class="nav">
  <a href="https://neverranked.com" class="mark">N</a>
  <span class="tool-name">Schema & AEO Health Check</span>
</nav>

<main class="wrap">
  <section class="hero">
    <h1>How ready is your site<br>for <em>AI search</em>?</h1>
    <p class="sub">Enter your URL. Get an instant grade on schema coverage, technical signals, and AEO readiness. Free. No signup.</p>
    <div class="input-area">
      <input type="url" id="url-input" placeholder="https://example.com" autocomplete="url" spellcheck="false">
      <button id="run-btn" type="button">Run check</button>
    </div>
  </section>

  <div class="loading" id="loading">
    <span class="dot"></span>
    <span class="text" id="loading-text">Analyzing...</span>
  </div>

  <div class="error-msg" id="error-msg"></div>

  <section class="results" id="results">
    <div class="grade-section" id="grade-section"></div>

    <div class="section-label"><span class="num">01</span> Schema Coverage <span class="rule"></span></div>
    <div class="schema-grid" id="schema-grid"></div>

    <div class="section-label"><span class="num">02</span> Technical Signals <span class="rule"></span></div>
    <div class="tech-list" id="tech-list"></div>

    <div class="section-label" id="flags-label" style="display:none"><span class="num">03</span> Red Flags <span class="rule"></span></div>
    <div class="flags-list" id="flags-list"></div>

    <!-- Competitor teaser -->
    <div class="comp-teaser" id="comp-teaser">
      <div class="section-label"><span class="num">04</span> How do you compare? <span class="rule"></span></div>
      <div class="comp-teaser-inner">
        <div class="comp-teaser-bars">
          <div class="comp-bar">
            <div class="comp-bar-label">You</div>
            <div class="comp-bar-track"><div class="comp-bar-fill comp-bar-you" id="comp-bar-you"></div></div>
            <div class="comp-bar-score" id="comp-score-you"></div>
          </div>
          <div class="comp-bar">
            <div class="comp-bar-label" style="color:var(--text-faint)">Industry avg</div>
            <div class="comp-bar-track"><div class="comp-bar-fill comp-bar-avg"></div></div>
            <div class="comp-bar-score" style="color:var(--text-faint)">52</div>
          </div>
        </div>
        <div class="comp-teaser-text">
          Most sites score between 35 and 60. The ones ranking in AI answers are above 75. NeverRanked tracks where you stand against your actual competitors, not averages.
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div class="cta-section">
      <h3>This is a snapshot.<br>Your competitors are <em>moving now.</em></h3>
      <p>AI search indexes refresh weekly. Competitors add schema, publish content, climb rankings. Every week without action, the gap widens. A one-time scan tells you where you are. NeverRanked keeps you ahead.</p>

      <div class="cta-pricing" style="display:flex;gap:16px;justify-content:center;margin:28px 0;flex-wrap:wrap">
        <div style="text-align:center;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;flex:1;min-width:140px;max-width:200px">
          <div style="font-family:var(--serif);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">One-time audit</div>
          <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text)">$500</div>
          <a href="https://app.neverranked.com/checkout/audit" id="cta-audit" class="btn btn-ghost-link" style="margin-top:12px;font-size:10px;display:inline-block">Get audit</a>
        </div>
        <div style="text-align:center;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--gold-dim);border-radius:4px;flex:1;min-width:140px;max-width:200px">
          <div style="font-family:var(--serif);font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Signal</div>
          <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text)">$2,000<span style="font-size:14px;color:var(--text-faint)">/mo</span></div>
          <a href="https://app.neverranked.com/checkout/signal" id="cta-signal" class="btn btn-primary" style="margin-top:12px;font-size:10px;display:inline-block">Start monitoring</a>
        </div>
        <div style="text-align:center;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;flex:1;min-width:140px;max-width:200px">
          <div style="font-family:var(--serif);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Amplify</div>
          <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text)">$4,500<span style="font-size:14px;color:var(--text-faint)">/mo</span></div>
          <a href="https://app.neverranked.com/checkout/amplify" id="cta-amplify" class="btn btn-ghost-link" style="margin-top:12px;font-size:10px;display:inline-block">Go full service</a>
        </div>
      </div>

      <div class="cta-features">
        <span>Weekly scans</span>
        <span>Score tracking</span>
        <span>Competitor benchmarks</span>
        <span>Action roadmap</span>
        <span>Regression alerts</span>
        <span>Schema injection</span>
      </div>
      <div style="text-align:center;margin-top:16px">
        <a href="mailto:hello@neverranked.com" class="btn btn-ghost-link" style="font-size:10px">Not sure which plan? Talk to us</a>
      </div>
    </div>

    <!-- Email capture (after CTA) -->
    <div class="email-capture" id="email-capture">
      <div class="email-capture-inner">
        <div class="email-capture-icon">&#9993;</div>
        <div>
          <div class="email-capture-title">Email me this report</div>
          <div class="email-capture-sub">Get your score card with a breakdown of every signal. No spam.</div>
        </div>
        <div class="email-capture-form" id="email-form">
          <input type="email" id="email-input" placeholder="you@company.com" autocomplete="email">
          <button type="button" id="email-btn">Send</button>
        </div>
      </div>
      <div class="email-success" id="email-success" style="display:none">
        <span style="color:var(--gold)">Sent.</span> Check your inbox for the full report.<br>
        <span style="font-size:12px;color:var(--text-faint)">In 3 days we will send you a competitor comparison. In 7 days, a re-scan check-in.</span>
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
    const gradeClass = 'grade-'+data.grade.toLowerCase();
    gradeSection.innerHTML=
      '<div class="grade-circle '+gradeClass+'">'+
        '<span class="letter">'+data.grade+'</span>'+
      '</div>'+
      '<div class="aeo-score">AEO Readiness: <span>'+data.aeo_score+'</span>/100</div>'+
      '<div class="grade-domain">'+escHtml(data.domain)+'</div>';

    // Schema coverage
    schemaGrid.innerHTML='';
    data.schema_coverage.forEach(function(s,i){
      const card=document.createElement('div');
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
      const row=document.createElement('div');
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
        const card=document.createElement('div');
        card.className='flag-card';
        card.style.animationDelay=(i*0.06)+'s';
        card.textContent=f;
        flagsList.appendChild(card);
      });
    }else{
      flagsLabel.style.display='none';
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
    if(!email || !email.includes('@')){emailInput.focus();return;}
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
      emailForm.style.display='none';
      emailSuccess.style.display='block';
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
    if(ctaAudit) ctaAudit.href = 'https://app.neverranked.com/checkout/audit?domain='+encodeURIComponent(domain);
    if(ctaSignal) ctaSignal.href = 'https://app.neverranked.com/checkout/signal?domain='+encodeURIComponent(domain);
    if(ctaAmplify) ctaAmplify.href = 'https://app.neverranked.com/checkout/amplify?domain='+encodeURIComponent(domain);

    // Reset email capture
    emailForm.style.display='flex';
    emailSuccess.style.display='none';
    emailBtn.textContent='Send';
    emailBtn.disabled=false;
    emailInput.value='';
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
        body:JSON.stringify({url})
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
      <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888888">AEO Report</td>
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
    ? "You are well ahead of the pack. But competitors are catching up fast as AEO becomes mainstream. Maintaining this lead takes active work."
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
      Seven days ago, ${escHtml(scan.domain)} scored <strong style="color:#fbf8ef">${scan.score}/100</strong> on AEO readiness.<br><br>
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

      let body: { url?: string };
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid request body." }, { status: 400, headers: corsHeaders });
      }

      const targetUrl = body.url?.trim();
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
            { error: `Could not fetch the site (HTTP ${resp.status}). Make sure the URL is publicly accessible.` },
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

      // Log anonymous scan event to KV
      try {
        const scanKey = `event:scan:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        await env.LEADS.put(scanKey, JSON.stringify({
          type: "free_scan",
          domain: report.domain,
          score: report.aeo_score,
          grade: report.grade,
          ts: new Date().toISOString(),
        }), { expirationTtl: 90 * 24 * 60 * 60 });
      } catch {}

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

      if (!email || !email.includes("@") || !report) {
        return Response.json({ error: "Email and report required." }, { status: 400, headers: corsHeaders });
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
      } catch {}

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

    // Serve HTML UI
    return new Response(HTML_PAGE, {
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        ...corsHeaders,
      },
    });
  },

  // ---------- Drip sequence cron (runs daily at 2pm UTC) ----------

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDripSequence(env));
  },
};
