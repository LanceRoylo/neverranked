/**
 * track.js is the one file that holds the ad IDs. These cases pin the two
 * promises the privacy page makes: nothing loads until an ID is set, and no
 * email, checked site or score reaches Meta or LinkedIn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const TRACK = readFileSync(here("../../track.js"), "utf8");
const WORKER = readFileSync(here("../../tools/schema-check/src/index.ts"), "utf8");

type Run = { loaded: string[]; address: string; win: any; click: (href: string, hostname: string) => { href: string } };

function run(opts: { url: string; meta?: string; partner?: string; nav?: Record<string, unknown>; store?: Record<string, string> }): Run {
  const src = TRACK
    .replace('var META_PIXEL_ID = "";', `var META_PIXEL_ID = "${opts.meta ?? ""}";`)
    .replace('var LINKEDIN_PARTNER_ID = "";', `var LINKEDIN_PARTNER_ID = "${opts.partner ?? ""}";`);
  const u = new URL(opts.url);
  const loaded: string[] = [];
  const store: Record<string, string> = opts.store ?? {};
  let clickHandler: (ev: unknown) => void = () => {};
  const location = { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash };
  let address = opts.url;
  const win: any = {};
  const sandbox: any = {
    window: win,
    location,
    navigator: opts.nav ?? {},
    URL,
    URLSearchParams,
    sessionStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    },
    history: { replaceState: (_s: unknown, _t: string, next: string) => { address = u.origin + next; } },
    document: {
      head: { appendChild: (s: { src: string }) => loaded.push(s.src) },
      createElement: () => ({}),
      addEventListener: (_n: string, fn: (ev: unknown) => void) => { clickHandler = fn; },
    },
  };
  vm.runInNewContext(src, sandbox);
  return {
    loaded,
    get address() { return address; },
    win,
    click(href: string, hostname: string) {
      const a = { href, hostname };
      clickHandler({ target: { closest: () => a } });
      return a;
    },
  } as Run;
}

test("with no IDs set, nothing loads and events are harmless", () => {
  const r = run({ url: "https://neverranked.com/pricing/" });
  assert.deepEqual(r.loaded, []);
  assert.equal(r.win.fbq, undefined);
  assert.equal(r.win.lintrk, undefined);
  r.win.nrTrack("lead");
});

test("with IDs set, both tags load on a public page", () => {
  const r = run({ url: "https://neverranked.com/?utm_source=meta&fbclid=abc", meta: "111", partner: "222" });
  assert.equal(r.loaded.length, 2);
  const calls = r.win.fbq.queue.map((a: unknown[]) => Array.from(a));
  assert.deepEqual(calls[0], ["set", "autoConfig", false, "111"]);
  assert.ok(calls.some((c: unknown[]) => c[1] === "PageView"));
});

test("a private path or an unknown query string loads nothing", () => {
  for (const url of [
    "https://neverranked.com/pitch/some-prospect/",
    "https://check.neverranked.com/?ref_name=Agency&ref_email=a%40b.co",
    "https://neverranked.com/?email=a%40b.co",
    "https://check.neverranked.com/unsubscribe?t=abc",
  ]) {
    assert.deepEqual(run({ url, meta: "111", partner: "222" }).loaded, [], url);
  }
});

test("the checked site is removed from the address before any tag loads", () => {
  const r = run({ url: "https://check.neverranked.com/?url=example.com&utm_source=meta", meta: "111" });
  assert.equal(r.loaded.length, 1);
  assert.equal(r.address, "https://check.neverranked.com/?utm_source=meta");
});

test("Global Privacy Control and Do Not Track load nothing", () => {
  const url = "https://neverranked.com/";
  assert.deepEqual(run({ url, meta: "111", nav: { globalPrivacyControl: true } }).loaded, []);
  assert.deepEqual(run({ url, meta: "111", nav: { doNotTrack: "1" } }).loaded, []);
});

test("UTM tags carry from the site to the free check", () => {
  const r = run({ url: "https://neverranked.com/pricing/?utm_source=meta&utm_campaign=ad-you-didnt-write" });
  const a = r.click("https://check.neverranked.com/", "check.neverranked.com");
  assert.match(a.href, /utm_source=meta/);
  assert.match(a.href, /utm_campaign=ad-you-didnt-write/);
});

test("the $249 link fires InitiateCheckout and nothing personal", () => {
  const r = run({ url: "https://neverranked.com/pricing/", meta: "111" });
  r.click("https://buy.stripe.com/28EeVc6dMaId5cj08Je3e01", "buy.stripe.com");
  const last = Array.from(r.win.fbq.queue.at(-1) as unknown[]) as any[];
  assert.equal(last[1], "InitiateCheckout");
  assert.equal(last[2].value, 249);
});

test("/pricing/ fires ViewContent", () => {
  const r = run({ url: "https://neverranked.com/pricing/", meta: "111" });
  const names = r.win.fbq.queue.map((a: any) => a[1]);
  assert.ok(names.includes("ViewContent"));
});

test("the check tool calls nrTrack and passes no score or placeholder conversion", () => {
  assert.match(WORKER, /src="https:\/\/neverranked\.com\/track\.js"/);
  assert.match(WORKER, /nrTrack\('scan_complete'\)/);
  assert.match(WORKER, /nrTrack\('lead'\)/);
  assert.doesNotMatch(WORKER, /conversion_id/);
  assert.doesNotMatch(WORKER, /fbq\(/);
});
