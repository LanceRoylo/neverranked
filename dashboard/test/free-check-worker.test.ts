/**
 * The scan Worker's capture path, end to end in-process: the real fetch
 * handler from tools/schema-check/src/index.ts, a KV fake that records TTLs,
 * a D1 fake on node:sqlite with the real migration SQL, and a fetch stub for
 * the scanned site and Resend.
 *
 * What it pins (free-check fix plan, sections 1b and 2):
 *   - leads and capture events never expire in KV
 *   - the lead row is written with the consent words looked up on the
 *     server, never the browser's
 *   - the emailed result is built from OUR stored scan, not the browser's
 *     report, and every field is escaped or whitelisted
 *   - a D1 failure cannot lose a capture (lead_d1_failed in KV, no TTL)
 *   - the new-lead alert goes to LEAD_ALERT_TO for real leads only
 *   - every call is classified at write time
 *   - the drip does not run unless DRIP_ENABLED is "1"
 *
 * The D1 cases need dashboard/migrations/0131_free_check_leads.sql, which
 * ships in its own PR first. Until that file exists on the branch, and on a
 * Node without node:sqlite, they skip and say why. The source-shape cases
 * always run.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const WORKER_SRC = readFileSync(here("../../tools/schema-check/src/index.ts"), "utf8");
const MIGRATION = here("../migrations/0131_free_check_leads.sql");

// ---------- source shape ----------

test("no KV write of a lead or capture record carries a TTL", () => {
  const puts = [...WORKER_SRC.matchAll(/LEADS\.put\(([\s\S]*?)\);/g)].map((m) => m[1]);
  assert.ok(puts.length > 5, "expected to find the KV writes");
  const durable = puts.filter((p) => /lead:|leadKey|captureKey|event:capture:|lead_d1_failed|failKey|unsub:|unsubscribed:|key\.name/.test(p.split(",")[0]));
  assert.ok(durable.length >= 6, `found ${durable.length} durable writes`);
  const withTtl = durable.filter((p) => /expirationTtl/.test(p));
  assert.deepEqual(withTtl, [], "a lead/capture/unsubscribe record must never expire");
});

test("the A/B tests and their stats endpoint are gone", () => {
  assert.doesNotMatch(WORKER_SRC, /"\/api\/ab-stats"/);
  assert.doesNotMatch(WORKER_SRC, /GATE_COPY|gateVariant|nr_gate_variant|nr_gate_level|gateLevel === 'aggressive'/);
  assert.doesNotMatch(WORKER_SRC, /a short conversation with Lance/);
  assert.doesNotMatch(WORKER_SRC, /read from a person, not a bot/);
});

test("no booking link or call ask on the check page (decision 13)", () => {
  assert.doesNotMatch(WORKER_SRC, /cal\.com/);
  assert.doesNotMatch(WORKER_SRC, /15 minutes with Lance/i);
  assert.doesNotMatch(WORKER_SRC, /content="https:\/\/neverranked\.com\/images\/check-og\.png"/, "the old og:image 404s");
});

test("the drip is off unless DRIP_ENABLED is exactly \"1\"", async () => {
  const worker = (await import("../../tools/schema-check/src/index.ts")).default as any;
  for (const flag of [undefined, "", "0", "true", "yes"]) {
    let scheduled = 0;
    await worker.scheduled({} as any, { DRIP_ENABLED: flag, LEADS: kvFake().kv } as any, { waitUntil: () => { scheduled++; } } as any);
    assert.equal(scheduled, 0, `DRIP_ENABLED=${JSON.stringify(flag)} must not start the drip`);
  }
  let started = 0;
  await worker.scheduled({} as any, { DRIP_ENABLED: "1", LEADS: kvFake().kv } as any, { waitUntil: (p: Promise<unknown>) => { started++; p.catch(() => {}); } } as any);
  assert.equal(started, 1);
});

// ---------- fakes ----------

function kvFake() {
  const store = new Map<string, { value: string; opts?: { expirationTtl?: number } }>();
  const kv = {
    async get(k: string) { return store.get(k)?.value ?? null; },
    async put(k: string, value: string, opts?: { expirationTtl?: number }) { store.set(k, { value, opts }); },
    async delete(k: string) { store.delete(k); },
    async list({ prefix = "" }: { prefix?: string } = {}) {
      return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
    },
  };
  return { kv, store };
}

async function d1Fake(failOn?: RegExp) {
  let sqlite: any;
  try { sqlite = await import("node:sqlite"); } catch { return null; }
  if (!existsSync(MIGRATION)) return null;
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(readFileSync(here("../migrations/0051_admin_inbox.sql"), "utf8"));
  db.exec("ALTER TABLE admin_inbox ADD COLUMN last_seen_at INTEGER");
  db.exec(readFileSync(MIGRATION, "utf8"));
  const norm = (v: unknown) => (v === undefined ? null : v);
  const stmt = (sql: string, args: unknown[] = []) => ({
    sql,
    bind: (...a: unknown[]) => stmt(sql, a),
    _check() { if (failOn && failOn.test(sql)) throw new Error("D1_ERROR: simulated outage"); },
    async run() { this._check(); const r = db.prepare(sql).run(...args.map(norm)); return { success: true, meta: { changes: Number(r.changes) } }; },
    async first<T>() { this._check(); return (db.prepare(sql).get(...args.map(norm)) ?? null) as T; },
    async all<T>() { this._check(); return { results: db.prepare(sql).all(...args.map(norm)) as T[] }; },
  });
  const d1 = {
    prepare: (sql: string) => stmt(sql),
    async batch(stmts: any[]) { const out = []; for (const s of stmts) out.push(/^\s*SELECT/i.test(s.sql) ? await s.all() : await s.run()); return out; },
  };
  return { d1, db };
}

const SITE_HTML = `<!doctype html><html><head><title>Example Family Dental | Family dentist</title>
<meta name="description" content="A family dental practice.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"Example Family Dental","address":{"@type":"PostalAddress","addressLocality":"Honolulu"}}</script>
</head><body><h1>Family dentistry</h1><p>${"word ".repeat(400)}</p></body></html>`;

function installFetch() {
  const calls: { url: string; body: any }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.resend.com/")) {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: `resend-${calls.length}` }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.startsWith("https://example-dental.test/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
    if (url.startsWith("https://example-dental.test")) return new Response(SITE_HTML, { status: 200, headers: { "content-type": "text/html" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
let ipSeq = 0;
function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  ipSeq++;
  return new Request(`https://check.neverranked.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": CHROME, "CF-Connecting-IP": `203.0.113.${ipSeq}`, ...headers },
    body: JSON.stringify(body),
  });
}
function ctxFake() {
  const pending: Promise<unknown>[] = [];
  return { ctx: { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} }, settle: () => Promise.all(pending) };
}

// ---------- behaviour ----------

test("page scan, then capture: stored copy, server-side consent, no TTL, alert", async (t) => {
  const fake = await d1Fake();
  if (!fake) { t.skip("needs node:sqlite and migration 0131 on this branch"); return; }
  const worker = (await import("../../tools/schema-check/src/index.ts")).default as any;
  const { kv, store } = kvFake();
  const net = installFetch();
  try {
    const env = { DB: fake.d1, LEADS: kv, RESEND_API_KEY: "test-key", LEAD_ALERT_TO: "alerts@owner.test", INTERNAL_EMAILS: "me@owner.test" };
    const session = "3f1c2b9e-8d7a-4c6b-9e5f-1a2b3c4d5e6f";

    const { ctx, settle } = ctxFake();
    const scanResp = await worker.fetch(post("/api/check", {
      url: "https://example-dental.test/", session_id: session, client: "page",
      referrer: "https://www.linkedin.com/", utm: { utm_source: "linkedin", utm_campaign: "tofu-2026-10", utm_content: "c1" },
    }), env, ctx);
    const scan = await scanResp.json();
    assert.equal(scanResp.status, 200);
    assert.match(scan.scan_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(scan.identity, { category: "dentist", town: "Honolulu" });
    assert.ok(Array.isArray(scan.missing_signals) && scan.missing_signals.length > 0);

    const ev = fake.db.prepare("SELECT type, source, is_internal, is_bot, utm_source FROM free_check_events").all().map((r: any) => ({ ...r }));
    assert.deepEqual(ev, [{ type: "scan", source: "page", is_internal: 0, is_bot: 0, utm_source: "linkedin" }]);

    // The browser lies about the score and grade. The email must not.
    const capResp = await worker.fetch(post("/api/send-report", {
      email: "Owner@Example-Dental.test", scan_id: scan.scan_id, session_id: session, client: "page",
      consent_version: "gate-2026-10a", referrer: "https://www.linkedin.com/",
      utm: { utm_source: "linkedin", utm_campaign: "tofu-2026-10", utm_content: "c1" },
      report: { domain: "example-dental.test", aeo_score: 100, grade: "A" },
    }), env, ctx);
    await settle();
    assert.equal(capResp.status, 200);

    const lead = fake.db.prepare("SELECT * FROM free_check_leads").get() as any;
    assert.equal(lead.email, "owner@example-dental.test");
    assert.equal(lead.score, scan.aeo_score);
    assert.equal(lead.grade, scan.grade);
    assert.equal(lead.consent_version, "gate-2026-10a");
    assert.equal(lead.consent_text, "We email your result now. Lance may follow up once or twice about it, and every email has an unsubscribe link. We never sell or share your email.");
    assert.equal(lead.followup_ok, 1);
    assert.equal(lead.email_verified_at, null);
    assert.equal(lead.source, "check_page");
    assert.equal(lead.utm_source, "linkedin");
    assert.equal(lead.is_internal, 0);
    assert.equal(lead.business_name, "Example Family Dental");
    assert.equal(lead.report_email_status, "sent");
    assert.equal(lead.report_email_id, "resend-1");

    const inbox = fake.db.prepare("SELECT kind, target_type, target_id, urgency, status, title FROM admin_inbox").all().map((r: any) => ({ ...r }));
    assert.deepEqual(inbox, [{ kind: "free_check_lead", target_type: "free_check_lead", target_id: lead.id, urgency: "high", status: "pending", title: "New free-check lead: example-dental.test" }]);

    for (const [k, v] of store) {
      if (/^(lead:|event:capture:|unsub:)/.test(k)) assert.equal(v.opts?.expirationTtl, undefined, `${k} must not expire`);
    }
    assert.ok(store.has("lead:owner@example-dental.test"));

    const [report, alert] = net.calls;
    assert.deepEqual(report.body.to, ["owner@example-dental.test"]);
    assert.equal(report.body.reply_to, "lance@hi.neverranked.com");
    assert.doesNotMatch(report.body.html, /Monitor|\$199/);
    assert.match(report.body.subject, new RegExp(`scored ${scan.aeo_score}/100`));
    assert.doesNotMatch(report.body.subject, /100\/100/);
    assert.match(report.body.html, /FAQ label \(FAQPage schema\)/);
    assert.match(report.body.headers["List-Unsubscribe"], /^<https:\/\/check\.neverranked\.com\/unsubscribe\?t=[0-9a-f-]{36}>$/);
    assert.deepEqual(alert.body.to, ["alerts@owner.test"]);
    assert.match(alert.body.text, /owner@example-dental\.test/);
    assert.match(alert.body.text, /utm_source=linkedin/);
    assert.match(alert.body.text, /HST/);
    assert.equal(net.calls.length, 2);
  } finally {
    net.restore();
  }
});

test("an internal capture is stored and flagged, and sends no alert", async (t) => {
  const fake = await d1Fake();
  if (!fake) { t.skip("needs node:sqlite and migration 0131 on this branch"); return; }
  const worker = (await import("../../tools/schema-check/src/index.ts")).default as any;
  const { kv } = kvFake();
  const net = installFetch();
  try {
    const env = { DB: fake.d1, LEADS: kv, RESEND_API_KEY: "test-key", LEAD_ALERT_TO: "alerts@owner.test", INTERNAL_EMAILS: "me@owner.test" };
    const { ctx, settle } = ctxFake();
    await worker.fetch(post("/api/send-report", {
      email: "me@owner.test", report: { domain: "example-dental.test", aeo_score: 40, grade: "D" },
    }), env, ctx);
    await settle();
    const lead = fake.db.prepare("SELECT is_internal, internal_reason, consent_version, followup_ok FROM free_check_leads").get();
    // No consent_version from the browser means an old cached page: legacy words.
    assert.deepEqual({ ...lead as object }, { is_internal: 1, internal_reason: "internal_emails", consent_version: "legacy-2026-05", followup_ok: 0 });
    const inbox = fake.db.prepare("SELECT urgency, title FROM admin_inbox").get() as any;
    assert.equal(inbox.urgency, "low");
    assert.match(inbox.title, /^Internal test capture/);
    assert.equal(net.calls.length, 1, "the result email only, no alert");
  } finally {
    net.restore();
  }
});

test("without a stored scan, the browser's report is whitelisted and escaped", async (t) => {
  const fake = await d1Fake();
  if (!fake) { t.skip("needs node:sqlite and migration 0131 on this branch"); return; }
  const worker = (await import("../../tools/schema-check/src/index.ts")).default as any;
  const { kv } = kvFake();
  const net = installFetch();
  try {
    const env = { DB: fake.d1, LEADS: kv, RESEND_API_KEY: "test-key" };
    const { ctx, settle } = ctxFake();
    const bad = await worker.fetch(post("/api/send-report", {
      email: "x@victim.test", report: { domain: "evil<b>.test", aeo_score: 1, grade: "F" },
    }), env, ctx);
    assert.equal(bad.status, 400, "a domain that is not a hostname is refused");

    await worker.fetch(post("/api/send-report", {
      email: "x@victim.test",
      scan_id: "00000000-0000-4000-8000-000000000000",
      report: {
        domain: "shop.test", aeo_score: "<script>", grade: "<img src=x onerror=alert(1)>",
        schema_coverage: [{ type: "FAQPage", present: false }, { type: "<a href=//evil.test>win</a>", present: false }],
        technical_signals: [{ label: "<b>Click here</b>", status: "bad" }],
        red_flags: ["<a href=http://evil.test>claim your prize</a>"],
      },
    }), env, ctx);
    await settle();
    const html: string = net.calls[0].body.html;
    assert.doesNotMatch(html, /<script|<img|evil\.test|claim your prize|Click here/);
    assert.match(html, />F</);
    assert.match(html, /FAQ label/);
  } finally {
    net.restore();
  }
});

test("a D1 failure cannot lose the capture", async (t) => {
  const fake = await d1Fake(/INSERT INTO free_check_leads/);
  if (!fake) { t.skip("needs node:sqlite and migration 0131 on this branch"); return; }
  const worker = (await import("../../tools/schema-check/src/index.ts")).default as any;
  const { kv, store } = kvFake();
  const net = installFetch();
  try {
    const env = { DB: fake.d1, LEADS: kv, RESEND_API_KEY: "test-key" };
    const { ctx, settle } = ctxFake();
    const r = await worker.fetch(post("/api/send-report", {
      email: "owner@shop.test", consent_version: "gate-2026-10a", report: { domain: "shop.test", aeo_score: 50, grade: "D" },
    }), env, ctx);
    await settle();
    assert.equal(r.status, 200, "the visitor still gets their result");
    const failed = [...store.entries()].filter(([k]) => k.startsWith("lead_d1_failed:"));
    assert.equal(failed.length, 1);
    assert.equal(failed[0][1].opts?.expirationTtl, undefined);
    const rec = JSON.parse(failed[0][1].value);
    assert.equal(rec.email, "owner@shop.test");
    assert.equal(rec.consent_version, "gate-2026-10a");
    assert.equal(store.get("lead:owner@shop.test")?.opts?.expirationTtl, undefined);
    assert.equal(net.calls.length, 1, "the result email still sends");
  } finally {
    net.restore();
  }
});

test("our MCP tool, Montaic and scripts are classified, not counted as people", async (t) => {
  const fake = await d1Fake();
  if (!fake) { t.skip("needs node:sqlite and migration 0131 on this branch"); return; }
  const worker = (await import("../../tools/schema-check/src/index.ts")).default as any;
  const { kv } = kvFake();
  const net = installFetch();
  try {
    const env = { DB: fake.d1, LEADS: kv, MONTAIC_API_KEY: "k" };
    const { ctx } = ctxFake();
    const u = { url: "https://example-dental.test/" };
    const mcp = await (await worker.fetch(post("/api/check", u, { "User-Agent": "neverranked-mcp/0.1.4" }), env, ctx)).json();
    assert.equal(mcp.scan_id, undefined, "only page scans get a stored copy");
    await worker.fetch(post("/api/check", u, { "User-Agent": "node", "X-API-Key": "k" }), env, ctx);
    await worker.fetch(post("/api/check", u, { "User-Agent": "node" }), env, ctx);
    await worker.fetch(post("/api/check", u, { "X-Internal-Source": "audit-template" }), env, ctx);
    const rows = fake.db.prepare("SELECT source, is_internal, is_bot FROM free_check_events ORDER BY id").all().map((r: any) => ({ ...r }));
    assert.deepEqual(rows, [
      { source: "mcp", is_internal: 0, is_bot: 1 },
      { source: "montaic", is_internal: 1, is_bot: 1 },
      { source: "script", is_internal: 0, is_bot: 1 },
      { source: "audit-template", is_internal: 1, is_bot: 0 },
    ]);
    assert.equal((fake.db.prepare("SELECT COUNT(*) AS n FROM free_check_scans").get() as any).n, 0);
  } finally {
    net.restore();
  }
});

test("the drip refuses without POSTAL_ADDRESS, and sends a compliant email with it", async () => {
  const worker = (await import("../../tools/schema-check/src/index.ts")).default as any;
  const lead = { email: "owner@shop.test", scans: [{ domain: "shop.test", score: 61, grade: "C", date: "2026-09-01T00:00:00.000Z" }], created: "2026-09-01T00:00:00.000Z", lastScan: "2026-09-01T00:00:00.000Z" };
  const run = async (env: Record<string, unknown>) => {
    const { kv, store } = kvFake();
    await kv.put("lead:owner@shop.test", JSON.stringify(lead));
    const net = installFetch();
    try {
      const pending: Promise<unknown>[] = [];
      await worker.scheduled({} as any, { LEADS: kv, RESEND_API_KEY: "k", DRIP_ENABLED: "1", ...env } as any, { waitUntil: (p: Promise<unknown>) => { pending.push(p); } } as any);
      await Promise.all(pending);
      return { calls: net.calls, store };
    } finally {
      net.restore();
    }
  };

  const refused = await run({});
  assert.equal(refused.calls.length, 0, "no postal address, no drip email");

  const { calls, store } = await run({ POSTAL_ADDRESS: "NeverRanked, 1 Test Street, Testville, ST 00000" });
  assert.equal(calls.length, 2, "day 3 and day 7 are both due for a lead this old");
  for (const c of calls) {
    assert.match(c.body.html, /1 Test Street, Testville/);
    assert.match(c.body.html, /\/unsubscribe\?t=[0-9a-f-]{36}/);
    assert.match(c.body.headers["List-Unsubscribe"], /^<https:\/\/check\.neverranked\.com\/unsubscribe\?t=[0-9a-f-]{36}>$/);
    assert.equal(c.body.reply_to, "lance@hi.neverranked.com");
    assert.doesNotMatch(c.body.html, /Monitor|\$199|\$750/);
  }
  for (const [k, v] of store) if (k.startsWith("unsub:")) assert.equal(v.opts?.expirationTtl, undefined);

  // An address that unsubscribed gets nothing.
  const { kv } = kvFake();
  await kv.put("lead:owner@shop.test", JSON.stringify(lead));
  await kv.put("unsubscribed:owner@shop.test", "{}");
  const net = installFetch();
  try {
    const pending: Promise<unknown>[] = [];
    await worker.scheduled({} as any, { LEADS: kv, RESEND_API_KEY: "k", DRIP_ENABLED: "1", POSTAL_ADDRESS: "NeverRanked, 1 Test Street" } as any, { waitUntil: (p: Promise<unknown>) => { pending.push(p); } } as any);
    await Promise.all(pending);
    assert.equal(net.calls.length, 0);
  } finally {
    net.restore();
  }
});

test("the loading steps only describe what the scan does", () => {
  assert.doesNotMatch(WORKER_SRC, /Testing agent-readiness and llms\.txt/);
});
