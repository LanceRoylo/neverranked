/**
 * billing-failure.ts — is this refusal a payment problem, and whose?
 *
 * On 2026-10-01 Google declined the card behind the Gemini API, the prepaid
 * credit was already at -$0.24, and the only warning was a vendor email read by
 * chance. The engine_quota_exhausted alert existed, but it recognised OpenAI's
 * wording only ("insufficient_quota", "no credits remaining"), because OpenAI
 * was the one that had run dry before (2026-09-12). Every other vendor's empty
 * balance would have surfaced eight hours later as a generic engine drop.
 *
 * This names the VENDOR, not just the engine, because the vendor is what a
 * person pays, and one vendor can carry several surfaces: DataForSEO is both
 * Google AI Overviews and the Bing control, and Anthropic is a surface AND the
 * writing layer of every client deliverable.
 *
 * Kept separate from citations.ts isTerminalQuota(), which decides whether the
 * OpenAI retry loop gives up. That is a different question with a different
 * cost of being wrong, and widening it would change retry behaviour.
 */

export interface Vendor {
  name: string;
  /** Where a person goes to pay. Named, not linked: billing URLs move. */
  payAt: string;
  /** Every measured surface this vendor's balance stops, not just this one. */
  surfaces: string[];
  /** Anything else that stops with it. */
  alsoStops?: string;
}

export const VENDOR_BY_ENGINE: Record<string, Vendor> = {
  openai: { name: "OpenAI", payAt: "OpenAI platform, Settings > Billing", surfaces: ["openai"] },
  perplexity: { name: "Perplexity", payAt: "Perplexity API settings, Billing", surfaces: ["perplexity"] },
  gemini: {
    name: "Google AI Studio (Gemini API)",
    payAt: "AI Studio > Billing (prepaid credits; auto-reload may be off)",
    surfaces: ["gemini"],
  },
  anthropic: {
    name: "Anthropic",
    payAt: "Anthropic Console > Billing",
    surfaces: ["anthropic"],
    alsoStops: "the readout prose, Atlas and the outreach generator, which all call the same account",
  },
  gemma: { name: "DeepInfra", payAt: "DeepInfra dashboard > Billing", surfaces: ["gemma"] },
  google_ai_overview: {
    name: "DataForSEO",
    payAt: "DataForSEO dashboard > Billing (prepaid balance)",
    surfaces: ["google_ai_overview", "bing"],
  },
  bing: {
    name: "DataForSEO",
    payAt: "DataForSEO dashboard > Billing (prepaid balance)",
    surfaces: ["google_ai_overview", "bing"],
  },
};

/**
 * Wording providers use for an empty balance, a spend cap or a disabled billing
 * account. Deliberately excludes plain rate limiting: "overloaded", "try again
 * in 76ms" and a bare RESOURCE_EXHAUSTED are not here, because a rate limit
 * clears on its own and an alert for one would teach people to ignore this.
 */
const BILLING_WORDING = new RegExp(
  [
    "insufficient_quota",
    "no credits remaining",
    "billing_hard_limit_reached",
    "exceeded your current quota",
    "credit balance is too low",
    "insufficient (?:credit|credits|balance|funds)",
    "out of credits",
    "credits? (?:are |have been )?(?:depleted|exhausted)",
    "prepay(?:ment)?[^.]{0,40}(?:depleted|exhausted|insufficient|required)",
    "payment required",
    "billing (?:account )?(?:is )?(?:disabled|not active|inactive|suspended|closed)",
  ].join("|"),
  "i",
);

/** Pure: is this refusal a payment problem? */
export function isBillingFailure(status: number | null | undefined, detail: string): boolean {
  if (status === 402) return true;
  // DataForSEO reports in its own code space inside a 200; 402xx is payment.
  if (/^DataForSEO 402\d\d\b/.test(detail)) return true;
  return BILLING_WORDING.test(detail);
}

/** The vendor to pay for this engine, or a generic stand-in for an unmapped one. */
export function vendorFor(engine: string): Vendor {
  const base = engine.split(":")[0];
  return VENDOR_BY_ENGINE[base] ?? { name: base, payAt: "the provider's billing page", surfaces: [base] };
}

/** The alert a billing refusal raises. Pure, so the wording can be tested. */
export function billingAlert(engine: string, detail: string): { title: string; detail: string } {
  const v = vendorFor(engine);
  const others = v.surfaces.filter((s) => s !== engine.split(":")[0]);
  const scope = others.length > 0
    ? `This stops ${v.surfaces.length} measured surfaces at once (${v.surfaces.join(" and ")}), not just ${engine}. `
    : "";
  const also = v.alsoStops ? `It also stops ${v.alsoStops}. ` : "";
  return {
    title: `${v.name}: payment refused, ${v.surfaces.join(" + ")} measurement stopped`,
    detail:
      `${engine} refused a measurement call for billing or a spend cap: "${detail.slice(0, 200)}". ` +
      scope + also +
      `This does not clear on its own and no retry will fix it. Every remaining question on ` +
      `${others.length > 0 ? "these surfaces" : "this surface"} today will be refused, so any readout covering today ` +
      `holds none of ${others.length > 0 ? "their" : "its"} data. Pay at: ${v.payAt}. ` +
      `Then confirm with the live engine probe at /admin/health rather than waiting for tomorrow's 06:00 UTC sweep. ` +
      `If the card was declined, see business/VENDORS.md in the docs repo for which card each vendor is on.`,
  };
}
