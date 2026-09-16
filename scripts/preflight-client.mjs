#!/usr/bin/env node
//
// preflight-client.mjs — refuse to start a paid engagement, or publish a
// readout, on unverified state.
//
// WHY THIS EXISTS (2026-08-28):
// check-claims blocks a deploy when a retired claim reaches a page. Nothing
// did the equivalent for whether we are actually OPERATING. On 2026-08-28,
// four days before a paying client's start date, we found by hand:
//
//   - measurement_registry.active = 0        (no watchdog, no digest, no Atlas)
//   - citation_keywords.active    = 0 (all)  (the sweep never picks them up)
//   - zero users                             (client bounces to /login forever)
//   - a runbook gate reading "DONE" for a signature that was never given
//
// Every one failed SILENTLY. An inactive client is not failing, it is skipped,
// and skipped things raise nothing. The two active flags are separate and
// nothing anywhere said so: arming only the registry gives you an alarm over
// an empty pipeline.
//
// This script asserts what must be true and exits non-zero when it is not.
// Run it BEFORE arming a client AND before each monthly readout, and treat a
// red result as a stop. Section 7 is why the second occasion matters: a
// readout is the moment column names stop being internal vocabulary and
// become claims to someone who pays.
//
//   node scripts/preflight-client.mjs <client-slug>
//
// Read-only. It never writes.

import { execFileSync } from "node:child_process";

const slug = process.argv[2];
if (!slug) {
  console.error("usage: node scripts/preflight-client.mjs <client-slug>");
  process.exit(2);
}

const DB = "neverranked-app";
const DASH = new URL("../dashboard/", import.meta.url).pathname;

function q(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { cwd: DASH, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  // wrangler prints a banner before the JSON; take from the first [ or {.
  const i = Math.min(...[out.indexOf("["), out.indexOf("{")].filter((n) => n >= 0));
  return JSON.parse(out.slice(i))[0].results;
}
const one = (sql) => q(sql)[0] ?? {};
const esc = (s) => String(s).replace(/'/g, "''");
const S = esc(slug);

// Every check lands in ONE array with a stable label, so other tooling
// (scripts/arm-client.mjs) can reason about WHICH check failed instead of
// scraping prose. --json emits it.
const JSON_MODE = process.argv.includes("--json");
const results = [];
const check = (ok, label, detail, blocking = true) => {
  results.push({ label, ok: !!ok, blocking, detail: ok ? null : detail });
};
const notes = [];
const say = (...a) => { if (!JSON_MODE) console.log(...a); };

say(`\npreflight: ${slug}\n`);

// ── 1. measurement_registry: arms the WATCHDOG ──────────────────────────────
const reg = one(
  `SELECT active, category, full_target, run_days, measurement_start FROM measurement_registry WHERE client_slug='${S}'`,
);
check(reg.category !== undefined, "registry row exists",
  "no measurement_registry row: this client cannot be watched or measured");
check(reg.measurement_start != null && Number(reg.measurement_start) > 0,
  "measurement_start set",
  "measurement_registry.measurement_start is NULL. report-facts decides whether a month is a BASELINE by asking if prior-window rows exist, so any pre-sale teardown, demo or dry run sitting in the prior month becomes the comparison baseline for this client's first memo. See migration 0109");

check(Number(reg.active) === 1, "registry active = 1",
  `active is ${reg.active ?? "MISSING"}. Arms the watchdog, the pass-cadence digest, Atlas context and the customer view. See KICKOFF-RUNBOOK Gate 6`);

// ── 2. citation_keywords: makes the measurement RUN ─────────────────────────
const kw = one(
  `SELECT SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS on_n, COUNT(*) AS all_n
     FROM citation_keywords WHERE client_slug='${S}'`,
);
check(Number(kw.all_n) > 0, "keywords exist", "no citation_keywords rows at all");
check(Number(kw.on_n) > 0, "keywords active = 1",
  `${kw.on_n ?? 0} of ${kw.all_n ?? 0} active. planCitationRun filters WHERE active=1, so the sweep never picks this client up. THIS IS A SEPARATE FLAG FROM THE REGISTRY. See Gate 8`);

// ── 3. the client can actually open the thing they pay for ──────────────────
const u = one(`SELECT COUNT(*) AS n FROM users WHERE client_slug='${S}'`);
check(Number(u.n) > 0, "client logins exist",
  "zero users. handleReadoutView redirects to /login, so the customer lands on a login page for an account that does not exist");

// ── 4. cohort ───────────────────────────────────────────────────────────────
const d = one(
  `SELECT SUM(CASE WHEN is_competitor=0 THEN 1 ELSE 0 END) AS own,
          SUM(CASE WHEN is_competitor=1 THEN 1 ELSE 0 END) AS comp
     FROM domains WHERE client_slug='${S}'`,
);
check(Number(d.own) > 0, "own domain registered", "no non-competitor domain: prominence cannot be computed");
check(Number(d.comp) > 0, "competitor cohort registered", "no competitor rows: there is nothing to measure against");

// ── 5. contract + memo grading ──────────────────────────────────────────────
const c = one(
  `SELECT status, CASE WHEN plan_markdown IS NULL THEN 0 ELSE 1 END AS has_plan,
          COALESCE(TRIM(name),'') AS name
     FROM customers WHERE client_slug='${S}'`,
);
check(c.status !== undefined, "customers row exists", "no customers row");

// A resolvable brand NAME is load-bearing, not cosmetic. The two
// model-knowledge surfaces (Claude, Gemma) are measured ONLY by whether the
// name appears in the answer -- they are called with an empty URL list by
// design -- so with no name every one of their rows scores 0 regardless of
// what the model said. prince-waikiki ran that way for the whole of their
// first month: Gemma named the business in a substantial share of that
// month's responses and every one stored as absent, which would have shipped
// as "Gemma 0%" in the first paid readout. resolveBusinessName() falls back here from injection_configs,
// so this row is the last line of defence.
check(String(c.name || "").length >= 2, "customers.name set (Claude/Gemma matching)",
  "customers.name is empty. Model-knowledge surfaces match on the brand NAME, so they will silently score 0% for this client on every question");
check(Number(c.has_plan) === 1, "plan_markdown set",
  "customers.plan_markdown is NULL. The monthly memo generator grades each memo against it, so this client has nothing to be graded against", false);

// ── 6. does the pipeline actually produce rows? (only meaningful once armed) ─
if (Number(reg.active) === 1) {
  const r = one(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT engine) AS engines
       FROM citation_runs cr JOIN citation_keywords ck ON ck.id=cr.keyword_id
      WHERE ck.client_slug='${S}' AND cr.run_at > unixepoch()-86400*3`,
  );
  check(Number(r.n) > 0, "runs landing in the last 3 days",
    "armed, but no citation_runs. The watchdog will alarm before anyone notices the pipeline is dry");
  check(Number(r.engines) >= 6, "all surfaces writing",
    `only ${r.engines ?? 0} distinct engines wrote. Expect 7 (six AI tools plus the Bing control); AI Overviews legitimately skips on a real empty answer`, false);
} else {
  notes.push("run check skipped — client is not armed yet, so an empty pipeline is expected");
}

// ── 7. do the columns hold what their names say? ────────────────────────────
//
// WHY THIS SECTION EXISTS (2026-09-16). Every check above asks whether the
// pipeline is RUNNING. Over two days in September we found seven defects and
// not one of them was a pipeline that had stopped. Every one was a name that
// promised more than its contents delivered:
//
//   cited_urls              held the retrieval set on two engines
//   cited_urls_strict       held the merged set on two more, columns swapped
//   retrieved_urls          held NULL on those same two, data discarded
//   cited_entities          held domains, never business names
//   extractEntitiesFromText took the answer text and never read it
//   "citation-grade"        described four engines that cite nothing
//   a deploy alert          announced a write path disabled since July
//
// All seven passed every test and every guard, because tests check arity,
// types and structure. None of them can check whether a name is true about
// its contents. What caught all of them was querying production and reading
// the rows, which is a habit, not a control. This section is the control.
//
// SCOPE: the most recent sweep, not a fixed window. The question is whether
// the pipeline is correct NOW. Judging it over fourteen days keeps it red for
// a fortnight after a fix and green for a fortnight after a regression, which
// is backwards on both counts. Contamination in older rows is real and is
// reported separately, as a note, because it is a data-repair question rather
// than a go/no-go one.

const SEARCH = "'perplexity','openai','gemini','google_ai_overview'";
const NO_CITE_SIGNAL = "'openai','google_ai_overview','bing'";
const LAST_SWEEP = `cr.run_at >= (SELECT MAX(cr2.run_at) - 21600 FROM citation_runs cr2
                                   JOIN citation_keywords ck2 ON ck2.id=cr2.keyword_id
                                  WHERE ck2.client_slug='${S}')`;
const FROM = `FROM citation_runs cr JOIN citation_keywords ck ON ck.id=cr.keyword_id
              WHERE ck.client_slug='${S}' AND ${LAST_SWEEP}`;
const FROM14 = `FROM citation_runs cr JOIN citation_keywords ck ON ck.id=cr.keyword_id
              WHERE ck.client_slug='${S}' AND cr.run_at > unixepoch()-86400*14`;

// Which sweep is being judged. Printed with the result because a red line
// here is ambiguous without it: a fix deployed after the last sweep ran is
// indistinguishable from a fix that did not work, and the difference is
// whether you panic.
const sweepAt = one(
  `SELECT MAX(cr.run_at) AS at, datetime(MAX(cr.run_at),'unixepoch') AS utc
     FROM citation_runs cr JOIN citation_keywords ck ON ck.id=cr.keyword_id
    WHERE ck.client_slug='${S}'`,
);
if (sweepAt.at) notes.push(`column checks judged the sweep of ${sweepAt.utc} UTC. A fix deployed after that time has not been exercised yet.`);

const sem = one(
  `SELECT
     (SELECT COUNT(*) ${FROM} AND cr.engine IN (${NO_CITE_SIGNAL}) AND cr.cited_urls_strict IS NOT NULL) AS strict_on_uncited,
     (SELECT COUNT(*) ${FROM} AND cr.engine IN (${SEARCH}) AND cr.retrieved_urls IS NULL) AS retrieved_null,
     (SELECT COUNT(*) ${FROM} AND cr.cited_urls_strict IS NOT NULL AND cr.retrieved_urls IS NOT NULL
        AND json_array_length(cr.cited_urls_strict) > json_array_length(cr.retrieved_urls)) AS cited_exceeds_retrieved,
     (SELECT COUNT(*) ${FROM} AND cr.engine IN (${SEARCH}) AND (cr.response_text IS NULL OR TRIM(cr.response_text)='')) AS empty_text,
     (SELECT COUNT(*) ${FROM} AND cr.engine IN (${SEARCH})) AS search_rows`,
);

// A. The swap. openai, google_ai_overview and bing have no citation signal
//    extracted, so their strict column must be NULL. A URL array there means
//    something copied the retrieval set in, which is the 2026-09-15 bug.
check(Number(sem.strict_on_uncited) === 0, "cited_urls_strict is NULL where nothing was cited",
  `${sem.strict_on_uncited} rows on engines with NO citation signal carry a value in cited_urls_strict. That column then holds retrieval under a name that says citation. See citations.ts:1234 and :1327`);

// B. The discard. The same swap wrote NULL into the column that should hold
//    the retrieval set, throwing the data away on every run.
check(Number(sem.retrieved_null) === 0, "retrieved_urls is populated on web-searching engines",
  `${sem.retrieved_null} web-searching rows have retrieved_urls NULL. Those runs discarded what the engine pulled`);

// C. The property that makes the word honest: an answer cannot rest on more
//    sources than were retrieved.
check(Number(sem.cited_exceeds_retrieved) === 0, "cited is never larger than retrieved",
  `${sem.cited_exceeds_retrieved} rows claim more cited URLs than retrieved ones, which cannot be true of any real answer`);

// How far back the swap reaches. Not blocking: these rows cannot be repaired
// (the retrieval set was never stored) and they age out of every reporting
// window on their own. Reported so nobody reads a clean preflight as a clean
// history.
const hist = one(
  `SELECT
     (SELECT COUNT(*) ${FROM14} AND cr.engine IN (${NO_CITE_SIGNAL}) AND cr.cited_urls_strict IS NOT NULL) AS strict_on_uncited,
     (SELECT COUNT(*) ${FROM14} AND cr.engine IN (${SEARCH}) AND cr.retrieved_urls IS NULL) AS retrieved_null`,
);
if (Number(hist.strict_on_uncited) > 0 || Number(hist.retrieved_null) > 0) {
  notes.push(`older rows carry the 2026-09-15 column swap: ${hist.strict_on_uncited} with retrieval in the strict column, ${hist.retrieved_null} with retrieval discarded (last 14 days). Not repairable, ages out.`);
}

// D. Presence is read from the answer text. An empty answer makes it silently
//    unmeasurable, and an unmeasured absence reads as a measured zero.
check(Number(sem.empty_text) === 0, "answer text stored on web-searching engines",
  `${sem.empty_text} of ${sem.search_rows} web-searching rows stored no answer text. "Did the AI name you" cannot be measured on those`, false);

// E. How much of the presence measure is actually readable. Not a defect: a
//    weak denominator, which widens the gap between the published floor and
//    the true figure. Worth seeing before a readout rather than after.
if (Number(sem.search_rows) > 0) {
  const trunc = one(
    `SELECT SUM(CASE WHEN length(cr.response_text) >=
        (CASE WHEN cr.run_at < 1789554300 THEN 3990 ELSE 11990 END) THEN 1 ELSE 0 END) AS cut,
        COUNT(*) AS n ${FROM} AND cr.engine IN (${SEARCH})`,
  );
  const pctCut = Number(trunc.n) ? Math.round((100 * Number(trunc.cut)) / Number(trunc.n)) : 0;
  check(pctCut <= 25, "most answers stored whole",
    `${pctCut}% of web-searching answers hit the storage cap, so the published "named in at least N%" floor sits well below the real figure. Under 25% is the line`, false);
  notes.push(`presence readability: ${Number(trunc.n) - Number(trunc.cut)} of ${trunc.n} web-searching answers stored whole (${100 - pctCut}%)`);
}

// F. Can the name be matched at all? A short bare name cannot be matched
//    without word boundaries, and buildPresenceSql refuses rather than count
//    loosely -- which means the readout silently has no presence block.
const nm = String(c.name || "").trim().toLowerCase();
check(nm.includes(" ") || nm.length >= 8, "business name is matchable in answer text",
  `"${c.name}" is a single short token. buildPresenceSql refuses it because a boundary-free LIKE would match it inside longer words, so this client gets no "where AI says your name" section at all`, false);

// ── report ──────────────────────────────────────────────────────────────────
const fail = results.filter((r) => !r.ok && r.blocking);
const warn = results.filter((r) => !r.ok && !r.blocking);

if (JSON_MODE) {
  console.log(JSON.stringify({ slug, ok: fail.length === 0, results }, null, 2));
  process.exit(fail.length ? 1 : 0);
}
for (const r of results.filter((r) => r.ok)) console.log(`  ✓ ${r.label}`);
for (const w of warn) console.log(`  ! ${w.label} — ${w.detail}`);
for (const n of notes) console.log(`  ! ${n}`);
if (fail.length) {
  console.error(`\n✗ preflight FAILED for ${slug}: ${fail.length} blocking issue(s)\n`);
  fail.forEach((f) => console.error(`  ✗ ${f.label} — ${f.detail}`));
  console.error("\n  Do NOT start or arm this client until these are green.\n");
  process.exit(1);
}
console.log(`\n✓ preflight: ${slug} is ready${warn.length ? ` (${warn.length} advisory)` : ""}.\n`);
