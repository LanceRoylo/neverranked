// Monthly memo inputs gatherer.
//
// Pure data, no LLM. Assembles everything the memo draft-generator needs
// to write a delta-aware monthly memo for one customer, grounded entirely
// in measured numbers. The generator is given ONLY these numbers, which
// is the fabrication guard's foundation: it cannot cite a stat that does
// not appear here.
//
// Windowing: "current" = last 30 days, "prior" = the 30 days before that.
// Deltas are current minus prior. Computed from citation_runs directly so
// they do not depend on the sparse weekly snapshot table.

import type { Env } from "../types";

const DAY = 86400;

export interface MemoInputs {
  customer: { client_slug: string; name: string; category_label: string | null };
  /** The frozen engagement plan (expectation ladder) set at kickoff, if any.
   *  When present, the memo opens with a "Where we are in the plan" grading. */
  plan_markdown?: string | null;
  window: { current_start: string; current_end: string; prior_start: string };
  overall: {
    current: { runs: number; cited: number; share_pct: number };
    prior: { runs: number; cited: number; share_pct: number };
    share_delta_pp: number;
  };
  by_engine: Array<{
    engine: string;
    current_share_pct: number;
    prior_share_pct: number;
    delta_pp: number;
    current_runs: number;
  }>;
  by_question: Array<{
    keyword: string;
    category: string;
    current_pct: number;
    prior_pct: number;
    delta_pp: number;
    current_runs: number;
  }>;
  cohort: {
    rank: number | null;
    members: Array<{ domain: string; label: string | null; mentions: number; share_pct: number }>;
    customer_mentions: number;
  };
  offsite: {
    source_types: Array<{ type: string; share_pct: number }>;
    hosts: Array<{ host: string; share_pct: number }>;
  };
  prior_memo: { month_key: string; title: string | null; body_markdown: string } | null;
  is_first_memo: boolean;
}

function pct(cited: number, runs: number): number {
  return runs > 0 ? +(100 * cited / runs).toFixed(1) : 0;
}
function normHost(h: string): string {
  return h.toLowerCase().replace(/^www\./, "").trim();
}
function hostFromEntity(ent: { name?: string; url?: string }): string | null {
  if (ent.url) {
    try { return normHost(new URL(ent.url).hostname); } catch { /* fall through */ }
  }
  if (ent.name && ent.name.includes(".")) return normHost(ent.name);
  return null;
}

export async function gatherMemoInputs(env: Env, slug: string, now: Date): Promise<MemoInputs> {
  const nowTs = Math.floor(now.getTime() / 1000);
  const curStart = nowTs - 30 * DAY;
  const priorStart = nowTs - 60 * DAY;

  const customer = await env.DB.prepare(
    `SELECT client_slug, name, category_label, plan_markdown FROM customers WHERE client_slug = ?`
  ).bind(slug).first<{ client_slug: string; name: string; category_label: string | null; plan_markdown: string | null }>();

  // All runs in the last 60 days, tagged by which window they fall in.
  const runs = await env.DB.prepare(
    `SELECT cr.engine, cr.client_cited, cr.cited_entities, cr.run_at, ck.keyword, ck.category, ck.id as kid
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ? AND cr.run_at >= ?`
  ).bind(slug, priorStart).all<{
    engine: string; client_cited: number; cited_entities: string;
    run_at: number; keyword: string; category: string; kid: number;
  }>();

  // ── Overall + per-engine + per-question, split by window ──
  let curRuns = 0, curCited = 0, priRuns = 0, priCited = 0;
  const eng = new Map<string, { cr: number; cc: number; pr: number; pc: number }>();
  const q = new Map<number, { keyword: string; category: string; cr: number; cc: number; pr: number; pc: number }>();
  // cohort mention counts (current window only), per competitor host
  const cohortMentions = new Map<string, number>();

  // Registered cohort hosts for matching.
  const domains = await env.DB.prepare(
    `SELECT domain, competitor_label, is_competitor FROM domains WHERE client_slug = ? AND active = 1`
  ).bind(slug).all<{ domain: string; competitor_label: string | null; is_competitor: number }>();
  const cohortHosts = new Map<string, string | null>(); // key -> label
  for (const d of domains.results) {
    if (d.is_competitor === 1) cohortHosts.set(normHost(d.domain), d.competitor_label);
  }

  for (const r of runs.results) {
    const isCurrent = r.run_at >= curStart;
    if (isCurrent) { curRuns++; if (r.client_cited) curCited++; }
    else { priRuns++; if (r.client_cited) priCited++; }

    const e = eng.get(r.engine) ?? { cr: 0, cc: 0, pr: 0, pc: 0 };
    if (isCurrent) { e.cr++; if (r.client_cited) e.cc++; } else { e.pr++; if (r.client_cited) e.pc++; }
    eng.set(r.engine, e);

    const qq = q.get(r.kid) ?? { keyword: r.keyword, category: r.category, cr: 0, cc: 0, pr: 0, pc: 0 };
    if (isCurrent) { qq.cr++; if (r.client_cited) qq.cc++; } else { qq.pr++; if (r.client_cited) qq.pc++; }
    q.set(r.kid, qq);

    // Cohort mentions: current window, dedup per run.
    if (isCurrent && r.cited_entities && r.cited_entities !== "[]") {
      let parsed: Array<{ name?: string; url?: string }> = [];
      try { parsed = JSON.parse(r.cited_entities) ?? []; } catch { parsed = []; }
      const seen = new Set<string>();
      for (const ent of parsed) {
        const key = hostFromEntity(ent);
        if (!key || !cohortHosts.has(key) || seen.has(key)) continue;
        seen.add(key);
        cohortMentions.set(key, (cohortMentions.get(key) ?? 0) + 1);
      }
    }
  }

  // Legacy run-based per-engine coverage. Used ONLY as a fallback for customers
  // that have no canonical citation_snapshots row yet. For snapshot customers it
  // is overridden below by the canonical share-of-citations so the memo, the
  // dashboard, Atlas, and the readout all report the same metric.
  let by_engine = Array.from(eng.entries()).map(([engine, e]) => ({
    engine,
    current_share_pct: pct(e.cc, e.cr),
    prior_share_pct: pct(e.pc, e.pr),
    delta_pp: +(pct(e.cc, e.cr) - pct(e.pc, e.pr)).toFixed(1),
    current_runs: e.cr,
  })).sort((a, b) => b.current_share_pct - a.current_share_pct);

  const by_question = Array.from(q.values()).map((v) => ({
    keyword: v.keyword,
    category: v.category,
    current_pct: pct(v.cc, v.cr),
    prior_pct: pct(v.pc, v.pr),
    delta_pp: +(pct(v.cc, v.cr) - pct(v.pc, v.pr)).toFixed(1),
    current_runs: v.cr,
  })).sort((a, b) => a.current_pct - b.current_pct); // weakest first

  // ── Cohort rank (legacy run-based; overridden by snapshot below) ──
  const legacyVenueTotal = Array.from(cohortMentions.values()).reduce((a, n) => a + n, 0) + curCited;
  const cohortMembersLegacy = Array.from(cohortHosts.entries())
    .map(([key, label]) => {
      const mentions = cohortMentions.get(key) ?? 0;
      return { domain: key, label, mentions, share_pct: legacyVenueTotal > 0 ? +(100 * mentions / legacyVenueTotal).toFixed(1) : 0 };
    })
    .sort((a, b) => b.mentions - a.mentions);
  const allCountsLegacy = [...cohortMembersLegacy.map((m) => m.mentions), curCited].sort((a, b) => b - a);
  const rankLegacy = cohortMembersLegacy.length > 0 ? allCountsLegacy.indexOf(curCited) + 1 : null;

  let overall = {
    current: { runs: curRuns, cited: curCited, share_pct: pct(curCited, curRuns) },
    prior: { runs: priRuns, cited: priCited, share_pct: pct(priCited, priRuns) },
    share_delta_pp: +(pct(curCited, curRuns) - pct(priCited, priRuns)).toFixed(1),
  };
  let cohort = { rank: rankLegacy, members: cohortMembersLegacy, customer_mentions: curCited };
  let offsite: MemoInputs["offsite"] = { source_types: [], hosts: [] };

  // ── Canonical override: source headline + per-engine from the snapshot ──
  // citation_snapshots is the authoritative share-of-citations rollup the
  // readout, dashboard, and Atlas all read. Sourcing the memo's numbers from
  // the same place is what keeps every surface on one metric (the divergence
  // this replaces came from computing a run-coverage rate here instead).
  // by_question stays run-based: per-question appearance has no snapshot form.
  const snaps = await env.DB.prepare(
    `SELECT engines_breakdown, top_competitors
       FROM citation_snapshots WHERE client_slug = ?
      ORDER BY week_start DESC LIMIT 2`
  ).bind(slug).all<{ engines_breakdown: string; top_competitors: string }>();

  const parseSnap = (row?: { engines_breakdown: string; top_competitors: string }) => {
    if (!row) return null;
    let eb: Record<string, { citations: number; total: number; share_pct: number }> = {};
    let tc: { htc_venue_share_pct?: number; competitors?: Array<{ label?: string; domain?: string; citations?: number }>; source_types?: Record<string, { citations?: number; share_pct?: number }>; offsite_hosts?: Array<{ host?: string; citations?: number; share_pct?: number }> } = {};
    try { eb = JSON.parse(row.engines_breakdown) ?? {}; } catch { /* keep empty */ }
    try { tc = JSON.parse(row.top_competitors) ?? {}; } catch { /* keep empty */ }
    return { eb, tc };
  };
  const curSnap = parseSnap(snaps.results[0]);
  const priSnap = parseSnap(snaps.results[1]);

  if (curSnap) {
    const ownedCitations = Object.values(curSnap.eb).reduce((a, e) => a + (e.citations ?? 0), 0);
    const comps = (curSnap.tc.competitors ?? [])
      .map((c) => ({ domain: c.domain ?? "", label: c.label ?? null, mentions: c.citations ?? 0 }))
      .sort((a, b) => b.mentions - a.mentions);
    const venueShare = curSnap.tc.htc_venue_share_pct ?? 0;
    const venueTotal = ownedCitations + comps.reduce((a, c) => a + c.mentions, 0);

    by_engine = Object.entries(curSnap.eb).map(([engine, e]) => {
      const ps = priSnap && priSnap.eb[engine] ? (priSnap.eb[engine].share_pct ?? 0) : null;
      return {
        engine,
        current_share_pct: e.share_pct ?? 0,
        prior_share_pct: ps ?? (e.share_pct ?? 0),
        delta_pp: ps === null ? 0 : +((e.share_pct ?? 0) - ps).toFixed(1),
        current_runs: e.total ?? 0,
      };
    }).sort((a, b) => b.current_share_pct - a.current_share_pct);

    const priVenue = priSnap ? (priSnap.tc.htc_venue_share_pct ?? null) : null;
    overall = {
      current: { runs: venueTotal, cited: ownedCitations, share_pct: venueShare },
      prior: { runs: 0, cited: 0, share_pct: priVenue ?? venueShare },
      share_delta_pp: priVenue === null ? 0 : +(venueShare - priVenue).toFixed(1),
    };

    const allCounts = [...comps.map((c) => c.mentions), ownedCitations].sort((a, b) => b - a);
    cohort = {
      rank: comps.length ? allCounts.indexOf(ownedCitations) + 1 : null,
      members: comps.map((c) => ({ ...c, share_pct: venueTotal > 0 ? +(100 * c.mentions / venueTotal).toFixed(1) : 0 })),
      customer_mentions: ownedCitations,
    };

    // Off-site sources: where AI pulls its category answers from, and the top
    // third-party hosts to target (written into the snapshot by the dryrun->D1 bridge).
    const st = curSnap.tc.source_types ?? {};
    offsite = {
      source_types: Object.entries(st)
        .map(([type, v]) => ({ type, share_pct: v.share_pct ?? 0 }))
        .filter((s) => s.share_pct > 0)
        .sort((a, b) => b.share_pct - a.share_pct),
      hosts: (curSnap.tc.offsite_hosts ?? [])
        .map((h) => ({ host: h.host ?? "", share_pct: h.share_pct ?? 0 }))
        .filter((h) => h.host),
    };
  }

  // ── Prior memo (most recent delivered) ──
  const priorMemo = await env.DB.prepare(
    `SELECT month_key, title, body_markdown FROM monthly_memos
      WHERE client_slug = ? AND delivered_at IS NOT NULL
      ORDER BY delivered_at DESC LIMIT 1`
  ).bind(slug).first<{ month_key: string; title: string | null; body_markdown: string }>();

  return {
    customer: customer
      ? { client_slug: customer.client_slug, name: customer.name, category_label: customer.category_label }
      : { client_slug: slug, name: slug, category_label: null },
    plan_markdown: customer?.plan_markdown ?? null,
    window: {
      current_start: new Date(curStart * 1000).toISOString().slice(0, 10),
      current_end: new Date(nowTs * 1000).toISOString().slice(0, 10),
      prior_start: new Date(priorStart * 1000).toISOString().slice(0, 10),
    },
    overall,
    by_engine,
    by_question,
    cohort,
    offsite,
    prior_memo: priorMemo ?? null,
    is_first_memo: !priorMemo,
  };
}
