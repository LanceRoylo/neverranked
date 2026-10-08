/**
 * bot-ua.ts: which user agents are NOT a person using the free check.
 *
 * Two copies of this file exist, byte for byte:
 *   dashboard/src/lib/bot-ua.ts
 *   tools/schema-check/src/bot-ua.ts
 * Two Workers cannot share code, so the scan Worker keeps its own copy (the
 * house pattern, same as kv-paginate). dashboard/test/free-check-bot-ua-sync
 * fails if the two files differ, so edit both or neither.
 *
 * The pattern is the one the free-check admin page used, extended with the
 * callers it missed: our own MCP tool ("neverranked-mcp/x"), the audit
 * template ("NeverRanked-AuditTemplate/0.1"), Node's default fetch UA
 * ("node", "undici") and an empty user agent. Matching any "neverranked"
 * marks every one of our own tools at once.
 */

export const BOT_UA_RE =
  /playwright|headlesschrome|puppeteer|bot|crawler|spider|curl|wget|python-requests|axios|fetch\/|node|neverranked|undici/i;

/** True when the user agent is a script, crawler, test runner or one of our
 *  own tools. A missing or blank user agent counts as a bot: no browser sends
 *  an empty one. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  const s = (ua ?? "").trim();
  if (!s) return true;
  return BOT_UA_RE.test(s);
}
