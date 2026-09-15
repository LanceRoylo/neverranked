/**
 * replicate-sample.ts — ask the same question three times in the same minute
 * and find out how often the answer changes.
 *
 * WHY THIS EXISTS. `RUNS_PER_KEYWORD = 1`. The measurement has never taken a
 * replicate, so nothing has ever separated "the engine answered differently
 * today" from "the world changed". noise-floor.ts bounds that from day-to-day
 * spread, which is instrument noise PLUS real change, and can therefore only
 * ever say "at most". This is how it learns to say "is".
 *
 * THE STATISTIC. For one question on one engine, three readings taken
 * back-to-back should agree. Every disagreement is the instrument, because
 * nothing in the world changed in ninety seconds. So the headline number is the
 * share of question-engine pairs where three consecutive readings did not all
 * agree about whether the client was cited. That is a quantity nobody in this
 * category publishes, and it is measurable with a control group of one: itself.
 *
 * WHY A SEPARATE TABLE. Replicates must never reach citation_runs. Three
 * readings of one question would triple that question's weight in every share
 * figure a client is shown, which would corrupt the product metric in order to
 * measure it. `replicate_runs` is written by this path and read by nothing that
 * renders to a customer.
 *
 * COST. Bounded by construction rather than by intention. See MAX_CALLS_PER_RUN.
 * At the default settings this is roughly 108 calls a week against a baseline
 * near 14,650 a month, which is about two percent.
 */

/** Readings per question per engine. Three is the smallest number that can
 *  distinguish "unanimous" from "split", which is the only distinction the
 *  headline statistic needs. */
export const REPLICATES = 3;

/** Questions sampled per client per week. Deliberately small: this exists to
 *  characterise the instrument, not to re-measure the roster. */
export const QUESTIONS_PER_CLIENT = 3;

/** Hard ceiling on calls in a single replicate sweep. If a future change to
 *  client count or engine list would exceed this, the sweep truncates and says
 *  so rather than quietly spending more. A budget that lives in a comment is
 *  not a budget. */
export const MAX_CALLS_PER_RUN = 200;

export interface SampleCandidate {
  keywordId: number;
  clientSlug: string;
}

/**
 * Pure, deterministic, and rotating.
 *
 * Deterministic so a sweep can be re-run without changing which questions were
 * sampled, and rotating so that over enough weeks the whole set is
 * characterised rather than the same three questions forever. `weekIndex` is
 * the rotation input; passing the same one twice selects the same questions.
 *
 * NOT random. Math.random would make the sample unreproducible, and a
 * measurement you cannot reproduce is the thing this company sells against.
 */
export function pickSample(
  candidates: SampleCandidate[],
  weekIndex: number,
  perClient = QUESTIONS_PER_CLIENT,
): SampleCandidate[] {
  const byClient = new Map<string, SampleCandidate[]>();
  for (const c of candidates) {
    const list = byClient.get(c.clientSlug) ?? [];
    list.push(c);
    byClient.set(c.clientSlug, list);
  }

  const out: SampleCandidate[] = [];
  for (const slug of [...byClient.keys()].sort()) {
    const list = byClient.get(slug)!.slice().sort((a, b) => a.keywordId - b.keywordId);
    if (list.length === 0) continue;
    const take = Math.min(perClient, list.length);
    // Walk the list from a week-dependent offset so consecutive weeks cover
    // different questions and the cycle eventually covers all of them.
    const offset = ((weekIndex * take) % list.length + list.length) % list.length;
    for (let i = 0; i < take; i++) out.push(list[(offset + i) % list.length]);
  }
  return out;
}

/** One question, one engine, the readings taken back to back. */
export interface ReplicateGroup {
  keywordId: number;
  engine: string;
  /** Whether the client was cited, one entry per reading. */
  cited: boolean[];
}

export interface AgreementStats {
  /** Groups with a full set of readings. Partial groups are excluded: a group
   *  that lost a reading to an API failure cannot show disagreement and would
   *  bias the rate downward. */
  groups: number;
  /** Groups where the readings did not all agree. */
  split: number;
  /** Share of groups that disagreed with themselves. */
  disagreementRate: number;
  byEngine: Array<{ engine: string; groups: number; split: number; rate: number }>;
}

/**
 * Pure. How often did identical questions, asked moments apart, disagree?
 *
 * Groups without the full `replicates` count are DROPPED, not counted as
 * agreeing. A pair of readings that happen to match is not evidence that a
 * third would have, and counting it as agreement would understate instrument
 * noise, which is the direction that flatters us.
 */
export function agreementStats(groups: ReplicateGroup[], replicates = REPLICATES): AgreementStats {
  const complete = groups.filter((g) => g.cited.length === replicates);
  const isSplit = (g: ReplicateGroup) => new Set(g.cited).size > 1;

  const perEngine = new Map<string, { groups: number; split: number }>();
  for (const g of complete) {
    const e = perEngine.get(g.engine) ?? { groups: 0, split: 0 };
    e.groups += 1;
    if (isSplit(g)) e.split += 1;
    perEngine.set(g.engine, e);
  }

  const split = complete.filter(isSplit).length;
  return {
    groups: complete.length,
    split,
    disagreementRate: complete.length ? +(split / complete.length).toFixed(4) : 0,
    byEngine: [...perEngine.entries()]
      .map(([engine, v]) => ({
        engine,
        groups: v.groups,
        split: v.split,
        rate: v.groups ? +(v.split / v.groups).toFixed(4) : 0,
      }))
      .sort((a, b) => b.rate - a.rate),
  };
}

/**
 * The instrument's own contribution to a reported percentage, in percentage
 * points, for a set of `questions` questions.
 *
 * Each question contributes a Bernoulli flip with probability `p` of landing
 * differently than it might have. The standard deviation of the resulting share
 * is sqrt(p(1-p)/n). Returns null below a minimum group count, because a rate
 * computed from a handful of groups is not worth turning into a band.
 */
export function instrumentSdPp(
  stats: AgreementStats,
  questions: number,
  minGroups = 20,
): number | null {
  if (stats.groups < minGroups || questions <= 0) return null;
  const p = stats.disagreementRate;
  return +(100 * Math.sqrt((p * (1 - p)) / questions)).toFixed(2);
}

/**
 * Read back the replicate readings as groups.
 *
 * This is the READER for replicate_runs. Without it the table is write-only,
 * which is the exact shape of every failure this codebase keeps finding: data
 * collected, nobody looking, and a guard reporting success while measuring
 * nothing. An existing test enforces that every written table has a reader, and
 * it caught this one before it shipped.
 */
export async function readReplicateGroups(
  env: { DB: D1Database },
  days = 60,
): Promise<ReplicateGroup[]> {
  const rows = (await env.DB.prepare(
    `SELECT batch_id AS batchId, keyword_id AS keywordId, engine, client_cited AS cited
       FROM replicate_runs
      WHERE run_at >= strftime('%s','now') - ? * 86400
      ORDER BY batch_id, keyword_id, engine, rep_index`,
  ).bind(days).all<{ batchId: string; keywordId: number; engine: string; cited: number }>()).results ?? [];

  const byGroup = new Map<string, ReplicateGroup>();
  for (const r of rows) {
    const key = `${r.batchId}|${r.keywordId}|${r.engine}`;
    const g = byGroup.get(key) ?? { keywordId: r.keywordId, engine: r.engine, cited: [] };
    g.cited.push(r.cited === 1);
    byGroup.set(key, g);
  }
  return [...byGroup.values()];
}
