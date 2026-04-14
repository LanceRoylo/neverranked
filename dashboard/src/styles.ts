/**
 * Dashboard — Shared CSS
 */

export const CSS = `
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
  --red:#e85454;
  --green:#5ec76a;
  --yellow:#e8c767;

  --serif:"Playfair Display",Georgia,serif;
  --mono:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --label:"Barlow Condensed","Arial Narrow",sans-serif;

  --gutter:clamp(20px,4vw,48px);
  --max:1200px;
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
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
::selection{background:var(--gold);color:var(--bg)}
img,svg{display:block;max-width:100%}

/* grain */
.grain{
  position:fixed;inset:-50%;width:200%;height:200%;
  pointer-events:none;z-index:100;opacity:.12;mix-blend-mode:overlay;
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
  padding:20px var(--gutter);
  border-bottom:1px solid var(--line);
  position:sticky;top:0;z-index:50;
  background:rgba(18,18,18,.92);
  backdrop-filter:blur(12px);
  -webkit-backdrop-filter:blur(12px);
}
.topbar .mark{
  font-family:var(--serif);font-style:italic;font-size:18px;
  letter-spacing:-.01em;color:var(--text);
}
.topbar .mark sup{
  font-family:var(--label);font-style:normal;font-size:8px;
  letter-spacing:.2em;margin-left:3px;vertical-align:super;opacity:.7;
}
.topbar .nav-links{
  display:flex;align-items:center;gap:24px;
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.18em;font-size:10px;
}
.topbar .nav-links a{color:var(--text-faint);transition:color .25s}
.topbar .nav-links a:hover{color:var(--text)}
.topbar .nav-links a.active{color:var(--gold)}
.topbar .user-info{
  font-family:var(--mono);font-size:11px;color:var(--text-faint);
  display:flex;align-items:center;gap:16px;
}
.topbar .user-info a{color:var(--text-mute);transition:color .25s}
.topbar .user-info a:hover{color:var(--gold)}

/* layout */
.page{
  max-width:var(--max);margin:0 auto;padding:48px var(--gutter);
}

/* headings */
h1,h2,h3{
  font-family:var(--serif);font-weight:400;
  letter-spacing:-.015em;line-height:1.1;margin:0;color:var(--text);
}
h1{font-size:clamp(28px,4vw,44px)}
h2{font-size:clamp(22px,3vw,32px)}
h3{font-size:clamp(16px,2vw,20px)}
em{color:var(--gold);font-weight:400}

/* label */
.label{
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.22em;font-size:10px;color:var(--text-mute);font-weight:500;
}

/* cards */
.card{
  background:var(--bg-lift);border:1px solid var(--line);
  padding:28px 24px;border-radius:2px;
  transition:border-color .35s var(--ease);
}
.card:hover{border-color:var(--gold-dim)}

/* grade badge */
.grade{
  display:inline-flex;align-items:center;justify-content:center;
  width:48px;height:48px;border-radius:50%;
  font-family:var(--serif);font-size:24px;font-weight:400;
  border:2px solid currentColor;
}
.grade-A{color:var(--green)}
.grade-B{color:var(--gold)}
.grade-C{color:var(--yellow)}
.grade-D{color:var(--red)}
.grade-F{color:var(--red)}

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
  padding:14px 22px;border:1px solid var(--gold);
  color:var(--gold);
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.2em;font-size:11px;font-weight:500;
  transition:background .35s var(--ease),color .35s var(--ease);
  cursor:pointer;
}
.btn:hover{background:var(--gold);color:var(--bg)}
.btn-ghost{
  border-color:var(--line);color:var(--text-mute);
}
.btn-ghost:hover{border-color:var(--text-mute);color:var(--text);background:transparent}

/* form */
.form-group{margin-bottom:24px}
.form-group label{
  display:block;font-family:var(--label);text-transform:uppercase;
  letter-spacing:.18em;font-size:10px;color:var(--text-mute);
  font-weight:500;margin-bottom:8px;
}
.form-group input,.form-group select{
  width:100%;max-width:400px;
  padding:12px 16px;
  background:var(--bg-edge);border:1px solid var(--line);
  color:var(--text);font-family:var(--mono);font-size:14px;
  outline:none;transition:border-color .25s;
}
.form-group input:focus,.form-group select:focus{
  border-color:var(--gold-dim);
}
.form-group input::placeholder{color:var(--text-faint)}

/* status badges */
.status{
  display:inline-block;padding:4px 10px;
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.18em;font-size:9px;font-weight:500;
  border:1px solid;border-radius:2px;
}
.status-pending{color:var(--text-faint);border-color:var(--line)}
.status-in_progress{color:var(--gold);border-color:var(--gold-dim)}
.status-complete{color:var(--green);border-color:var(--green)}

/* table */
.data-table{
  width:100%;border-collapse:collapse;
  font-family:var(--mono);font-size:13px;
}
.data-table th{
  font-family:var(--label);text-transform:uppercase;
  letter-spacing:.18em;font-size:10px;font-weight:500;
  color:var(--text-mute);text-align:left;
  padding:12px 16px;border-bottom:1px solid var(--line-strong);
}
.data-table td{
  padding:12px 16px;border-bottom:1px solid var(--line);
  color:var(--text-soft);
}
.data-table tr:hover td{background:var(--bg-lift)}

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
  background:var(--bg-lift);color:var(--text-soft);
}
.flash-error{border-left-color:var(--red);color:var(--red)}

/* mobile nav */
.hamburger{
  display:none;cursor:pointer;background:none;border:none;padding:8px;
  color:var(--text-faint);font-size:20px;line-height:1;
}
@media(max-width:768px){
  .hamburger{display:block}
  .topbar .nav-links{
    display:none;position:absolute;top:100%;left:0;right:0;
    background:var(--bg-lift);border-bottom:1px solid var(--line);
    padding:12px 24px;flex-direction:column;gap:0;z-index:100;
  }
  .topbar .nav-links.open{display:flex}
  .topbar .nav-links .nav-links-item{
    padding:12px 0;border-bottom:1px solid var(--line);font-size:13px;
  }
  .topbar .nav-links .nav-links-item:last-child{border-bottom:none}
  .topbar .user-info{font-size:10px}
  .topbar{flex-wrap:wrap}
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
  .grade{border:2px solid #333 !important}
  .grade-A{color:#27ae60 !important;border-color:#27ae60 !important}
  .grade-B{color:#e8c767 !important;border-color:#e8c767 !important}
  .grade-C{color:#e67e22 !important;border-color:#e67e22 !important}
  .grade-D,.grade-F{color:#c0392b !important;border-color:#c0392b !important}
  .score small{color:#666 !important}
  .label{color:#555 !important}
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
