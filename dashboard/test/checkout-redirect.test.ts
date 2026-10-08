/**
 * Every /checkout/<plan> link lands on the pricing page.
 *
 * Every SKU the checkout handler sold is retired, and until 2026-10-07 its
 * 404 and 410 answers still quoted the retired "$4,500 kickoff + $1,500/month"
 * card while its kickoff/retainer page offered a free five-query pilot that
 * was retired in July. Now it is one redirect, and the in-app buttons link
 * the pricing page directly.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleCheckout, handlePulseWaitlist, PRICING_URL } from "../src/routes/checkout.ts";

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

test("every plan, known or not, 302s to the pricing page", async () => {
  assert.equal(PRICING_URL, "https://neverranked.com/pricing/");
  for (const plan of ["audit", "pulse", "signal", "amplify", "kickoff", "retainer", "monitor", "nonsense"]) {
    const r = await handleCheckout(plan, new Request(`https://app.neverranked.com/checkout/${plan}`), {} as any);
    assert.equal(r.status, 302, plan);
    assert.equal(r.headers.get("Location"), PRICING_URL, plan);
  }
});

test("the retired Pulse waitlist form posts land on pricing too", async () => {
  const r = await handlePulseWaitlist(new Request("https://app.neverranked.com/checkout/pulse/waitlist", { method: "POST" }), {} as any);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("Location"), PRICING_URL);
});

test("the router sends any /checkout/<plan> to the handler, and keeps /checkout/success", () => {
  const index = src("../src/index.ts");
  assert.match(index, /path !== "\/checkout\/success" \? path\.match\(\/\^\\\/checkout\\\/\(\[a-z0-9_-\]\{1,40\}\)\\\/\?\$\/i\)/);
  assert.match(index, /path === "\/checkout\/success" && method === "GET"/);
});

test("no retired price or free pilot is left in the checkout responses", () => {
  const checkout = src("../src/routes/checkout.ts");
  const handler = checkout.slice(checkout.indexOf("export async function handleCheckout("), checkout.indexOf("GET /checkout/success"));
  assert.doesNotMatch(handler, /\$4,500|\$1,500|pilot|no cost/);
  const waitlist = checkout.slice(checkout.indexOf("export async function handlePulseWaitlist("));
  assert.doesNotMatch(waitlist.slice(0, 600), /\$4,500|\$1,500/);
});

test("in-app links never point at a checkout route", () => {
  for (const f of ["../src/routes/demo.ts", "../src/routes/drafts.ts", "../src/routes/voice.ts"]) {
    assert.doesNotMatch(src(f), /app\.neverranked\.com\/checkout\//, f);
  }
  assert.match(src("../src/routes/demo.ts"), /https:\/\/neverranked\.com\/pricing\//);
});

test("the router no longer logs checkout_view for the redirect routes", () => {
  const index = src("../src/index.ts");
  const block = index.slice(index.indexOf("const checkoutMatch ="), index.indexOf('if (path === "/checkout/success"'));
  assert.doesNotMatch(block, /checkout_view|logEvent/);
});

test("no retired tier, price or dead-end upsell where drafting used to be sold", () => {
  for (const f of ["../src/routes/drafts.ts", "../src/routes/voice.ts"]) {
    const s = src(f);
    const nudge = s.slice(s.indexOf("function renderUpgradeNudge"), s.indexOf("\n}\n", s.indexOf("function renderUpgradeNudge")));
    assert.doesNotMatch(nudge, /Amplify|Signal|Pulse|\$\d|pricing|checkout/, f);
    // The only link left is the breadcrumb back to the dashboard.
    assert.deepEqual([...nudge.matchAll(/href="([^"]*)"/g)].map((m) => m[1]), ["/"], f);
    assert.match(nudge, /Drafting is not part of current plans\./, f);
  }
});
