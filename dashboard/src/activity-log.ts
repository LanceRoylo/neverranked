/**
 * Activity-log helpers: write structured deploy / refresh / change
 * events into admin_alerts so they surface in the customer-facing
 * Recent Activity feed.
 *
 * The activity feed (rendered by buildActivityTimeline in
 * routes/domain.ts) already reads from admin_alerts as one of its
 * five sources. By writing alerts with intentional types, titles,
 * and details from any code path that ships work for a client, we
 * close the gap where the customer's view shows nothing happening
 * between weekly scans even when work was actually shipped.
 *
 * Don't call createAlert directly for deploys -- this module owns
 * the deploy-event vocabulary so the icon mapping in the timeline
 * stays consistent.
 */
import type { Env } from "./types";
import { createAlertIfFresh } from "./admin-alerts";

/** Friendly description for a schema_type. Falls back to the raw
 *  type name if we don't have one. Customer-facing copy. */
const TYPE_DESCRIPTIONS: Record<string, string> = {
  Organization: "identifies your business as an entity",
  LocalBusiness: "identifies your physical location and operating signals",
  PerformingArtsTheater: "identifies your venue (a LocalBusiness subtype)",
  Restaurant: "identifies your restaurant (a LocalBusiness subtype)",
  Hotel: "identifies your property (a LocalBusiness subtype)",
  WebSite: "enables sitelinks search and identifies your site to AI engines",
  AggregateRating: "exposes your aggregate review score so AI engines have a social-proof hook to cite",
  BreadcrumbList: "tells AI engines how your site is organized",
  FAQPage: "gives AI engines structured Q&A pairs they can cite directly",
  Article: "marks content as authored, dated, and attributed",
  BlogPosting: "marks content as authored, dated, and attributed",
  Product: "describes a product in machine-readable form",
  Service: "describes a service in machine-readable form",
  Event: "describes a single event with date, location, and ticket info",
  Person: "describes a named individual that AI engines can attribute authorship to",
  HowTo: "structures step-by-step content for AI to cite",
  Recipe: "structures a recipe in machine-readable form",
};

export interface DeployedSchema {
  schema_type: string;
  count?: number; // for bulk types like Event, the number of instances
}

/** Log a schema deployment to the customer's activity feed. Pass
 *  one DeployedSchema per logical group -- e.g. Organization+WebSite
 *  shipped together = one call with both types listed; a 31-event
 *  bulk import = one call with {schema_type: "Event", count: 31}. */
export async function logSchemaDeployed(
  env: Env,
  clientSlug: string,
  schemas: DeployedSchema[],
  options?: { scope?: string },
): Promise<void> {
  if (schemas.length === 0) return;

  // Build customer-facing title and detail.
  const parts = schemas.map((s) =>
    s.count && s.count > 1 ? `${s.count} ${s.schema_type} schemas` : `${s.schema_type} schema`
  );
  const title = parts.length === 1
    ? `Deployed ${parts[0]}`
    : `Deployed ${parts.slice(0, -1).join(", ")} + ${parts[parts.length - 1]}`;

  const sentences = schemas
    .map((s) => {
      const desc = TYPE_DESCRIPTIONS[s.schema_type];
      return desc ? `${s.schema_type} ${desc}.` : null;
    })
    .filter((s): s is string => Boolean(s));
  const scopeNote = options?.scope ? ` Scoped to ${options.scope}.` : "";
  const detail = sentences.join(" ") + scopeNote;

  await createAlertIfFresh(env, {
    clientSlug,
    type: "deploy",
    title,
    detail: detail || "Schema is now serving on every page.",
    windowHours: 1,
  });
}

/** Log a cron activation (one-time, when a refresh job is wired
 *  up for a client). Use this from onboarding flows, not the cron
 *  itself. */
export async function logCronActivated(
  env: Env,
  clientSlug: string,
  cronName: string,
  detail: string,
): Promise<void> {
  await createAlertIfFresh(env, {
    clientSlug,
    type: "cron_activated",
    title: cronName,
    detail,
    windowHours: 24 * 30, // monthly dedupe -- this should fire once per cron, ever
  });
}
