/**
 * Dashboard — Shared CSS
 */

export const CSS = `
:root{
  --bg:#121212;
  --bg-lift:#1a1a1a;
  --bg-edge:#222222;
  --gold:#e8c767;
  --gold-dim:#bfa04d;
  --gold-wash:rgba(232,199,103,.10);
  --text:#fbf8ef;
  --text-soft:rgba(251,248,239,.95);
  --text-mute:rgba(251,248,239,.82);
  --text-faint:rgba(251,248,239,.78);
  --line:rgba(251,248,239,.10);
  --line-strong:rgba(251,248,239,.20);
  --red:#e85454;
  --green:#5ec76a;
  --yellow:#e8c767;

  --serif:"Playfair Display",Georgia,serif;
  --mono:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --label:"Barlow Condensed","Arial Narrow",sans-serif;

  --gutter:clamp(20px,4vw,48px);
  --max:1080px;
  --ease:cubic-bezier(.2,.7,.2,1);
  --radius:6px;
}

*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{
  background:var(--bg);
  color:var(--text);
  font-family:var(--mono);
  font-size:15px;
  line-height:1.7;
  font-weight:400;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
  text-rendering:optimizeLegibility;
  overflow-x:hidden;
  min-height:100vh;
}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
::selection{background:var(--gold);color:var(--bg)}
img,svg{display:block;max-width:100%}

/* grain */
.grain{
  position:fixed;inset:-50%;width:200%;height:200%;
  pointer-events:none;z-index:100;opacity:.08;mix-blend-mode:overlay;
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

/* nav */
/* ---------- app shell ----------
   Hybrid layout: thin sticky topbar (brand + avatar menu) and a grouped
   left sidebar that owns all product surfaces. Sidebar collapses behind
   a hamburger on narrow viewports. Content scrolls inside .page.
*/
.topbar{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px var(--gutter);
  border-bottom:1px solid var(--line);
  position:sticky;top:0;z-index:60;
  background:rgba(18,18,18,.96);
  backdrop-filter:blur(20px);
  -webkit-backdrop-filter:blur(20px);
  min-height:56px;
}
.topbar .mark{
  font-family:var(--serif);font-style:italic;font-size:17px;
  letter-spacing:-.01em;color:var(--text);
  transition:color .25s;
}
.topbar .mark:hover{color:var(--gold)}
.topbar .mark sup{
  font-family:var(--label);font-style:normal;font-size:8px;
  letter-spacing:.2em;margin-left:3px;vertical-align:super;opacity:.5;
}

/* Avatar menu in the topbar. Native <details> gives us click-to-toggle
   disclosure with keyboard support for free -- no custom JS required. */
.avatar-menu{position:relative}
.avatar-menu>summary{
  list-style:none;cursor:pointer;
  display:inline-flex;align-items:center;gap:10px;
  padding:6px 10px;border-radius:var(--radius);
  font-family:var(--mono);font-size:12px;color:var(--text-mute);
  transition:background .15s,color .15s;
}
.avatar-menu>summary::-webkit-details-marker{display:none}
.avatar-menu>summary:hover{background:var(--gold-wash);color:var(--text)}
.avatar-menu[open]>summary{background:var(--gold-wash);color:var(--text)}
.avatar-chip{
  display:inline-flex;align-items:center;justify-content:center;
  width:26px;height:26px;border-radius:50%;
  background:var(--gold-wash);color:var(--gold);
  font-family:var(--serif);font-size:13px;
  border:1px solid var(--gold-dim);
}
.avatar-caret{font-size:9px;opacity:.6}
.avatar-panel{
  position:absolute;top:calc(100% + 8px);right:0;min-width:240px;
  background:var(--bg-lift);border:1px solid var(--line-strong);
  border-radius:var(--radius);
  box-shadow:0 12px 32px rgba(0,0,0,.45);
  z-index:70;overflow:hidden;
}
.avatar-panel-email{
  padding:12px 14px;border-bottom:1px solid var(--line);
  font-family:var(--mono);font-size:12px;color:var(--text-faint);
  word-break:break-all;
}
.avatar-panel a,.avatar-panel .avatar-panel-link{
  display:block;width:100%;text-align:left;
  padding:10px 14px;
  font-family:var(--label);text-transform:uppercase;letter-spacing:.14em;
  font-size:11px;color:var(--text-mute);
  border:none;border-bottom:1px solid var(--line);
  background:none;cursor:pointer;
  transition:background .15s,color .15s;
}
.avatar-panel a:last-child,.avatar-panel form:last-child .avatar-panel-link{border-bottom:none}
.avatar-panel a:hover,.avatar-panel .avatar-panel-link:hover{background:var(--gold-wash);color:var(--text)}
.avatar-panel a.active{color:var(--gold)}

/* The shell: sidebar column + main column. Grid is cleaner than flex
   here because we want the sidebar to stay exactly its declared width
   regardless of content. */
.app-shell{
  display:grid;
  grid-template-columns:220px minmax(0,1fr);
  min-height:calc(100vh - 56px);
}
.sidebar{
  position:sticky;top:56px;
  align-self:start;
  height:calc(100vh - 56px);
  overflow-y:auto;
  border-right:1px solid var(--line);
  padding:24px 0 32px;
  background:var(--bg-edge);
}
.sidebar-section{margin-bottom:30px}
.sidebar-section:last-child{margin-bottom:0}
/* Section header reads as an eyebrow -- distinct enough from the nav
   items below that the eye groups them without re-reading. Warm gold
   at reduced intensity keeps them subordinate to active items but
   clearly above the item color. */
.sidebar-section-header{
  padding:0 22px 10px;
  font-family:var(--label);text-transform:uppercase;letter-spacing:.2em;
  font-size:10px;color:var(--gold-dim);font-weight:500;
  opacity:.85;
}
/* Nav items in sentence case + normal letter spacing so each word is a
   scannable target, not another line of Barlow caps. The aim is
   Linear-style: eyebrow/caps for sections, mixed-case for items. */
.sidebar-item{
  display:flex;align-items:center;justify-content:space-between;
  gap:10px;padding:8px 22px;
  font-family:var(--label);font-size:14px;
  color:var(--text-mute);font-weight:400;
  border-left:2px solid transparent;
  transition:color .15s,background .15s,border-color .15s;
}
.sidebar-item:hover{color:var(--text);background:var(--gold-wash)}
.sidebar-item.active{
  color:var(--gold);
  background:var(--gold-wash);
  border-left-color:var(--gold);
  font-weight:500;
}
.sidebar-item::after{display:none}
.nav-badge{
  display:inline-flex;align-items:center;justify-content:center;
  min-width:18px;height:18px;padding:0 5px;
  background:var(--red);color:#fff;
  font-family:var(--mono);font-size:9px;font-weight:500;
  border-radius:9px;
  letter-spacing:0;text-transform:none;
  line-height:1;
}
.sidebar-item .nav-badge{margin-left:auto}

/* ---------- empty-state hero ----------
   Shared empty-state pattern for pre-setup surfaces (summary before
   first scan, voice before first sample, etc.). Loud-but-restrained:
   enough presence to direct the eye, calm enough not to feel like an
   error state. */
.empty-hero{
  background:var(--bg-lift);
  border:1px solid var(--gold-dim);
  border-radius:var(--radius);
  padding:40px 36px;
  margin-bottom:32px;
  max-width:720px;
}
.empty-hero-eyebrow{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;
  font-size:10px;color:var(--gold);margin-bottom:8px;
}
.empty-hero-title{
  font-family:var(--serif);font-size:28px;font-weight:400;
  color:var(--text);letter-spacing:-.01em;line-height:1.2;margin:0 0 16px;
}
.empty-hero-body{
  font-family:var(--mono);font-size:13px;color:var(--text-faint);
  line-height:1.7;margin:0 0 24px;
}
.empty-hero-actions{display:flex;gap:12px;flex-wrap:wrap}
@media(max-width:720px){
  .empty-hero{padding:28px 22px}
  .empty-hero-title{font-size:22px}
}

/* ---------- Getting Started checklist ----------
   Persistent card at the top of Dashboard/Agency home. Quiet gold
   framing, progress bar on the right, a stepped ordered list, and a
   subtle dismiss link at the bottom. Hides entirely when all actionable
   steps are done or the user dismisses it. */
.gs-card{
  background:var(--bg-lift);
  border:1px solid var(--gold-dim);
  border-radius:var(--radius);
  padding:28px 28px 22px;
  margin-bottom:32px;
  position:relative;
}
.gs-head{
  display:flex;align-items:flex-start;justify-content:space-between;
  gap:24px;flex-wrap:wrap;margin-bottom:22px;
}
.gs-eyebrow{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;
  font-size:10px;color:var(--gold);margin-bottom:4px;
}
.gs-title{
  font-family:var(--serif);font-size:24px;font-weight:400;
  color:var(--text);letter-spacing:-.01em;line-height:1.2;margin:0;
}
.gs-progress{min-width:180px}
.gs-progress-label{
  font-family:var(--mono);font-size:11px;color:var(--text-faint);
  margin-bottom:6px;text-align:right;
}
.gs-progress-bar{
  height:4px;background:var(--line);border-radius:2px;overflow:hidden;
}
.gs-progress-fill{
  height:100%;background:var(--gold);
  transition:width .4s var(--ease);
}
.gs-steps{
  list-style:none;padding:0;margin:0;
  display:flex;flex-direction:column;gap:2px;
}
.gs-step{
  display:flex;align-items:flex-start;gap:16px;
  padding:14px 4px;
  border-top:1px solid var(--line);
  transition:background .15s;
}
.gs-step:first-child{border-top:none}
.gs-step-icon{
  flex-shrink:0;
  width:22px;height:22px;border-radius:50%;
  display:inline-flex;align-items:center;justify-content:center;
  font-family:var(--mono);font-size:12px;line-height:1;
  border:1px solid var(--line-strong);
  color:var(--text-faint);background:var(--bg);
  margin-top:2px;
}
.gs-step-done .gs-step-icon{
  background:var(--gold);color:var(--bg);border-color:var(--gold);
  font-weight:600;
}
.gs-step-locked .gs-step-icon{
  background:transparent;color:var(--text-faint);
  border-style:dashed;font-size:8px;
}
.gs-step-body{flex:1;min-width:0}
.gs-step-label{
  font-family:var(--serif);font-size:16px;color:var(--text);
  line-height:1.3;
}
.gs-step-done .gs-step-label{
  color:var(--text-mute);text-decoration:line-through;
  text-decoration-color:var(--gold-dim);
}
.gs-step-locked .gs-step-label{color:var(--text-mute)}
.gs-step-desc{
  font-family:var(--mono);font-size:12px;color:var(--text-faint);
  line-height:1.55;margin-top:4px;
}
.gs-step-action{flex-shrink:0;margin-left:16px}
.gs-step-cta{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.14em;
  font-size:11px;color:var(--gold);
  padding:7px 14px;border:1px solid var(--gold-dim);
  border-radius:var(--radius);background:transparent;
  transition:background .15s,border-color .15s;
  white-space:nowrap;
}
.gs-step-cta:hover{background:var(--gold-wash);border-color:var(--gold)}
.gs-step-cta-locked{
  color:var(--text-faint);border-color:var(--line);
}
.gs-step-cta-locked:hover{color:var(--gold);border-color:var(--gold-dim);background:var(--gold-wash)}
.gs-step-cta-done{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.14em;
  font-size:11px;color:var(--text-faint);
  padding:7px 14px;
}
.gs-dismiss{margin-top:8px;text-align:right}
.gs-dismiss-btn{
  background:none;border:none;cursor:pointer;
  font-family:var(--mono);font-size:11px;color:var(--text-faint);
  padding:4px 0;
  transition:color .15s;
}
.gs-dismiss-btn:hover{color:var(--text-mute);text-decoration:underline}
@media(max-width:720px){
  .gs-card{padding:20px 18px 16px}
  .gs-head{gap:12px}
  .gs-progress{min-width:140px;flex:1}
  .gs-step{flex-wrap:wrap;gap:12px}
  .gs-step-action{width:100%;margin-left:38px}
  .gs-step-action .gs-step-cta,.gs-step-action .gs-step-cta-done{display:inline-block}
}

/* Client-context breadcrumb strip for agency admins viewing a specific
   client. Lives above the main page content, not under the topbar, so
   it doesn't crowd the brand row. */
.client-context{
  background:var(--bg-edge);
  border-bottom:1px solid var(--gold-dim);
  padding:10px var(--gutter);
  font-size:12px;
  display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
}
.client-context .ctx-label{
  color:var(--gold);font-family:var(--label);
  text-transform:uppercase;letter-spacing:.14em;font-size:10px;
}

/* layout */
.page{
  max-width:var(--max);margin:0 auto;padding:40px var(--gutter) 80px;
}

/* headings */
h1,h2,h3{
  font-family:var(--serif);font-weight:400;
  letter-spacing:-.02em;line-height:1.15;margin:0;color:var(--text);
}
h1{font-size:clamp(26px,3.5vw,40px)}
h2{font-size:clamp(20px,2.5vw,28px)}
h3{font-size:clamp(15px,1.8vw,19px)}
em{color:var(--gold);font-weight:400}

/* label */
.label{
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.2em;font-size:11px;color:var(--text-mute);font-weight:500;
}

/* section header */
.section-header{margin-bottom:32px}
.section-header h1{margin-bottom:6px}
.section-sub{font-family:var(--mono);font-size:12px;color:var(--text-faint)}

/* cards */
.card{
  background:var(--bg-lift);
  border:1px solid var(--line);
  padding:28px 28px;
  border-radius:var(--radius);
  margin-bottom:16px;
  transition:border-color .3s var(--ease), box-shadow .3s var(--ease);
}
.card:hover{
  border-color:rgba(251,248,239,.18);
  box-shadow:0 2px 20px rgba(0,0,0,.2);
}
a.card:hover{border-color:var(--gold-dim)}

/* grade badge */
.grade{
  display:inline-flex;align-items:center;justify-content:center;
  width:48px;height:48px;border-radius:50%;
  font-family:var(--serif);font-size:24px;font-weight:400;
  border:2px solid currentColor;
  transition:transform .2s var(--ease);
}
.grade:hover{transform:scale(1.08)}
.grade-A{color:var(--green);background:rgba(94,199,106,.08)}
.grade-B{color:var(--gold);background:rgba(232,199,103,.08)}
.grade-C{color:var(--yellow);background:rgba(232,199,103,.06)}
.grade-D{color:var(--red);background:rgba(232,84,84,.06)}
.grade-F{color:var(--red);background:rgba(232,84,84,.08)}

/* score */
.score{
  font-family:var(--serif);font-size:36px;font-weight:400;
  letter-spacing:-.02em;
}
.score small{
  font-family:var(--mono);font-size:14px;color:var(--text-faint);
  margin-left:4px;
}

/* btn */
.btn{
  display:inline-flex;align-items:center;gap:12px;
  padding:12px 20px;border:1px solid var(--gold);
  border-radius:var(--radius);
  color:var(--gold);
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.2em;font-size:11px;font-weight:500;
  transition:all .25s var(--ease);
  cursor:pointer;
}
.btn:hover{background:var(--gold);color:var(--bg);transform:translateY(-1px);box-shadow:0 4px 12px rgba(232,199,103,.2)}
.btn:active{transform:translateY(0)}
.btn-ghost{
  border-color:var(--line);color:var(--text-mute);
}
.btn-ghost:hover{border-color:var(--text-mute);color:var(--text);background:transparent;transform:translateY(-1px);box-shadow:none}

/* form */
.form-group{margin-bottom:24px}
.form-group label{
  display:block;font-family:var(--label);text-transform:uppercase;
  letter-spacing:.16em;font-size:11px;color:var(--text-mute);
  font-weight:500;margin-bottom:8px;
}
.form-group input,.form-group select{
  width:100%;max-width:400px;
  padding:12px 16px;
  background:var(--bg-edge);border:1px solid var(--line);
  border-radius:var(--radius);
  color:var(--text);font-family:var(--mono);font-size:14px;
  outline:none;transition:border-color .2s, box-shadow .2s;
}
.form-group input:focus,.form-group select:focus{
  border-color:var(--gold-dim);
  box-shadow:0 0 0 3px rgba(232,199,103,.08);
}
.form-group input::placeholder{color:var(--text-faint)}

/* status badges */
.status{
  display:inline-block;padding:4px 10px;
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.16em;font-size:10px;font-weight:500;
  border:1px solid;border-radius:var(--radius);
}
.status-pending{color:var(--text-faint);border-color:var(--line)}
.status-in_progress{color:var(--gold);border-color:var(--gold-dim)}
.status-complete,.status-done{color:var(--green);border-color:var(--green)}

/* ---------- shared loading widgets ----------
   Row of dots that illuminate in a left-to-right wave, plus a
   constantly-pulsing container. Pure CSS, driven by the browser
   compositor, so nothing can pause it.
*/
.nr-busy{
  display:none;
  align-items:center;
  gap:14px;
  padding:10px 16px;
  background:rgba(201,168,76,.08);
  border:1px solid var(--gold-dim);
  border-radius:4px;
  font-family:var(--mono);
  font-size:13px;
  color:var(--gold);
  animation:nr-busy-pulse 1.6s ease-in-out infinite;
}
.nr-busy.on{display:inline-flex}
@keyframes nr-busy-pulse{
  0%,100%{background-color:rgba(201,168,76,.08);border-color:var(--gold-dim)}
  50%{background-color:rgba(201,168,76,.18);border-color:var(--gold)}
}
/* Dot row: 5 dots with negative animation-delays so each is already
   mid-cycle at display-visible time. Guarantees the stagger regardless
   of browser quirks around animation-start on display:none -> visible.
   Bigger dots (10px), longer bright window, dimmer baseline so the
   bright peak is unmistakable. */
.nr-dot-row{
  display:inline-flex;
  gap:8px;
  align-items:center;
  flex-shrink:0;
}
.nr-dot-row>span{
  display:inline-block;
  width:10px;
  height:10px;
  border-radius:50%;
  background:rgba(201,168,76,.14);
  animation-name:nr-dot-fill;
  animation-duration:2.4s;
  animation-timing-function:ease-in-out;
  animation-iteration-count:infinite;
}
/* Negative delays = animation is "already" that far in, so when the
   busy row becomes visible every dot is at a different phase.
   Dot 1 at t=0 is fresh, dot 2 is 260ms ahead in cycle, etc. This
   creates the wave from the very first rendered frame. */
/* Delays staggered so dot 1 reaches the bright peak first, then 2, 3,
   4, 5, then the cycle repeats. Each dot is offset by 20% of the 2.4s
   cycle (480ms) from the next. Peak keyframe is at 20%, so dot 1 at
   -0.48s is already at peak when the row appears. */
.nr-dot-row>span:nth-child(1){animation-delay:-.48s}
.nr-dot-row>span:nth-child(2){animation-delay:0s}
.nr-dot-row>span:nth-child(3){animation-delay:-1.92s}
.nr-dot-row>span:nth-child(4){animation-delay:-1.44s}
.nr-dot-row>span:nth-child(5){animation-delay:-.96s}
/* Single soft peak at 20% of the cycle. Ease-in-out on a long 2.4s
   duration plus gentle scale/glow makes the highlight drift across
   the row like a slow breath. Ramp spans 0-40%; the rest is dim. */
@keyframes nr-dot-fill{
  0%,40%,100%{
    background:rgba(201,168,76,.14);
    transform:scale(1);
    box-shadow:none;
  }
  20%{
    background:var(--gold);
    transform:scale(1.15);
    box-shadow:0 0 5px rgba(201,168,76,.4);
  }
}
/* Label next to the dot row. Subtle opacity pulse so the text feels
   alive even though it doesn't change. */
.nr-busy-label{
  animation:nr-label-fade 1.8s ease-in-out infinite;
  display:inline-block;
}
@keyframes nr-label-fade{
  0%,100%{opacity:1}
  50%{opacity:.65}
}

/* Cycling phase messages. Grid-stack all children in the same cell so
   the container auto-sizes to the longest phase — no absolute-positioned
   overflow. Each phase eases in, holds, eases out; delays stagger so
   exactly one is visible at a time. Pure CSS, no JS. */
.nr-phases{
  display:inline-grid;
  vertical-align:middle;
}
.nr-phases>.nr-phase{
  grid-area:1/1;
  opacity:0;
  animation-name:nr-phase-cycle;
  animation-duration:10s;
  animation-iteration-count:infinite;
  animation-timing-function:ease-in-out;
}
/* Four phases across a 10s loop = 2.5s each. Negative delays put each
   phase at the right point in the cycle so 1 lights first, then 2, 3, 4.
   Blocks with 3 phases just drop the 4th selector. */
.nr-phases>.nr-phase:nth-child(1){animation-delay:0s}
.nr-phases>.nr-phase:nth-child(2){animation-delay:-7.5s}
.nr-phases>.nr-phase:nth-child(3){animation-delay:-5s}
.nr-phases>.nr-phase:nth-child(4){animation-delay:-2.5s}
/* Ease in 0-5%, hold 5-20%, ease out 20-25%, stay dark 25-95%, ease back
   to full by 100%. The wraparound-to-100% keeps the transition between
   last and first phase smooth instead of snapping. */
@keyframes nr-phase-cycle{
  0%{opacity:1}
  20%{opacity:1}
  25%{opacity:0}
  95%{opacity:0}
  100%{opacity:1}
}

/* table */
.data-table{
  width:100%;border-collapse:collapse;
  font-family:var(--mono);font-size:14px;
}
.data-table th{
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.16em;font-size:11px;font-weight:500;
  color:var(--text-mute);text-align:left;
  padding:14px 16px;border-bottom:1px solid var(--line-strong);
}
.data-table td{
  padding:14px 16px;border-bottom:1px solid var(--line);
  color:var(--text-soft);
  transition:background .15s;
}
.data-table tr:hover td{background:rgba(251,248,239,.02)}
.data-table tbody tr{transition:background .15s}

/* narrative context blocks */
.narrative-context{
  font-size:14px;line-height:1.9;color:var(--text-mute);
  padding:20px 24px;
  background:var(--bg-edge);border-radius:var(--radius);
  border-left:2px solid rgba(232,199,103,.25);
}

/* empty state */
.empty{
  text-align:center;padding:80px 20px;
  color:var(--text-faint);font-size:14px;
}
.empty h3{color:var(--text-mute);margin-bottom:12px}

/* flash */
.flash{
  padding:14px 20px;margin-bottom:24px;
  font-family:var(--mono);font-size:13px;
  border-left:3px solid var(--gold);
  border-radius:var(--radius);
  background:var(--bg-lift);color:var(--text-soft);
}
.flash-error{border-left-color:var(--red);color:var(--red)}
.flash-warning{border-left-color:var(--yellow);color:var(--yellow)}

/* agency branding footer */
.powered-by{
  text-align:center;padding:40px 20px 30px;
  font-family:var(--mono);font-size:11px;color:var(--text-faint);
  letter-spacing:.08em;text-transform:uppercase;
}
.powered-by a{color:var(--text-faint);border-bottom:1px dotted var(--line)}
.powered-by a:hover{color:var(--text-mute);border-bottom-color:var(--text-mute)}

/* delta indicators */
.delta{font-size:13px;margin-top:4px;display:inline-block;font-family:var(--mono)}
.delta.up{color:var(--green)}
.delta.down{color:var(--red)}
.delta.flat{color:var(--text-faint)}

/* keyword pills */
.keyword-pill{
  display:inline-block;padding:6px 14px;margin:4px;
  background:var(--bg-edge);border:1px solid var(--line);
  border-radius:var(--radius);font-size:13px;color:var(--text-soft);
  transition:border-color .2s;
}
.keyword-pill:hover{border-color:var(--text-faint)}
.keyword-cat{
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.1em;font-size:10px;color:var(--gold);margin-right:8px;
}

/* tags */
.tag{
  display:inline-block;padding:3px 10px;
  background:var(--bg-edge);border:1px solid var(--line);
  border-radius:var(--radius);font-size:11px;text-transform:capitalize;
}

/* article body (knowledge base) */
.article-body h4{font-family:var(--serif);font-weight:400;font-size:16px;color:var(--text);margin:28px 0 8px;font-style:italic}
.article-body p{margin:0 0 16px}
.article-body ul{margin:0 0 16px;padding-left:20px}
.article-body li{margin-bottom:8px}
.article-body strong{color:var(--text);font-weight:400}

/* chart containers */
.chart-container{overflow:hidden;border-radius:var(--radius);background:var(--bg-edge)}

/* client picker cards */
.picker-card{
  display:flex;align-items:center;justify-content:space-between;
  padding:24px 28px;
  background:var(--bg-lift);border:1px solid var(--line);
  border-radius:var(--radius);
  transition:all .25s var(--ease);
  text-decoration:none;
}
.picker-card:hover{
  border-color:var(--gold-dim);
  background:var(--bg-edge);
  transform:translateY(-2px);
  box-shadow:0 4px 20px rgba(0,0,0,.3);
}
.picker-card .picker-name{
  font-family:var(--serif);font-size:20px;font-style:italic;color:var(--text);
}
.picker-card .picker-action{
  font-family:var(--label);font-size:10px;letter-spacing:.18em;
  text-transform:uppercase;color:var(--gold);
  transition:transform .2s;
}
.picker-card:hover .picker-action{transform:translateX(4px)}

/* small admin buttons */
.btn-sm{
  padding:6px 14px;font-size:12px;
  background:none;border:1px solid var(--line);
  color:var(--text-faint);cursor:pointer;
  border-radius:var(--radius);font-family:var(--mono);
  transition:all .2s;
}
.btn-sm:hover{border-color:var(--text-faint);color:var(--text)}

/* mobile nav */
.hamburger{
  display:none;cursor:pointer;background:none;border:none;padding:8px;
  color:var(--text-faint);font-size:20px;line-height:1;
}
@media(max-width:900px){
  .hamburger{display:block}
  .app-shell{grid-template-columns:1fr}
  .sidebar{
    position:fixed;top:56px;left:0;bottom:0;width:260px;
    transform:translateX(-100%);transition:transform .25s var(--ease);
    z-index:55;height:auto;overflow-y:auto;
    -webkit-overflow-scrolling:touch;
    background:var(--bg-edge);
    box-shadow:0 0 0 1px var(--line);
  }
  .sidebar.open{transform:translateX(0)}
  .sidebar-scrim{
    display:none;position:fixed;inset:56px 0 0 0;
    background:rgba(0,0,0,.5);z-index:54;
  }
  .sidebar-scrim.on{display:block}
  .card{padding:20px 18px}
  .page{padding:28px var(--gutter) 60px}
  h1{font-size:24px}
}

/* ---------- print ---------- */
@media print{
  :root{
    --text:#111 !important;
    --text-soft:#222 !important;
    --text-mute:#444 !important;
    --text-faint:#666 !important;
    --line:#ddd !important;
    --bg:#fff !important;
    --bg-lift:#f5f5f5 !important;
    --bg-edge:#eee !important;
  }
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
  body{background:#fff !important;color:#111 !important;font-size:11px !important}
  th,td{color:#222 !important}
  .grain,.topbar,.sidebar,.sidebar-scrim,.client-context,.hamburger,.no-print{display:none !important}
  .app-shell{display:block !important}
  body::before{display:none !important}
  .page{padding:0 !important;max-width:100% !important}
  .card,.data-table,table{break-inside:avoid}
  a{color:#111 !important;text-decoration:none !important}
  .grade{border:2px solid #333 !important;background:none !important}
  .grade-A{color:#27ae60 !important;border-color:#27ae60 !important}
  .grade-B{color:#e8c767 !important;border-color:#e8c767 !important}
  .grade-C{color:#e67e22 !important;border-color:#e67e22 !important}
  .grade-D,.grade-F{color:#c0392b !important;border-color:#c0392b !important}
  .score small{color:#666 !important}
  .label{color:#555 !important}
  .narrative-context{border-left-color:#ddd !important;background:#f9f9f9 !important;color:#555 !important}
  [style*="background:var(--bg-lift)"],[style*="background: var(--bg-lift)"]{background:#f5f5f5 !important;border-color:#ddd !important}
  [style*="background:var(--bg-edge)"],[style*="background: var(--bg-edge)"]{background:#eee !important}
  [style*="color:var(--text-soft)"],[style*="color: var(--text-soft)"]{color:#333 !important}
  [style*="color:var(--text-faint)"],[style*="color: var(--text-faint)"]{color:#777 !important}
  [style*="color:var(--text-mute)"],[style*="color: var(--text-mute)"]{color:#555 !important}
  [style*="color:var(--text)"],[style*="color: var(--text)"]{color:#111 !important}
  [style*="color:var(--gold)"],[style*="color: var(--gold)"]{color:#b8860b !important}
  [style*="border-color:var(--line)"],[style*="border: 1px solid var(--line)"]{border-color:#ddd !important}
  svg text{fill:#555 !important}
  svg line{stroke:#ddd !important}
  svg polyline{stroke:#b8860b !important}
  svg circle{fill:#b8860b !important;stroke:#fff !important}
  .print-header{display:flex !important;justify-content:space-between;align-items:center;padding-bottom:16px;margin-bottom:24px;border-bottom:2px solid #111}
  .print-header .print-logo{font-family:var(--serif);font-style:italic;font-size:18px;color:#111}
  .print-header .print-date{font-family:var(--mono);font-size:10px;color:#777}
  /* prevent orphan section headings -- keep heading with following content */
  h1,h2,h3,.section-title{break-after:avoid-page;page-break-after:avoid}
  .card,.data-table,table,tr,li{break-inside:avoid;page-break-inside:avoid}
  /* tighten the spaced-letter crumb labels so they don't look weird on paper */
  .label{letter-spacing:.08em !important}
  @page{margin:0.6in;size:letter}
}
`;
