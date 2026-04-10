// Single CSS string. Editorial palette, denser than marketing site.
// Drop-in: <style>${CSS}</style>

export const CSS = `
:root {
  --bg: #121212;
  --bg-lift: #1c1c1c;
  --bg-edge: #242424;
  --gold: #e8c767;
  --gold-dim: #bfa04d;
  --gold-wash: rgba(232,199,103,.14);
  --text: #fbf8ef;
  --text-soft: rgba(251,248,239,.98);
  --text-mute: rgba(251,248,239,.78);
  --text-faint: rgba(251,248,239,.54);
  --line: rgba(251,248,239,.22);
  --line-strong: rgba(251,248,239,.40);
  --danger: #e07b5a;
  --ok: #7fc99a;

  --serif: "Playfair Display", Georgia, serif;
  --mono: "DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --label: "Barlow Condensed", "Arial Narrow", sans-serif;
}

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
a:hover { color: var(--gold); }
button, input, select, textarea { font: inherit; color: inherit; }
code {
  font-family: var(--mono);
  background: var(--bg-lift);
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: 2px;
  font-size: 12px;
}
::selection { background: var(--gold); color: var(--bg); }

/* ---------- layout ---------- */
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px;
  border-bottom: 1px solid var(--line);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 10;
}
.topbar .brand {
  font-family: var(--serif);
  font-size: 18px;
  font-style: italic;
  letter-spacing: .01em;
}
.topbar .brand sup {
  font-family: var(--mono);
  font-size: 9px;
  color: var(--gold);
  font-style: normal;
  margin-left: 2px;
}
.topbar nav {
  display: flex;
  gap: 22px;
  font-family: var(--label);
  font-size: 12px;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.topbar nav a {
  color: var(--text-mute);
  padding-bottom: 3px;
  border-bottom: 1px solid transparent;
}
.topbar nav a:hover,
.topbar nav a.active {
  color: var(--text);
  border-bottom-color: var(--gold);
}
.topbar .session {
  font-family: var(--label);
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.topbar .session a { margin-left: 10px; color: var(--text-mute); }

.main {
  flex: 1;
  padding: 28px 22px 60px;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
}

.footer {
  padding: 18px 22px;
  border-top: 1px solid var(--line);
  font-family: var(--label);
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--text-faint);
  display: flex;
  justify-content: space-between;
}

/* ---------- section headers ---------- */
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.section-head h1 {
  font-family: var(--serif);
  font-weight: 400;
  font-size: clamp(24px, 2.5vw, 32px);
  letter-spacing: -.01em;
  margin: 0;
}
.section-head h1 em {
  color: var(--gold);
  font-style: italic;
}
.section-head .meta {
  font-family: var(--label);
  font-size: 11px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--text-faint);
}

/* ---------- cards + grids ---------- */
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}
@media (max-width: 900px) { .grid-3 { grid-template-columns: 1fr; } }

.card {
  background: var(--bg-lift);
  border: 1px solid var(--line);
  padding: 18px;
}
.card h2 {
  font-family: var(--label);
  font-size: 11px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--text-mute);
  margin: 0 0 10px;
}
.card h3 {
  font-family: var(--serif);
  font-weight: 400;
  font-size: 20px;
  margin: 0;
}

/* ---------- stats ---------- */
.stats {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0;
  border: 1px solid var(--line);
  background: var(--bg-lift);
  margin-bottom: 28px;
}
@media (max-width: 900px) { .stats { grid-template-columns: repeat(2, 1fr); } }
.stat {
  padding: 16px 14px;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat:last-child { border-right: 0; }
.stat .label {
  font-family: var(--label);
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.stat .value {
  font-family: var(--serif);
  font-size: 28px;
  color: var(--text);
}
.stat a { display: block; }
.stat a:hover .value { color: var(--gold); }

/* ---------- tables ---------- */
.table-wrap {
  border: 1px solid var(--line);
  background: var(--bg-lift);
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th, td {
  text-align: left;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}
thead th {
  font-family: var(--label);
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--text-faint);
  border-bottom: 1px solid var(--line-strong);
  background: var(--bg);
}
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: rgba(232,199,103,.05); }
td a { color: var(--gold); border-bottom: 1px solid rgba(232,199,103,.3); transition: border-color .3s; }
td a:hover { border-bottom-color: var(--gold); }
td.mono, th.mono { font-family: var(--mono); }
td.muted { color: var(--text-mute); }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
.empty-row td {
  text-align: center;
  color: var(--text-faint);
  padding: 36px;
  font-style: italic;
}

/* ---------- badges ---------- */
.badge {
  display: inline-block;
  font-family: var(--label);
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
  padding: 3px 8px;
  border: 1px solid var(--line-strong);
  color: var(--text-mute);
  background: transparent;
}
.badge-prospect    { color: var(--text-mute); }
.badge-paid        { color: var(--gold); border-color: var(--gold-dim); }
.badge-auditing    { color: var(--gold); border-color: var(--gold); background: var(--gold-wash); }
.badge-delivered   { color: var(--text); }
.badge-implementing{ color: var(--text); border-color: var(--line-strong); }
.badge-ongoing     { color: var(--ok); border-color: var(--ok); }
.badge-churned     { color: var(--text-faint); }

.badge-new       { color: var(--gold); border-color: var(--gold); }
.badge-contacted { color: var(--text); }
.badge-converted { color: var(--ok); border-color: var(--ok); }
.badge-rejected  { color: var(--text-faint); }

/* ---------- filter bar ---------- */
.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.filter-bar .filters { display: flex; gap: 6px; flex-wrap: wrap; }
.filter-bar .filters a {
  font-family: var(--label);
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
  padding: 6px 10px;
  border: 1px solid var(--line);
  color: var(--text-mute);
}
.filter-bar .filters a:hover { color: var(--text); border-color: var(--line-strong); }
.filter-bar .filters a.active {
  color: var(--bg);
  background: var(--gold);
  border-color: var(--gold);
}

/* ---------- forms ---------- */
form.form { max-width: 640px; }
.field { margin-bottom: 18px; }
.field label {
  display: block;
  font-family: var(--label);
  font-size: 11px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--text-mute);
  margin-bottom: 6px;
}
.field .hint {
  font-size: 11px;
  color: var(--text-faint);
  margin-top: 4px;
}
.field input[type="text"],
.field input[type="email"],
.field input[type="password"],
.field input[type="url"],
.field select,
.field textarea {
  width: 100%;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--line);
  padding: 10px 12px;
  font-family: var(--mono);
  font-size: 13px;
  outline: none;
}
.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px var(--gold);
}
.field textarea {
  min-height: 180px;
  line-height: 1.5;
  resize: vertical;
}
.form-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

button.btn, a.btn {
  display: inline-block;
  font-family: var(--label);
  font-size: 11px;
  letter-spacing: .14em;
  text-transform: uppercase;
  padding: 10px 18px;
  border: 1px solid var(--gold);
  background: transparent;
  color: var(--gold);
  cursor: pointer;
  transition: all .2s;
}
button.btn:hover, a.btn:hover {
  background: var(--gold);
  color: var(--bg);
}
button.btn.ghost, a.btn.ghost {
  border-color: var(--line-strong);
  color: var(--text-mute);
}
button.btn.ghost:hover, a.btn.ghost:hover {
  background: transparent;
  color: var(--text);
  border-color: var(--text);
}

/* ---------- client detail ---------- */
.detail-grid {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 28px;
  align-items: start;
}
@media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr; } }
.detail-notes {
  background: var(--bg-lift);
  border: 1px solid var(--line);
  padding: 22px;
}
.detail-notes h1,
.detail-notes h2,
.detail-notes h3,
.detail-notes h4,
.detail-notes h5 {
  font-family: var(--serif);
  font-weight: 400;
  margin: 22px 0 10px;
  color: var(--text);
}
.detail-notes h3 { font-size: 22px; }
.detail-notes h4 { font-size: 16px; color: var(--gold); }
.detail-notes h5 { font-size: 13px; text-transform: uppercase; letter-spacing: .1em; color: var(--text-mute); font-family: var(--label); }
.detail-notes p { color: var(--text-mute); margin: 10px 0; }
.detail-notes ul { color: var(--text-mute); padding-left: 18px; }
.detail-notes li { margin: 4px 0; }
.detail-notes a { color: var(--gold); border-bottom: 1px dotted var(--gold-dim); }

.detail-kv { margin-top: 6px; }
.detail-kv dt {
  font-family: var(--label);
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-top: 14px;
}
.detail-kv dd {
  margin: 4px 0 0;
  color: var(--text);
  font-size: 13px;
}

/* ---------- login ---------- */
.login-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.login-card {
  width: 100%;
  max-width: 380px;
  border: 1px solid var(--line);
  background: var(--bg-lift);
  padding: 36px 32px;
}
.login-card .brand {
  font-family: var(--serif);
  font-style: italic;
  font-size: 26px;
  margin: 0 0 6px;
}
.login-card .tag {
  font-family: var(--label);
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 24px;
}

/* ---------- flash / errors ---------- */
.flash {
  padding: 12px 14px;
  border: 1px solid var(--danger);
  color: var(--danger);
  margin-bottom: 18px;
  font-size: 12px;
  background: rgba(224,123,90,.06);
}
.flash.ok { border-color: var(--ok); color: var(--ok); background: rgba(127,201,154,.06); }

/* ---------- helpers ---------- */
.row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.row-actions form { display: inline; }
.row-actions button {
  font-family: var(--label);
  font-size: 10px;
  letter-spacing: .12em;
  text-transform: uppercase;
  padding: 5px 9px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text-mute);
  cursor: pointer;
}
.row-actions button:hover { color: var(--gold); border-color: var(--gold); }
`;
