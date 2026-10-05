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
import { engineKeyForLabel, READOUT_ENGINE_LABEL } from "./readout-engine-labels";
import { cohortRank } from "./cohort-rank";
import { isReadoutShapeSnapshot } from "./snapshot-shape";
import { computeNoiseBand, fetchDailyRates } from "./noise-floor";

const DAY = 86400;

export interface MemoInputs {
  customer: { client_slug: string; name: string; category_label: string | null; primary_contact_first_name: string | null };
  /** The frozen engagement plan (expectation ladder) set at kickoff, if any.
   *  When present, the memo opens with a "Where we are in the plan" grading. */
  plan_markdown?: string | null;
  window: { current_start: string; current_end: string; prior_start: string };
  /** How the measurement actually ran this period, counted from the rows.
   *
   *  The memo had no measured description of its own instrument, so it took
   *  one from the frozen engagement plan. On 2026-09-25 Prince's first paid
   *  memo told the customer the month was "three full passes spread across
   *  the month" -- the plan's words, written when measurement was three
   *  laptop reps. It had actually run on 25 separate days. The plan exists to
   *  grade expectations, not to state what happened. */
  /** ABSENT when it could not be counted. Never zero: zero days is not a
   *  cadence, it is the absence of one. */
  cadence?: { measurement_days: number; readings_per_question_per_engine: number };
  overall: {
    current: { runs: number; cited: number; share_pct: number };
    prior: { runs: number; cited: number; share_pct: number };
    share_delta_pp: number;
    /** True when there is NO prior period to compare against.
     *
     *  On the snapshot path a missing prior used to fall back to the CURRENT
     *  share, so share_delta_pp computed to zero and the month read as "held
     *  flat" when nothing had been compared. An absence rendered as a value,
     *  the same shape as "named nobody" and "went to zero". Month two is the
     *  first memo with a comparison in it and the first that can get this
     *  wrong in front of a customer. */
    prior_missing?: boolean;
  };
  by_engine: Array<{
    engine: string;
    current_share_pct: number;
    prior_share_pct: number;
    delta_pp: number;
    current_runs: number;
    /** How many cohort businesses this engine named this period, customer
     *  excluded. Above zero is positive proof the engine DOES name businesses
     *  in this category, which is what makes "named nobody" refutable rather
     *  than something the writer has to guess at. */
    cohort_citations?: number;
    /** "citation" = the surface retrieves and cites pages. "model_knowledge" =
     *  it answers from what the model already knows and fetches nothing, so no
     *  crawl-side change can reach it. Without this the memo cannot tell the
     *  two apart and will prescribe robots.txt for an engine that never made
     *  a request. */
    layer?: "citation" | "model_knowledge" | "unknown";
    // True when the engine returned citations but named NO venue in the
    // category at all -- not the customer, not a single competitor. A 0%
    // here is an engine-level absence, not a visibility failure, and the
    // memo must never diagnose it as something the customer can fix.
    // Absent on the run-based path and on snapshots written before
    // 2026-08-03, which behave exactly as they did before this existed.
    no_cohort_signal?: boolean;
    /** WHAT current_share_pct MEASURES. Added 2026-10-05 after a delivered
     *  memo told a paying client that Google AI Overviews "named 157 businesses
     *  in the category and did not name" the client. AI Overviews named the client in
     *  28 to 41% of its answers. current_share_pct on a citation-layer
     *  snapshot row is the share of CITED LINKS that point to the client's own
     *  website, which says nothing about whether the engine names the client.
     *  "own_site_link_share" = that. "answers_naming_customer" = share of the
     *  engine's answers that name the client (model-knowledge rows).
     *  "answers_with_site_in_sources" = run-based fallback rows for a search
     *  tool or the control, whose flag means the client's domain was among the
     *  listed sources, not that the answer named them (relabelled 2026-10-05;
     *  these rows used to say answers_naming_customer). Absent on legacy
     *  inputs. */
    measure?: "own_site_link_share" | "answers_naming_customer" | "answers_with_site_in_sources";
    /** Citation layer only: total links this engine cited, the denominator of
     *  an own_site_link_share. NOT runs. The same memo wrote "across 3226
     *  runs" for 3,226 links from an engine that ran 312 times. */
    cited_links?: number;
    /** Share of this engine's answers whose LISTED SOURCES included the
     *  client's site, from the same rows the comparison layer reads
     *  (client_cited). On a search tool that flag is set when the client's
     *  domain is in the source list, so this is not naming and not traffic:
     *  corrected 2026-10-05, it was described here as "does this engine put
     *  the client in its answers". Naming is named_runs / named_pct. */
    answers_citing_customer_pct?: number;
    /** Search tools only (not the control): answers this period whose TEXT
     *  named the client, read with namedInAnswer. Same definitions as the
     *  by_question fields. Absent when no usable business name is on file. */
    named_runs?: number;
    named_judged_runs?: number;
    named_unknown_runs?: number;
    named_pct?: number | null;
  }>;
  /** Group totals by question category, computed rather than counted by the
   *  author. A claim about "the N questions in group X" must come from here. */
  by_category: Array<{
    category: string; questions: number; runs: number; cited: number; share_pct: number;
    questions_never_cited: number; runs_on_never_cited: number;
    /** Same measure and basis as by_question (search tools only, the client's
     *  site among the listed sources). questions_never_cited is therefore
     *  "no page from the site was listed", NOT "never named". */
    measure?: typeof QUESTION_MEASURE;
    basis?: string;
    /** Questions in the group on which no search-tool answer we could read in
     *  full named the client. Absent when naming could not be judged. */
    questions_never_named?: number;
  }>;
  /** Questions measured in BOTH windows, and the count. A month-over-month
   *  number computed across a changed question set is not a measurement of
   *  movement, it is a measurement of the change in the set. */
  like_for_like?: {
    questions: number;
    current_share_pct: number;
    prior_share_pct: number;
    share_delta_pp: number;
    questions_added_since_prior: number;
    /** Spelled out because the author cannot see how these were computed and
     *  has twice combined a figure from here with one computed on a different
     *  denominator. */
    basis: string;
  };
  /** Month-over-month movement, from the shared comparison primitive on the
   *  STABLE CORE: the questions measured on every day of both months. Decided
   *  2026-10-01 for the first paid comparison. When present it is the ONLY
   *  source of a month-over-month claim and like_for_like is withheld, so the
   *  writer cannot mix the two bases. Statements are pre-rendered by
   *  describeMovement() and event wording is public-safe (kind and scope, no
   *  internal notes), because this object reaches the client. */
  comparison?: {
    basis: string;
    questions: number;
    questions_excluded: number;
    per_surface: Array<{
      engine: string;
      layer: string;
      stated: boolean;
      statement: string;
      prior_pct?: number;
      current_pct?: number;
      delta_pp?: number;
    }>;
    pooled: { citation: string; model_knowledge: string };
    instrument_changes: string[];
    considered_and_set_aside: string[];
  };
  /** The denominator behind any venue-share or cohort-share percentage.
   *  Present ONLY on the snapshot path, and deliberately NOT the same base as
   *  like_for_like: venue share is citations among venues across EVERY question
   *  in the window, while like_for_like is cited runs over total runs on the
   *  subset measured in both windows. They cannot appear in one sentence. */
  venue_share_basis?: string;
  /** How far this client's own reported figure moves day to day with nobody
   *  doing anything. A movement smaller than band_pp may not be called a
   *  movement. Null means the band could not be computed, which BLOCKS movement
   *  claims rather than permitting them. */
  noise_floor?: {
    band_pp: number;
    sd_pp: number;
    days: number;
    observed_range_pp: number;
    basis: string;
  } | null;
  by_question: Array<{
    keyword: string;
    category: string;
    current_pct: number;
    prior_pct: number | null;
    delta_pp: number | null;
    /** True when the question was not measured in the prior window at all.
     *  Its prior_pct is null, NOT zero: it did not rise from nothing, it was
     *  not asked. Reporting the second as the first is how a September memo
     *  came to lead with an eleven-point gain on a client who was down four. */
    first_reading?: boolean;
    /** True when the question was not asked in the CURRENT window. Its 0% is
     *  an absence of MEASUREMENT, not an absence of citations, and the two are
     *  opposite findings. The mirror of first_reading, and it was missing
     *  until a draft told a client that twelve of their strongest questions
     *  had collapsed to zero when all twelve had simply been switched off. */
    not_asked_this_period?: boolean;
    /** Search-tool checks on this question this period (the denominator of
     *  current_pct). Bing control and model-knowledge runs are NOT counted. */
    current_runs: number;
    /** WHAT current_pct / prior_pct MEASURE. Added 2026-10-05. These used to be
     *  cited runs over ALL runs from all seven surfaces, the Bing control and
     *  the two model-knowledge tools included, whose flag means "named", not
     *  "listed a page". A delivered memo called one such figure "% of
     *  citations": 80 of 157 = 51% on a question where the four search tools
     *  listed the client's site in 79 of 81 checks, and another question's
     *  21.8% was mostly one model-knowledge tool's flags.
     *  "site_in_sources" = share of the four search tools' checks on this
     *  question where the client's own website was among the sources the tool
     *  listed. It is not traffic and not whether the answer named the client. */
    measure?: typeof QUESTION_MEASURE;
    basis?: string;
    /** Numerator of current_pct: checks where the site was among the sources. */
    site_in_sources_runs?: number;
    /** Did the search tools' ANSWER TEXT name the client on this question, this
     *  period, read with namedInAnswer (truncation-aware, cap of the day the
     *  row was written, diacritics folded). A headline once called the client
     *  "invisible" and "not named" on nine questions where the search tools
     *  named the client in the answer on five of them while never listing a
     *  page from the site. Not being in the sources and not being named are
     *  different findings. All four fields are absent when no usable business
     *  name was on file, which is not the same as zero. */
    named_runs?: number;
    /** Answers we hold in full, or found the name in: named_pct's denominator. */
    named_judged_runs?: number;
    /** Answers we hold only part of and did not find the name in. Excluded
     *  from named_pct, so named_pct is NOT a bound (see presenceStats). */
    named_unknown_runs?: number;
    /** named_runs / named_judged_runs. Null when nothing could be judged. */
    named_pct?: number | null;
  }>;
  cohort: {
    rank: number | null;
    members: Array<{ domain: string; label: string | null; mentions: number; share_pct: number }>;
    customer_mentions: number;
  };
  offsite: {
    source_types: Array<{ type: string; share_pct: number }>;
    hosts: Array<{ host: string; share_pct: number }>;
    /** These are shares of EVERY listed source, the client's own site and
     *  competitor sites included, so they are not "off-site citations" even
     *  though the hosts list itself is third-party only. A delivered memo
     *  called them off-site. */
    basis?: string;
  };
  /** Own-site links listed by the citation-layer search tools this period,
   *  the Bing control excluded. Above zero is direct evidence the site is
   *  reachable by those tools, so the memo may not suggest a robots.txt or
   *  crawler-access check. A delivered memo did exactly that while the same
   *  data showed hundreds of pulls. Absent when it could not be counted. */
  own_site_pulls?: number;
  own_site_pulls_basis?: string;
  /** Ready-made destinations for the punch list.
   *
   *  WHY (2026-09-17). The punch-list standard says "a clickable link beats a
   *  described place to look", and the generator produced ZERO links in
   *  September's memo. It had `offsite.hosts` -- bare hostnames like
   *  "tripadvisor.com" -- and a hostname is not a URL, so it wrote prose:
   *  "check what TripAdvisor, Expedia, Booking.com and Google Maps say", and
   *  left the customer to go find all four.
   *
   *  Asking the prompt more firmly would not fix it. The model does not know
   *  this hotel's TripAdvisor URL, and a model guessing listing URLs gets some
   *  wrong -- a punch list with a dead link is worse than one with none.
   *
   *  So the URLs are built here, from measured data, and the prompt is told it
   *  may use ONLY these. `find_listing` is a site-scoped search rather than a
   *  guessed deep link: it lands on the right page without anyone needing to
   *  know its address. */
  destinations: {
    own_site: string | null;
    listings: Array<{ host: string; share_pct: number; open: string; find_listing: string }>;
    tools: Array<{ name: string; url: string; checks: string }>;
  };
  prior_memo: { month_key: string; title: string | null; body_markdown: string } | null;
  is_first_memo: boolean;
}

function pct(cited: number, runs: number): number {
  return runs > 0 ? +(100 * cited / runs).toFixed(1) : 0;
}
import { engineLayer, isControlEngine, LAYER1_ENGINE_KEYS } from "./engine-layer";
import { namedInAnswer, capForRun } from "./answer-presence";

/** The per-question measure. See `measure` on by_question. */
export const QUESTION_MEASURE = "site_in_sources" as const;

export const QUESTION_BASIS =
  "the four search tools only (Perplexity, ChatGPT search, Gemini grounded, Google AI Overviews); " +
  "not the Bing control and not the two tools that answer from training. current_pct is the share of " +
  "their checks on this question where the client's own website was among the sources the tool listed. " +
  "It is not traffic, not visits, and not whether the answer named the client (named_runs is that).";

export const OFFSITE_BASIS =
  "share of every page the search tools listed as a source (the Bing control excluded), " +
  "including the client's own site and competitor sites";

/** True for the engines whose runs feed by_question, by_category,
 *  like_for_like and the run-based overall: citation layer, not the control.
 *  A model-knowledge client_cited flag means "named"; on a search tool it
 *  means the client's domain was among the listed sources. Pooling the two is
 *  pooling different quantities, and the control is never pooled at all. */
export function inQuestionBasis(engine: string): boolean {
  return engineLayer(engine) === "citation" && !isControlEngine(engine);
}

/** Raw engine keys in the basis, for SQL. Fixed constants, never input. */
const BASIS_ENGINE_KEYS = [...LAYER1_ENGINE_KEYS].filter(inQuestionBasis);

export interface QuestionRun {
  engine: string;
  client_cited: number;
  run_at: number;
  keyword: string;
  category: string;
  kid: number;
  /** Present only for current-window basis runs (see the runs query). */
  response_text?: string | null;
}

/** Per-question, per-category and like-for-like facts, all on ONE basis:
 *  citation-layer search tools, control excluded. Pure, so the basis can be
 *  tested without a database. */
export function buildQuestionFacts(
  rows: QuestionRun[],
  opts: { curStart: number; businessName: string | null },
): {
  by_question: MemoInputs["by_question"];
  by_category: MemoInputs["by_category"];
  like_for_like: MemoInputs["like_for_like"];
  totals: { curRuns: number; curCited: number; priRuns: number; priCited: number };
  questionsSeen: number;
  /** Per raw engine key, basis engines only. Empty when names cannot be judged. */
  namedByEngine: Map<string, { named_runs: number; named_judged_runs: number; named_unknown_runs: number; named_pct: number | null }>;
} {
  // A name shorter than four characters is never evidence (namedInAnswer
  // would return false for every complete answer), so it must not produce a
  // confident "named on 0 of N".
  const name = opts.businessName?.trim() ?? "";
  const canJudgeNames = name.length >= 4;
  type Acc = {
    keyword: string; category: string;
    cr: number; cc: number; pr: number; pc: number;
    named: number; judged: number; unknown: number;
  };
  const q = new Map<number, Acc>();
  const totals = { curRuns: 0, curCited: 0, priRuns: 0, priCited: 0 };
  const perEngine = new Map<string, { named: number; judged: number; unknown: number }>();
  for (const r of rows) {
    // Every question asked of any surface is listed, so a question that ran
    // only on excluded surfaces reads as not asked of the search tools.
    let a = q.get(r.kid);
    if (!a) {
      a = { keyword: r.keyword, category: r.category, cr: 0, cc: 0, pr: 0, pc: 0, named: 0, judged: 0, unknown: 0 };
      q.set(r.kid, a);
    }
    if (!inQuestionBasis(r.engine)) continue;
    if (r.run_at >= opts.curStart) {
      a.cr++; totals.curRuns++;
      if (r.client_cited) { a.cc++; totals.curCited++; }
      if (canJudgeNames) {
        // An answer the query did not return reads as null, not as "not named".
        const v = namedInAnswer({ text: r.response_text, businessName: name, cap: capForRun(r.run_at) });
        const pe = perEngine.get(r.engine) ?? { named: 0, judged: 0, unknown: 0 };
        perEngine.set(r.engine, pe);
        if (v === null) { a.unknown++; pe.unknown++; }
        else { a.judged++; pe.judged++; if (v) { a.named++; pe.named++; } }
      }
    } else {
      a.pr++; totals.priRuns++;
      if (r.client_cited) { a.pc++; totals.priCited++; }
    }
  }

  const by_question: MemoInputs["by_question"] = Array.from(q.values()).map((v) => ({
    keyword: v.keyword,
    category: v.category,
    measure: QUESTION_MEASURE,
    basis: QUESTION_BASIS,
    current_pct: pct(v.cc, v.cr),
    // No runs in the prior window means the question was not asked, so there
    // is nothing to compare against and null says so. Computing pct(0, 0) as
    // 0 and subtracting produced "rose from 0% to 60%" for six questions that
    // had simply been added that month.
    prior_pct: v.pr > 0 ? pct(v.pc, v.pr) : null,
    delta_pp: v.pr > 0 ? +(pct(v.cc, v.cr) - pct(v.pc, v.pr)).toFixed(1) : null,
    ...(v.pr > 0 ? {} : { first_reading: true }),
    // The MIRROR of first_reading, and it was missing.
    //
    // No runs in the CURRENT window means the question was not asked this
    // period, so its 0% is an absence of measurement, not an absence of
    // citations. Without this the two are indistinguishable and a question
    // that was switched off reads as a collapse.
    //
    // 2026-09-24: twelve questions "returned zero citations this month" after
    // citing heavily the month before. All twelve were inactive. Not one had
    // lost anything; they had stopped being asked when the set was reverted.
    // The draft made "verify whether this is a real loss" its first
    // punch-list item, about a loss that never happened.
    ...(v.cr > 0 ? {} : { not_asked_this_period: true }),
    current_runs: v.cr,
    site_in_sources_runs: v.cc,
    ...(canJudgeNames && v.cr > 0
      ? {
          named_runs: v.named,
          named_judged_runs: v.judged,
          named_unknown_runs: v.unknown,
          named_pct: v.judged > 0 ? pct(v.named, v.judged) : null,
        }
      : {}),
  })).sort((a, b) => a.current_pct - b.current_pct); // weakest first

  // Per-category group facts, so the author never has to count.
  //
  // WHY THIS EXISTS. A September draft said "the gap is largest on the ten
  // region-wide questions, where the client was cited zero times across 781
  // runs". All three numbers were invented. There were TWELVE such questions,
  // they ran 923 times, and the client was cited SIX times. The group is not a
  // judgement call either: it is exactly citation_keywords.category.
  //
  // The author had no group totals in its payload, so it counted a rendered
  // list and guessed a denominator. findUnverifiedNumbers flagged 781, but
  // "ten" and "zero" both sit inside the 0-12 safe band and passed silently.
  // Numbers that are handed over do not have to be invented. The zero split is
  // carried too, because "ten of the twelve were never cited, across 764 runs"
  // is the sentence the memo actually wants.
  const catAgg = new Map<string, { questions: number; runs: number; cited: number; zeroQs: number; zeroRuns: number; neverNamed: number }>();
  for (const v of q.values()) {
    const key = v.category || "uncategorised";
    const e = catAgg.get(key) ?? { questions: 0, runs: 0, cited: 0, zeroQs: 0, zeroRuns: 0, neverNamed: 0 };
    e.questions += 1; e.runs += v.cr; e.cited += v.cc;
    if (v.cc === 0) { e.zeroQs += 1; e.zeroRuns += v.cr; }
    // Never named means: asked, and every answer we could read in full lacked
    // the name, with nothing indeterminate. An unknown is not a no.
    if (v.cr > 0 && v.named === 0 && v.unknown === 0 && v.judged > 0) e.neverNamed += 1;
    catAgg.set(key, e);
  }
  const by_category: MemoInputs["by_category"] = [...catAgg.entries()]
    .map(([category, e]) => ({
      category,
      measure: QUESTION_MEASURE,
      basis: QUESTION_BASIS,
      questions: e.questions,
      runs: e.runs,
      cited: e.cited,
      share_pct: pct(e.cited, e.runs),
      /** Questions in this category whose site was never among the sources. */
      questions_never_cited: e.zeroQs,
      /** Runs those never-cited questions drew. NOT the category's run total. */
      runs_on_never_cited: e.zeroRuns,
      ...(canJudgeNames ? { questions_never_named: e.neverNamed } : {}),
    }))
    .sort((a, b) => a.share_pct - b.share_pct); // weakest first, same as by_question

  // The like-for-like aggregate: the same discipline the methodology already
  // applies to an engine changing its model version. A set change is not
  // forbidden, it is recorded and disclosed, and any comparison spanning it is
  // computed on what both windows actually share.
  const bothWindows = Array.from(q.values()).filter((v) => v.pr > 0 && v.cr > 0);
  const lflCurRuns = bothWindows.reduce((n, v) => n + v.cr, 0);
  const lflCurCited = bothWindows.reduce((n, v) => n + v.cc, 0);
  const lflPriRuns = bothWindows.reduce((n, v) => n + v.pr, 0);
  const lflPriCited = bothWindows.reduce((n, v) => n + v.pc, 0);
  const like_for_like = (lflCurRuns > 0 && lflPriRuns > 0)
    ? {
        questions: bothWindows.length,
        current_share_pct: pct(lflCurCited, lflCurRuns),
        prior_share_pct: pct(lflPriCited, lflPriRuns),
        share_delta_pp: +(pct(lflCurCited, lflCurRuns) - pct(lflPriCited, lflPriRuns)).toFixed(1),
        questions_added_since_prior: Array.from(q.values()).filter((v) => v.pr === 0 && v.cr > 0).length,
        basis:
          "the questions measured in BOTH windows, four search tools only (Bing control and the two " +
          "training-answer tools excluded); share is checks where the client's site was among the listed " +
          "sources over all checks on those questions",
      }
    : undefined;

  const namedByEngine = new Map(
    [...perEngine.entries()].map(([engine, v]) => [engine, {
      named_runs: v.named,
      named_judged_runs: v.judged,
      named_unknown_runs: v.unknown,
      named_pct: v.judged > 0 ? pct(v.named, v.judged) : null,
    }] as const),
  );
  return { by_question, by_category, like_for_like, totals, questionsSeen: q.size, namedByEngine };
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


/** An engagement plan frozen BEFORE a claim was retired still contains that
 *  claim, and the memo author is forbidden to write it.
 *
 *  HTC's plan was set 2026-07-03 and names Microsoft Copilot four times,
 *  including as the strategic centrepiece: "the fast lane is Copilot and
 *  ChatGPT search, the two Bing-fed tools". That channel was reclassified
 *  2026-08-22 and there is no Copilot data. The author prompt says NEVER
 *  mention Copilot, the same prompt says grade this month against the plan,
 *  and the plan says Copilot. Asked to obey both, the model wrote the retired
 *  name and the taxonomy gate refused the save, twice, leaving the client with
 *  no September memo at all.
 *
 *  So the fix is deterministic rather than a stronger instruction: the author
 *  is handed a plan whose bytes do not contain the forbidden term. It cannot
 *  echo what it cannot see.
 *
 *  THE STORED PLAN IS NOT TOUCHED. customers.plan_markdown is a frozen record
 *  the customer reads at /c/<slug>/plan and grades us against, and it carries
 *  a dated amendment explaining the reclassification. Quietly rewriting it
 *  would be the thing that amendment exists to refuse. This substitution
 *  applies ONLY to the authoring payload, and it is marked in-line so the
 *  author can see a correction happened rather than believing the plan always
 *  read this way. */
function sanitizePlanForAuthoring(plan: string | null): string | null {
  if (!plan) return plan;
  let out = plan;
  // Order matters: the longer, more specific forms first.
  out = out.replace(/\bMicrosoft Copilot\b/gi, "the Bing organic control [this plan said Microsoft Copilot, reclassified 2026-08-22]");
  out = out.replace(/\bCopilot\b/gi, "the Bing organic control [reclassified 2026-08-22]");
  out = out.replace(/\bsix of the seven AI tools\b/gi, "most of the six AI tools");
  out = out.replace(/\b(?:seven|7)\s+AI\s+(?:tools?|engines?)\b/gi, "six AI tools plus a Bing organic control, seven measured surfaces");
  return out;
}

export async function gatherMemoInputs(env: Env, slug: string, now: Date): Promise<MemoInputs> {
  const nowTs = Math.floor(now.getTime() / 1000);

  // THE REPORTING PERIOD IS THE CALENDAR MONTH, and it is the same period the
  // charts use.
  //
  // This used to be a trailing 30 days while buildReportFacts used the calendar
  // month, and the prose said "this month" for both. In September 2026 the two
  // happened to coincide, because prince-waikiki started measuring on the 1st,
  // so every figure reconciled and nothing looked wrong. They diverge properly
  // in October: a memo generated on the 24th would compute its prose over
  // Sep 24 to Oct 24 while its charts covered October, and call both "this
  // month". Month two is the first memo with a comparison in it and the first
  // where a reader can hold two numbers side by side.
  //
  // The prior period is the previous calendar month, which is also what the
  // prose means by "last month".
  const startOfMonthUTC = (d: Date, monthsBack = 0): number =>
    Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsBack, 1) / 1000);

  // MEASUREMENT_START IS A FLOOR, not a filter applied later. Runs from before
  // the engagement are not this customer's measurement and must never enter a
  // figure. September's memo window reached back to Aug 26 and picked up six
  // pre-engagement runs from Aug 30; small enough to change nothing, and
  // exactly the kind of thing that is not small in another month.
  const mStart = (await env.DB.prepare(
    `SELECT measurement_start FROM measurement_registry WHERE client_slug = ?`,
  ).bind(slug).first<{ measurement_start: number | null }>().catch((e) => {
    // Not fatal, but never silent: without the floor, pre-engagement runs can
    // enter every figure below.
    console.log(`[memo-inputs] ${slug}: measurement_start lookup failed, window has NO engagement floor: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }))?.measurement_start ?? null;

  const monthStart = startOfMonthUTC(now);
  const prevMonthStart = startOfMonthUTC(now, 1);
  const curStart = mStart !== null ? Math.max(monthStart, mStart) : monthStart;
  // A prior period that opens before the engagement is not a prior period.
  // Leaving it null makes every question a first_reading, which is what the
  // baseline month is, rather than inventing a comparison.
  const priorStart = mStart !== null && prevMonthStart < mStart ? curStart : prevMonthStart;

  const customer = await env.DB.prepare(
    `SELECT client_slug, name, category_label, plan_markdown, primary_contact_name FROM customers WHERE client_slug = ?`
  ).bind(slug).first<{ client_slug: string; name: string; category_label: string | null; plan_markdown: string | null; primary_contact_name: string | null }>();

  // THE PERIOD HAS AN END. This query used to have only a floor. The
  // full-month draft runs on the 2nd with its clock set to the last second of
  // the month before, so without an upper bound every run from the 1st and 2nd
  // of the NEW month was counted as the old month's. The cadence query and the
  // comparison already stopped at the clock; this one did not.
  const periodEnd = nowTs + 1; // exclusive; the clock is the period's last second

  // Who the answers are read for. Same source as the readout snapshot
  // (injection_configs.business_name, then customers.name).
  const injName = (await env.DB.prepare(
    `SELECT business_name FROM injection_configs WHERE client_slug = ?`,
  ).bind(slug).first<{ business_name: string | null }>().catch(() => null))?.business_name ?? null;
  const businessName = injName || customer?.name || null;

  // Runs in both windows, tagged by which window they fall in.
  //
  // response_text comes back ONLY for current-window runs on the basis search
  // tools; every other row returns NULL for it. COST, measured 2026-10-05 on
  // the larger client's September: about 2,900 such answers and 8 MB of text,
  // read once per draft (twice a month). Selecting it for every row would have
  // been about 11 MB for one month and roughly double across both windows.
  // Scoring it in TypeScript keeps ONE implementation of the naming rule
  // (namedInAnswer) for the memo instead of a looser SQL copy.
  const basisIn = BASIS_ENGINE_KEYS.map((k) => `'${k}'`).join(", ");
  const runs = await env.DB.prepare(
    `SELECT cr.engine, cr.client_cited, cr.cited_entities, cr.run_at, ck.keyword, ck.category, ck.id as kid,
            CASE WHEN cr.run_at >= ? AND cr.engine IN (${basisIn}) THEN cr.response_text END AS response_text
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?`
  ).bind(curStart, slug, priorStart, periodEnd).all<{
    engine: string; client_cited: number; cited_entities: string;
    run_at: number; keyword: string; category: string; kid: number;
    response_text: string | null;
  }>();

  // ── Per-engine, split by window (per-question facts are built below) ──
  const eng = new Map<string, { cr: number; cc: number; pr: number; pc: number }>();
  // cohort mention counts (current window only), per competitor host
  const cohortMentions = new Map<string, number>();
  // Per-engine cohort mentions. Without this the memo can see that an engine
  // returned 0% for the customer but has NO WAY to separate "named competitors,
  // not you" from "named nobody at all" -- opposite findings with opposite
  // remedies. In 2026-09 the generator guessed, and told a paying customer an
  // engine had named no business in the category when it had named 405 and
  // simply never named them.
  const engCohort = new Map<string, number>();

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
    const e = eng.get(r.engine) ?? { cr: 0, cc: 0, pr: 0, pc: 0 };
    if (isCurrent) { e.cr++; if (r.client_cited) e.cc++; } else { e.pr++; if (r.client_cited) e.pc++; }
    eng.set(r.engine, e);

    // Cohort mentions: current window, dedup per run.
    if (isCurrent && r.cited_entities && r.cited_entities !== "[]") {
      let parsed: Array<{ name?: string; url?: string }> = [];
      try { parsed = JSON.parse(r.cited_entities) ?? []; } catch { parsed = []; }
      const seen = new Set<string>();
      for (const ent of parsed) {
        const key = hostFromEntity(ent);
        if (!key || !cohortHosts.has(key) || seen.has(key)) continue;
        seen.add(key);
        // The pooled count is on the same basis as the customer's own count
        // it is ranked against (search tools, no control). Per-engine counts
        // keep every engine, because each is reported on its own row.
        if (inQuestionBasis(r.engine)) cohortMentions.set(key, (cohortMentions.get(key) ?? 0) + 1);
        engCohort.set(r.engine, (engCohort.get(r.engine) ?? 0) + 1);
      }
    }
  }

  // by_question, by_category and like_for_like on ONE basis. See QUESTION_BASIS.
  const qf = buildQuestionFacts(runs.results, { curStart, businessName });
  const { curRuns, curCited, priRuns, priCited } = qf.totals;

  // Legacy run-based per-engine coverage. Used ONLY as a fallback for customers
  // that have no canonical citation_snapshots row yet. For snapshot customers it
  // is overridden below by the canonical share-of-citations so the memo, the
  // dashboard, Atlas, and the readout all report the same metric.
  let by_engine: MemoInputs["by_engine"] = Array.from(eng.entries()).map(([engine, e]) => {
    const cohort = engCohort.get(engine) ?? 0;
    // Assert absence ONLY when there is a cohort to be absent from. With an
    // empty competitor roster every engine reads as naming nobody, which is
    // the same false claim pointing the other way.
    const dark = cohortHosts.size > 0 && cohort === 0 && e.cr > 0;
    return {
      engine,
      current_share_pct: pct(e.cc, e.cr),
      prior_share_pct: pct(e.pc, e.pr),
      delta_pp: +(pct(e.cc, e.cr) - pct(e.pc, e.pr)).toFixed(1),
      current_runs: e.cr,
      cohort_citations: cohort,
      layer: engineLayer(engine),
      // Run-based rows are flagged runs over runs. On a model-knowledge
      // engine the flag means the answer NAMED the client; on a search tool
      // (and the control) it means the client's domain was among the listed
      // sources, which is not naming. Labelled so the writer cannot read one
      // as the other, or either as a snapshot row's own-site link share.
      measure: engineLayer(engine) === "citation"
        ? ("answers_with_site_in_sources" as const)
        : ("answers_naming_customer" as const),
      ...(qf.namedByEngine.get(engine) ?? {}),
      ...(dark ? { no_cohort_signal: true } : {}),
    };
  }).sort((a, b) => b.current_share_pct - a.current_share_pct);

  // Counted from the rows, never described from the plan. See `cadence`.
  const cadenceRow = await env.DB.prepare(
    `SELECT COUNT(DISTINCT date(cr.run_at,'unixepoch')) AS days, COUNT(*) AS runs
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?`,
  ).bind(slug, curStart, periodEnd).first<{ days: number; runs: number }>().catch(() => null);
  // ABSENT, NOT ZERO. A failed lookup used to produce measurement_days: 0,
  // and the prompt REQUIRES the memo to describe its instrument from this
  // field, so a transient query error would have written "measured across 0
  // days" into a customer's deliverable. Zero days is not a cadence; it is the
  // absence of one, and the two must not share a representation. Found in the
  // guard sweep on 2026-09-26, in code written the day before, which is the
  // fourth instance of this shape in three days.
  const questionsAsked = qf.questionsSeen || 1;
  const cadence = cadenceRow && Number(cadenceRow.days) > 0
    ? {
        measurement_days: Number(cadenceRow.days),
        readings_per_question_per_engine:
          // absent-is-zero: unreachable. The branch above requires days > 0, and days and runs come from the same COUNT over the same rows, so runs cannot be absent when days is positive.
          Math.round((Number(cadenceRow.runs ?? 0) / (questionsAsked * 7)) * 10) / 10,
      }
    : undefined;

  const { by_question, by_category, like_for_like } = qf;

  // ── Cohort rank (legacy run-based; overridden by snapshot below) ──
  const legacyVenueTotal = Array.from(cohortMentions.values()).reduce((a, n) => a + n, 0) + curCited;
  const cohortMembersLegacy = Array.from(cohortHosts.entries())
    .map(([key, label]) => {
      const mentions = cohortMentions.get(key) ?? 0;
      return { domain: key, label, mentions, share_pct: legacyVenueTotal > 0 ? +(100 * mentions / legacyVenueTotal).toFixed(1) : 0 };
    })
    .sort((a, b) => b.mentions - a.mentions);
  // Shared helper. This line carried the same indexOf tie bug the snapshot
  // path below was fixed for: a tie promoted the customer to the top of the
  // tied group. Fixing one of the two left the other free to disagree.
  const rankLegacy = cohortRank(curCited, cohortMembersLegacy.map((m) => m.mentions));

  // Run-based fallback only (overridden on the snapshot path). Same basis as
  // by_question: search tools, control excluded. It used to pool all seven
  // surfaces, which sums a "named" flag with a "site in sources" flag.
  let overall = {
    current: { runs: curRuns, cited: curCited, share_pct: pct(curCited, curRuns) },
    prior: { runs: priRuns, cited: priCited, share_pct: pct(priCited, priRuns) },
    share_delta_pp: +(pct(curCited, curRuns) - pct(priCited, priRuns)).toFixed(1),
    ...(priRuns === 0 ? { prior_missing: true } : {}),
  };
  let cohort = { rank: rankLegacy, members: cohortMembersLegacy, customer_mentions: curCited };
  // How far this client's own number moves on its own. Computed over 21 days
  // rather than the report month: a band derived from the same weeks it polices
  // shrinks whenever the month was quiet, which is exactly when a small fake
  // movement is most tempting to write.
  // Ends at the memo's clock and never reaches back past measurement_start.
  const noiseBand = computeNoiseBand(await fetchDailyRates(env, slug, 21, { endTs: periodEnd, floorTs: mStart }));

  /** Set only on the snapshot path, where a venue-share percentage exists. */
  let venue_share_basis: string | undefined;
  let offsite: MemoInputs["offsite"] = { source_types: [], hosts: [] };
  // Run-based until the snapshot overrides it: checks where the site was among
  // a search tool's sources. The snapshot path replaces it with LINKS.
  let own_site_pulls: number | undefined = curRuns > 0 ? curCited : undefined;
  let own_site_pulls_basis: string | undefined = curRuns > 0
    ? "search-tool checks this period whose listed sources included the client's own site (Bing control excluded)"
    : undefined;
  const ownDomain = domains.results.find((d) => d.is_competitor === 0)?.domain ?? null;

  // ── Canonical override: source headline + per-engine from the snapshot ──
  // citation_snapshots is the authoritative share-of-citations rollup the
  // readout, dashboard, and Atlas all read. Sourcing the memo's numbers from
  // the same place is what keeps every surface on one metric (the divergence
  // this replaces came from computing a run-coverage rate here instead).
  // by_question stays run-based: per-question appearance has no snapshot form,
  // and it is on its own declared basis (QUESTION_BASIS), not the venue share.
  // CURRENT AND PRIOR ARE MONTH-SCOPED, not "the two newest rows".
  //
  // Every writer keys a snapshot by the Monday it RAN while buildReadoutSnapshot
  // aggregates MONTH TO DATE, so a month accumulates one row per Monday. Taking
  // the two newest rows therefore returns two readings of the SAME month, one a
  // week less complete than the other -- and the memo prompt presents the second
  // as last month ("lead with what changed since last month").
  //
  // September survives on the baseline guard below, because prince-waikiki's
  // only older row predates their engagement. October is the first draft where
  // this bites: on the 24th it would compare October-through-21 against
  // October-through-14 and call the difference month-over-month movement.
  //
  // Same defect as buildReportFacts had, fixed the same way: ask for the row
  // that belongs to the window instead of filtering after the fact.
  const mStartTs = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const mEndTs = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000);
  const snapCols = "engines_breakdown, top_competitors, measured_at, week_start";
  const curRow = await env.DB.prepare(
    `SELECT ${snapCols} FROM citation_snapshots
      WHERE client_slug = ? AND week_start < ? ORDER BY week_start DESC LIMIT 1`
  ).bind(slug, mEndTs).first<{ engines_breakdown: string; top_competitors: string; measured_at: number | null; week_start: number }>();
  // Strictly older than the current row AND before this month began.
  //
  // The month bound alone is not enough. When this month has no snapshot yet,
  // the current row is itself an earlier month's, and a prior query bounded
  // only by the month start returns THAT SAME ROW -- so current and prior would
  // be identical and the memo would report a confident zero movement. Caught by
  // running both queries against live data before shipping.
  const priorBound = Math.min(mStartTs, curRow?.week_start ?? mStartTs);
  const priRow = curRow
    ? await env.DB.prepare(
        `SELECT ${snapCols} FROM citation_snapshots
          WHERE client_slug = ? AND week_start < ? ORDER BY week_start DESC LIMIT 1`
      ).bind(slug, priorBound).first<{ engines_breakdown: string; top_competitors: string; measured_at: number | null; week_start: number }>()
    : null;
  // Positional, NOT filtered. Compacting the array would slide a prior row into
  // the current slot whenever this month has no snapshot yet, and the memo
  // would present last month's numbers as this month's. parseSnap already
  // returns null for a missing row.
  type SnapRow = { engines_breakdown: string; top_competitors: string; measured_at: number | null; week_start: number };
  const snaps = { results: [curRow ?? undefined, priRow ?? undefined] as Array<SnapRow | undefined> };

  const parseSnap = (row?: { engines_breakdown: string; top_competitors: string }) => {
    if (!row) return null;
    // Every field read below is readout-shape only (`total`, `share_pct`,
    // `competitors`, `source_types`). A legacy-shape row parses without
    // throwing and yields `undefined` for all of them, which then reaches the
    // monthly memo as prose. Refuse the row instead: the memo falls back to
    // its run-based inputs rather than describing the customer's month from
    // undefined. Guard added 2026-09-06.
    if (!isReadoutShapeSnapshot(row.engines_breakdown, row.top_competitors)) return null;
    let eb: Record<string, { citations: number; total: number; share_pct: number; cohort_citations?: number }> = {};
    let tc: { htc_venue_share_pct?: number; competitors?: Array<{ label?: string; domain?: string; citations?: number }>; source_types?: Record<string, { citations?: number; share_pct?: number }>; offsite_hosts?: Array<{ host?: string; citations?: number; share_pct?: number }> } = {};
    try { eb = JSON.parse(row.engines_breakdown) ?? {}; } catch { /* keep empty */ }
    try { tc = JSON.parse(row.top_competitors) ?? {}; } catch { /* keep empty */ }
    return { eb, tc };
  };
  const curSnap = parseSnap(snaps.results[0]);
  // A snapshot measured BEFORE the engagement began is not a prior month.
  //
  // prince-waikiki's oldest row is a free diagnostic run on 2026-06-26,
  // months before they signed. Without this guard it became "last month":
  // their FIRST memo reported a prior share and positive movement off a window
  // containing ZERO runs, plus per-engine deltas no measurement produced. The client's own frozen plan says of month
  // one: "There is no movement to report because there is no prior reading."
  //
  // report-facts.ts:205 has had this guard since the movement section was
  // built. This path never got it -- the same concept enforced on one route
  // and absent on its neighbour. Found 2026-09-07, 18 days before the first
  // paid memo would have shipped with invented deltas in it.
  let priSnap = parseSnap(snaps.results[1]);
  if (priSnap) {
    const mStart = (await env.DB.prepare(
      `SELECT measurement_start FROM measurement_registry WHERE client_slug = ?`
    ).bind(slug).first<{ measurement_start: number | null }>())?.measurement_start ?? null;
    const priMeasured = snaps.results[1]?.measured_at ?? null;
    // No measured_at cannot prove it post-dates the engagement, so it is not
    // trusted as a prior. Fail closed: a missing comparison is recoverable, a
    // fabricated one lands in a delivered document.
    if (mStart !== null && (typeof priMeasured !== "number" || priMeasured < mStart)) {
      const seen = typeof priMeasured === "number" ? new Date(priMeasured * 1000).toISOString().slice(0, 10) : "unknown";
      console.log(`[memo-inputs] ${slug}: prior snapshot measured ${seen} predates measurement_start; treating as BASELINE (no deltas)`);
      priSnap = null;
    }
  }

  if (curSnap) {
    // Citation-grade engines ONLY. Competitor counts in top_competitors are
    // venue CITATIONS (cited URLs), so the customer's total has to be the same
    // unit. Summing every engine added the model-knowledge surfaces, whose
    // "citations" are RESPONSES THAT NAMED THE BRAND -- a different quantity.
    // The inflated total happened to tie a leading competitor's count and,
    // through the indexOf below, reported the customer as the category leader
    // when they were not.
    // Bridge-written snapshots carry no `layer` key and are URL-based
    // throughout, so they are unaffected.
    //
    // THE CONTROL IS NOT IN THIS TOTAL EITHER. The Bing control's row carries
    // layer "citation", so it passed the filter above, and a delivered memo
    // reported 4,241 venue citations where the snapshot's own venue total was
    // 4,240: the extra one was a Bing organic link to the client's site.
    // buildReadoutSnapshot already excludes the control from every pooled
    // figure (sumNonControl); this copy did not.
    const ownedCitations = Object.entries(curSnap.eb)
      .filter(([engine, e]) => (e as { layer?: string }).layer !== "model_knowledge" && !isControlEngine(engine))
      // absent-is-zero: summing. An engine entry with no citations count contributes nothing to a total, which is what zero means in a sum.
      .reduce((a, [, e]) => a + (e.citations ?? 0), 0);
    own_site_pulls = ownedCitations;
    own_site_pulls_basis =
      "links to the client's own site among the sources the four search tools listed this period (Bing control excluded)";
    const comps = (curSnap.tc.competitors ?? [])
      // absent-is-zero: summing, as above. mentions feeds a total and a sort, never a stated per-competitor figure.
      .map((c) => ({ domain: c.domain ?? "", label: c.label ?? null, mentions: c.citations ?? 0 }))
      .sort((a, b) => b.mentions - a.mentions);
    // ABSENT IS NOT ZERO, and this one reaches a delivered memo.
    //
    // isReadoutShapeSnapshot returns true on engines_breakdown ALONE, so a
    // snapshot can pass the shape guard while top_competitors carries no
    // venue rollup. `?? 0` then set the memo's headline share to 0% and told
    // a paying customer they hold none of their category. The same line
    // existed on the dashboard and was fixed hours earlier; this is the copy
    // that feeds the document.
    const venueShareRaw = curSnap.tc.htc_venue_share_pct;
    const haveVenueShare = typeof venueShareRaw === "number" && Number.isFinite(venueShareRaw);
    const venueShare = haveVenueShare ? (venueShareRaw as number) : 0;
    const venueTotal = ownedCitations + comps.reduce((a, c) => a + c.mentions, 0);

    // Run-based counts per engine key, kept so each snapshot row can carry its
    // REAL run count and its answer-level rate. See `measure` on by_engine.
    const runBased = new Map(by_engine.map((b) => [b.engine, b]));
    by_engine = Object.entries(curSnap.eb).map(([engine, e]) => {
      const ps = priSnap && priSnap.eb[engine] ? (priSnap.eb[engine].share_pct ?? 0) : null;
      const key = engineKeyForLabel(engine);
      const rb = key ? runBased.get(key) : undefined;
      // Only assert absence when the bridge actually measured it. An older
      // snapshot without cohort_citations stays silent rather than guessing.
      const cc = e.cohort_citations;
      // absent-is-zero: fail-safe. An absent total makes this false, so no_cohort_signal is NOT set. Absence withholds the claim rather than asserting it.
      const dark = typeof cc === "number" && cc === 0 && (e.total ?? 0) > 0;
      return {
        engine,
        // absent-is-zero: RESIDUAL RISK, accepted. buildReadoutSnapshot writes share_pct for every engine it emits, so absence means a snapshot this Worker did not write. The bridge was exactly that, and it is now refused. If a foreign writer returns, this reports 0% for a real engine.
        current_share_pct: e.share_pct ?? 0,
        prior_share_pct: ps ?? (e.share_pct ?? 0),
        delta_pp: ps === null ? 0 : +((e.share_pct ?? 0) - ps).toFixed(1),
        // REAL runs, from the rows. This used to be e.total, which on a
        // citation-layer row is cited LINKS, so the memo reported 3,226 links
        // as "3226 runs". Model-knowledge rows: total IS runs (answers).
        // absent-is-zero: same residual risk as share_pct above, and only reached when the run-based row is missing. total is written unconditionally by buildReadoutSnapshot.
        current_runs: rb ? rb.current_runs : (e.total ?? 0),
        ...(typeof cc === "number" ? { cohort_citations: cc } : {}),
        layer: (() => {
          const l = (e as unknown as { layer?: string }).layer;
          return l === "citation" || l === "model_knowledge" ? l : engineLayer(engine);
        })(),
        ...(dark ? { no_cohort_signal: true } : {}),
        ...(() => {
          const l = (e as unknown as { layer?: string }).layer;
          const layer = l === "citation" || l === "model_knowledge" ? l : engineLayer(engine);
          return layer === "citation"
            ? {
                measure: "own_site_link_share" as const,
                // Absent stays absent: a link count we did not record is not zero links.
                ...(typeof e.total === "number" ? { cited_links: e.total } : {}),
                ...(rb ? { answers_citing_customer_pct: rb.current_share_pct } : {}),
                ...((key && qf.namedByEngine.get(key)) || {}),
              }
            : { measure: "answers_naming_customer" as const };
        })(),
      };
    }).sort((a, b) => b.current_share_pct - a.current_share_pct);

    // Venue share is computed across EVERY question in the window. It cannot be
    // restricted to the like-for-like subset from a snapshot, because
    // keyword_breakdown stores only {questions_with_owned, total_questions} and
    // carries no per-question competitor attribution. Narrowing it would mean
    // changing what buildReadoutSnapshot writes, which changes a paying
    // customer's delivered numbers, so the basis is DECLARED instead of
    // silently assumed. See the rule in memo-generator.ts that forbids pairing
    // this percentage with a like_for_like question count.
    venue_share_basis =
      "every question measured in this window, not the like-for-like subset; " +
      "share is this venue's citations as a proportion of all citations that went to venues";
    const priVenue = priSnap ? (priSnap.tc.htc_venue_share_pct ?? null) : null;
    // With no venue rollup there is no share to state, so the snapshot does
    // NOT override the run-based overall computed above. A real number from a
    // narrower basis beats a zero from the right one.
    if (haveVenueShare) {
      overall = {
        current: { runs: venueTotal, cited: ownedCitations, share_pct: venueShare },
        prior: { runs: 0, cited: 0, share_pct: priVenue ?? venueShare },
        ...(priVenue === null ? { prior_missing: true } : {}),
        share_delta_pp: priVenue === null ? 0 : +(venueShare - priVenue).toFixed(1),
      };
    } else {
      console.log(`[memo-inputs] ${slug}: snapshot carries no venue share; keeping the run-based overall rather than reporting 0%.`);
    }

    // Count who is strictly ahead. indexOf() on a sorted array returns the
    // FIRST match, so any tie silently promoted the customer to the top of the
    // tied group off a coincidental equal count.
    cohort = {
      rank: cohortRank(ownedCitations, comps.map((c) => c.mentions)),
      members: comps.map((c) => ({ ...c, share_pct: venueTotal > 0 ? +(100 * c.mentions / venueTotal).toFixed(1) : 0 })),
      customer_mentions: ownedCitations,
    };

    // Off-site sources: where AI pulls its category answers from, and the top
    // third-party hosts to target (written into the snapshot by the dryrun->D1 bridge).
    const st = curSnap.tc.source_types ?? {};
    offsite = {
      source_types: Object.entries(st)
        // absent-is-zero: same residual risk. source_types entries are written with share_pct by the same writer.
        .map(([type, v]) => ({ type, share_pct: v.share_pct ?? 0 }))
        .filter((s) => s.share_pct > 0)
        .sort((a, b) => b.share_pct - a.share_pct),
      hosts: (curSnap.tc.offsite_hosts ?? [])
        // absent-is-zero: same residual risk. offsite_hosts entries are written with share_pct by the same writer.
        .map((h) => ({ host: h.host ?? "", share_pct: h.share_pct ?? 0 }))
        .filter((h) => h.host),
      basis: OFFSITE_BASIS,
    };
  }

  // ── Prior memo (most recent delivered) ──
  const priorMemo = await env.DB.prepare(
    `SELECT month_key, title, body_markdown FROM monthly_memos
      WHERE client_slug = ? AND delivered_at IS NOT NULL
      ORDER BY delivered_at DESC LIMIT 1`
  ).bind(slug).first<{ month_key: string; title: string | null; body_markdown: string }>();

  // Punch-list destinations. See the `destinations` comment on MemoInputs.
  const ownHost = ownDomain ? normHost(ownDomain) : null;
  const destinations: MemoInputs["destinations"] = {
    own_site: ownHost ? `https://${ownHost}` : null,
    listings: offsite.hosts.slice(0, 6).map((h) => ({
      host: h.host,
      share_pct: h.share_pct,
      open: `https://${h.host}`,
      // Site-scoped search: lands on their actual listing without us guessing
      // a deep link that may not exist or may have changed.
      find_listing: `https://www.google.com/search?q=${encodeURIComponent(`site:${h.host} "${customer?.name ?? ""}"`)}`,
    })),
    tools: [
      { name: "Google Rich Results Test", url: "https://search.google.com/test/rich-results",
        checks: "whether a page's structured data is readable, and which types are present" },
      { name: "Schema Markup Validator", url: "https://validator.schema.org/",
        checks: "structured data errors on a specific URL" },
      // Offered only when nothing shows the site is reachable. When the search
      // tools listed the client's site at all this period, a robots.txt check
      // is a task the data has already answered, and a delivered memo put one
      // in the punch list anyway.
      ...(ownHost && !(typeof own_site_pulls === "number" && own_site_pulls > 0)
        ? [{ name: "Your robots.txt", url: `https://${ownHost}/robots.txt`,
            checks: "whether the file blocks AI crawlers from the site" }]
        : []),
      // Describes what the page holds, not what any AI system reads from it:
      // nothing here measures that.
      ...(ownHost ? [{ name: "Google Business Profile", url: "https://business.google.com/",
        checks: "the description and amenity fields on the business's Google listing" }] : []),
    ],
  };

  // ── Month-over-month comparison (stable core) ───────────────────────────
  let comparison: MemoInputs["comparison"];
  if (priorStart < curStart) {
    try {
      const { loadStableCoreCounts, loadInstrumentEvents } = await import("./compare-loader");
      const { computeComparison, describeMovement, publicReason, publicEventLine } = await import("./compare-periods");
      const prev = { start: priorStart, end: curStart };
      const cur = { start: curStart, end: periodEnd };
      const counts = await loadStableCoreCounts(env, slug, prev, cur);
      if (counts.keywordIds.length > 0) {
        const events = await loadInstrumentEvents(env, prev, cur, slug);
        const c = computeComparison({
          basis: "stable_core",
          sharedKeywords: counts.keywordIds.length,
          perSurface: counts.perSurface,
          prevWindow: prev,
          curWindow: cur,
          events,
        });
        const label = (k: string) => READOUT_ENGINE_LABEL[k] ?? k;
        comparison = {
          basis: `the ${counts.keywordIds.length} questions measured on every day of both months`,
          questions: counts.keywordIds.length,
          questions_excluded: counts.excludedKeywordIds.length,
          per_surface: c.perSurface
            .filter((x) => x.layer !== "control")
            .map((x) => ({
              engine: label(x.engine),
              layer: x.layer,
              stated: x.movement.kind === "stated",
              statement: publicReason(describeMovement(x.movement, label(x.engine))),
              ...(x.movement.kind === "stated"
                ? { prior_pct: +x.movement.prevRate.toFixed(1), current_pct: +x.movement.curRate.toFixed(1), delta_pp: +x.movement.deltaPp.toFixed(1) }
                : {}),
            })),
          pooled: {
            citation: publicReason(describeMovement(c.pooled.citation, "Surfaces that search the web and cite sources")),
            model_knowledge: publicReason(describeMovement(c.pooled.model_knowledge, "Surfaces that answer from training")),
          },
          instrument_changes: c.events.map(publicEventLine),
          considered_and_set_aside: c.setAside.map((x) => `${publicEventLine(x.event)}: ${x.why}`),
        };
      }
    } catch (e) {
      // No comparison is honest: the prompt then forbids any movement claim.
      console.log(`[memo-inputs] ${slug}: comparison unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    destinations,
    customer: customer
      ? {
          client_slug: customer.client_slug,
          name: customer.name,
          category_label: customer.category_label,
          // First name only, for the memo greeting. The 2026-09 HTC draft
          // addressed the contact as "Mike" (he is Greg) because the prompt
          // said "address the primary contact if provided" and nothing was
          // ever provided -- the model filled the blank with an invented
          // name. Provide the real one or none, never an invitation to guess.
          primary_contact_first_name: (customer.primary_contact_name || "").trim().split(/\s+/)[0] || null,
        }
      : { client_slug: slug, name: slug, category_label: null, primary_contact_first_name: null },
    plan_markdown: sanitizePlanForAuthoring(customer?.plan_markdown ?? null),
    cadence,
    window: {
      current_start: new Date(curStart * 1000).toISOString().slice(0, 10),
      current_end: new Date(nowTs * 1000).toISOString().slice(0, 10),
      prior_start: new Date(priorStart * 1000).toISOString().slice(0, 10),
    },
    overall,
    by_engine,
    by_question,
    by_category,
    // Superseded by the comparison when there is one: two bases in one memo is
    // how a correct number lands in a false sentence.
    ...(comparison ? { comparison } : like_for_like ? { like_for_like } : {}),
    ...(venue_share_basis ? { venue_share_basis } : {}),
    noise_floor: noiseBand && {
      band_pp: noiseBand.bandPp,
      sd_pp: noiseBand.sdPp,
      days: noiseBand.days,
      observed_range_pp: noiseBand.observedRangePp,
      basis: noiseBand.basis,
    },
    cohort,
    offsite,
    ...(typeof own_site_pulls === "number" ? { own_site_pulls, own_site_pulls_basis } : {}),
    prior_memo: priorMemo ?? null,
    is_first_memo: !priorMemo,
  };
}
