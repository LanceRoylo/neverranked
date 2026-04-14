/**
 * Dashboard -- Google Search Console routes
 *
 * Admin: /admin/gsc -- connect account, link properties, view data
 * OAuth: /auth/google/callback -- handles Google OAuth redirect
 * Client: /search/:slug -- search performance dashboard
 */

import type { Env, User, GscSnapshot } from "../types";
import { html, layout, esc, redirect } from "../render";
import { getGoogleAuthUrl, exchangeCodeForTokens, listSites, getValidToken, fetchAggregateTotals, fetchSearchAnalytics } from "../gsc";

// ---------------------------------------------------------------------------
// OAuth callback
// ---------------------------------------------------------------------------

export async function handleGoogleCallback(
  request: Request,
  user: User,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return redirect("/admin/gsc?error=" + encodeURIComponent(error));
  }

  if (!code) {
    return redirect("/admin/gsc?error=no_code");
  }

  try {
    const origin = url.origin;
    const tokens = await exchangeCodeForTokens(code, env, origin);
    const now = Math.floor(Date.now() / 1000);

    // Store tokens (replace any existing)
    await env.DB.prepare("DELETE FROM gsc_tokens WHERE user_id = ?").bind(user.id).run();
    await env.DB.prepare(
      `INSERT INTO gsc_tokens (user_id, access_token, refresh_token, expires_at, scope, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      user.id,
      tokens.access_token,
      tokens.refresh_token,
      now + tokens.expires_in,
      "webmasters.readonly",
      now,
      now
    ).run();

    // Auto-discover and list available sites
    const sites = await listSites(tokens.access_token);
    if (sites.length > 0) {
      return redirect("/admin/gsc?connected=1&sites=" + sites.length);
    }

    return redirect("/admin/gsc?connected=1");
  } catch (err) {
    console.log("Google OAuth error: " + err);
    return redirect("/admin/gsc?error=" + encodeURIComponent("" + err));
  }
}

// ---------------------------------------------------------------------------
// Admin GSC management page
// ---------------------------------------------------------------------------

export async function handleAdminGsc(
  user: User,
  env: Env,
  url: URL
): Promise<Response> {
  const connected = url.searchParams.get("connected") === "1";
  const isPulling = url.searchParams.get("pulling") === "1";
  const error = url.searchParams.get("error");

  // Check if we have a valid token
  const accessToken = await getValidToken(env);
  const isConnected = !!accessToken;

  // Get linked properties
  const properties = (await env.DB.prepare(
    "SELECT * FROM gsc_properties ORDER BY client_slug"
  ).all<{ id: number; client_slug: string; site_url: string; permission_level: string | null }>()).results;

  // Get available sites if connected
  let availableSites: { siteUrl: string; permissionLevel: string }[] = [];
  if (isConnected && accessToken) {
    availableSites = await listSites(accessToken);
  }

  // Get client slugs for linking
  const clientSlugs = (await env.DB.prepare(
    "SELECT DISTINCT client_slug FROM domains WHERE active = 1 AND is_competitor = 0 ORDER BY client_slug"
  ).all<{ client_slug: string }>()).results;

  const origin = url.origin;
  const authUrl = getGoogleAuthUrl(env, origin);

  const body = `
    <div class="section-header">
      <h1>Search Console</h1>
      <div class="section-sub">Google Search Console integration</div>
    </div>

    ${error ? `
    <div class="flash flash-error" style="margin-bottom:24px">Error: ${esc(error)}</div>
    ` : ""}

    ${connected ? `
    <div class="flash" style="margin-bottom:24px">Google account connected successfully.</div>
    ` : ""}

    ${isPulling ? `
    <div id="pull-banner" class="card" style="border:1px solid var(--gold);background:rgba(232,199,103,0.06)">
      <div style="display:flex;align-items:center;gap:12px">
        <div id="pull-dot" style="width:8px;height:8px;border-radius:50%;background:var(--gold);animation:pulse 1.5s infinite"></div>
        <div>
          <div id="pull-title" style="color:var(--text);font-size:14px">Pulling search data from Google</div>
          <div id="pull-sub" style="color:var(--text-faint);font-size:12px;margin-top:4px">This takes about 15-30 seconds. This page will update when it finishes.</div>
        </div>
      </div>
    </div>
    <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}</style>
    <script>
    (function(){
      var started = Date.now();
      function check(){
        fetch("/api/gsc-status").then(function(r){return r.json()}).then(function(d){
          if(d.done){
            document.getElementById("pull-dot").style.animation="none";
            document.getElementById("pull-dot").style.background="var(--green)";
            document.getElementById("pull-title").textContent="Search data pulled successfully";
            document.getElementById("pull-sub").innerHTML='Data is ready. Click <strong>View data</strong> next to any client to see results.';
            document.getElementById("pull-banner").style.borderColor="var(--green)";
            document.getElementById("pull-banner").style.background="rgba(94,199,106,0.06)";
          } else if(Date.now()-started < 120000){
            setTimeout(check, 5000);
          }
        }).catch(function(){
          if(Date.now()-started < 120000) setTimeout(check, 8000);
        });
      }
      setTimeout(check, 5000);
    })();
    </script>
    ` : ""}

    <!-- Connection status -->
    <div class="card">
      <div class="label">Connection</div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:12px">
        <div style="width:10px;height:10px;border-radius:50%;background:${isConnected ? 'var(--green)' : 'var(--red)'}"></div>
        <div style="font-size:14px;color:var(--text)">${isConnected ? 'Google account connected' : 'Not connected'}</div>
      </div>
      ${!isConnected ? `
      <div style="margin-top:16px">
        <a href="${esc(authUrl)}" class="btn">Connect Google Search Console</a>
      </div>
      ` : `
      <div style="margin-top:12px;font-size:13px;color:var(--text-faint)">
        ${availableSites.length} site${availableSites.length !== 1 ? 's' : ''} accessible.
        <a href="${esc(authUrl)}" style="color:var(--gold);margin-left:8px">Reconnect</a>
      </div>
      `}
    </div>

    ${isConnected && availableSites.length > 0 ? `
    <!-- Link a property -->
    <div class="card">
      <div class="label">Link a site to a client</div>
      <form method="POST" action="/admin/gsc/link" style="margin-top:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
          <div>
            <div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">Site</div>
            <select name="site_url" style="padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:6px;min-width:280px">
              ${availableSites.map(s => {
                const already = properties.some(p => p.site_url === s.siteUrl);
                return '<option value="' + esc(s.siteUrl) + '"' + (already ? ' disabled' : '') + '>' + esc(s.siteUrl) + (already ? ' (linked)' : '') + '</option>';
              }).join("")}
            </select>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">Client</div>
            <select name="client_slug" style="padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:6px;min-width:180px">
              ${clientSlugs.map(c => '<option value="' + esc(c.client_slug) + '">' + esc(c.client_slug) + '</option>').join("")}
            </select>
          </div>
          <button type="submit" class="btn">Link</button>
        </div>
      </form>
    </div>
    ` : ""}

    ${properties.length > 0 ? `
    <!-- Linked properties -->
    <div class="card">
      <div class="label">Linked properties</div>
      <table class="data-table" style="margin-top:12px">
        <thead>
          <tr><th>Client</th><th>Site</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${properties.map(p => `
            <tr>
              <td>${esc(p.client_slug)}</td>
              <td>${esc(p.site_url)}</td>
              <td>
                <form method="POST" action="/admin/gsc/unlink/${p.id}" style="display:inline">
                  <button type="submit" class="btn-sm" style="color:var(--red);border-color:var(--red)">Unlink</button>
                </form>
                <a href="/search/${esc(p.client_slug)}" class="btn-sm" style="margin-left:8px;text-decoration:none;display:inline-block">View data</a>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ` : ""}

    ${isConnected && properties.length > 0 ? `
    <!-- Manual pull -->
    <div class="card">
      <form method="POST" action="/admin/gsc/pull">
        <button type="submit" class="btn" style="background:var(--gold);color:var(--bg)">Pull latest data now</button>
        <span style="font-size:12px;color:var(--text-faint);margin-left:8px">Fetches last 7 days of search performance</span>
      </form>
    </div>
    ` : ""}
  `;

  return html(layout("Search Console", body, user));
}

// ---------------------------------------------------------------------------
// Link / unlink properties
// ---------------------------------------------------------------------------

export async function handleLinkProperty(
  request: Request,
  env: Env
): Promise<Response> {
  const form = await request.formData();
  const siteUrl = (form.get("site_url") as string || "").trim();
  const clientSlug = (form.get("client_slug") as string || "").trim();

  if (siteUrl && clientSlug) {
    const now = Math.floor(Date.now() / 1000);
    // Check if already linked
    const existing = await env.DB.prepare(
      "SELECT id FROM gsc_properties WHERE site_url = ? AND client_slug = ?"
    ).bind(siteUrl, clientSlug).first();

    if (!existing) {
      await env.DB.prepare(
        "INSERT INTO gsc_properties (client_slug, site_url, permission_level, created_at) VALUES (?, ?, 'siteOwner', ?)"
      ).bind(clientSlug, siteUrl, now).run();
    }
  }

  return redirect("/admin/gsc");
}

export async function handleUnlinkProperty(
  propertyId: number,
  env: Env
): Promise<Response> {
  await env.DB.prepare("DELETE FROM gsc_properties WHERE id = ?").bind(propertyId).run();
  return redirect("/admin/gsc");
}

// ---------------------------------------------------------------------------
// Manual data pull
// ---------------------------------------------------------------------------

export async function handleManualGscPull(
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const { pullGscData } = await import("../gsc");
  ctx.waitUntil(pullGscData(env));
  return redirect("/admin/gsc?pulling=1");
}

// ---------------------------------------------------------------------------
// Client-facing search performance page
// ---------------------------------------------------------------------------

export async function handleSearchPerformance(
  slug: string,
  user: User,
  env: Env
): Promise<Response> {
  if (user.role === "client" && user.client_slug !== slug) {
    return redirect("/");
  }

  // Get latest snapshot
  const snapshots = (await env.DB.prepare(
    "SELECT * FROM gsc_snapshots WHERE client_slug = ? ORDER BY date_end DESC LIMIT 8"
  ).bind(slug).all<GscSnapshot>()).results;

  const latest = snapshots[0] || null;
  const previous = snapshots[1] || null;

  // Check if property is linked
  const property = await env.DB.prepare(
    "SELECT * FROM gsc_properties WHERE client_slug = ? LIMIT 1"
  ).bind(slug).first<{ site_url: string }>();

  if (!property) {
    const body = `
      <div class="section-header">
        <h1>Search Performance</h1>
        <div class="section-sub">${esc(slug)}</div>
      </div>
      <div class="empty">
        <h3>Search Console not connected</h3>
        <p>Google Search Console has not been linked for this client yet.</p>
        ${user.role === "admin" ? '<div style="margin-top:16px"><a href="/admin/gsc" class="btn">Connect Search Console</a></div>' : ''}
      </div>
    `;
    return html(layout("Search Performance", body, user, slug));
  }

  if (!latest) {
    const body = `
      <div class="section-header">
        <h1>Search Performance</h1>
        <div class="section-sub">${esc(slug)} -- ${esc(property.site_url)}</div>
      </div>
      <div class="empty">
        <h3>No search data yet</h3>
        <p>Data will appear after the first pull. ${user.role === "admin" ? 'Pull data from the <a href="/admin/gsc" style="color:var(--gold)">Search Console admin</a>.' : 'Check back soon.'}</p>
      </div>
    `;
    return html(layout("Search Performance", body, user, slug));
  }

  // Parse data
  const topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[] = JSON.parse(latest.top_queries);
  const topPages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[] = JSON.parse(latest.top_pages);

  // Deltas
  let clicksDelta = "";
  let impressionsDelta = "";
  let positionDelta = "";
  if (previous) {
    const cd = latest.clicks - previous.clicks;
    if (cd > 0) clicksDelta = '<span style="color:var(--green);font-size:12px;margin-left:8px">+' + cd + '</span>';
    else if (cd < 0) clicksDelta = '<span style="color:var(--red);font-size:12px;margin-left:8px">' + cd + '</span>';

    const id = latest.impressions - previous.impressions;
    if (id > 0) impressionsDelta = '<span style="color:var(--green);font-size:12px;margin-left:8px">+' + id.toLocaleString() + '</span>';
    else if (id < 0) impressionsDelta = '<span style="color:var(--red);font-size:12px;margin-left:8px">' + id.toLocaleString() + '</span>';

    const pd = previous.position - latest.position; // lower position = better
    if (pd > 0.5) positionDelta = '<span style="color:var(--green);font-size:12px;margin-left:8px">improved</span>';
    else if (pd < -0.5) positionDelta = '<span style="color:var(--red);font-size:12px;margin-left:8px">dropped</span>';
  }

  // Narrative
  const narrative = buildSearchNarrative(latest, previous, topQueries, slug);

  // Trend mini-chart from snapshots
  const chartData = [...snapshots].reverse();
  const allZero = chartData.every(d => d.clicks === 0);
  const chartHtml = chartData.length > 1 && !allZero ? (() => {
    const maxClicks = Math.max(...chartData.map(d => d.clicks), 1);
    const barW = 40;
    const gap = 24;
    const padLeft = 16;
    const chartH = 120;
    const labelH = 28;
    const topPad = 8;
    const totalW = padLeft + chartData.length * (barW + gap);
    const totalH = topPad + chartH + labelH;
    const bars = chartData.map((s, i) => {
      const rawH = (s.clicks / maxClicks) * chartH;
      const h = s.clicks > 0 ? Math.max(rawH, 4) : 0;
      const x = padLeft + i * (barW + gap);
      const y = topPad + chartH - h;
      const weekLabel = s.date_start.slice(5);
      return '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" fill="rgba(232,199,103,0.15)" stroke="var(--gold)" stroke-width="1" rx="3"/>' +
        (s.clicks > 0 ? '<text x="' + (x + barW / 2) + '" y="' + (y - 4) + '" text-anchor="middle" fill="var(--text-mute)" font-size="11" font-family="var(--mono)">' + s.clicks + '</text>' : '') +
        '<text x="' + (x + barW / 2) + '" y="' + (topPad + chartH + 16) + '" text-anchor="middle" fill="var(--text-faint)" font-size="9" font-family="var(--mono)">' + weekLabel + '</text>';
    }).join("");
    return '<div class="card">' +
      '<div class="label">Clicks trend (' + chartData.length + ' weeks)</div>' +
      '<div style="margin-top:16px;overflow-x:auto">' +
      '<svg viewBox="0 0 ' + totalW + ' ' + totalH + '" style="width:100%;max-width:' + totalW + 'px;height:auto;display:block">' +
      bars +
      '</svg></div></div>';
  })() : "";

  const body = `
    <div class="section-header">
      <h1>Search Performance</h1>
      <div class="section-sub">${esc(slug)} -- ${esc(latest.date_start)} to ${esc(latest.date_end)}</div>
    </div>

    <!-- Narrative context -->
    <div class="narrative-context" style="margin-bottom:24px">
      ${esc(narrative)}
    </div>

    <!-- KPI cards -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
      <div class="card" style="text-align:center">
        <div class="label">Clicks</div>
        <div style="font-size:28px;font-family:var(--serif);color:var(--text);margin-top:8px">${latest.clicks.toLocaleString()}</div>
        ${clicksDelta}
      </div>
      <div class="card" style="text-align:center">
        <div class="label">Impressions</div>
        <div style="font-size:28px;font-family:var(--serif);color:var(--text);margin-top:8px">${latest.impressions.toLocaleString()}</div>
        ${impressionsDelta}
      </div>
      <div class="card" style="text-align:center">
        <div class="label">CTR</div>
        <div style="font-size:28px;font-family:var(--serif);color:var(--text);margin-top:8px">${(latest.ctr * 100).toFixed(1)}%</div>
      </div>
      <div class="card" style="text-align:center">
        <div class="label">Avg Position</div>
        <div style="font-size:28px;font-family:var(--serif);color:var(--text);margin-top:8px">${latest.position.toFixed(1)}</div>
        ${positionDelta}
      </div>
    </div>

    ${chartHtml}

    <!-- Top queries -->
    ${topQueries.length > 0 ? `
    <div class="card">
      <div class="label">Top queries</div>
      <table class="data-table" style="margin-top:12px">
        <thead>
          <tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr>
        </thead>
        <tbody>
          ${topQueries.map(q => `
            <tr>
              <td>${esc(q.query)}</td>
              <td>${q.clicks}</td>
              <td>${q.impressions.toLocaleString()}</td>
              <td>${(q.ctr * 100).toFixed(1)}%</td>
              <td>${q.position.toFixed(1)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ` : ""}

    <!-- Top pages -->
    ${topPages.length > 0 ? `
    <div class="card">
      <div class="label">Top pages</div>
      <table class="data-table" style="margin-top:12px">
        <thead>
          <tr><th>Page</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr>
        </thead>
        <tbody>
          ${topPages.map(p => {
            let label = p.page;
            try { const u = new URL(p.page); label = u.pathname === "/" ? "Homepage" : u.pathname; } catch {}
            return '<tr><td title="' + esc(p.page) + '">' + esc(label) + '</td><td>' + p.clicks + '</td><td>' + p.impressions.toLocaleString() + '</td><td>' + (p.ctr * 100).toFixed(1) + '%</td><td>' + p.position.toFixed(1) + '</td></tr>';
          }).join("")}
        </tbody>
      </table>
    </div>
    ` : ""}

    ${user.role === "admin" ? `
    <div style="margin-top:16px">
      <a href="/admin/gsc" style="color:var(--gold);font-size:13px">Manage Search Console</a>
    </div>
    ` : ""}
  `;

  return html(layout("Search Performance", body, user, slug));
}

// ---------------------------------------------------------------------------
// Search performance narrative
// ---------------------------------------------------------------------------

function buildSearchNarrative(
  latest: GscSnapshot,
  previous: GscSnapshot | null,
  topQueries: { query: string; clicks: number; impressions: number }[],
  slug: string
): string {
  const parts: string[] = [];

  parts.push(
    "This data comes directly from Google Search Console and shows how " + slug + " performs in traditional Google search over the past 7 days."
  );

  if (latest.clicks === 0 && latest.impressions === 0) {
    parts.push(
      "No search activity recorded for this period. This is common for newer sites. As content is indexed and begins ranking, clicks and impressions will appear here."
    );
    return parts.join(" ");
  }

  if (latest.impressions > 0 && latest.clicks === 0) {
    parts.push(
      "The site appeared " + latest.impressions.toLocaleString() + " times in search results but received no clicks. This typically means rankings are on page 2 or lower. Improving position through content and authority work will convert impressions into visits."
    );
  } else if (latest.clicks > 0) {
    parts.push(
      latest.clicks.toLocaleString() + " clicks from " + latest.impressions.toLocaleString() + " impressions at a " + (latest.ctr * 100).toFixed(1) + "% click-through rate."
    );
    if (latest.position <= 10) {
      parts.push("Average position of " + latest.position.toFixed(1) + " means the site is appearing on page 1 for its ranking queries.");
    } else if (latest.position <= 20) {
      parts.push("Average position of " + latest.position.toFixed(1) + " puts the site on page 2. Moving key queries to page 1 would significantly increase click volume.");
    } else {
      parts.push("Average position of " + latest.position.toFixed(1) + " means most appearances are deep in results. The AEO roadmap work will help improve these positions over time.");
    }
  }

  // Week-over-week comparison
  if (previous) {
    const clicksDiff = latest.clicks - previous.clicks;
    const impDiff = latest.impressions - previous.impressions;

    if (clicksDiff > 0 && impDiff > 0) {
      parts.push("Both clicks and impressions grew compared to the previous week. That is positive momentum across the board.");
    } else if (clicksDiff > 0 && impDiff <= 0) {
      parts.push("Clicks increased even as impressions held steady or dipped, which means the click-through rate is improving. People are finding the listings more compelling.");
    } else if (clicksDiff < 0 && impDiff > 0) {
      parts.push("Impressions grew but clicks dipped, which usually means new rankings are coming in at lower positions where clicks are less likely. As those positions improve, clicks will follow.");
    } else if (clicksDiff < 0 && impDiff < 0) {
      parts.push("Both clicks and impressions dipped this week. Week-to-week variation is normal. The 4-week trend matters more than any single week.");
    }
  }

  // Top query insight
  if (topQueries.length > 0) {
    const topQ = topQueries[0];
    parts.push(
      "The top performing query is \"" + topQ.query + "\" with " + topQ.clicks + " clicks."
    );
  }

  return parts.join(" ");
}
