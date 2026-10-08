/**
 * Who made this free-check call, decided once, at write time.
 *
 * The morning briefing used to count every key under event:scan:, which is
 * every API call over 90 days: our MCP tool, the keyed Montaic lane, the
 * audit template, curl from a laptop and the leaderboard script all read as
 * visitors. This module is the one place that decides, and it writes its
 * answer into free_check_events so every reader counts the same way.
 *
 * A row is a PERSON only when all of these hold:
 *   - it came from the check page's own JavaScript, which sends a session_id
 *     and client:"page". Scripts, the MCP tool, Montaic and the audit
 *     template call the API directly and never send one. This is the
 *     strongest single signal, and the reason the counts drop.
 *   - no X-Internal-Source header (any value, not only outreach-scan), and
 *     not the keyed Montaic lane
 *   - the user agent is not a bot (bot-ua.ts)
 *   - for captures, the email is not internal
 *
 * `source` records which caller it was, so excluded traffic is explained in
 * the briefing rather than hidden.
 */

import { isBotUserAgent } from "./bot-ua";

export interface ClassifyInput {
  userAgent: string | null | undefined;
  /** Value of the X-Internal-Source header, or "" when absent. */
  internalSource: string | null | undefined;
  /** True when the request carried the Montaic API key. */
  keyed: boolean;
  /** body.client as sent by the caller. The page sends "page". */
  client?: string | null;
  /** body.session_id as sent by the caller. */
  sessionId?: string | null;
}

export interface Classification {
  source: string;
  is_internal: 0 | 1;
  is_bot: 0 | 1;
  /** Convenience: source is the page, not internal, not a bot. */
  is_person: boolean;
}

/** Session ids come from the browser. Keep only a short, plain token. */
export function cleanSessionId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null;
}

function headerSource(v: string): string {
  const s = v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "internal";
}

export function classifyRequest(input: ClassifyInput): Classification {
  const ua = (input.userAgent ?? "").trim();
  const is_bot: 0 | 1 = isBotUserAgent(ua) ? 1 : 0;
  const internalHeader = (input.internalSource ?? "").trim();
  const session = cleanSessionId(input.sessionId);

  let source: string;
  let is_internal: 0 | 1 = 0;

  if (input.keyed) {
    source = "montaic";
    is_internal = 1;
  } else if (internalHeader) {
    source = headerSource(internalHeader);
    is_internal = 1;
  } else if (/neverranked-mcp/i.test(ua)) {
    source = "mcp";
  } else if (/neverranked-audittemplate/i.test(ua)) {
    source = "audit-template";
    is_internal = 1;
  } else if (/neverranked-outreach/i.test(ua)) {
    source = "outreach-scan";
    is_internal = 1;
  } else if (input.client === "page" && session) {
    source = "page";
  } else if (is_bot) {
    source = "script";
  } else {
    source = "api";
  }

  return { source, is_internal, is_bot, is_person: source === "page" && !is_internal && !is_bot };
}

export interface InternalEmailResult {
  internal: boolean;
  reason: string | null;
}

/** Domains that are always us. Subdomains count (hi.neverranked.com). */
const INTERNAL_DOMAINS = ["neverranked.com", "hellomomentum.co"];
/** Reserved for documentation and testing (RFC 2606). Never a real lead. */
const TEST_DOMAINS = ["example.com", "example.org", "example.net"];

function domainMatches(host: string, d: string): boolean {
  return host === d || host.endsWith("." + d);
}

/**
 * Is this capture one of us? `internalList` is the INTERNAL_EMAILS Worker
 * secret, a comma list. It is a secret, not a constant here, because this
 * repo is public and must never hold a personal address.
 */
export function internalEmail(email: string, internalList: string | null | undefined): InternalEmailResult {
  const e = (email || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  const host = at >= 0 ? e.slice(at + 1) : "";
  const list = (internalList || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.includes(e)) return { internal: true, reason: "internal_emails" };
  if (INTERNAL_DOMAINS.some((d) => domainMatches(host, d))) return { internal: true, reason: "internal_domain" };
  if (TEST_DOMAINS.some((d) => domainMatches(host, d))) return { internal: true, reason: "test_domain" };
  return { internal: false, reason: null };
}
