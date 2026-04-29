/**
 * Shopify driver.
 *
 * Uses Custom App access tokens, not full OAuth. Customer creates a
 * Custom App in their Shopify Admin, scopes it to read/write blog
 * articles, installs it, and pastes the Admin API access token. This
 * is the same token-paste UX as WordPress + Webflow.
 *
 * Required scopes for the custom app:
 *   - read_content, write_content   (blogs + articles)
 *
 * Publish flow:
 *   - POST /admin/api/2024-01/blogs/{blog_id}/articles.json
 *   - body: { article: { title, body_html, summary_html, tags, published_at? } }
 *   - When published_at is in the future, Shopify schedules; omit to
 *     publish immediately; set published=false to keep as a draft.
 *
 * Rate limits: bucket-based, 40 req per minute on a standard plan.
 * Each publish is 1 call -- we'll never approach the limit.
 */
import type { Env } from "../../types";
import type { CmsDriver, PublishParams, PublishResult, TestResult } from "../index";
import { decryptSecret, encryptSecret, sharedMarkdownToHtml } from "../shared";

export interface ShopifyConfig {
  /** "myshop.myshopify.com" -- not the customer-facing domain. */
  shop_domain: string;
  /** Numeric blog id (Shopify shops can have multiple blogs). */
  blog_id: string;
  /** AES-GCM ciphertext (or plaintext on first save). */
  access_token: string;
}

const API_VERSION = "2024-01";

function looksEncrypted(value: string): boolean {
  return /[+/=]/.test(value) || value.length > 60;
}

function normalizeShopDomain(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

async function readToken(value: string, env: Env): Promise<string> {
  return looksEncrypted(value) ? await decryptSecret(value, env) : value;
}

function authHeaders(token: string): Record<string, string> {
  return {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function apiBase(domain: string): string {
  return `https://${normalizeShopDomain(domain)}/admin/api/${API_VERSION}`;
}

export const driver: CmsDriver<ShopifyConfig> = {
  platform: "shopify",

  describe(config) {
    return `${normalizeShopDomain(config.shop_domain)} (blog ${config.blog_id})`;
  },

  redact(config) {
    return {
      shop_domain: normalizeShopDomain(config.shop_domain),
      blog_id: config.blog_id,
      access_token: "********",
    };
  },

  async testConnection(config, env): Promise<TestResult> {
    if (!config.shop_domain || !config.blog_id) {
      return { ok: false, detail: "shop_domain and blog_id are both required." };
    }
    const token = await readToken(config.access_token, env);
    const headers = authHeaders(token);
    const base = apiBase(config.shop_domain);

    try {
      // 1. Verify token + shop access.
      const shopResp = await fetch(`${base}/shop.json`, { headers });
      if (shopResp.status === 401) {
        return { ok: false, detail: "Shopify rejected the access token. Reinstall the custom app and copy a fresh token." };
      }
      if (shopResp.status === 403) {
        return { ok: false, detail: "Token authenticated but lacks scopes. Custom app needs read_content + write_content." };
      }
      if (shopResp.status === 404) {
        return { ok: false, detail: "Shop domain not found. Double-check it's the .myshopify.com domain, not the storefront URL." };
      }
      if (!shopResp.ok) {
        return { ok: false, detail: `Shopify returned HTTP ${shopResp.status} on shop lookup.` };
      }
      // 2. Verify the blog id exists.
      const blogResp = await fetch(`${base}/blogs/${config.blog_id}.json`, { headers });
      if (blogResp.status === 404) {
        return { ok: false, detail: "Blog id not found in this shop. Pick a blog from /admin/blogs and copy its id." };
      }
      if (!blogResp.ok) {
        return { ok: false, detail: `Shopify returned HTTP ${blogResp.status} on blog lookup.` };
      }
      const extras: Record<string, unknown> = {};
      if (!looksEncrypted(config.access_token)) {
        extras.access_token = await encryptSecret(config.access_token, env);
      }
      extras.shop_domain = normalizeShopDomain(config.shop_domain);
      return { ok: true, detail: "Connected.", extras };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `Could not reach Shopify: ${msg}` };
    }
  },

  async publishDraft(params, config, env): Promise<PublishResult> {
    const token = await readToken(config.access_token, env);
    const headers = authHeaders(token);
    const base = apiBase(config.shop_domain);

    const html = sharedMarkdownToHtml(params.content_markdown);
    const now = Math.floor(Date.now() / 1000);
    const future = params.scheduled_date && params.scheduled_date > now + 120
      ? params.scheduled_date
      : null;

    const article: Record<string, unknown> = {
      title: params.title,
      body_html: html,
      published: !future, // false -> draft, true -> live
    };
    if (params.meta_description) article.summary_html = params.meta_description;
    if (future) {
      article.published_at = new Date(future * 1000).toISOString();
      article.published = true; // future scheduling requires published=true + future date
    }

    const resp = await fetch(`${base}/blogs/${config.blog_id}/articles.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ article }),
    });

    if (!resp.ok) {
      let detail = `HTTP ${resp.status}`;
      try {
        const json = await resp.json<{ errors?: unknown }>();
        if (json.errors) detail = `${resp.status}: ${JSON.stringify(json.errors).slice(0, 250)}`;
      } catch { /* non-json body */ }
      throw new Error(`Shopify publish failed: ${detail}`);
    }

    const body = await resp.json<{ article: { id: number; handle: string } }>();
    const handle = body.article.handle;
    // Live URL is the customer-facing storefront, not the .myshopify
    // admin domain. We don't store the storefront URL, so we point at
    // the storefront convention the customer can verify against.
    const storeBase = `https://${normalizeShopDomain(config.shop_domain)}`;
    const url = `${storeBase}/blogs/news/${handle}`;
    return { url, externalId: String(body.article.id) };
  },
};
