/**
 * Getting Started checklist — Phase 2 onboarding wizard.
 *
 * Pattern chosen: persistent card on the Dashboard home (client) and
 * agency home (agency_admin). Not a modal. Each step auto-checks from
 * real DB state on every page load, so the checklist can never drift
 * from the truth. The card hides when everything is done, or when the
 * user dismisses it. Dismissal can be reversed via the "Getting
 * started" link in the avatar menu -- clears checklist_dismissed_at.
 */

import type { Env, User } from "./types";
import { canUseDraftingFeature } from "./gating";

export interface ChecklistStep {
  key: string;
  label: string;
  desc: string;
  href: string;
  cta: string;
  done: boolean;
  /** When true, the step is gated (e.g. Amplify-only) and should be
   *  shown as locked rather than actionable. */
  locked?: boolean;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * Client checklist. All queries are scoped to the logged-in client's
 * own data via client_slug. Returns a fixed-order list so the UI is
 * stable across reloads.
 */
export async function getClientChecklist(user: User, env: Env): Promise<ChecklistStep[]> {
  const slug = user.client_slug;
  if (!slug) return [];

  const [snippetRow, scanRow, compRow, voiceRow, draftRow, keywordRow] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(snippet_last_detected_at, 0) AS detected
         FROM domains
         WHERE client_slug = ? AND is_competitor = 0
         ORDER BY id LIMIT 1`,
    ).bind(slug).first<{ detected: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS cnt
         FROM scan_results
         WHERE domain_id IN (SELECT id FROM domains WHERE client_slug = ? AND is_competitor = 0)
           AND error IS NULL`,
    ).bind(slug).first<{ cnt: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS cnt
         FROM domains
         WHERE client_slug = ? AND is_competitor = 1 AND active = 1`,
    ).bind(slug).first<{ cnt: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM voice_samples WHERE client_slug = ?`,
    ).bind(slug).first<{ cnt: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM content_drafts WHERE client_slug = ?`,
    ).bind(slug).first<{ cnt: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM citation_keywords WHERE client_slug = ? AND active = 1`,
    ).bind(slug).first<{ cnt: number }>(),
  ]);

  const canDraft = canUseDraftingFeature(user);
  const voiceDone = (voiceRow?.cnt || 0) > 0;
  const draftDone = (draftRow?.cnt || 0) > 0;

  const steps: ChecklistStep[] = [
    {
      key: "snippet",
      label: "Install the tracking snippet",
      desc: "Add the one-line script to your site so we can monitor your AI visibility.",
      href: "/install",
      cta: "Install guide",
      done: (snippetRow?.detected || 0) > 0,
    },
    {
      key: "audit",
      label: "Review your first audit",
      desc: "See how your site shows up in ChatGPT, Perplexity, and Google AI today.",
      href: `/summary/${slug}`,
      cta: "Open summary",
      done: (scanRow?.cnt || 0) > 0,
    },
    {
      key: "competitors",
      label: "Pick three competitors",
      desc: "We'll benchmark your visibility against the ones that matter to you.",
      href: `/competitors/${slug}`,
      cta: "Add competitors",
      done: (compRow?.cnt || 0) >= 3,
    },
    {
      key: "discover_prompts",
      label: "Track your first AI prompts",
      desc: "Generate suggested prompts based on your business, then one-click track the ones worth monitoring weekly across ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, and Gemma.",
      href: `/discover/${slug}`,
      cta: (keywordRow?.cnt || 0) > 0 ? "Add more prompts" : "Generate prompts",
      done: (keywordRow?.cnt || 0) >= 5,
    },
  ];

  // Amplify-only final steps: voice profile + WordPress hookup. Shown
  // as locked rows for non-Amplify plans so they see what's available
  // on upgrade, but never contribute to completion if they can't
  // reach it.
  if (canDraft) {
    steps.push({
      key: "voice_draft",
      label: "Upload voice samples and generate a draft",
      desc: "Teach us how you write, then generate content in your own voice.",
      href: `/voice/${slug}`,
      cta: voiceDone ? "Generate draft" : "Upload samples",
      done: voiceDone && draftDone,
    });
    // Publishing step: customer connects a CMS (WordPress, Webflow, or
    // Shopify) so approved drafts auto-publish on schedule. Table may
    // not have a row yet, so a null result = not done.
    const cmsRow = await env.DB.prepare(
      "SELECT last_test_status FROM cms_connections WHERE client_slug = ?",
    ).bind(slug).first<{ last_test_status: string | null }>();
    steps.push({
      key: "publishing",
      label: "Connect your CMS",
      desc: "One-time setup so approved drafts publish to your site on their scheduled date. WordPress, Webflow, or Shopify.",
      href: `/publishing/${slug}`,
      cta: "Connect CMS",
      done: cmsRow?.last_test_status === "ok",
    });
  } else {
    steps.push({
      key: "voice_draft",
      label: "Generate content in your voice (Amplify)",
      desc: "Upgrade to Amplify to teach us your voice and draft content automatically.",
      href: "/settings",
      cta: "See plans",
      done: false,
      locked: true,
    });
  }

  return steps;
}

/**
 * Agency admin checklist. All queries are scoped to the user's agency.
 */
export async function getAgencyChecklist(user: User, env: Env): Promise<ChecklistStep[]> {
  const agencyId = user.agency_id;
  if (!agencyId) return [];

  const [clientRow, agencyRow, inviteRow] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS cnt
         FROM domains
         WHERE agency_id = ? AND is_competitor = 0 AND active = 1`,
    ).bind(agencyId).first<{ cnt: number }>(),
    env.DB.prepare(
      `SELECT logo_url, primary_color, status, stripe_subscription_id FROM agencies WHERE id = ?`,
    ).bind(agencyId).first<{ logo_url: string | null; primary_color: string | null; status: string | null; stripe_subscription_id: string | null }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM agency_invites WHERE agency_id = ? AND role = 'agency_admin'`,
    ).bind(agencyId).first<{ cnt: number }>(),
  ]);

  const hasLogo = !!(agencyRow?.logo_url && agencyRow.logo_url.trim() !== "");
  const hasCustomColor = !!(agencyRow?.primary_color
    && agencyRow.primary_color !== "#c9a84c"
    && agencyRow.primary_color !== "");
  const hasBilling = agencyRow?.status === "active" && !!agencyRow?.stripe_subscription_id;

  return [
    {
      key: "add_client",
      label: "Add your first client",
      desc: "Onboard a client so you can start monitoring their AI visibility.",
      href: "/agency/clients/new",
      cta: "Add client",
      done: (clientRow?.cnt || 0) >= 1,
    },
    {
      key: "billing",
      label: "Activate your subscription",
      desc: "Switch on billing so scans run automatically and clients get their reports.",
      href: "/agency/billing",
      cta: "Activate billing",
      done: hasBilling,
    },
    {
      key: "branding",
      label: "Configure your branding",
      desc: "Upload your logo and set your primary color so clients see your brand.",
      href: "/agency/settings",
      cta: "Set up branding",
      done: hasLogo || hasCustomColor,
    },
    {
      key: "invite",
      label: "Invite a teammate",
      desc: "Give another person at your agency access to the dashboard.",
      href: "/agency/invites",
      cta: "Send invite",
      done: (inviteRow?.cnt || 0) >= 1,
    },
  ];
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** True when we should show the card: at least one step incomplete AND
 *  the user hasn't dismissed it. */
export function shouldShowChecklist(user: User, steps: ChecklistStep[]): boolean {
  if (steps.length === 0) return false;
  if (user.checklist_dismissed_at) return false;
  const actionable = steps.filter(s => !s.locked);
  if (actionable.length === 0) return false;
  return actionable.some(s => !s.done);
}

export function renderChecklistCard(steps: ChecklistStep[]): string {
  const actionable = steps.filter(s => !s.locked);
  const doneCount = actionable.filter(s => s.done).length;
  const total = actionable.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const items = steps.map(step => {
    const stateClass = step.locked ? "locked" : step.done ? "done" : "pending";
    const icon = step.done ? "&#10003;" : step.locked ? "&#9679;" : "";
    const action = step.done
      ? `<span class="gs-step-cta-done">Done</span>`
      : step.locked
        ? `<a href="${step.href}" class="gs-step-cta gs-step-cta-locked">${step.cta}</a>`
        : `<a href="${step.href}" class="gs-step-cta">${step.cta} &rarr;</a>`;
    return `
      <li class="gs-step gs-step-${stateClass}">
        <span class="gs-step-icon" aria-hidden="true">${icon}</span>
        <div class="gs-step-body">
          <div class="gs-step-label">${step.label}</div>
          <div class="gs-step-desc">${step.desc}</div>
        </div>
        <div class="gs-step-action">${action}</div>
      </li>`;
  }).join("");

  return `
    <section class="gs-card" aria-labelledby="gs-heading">
      <div class="gs-head">
        <div>
          <div class="gs-eyebrow">Getting started</div>
          <h2 id="gs-heading" class="gs-title">${doneCount === total ? "You're set." : "Your first wins"}</h2>
        </div>
        <div class="gs-progress">
          <div class="gs-progress-label">${doneCount} of ${total} done</div>
          <div class="gs-progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="gs-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
      <ol class="gs-steps">
        ${items}
      </ol>
      <form method="POST" action="/onboarding/checklist/dismiss" class="gs-dismiss">
        <button type="submit" class="gs-dismiss-btn">Hide this checklist</button>
      </form>
    </section>`;
}
