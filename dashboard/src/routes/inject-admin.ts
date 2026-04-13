/**
 * Schema Injection — Admin management UI and handlers
 *
 * GET  /admin/inject/:slug        — Management page
 * POST /admin/inject/:slug/config — Save business info
 * POST /admin/inject/:slug/generate/:type — Auto-generate schema
 * POST /admin/inject/:slug/approve/:id — Approve a draft
 * POST /admin/inject/:slug/pause/:id — Pause an approved injection
 * POST /admin/inject/:slug/edit/:id — Edit JSON-LD
 * POST /admin/inject/:slug/delete/:id — Archive an injection
 * POST /admin/inject/:slug/publish — Cache-bust (regenerate token)
 */

import type { Env, User, SchemaInjection, InjectionConfig } from "../types";
import { layout, html, esc, redirect } from "../render";
import {
  autoGenerate,
  validateJsonLd,
  SCHEMA_TYPES,
  type SchemaType,
} from "../schema-generator";

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- GET: Admin page ----------

export async function handleInjectAdmin(
  slug: string,
  user: User,
  env: Env
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  // Get or create config
  let config = await env.DB.prepare(
    "SELECT * FROM injection_configs WHERE client_slug = ?"
  )
    .bind(slug)
    .first<InjectionConfig>();

  if (!config) {
    // Auto-create config
    const token = randomHex(8);
    await env.DB.prepare(
      "INSERT INTO injection_configs (client_slug, snippet_token, created_at, updated_at) VALUES (?, ?, ?, ?)"
    )
      .bind(slug, token, now, now)
      .run();
    config = await env.DB.prepare(
      "SELECT * FROM injection_configs WHERE client_slug = ?"
    )
      .bind(slug)
      .first<InjectionConfig>();
  }

  if (!config) {
    return html(layout("Inject", `<div class="empty"><h3>Error</h3><p>Could not load config.</p></div>`, user), 500);
  }

  // Get all injections for this client
  const injections = (
    await env.DB.prepare(
      "SELECT * FROM schema_injections WHERE client_slug = ? AND status != 'archived' ORDER BY schema_type"
    )
      .bind(slug)
      .all<SchemaInjection>()
  ).results;

  // Get latest scan for schema coverage
  const domain = await env.DB.prepare(
    "SELECT id FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  )
    .bind(slug)
    .first<{ id: number }>();

  let schemaCoverage: { type: string; present: boolean }[] = [];
  if (domain) {
    const scan = await env.DB.prepare(
      "SELECT schema_coverage FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1"
    )
      .bind(domain.id)
      .first<{ schema_coverage: string }>();
    if (scan?.schema_coverage) {
      try {
        schemaCoverage = JSON.parse(scan.schema_coverage);
      } catch {}
    }
  }

  // Parse config fields for form
  const addr = config.business_address
    ? (() => {
        try { return JSON.parse(config.business_address); } catch { return {}; }
      })()
    : {};
  const social = config.business_social
    ? (() => {
        try { return JSON.parse(config.business_social); } catch { return []; }
      })()
    : [];

  // Determine which schema types are missing from scan and not yet generated
  const existingTypes = new Set(injections.map((i) => i.schema_type));
  const presentInScan = new Set(
    schemaCoverage.filter((s) => s.present).map((s) => s.type)
  );

  // Build status badges
  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "#888",
      approved: "#4ade80",
      paused: "#f59e0b",
    };
    return `<span style="display:inline-block;padding:2px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${colors[status] || "#888"};background:rgba(${status === "approved" ? "74,222,128" : status === "paused" ? "245,158,11" : "136,136,136"},.12);border-radius:2px">${esc(status)}</span>`;
  };

  // Snippet URL
  const snippetUrl = `https://app.neverranked.com/inject/${slug}.js?v=${config.snippet_token}`;

  // ---------- Build HTML ----------

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">Admin / Schema Injection</div>
      <h1>Inject: <em>${esc(slug)}</em></h1>
    </div>

    <!-- Delivery snippet -->
    <div class="card" style="margin-bottom:32px;border:1px solid var(--gold-dim)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3>Delivery <em>snippet</em></h3>
        <div style="display:flex;gap:8px;align-items:center">
          ${config.enabled
            ? '<span style="color:#4ade80;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase">LIVE</span>'
            : '<span style="color:#ef4444;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase">DISABLED</span>'
          }
          <form method="POST" action="/admin/inject/${esc(slug)}/publish" style="display:inline">
            <button type="submit" class="btn" style="padding:4px 10px;font-size:9px">Publish changes</button>
          </form>
        </div>
      </div>
      <div style="background:var(--bg-edge);padding:12px 16px;border-radius:4px;font-family:var(--mono);font-size:12px;color:var(--text-faint);word-break:break-all;margin-bottom:12px">
        &lt;script src="${esc(snippetUrl)}"&gt;&lt;/script&gt;
      </div>
      <div style="font-size:11px;color:var(--text-faint);line-height:1.6">
        Add this to the client's &lt;head&gt; via Google Tag Manager (Custom HTML tag, All Pages trigger) or paste directly in their site header.
        <strong style="color:var(--text)"> ${injections.filter((i) => i.status === "approved").length} approved schema blocks</strong> will be injected.
      </div>
    </div>

    <!-- Schema coverage from scan -->
    <div class="card" style="margin-bottom:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3>Schema <em>coverage</em></h3>
        <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">From latest scan</span>
      </div>

      ${schemaCoverage.length > 0
        ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:24px">
          ${schemaCoverage
            .map((s) => {
              const hasInjection = existingTypes.has(s.type);
              const icon = s.present ? "+" : hasInjection ? "~" : "-";
              const color = s.present
                ? "#4ade80"
                : hasInjection
                ? "#e8c767"
                : "#ef4444";
              const label = s.present
                ? "Found on site"
                : hasInjection
                ? "Injection created"
                : "Missing";
              return `<div style="padding:10px 12px;background:var(--bg-edge);border-radius:4px;display:flex;align-items:center;gap:8px">
                <span style="color:${color};font-weight:600;font-size:16px;width:16px;text-align:center">${icon}</span>
                <div>
                  <div style="font-size:12px;font-weight:500">${esc(s.type)}</div>
                  <div style="font-size:10px;color:var(--text-faint)">${label}</div>
                </div>
              </div>`;
            })
            .join("")}
        </div>`
        : '<div style="color:var(--text-faint);font-size:13px;margin-bottom:16px">No scan data yet. Run a scan first to see schema coverage.</div>'
      }

      <!-- Generate buttons for missing types -->
      ${config.business_name
        ? `<div style="display:flex;flex-wrap:wrap;gap:8px">
          ${SCHEMA_TYPES.filter(
            (t) => !existingTypes.has(t) && !presentInScan.has(t)
          )
            .map(
              (t) =>
                `<form method="POST" action="/admin/inject/${esc(slug)}/generate/${t}" style="display:inline"><button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:10px">Generate ${esc(t)}</button></form>`
            )
            .join("")}
          ${SCHEMA_TYPES.filter((t) => !existingTypes.has(t) && !presentInScan.has(t)).length === 0 ? '<span style="color:var(--text-faint);font-size:12px">All types covered or generated</span>' : ""}
        </div>`
        : '<div style="color:var(--text-faint);font-size:12px">Fill in business info below to enable auto-generation.</div>'
      }
    </div>

    <!-- Injections list -->
    <div class="card" style="margin-bottom:32px">
      <h3 style="margin-bottom:16px">Schema <em>blocks</em></h3>
      ${injections.length > 0
        ? injections
            .map(
              (inj) => `
            <div style="padding:16px;background:var(--bg-edge);border-radius:4px;margin-bottom:12px;border-left:3px solid ${inj.status === "approved" ? "#4ade80" : inj.status === "paused" ? "#f59e0b" : "#888"}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-weight:600;font-size:13px">${esc(inj.schema_type)}</span>
                  ${statusBadge(inj.status)}
                  <span style="font-size:10px;color:var(--text-faint)">${inj.target_pages === "*" ? "All pages" : esc(inj.target_pages)}</span>
                </div>
                <div style="display:flex;gap:6px;align-items:center">
                  ${inj.status === "draft"
                    ? `<form method="POST" action="/admin/inject/${esc(slug)}/approve/${inj.id}" style="display:inline"><button type="submit" class="btn" style="padding:4px 10px;font-size:9px">Approve</button></form>`
                    : ""
                  }
                  ${inj.status === "approved"
                    ? `<form method="POST" action="/admin/inject/${esc(slug)}/pause/${inj.id}" style="display:inline"><button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px">Pause</button></form>`
                    : ""
                  }
                  ${inj.status === "paused"
                    ? `<form method="POST" action="/admin/inject/${esc(slug)}/approve/${inj.id}" style="display:inline"><button type="submit" class="btn" style="padding:4px 10px;font-size:9px">Resume</button></form>`
                    : ""
                  }
                  <form method="POST" action="/admin/inject/${esc(slug)}/delete/${inj.id}" style="display:inline"><button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px;color:#ef4444">Remove</button></form>
                </div>
              </div>
              <details>
                <summary style="cursor:pointer;font-size:11px;color:var(--text-faint);margin-bottom:8px">View JSON-LD</summary>
                <pre style="background:var(--bg);padding:12px;border-radius:4px;font-size:11px;color:var(--text-faint);overflow-x:auto;white-space:pre-wrap;margin:0">${esc(JSON.stringify(JSON.parse(inj.json_ld), null, 2))}</pre>
                <form method="POST" action="/admin/inject/${esc(slug)}/edit/${inj.id}" style="margin-top:8px">
                  <textarea name="json_ld" style="width:100%;min-height:120px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:11px;padding:8px;border-radius:4px;resize:vertical">${esc(inj.json_ld)}</textarea>
                  <div style="display:flex;gap:8px;margin-top:8px">
                    <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px">Save edit</button>
                    <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-faint)">
                      <span>Target pages:</span>
                      <input type="text" name="target_pages" value="${esc(inj.target_pages)}" placeholder='* or ["/faq","/about"]' style="background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:10px;padding:4px 8px;border-radius:2px;width:200px">
                    </label>
                  </div>
                </form>
              </details>
            </div>
          `
            )
            .join("")
        : '<div style="color:var(--text-faint);font-size:13px">No schema blocks yet. Generate them from the coverage section above.</div>'
      }
    </div>

    <!-- Business info form -->
    <div class="card" style="margin-bottom:32px">
      <h3 style="margin-bottom:16px">Business <em>info</em></h3>
      <p style="font-size:12px;color:var(--text-faint);margin-bottom:20px">This data feeds all schema generators. Fill it in once per client.</p>
      <form method="POST" action="/admin/inject/${esc(slug)}/config">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="form-group">
            <label for="business_name">Business name</label>
            <input type="text" name="business_name" id="business_name" value="${esc(config.business_name || "")}" placeholder="Acme Corp">
          </div>
          <div class="form-group">
            <label for="business_url">Website URL</label>
            <input type="text" name="business_url" id="business_url" value="${esc(config.business_url || "")}" placeholder="https://acme.com">
          </div>
          <div class="form-group" style="grid-column:span 2">
            <label for="business_description">Description</label>
            <input type="text" name="business_description" id="business_description" value="${esc(config.business_description || "")}" placeholder="We provide professional services in...">
          </div>
          <div class="form-group">
            <label for="business_phone">Phone</label>
            <input type="text" name="business_phone" id="business_phone" value="${esc(config.business_phone || "")}" placeholder="+1-555-123-4567">
          </div>
          <div class="form-group">
            <label for="business_email">Email</label>
            <input type="text" name="business_email" id="business_email" value="${esc(config.business_email || "")}" placeholder="hello@acme.com">
          </div>
          <div class="form-group">
            <label for="business_logo_url">Logo URL</label>
            <input type="text" name="business_logo_url" id="business_logo_url" value="${esc(config.business_logo_url || "")}" placeholder="https://acme.com/logo.png">
          </div>
          <div class="form-group">
            <label for="business_social">Social profiles (one per line)</label>
            <textarea name="business_social" id="business_social" rows="3" style="background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:12px;padding:8px;border-radius:4px;width:100%;resize:vertical">${esc(social.join("\n"))}</textarea>
          </div>
        </div>
        <div style="margin-top:16px">
          <div class="label" style="margin-bottom:8px">Address</div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:12px">
            <div class="form-group">
              <input type="text" name="addr_street" value="${esc(addr.street || "")}" placeholder="Street">
            </div>
            <div class="form-group">
              <input type="text" name="addr_city" value="${esc(addr.city || "")}" placeholder="City">
            </div>
            <div class="form-group">
              <input type="text" name="addr_state" value="${esc(addr.state || "")}" placeholder="State">
            </div>
            <div class="form-group">
              <input type="text" name="addr_zip" value="${esc(addr.zip || "")}" placeholder="ZIP">
            </div>
          </div>
        </div>
        <div style="margin-top:16px">
          <button type="submit" class="btn">Save business info</button>
        </div>
      </form>
    </div>

    <!-- Quick actions -->
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <a href="/admin" class="btn btn-ghost">Back to cockpit</a>
      <a href="/roadmap/${esc(slug)}" class="btn btn-ghost">View roadmap</a>
    </div>
  `;

  return html(layout("Inject", body, user));
}

// ---------- POST handlers ----------

export async function handleInjectConfig(
  slug: string,
  request: Request,
  env: Env
): Promise<Response> {
  const form = await request.formData();
  const now = Math.floor(Date.now() / 1000);

  const address = JSON.stringify({
    street: (form.get("addr_street") as string) || "",
    city: (form.get("addr_city") as string) || "",
    state: (form.get("addr_state") as string) || "",
    zip: (form.get("addr_zip") as string) || "",
  });

  const socialRaw = (form.get("business_social") as string) || "";
  const social = JSON.stringify(
    socialRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  await env.DB.prepare(
    `UPDATE injection_configs SET
      business_name = ?, business_url = ?, business_description = ?,
      business_phone = ?, business_email = ?, business_logo_url = ?,
      business_address = ?, business_social = ?, updated_at = ?
    WHERE client_slug = ?`
  )
    .bind(
      (form.get("business_name") as string) || null,
      (form.get("business_url") as string) || null,
      (form.get("business_description") as string) || null,
      (form.get("business_phone") as string) || null,
      (form.get("business_email") as string) || null,
      (form.get("business_logo_url") as string) || null,
      address,
      social,
      now,
      slug
    )
    .run();

  return redirect(`/admin/inject/${slug}`);
}

export async function handleInjectGenerate(
  slug: string,
  schemaType: string,
  env: Env
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  const config = await env.DB.prepare(
    "SELECT * FROM injection_configs WHERE client_slug = ?"
  )
    .bind(slug)
    .first<InjectionConfig>();

  if (!config) {
    return redirect(`/admin/inject/${slug}`);
  }

  const generated = autoGenerate(schemaType as SchemaType, config);
  if (!generated) {
    return redirect(`/admin/inject/${slug}`);
  }

  const jsonLd = JSON.stringify(generated);
  const validation = validateJsonLd(generated);

  // Default target: all pages for Organization/WebSite, specific for others
  const allPageTypes = ["Organization", "WebSite", "LocalBusiness", "BreadcrumbList"];
  const targetPages = allPageTypes.includes(schemaType) ? "*" : "*";

  await env.DB.prepare(
    "INSERT INTO schema_injections (client_slug, schema_type, json_ld, target_pages, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(slug, schemaType, jsonLd, targetPages, "draft", now, now)
    .run();

  return redirect(`/admin/inject/${slug}`);
}

export async function handleInjectApprove(
  slug: string,
  id: number,
  env: Env
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  // Approve the injection
  await env.DB.prepare(
    "UPDATE schema_injections SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ? AND client_slug = ?"
  )
    .bind(now, now, id, slug)
    .run();

  // If linked to a roadmap item, set it to in_progress
  const inj = await env.DB.prepare(
    "SELECT roadmap_item_id FROM schema_injections WHERE id = ?"
  )
    .bind(id)
    .first<{ roadmap_item_id: number | null }>();

  if (inj?.roadmap_item_id) {
    await env.DB.prepare(
      "UPDATE roadmap_items SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'pending'"
    )
      .bind(now, inj.roadmap_item_id)
      .run();
  }

  return redirect(`/admin/inject/${slug}`);
}

export async function handleInjectPause(
  slug: string,
  id: number,
  env: Env
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE schema_injections SET status = 'paused', updated_at = ? WHERE id = ? AND client_slug = ?"
  )
    .bind(now, id, slug)
    .run();
  return redirect(`/admin/inject/${slug}`);
}

export async function handleInjectEdit(
  slug: string,
  id: number,
  request: Request,
  env: Env
): Promise<Response> {
  const form = await request.formData();
  const now = Math.floor(Date.now() / 1000);
  const jsonLd = (form.get("json_ld") as string) || "";
  const targetPages = (form.get("target_pages") as string) || "*";

  // Validate JSON
  try {
    const parsed = JSON.parse(jsonLd);
    const validation = validateJsonLd(parsed);
    if (!validation.valid) {
      // Still save, but keep as draft
    }
  } catch {
    // Invalid JSON — don't save
    return redirect(`/admin/inject/${slug}`);
  }

  await env.DB.prepare(
    "UPDATE schema_injections SET json_ld = ?, target_pages = ?, updated_at = ? WHERE id = ? AND client_slug = ?"
  )
    .bind(jsonLd, targetPages, now, id, slug)
    .run();

  return redirect(`/admin/inject/${slug}`);
}

export async function handleInjectDelete(
  slug: string,
  id: number,
  env: Env
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE schema_injections SET status = 'archived', updated_at = ? WHERE id = ? AND client_slug = ?"
  )
    .bind(now, id, slug)
    .run();
  return redirect(`/admin/inject/${slug}`);
}

export async function handleInjectPublish(
  slug: string,
  env: Env
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const newToken = randomHex(8);
  await env.DB.prepare(
    "UPDATE injection_configs SET snippet_token = ?, updated_at = ? WHERE client_slug = ?"
  )
    .bind(newToken, now, slug)
    .run();
  return redirect(`/admin/inject/${slug}`);
}
