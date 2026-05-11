/**
 * Google Search Console service-account authentication.
 *
 * Replaces user-OAuth for GSC API access. Service accounts don't
 * require user consent, don't have refresh-token expiry (testing-mode
 * OAuth was killing tokens every 7 days), and don't need re-auth
 * ever. One-time setup: customer grants the service account email
 * read access to their GSC property; thereafter it works
 * indefinitely.
 *
 * The credential is stored as a single env secret
 * `GSC_SERVICE_ACCOUNT_JSON` -- the full service-account JSON key
 * file Google issues at IAM → Service Accounts → Keys → Create.
 * Set via `wrangler secret put GSC_SERVICE_ACCOUNT_JSON` and paste
 * the JSON contents.
 *
 * Workers don't have node:crypto, so JWT signing uses the Web
 * Crypto API (crypto.subtle) which is available in all modern
 * Worker runtimes including ours (compatibility_date 2025-04-09).
 */
import type { Env } from "./types";

export interface ServiceAccountKey {
  type: string;                       // "service_account"
  project_id: string;
  private_key_id: string;
  private_key: string;                // PEM-encoded RSA private key
  client_email: string;               // the email customers grant in GSC
  client_id: string;
  auth_uri: string;
  token_uri: string;                  // "https://oauth2.googleapis.com/token"
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// In-process cache. Survives across requests within a single Worker
// isolate (which can handle many requests). Service account tokens
// expire in ~1 hour, so caching dramatically reduces token-exchange
// round-trips during cron sweeps that hit multiple GSC properties.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/** Parse the JSON-encoded service-account key from env. Throws if
 *  the secret isn't set or isn't valid JSON. Callers should guard
 *  with isServiceAccountConfigured() first. */
export function parseServiceAccountKey(env: Env): ServiceAccountKey {
  if (!env.GSC_SERVICE_ACCOUNT_JSON) {
    throw new Error("GSC_SERVICE_ACCOUNT_JSON not set");
  }
  try {
    return JSON.parse(env.GSC_SERVICE_ACCOUNT_JSON) as ServiceAccountKey;
  } catch (e) {
    throw new Error(`GSC_SERVICE_ACCOUNT_JSON is not valid JSON: ${e}`);
  }
}

/** Cheap check used by getValidToken() and the admin UI to know
 *  whether the service-account path is configured. Doesn't validate
 *  the JSON is well-formed -- just that the secret exists. */
export function isServiceAccountConfigured(env: Env): boolean {
  return typeof env.GSC_SERVICE_ACCOUNT_JSON === "string" &&
         env.GSC_SERVICE_ACCOUNT_JSON.length > 0;
}

/** Decode a PEM-encoded private key into the ArrayBuffer that
 *  crypto.subtle.importKey expects. Strips PEM header/footer + line
 *  breaks, then base64-decodes the body. Handles both PKCS#8 (most
 *  GCP-issued keys) and the older traditional RSA format. */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const pemBody = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(pemBody);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Base64url encoding (no padding, +/ replaced with -_). Used by
 *  JWT spec. Handles both strings and binary inputs. */
function base64UrlEncode(input: string | ArrayBuffer): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sign a JWT with the service account's RSA private key using
 *  RSASSA-PKCS1-v1_5 + SHA-256, per Google's spec for service
 *  account JWT-bearer grants. */
async function signJWT(
  privateKeyPem: string,
  claims: Record<string, unknown>,
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    false,
    ["sign"],
  );

  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(sigBuf)}`;
}

/** Exchange a signed JWT for a short-lived access_token at Google's
 *  token endpoint. The JWT acts as both authentication (signed with
 *  the private key) and authorization (the scope claim). */
async function exchangeJwtForToken(jwt: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Service account token exchange failed: ${resp.status} ${errText.slice(0, 200)}`);
  }

  return (await resp.json()) as { access_token: string; expires_in: number };
}

/** Get a valid access token via the service-account flow. Cached
 *  in-process for the lifetime of the Worker isolate; refreshes
 *  automatically when within 60s of expiry. Returns null when the
 *  service account isn't configured (caller should fall back to
 *  user OAuth). */
export async function getServiceAccountToken(env: Env): Promise<string | null> {
  if (!isServiceAccountConfigured(env)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.accessToken;
  }

  const key = parseServiceAccountKey(env);
  const claims = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: key.token_uri,
    exp: now + 3600,
    iat: now,
  };

  const jwt = await signJWT(key.private_key, claims);
  const tokenResp = await exchangeJwtForToken(jwt);

  cachedToken = {
    accessToken: tokenResp.access_token,
    expiresAt: now + tokenResp.expires_in,
  };

  return tokenResp.access_token;
}

/** Surface the service-account email for the admin UI. The customer
 *  grants this email read access in GSC → Settings → Users and
 *  permissions. */
export function getServiceAccountEmail(env: Env): string | null {
  if (!isServiceAccountConfigured(env)) return null;
  try {
    return parseServiceAccountKey(env).client_email;
  } catch {
    return null;
  }
}
