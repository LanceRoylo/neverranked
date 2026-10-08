/**
 * Who is a person on the free check. Table-driven over every caller we know
 * about, because the old count treated all of them as visitors.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { classifyRequest, internalEmail, cleanSessionId } from "../../tools/schema-check/src/free-check-classify.ts";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const SESSION = "3f1c2b9e-8d7a-4c6b-9e5f-1a2b3c4d5e6f";

const CASES: { name: string; input: Parameters<typeof classifyRequest>[0]; source: string; internal: 0 | 1; bot: 0 | 1; person: boolean }[] = [
  { name: "real Chrome from the page", input: { userAgent: CHROME, internalSource: "", keyed: false, client: "page", sessionId: SESSION }, source: "page", internal: 0, bot: 0, person: true },
  { name: "real Chrome WITHOUT a session id", input: { userAgent: CHROME, internalSource: "", keyed: false }, source: "api", internal: 0, bot: 0, person: false },
  { name: "Chrome claiming client page but no session", input: { userAgent: CHROME, internalSource: "", keyed: false, client: "page" }, source: "api", internal: 0, bot: 0, person: false },
  { name: "keyed Montaic lane", input: { userAgent: "node", internalSource: "", keyed: true }, source: "montaic", internal: 1, bot: 1, person: false },
  { name: "Montaic key even with a page session", input: { userAgent: CHROME, internalSource: "", keyed: true, client: "page", sessionId: SESSION }, source: "montaic", internal: 1, bot: 0, person: false },
  { name: "our MCP tool", input: { userAgent: "neverranked-mcp/0.1.4", internalSource: "", keyed: false }, source: "mcp", internal: 0, bot: 1, person: false },
  { name: "X-Internal-Source: audit-template", input: { userAgent: CHROME, internalSource: "audit-template", keyed: false }, source: "audit-template", internal: 1, bot: 0, person: false },
  { name: "X-Internal-Source: outreach-scan", input: { userAgent: "NeverRanked-Outreach/1.0", internalSource: "outreach-scan", keyed: false }, source: "outreach-scan", internal: 1, bot: 1, person: false },
  { name: "any other X-Internal-Source value is internal too", input: { userAgent: CHROME, internalSource: "Leaderboard Script!", keyed: false, client: "page", sessionId: SESSION }, source: "leaderboard-script", internal: 1, bot: 0, person: false },
  { name: "audit template UA without the header", input: { userAgent: "NeverRanked-AuditTemplate/0.1", internalSource: "", keyed: false }, source: "audit-template", internal: 1, bot: 1, person: false },
  { name: "Node default UA (leaderboard script)", input: { userAgent: "node", internalSource: "", keyed: false }, source: "script", internal: 0, bot: 1, person: false },
  { name: "curl", input: { userAgent: "curl/8.7.1", internalSource: "", keyed: false }, source: "script", internal: 0, bot: 1, person: false },
  { name: "empty user agent", input: { userAgent: "", internalSource: "", keyed: false }, source: "script", internal: 0, bot: 1, person: false },
  { name: "headless browser running the page", input: { userAgent: "Mozilla/5.0 HeadlessChrome/120.0", internalSource: "", keyed: false, client: "page", sessionId: SESSION }, source: "page", internal: 0, bot: 1, person: false },
];

for (const c of CASES) {
  test(`classify: ${c.name}`, () => {
    const r = classifyRequest(c.input);
    assert.equal(r.source, c.source);
    assert.equal(r.is_internal, c.internal);
    assert.equal(r.is_bot, c.bot);
    assert.equal(r.is_person, c.person);
  });
}

test("session ids are short plain tokens or nothing", () => {
  assert.equal(cleanSessionId(SESSION), SESSION);
  assert.equal(cleanSessionId("abc"), null);
  assert.equal(cleanSessionId("<script>alert(1)</script>"), null);
  assert.equal(cleanSessionId(42), null);
});

test("internal emails: the secret list, our domains, reserved test domains", () => {
  const list = "Someone@Personal.test, other@x.test";
  assert.deepEqual(internalEmail("someone@personal.test", list), { internal: true, reason: "internal_emails" });
  assert.deepEqual(internalEmail("a@neverranked.com", ""), { internal: true, reason: "internal_domain" });
  assert.deepEqual(internalEmail("a@hi.neverranked.com", ""), { internal: true, reason: "internal_domain" });
  assert.deepEqual(internalEmail("a@hellomomentum.co", undefined), { internal: true, reason: "internal_domain" });
  assert.deepEqual(internalEmail("test@example.com", ""), { internal: true, reason: "test_domain" });
  assert.deepEqual(internalEmail("owner@dental-practice.test", list), { internal: false, reason: null });
  // A lookalike domain is not us.
  assert.deepEqual(internalEmail("a@notneverranked.com", ""), { internal: false, reason: null });
});
