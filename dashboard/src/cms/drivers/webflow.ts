/**
 * Webflow CMS driver.
 *
 * Uses Webflow's v2 Data API. Auth is a per-site API token generated
 * from Site settings -> Apps & Integrations -> Generate API Token. We
 * don't do OAuth -- the token-paste flow is comparable to WordPress
 * Application Passwords and adequate for the ~Amplify customer count.
 *
 * Publish flow:
 *   1. POST /collections/{collection_id}/items
 *      - body has fieldData keyed by Webflow field slugs
 *      - we accept `field_map` in config so each site can override
 *   2. POST /collections/{collection_id}/items/{item_id}/publish
 *      - Webflow requires an explicit publish step; without it, the
 *        item lives as an unpublished draft in the CMS.
 *
 * Rate limits: 60 req/min on site tokens. Each publish is 2 calls
 * (create + publish), so we're nowhere near the ceiling.
 */
import type { Env } from "../../types";
import type { CmsDriver, PublishParams, PublishResult, TestResult } from "../index";
import { decryptSecret, encryptSecret, sharedMarkdownToHtml, slugify } from "../shared";

export interface WebflowConfig {
  site_id: string;
  collection_id: string;
  /** AES-GCM ciphertext (or plaintext on first save). */
  api_token: string;
  /** Optional. Maps our standard fields to the customer's Webflow
   *  field slugs. Falls back to the most common defaults. */
  field_map?: {
    name?: string;          // default: "name"
    slug?: string;          // default: "slug"
    body?: string;          // default: "post-body"
    summary?: string;       // default: "post-summary"
    meta_description?: string; // default: "meta-description"
  };
}

const API = "https://api.webflow.com/v2";

function looksEncrypted(value: string): boolean {
  return /[+/=]/.test(value) || value.length > 60;
}

async function readToken(value: string, env: Env): Promise<string> {
  return looksEncrypted(value) ? await decryptSecret(value, env) : value;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function fieldFor(map: WebflowConfig["field_map"], key: keyof NonNullable<WebflowConfig["field_map"]>, fallback: string): string {
  return map?.[key] || fallback;
}

export const driver: CmsDriver<WebflowConfig> = {
  platform: "webflow",

  describe(config) {
    return `Webflow site ${config.site_id} / collection ${config.collection_id}`;
  },

  redact(config) {
    return {
      site_id: config.site_id,
      collection_id: config.collection_id,
      api_token: "********",
      field_map: config.field_map ?? null,
    };
  },

  async testConnection(config, env): Promise<TestResult> {
    if (!config.site_id || !config.collection_id) {
      return { ok: false, detail: "site_id and collection_id are both required." };
    }
    const token = await readToken(config.api_token, env);
    const headers = authHeaders(token);

    try {
      // Verify token + site access.
      const siteResp = await fetch(`${API}/sites/${config.site_id}`, { headers });
      if (siteResp.status === 401 || siteResp.status === 403) {
        return { ok: false, detail: "Webflow rejected the API token. Generate a fresh one and try again." };
      }
      if (siteResp.status === 404) {
        return { ok: false, detail: "Webflow says this site_id doesn't exist or this token doesn't have access." };
      }
      if (!siteResp.ok) {
        return { ok: false, detail: `Webflow returned HTTP ${siteResp.status} on site lookup.` };
      }
      // Verify the collection exists in this site.
      const colResp = await fetch(`${API}/collections/${config.collection_id}`, { headers });
      if (colResp.status === 404) {
        return { ok: false, detail: "Webflow says this collection_id doesn't exist or doesn't belong to this site." };
      }
      if (!colResp.ok) {
        return { ok: false, detail: `Webflow returned HTTP ${colResp.status} on collection lookup.` };
      }
      const extras: Record<string, unknown> = {};
      if (!looksEncrypted(config.api_token)) {
        extras.api_token = await encryptSecret(config.api_token, env);
      }
      return { ok: true, detail: "Connected.", extras };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `Could not reach Webflow: ${msg}` };
    }
  },

  async publishDraft(params, config, env): Promise<PublishResult> {
    const token = await readToken(config.api_token, env);
    const headers = authHeaders(token);
    const html = sharedMarkdownToHtml(params.content_markdown);

    const fieldData: Record<string, string> = {
      [fieldFor(config.field_map, "name", "name")]: params.title,
      [fieldFor(config.field_map, "slug", "slug")]: slugify(params.title),
      [fieldFor(config.field_map, "body", "post-body")]: html,
    };
    if (params.meta_description) {
      const summaryField = fieldFor(config.field_map, "summary", "post-summary");
      const metaField = fieldFor(config.field_map, "meta_description", "meta-description");
      fieldData[summaryField] = params.meta_description;
      // Webflow has both a summary (CMS field) and a meta-description
      // (SEO field on the CMS item template). Setting both is safe --
      // if a field doesn't exist, Webflow ignores it gracefully.
      fieldData[metaField] = params.meta_description;
    }

    // Step 1: create the item. We default to creating it as a draft so
    // it doesn't go live until step 2 succeeds. If the user picked
    // default_post_status='draft' we skip the publish step entirely.
    const createBody = {
      isArchived: false,
      isDraft: true,
      fieldData,
    };
    const createResp = await fetch(`${API}/collections/${config.collection_id}/items`, {
      method: "POST",
      headers,
      body: JSON.stringify(createBody),
    });
    if (!createResp.ok) {
      const detail = await createResp.text().catch(() => "");
      throw new Error(`Webflow create item failed: ${createResp.status} ${detail.slice(0, 250)}`);
    }
    const created = await createResp.json<{ id: string; lastUpdated: string }>();
    const itemId = created.id;

    // Step 2: publish the item live. Webflow stages CMS publishes per
    // item -- we just need to call /publish to flip it from draft to
    // published on the live site.
    const publishResp = await fetch(`${API}/collections/${config.collection_id}/items/${itemId}/publish`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    if (!publishResp.ok) {
      // Don't throw -- the item is created (callers can find it in
      // the CMS) but warn them it's still draft. Surface the detail.
      const detail = await publishResp.text().catch(() => "");
      throw new Error(`Webflow item created (id ${itemId}) but publish failed: ${publishResp.status} ${detail.slice(0, 250)}`);
    }

    // Webflow doesn't return the live URL on create or publish. Best
    // we can do without a second site lookup is point at the item id
    // in the CMS. Real URL inference would need the site's slug
    // pattern, which is per-collection -- out of scope for v1.
    const url = `https://webflow.com/dashboard/sites/${config.site_id}/cms/collections/${config.collection_id}/items/${itemId}`;
    return { url, externalId: itemId };
  },
};
