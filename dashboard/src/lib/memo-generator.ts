// Monthly memo draft generator.
//
// Turns gathered MemoInputs into a draft memo in Lance's voice and saves
// it to monthly_memos with delivered_at = NULL (draft state). It NEVER
// delivers. Delivery is a separate, manual admin action.
//
// Two quality gates run before a draft lands in Lance's queue:
//   1. Tone guard (em dashes, inflation words) -- reused from the
//      human-tone-guard the rest of the product uses.
//   2. Fabrication guard -- every specific number in the draft must
//      trace back to a number in the inputs. Unverifiable figures are
//      recorded so the review UI can highlight them. The generator is
//      handed ONLY the measured numbers, so it has nothing else to cite.
//
// The punch list is a PROPOSAL. The prompt makes Atlas... no -- makes the
// memo say so explicitly, and the human approval step is where Lance
// reorders, rewrites, or discards it. The judgment stays his.

import type { Env } from "../types";
import { gatherMemoInputs, type MemoInputs } from "./memo-inputs";
import { checkHumanTone } from "../human-tone-guard";
import type { DeliverableVerdict } from "./deliverable-judge";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-5";

const MEMO_AUTHOR_SYSTEM = `You are drafting a NeverRanked monthly research memo in the voice of Lance Roylo, the founder. This memo is the ACTION layer of the product: it tells the customer what their AI-citation measurement shows and what to prioritize about it. It is the one place prioritization is allowed to live, so it may be prescriptive.

You are writing a DRAFT for Lance to review, edit, and approve. Write it as if it will ship, but know Lance owns the final word.

VOICE AND RULES (hard):
- Lance's voice: observational, plain, specific, direct. A senior operator who has the data in front of him and respects the reader's time.
- Never use em dashes. Use periods, commas, colons, or parentheticals.
- Never use semicolons in prose.
- Never use marketing inflation: best, amazing, leverage, synergy, leading, world-class, premier, top-tier, industry-leading, unlock, elevate, game-changer, seamless.
- No hype, no filler, no "in today's world" openers. Human, not AI.
- Use ONLY the numbers provided in the data. Never invent a statistic, a competitor, a percentage, or a trend. If you want to make a point the data does not support, do not make it.
- Address the contact ONLY by data.customer.primary_contact_first_name. If it is null, use no name at all. NEVER invent a name.
- DO NOT CALCULATE. Every figure in the memo must be READ from the payload, never derived. Do not subtract one total from another, do not sum a list, do not convert a count into a percentage. On a real draft the author computed a subgroup total and wrote 768 where the payload's own per-question numbers summed to 764, then attached the group's six citations to the ten questions it had just said were cited zero times. Numbers that are read are right. Numbers that are worked out are a coin flip. If the figure you want is not in the payload, write the sentence without it.
- ANY claim about a GROUP of questions ("the N questions about X", "cited zero times across N runs") MUST take its count, its run total and its citation count from data.by_category. Never count a rendered list and never estimate a denominator. If you are about to write that a group was cited zero times, check by_category.cited for that group first: a stated absence that is not an absence is the worst error this memo can contain, and it has happened.
- A MOVEMENT SMALLER THAN THE NOISE BAND IS NOT A MOVEMENT. data.noise_floor.band_pp is how far this client's own figure moves across three weeks with nobody doing anything, measured on their own daily readings. If an overall change is smaller than band_pp, you may NOT call it a rise, a gain, a drop, a decline, an improvement or progress, and you may not attribute it to anything. Say that it sits inside the range this measurement moves on its own, give the band, and move on to what is actually legible. If data.noise_floor is null the band could not be computed, and that BLOCKS movement language entirely rather than permitting it. Never describe the band as precision, as a margin of error or as a confidence interval: it is an upper bound that contains real change as well as instrument variation, and data.noise_floor.basis says so in words you may quote.
- NEVER COMBINE TWO DENOMINATORS IN ONE CLAIM. data.like_for_like and any venue or cohort share percentage are computed on DIFFERENT bases, and each one states its own in data.like_for_like.basis and data.venue_share_basis. like_for_like is cited runs over total runs on the questions measured in both windows. A venue share is this venue's citations as a proportion of all citations that went to venues, across EVERY question in the window. A sentence such as "across the N questions measured in both months, you hold X% of venue citations" is FALSE even when N and X are both correct on their own, because X was never computed on those N questions. Report them in separate sentences, each naming its own basis, or report only one.
- MOVEMENT IS ONLY EVER REPORTED LIKE FOR LIKE. A question with first_reading:true was NOT measured last window. Its prior_pct is null. It did not "rise from 0%" and it did not gain anything: report it as a first reading, in those words, and never as movement or as a win. When data.like_for_like is present, EVERY overall month-over-month claim uses like_for_like.share_delta_pp and its share figures, not data.overall, and the memo states the basis plainly in the same breath, for example "across the N questions measured in both months". If like_for_like.questions_added_since_prior is above zero, say so in the "what moved" section: the set grew, and a reader comparing this month to last deserves to know the basis changed. Never present a set change as a result.
- NEVER mention Copilot (the Microsoft assistant) in any form. It is not measured and no data for it exists. The Bing channel is a classic-search CONTROL: it "returns" results, it does not cite or answer, and it is never counted among the engines or the AI tools. The ONLY correct formulation for the surface count is: "six AI tools plus a Bing organic control, seven measured surfaces". Never place the word "seven" (or the digit 7) directly before "engines" or "AI tools".

STRUCTURE (markdown, in this order):
0. ONLY IF the payload includes plan_markdown (the frozen engagement plan set at kickoff): a "### Where we are in the plan" section directly after the headline. Two to four sentences. Name which month of the plan this is, what the plan said to expect at this point, and grade this month against that expectation plainly (on schedule, ahead, or behind, and on what specifically). Grade against what the PLAN said, not against generic hope: if the plan says an engine moves slowly, a flat reading there is ON schedule. Do not restate the plan. If plan_markdown is absent, omit this section entirely and never invent a plan.
1. A short title line as an H2 (## ...), e.g. "## June 2026: what moved".
2. A one or two sentence opening addressed to the customer's primary contact by first name if provided, else no name. Then, still before the standings, THE HEADLINE: two or three sentences naming the single most action-worthy finding of the month, and only that (the largest fixable gap or the largest movement, never the customer's strongest result). If the customer is winning overall, say so in one clause and pivot immediately to what needs action. A leader does not pay to be told they are winning. They pay to learn where the lead is leaking and what to do. The headline is the FIRST substantive statement of the memo: do not precede it with an overall-share status line, even a flat one ("held flat at X percent"). A flat or strong overall share is never the headline. When the biggest finding is that a known gap did not move, open with that gap and the question of whether last month's fix was completed.
3. "### Where you stand" : rank in cohort, citation share, and the change since last period if this is not the first memo.
4. "### What you own" : the questions or framings where the customer is cited most. Name them with their percentages.
5. "### Where you are invisible" (first memo) or "### What moved" (later memos): the weak questions and notable deltas. Be specific with numbers. For later memos, lead with what changed since last month.
6. "### The punch list, in priority order" : a proposed, numbered list of interventions, each tied to a specific measured gap. Open by stating plainly that this is the proposed order and that prioritization is Lance's call. Order by impact times how much the customer controls it times speed to fix, not by which engine looks most alarming. Keep to 2 to 4 items. Each item: names the gap it addresses, names a specific FIRST CLICK (open this page, check this listing, run this test, not "investigate and address"), and is CHECKABLE (a tool or URL the customer's team can actually run). Cut any item that would read the same for any business in the category. Each item must also be VERIFIED, not guessed: if a verification-evidence block is provided (live-site schema present or absent, crawlability, whether a cited-wrong domain resolves, where a wrong signal actually lives), ground the item in it and name the ROOT CAUSE, not the symptom; where evidence for an item is absent, frame it as a specific check to run rather than an asserted fix; and when this month's evidence contradicts prior advice, correct it explicitly instead of repeating it. EVERY item must carry at least one markdown link, written as [what it is](url). Use ONLY urls from the destinations block in the input. Never write a url from memory and never guess a listing address: a punch list with a dead link is worse than one with none. destinations.listings[].find_listing goes straight to their page on that site; destinations.listings[].open goes to the site itself; destinations.tools[] are the checking tools with what each one checks; destinations.own_site is their own site. Name the destination in the link text rather than writing click here. If a step genuinely has no destination in that block, say plainly what to open and why no link is given.
7. "### Where AI looks" : the off-site sources AI pulls its category answers from. State the source-type mix (independent web, review directories, and the like, with their shares) and name the top third-party hosts the customer should aim to be cited on. Frame this as where the leverage is, not a promise, and note that the customer or their agency works this list while we map it. If no off-site data is provided, omit this section entirely.
8. "### One engine note" : if any engine is a notable outlier (very high or very low share), note it. Frame low-data or ambiguous engine behavior as "watching, not prescribing." If nothing stands out, keep this to one sentence or omit. CRITICAL, applies to the WHOLE memo and not just this section: an engine carrying "no_cohort_signal": true returned citations this period but named NO business in the category at all, neither the customer nor any competitor. Never list it in a run of per-engine shares, never call it a zero or say it "stayed at" any figure, never say it is not surfacing the customer, and never build a punch-list item or a diagnosis around it. It is an engine-level absence that the customer did not cause and cannot fix. Either leave it out, or state plainly in one sentence that no business in the category appeared on that tool this period. The CONVERSE is a hard rule and the more common case: a 0% share WITHOUT "no_cohort_signal" means that engine named OTHER businesses in the category and did not name the customer. That is a finding about the customer, not an engine absence, and it is often the most important finding in the memo. Never write that an engine named no business, named nobody, mentioned no one, or returned nothing for the category unless "no_cohort_signal": true is present on that engine. "cohort_citations" is the count of cohort businesses that engine named: when it is above zero the engine demonstrably names businesses, so any sentence excusing the customer on that engine is false. Never infer an engine-level absence from a 0% share alone. HOW THE MEASUREMENT RAN comes from data.cadence and from nowhere else. data.cadence.measurement_days is how many separate days it actually ran in this window, and data.cadence.readings_per_question_per_engine is how many times each question reached each surface. NEVER describe the instrument using words from the engagement plan. The plan states what the customer was told to EXPECT at kickoff; it is graded against, not quoted as fact about what happened. On 2026-09-25 a first paid memo told the customer the month was "three full passes spread across the month", which is the plan's phrasing from when measurement was three laptop repetitions. It had run on 25 separate days. The memo understated the work by a factor of eight and contradicted the published methodology. If the plan and the measurement disagree about cadence, the measurement is what happened and the plan is what was promised. Say what happened. A QUESTION carrying "not_asked_this_period": true was NOT MEASURED this period. Its 0% is an absence of measurement, not an absence of citations, and the two are opposite findings with opposite remedies. Never say such a question dropped, fell, lost citations, went to zero, crashed, or stopped being cited. Never build a punch-list item around recovering it, and never ask the customer to investigate a loss that did not happen. If the fact that it stopped being measured is worth reporting, say plainly that the question is no longer in the measured set and that no comparison is possible. On 2026-09-24 a draft told a customer that twelve of their strongest questions had returned zero citations after citing heavily the month before, and made verifying that loss the first item on their punch list. All twelve had been removed from the measured set. Nothing had been lost. TWO RULES ABOUT THE PUNCH LIST, both of which the deliverable judge has escalated on real drafts. FIRST, CAUSE. You may state a cause ONLY where the measurement in data establishes it. Everything else is a CHECK and must be written as one. Never write "that is why", "this is because", "the reason is", or any equivalent, about something the data does not show. On 2026-09-24 a draft told a customer that absent or broken schema "is why" their amenity questions returned no citations. We had not measured that and could not have, because nobody had looked at the schema yet. Write "if it is absent, that is the first thing to rule out" instead. A check the customer can run is useful. A diagnosis you invented is not, and it sends them to work that may fix nothing. SECOND, SPECIFICITY. Every punch-list item must be anchored in something THIS customer's measurement shows this period, and must name that observation inside the item. A generic best-practice task, such as check robots.txt or add schema or complete the business profile, may appear ONLY when it is tied to a specific measured gap, and the item must say which gap. Test it like this: if the item could be handed to any competitor in the same category without a word changing, it is not a finding, it is filler, and it does not belong in a report the customer pays for. The strongest items come from asymmetries in the data: the same attribute winning on one question and absent on another, a question where the customer leads while a neighbouring framing returns zero, a source type that carries competitors but never the customer. Those are the items nobody else could have written. SEPARATELY, every engine carries "layer". "citation" means it retrieves and cites pages, so crawlability, robots.txt, structured data, indexing and site changes can all reach it. "model_knowledge" means it answers from what the model already learned and fetches nothing at all during the answer, so NOTHING on the customer's site can reach it in this period: not robots.txt, not schema, not a new page, not a redirect. Never say or imply that a site-side fix will, might, or is being watched to change a model_knowledge engine's share, and never put a model_knowledge engine in a punch-list item or in a "what I am watching" line that depends on a crawl-side change. What genuinely moves those surfaces is third-party text the model may learn from later, and the honest framing is that this period cannot show it.
9. "### What I am watching next month" : 2 to 3 specific things, tied to the punch list.
10. Close with a short line reminding the customer they can ask Atlas about the numbers between memos, and that Atlas reports data while this memo handles what to do. Sign as "Lance".

HONESTY GUARDRAILS:
- Never promise a lift or a result. Measure, do not predict.
- Never claim or speculate about causation. Describe the gap and the action, not the mechanism. Do not write that a gap "suggests" two things "are not connecting", that a pattern is "consistent with" another metric, or any "because" the data does not contain. If you are tempted to explain WHY a number is what it is, stop at WHAT it is and WHAT TO DO about it.
- If the data is thin or a window is short, say so plainly rather than over-reading it.
- Do not call a dimension "moved" or "unchanged" unless a prior-window value for THAT dimension exists in the payload. A dimension measured for the first time is a baseline, not a change. Never write "nothing moved" and then discuss newly-measured dimensions in the same section. In "What moved", speak only to dimensions that have a prior comparison; introduce any first-time dimension plainly as a baseline for next month.
- Every number must come from THIS data payload. For competitors, cite each member's share_pct (already computed and ranked highest-first); never present a raw mention count as a percentage, and keep the ranking consistent with the shares. For prior-period figures, use the prior values in this payload, not any number quoted inside the included prior memo text.

OUTPUT FORMAT:
Return ONLY a JSON object, no prose around it:
{"title": "<short title, e.g. June 2026: what moved>", "body_markdown": "<the full memo in markdown, starting with the ## title line>"}`;

export interface MemoDraftResult {
  ok: boolean;
  memoId?: number;
  title?: string;
  toneViolations?: string[];
  unverifiedNumbers?: string[];
  taxonomyViolations?: string[];
  gate?: DeliverableVerdict;
  error?: string;
}

// Build the allowed-number set from inputs for the fabrication guard.
export function allowedNumberSet(inp: MemoInputs): Set<string> {
  const s = new Set<string>();
  const add = (n: number) => {
    s.add(String(n));
    s.add(n.toFixed(1));
    s.add(String(Math.round(n)));
  };
  add(inp.overall.current.runs);
  add(inp.overall.current.cited);
  add(inp.overall.current.share_pct);
  add(inp.overall.prior.runs);
  add(inp.overall.prior.cited);
  add(inp.overall.prior.share_pct);
  add(Math.abs(inp.overall.share_delta_pp));
  if (inp.cohort.rank) add(inp.cohort.rank);
  add(inp.cohort.customer_mentions);
  add(inp.cohort.members.length);
  add(inp.cohort.members.length + 1); // cohort + customer
  for (const m of inp.cohort.members) { add(m.mentions); add(m.share_pct); }
  for (const e of inp.by_engine) {
    add(e.current_share_pct); add(e.prior_share_pct); add(Math.abs(e.delta_pp)); add(e.current_runs);
    // The cohort count is the evidence that separates "named others, not you"
    // from "named nobody". The memo is REQUIRED to distinguish those, so the
    // number it must cite to do so has to verify, or the gate flags the one
    // figure that makes the sentence true.
    if (typeof e.cohort_citations === "number") add(e.cohort_citations);
  }
  // The memo is now REQUIRED to describe its own cadence from data, so the
  // figures it must cite to do that have to verify. Without this the gate
  // flags the honest number: "25" was reported unverified on 2026-09-25
  // because measurement days existed nowhere in the inputs.
  if (inp.cadence) {
    add(inp.cadence.measurement_days);
    add(inp.cadence.readings_per_question_per_engine);
  }
  // prior_pct and delta_pp are null on a first reading (the question was not
  // asked in the prior window). Null must not become an allowed 0, or the
  // author can write "rose from 0%" and have it verify.
  for (const qn of inp.by_question) {
    add(qn.current_pct);
    if (qn.prior_pct !== null) add(qn.prior_pct);
    if (qn.delta_pp !== null) add(Math.abs(qn.delta_pp));
    add(qn.current_runs);
  }
  for (const c of inp.by_category ?? []) { add(c.questions); add(c.runs); add(c.cited); add(c.share_pct); add(c.questions_never_cited); add(c.runs_on_never_cited); }
  // The band itself must be quotable, or cleanNote() strips the one number the
  // author is required to cite when it refuses to call a movement a movement.
  if (inp.noise_floor) {
    add(inp.noise_floor.band_pp);
    add(inp.noise_floor.sd_pp);
    add(inp.noise_floor.days);
    add(inp.noise_floor.observed_range_pp);
  }
  if (inp.like_for_like) {
    add(inp.like_for_like.questions);
    add(inp.like_for_like.current_share_pct);
    add(inp.like_for_like.prior_share_pct);
    add(Math.abs(inp.like_for_like.share_delta_pp));
    add(inp.like_for_like.questions_added_since_prior);
  }
  for (const st of inp.offsite.source_types) add(st.share_pct);
  for (const h of inp.offsite.hosts) add(h.share_pct);
  // Structural constants the memo may legitimately state, so they verify
  // without leaning on the small-int safety net: the measured question count
  // and engine count ("18 questions", "6 AI tools plus a Bing organic control").
  add(inp.by_question.length);
  add(inp.by_engine.length);
  // The frozen engagement plan is a human-authored, approved artifact, so the
  // memo may cite it when grading against the plan (section 0). But only the
  // figures the plan states AS DATA earn that trust here.
  //
  // Harvesting every numeric token in the plan (what this did) whitelisted the
  // plan's dates and cadence days as measured values, and because the
  // allowed-set check below short-circuits BEFORE the percentage strictness, a
  // plan reading "runs on the 1st, 11th and 21st" made a fabricated "11%"
  // anywhere in the memo verify clean. The bypass widened with the plan.
  if (inp.plan_markdown) for (const t of planDataNumbers(inp.plan_markdown)) s.add(t);
  return s;
}

/** Numbers the plan states AS DATA -- written with %, "percent", "pp", or
 *  "points". These may back a data claim in the memo ("the plan set a 48%
 *  target"), which is the case the plan allowance exists to serve. */
function planDataNumbers(plan: string): Set<string> {
  const s = new Set<string>();
  for (const m of plan.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent|percentage|pp\b|points?\b)/gi)) s.add(m[1]);
  return s;
}

/** Every other number in the plan: dates, cadence days, counts. The memo may
 *  mention them in prose, but they must NEVER satisfy a percentage or points
 *  claim -- the plan never asserted them as measurements. */
export function planBareNumbers(inp: { plan_markdown?: string | null }): Set<string> {
  if (!inp.plan_markdown) return new Set();
  const data = planDataNumbers(inp.plan_markdown);
  const s = new Set<string>();
  for (const t of inp.plan_markdown.match(/\d+(?:\.\d+)?/g) ?? []) if (!data.has(t)) s.add(t);
  return s;
}

// Bare numbers that are safe regardless of data: genuinely small counts and
// ordinals (0-12), and years for dates. NOTE: this exemption is deliberately
// narrow and is NEVER applied to a number stated as a percentage or a
// points/pp delta -- those are data claims and must trace to the measured set
// (see findUnverifiedNumbers). The old 0-31 band let a fabricated small count
// or (with the adjacency gap) a fabricated percentage slip through.
/** Which rules produced a draft.
 *
 *  A memo is only as good as the instructions the writer was given, and those
 *  instructions change between the day a draft is generated and the day it is
 *  delivered. On 2026-09-24 three generator fixes shipped hours after the
 *  monthly run, and the draft sitting in the console still contained the exact
 *  sentence the last of them was written to prevent.
 *
 *  Hashing the prompt itself means this tracks the rules and nothing else: an
 *  unrelated deploy does not invalidate a draft, and a rule change always
 *  does. INPUT_CONTRACT_REVISION covers changes to the DATA the writer is
 *  handed, which can alter a memo without a word of the prompt moving -- bump
 *  it when by_engine or the other input blocks gain or lose a field. */
const INPUT_CONTRACT_REVISION = "2026-09-24.layer+cohort";

export async function memoRulesHash(): Promise<string> {
  const material = MEMO_AUTHOR_SYSTEM + "\u0000" + INPUT_CONTRACT_REVISION;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return Array.from(new Uint8Array(buf)).slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isSafeNumber(tok: string): boolean {
  const n = Number(tok);
  if (Number.isNaN(n)) return false;
  if (Number.isInteger(n) && n >= 0 && n <= 12) return true; // small counts, ordinals
  if (Number.isInteger(n) && n >= 2024 && n <= 2030) return true; // years
  return false;
}

// Extract numeric tokens from the draft and flag any specific number that
// is neither in the allowed set nor trivially safe.
/** Figures this client was ALREADY SENT, harvested from their most recent
 *  delivered memo. Not new claims: a number we published to them last month
 *  is a fact of record they can check against their own inbox.
 *
 *  This exists because two of our own rules collided. The question-set drift
 *  rule REQUIRES the memo to cite the prior figure when warning that a
 *  month-over-month comparison is invalid, and the figure gate then flagged
 *  the memo for obeying it. On 2026-09 HTC correctly wrote "a different set of
 *  questions than last month's 52%" -- the exact number delivered in August --
 *  and it came back as an unverified figure. */
export function priorDeliveredNumbers(priorBody: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!priorBody) return out;
  const normalized = priorBody.replace(/(\d),(\d{3})\b/g, "$1$2");
  for (const m of normalized.matchAll(/\d+(?:\.\d+)?/g)) out.add(m[0]);
  return out;
}

/** An HTTP status code in an instruction is not a measurement. "Configure a
 *  permanent 301 redirect" is the punch-list telling someone what to do. */
function isTechnicalConstant(tok: string, after: string): boolean {
  if (!/^(30[1278]|40[0-4]|410|50[0-3]|200)$/.test(tok)) return false;
  return /^\s*(redirect|status|response|error|code)\b/i.test(after);
}

export function findUnverifiedNumbers(
  body: string,
  allowed: Set<string>,
  planBare: Set<string> = new Set(),
  priorDelivered: Set<string> = new Set(),
): string[] {
  // Strip thousands separators so "2,346" reads as one number, not "2"
  // and "346". Without this, every comma-formatted figure trips a false
  // positive on its tail segment.
  // URLs are addresses, not claims. A TripAdvisor link carries g60982 and
  // d84382 and neither is a measurement, but both were reported as unverified
  // figures on a real draft, which buries the one number that WAS wrong (768
  // where the truth was 764) among three that never mattered. A checker whose
  // output is mostly noise gets skimmed, and skimming it is how the real one
  // ships.
  const withoutUrls = body
    .replace(/\]\([^)]*\)/g, "]()")            // markdown link targets
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b[\w.-]+\.(?:com|org|net|io|ai|gov|edu)\/\S*/gi, " ");
  // Strip thousands separators so "2,346" reads as one number, not "2"
  // and "346". Without this, every comma-formatted figure trips a false
  // positive on its tail segment.
  const normalized = withoutUrls.replace(/(\d),(\d{3})\b/g, "$1$2");
  const re = /\d+(?:\.\d+)?/g;
  const bad = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const t = m[0];
    if (allowed.has(t)) continue;
    // A number stated as a percentage or a points/pp delta is a DATA CLAIM: it
    // must be a measured value, so neither the small-int exemption nor the
    // plan's non-data numbers can satisfy it.
    const after = normalized.slice(m.index + t.length, m.index + t.length + 14);
    if (isTechnicalConstant(t, after)) continue;
    const isDataClaim = /^\s*(%|percent|point|pp\b|percentage)/i.test(after);
    if (isDataClaim) {
      // The ONE exemption: a figure we already delivered to this client, named
      // in the prose as belonging to an earlier period. Tight on purpose --
      // the number must appear in the previous memo AND be introduced as a
      // past figure, so it cannot be used to launder an invented percentage
      // for the current period.
      const before = normalized.slice(Math.max(0, m.index - 60), m.index);
      const citedAsPast = /\b(last month|previous month|prior month|last month's|previously|a month ago|in august|in july|earlier reading)\b/i.test(before);
      if (priorDelivered.has(t) && citedAsPast) continue;
      bad.add(t); continue;
    }
    if (planBare.has(t)) continue; // plan date/cadence referenced in prose
    if (isSafeNumber(t)) continue;
    bad.add(t);
  }
  return Array.from(bad);
}

async function callClaude(env: Env, userPayload: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const resp = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      system: [{ type: "text", text: MEMO_AUTHOR_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPayload }],
      // 2500 truncated HTC's September draft mid-sentence at "What I am wat".
      // These memos run seven to nine thousand characters and the judge
      // correctly refused the fragment, so the ceiling was spending a full
      // generation to produce something unusable.
      max_tokens: 4000,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const json = (await resp.json()) as { content: { type: string; text?: string }[] };
  return json.content.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("").trim();
}

function parseDraft(raw: string): { title: string; body_markdown: string } | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fence ? fence[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { title?: unknown; body_markdown?: unknown };
    const title = typeof obj.title === "string" ? obj.title.trim().slice(0, 200) : "";
    const body = typeof obj.body_markdown === "string" ? obj.body_markdown.trim() : "";
    if (!title || body.length < 200) return null;
    return { title, body_markdown: body };
  } catch {
    return null;
  }
}

// Generates one customer's draft memo and saves it as a draft (delivered_at
// NULL). month_key is the YYYY-MM the memo is FOR (the current month).
export async function generateMemoDraft(env: Env, slug: string, now: Date): Promise<MemoDraftResult> {
  try {
    const inputs = await gatherMemoInputs(env, slug, now);
    if (inputs.overall.current.runs === 0) {
      return { ok: false, error: "no measurement runs in the current window" };
    }

    // Resolve the month this draft is FOR: the earliest month at or after
    // the current month that does not already have a DELIVERED memo. This
    // makes the generator idempotent against delivered memos. If the
    // current month is already delivered, it rolls forward (e.g. May is
    // delivered, so it drafts June, a delta memo against May).
    // NOTE: this block MUST stay above the first use of monthKey below (it
    // feeds deliveryMonthLabel). Moving it back down reintroduces a
    // temporal-dead-zone ReferenceError that silently fails every memo.
    const curKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const curDelivered = await env.DB.prepare(
      `SELECT 1 FROM monthly_memos WHERE client_slug=? AND month_key=? AND delivered_at IS NOT NULL`
    ).bind(slug, curKey).first();
    let monthKey = curKey;
    if (curDelivered) {
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      monthKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    const [yr0, mo0] = monthKey.split("-").map(Number);
    const deliveryMonthLabel = new Date(Date.UTC(yr0, mo0 - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

    const payload = JSON.stringify({
      instruction: inputs.is_first_memo
        ? "This is the customer's FIRST memo. Set a baseline. Use the 'Where you are invisible' heading."
        : "This is a DELTA memo. Lead with what moved since the prior memo. Use the 'What moved' heading. The prior memo is included; reference its priorities and whether the gaps it named have moved.",
      delivery_month_label: deliveryMonthLabel,
      title_instruction: `Title the memo and its opening H2 by the DELIVERY month: "${deliveryMonthLabel}". Do not date it by the month the data falls in. This memo ships in ${deliveryMonthLabel} on the monthly cadence.`,
      data: inputs,
    }, null, 2);

    const raw = await callClaude(env, payload);
    const parsed = parseDraft(raw);
    if (!parsed) return { ok: false, error: "could not parse generated draft" };

    // Lock the title to the DELIVERY month, not whatever the model chose
    // from the data window. Memos are cadence deltas dated by the cycle
    // they ship in, and Atlas refers to them by delivery date ("your June
    // memo arrives..."), so the label must match the delivery month for
    // product-wide consistency. The model writes the body; code owns the
    // title month.
    const [yr, mo] = monthKey.split("-").map(Number);
    const monthLabel = new Date(Date.UTC(yr, mo - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const titleDescriptor = inputs.is_first_memo ? "baseline" : "what moved";
    const lockedTitle = `${monthLabel}: ${titleDescriptor}`;
    parsed.title = lockedTitle;
    // Normalize the body's leading H2 to match the locked title, in case
    // the model dated it by the data window instead of the delivery month.
    parsed.body_markdown = parsed.body_markdown.replace(/^\s*##\s+.*(?:\r?\n)/, `## ${lockedTitle}\n`);

    // Quality gates.
    const tone = checkHumanTone(parsed.body_markdown, "customer-email");
    const toneViolations = tone.violations.filter((v) => v.severity === "block").map((v) => `${v.pattern}: ${v.match}`);
    const unverified = findUnverifiedNumbers(parsed.body_markdown, allowedNumberSet(inputs), planBareNumbers(inputs));

    // Taxonomy + identity gate: deterministic, and it REFUSES THE SAVE.
    // The 2026-09 HTC draft reached the review queue addressing the contact
    // as "Mike" (he is Greg) and attributing the Bing control's 1% to
    // Microsoft Copilot, retired 2026-08-22 with no data. scripts/check-claims
    // guards the repo; this prose is authored straight into D1 and never
    // touches the repo, so nothing guarded the WORDS (allowedNumbers guards
    // only the figures). Refusing the save matters twice over: the INSERT
    // below is an upsert that overwrites an undelivered draft, so a bad
    // regeneration would also destroy a previously corrected one.
    const taxonomy: string[] = [];
    const bodyText = parsed.body_markdown;
    if (/\bcopilot\b/i.test(bodyText)) {
      taxonomy.push("names Copilot: retired 2026-08-22, there is no Copilot data; the Bing channel is the classic-search control");
    }
    if (/\b(?:all\s+)?seven\s+(?:ai\s+)?engines\b/i.test(bodyText) || /\b7\s+ai\s+(?:engines|tools)\b/i.test(bodyText)) {
      taxonomy.push("counts the control as an engine: house form is six AI tools plus a Bing organic control, seven measured surfaces");
    }
    {
      const contact = inputs.customer.primary_contact_first_name;
      const greet = bodyText.match(/^\s*([A-Z][a-z]+),\s/m);
      if (greet && contact && greet[1] !== contact) {
        taxonomy.push(`addresses the contact as "${greet[1]}" but the primary contact is "${contact}"`);
      }
      if (greet && !contact) {
        taxonomy.push(`addresses someone by name ("${greet[1]}") but no primary contact is on file -- the name is invented`);
      }
    }
    if (taxonomy.length > 0) {
      return { ok: false, error: "taxonomy/identity gate refused the draft", taxonomyViolations: taxonomy };
    }

    // Save as DRAFT (delivered_at NULL). Flag metadata is stored in the
    // title prefix is avoided; instead we return it for the review UI.
    const res = await env.DB.prepare(
      `INSERT INTO monthly_memos (client_slug, month_key, title, body_markdown, rules_hash, delivered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, unixepoch(), unixepoch())
       ON CONFLICT(client_slug, month_key) DO UPDATE SET
         title = excluded.title,
         body_markdown = excluded.body_markdown,
         rules_hash = excluded.rules_hash,
         updated_at = excluded.updated_at
       WHERE monthly_memos.delivered_at IS NULL`
    ).bind(slug, monthKey, parsed.title, parsed.body_markdown, await memoRulesHash()).run();

    // Fetch the id (the upsert may have updated an existing draft).
    const row = await env.DB.prepare(
      `SELECT id FROM monthly_memos WHERE client_slug = ? AND month_key = ?`
    ).bind(slug, monthKey).first<{ id: number }>();

    // Freeze the report's chart data (facts_json) from the snapshot so the
    // readout archive renders all four charts. Best-effort: never blocks the
    // draft. This is what makes every future customer's charts automatic (no
    // hand-backfill like HTC needed).
    try {
      const { emitReportFacts } = await import("./report-facts");
      await emitReportFacts(env, slug, monthKey);
    } catch { /* charts are optional; the memo still saves */ }

    // Gate 3: the editorial ship gate (shadow mode). Records what the judge +
    // cross-provider verifier would do. Does not change delivery: the memo still
    // queues for review until the graduation tracker flips the gate live.
    let gate: DeliverableVerdict | undefined;
    try {
      const { gateDeliverable } = await import("./deliverable-judge");
      gate = await gateDeliverable(env, {
        artifactType: "monthly_memo",
        artifactId: row?.id ?? null,
        clientSlug: slug,
        factsJson: JSON.stringify(inputs).slice(0, 6000),
        draftMarkdown: parsed.body_markdown,
      });
    } catch { /* gate is best-effort in shadow mode */ }

    return {
      ok: true,
      memoId: row?.id,
      title: parsed.title,
      toneViolations: toneViolations.length ? toneViolations : undefined,
      unverifiedNumbers: unverified.length ? unverified : undefined,
      gate,
    };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300) };
  }
}

// Re-vet a (possibly hand-edited) memo body against the SAME gates the
// generator runs: unverified-number detection and the human-tone block list.
// The deliver action calls this so a flagged number or banned phrasing can
// never be silently shipped to the customer + Atlas; delivery requires either
// a clean body or an explicit override.
export async function vetMemoBody(
  env: Env,
  slug: string,
  body: string,
  now: Date,
  factsJson?: string | null,
): Promise<{ unverifiedNumbers: string[]; toneViolations: string[]; claimIssues: string[] }> {
  const inputs = await gatherMemoInputs(env, slug, now);
  const tone = checkHumanTone(body, "customer-email");
  const toneViolations = tone.violations.filter((v) => v.severity === "block").map((v) => `${v.pattern}: ${v.match}`);
  // The most recent memo this client was actually SENT. Drafts are excluded:
  // an undelivered draft is not a fact of record, and letting one seed the
  // allowlist would let a bad figure launder itself forward.
  const prior = await env.DB.prepare(
    `SELECT body_markdown FROM monthly_memos
      WHERE client_slug = ? AND delivered_at IS NOT NULL
      ORDER BY month_key DESC LIMIT 1`,
  ).bind(slug).first<{ body_markdown: string }>().catch(() => null);
  const unverifiedNumbers = findUnverifiedNumbers(
    body, allowedNumberSet(inputs), planBareNumbers(inputs),
    priorDeliveredNumbers(prior?.body_markdown));
  // Claim checking: the number guard proves a figure EXISTS in the data; this
  // proves the prose describes it TRUTHFULLY. Three false comparisons reached
  // a delivered draft on 2026-08-03 with every number legitimate. Absent
  // facts => no checks, so nothing changes for a memo without frozen data.
  const { checkClaims, formatClaimIssues } = await import("./claim-check");
  const claimIssues = formatClaimIssues(checkClaims(body, factsJson));
  return { unverifiedNumbers, toneViolations, claimIssues };
}

// Generates drafts for every active/pilot customer. Returns a per-customer
// summary. Used by the monthly cron and the admin on-demand trigger.
export async function generateAllMemoDrafts(env: Env, now: Date): Promise<Array<{ slug: string } & MemoDraftResult>> {
  const customers = await env.DB.prepare(
    `SELECT client_slug FROM customers WHERE status IN ('active','pilot')`
  ).all<{ client_slug: string }>();
  const out: Array<{ slug: string } & MemoDraftResult> = [];
  for (const c of customers.results) {
    const r = await generateMemoDraft(env, c.client_slug, now);
    out.push({ slug: c.client_slug, ...r });
  }
  return out;
}
