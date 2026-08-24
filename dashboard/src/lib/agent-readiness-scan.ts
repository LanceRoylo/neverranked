/**
 * agent-readiness-scan.ts — cohort scanning for the readiness cross-map.
 *
 * Exhibit A of the Prince Waikiki agreement lists a "readiness cross-map"
 * among the Deliverables. This produces it.
 *
 * Scoring is NOT reimplemented here. It imports the worker-safe port so the
 * MCP tool, the schema-check worker and this share one definition. A second
 * copy of a scoring rule is how a client ends up with two different numbers
 * for the same site.
 *
 * The whole value is in distinguishing three outcomes a naive scan collapses
 * into "0":
 *
 *   verified_zero    scanned cleanly, no Action markup. True zero.
 *   boilerplate_only scanned cleanly, Action markup present but all of it CMS
 *                    default (site-search idiom, untargeted fragments).
 *                    Scores zero because an agent still cannot act, and the
 *                    distinction is recorded so nobody reads it as a
 *                    deployment. This is the case that produced a phantom
 *                    45/D for a named competitor on 2026-08-24.
 *   unverifiable     the site refused the request (403 etc). NOT a zero. We
 *                    do not know. Publishing a zero for a named third party
 *                    we could not scan is how you earn a takedown request.
 *   deployed         real, vertical-relevant Action markup.
 */
import { agentReadinessCheck } from "../../../tools/schema-check/src/scoring-ports";

export type ReadinessState = "deployed" | "off_baseline" | "boilerplate_only" | "verified_zero" | "unverifiable";

export interface ReadinessRow {
  domain: string;
  label: string | null;
  isOwned: boolean;
  url: string;
  score: number | null;
  grade: string | null;
  state: ReadinessState;
  error: string | null;
}

/** A single Action counts as boilerplate when nobody configured it. */
function isBoilerplateAction(a: { type?: string; name?: string | null; target?: string | null }): boolean {
  if (a.type === "SearchAction" && /\{search_term_string\}/.test(String(a.target ?? ""))) return true;
  // No target means no endpoint, so there is nothing for an agent to
    // call. Keyed on target alone because name is normalised to
    // '(unnamed)' upstream and is therefore always truthy -- the earlier
    // 'no name AND no target' test could never fire, which let The Kahala
    // keep an untargeted ReadAction and score 5 instead of 0.
    if (!a.target) return true;
  return false;
}

export async function scanDomainReadiness(url: string, vertical?: string): Promise<Omit<ReadinessRow, "domain" | "label" | "isOwned">> {
  try {
    const r = (await agentReadinessCheck({ url, vertical })) as {
      score?: number; grade?: string;
      actions?: Array<{ type?: string; name?: string | null; target?: string | null }>;
    };
    const actions = r.actions ?? [];
    const substantive = actions.filter((a) => !isBoilerplateAction(a));
    // A score above zero does NOT mean the vertical's actions are deployed.
    // Off-baseline Actions earn a token 10 max, so anything at or under 10
    // has zero vertical coverage: real markup, none of it the kind that lets
    // an agent do the thing this vertical exists to do. Vertical coverage
    // starts at 60 x coverage, so the smallest real coverage scores 30.
    // Calling a 5 "deployed" would tell a client a competitor had shipped
    // booking when they had shipped something else entirely.
    const score = r.score ?? 0;
    let state: ReadinessState;
    if (score > 10) state = "deployed";
    else if (score > 0) state = "off_baseline";
    else if (actions.length > 0 && substantive.length === 0) state = "boilerplate_only";
    else state = "verified_zero";
    return { url, score: r.score ?? 0, grade: r.grade ?? "F", state, error: null };
  } catch (e) {
    // A refusal is not a finding. Never score it.
    return { url, score: null, grade: null, state: "unverifiable", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Scan a client's whole cohort and persist one row per domain. */
export async function scanCohortReadiness(
  env: { DB: D1Database },
  clientSlug: string,
  vertical?: string,
): Promise<ReadinessRow[]> {
  const domains = (
    await env.DB.prepare(
      `SELECT id, domain, competitor_label, is_competitor FROM domains
        WHERE client_slug = ? AND active = 1 ORDER BY is_competitor, domain`,
    ).bind(clientSlug).all()
  ).results as Array<{ id: number; domain: string; competitor_label: string | null; is_competitor: number }>;

  const now = Math.floor(Date.now() / 1000);
  const rows: ReadinessRow[] = [];

  for (const d of domains) {
    const url = `https://${d.domain.replace(/^https?:\/\//, "")}`;
    const scan = await scanDomainReadiness(url, vertical);
    const row: ReadinessRow = {
      domain: d.domain,
      label: d.competitor_label,
      isOwned: !d.is_competitor,
      ...scan,
    };
    rows.push(row);
    await env.DB.prepare(
      `INSERT INTO agent_readiness_scans
         (domain_id, client_slug, url, vertical, score, grade, state, actions_json, error, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(d.id, clientSlug, scan.url, vertical ?? null, scan.score, scan.grade, scan.state, null, scan.error, now).run();
  }
  return rows;
}
