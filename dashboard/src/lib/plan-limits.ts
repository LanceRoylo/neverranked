/**
 * Per-plan quotas + feature flags.
 *
 * Single source of truth for what each NeverRanked tier includes.
 * Schema generators, citation runners, and dashboard renderers all
 * call `getPlanLimits()` to decide what's allowed for a given client.
 *
 * The plan field lives on `domains.plan` (per-engagement). Two
 * helpers handle the lookup + cap enforcement:
 *
 *   getPlanForClient(env, clientSlug)  -> 'pulse' | 'signal' | 'amplify'
 *   getPlanLimits(plan)                -> structured limits object
 *   countMonthlySchemas(env, slug)     -> int (this calendar month)
 *   countTrackedPrompts(env, slug)     -> int (active citation_keywords)
 *
 * Default plan when domains.plan is NULL: 'signal'. We assume legacy
 * customers were on the agency tier (Signal) -- safer than locking
 * them out by defaulting to Pulse limits.
 */
import type { Env } from "../types";

export type Plan = "pulse" | "signal" | "amplify" | "enterprise";

export interface PlanLimits {
  /** Hard cap on tracked prompts (citation_keywords rows). -1 = unlimited. */
  trackedPrompts: number;
  /** Hard cap on auto-generated schemas per calendar month. -1 = unlimited. */
  monthlySchemas: number;
  /** Allowed schema types. Generators outside this list refuse. */
  allowedSchemaTypes: string[];
  /** Citation tracking cadence: 'monthly' = once a month, 'weekly' = every Monday. */
  citationCadence: "monthly" | "weekly";
  /** Feature gates for dashboard widgets + cron jobs. */
  features: {
    weeklyDigestEmail: boolean;
    redditTracking: boolean;
    authorityAudits: boolean;
    industryPercentile: boolean;
    autoContentDrafts: boolean;
    autoPublishToCMS: boolean;
    fullDashboard: boolean;       // false = read-only stripped view
    apiAccess: boolean;
    multiUser: boolean;
    realTimeAlerts: boolean;      // citation gained/lost emails between reports
  };
  /** UI label for the plan. */
  displayName: string;
}

/** All currently-deployable schema generators. Used as the Signal/Amplify
 *  default. Pulse gets a strict subset. */
const ALL_SCHEMA_TYPES = [
  "FAQPage", "Article", "BlogPosting", "Person", "Service",
  "HowTo", "BreadcrumbList", "LocalBusiness", "Organization",
  "Product", "Event", "WebSite",
];

/** Plan -> limits. Edit here when adjusting tier features. */
const LIMITS: Record<Plan, PlanLimits> = {
  pulse: {
    trackedPrompts: 10,
    monthlySchemas: 2,
    allowedSchemaTypes: ["FAQPage", "Article"],   // intentionally narrow
    citationCadence: "monthly",
    features: {
      weeklyDigestEmail: false,
      redditTracking: false,
      authorityAudits: false,
      industryPercentile: false,
      autoContentDrafts: false,
      autoPublishToCMS: false,
      fullDashboard: false,
      apiAccess: false,
      multiUser: false,
      realTimeAlerts: false,
    },
    displayName: "Pulse",
  },
  signal: {
    trackedPrompts: 50,
    monthlySchemas: -1,
    allowedSchemaTypes: ALL_SCHEMA_TYPES,
    citationCadence: "weekly",
    features: {
      weeklyDigestEmail: true,
      redditTracking: true,
      authorityAudits: true,
      industryPercentile: true,
      autoContentDrafts: false,        // Amplify-only
      autoPublishToCMS: false,         // Amplify-only
      fullDashboard: true,
      apiAccess: false,                // Enterprise-only
      multiUser: false,                // Enterprise-only
      realTimeAlerts: true,
    },
    displayName: "Signal",
  },
  amplify: {
    trackedPrompts: 100,
    monthlySchemas: -1,
    allowedSchemaTypes: ALL_SCHEMA_TYPES,
    citationCadence: "weekly",
    features: {
      weeklyDigestEmail: true,
      redditTracking: true,
      authorityAudits: true,
      industryPercentile: true,
      autoContentDrafts: true,
      autoPublishToCMS: true,
      fullDashboard: true,
      apiAccess: false,                // Enterprise-only
      multiUser: false,                // Enterprise-only
      realTimeAlerts: true,
    },
    displayName: "Amplify",
  },
  enterprise: {
    trackedPrompts: -1,
    monthlySchemas: -1,
    allowedSchemaTypes: ALL_SCHEMA_TYPES,
    citationCadence: "weekly",
    features: {
      weeklyDigestEmail: true,
      redditTracking: true,
      authorityAudits: true,
      industryPercentile: true,
      autoContentDrafts: true,
      autoPublishToCMS: true,
      fullDashboard: true,
      apiAccess: true,
      multiUser: true,
      realTimeAlerts: true,
    },
    displayName: "Enterprise",
  },
};

/** Look up the plan currently assigned to a client. Falls back to
 *  'signal' when domains.plan is NULL (legacy customers and audit-only
 *  buyers). Returns 'signal' on missing client too -- safer than throwing
 *  in the middle of a generator. */
export async function getPlanForClient(env: Env, clientSlug: string): Promise<Plan> {
  const row = await env.DB.prepare(
    "SELECT plan FROM domains WHERE client_slug = ? AND plan IS NOT NULL ORDER BY id ASC LIMIT 1"
  ).bind(clientSlug).first<{ plan: string | null }>();
  const raw = (row?.plan || "signal").toLowerCase();
  if (raw === "pulse" || raw === "signal" || raw === "amplify" || raw === "enterprise") {
    return raw as Plan;
  }
  return "signal";
}

/** Synchronous lookup once you have the plan string. */
export function getPlanLimits(plan: Plan): PlanLimits {
  return LIMITS[plan];
}

/** Count schemas inserted (any status) for this client in the current
 *  UTC calendar month. Used by quota enforcement on Pulse. */
export async function countMonthlySchemas(env: Env, clientSlug: string): Promise<number> {
  const now = new Date();
  const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM schema_injections
       WHERE client_slug = ? AND quality_graded_at >= ?`
  ).bind(clientSlug, monthStart).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count active citation_keywords for this client. Used by quota
 *  enforcement when adding new prompts. */
export async function countTrackedPrompts(env: Env, clientSlug: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM citation_keywords WHERE client_slug = ? AND active = 1"
  ).bind(clientSlug).first<{ n: number }>();
  return row?.n ?? 0;
}

/** One-shot helper: "is this schema generator allowed to run for this
 *  client right now?" Returns {ok: true} or {ok: false, reason}. */
export async function checkSchemaQuota(
  env: Env,
  clientSlug: string,
  schemaType: string,
): Promise<{ ok: true } | { ok: false; reason: string; plan: Plan; usage: number; cap: number }> {
  const plan = await getPlanForClient(env, clientSlug);
  const limits = getPlanLimits(plan);

  if (!limits.allowedSchemaTypes.includes(schemaType)) {
    return {
      ok: false,
      reason: `${schemaType} schemas are not included on the ${limits.displayName} plan. Upgrade to Signal or Amplify to deploy ${schemaType}.`,
      plan,
      usage: 0,
      cap: 0,
    };
  }

  if (limits.monthlySchemas === -1) return { ok: true };
  const used = await countMonthlySchemas(env, clientSlug);
  if (used >= limits.monthlySchemas) {
    return {
      ok: false,
      reason: `Monthly schema cap reached (${used}/${limits.monthlySchemas}) on the ${limits.displayName} plan. Resets on the 1st. Upgrade to Signal for unlimited schemas.`,
      plan,
      usage: used,
      cap: limits.monthlySchemas,
    };
  }
  return { ok: true };
}

/** Type of features that can be plan-gated at the route level. */
export type GatedFeature = keyof PlanLimits["features"];

/** Returns true if the client's current plan includes the named feature.
 *  Use this at the entry of any route/operation that should be Signal+
 *  only (Reddit tracking, authority audits, industry percentile, etc.). */
export async function clientHasFeature(
  env: Env,
  clientSlug: string,
  feature: GatedFeature,
): Promise<boolean> {
  const plan = await getPlanForClient(env, clientSlug);
  return getPlanLimits(plan).features[feature];
}

/** Render-ready upgrade prompt body for routes that gate on plan. The
 *  caller wraps this in their layout() and returns a 200 (not a 403 --
 *  the user has access to the URL, just not the feature). */
export function upgradePromptHtml(
  feature: GatedFeature,
  currentPlan: Plan,
): string {
  const friendlyNames: Record<GatedFeature, string> = {
    weeklyDigestEmail: "Weekly digest emails",
    redditTracking: "Reddit thread tracking",
    authorityAudits: "Authority signal monitoring",
    industryPercentile: "Industry percentile benchmarks",
    autoContentDrafts: "Auto-generated content drafts",
    autoPublishToCMS: "Auto-publish to your CMS",
    fullDashboard: "Full dashboard view",
    apiAccess: "API access",
    multiUser: "Multi-user accounts",
    realTimeAlerts: "Real-time citation alerts",
  };
  // Which tier unlocks each feature.
  const unlocksAt: Record<GatedFeature, Plan> = {
    weeklyDigestEmail: "signal",
    redditTracking: "signal",
    authorityAudits: "signal",
    industryPercentile: "signal",
    autoContentDrafts: "amplify",
    autoPublishToCMS: "amplify",
    fullDashboard: "signal",
    apiAccess: "enterprise",
    multiUser: "enterprise",
    realTimeAlerts: "signal",
  };
  const friendly = friendlyNames[feature];
  const required = LIMITS[unlocksAt[feature]];
  const current = LIMITS[currentPlan];
  return `
    <div style="max-width:560px;margin:80px auto;padding:24px;text-align:center">
      <div style="font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:18px">
        ${required.displayName} feature
      </div>
      <h1 style="font-family:var(--serif);font-weight:400;font-size:34px;line-height:1.15;margin:0 0 16px 0;letter-spacing:-.01em">
        ${friendly} is part of <em>${required.displayName}.</em>
      </h1>
      <p style="font-size:15px;line-height:1.7;color:var(--text-mute);margin:0 0 32px 0">
        You are currently on <strong>${current.displayName}</strong>. Upgrade to ${required.displayName} to unlock ${friendly.toLowerCase()} along with weekly citation tracking, unlimited schemas, and the full dashboard.
      </p>
      <a href="https://neverranked.com/#pricing"
         style="display:inline-block;font-family:var(--label);text-transform:uppercase;letter-spacing:.2em;font-size:11px;padding:14px 28px;background:var(--gold);color:var(--bg);border:1px solid var(--gold);text-decoration:none">
        See ${required.displayName} &rarr;
      </a>
      <p style="margin-top:24px;font-family:var(--mono);font-size:11px;color:var(--text-faint)">
        Questions? <a href="mailto:lance@neverranked.com" style="color:var(--gold)">lance@neverranked.com</a>
      </p>
    </div>
  `;
}

/** One-shot helper for prompt-add flows. */
export async function checkPromptQuota(
  env: Env,
  clientSlug: string,
): Promise<{ ok: true } | { ok: false; reason: string; plan: Plan; usage: number; cap: number }> {
  const plan = await getPlanForClient(env, clientSlug);
  const limits = getPlanLimits(plan);
  if (limits.trackedPrompts === -1) return { ok: true };
  const used = await countTrackedPrompts(env, clientSlug);
  if (used >= limits.trackedPrompts) {
    return {
      ok: false,
      reason: `Tracked-prompt cap reached (${used}/${limits.trackedPrompts}) on the ${limits.displayName} plan. Upgrade to Signal for 50 prompts or Amplify for 100.`,
      plan,
      usage: used,
      cap: limits.trackedPrompts,
    };
  }
  return { ok: true };
}
