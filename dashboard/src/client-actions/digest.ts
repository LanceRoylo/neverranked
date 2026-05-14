/**
 * Digest integration for the client actions surface.
 *
 * Pulls the pending state for a client (FAQ proposals awaiting review,
 * walkthroughs in progress, walkthroughs awaiting verification) and
 * returns a structured payload the Monday digest renderer can show
 * as a 'Things to do' section.
 *
 * Returns null when there's nothing pending. The digest renderer
 * omits the section entirely in that case (no noise).
 */

import type { Env } from "../types";
import { ACTION_REGISTRY, V1_ACTIVE_ACTIONS, type ActionType } from "./registry";

export interface ActionsDigestItem {
  type: ActionType;
  title: string;
  status_label: string;          // 'X waiting' | 'In progress, step Y of Z' | 'Awaiting verification' | etc.
  cta_url: string;
}

export interface ActionsDigestSection {
  client_slug: string;
  total_pending: number;
  items: ActionsDigestItem[];
}

const DASHBOARD_ORIGIN = "https://app.neverranked.com";

export async function getActionsDigestSection(
  env: Env,
  clientSlug: string,
): Promise<ActionsDigestSection | null> {
  const items: ActionsDigestItem[] = [];

  for (const actionType of V1_ACTIVE_ACTIONS) {
    const def = ACTION_REGISTRY[actionType];
    const ctaUrl = `${DASHBOARD_ORIGIN}/actions/${encodeURIComponent(clientSlug)}/${encodeURIComponent(actionType)}`;

    if (def.progress_shape === "item_driven" && actionType === "faq_review") {
      // Pending = client_faqs.status='proposed'.
      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM client_faqs
          WHERE client_slug = ? AND status = 'proposed' AND superseded_at IS NULL`,
      ).bind(clientSlug).first<{ n: number }>();
      const pending = row?.n ?? 0;
      if (pending > 0) {
        items.push({
          type: actionType,
          title: def.title,
          status_label: `${pending} FAQ${pending === 1 ? "" : "s"} awaiting your review`,
          cta_url: ctaUrl,
        });
      }
      continue;
    }

    // Step-driven or checklist-driven action. Pending if walkthrough
    // is unstarted with prerequisites met, in_progress, or
    // submitted-awaiting-verification.
    const progress = await env.DB.prepare(
      `SELECT status, current_step_id, completed_steps_json, metadata_json
         FROM client_action_progress
        WHERE client_slug = ? AND action_type = ?`,
    ).bind(clientSlug, actionType).first<{
      status: string;
      current_step_id: string | null;
      completed_steps_json: string;
      metadata_json: string | null;
    }>();

    // Skip if action requires injection_configs fields the client
    // doesn't have yet. The dashboard surface already filters these
    // out from the digest because the client can't act without those.
    if (def.prerequisites && def.prerequisites.length > 0) {
      const ctx = await env.DB.prepare(
        `SELECT business_name, business_url, business_description
           FROM injection_configs WHERE client_slug = ?`,
      ).bind(clientSlug).first<{ business_name: string | null; business_url: string | null; business_description: string | null }>();
      const haveName = Boolean(ctx?.business_name);
      const haveUrl = Boolean(ctx?.business_url);
      const haveDesc = Boolean(ctx?.business_description);
      const okToSurface = def.prerequisites.every((req) => {
        if (req === "business_name") return haveName;
        if (req === "business_url") return haveUrl;
        if (req === "business_description") return haveDesc;
        return true;
      });
      if (!okToSurface) continue;
    }

    if (!progress || progress.status === "not_started") {
      items.push({
        type: actionType,
        title: def.title,
        status_label: `${def.time_estimate_minutes} minutes, not yet started`,
        cta_url: ctaUrl,
      });
    } else if (progress.status === "in_progress") {
      if (def.progress_shape === "checklist_driven") {
        const items_def = def.checklist_items || [];
        let checked = 0;
        try {
          const meta = JSON.parse(progress.metadata_json || "{}") as { directory_states?: Record<string, { status?: string }> };
          const states = meta.directory_states || {};
          checked = Object.values(states).filter((s) => s?.status && s.status !== "not_checked").length;
        } catch { /* skip */ }
        items.push({
          type: actionType,
          title: def.title,
          status_label: `In progress · ${checked} of ${items_def.length} directories checked`,
          cta_url: ctaUrl,
        });
      } else {
        let completed: string[] = [];
        try { completed = JSON.parse(progress.completed_steps_json) as string[]; } catch { /* skip */ }
        const total = def.steps.length;
        items.push({
          type: actionType,
          title: def.title,
          status_label: `In progress · step ${Math.min(completed.length + 1, total)} of ${total}`,
          cta_url: ctaUrl,
        });
      }
    } else if (progress.status === "submitted") {
      items.push({
        type: actionType,
        title: def.title,
        status_label: "Awaiting verification (mark complete when ready)",
        cta_url: ctaUrl,
      });
    }
    // 'complete' and 'skipped' don't appear in pending list.
  }

  if (items.length === 0) return null;
  return {
    client_slug: clientSlug,
    total_pending: items.length,
    items,
  };
}
