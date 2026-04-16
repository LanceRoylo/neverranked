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
  --text-faint:rgba(251,248,239,.65);
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
  font-weight:300;
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
.topbar{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px var(--gutter);
  border-bottom:1px solid var(--line);
  position:sticky;top:0;z-index:50;
  background:rgba(18,18,18,.96);
  backdrop-filter:blur(20px);
  -webkit-backdrop-filter:blur(20px);
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
.topbar .nav-links{
  display:flex;align-items:center;gap:28px;
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.16em;font-size:11px;
}
.topbar .nav-links a{
  color:var(--text-faint);
  transition:color .2s;
  position:relative;
  padding:4px 0;
}
.topbar .nav-links a::after{
  content:'';position:absolute;bottom:-2px;left:0;right:0;
  height:1px;background:var(--gold);
  transform:scaleX(0);transform-origin:center;
  transition:transform .25s var(--ease);
}
.topbar .nav-links a:hover{color:var(--text)}
.topbar .nav-links a:hover::after{transform:scaleX(1)}
.topbar .nav-links a.active{color:var(--gold)}
.topbar .nav-links a.active::after{transform:scaleX(1)}
.nav-badge{
  display:inline-flex;align-items:center;justify-content:center;
  min-width:16px;height:16px;padding:0 4px;
  background:var(--red);color:#fff;
  font-family:var(--mono);font-size:9px;font-weight:500;
  border-radius:8px;margin-right:6px;
  letter-spacing:0;text-transform:none;
  line-height:1;
}
.nav-dropdown{position:relative}
.nav-dropdown>.nav-links-item{cursor:pointer}
.nav-dropdown-menu{
  display:none;position:absolute;top:calc(100% + 8px);right:0;
  background:var(--bg-lift);border:1px solid var(--line-strong);
  min-width:180px;z-index:60;
  box-shadow:0 8px 24px rgba(0,0,0,.4);
}
.nav-dropdown:hover .nav-dropdown-menu{display:block}
.nav-dropdown-menu a{
  display:block;padding:10px 16px;
  font-family:var(--label);font-size:11px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--text-mute);transition:background .15s,color .15s;
  border-bottom:1px solid var(--line);
}
.nav-dropdown-menu a:last-child{border-bottom:none}
.nav-dropdown-menu a:hover{background:var(--gold-wash);color:var(--text)}
.nav-dropdown-menu a::after{display:none}
.topbar .user-info{
  font-family:var(--mono);font-size:12px;color:var(--text-faint);
  display:flex;align-items:center;gap:16px;
}
.topbar .user-info a{color:var(--text-mute);transition:color .2s}
.topbar .user-info a:hover{color:var(--gold)}

/* layout */
.page{
  max-width:var(--max);margin:0 auto;padding:48px var(--gutter) 80px;
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
@media(max-width:768px){
  .hamburger{display:block}
  .topbar .nav-links{
    display:none;position:absolute;top:100%;left:0;right:0;
    background:rgba(18,18,18,.98);
    backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
    border-bottom:1px solid var(--line);
    padding:8px 24px;flex-direction:column;gap:0;z-index:100;
  }
  .topbar .nav-links.open{display:flex}
  .topbar .nav-links .nav-links-item{
    padding:14px 0;border-bottom:1px solid var(--line);font-size:12px;
  }
  .topbar .nav-links .nav-links-item:last-child{border-bottom:none}
  .topbar .nav-links a::after{display:none}
  .topbar .user-info{font-size:10px}
  .topbar{flex-wrap:wrap}
  .card{padding:20px 18px}
  .page{padding:32px var(--gutter) 60px}
  h1{font-size:24px}
}

/* ---------- print ---------- */
@media print{
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
  body{background:#fff !important;color:#111 !important;font-size:11px !important}
  .grain,.topbar,.hamburger,.no-print{display:none !important}
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
  @page{margin:0.6in;size:letter}
}
`;
