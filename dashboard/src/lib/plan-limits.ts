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
