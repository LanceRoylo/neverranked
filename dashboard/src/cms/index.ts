/**
 * CMS publishing -- platform-agnostic interface.
 *
 * Each supported platform (WordPress today; Webflow + Shopify next)
 * implements the CmsDriver interface in its own file under
 * ./drivers/. This module loads the right driver for a connection,
 * exposes a single set of operations to the rest of the codebase,
 * and owns the cms_connections table reads/writes.
 *
 * Why this exists: the original publishing layer was hard-coded to
 * WordPress (wp_connections, wordpress.ts). Adding Webflow/Shopify
 * was going to fork every call site. This module collapses that
 * fork by reading the platform off the row and dispatching.
 */
import type { Env } from "../types";
import { encryptSecret, decryptSecret, sharedMarkdownToHtml } from "./shared";

export type CmsPlatform = "wordpress" | "webflow" | "shopify";
export const SUPPORTED_PLATFORMS: CmsPlatform[] = ["wordpress", "webflow", "shopify"];

export interface CmsConnectionRow {
  id: number;
  client_slug: string;
  platform: CmsPlatform;
  config_json: string; // raw -- callers should never read this directly
  default_post_status: "future" | "publish" | "draft";
  last_tested_at: number | null;
  last_test_status: string | null;
  created_at: number;
  updated_at: number;
}

/** Public-safe shape -- secrets stripped, config redacted. Used by UI. */
export interface CmsConnectionPublic {
  id: number;
  client_slug: string;
  platform: CmsPlatform;
  default_post_status: "future" | "publish" | "draft";
  last_tested_at: number | null;
  last_test_status: string | null;
  /** Platform-specific public summary (e.g. site URL, shop domain). */
  summary: string;
  config_redacted: Record<string, unknown>;
}

export interface PublishParams {
  title: string;
  content_markdown: string;
  meta_description?: string | null;
  scheduled_date?: number | null; // unix seconds
  canonical_url?: string | null;
}

export interface PublishResult {
  url: string;
  externalId: string; // platform's native post id, as a string
}

export interface TestResult {
  ok: boolean;
  detail: string;
  /** Driver-specific extra data captured during a test (e.g. SEO
   *  plugin detection on WordPress). Persisted into config_json. */
  extras?: Record<string, unknown>;
}

/** A driver is the platform-specific implementation. The shape of
 *  `config` is whatever the driver expects -- the dispatch layer is
 *  intentionally untyped here so each driver can keep its own shape. */
export interface CmsDriver<TConfig = unknown> {
  platform: CmsPlatform;
  /** Validate + describe the connection. Called on save and on demand. */
  testConnection(config: TConfig, env: Env): Promise<TestResult>;
  /** Push a draft to the platform. Returns the public URL + native id. */
  publishDraft(params: PublishParams, config: TConfig, env: Env): Promise<PublishResult>;
  /** A one-line UI label for the connection ("https://example.com",
   *  "myshop.myshopify.com / Blog: News", etc.). */
  describe(config: TConfig): string;
  /** Strip secrets so we can hand config to the UI. */
  redact(config: TConfig): Record<string, unknown>;
}

// ---------- driver registry ----------
//
// Drivers are loaded lazily so the bundle stays small and so a broken
// driver doesn't poison the whole module. Add a new platform by
// dropping a file in ./drivers/ and adding the case below.

async function getDriver(platform: CmsPlatform): Promise<CmsDriver> {
  switch (platform) {
    case "wordpress": {
      const m = await import("./drivers/wordpress");
      return m.driver;
    }
    case "webflow": {
      const m = await import("./drivers/webflow");
      return m.driver;
    }
    case "shopify": {
      const m = await import("./drivers/shopify");
      return m.driver;
    }
    default:
      throw new Error(`Unknown CMS platform: ${platform}`);
  }
}

// ---------- DB helpers ----------

export async function getConnection(clientSlug: string, env: Env): Promise<CmsConnectionRow | null> {
  return await env.DB.prepare(
    `SELECT * FROM cms_connections WHERE client_slug = ? LIMIT 1`
  ).bind(clientSlug).first<CmsConnectionRow>();
}

/** Read connection + parse config_json as the driver-specific type. */
export async function getConnectionWithConfig<TConfig = any>(
  clientSlug: string,
  env: Env,
): Promise<{ row: CmsConnectionRow; config: TConfig } | null> {
  const row = await getConnection(clientSlug, env);
  if (!row) return null;
  let config: TConfig;
  try {
    config = JSON.parse(row.config_json) as TConfig;
  } catch {
    throw new Error(`cms_connections row ${row.id} has corrupt config_json`);
  }
  return { row, config };
}

/** Public-facing shape used by the settings UI. */
export async function getConnectionPublic(clientSlug: string, env: Env): Promise<CmsConnectionPublic | null> {
  const row = await getConnection(clientSlug, env);
  if (!row) return null;
  const config = JSON.parse(row.config_json);
  const driver = await getDriver(row.platform);
  return {
    id: row.id,
    client_slug: row.client_slug,
    platform: row.platform,
    default_post_status: row.default_post_status,
    last_tested_at: row.last_tested_at,
    last_test_status: row.last_test_status,
    summary: driver.describe(config),
    config_redacted: driver.redact(config),
  };
}

/** Validate, then upsert. Caller passes platform + raw config (with
 *  plaintext secrets); we run the driver's testConnection, encrypt
 *  any secret fields the driver asks us to, and persist. */
export async function saveConnection(params: {
  client_slug: string;
  platform: CmsPlatform;
  config: any;
  default_post_status?: "future" | "publish" | "draft";
}, env: Env): Promise<{ ok: boolean; detail: string }> {
  const driver = await getDriver(params.platform);
  const test = await driver.testConnection(params.config, env);
  if (!test.ok) return { ok: false, detail: test.detail };

  // Merge any extras the driver collected (e.g. seo_plugin) into config.
  const merged = test.extras ? { ...params.config, ...test.extras } : params.config;

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO cms_connections (
       client_slug, platform, config_json, default_post_status,
       last_tested_at, last_test_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_slug, platform) DO UPDATE SET
       config_json = excluded.config_json,
       default_post_status = excluded.default_post_status,
       last_tested_at = excluded.last_tested_at,
       last_test_status = excluded.last_test_status,
       updated_at = excluded.updated_at`
  ).bind(
    params.client_slug,
    params.platform,
    JSON.stringify(merged),
    params.default_post_status || "future",
    now, "ok",
    now, now,
  ).run();

  return { ok: true, detail: test.detail };
}

export async function deleteConnection(clientSlug: string, env: Env): Promise<void> {
  await env.DB.prepare(`DELETE FROM cms_connections WHERE client_slug = ?`).bind(clientSlug).run();
}

/** On-demand re-test of an existing connection. Updates last_tested_*. */
export async function testConnection(clientSlug: string, env: Env): Promise<TestResult> {
  const loaded = await getConnectionWithConfig(clientSlug, env);
  if (!loaded) return { ok: false, detail: "No connection saved." };
  const driver = await getDriver(loaded.row.platform);
  const result = await driver.testConnection(loaded.config, env);
  const now = Math.floor(Date.now() / 1000);
  // If the driver returned new extras (e.g. SEO plugin moved from null
  // to "yoast"), merge them back into config_json.
  if (result.ok && result.extras) {
    const merged = { ...loaded.config, ...result.extras };
    await env.DB.prepare(
      `UPDATE cms_connections SET config_json = ?, last_tested_at = ?, last_test_status = ?, updated_at = ? WHERE id = ?`
    ).bind(JSON.stringify(merged), now, "ok", now, loaded.row.id).run();
  } else {
    await env.DB.prepare(
      `UPDATE cms_connections SET last_tested_at = ?, last_test_status = ?, updated_at = ? WHERE id = ?`
    ).bind(now, result.ok ? "ok" : "error", now, loaded.row.id).run();
  }
  return result;
}

/** Publish a draft. Loads connection, dispatches to the driver. */
export async function publishDraft(
  clientSlug: string,
  params: PublishParams,
  env: Env,
): Promise<PublishResult> {
  const loaded = await getConnectionWithConfig(clientSlug, env);
  if (!loaded) throw new Error(`No CMS connection for client ${clientSlug}`);
  const driver = await getDriver(loaded.row.platform);
  return await driver.publishDraft(params, loaded.config, env);
}

// Re-export shared utilities so drivers can import from one place.
export { encryptSecret, decryptSecret, sharedMarkdownToHtml };
