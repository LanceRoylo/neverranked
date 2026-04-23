/**
 * WordPress publishing integration
 *
 * Uses the native WordPress REST API + Application Passwords (built-in
 * since WP 5.6). No plugin required. Customer generates an App Password
 * from wp-admin/profile.php and pastes it into our settings page; we
 * encrypt with AES-GCM via WP_ENCRYPTION_KEY and store in D1.
 *
 * Public functions:
 *   - getConnection(slug, env)       -> decrypted row or null
 *   - saveConnection(params, env)    -> test + upsert
 *   - testConnection(conn, env)      -> "ok" or "error: <msg>"
 *   - publishDraft(draft, conn, env) -> WP post URL, or throws
 */
import type { Env, WpConnection } from "./types";

// ---------- crypto ----------

/**
 * AES-GCM helpers. Key is a 32-byte hex string from env. Ciphertext is
 * stored as base64 of `IV(12 bytes) || ciphertext`. IV is randomized
 * per-write so the same plaintext never produces the same stored blob.
 */
async function deriveKey(env: Env): Promise<CryptoKey> {
  const hex = env.WP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("WP_ENCRYPTION_KEY must be set as a 32-byte hex string (64 chars)");
  }
  const raw = new Uint8Array(32);
  for (let i = 0; i < 32; i++) raw[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string, env: Env): Promise<string> {
  const key = await deriveKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc));
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  // btoa requires a binary string -- spread to string via charCode
  let binary = "";
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
}

export async function decryptSecret(blob: string, env: Env): Promise<string> {
  const key = await deriveKey(env);
  const binary = atob(blob);
  const combined = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

// ---------- normalization ----------

/**
 * Accept `example.com`, `https://example.com/`, or `https://example.com`
 * and normalize to `https://example.com` (no trailing slash). We use
 * the normalized form as the REST base: `${site}/wp-json/wp/v2/...`.
 */
export function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim();
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/+$/, "");
}

function authHeader(username: string, appPassword: string): string {
  // WP Application Passwords are sent via Basic Auth. Spaces in the
  // displayed password are cosmetic; WP strips them before compare,
  // so we do the same.
  const normalized = appPassword.replace(/\s+/g, "");
  const pair = `${username}:${normalized}`;
  const bytes = new TextEncoder().encode(pair);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return "Basic " + btoa(bin);
}

// ---------- REST API ----------

interface TestResult {
  ok: boolean;
  detail: string;
  seoPlugin: string | null;
}

/**
 * Test the connection: hit the authenticated /users/me endpoint, then
 * probe the active plugins list for Yoast/Rank Math/AIOSEO so we know
 * which meta keys to write on publish. Returns a detailed result.
 */
export async function testConnection(params: {
  site_url: string;
  wp_username: string;
  wp_app_password: string;
}): Promise<TestResult> {
  const site = normalizeSiteUrl(params.site_url);
  const auth = authHeader(params.wp_username, params.wp_app_password);

  try {
    const meResp = await fetch(`${site}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: auth, "Accept": "application/json" },
    });
    if (meResp.status === 401 || meResp.status === 403) {
      return { ok: false, detail: "Authentication failed. Double-check the username and app password.", seoPlugin: null };
    }
    if (meResp.status === 404) {
      return { ok: false, detail: "REST API not reachable at /wp-json. This WordPress install may have the API disabled.", seoPlugin: null };
    }
    if (!meResp.ok) {
      return { ok: false, detail: `WordPress returned HTTP ${meResp.status}.`, seoPlugin: null };
    }

    // Best-effort SEO plugin detection. We read the public plugins
    // endpoint or probe for plugin-specific routes. The plugins route
    // is admin-only, so we probe by trying known plugin REST endpoints.
    let seoPlugin: string | null = null;
    const probe = async (path: string) => {
      try {
        const r = await fetch(`${site}${path}`, { method: "HEAD" });
        return r.status !== 404;
      } catch { return false; }
    };
    if (await probe("/wp-json/yoast/v1/get_head")) seoPlugin = "yoast";
    else if (await probe("/wp-json/rankmath/v1/updateRedirection")) seoPlugin = "rank_math";
    else if (await probe("/wp-json/aioseo/v1/sitemap/url")) seoPlugin = "aioseo";

    return { ok: true, detail: "Connected.", seoPlugin };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: `Could not reach ${site}: ${msg}`, seoPlugin: null };
  }
}

export async function getConnection(clientSlug: string, env: Env): Promise<WpConnection | null> {
  return await env.DB.prepare(
    "SELECT * FROM wp_connections WHERE client_slug = ?",
  ).bind(clientSlug).first<WpConnection>();
}

export async function saveConnection(params: {
  client_slug: string;
  site_url: string;
  wp_username: string;
  wp_app_password: string;
  default_post_status?: "future" | "publish" | "draft";
  default_category_id?: number | null;
}, env: Env): Promise<{ ok: boolean; detail: string }> {
  const test = await testConnection({
    site_url: params.site_url,
    wp_username: params.wp_username,
    wp_app_password: params.wp_app_password,
  });
  if (!test.ok) return { ok: false, detail: test.detail };

  const now = Math.floor(Date.now() / 1000);
  const site = normalizeSiteUrl(params.site_url);
  const encrypted = await encryptSecret(params.wp_app_password, env);

  await env.DB.prepare(
    `INSERT INTO wp_connections (
       client_slug, site_url, wp_username, wp_app_password, seo_plugin,
       default_post_status, default_category_id,
       last_tested_at, last_test_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_slug) DO UPDATE SET
       site_url = excluded.site_url,
       wp_username = excluded.wp_username,
       wp_app_password = excluded.wp_app_password,
       seo_plugin = excluded.seo_plugin,
       default_post_status = excluded.default_post_status,
       default_category_id = excluded.default_category_id,
       last_tested_at = excluded.last_tested_at,
       last_test_status = excluded.last_test_status,
       updated_at = excluded.updated_at`,
  ).bind(
    params.client_slug, site, params.wp_username, encrypted, test.seoPlugin,
    params.default_post_status || "future",
    params.default_category_id ?? null,
    now, "ok", now, now,
  ).run();

  return { ok: true, detail: "Connection saved and tested." };
}

export async function deleteConnection(clientSlug: string, env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM wp_connections WHERE client_slug = ?").bind(clientSlug).run();
}

// ---------- publishing ----------

/**
 * Convert the markdown-ish content we store in content_drafts into
 * HTML acceptable to the WordPress Block Editor. Minimal Markdown
 * subset: headings, bold, italic, paragraphs, links. We intentionally
 * keep this narrow because the voice engine generates prose, not
 * arbitrary Markdown, so we don't need a full parser.
 */
function markdownToHtml(md: string): string {
  let html = md.trim();
  // Normalize line endings
  html = html.replace(/\r\n?/g, "\n");
  // Headings
  html = html.replace(/^######\s+(.*)$/gm, "<h6>$1</h6>")
             .replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>")
             .replace(/^####\s+(.*)$/gm, "<h4>$1</h4>")
             .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
             .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
             .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
  // Inline formatting
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
             .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
             .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Paragraphs: any line that isn't already a block tag.
  html = html.split(/\n{2,}/).map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (/^<(h\d|ul|ol|li|blockquote|pre|p|div)/i.test(trimmed)) return trimmed;
    return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("\n\n");
  return html;
}

/**
 * Publish a draft to WordPress. Returns the new post URL on success,
 * throws with a useful message on failure.
 */
export async function publishDraft(params: {
  title: string;
  content_markdown: string;
  meta_description?: string | null;
  scheduled_date?: number | null; // unix seconds; if provided, post_status=future
  canonical_url?: string | null;
}, conn: WpConnection, env: Env): Promise<{ url: string; postId: number }> {
  const appPassword = await decryptSecret(conn.wp_app_password, env);
  const auth = authHeader(conn.wp_username, appPassword);
  const site = normalizeSiteUrl(conn.site_url);

  const html = markdownToHtml(params.content_markdown);

  // Determine status + date
  const now = Math.floor(Date.now() / 1000);
  const future = params.scheduled_date && params.scheduled_date > now + 120
    ? params.scheduled_date
    : null;
  const status = conn.default_post_status === "draft"
    ? "draft"
    : future
      ? "future"
      : "publish";

  const body: Record<string, unknown> = {
    title: params.title,
    content: html,
    status,
  };
  if (future) {
    // WP expects ISO 8601 in site local time. Since we don't know the
    // site's timezone, we send UTC -- WP accepts that via date_gmt.
    body.date_gmt = new Date(future * 1000).toISOString().replace(/\.\d+Z$/, "");
  }
  if (conn.default_category_id) body.categories = [conn.default_category_id];

  // SEO plugin meta. WordPress core doesn't expose custom post_meta
  // through the REST API by default, but all three major SEO plugins
  // register their meta as REST-exposed so we can write directly.
  const meta: Record<string, string> = {};
  if (params.meta_description) {
    if (conn.seo_plugin === "yoast") {
      meta["_yoast_wpseo_metadesc"] = params.meta_description;
    } else if (conn.seo_plugin === "rank_math") {
      meta["rank_math_description"] = params.meta_description;
    } else if (conn.seo_plugin === "aioseo") {
      meta["_aioseo_description"] = params.meta_description;
    }
  }
  if (Object.keys(meta).length > 0) body.meta = meta;

  const resp = await fetch(`${site}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const json = await resp.json<{ message?: string; code?: string }>();
      if (json.message) detail = `${resp.status} ${json.code || ""}: ${json.message}`;
    } catch { /* non-json body */ }
    throw new Error(`WordPress publish failed: ${detail}`);
  }

  const post = await resp.json<{ id: number; link: string }>();
  return { url: post.link, postId: post.id };
}
