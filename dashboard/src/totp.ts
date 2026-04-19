/**
 * Dashboard -- TOTP (RFC 6238) and recovery code utilities
 *
 * Pure Web Crypto, no third-party dependencies. Compatible with
 * Google Authenticator, 1Password, Authy, and the built-in iOS /
 * macOS Passwords app.
 */

// ---------------------------------------------------------------------------
// Base32 (RFC 4648) for TOTP secret encoding (what Google Authenticator wants)
// ---------------------------------------------------------------------------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx === -1) throw new Error("Invalid base32 character: " + c);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// TOTP code generation + verification (RFC 6238)
// ---------------------------------------------------------------------------

const TOTP_PERIOD = 30;     // seconds per code
const TOTP_DIGITS = 6;
const TOTP_DRIFT = 1;       // accept codes from +/- 1 step (handles clock skew)

async function hotp(secretBase32: string, counter: number): Promise<string> {
  const key = base32Decode(secretBase32);
  // 8-byte big-endian counter
  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setUint32(4, counter & 0xffffffff, false);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBuf));
  // Dynamic truncation per RFC 4226
  const offset = sig[sig.length - 1] & 0x0f;
  const code = (
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)
  ) % 10 ** TOTP_DIGITS;
  return String(code).padStart(TOTP_DIGITS, "0");
}

export async function totpCurrent(secretBase32: string, nowMs?: number): Promise<string> {
  const t = Math.floor((nowMs ?? Date.now()) / 1000 / TOTP_PERIOD);
  return hotp(secretBase32, t);
}

/**
 * Verify a user-submitted code against the secret. Accepts current
 * step plus +/- TOTP_DRIFT to tolerate small clock skew between the
 * user's authenticator and the server.
 */
export async function totpVerify(secretBase32: string, code: string, nowMs?: number): Promise<boolean> {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const t = Math.floor((nowMs ?? Date.now()) / 1000 / TOTP_PERIOD);
  for (let drift = -TOTP_DRIFT; drift <= TOTP_DRIFT; drift++) {
    const candidate = await hotp(secretBase32, t + drift);
    // Constant-time comparison to defend against timing leaks.
    if (candidate.length === cleaned.length) {
      let mismatch = 0;
      for (let i = 0; i < candidate.length; i++) {
        mismatch |= candidate.charCodeAt(i) ^ cleaned.charCodeAt(i);
      }
      if (mismatch === 0) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Secret + provisioning URI for the QR code
// ---------------------------------------------------------------------------

export function generateSecret(): string {
  // 20 random bytes -> 32 base32 chars; matches RFC 6238 recommended length.
  const buf = new Uint8Array(20);
  crypto.getRandomValues(buf);
  return base32Encode(buf);
}

/**
 * otpauth:// URI per Google Authenticator key URI format. Authenticator
 * apps render this directly when scanned as a QR.
 */
export function provisioningUri(opts: { secret: string; account: string; issuer: string }): string {
  const issuer = encodeURIComponent(opts.issuer);
  const account = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const secret = opts.secret;
  return `otpauth://totp/${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

/**
 * 10 codes, each 10 alphanumeric chars in nrx-xxxx-xxxx format. Stored
 * in plain text in the DB (the recovery code IS the secret; rotating
 * is the recovery story, not hashing). For paranoid threat models we'd
 * hash these too, but at this scale plaintext is the right tradeoff
 * against the support burden of "I lost my codes."
 */
export function generateRecoveryCodes(count = 10): string[] {
  const out: string[] = [];
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // no l, i, 0, 1
  for (let i = 0; i < count; i++) {
    const buf = new Uint8Array(10);
    crypto.getRandomValues(buf);
    let code = "";
    for (const b of buf) code += alphabet[b % alphabet.length];
    out.push(`${code.slice(0, 4)}-${code.slice(4, 7)}-${code.slice(7, 10)}`);
  }
  return out;
}

/**
 * Try to consume a recovery code. Returns the new array of codes if
 * matched (with the consumed one removed) or null if no match.
 */
export function consumeRecoveryCode(codes: string[], submitted: string): string[] | null {
  const normalized = submitted.toLowerCase().replace(/\s+/g, "");
  const idx = codes.findIndex((c) => c.toLowerCase() === normalized);
  if (idx === -1) return null;
  return [...codes.slice(0, idx), ...codes.slice(idx + 1)];
}
