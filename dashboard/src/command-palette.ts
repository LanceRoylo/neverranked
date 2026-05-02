/**
 * Command palette: Cmd+K (Mac) / Ctrl+K (Win) / "/" key opens a fuzzy
 * search over every navigable destination in the dashboard. Toast-style
 * discoverability that doesn't require memorizing the sidebar.
 *
 * Pure client-side: no D1 queries, no new endpoints. Static destination
 * index baked into the JS. To add a new destination, edit the array
 * below.
 *
 * Slug-aware: when the current page is a per-client view (e.g. citations,
 * bots, reddit), destinations that need a slug substitute the active
 * slug rather than landing on the picker. The slug is read from the
 * URL path at palette-open time.
 *
 * Sidebar collapse companion: this module also exports the script that
 * powers per-section show-more in render.ts. Co-located so the entire
 * nav-polish UX is one rollback target.
 */

export function commandPaletteHtml(): string {
  return `
<div id="cp-overlay" class="cp-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="cp-input">
  <div class="cp-modal" role="combobox" aria-expanded="true" aria-haspopup="listbox" aria-owns="cp-results">
    <div class="cp-search-row">
      <svg class="cp-search-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M11 11l3 3M11.5 6.5a5 5 0 11-10 0 5 5 0 0110 0z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      </svg>
      <input id="cp-input" type="text" placeholder="Search the dashboard..." autocomplete="off" spellcheck="false" aria-controls="cp-results" aria-autocomplete="list">
      <span class="cp-hint">esc</span>
    </div>
    <ul id="cp-results" class="cp-results" role="listbox" aria-label="Search results"></ul>
    <div class="cp-footer">
      <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span>
      <span><kbd>&crarr;</kbd> select</span>
      <span><kbd>esc</kbd> close</span>
    </div>
  </div>
</div>`;
}

/** Top-bar trigger button. Inserted next to the brand mark in the header
 *  so it's visible without opening anything. Click or keyboard shortcut
 *  both work. */
export function commandPaletteTrigger(): string {
  return `
<button id="cp-trigger" class="cp-trigger" aria-label="Search dashboard (⌘K)">
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M11 11l3 3M11.5 6.5a5 5 0 11-10 0 5 5 0 0110 0z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </svg>
  <span class="cp-trigger-label">Search</span>
  <span class="cp-trigger-kbd"><kbd>⌘</kbd><kbd>K</kbd></span>
</button>`;
}

export function commandPaletteCss(): string {
  return `
/* ---------- Command palette ---------- */
.cp-trigger{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;background:transparent;border:1px solid var(--line);border-radius:6px;color:var(--text-mute);font-family:var(--mono);font-size:11px;cursor:pointer;transition:color .15s,border-color .15s;line-height:1}
.cp-trigger:hover{color:var(--text);border-color:var(--line-strong)}
.cp-trigger-label{display:inline}
.cp-trigger-kbd{display:inline-flex;gap:2px;color:var(--text-faint)}
.cp-trigger-kbd kbd{display:inline-block;padding:1px 4px;border:1px solid var(--line);border-radius:3px;background:var(--bg-edge);color:var(--text-faint);font-family:var(--mono);font-size:10px;line-height:1}
@media (max-width:720px){.cp-trigger-label,.cp-trigger-kbd{display:none}}

.cp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding-top:14vh}
.cp-overlay[hidden]{display:none}
.cp-modal{width:min(640px,94vw);background:var(--bg-lift);border:1px solid var(--line-strong);border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.6);overflow:hidden;animation:cp-in .12s ease-out}
@keyframes cp-in{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}
.cp-search-row{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}
.cp-search-icon{color:var(--text-faint);flex-shrink:0}
#cp-input{flex:1;background:transparent;border:none;outline:none;color:var(--text);font-family:var(--label);font-size:16px;letter-spacing:.01em}
#cp-input::placeholder{color:var(--text-faint)}
.cp-hint{font-family:var(--mono);font-size:10px;color:var(--text-faint);padding:2px 6px;border:1px solid var(--line);border-radius:3px}
.cp-results{list-style:none;margin:0;padding:6px 0;max-height:50vh;overflow-y:auto}
.cp-results:empty::after{content:"Nothing matches.";display:block;text-align:center;color:var(--text-faint);font-size:13px;padding:24px}
.cp-result{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;color:var(--text-soft);font-size:13.5px;line-height:1.3;border-left:2px solid transparent}
.cp-result:hover,.cp-result.cp-active{background:var(--gold-wash);color:var(--text);border-left-color:var(--gold)}
.cp-result-title{flex:1;display:flex;align-items:center;gap:8px}
.cp-result-section{font-family:var(--label);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint)}
.cp-result-path{font-family:var(--mono);font-size:10px;color:var(--text-faint)}
.cp-section-empty{padding:8px 16px;font-family:var(--label);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint)}
.cp-footer{display:flex;gap:16px;padding:10px 16px;border-top:1px solid var(--line);font-family:var(--mono);font-size:10px;color:var(--text-faint);background:rgba(0,0,0,.18)}
.cp-footer kbd{display:inline-block;padding:1px 4px;border:1px solid var(--line);border-radius:3px;background:var(--bg-edge);color:var(--text-mute);font-family:var(--mono);font-size:10px;margin-right:3px;line-height:1}

/* Sidebar collapse */
.sidebar-section-header{display:flex;align-items:center;justify-content:space-between;cursor:default}
.sidebar-section.collapsible .sidebar-section-header{cursor:pointer;user-select:none}
.sidebar-section.collapsible .sidebar-section-header:hover{color:var(--text)}
.sidebar-section.collapsible .sidebar-section-header::after{content:"";display:inline-block;width:8px;height:8px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .15s;margin-left:8px;opacity:.5}
.sidebar-section.collapsible.cp-collapsed .sidebar-section-header::after{transform:rotate(-45deg)}
.sidebar-section.collapsible.cp-collapsed .sidebar-overflow{display:none}
.sidebar-overflow{display:flex;flex-direction:column}
.sidebar-show-more{display:none}
`;
}

/** The data + script that powers both the palette and the sidebar
 *  collapse. Inlined into the layout so there's no extra request. */
export function commandPaletteScript(opts: { isAdmin: boolean; canDraft: boolean; activeSlug: string | null }): string {
  // Destination index. Path templates with {slug} get resolved against
  // either the active page slug or (fallback) the user's primary slug.
  // Items with needsSlug=true and no resolvable slug fall through to
  // the picker page where one exists, otherwise are filtered out.
  const items: { title: string; section: string; path: string; needsSlug?: boolean; admin?: boolean; amplify?: boolean; aliases?: string[] }[] = [
    { title: "Dashboard", section: "Overview", path: "/" },
    { title: "Alerts", section: "Overview", path: "/alerts", aliases: ["notifications", "warnings"] },

    { title: "Summary", section: "Measure", path: "/summary/{slug}", needsSlug: true, aliases: ["overview", "snapshot"] },
    { title: "Reports", section: "Measure", path: "/report/{slug}", needsSlug: true, aliases: ["monthly"] },
    { title: "Search Performance", section: "Measure", path: "/search/{slug}", needsSlug: true, aliases: ["gsc", "google search console", "organic"] },
    { title: "Competitors", section: "Measure", path: "/competitors/{slug}", needsSlug: true },
    { title: "Citations", section: "Measure", path: "/citations/{slug}", needsSlug: true, aliases: ["ai citations", "share", "engines"] },
    { title: "Discover prompts", section: "Measure", path: "/discover/{slug}", needsSlug: true, aliases: ["prompt suggestions", "track new prompts"] },
    { title: "Reddit presence", section: "Measure", path: "/reddit/{slug}", needsSlug: true, aliases: ["subreddits", "reply briefs"] },
    { title: "Authority signals", section: "Measure", path: "/trust/{slug}", needsSlug: true, aliases: ["trust", "g2", "trustpilot", "capterra", "google business"] },
    { title: "Industry benchmark", section: "Measure", path: "/benchmark/{slug}", needsSlug: true, aliases: ["percentile", "ranking"] },
    { title: "Bot analytics", section: "Measure", path: "/bots/{slug}", needsSlug: true, aliases: ["crawlers", "gptbot", "perplexitybot", "claudebot"] },

    { title: "Roadmap", section: "Improve", path: "/roadmap/{slug}", needsSlug: true },
    { title: "Calendar", section: "Improve", path: "/calendar/{slug}", needsSlug: true, amplify: true, aliases: ["content calendar", "schedule"] },
    { title: "Voice profile", section: "Improve", path: "/voice/{slug}", needsSlug: true, amplify: true, aliases: ["brand voice", "fingerprint", "writing samples"] },
    { title: "Drafts", section: "Improve", path: "/drafts/{slug}", needsSlug: true, amplify: true },
    { title: "Publishing", section: "Improve", path: "/publishing/{slug}", needsSlug: true, amplify: true, aliases: ["wordpress", "webflow", "shopify", "cms"] },

    { title: "Knowledge base", section: "Learn", path: "/learn", aliases: ["docs", "help"] },
    { title: "Weekly Brief", section: "Learn", path: "/weekly", aliases: ["aeo brief"] },
    { title: "What's new", section: "Learn", path: "/changelog" },

    { title: "Cockpit", section: "Ops", path: "/admin", admin: true },
    { title: "Inbox", section: "Ops", path: "/admin/inbox", admin: true, aliases: ["needs attention", "approve"] },
    { title: "Weekly briefs (admin)", section: "Ops", path: "/admin/weekly-brief", admin: true },
    { title: "Content review", section: "Ops", path: "/admin/content-review", admin: true },
    { title: "Manage clients", section: "Ops", path: "/admin/manage", admin: true },
    { title: "Schema injection (admin)", section: "Ops", path: "/admin/inject", admin: true, aliases: ["json-ld", "schema admin", "approve schema"] },
    { title: "Keyword management (admin)", section: "Ops", path: "/admin/citations", admin: true, aliases: ["keywords", "tracked queries", "manage keywords"] },
    { title: "Scan health", section: "Ops", path: "/admin/scans", admin: true },
    { title: "Engagement", section: "Ops", path: "/admin/engagement", admin: true },
    { title: "Leads", section: "Ops", path: "/admin/leads", admin: true },
    { title: "Free check stats", section: "Ops", path: "/admin/free-check", admin: true, aliases: ["free scan"] },
    { title: "Email log", section: "Ops", path: "/admin/email-log", admin: true },
    { title: "Email test", section: "Ops", path: "/admin/email-test", admin: true },
    { title: "NPS responses", section: "Ops", path: "/admin/nps", admin: true },
    { title: "Exit signal", section: "Ops", path: "/admin/exit", admin: true, aliases: ["churn", "cancel"] },
    { title: "Reddit fetch test", section: "Ops", path: "/admin/reddit-fetch-test?url=https://www.reddit.com/r/smallbusiness/comments/1szw9q1/", admin: true },
    { title: "Gemini coverage preview", section: "Ops", path: "/admin/gemini-coverage-preview", admin: true },
  ];

  // Filter to what's visible to this user, then resolve {slug} templates.
  const visible = items.filter(i => {
    if (i.admin && !opts.isAdmin) return false;
    if (i.amplify && !opts.canDraft) return false;
    return true;
  }).map(i => {
    let path = i.path;
    if (i.needsSlug) {
      if (opts.activeSlug) path = path.replace("{slug}", opts.activeSlug);
      else path = path.replace("/{slug}", "");
    }
    return { ...i, path };
  });

  return `
<script>
(function(){
  var ITEMS = ${JSON.stringify(visible.map(i => ({ t: i.title, s: i.section, p: i.path, a: i.aliases || [] })))};
  var overlay = document.getElementById("cp-overlay");
  var input = document.getElementById("cp-input");
  var results = document.getElementById("cp-results");
  var trigger = document.getElementById("cp-trigger");
  if (!overlay || !input || !results) return;

  var active = 0;
  var visibleResults = [];

  function score(item, q) {
    if (!q) return 1;
    q = q.toLowerCase();
    var t = item.t.toLowerCase();
    var s = item.s.toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 90;
    if (t.indexOf(q) >= 0) return 80;
    for (var i = 0; i < item.a.length; i++) {
      var a = item.a[i].toLowerCase();
      if (a === q) return 75;
      if (a.startsWith(q)) return 70;
      if (a.indexOf(q) >= 0) return 60;
    }
    if (s.indexOf(q) >= 0) return 40;
    // fuzzy: every char of q appears in t in order
    var ti = 0, qi = 0, fuzz = 1;
    for (; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) { qi++; fuzz++; }
    }
    return qi === q.length ? 20 + fuzz : 0;
  }

  function render(q) {
    var matches = ITEMS.map(function(it){ return { item: it, score: score(it, q) }; })
      .filter(function(m){ return m.score > 0; })
      .sort(function(a, b){ return b.score - a.score; })
      .slice(0, 12);
    visibleResults = matches.map(function(m){ return m.item; });
    if (matches.length === 0) { results.innerHTML = ""; active = 0; return; }
    active = Math.min(active, matches.length - 1);
    results.innerHTML = matches.map(function(m, i){
      var sel = i === active ? " cp-active" : "";
      return '<li class="cp-result' + sel + '" data-i="' + i + '" role="option">' +
        '<span class="cp-result-title">' + escapeHtml(m.item.t) + '<span class="cp-result-section">' + escapeHtml(m.item.s) + '</span></span>' +
        '<span class="cp-result-path">' + escapeHtml(m.item.p) + '</span>' +
        '</li>';
    }).join("");
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function(c){ return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]; });
  }

  function open() {
    overlay.hidden = false;
    input.value = "";
    active = 0;
    render("");
    setTimeout(function(){ input.focus(); }, 10);
    document.body.style.overflow = "hidden";
  }
  function close() {
    overlay.hidden = true;
    document.body.style.overflow = "";
  }
  function go() {
    var item = visibleResults[active];
    if (item) {
      close();
      window.location.href = item.p;
    }
  }

  if (trigger) trigger.addEventListener("click", open);
  overlay.addEventListener("click", function(e){ if (e.target === overlay) close(); });
  input.addEventListener("input", function(){ active = 0; render(input.value.trim()); });
  input.addEventListener("keydown", function(e){
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, visibleResults.length - 1); render(input.value.trim()); var el = results.querySelector(".cp-active"); if (el) el.scrollIntoView({block:"nearest"}); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); render(input.value.trim()); var el2 = results.querySelector(".cp-active"); if (el2) el2.scrollIntoView({block:"nearest"}); }
    else if (e.key === "Enter") { e.preventDefault(); go(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  results.addEventListener("click", function(e){
    var li = e.target.closest(".cp-result");
    if (!li) return;
    active = parseInt(li.getAttribute("data-i"), 10);
    go();
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", function(e){
    var meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "k") { e.preventDefault(); overlay.hidden ? open() : close(); return; }
    if (overlay.hidden && e.key === "/" && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
      e.preventDefault();
      open();
    }
  });
})();

// Sidebar collapse: persists per-section state in localStorage.
(function(){
  var KEY = "nr.sidebar.collapsed";
  var stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch(e) {}
  var sections = document.querySelectorAll(".sidebar-section.collapsible");
  sections.forEach(function(sec){
    var key = sec.getAttribute("data-section");
    if (!key) return;
    if (stored[key] === true || (stored[key] === undefined && sec.hasAttribute("data-default-collapsed"))) {
      sec.classList.add("cp-collapsed");
    }
    var header = sec.querySelector(".sidebar-section-header");
    if (header) {
      header.addEventListener("click", function(){
        sec.classList.toggle("cp-collapsed");
        stored[key] = sec.classList.contains("cp-collapsed");
        try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch(e) {}
      });
    }
  });
})();
</script>
`;
}
