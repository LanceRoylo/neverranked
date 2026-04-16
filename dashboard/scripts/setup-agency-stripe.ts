/**
 * One-time setup: create Stripe products, volume-tiered prices, and the
 * intro coupon used by the agency white-label subscription.
 *
 * Run locally (Node 18+):
 *     STRIPE_SECRET_KEY=sk_test_... npx tsx dashboard/scripts/setup-agency-stripe.ts
 * or with plain node on a transpiled copy. This script is idempotent-ish:
 * it always creates new Products and Prices and logs the IDs. Re-runs
 * will create duplicates, so you should only run it once per environment
 * (test, live) and paste the printed IDs into your wrangler secrets.
 *
 * Pricing model (confirmed):
 *   Signal  (volume):  1-9 @ $1,400/mo   10-24 @ $1,300/mo   25+ @ $1,200/mo
 *   Amplify (volume):  1-9 @ $3,150/mo   10-24 @ $2,925/mo   25+ @ $2,700/mo
 *   Intro coupon:      10% off for 3 months (applied at agency activation)
 *
 * Volume tiers mean the chosen tier's unit_amount applies to ALL units
 * at that quantity. So 10 Signal slots bill at 10 * $1,300 = $13,000/mo,
 * not a blended rate. This keeps the pricing narrative clean for agencies
 * ("hit 10 clients, your per-slot rate drops").
 *
 * After running:
 *   wrangler secret put STRIPE_AGENCY_SIGNAL_PRICE_ID
 *   wrangler secret put STRIPE_AGENCY_AMPLIFY_PRICE_ID
 *   wrangler secret put STRIPE_AGENCY_INTRO_COUPON_ID
 */

const API_KEY = process.env.STRIPE_SECRET_KEY;
if (!API_KEY) {
  console.error("STRIPE_SECRET_KEY env var is required.");
  process.exit(1);
}

const COUPON_ID = "agency_intro_90d";

interface Tier {
  up_to: number | "inf";
  unit_amount: number; // cents
}

const SIGNAL_TIERS: Tier[] = [
  { up_to: 9,    unit_amount: 140000 }, // 1-9  slots: $1,400/mo each
  { up_to: 24,   unit_amount: 130000 }, // 10-24 slots: $1,300/mo each
  { up_to: "inf", unit_amount: 120000 }, // 25+  slots: $1,200/mo each
];

const AMPLIFY_TIERS: Tier[] = [
  { up_to: 9,    unit_amount: 315000 }, // 1-9  slots: $3,150/mo each
  { up_to: 24,   unit_amount: 292500 }, // 10-24 slots: $2,925/mo each
  { up_to: "inf", unit_amount: 270000 }, // 25+  slots: $2,700/mo each
];

async function stripePost(path: string, body: Record<string, string>): Promise<any> {
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = await resp.json();
  if (!resp.ok) {
    console.error(`Stripe ${path} failed:`, json);
    process.exit(1);
  }
  return json;
}

async function stripeGet(path: string): Promise<{ ok: boolean; body: any }> {
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { "Authorization": `Bearer ${API_KEY}` },
  });
  return { ok: resp.ok, body: await resp.json() };
}

function priceParams(productId: string, tiers: Tier[]): Record<string, string> {
  const params: Record<string, string> = {
    product: productId,
    currency: "usd",
    "recurring[interval]": "month",
    "recurring[usage_type]": "licensed",
    billing_scheme: "tiered",
    tiers_mode: "volume",
  };
  tiers.forEach((tier, i) => {
    params[`tiers[${i}][up_to]`] = String(tier.up_to);
    params[`tiers[${i}][unit_amount]`] = String(tier.unit_amount);
  });
  return params;
}

async function createProductAndPrice(productName: string, tiers: Tier[]): Promise<{ productId: string; priceId: string }> {
  console.log(`\nCreating product: ${productName}`);
  const product = await stripePost("/products", {
    name: productName,
    "metadata[kind]": "agency_slot",
  });
  console.log(`  product id: ${product.id}`);

  console.log(`Creating volume-tiered price for: ${productName}`);
  const price = await stripePost("/prices", priceParams(product.id, tiers));
  console.log(`  price id:   ${price.id}`);

  tiers.forEach(t => {
    const qty = t.up_to === "inf" ? "25+" : `up to ${t.up_to}`;
    console.log(`    tier ${qty}: $${(t.unit_amount / 100).toFixed(2)}/mo per slot`);
  });
  return { productId: product.id, priceId: price.id };
}

async function ensureIntroCoupon(): Promise<string> {
  console.log(`\nEnsuring coupon: ${COUPON_ID}`);
  const existing = await stripeGet(`/coupons/${COUPON_ID}`);
  if (existing.ok && existing.body?.id) {
    console.log(`  already exists: ${existing.body.id} (${existing.body.percent_off}% off, ${existing.body.duration_in_months} months)`);
    return existing.body.id;
  }
  const coupon = await stripePost("/coupons", {
    id: COUPON_ID,
    percent_off: "10",
    duration: "repeating",
    duration_in_months: "3",
    name: "Agency Intro: 10% off for 90 days",
    "metadata[kind]": "agency_intro",
  });
  console.log(`  created: ${coupon.id}`);
  return coupon.id;
}

async function main(): Promise<void> {
  const signal = await createProductAndPrice(
    "NeverRanked Agency Slot: Signal",
    SIGNAL_TIERS,
  );
  const amplify = await createProductAndPrice(
    "NeverRanked Agency Slot: Amplify",
    AMPLIFY_TIERS,
  );
  const couponId = await ensureIntroCoupon();

  console.log(`
==============================================================
Done. Paste these into wrangler secrets:

  STRIPE_AGENCY_SIGNAL_PRICE_ID   = ${signal.priceId}
  STRIPE_AGENCY_AMPLIFY_PRICE_ID  = ${amplify.priceId}
  STRIPE_AGENCY_INTRO_COUPON_ID   = ${couponId}

Set them with:
  wrangler secret put STRIPE_AGENCY_SIGNAL_PRICE_ID
  wrangler secret put STRIPE_AGENCY_AMPLIFY_PRICE_ID
  wrangler secret put STRIPE_AGENCY_INTRO_COUPON_ID
==============================================================
`);
}

main().catch(err => {
  console.error("Setup failed:", err);
  process.exit(1);
});
