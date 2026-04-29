/**
 * WordPress driver.
 *
 * Wraps the existing WP Application-Passwords integration in the
 * generic CmsDriver interface. Behavior is unchanged from the legacy
 * src/wordpress.ts -- we kept the same auth, the same SEO-plugin
 * detection, and the same publish payload. The only difference is
 * the config now arrives as a plain object out of cms_connections
 * (with the same field names as the old wp_connections columns).
 */
import type { Env } from "../../types";
import type { CmsDriver, PublishParams, PublishResult, TestResult } from "../index";
import { decryptSecret, encryptSecret, sharedMarkdownToHtml } from "../shared";

export interface WordPressConfig {
  site_url: string;
  wp_username: string;
  /** AES-GCM encrypted via WP_ENCRYPTION_KEY. May be plaintext only on
   *  first save (saveConnection encrypts before persist).
   *  Note: legacy wp_connections rows are migrated as-is, so the
   *  ciphertext flowing through here is identical to the old format. */
  wp_app_password: string;
  seo_plugin?: "yoast" | "rank_math" | "aioseo" | null;
  default_category_id?: number | null;
}

function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim();
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/+$/, "");
}

function authHeader(username: string, appPassword: string): string {
  // WP Application Passwords are sent via Basic Auth. WP strips
  // cosmetic spaces from the displayed password before compare, so
  // we strip them too.
  const normalized = appPassword.replace(/\s+/g, "");
  const pair = `${username}:${normalized}`;
  const bytes = new TextEncoder().encode(pair);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return "Basic " + btoa(bin);
}

/** True if the field looks like base64 ciphertext we wrote, false if
 *  it looks like a fresh plaintext app password. We use this to decide
 *  whether to decrypt. Plaintext passwords are 24 lowercase chars with
 *  optional spaces; ciphertext is base64 with =, /, +. */
function looksEncrypted(value: string): boolean {
  return /[+/=]/.test(value) || value.length > 60;
}

async function readPassword(value: string, env: Env): Promise<string> {
  return looksEncrypted(value) ? await decryptSecret(value, env) : value;
}

async function probeSeoPlugin(site: string): Promise<WordPressConfig["seo_plugin"]> {
  const probe = async (path: string): Promise<boolean> => {
    try {
      const r = await fetch(`${site}${path}`, { method: "HEAD" });
      return r.status !== 404;
    } catch { return false; }
  };
  if (await probe("/wp-json/yoast/v1/get_head")) return "yoast";
  if (await probe("/wp-json/rankmath/v1/updateRedirection")) return "rank_math";
  if (await probe("/wp-json/aioseo/v1/sitemap/url")) return "aioseo";
  return null;
}

export const driver: CmsDriver<WordPressConfig> = {
  platform: "wordpress",

  describe(config) {
    return normalizeSiteUrl(config.site_url);
  },

  redact(config) {
    return {
      site_url: normalizeSiteUrl(config.site_url),
      wp_username: config.wp_username,
      wp_app_password: "********",
      seo_plugin: config.seo_plugin ?? null,
      default_category_id: config.default_category_id ?? null,
    };
  },

  async testConnection(config, env): Promise<TestResult> {
    const site = normalizeSiteUrl(config.site_url);
    const password = await readPassword(config.wp_app_password, env);
    const auth = authHeader(config.wp_username, password);

    try {
      const meResp = await fetch(`${site}/wp-json/wp/v2/users/me`, {
        headers: { Authorization: auth, Accept: "application/json" },
      });
      if (meResp.status === 401 || meResp.status === 403) {
        return { ok: false, detail: "Authentication failed. Double-check the username and app password." };
      }
      if (meResp.status === 404) {
        return { ok: false, detail: "REST API not reachable at /wp-json. This WordPress install may have the API disabled." };
      }
      if (!meResp.ok) {
        return { ok: false, detail: `WordPress returned HTTP ${meResp.status}.` };
      }
      const seoPlugin = await probeSeoPlugin(site);
      // Re-encrypt the password if it came in plaintext, so the
      // saveConnection caller persists the encrypted form. We stash
      // the encrypted blob in extras.
      const extras: Record<string, unknown> = { seo_plugin: seoPlugin };
      if (!looksEncrypted(config.wp_app_password)) {
        extras.wp_app_password = await encryptSecret(config.wp_app_password, env);
      }
      // Always normalize the saved URL.
      extras.site_url = site;
      return { ok: true, detail: "Connected.", extras };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `Could not reach ${site}: ${msg}` };
    }
  },

  async publishDraft(params, config, env): Promise<PublishResult> {
    const site = normalizeSiteUrl(config.site_url);
    const password = await readPassword(config.wp_app_password, env);
    const auth = authHeader(config.wp_username, password);

    const html = sharedMarkdownToHtml(params.content_markdown);
    const now = Math.floor(Date.now() / 1000);
    const future = params.scheduled_date && params.scheduled_date > now + 120
      ? params.scheduled_date
      : null;
    const status = future ? "future" : "publish";

    const body: Record<string, unknown> = {
      title: params.title,
      content: html,
      status,
    };
    if (future) {
      body.date_gmt = new Date(future * 1000).toISOString().replace(/\.\d+Z$/, "");
    }
    if (config.default_category_id) body.categories = [config.default_category_id];

    if (params.meta_description) {
      const meta: Record<string, string> = {};
      if (config.seo_plugin === "yoast") meta["_yoast_wpseo_metadesc"] = params.meta_description;
      else if (config.seo_plugin === "rank_math") meta["rank_math_description"] = params.meta_description;
      else if (config.seo_plugin === "aioseo") meta["_aioseo_description"] = params.meta_description;
      if (Object.keys(meta).length > 0) body.meta = meta;
    }

    const resp = await fetch(`${site}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
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
    return { url: post.link, externalId: String(post.id) };
  },
};
