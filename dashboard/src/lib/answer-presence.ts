/**
 * Was the business NAMED in the answer?
 *
 * WHY THIS EXISTS. Until 2026-09-16 nothing in the sweep recorded this. The
 * field that looked like it did, `cited_entities`, is built by
 * `extractEntitiesFromText` (citations.ts) -- which takes the answer text as a
 * parameter and never reads it. It maps URLs to hostnames. So for the four
 * web-searching engines that column is a list of domains, and a search for the
 * customer's name in it finds nothing except by accident.
 *
 * Measured on 1,482 September rows for one client: the URL-derived flag read
 * 14.9% and a name search over `cited_entities` read 0.7%, with 210 rows
 * matching on URL and not on name. That gap is the missing measurement, not a
 * finding about the client.
 *
 * The model-knowledge engines already have this, for a reason that does not
 * generalise: they are prompted to return {businesses:[{name,...}]} as JSON, so
 * their entities really are names. The web-searching engines answer in prose.
 * Prose has to be read.
 *
 * WHAT THIS IS FOR. "Did the AI say your name" is the question a business
 * actually has. Being among the pages it pulled is weaker and is what the grid
 * reports today. This module is the stronger measure; wiring it to the readout
 * is a separate decision with a separate date.
 *
 * THE THIRD STATE IS LOAD-BEARING. `response_text` is stored truncated. At the
 * old 4,000-character cap that hit 64% of ChatGPT answers and 0% of
 * Perplexity's, so a name appearing late in a long answer is invisible on one
 * engine and not the other. Scoring those as absent would manufacture a gap
 * between engines out of a storage limit -- the exact shape of error that put a
 * retrieval set under the word "cited". So: found is true, not-found in a
 * complete answer is false, and not-found in an answer we only hold part of is
 * NULL. Null means we cannot tell, and callers must not count it as a zero.
 */

/** Longest answer we store. Raised from 4,000 on 2026-09-16: at 4,000 the cap
 *  was reached by most ChatGPT answers, which biased any text measure by
 *  engine. Kept finite because the column is not an archive. */
export const RESPONSE_TEXT_CAP = 12000;

/** The cap every row written BEFORE this instant was stored under. Rows older
 *  than this were cut at 4,000 and must be judged against 4,000: measuring them
 *  against today's cap reads a truncated answer as a complete one and turns a
 *  storage limit into a measured absence. Set to the deploy that raised it
 *  (2026-09-16 10:25 UTC); the next sweep after it was 17:00 UTC the same day,
 *  so no run straddles the boundary. */
export const RESPONSE_TEXT_CAP_RAISED_AT = 1789554300;
const LEGACY_RESPONSE_TEXT_CAP = 4000;

/** Which cap was in force when this row was written. */
export function capForRun(runAt: number): number {
  return runAt < RESPONSE_TEXT_CAP_RAISED_AT ? LEGACY_RESPONSE_TEXT_CAP : RESPONSE_TEXT_CAP;
}

/** A stored answer this close to the cap was probably cut mid-sentence, so a
 *  name we do not find might be in the part we discarded. */
export function looksTruncated(text: string, cap: number = RESPONSE_TEXT_CAP): boolean {
  return text.length >= cap - 10;
}

/** Fold the shapes that differ only in typography: curly quotes, the various
 *  dashes, runs of whitespace, and case. Accents are left alone deliberately --
 *  "Ko Olina" and "Kō Olina" are different spellings a venue chooses between,
 *  and folding them silently would hide a real naming difference. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BB\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a matcher for one name. Internal spaces match any run of whitespace so
 *  a line break inside the name still matches. The edges require a non-word
 *  character so "Kai" does not match inside "Kailua" -- a substring rule with no
 *  boundary is how a common token becomes a false positive. */
function nameRegex(name: string): RegExp | null {
  const n = normalize(name);
  if (n.length < 4) return null; // too short to be evidence
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i");
}

export interface PresenceInput {
  /** The stored answer. */
  text: string | null | undefined;
  /** Registered business name, e.g. "Prince Waikiki". */
  businessName: string;
  /** Other names the same business is called. A former name or a booking-site
   *  spelling is a real alias; a generic fragment of the name is not, and
   *  passing one here is how "Waikiki" starts matching every hotel in town. */
  aliases?: string[];
  /** Cap the text was stored under, when it differs from the current one. */
  cap?: number;
}

/**
 * true  = the answer names the business
 * false = the answer does not, and we hold the whole answer
 * null  = we only hold part of the answer and did not find it there
 */
export function namedInAnswer(input: PresenceInput): boolean | null {
  const text = typeof input.text === "string" ? input.text : "";
  if (!text.trim()) return null; // no answer stored: not an absence

  const hay = normalize(text);
  const candidates = [input.businessName, ...(input.aliases ?? [])];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const re = nameRegex(c);
    if (re && re.test(hay)) return true;
  }

  return looksTruncated(text, input.cap ?? RESPONSE_TEXT_CAP) ? null : false;
}

/** Summarise a set of runs without ever counting a null as a no.
 *
 *  Reporting one rate here would be misleading, and the bias has a direction.
 *  Every unknown is by construction a row where the name was NOT found in the
 *  part we hold. Dropping them therefore removes only not-yet-found rows, which
 *  pushes the rate UP. Measured on one client's September: 45.0% over judged
 *  rows against 38.4% over all rows, and the gap is almost entirely one engine
 *  whose answers were truncated far more often than its peers.
 *
 *  So both ends are returned. `rateJudged` is the upper bound, `rateAll` the
 *  lower, and the truth is between them. A caller that wants one number for a
 *  customer should say the range or say the lower one, never the upper alone.
 */
export function presenceStats(
  results: Array<boolean | null>,
): {
  named: number;
  judged: number;
  unknown: number;
  total: number;
  /** Upper bound: named / rows we could read. Null when nothing was readable. */
  rateJudged: number | null;
  /** Lower bound: named / all rows, counting every unknown as a no. */
  rateAll: number | null;
} {
  let named = 0, judged = 0, unknown = 0;
  for (const r of results) {
    if (r === null) { unknown++; continue; }
    judged++;
    if (r) named++;
  }
  const total = judged + unknown;
  return {
    named,
    judged,
    unknown,
    total,
    rateJudged: judged === 0 ? null : named / judged,
    rateAll: total === 0 ? null : named / total,
  };
}

// ── Counting a month without hauling a month of text into the Worker ──────
//
// A month is ~3,000 runs and an answer can now be 12,000 characters, so
// SELECTing response_text to score it in TypeScript would move tens of
// megabytes per page render. The counting therefore happens in D1 and only
// the counts come back.
//
// That means a second implementation of the same rule, which is how two
// definitions of one number start disagreeing -- the failure this whole area
// is about. Two things hold them together: the SQL is built HERE, beside the
// function it mirrors, and it is only ever built for a name the boundary rule
// cannot need. SQL LIKE has no word boundaries, so a bare short token such as
// "Kai" would match inside "Kailua". A multi-word name cannot: nothing
// contains "prince waikiki" except a mention of it. Names that are neither
// multi-word nor long are REFUSED rather than counted loosely.

/** Is this name safe to match with a boundary-free LIKE? */
export function nameIsSqlSafe(name: string): boolean {
  const n = normalize(name);
  return n.includes(" ") || n.length >= 8;
}

export interface PresenceSql { sql: string; binds: unknown[] }

/**
 * Per-engine presence counts for one client over one window.
 * Returns null when any candidate name is unsafe for a boundary-free match,
 * because a loose count is worse than no count.
 */
export function buildPresenceSql(opts: {
  clientSlug: string;
  businessName: string;
  aliases?: string[];
  windowStart: number;
  windowEnd: number;
}): PresenceSql | null {
  const names = [opts.businessName, ...(opts.aliases ?? [])]
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map(normalize);
  if (!names.length || !names.every(nameIsSqlSafe)) return null;

  // \ escapes the LIKE metacharacters, declared with ESCAPE below. A business
  // called "50% Off Cafe" would otherwise match far more than itself.
  const pattern = (n: string) => `%${n.replace(/[\\%_]/g, "\\$&")}%`;
  const anyMatch = names.map(() => `LOWER(cr.response_text) LIKE ? ESCAPE '\\'`).join(" OR ");
  const noMatch = names.map(() => `LOWER(cr.response_text) NOT LIKE ? ESCAPE '\\'`).join(" AND ");

  const sql =
    `SELECT cr.engine AS engine,
            COUNT(*) AS total,
            SUM(CASE WHEN ${anyMatch} THEN 1 ELSE 0 END) AS named,
            SUM(CASE WHEN ${noMatch}
                      AND length(cr.response_text) >= (CASE WHEN cr.run_at < ? THEN ? ELSE ? END)
                     THEN 1 ELSE 0 END) AS unknown_count
       FROM citation_runs cr JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?
      GROUP BY cr.engine`;

  const binds: unknown[] = [
    ...names.map(pattern),
    ...names.map(pattern),
    RESPONSE_TEXT_CAP_RAISED_AT,
    LEGACY_RESPONSE_TEXT_CAP - 10,
    RESPONSE_TEXT_CAP - 10,
    opts.clientSlug,
    opts.windowStart,
    opts.windowEnd,
  ];
  return { sql, binds };
}

export interface EnginePresence {
  engine: string;
  named: number;
  unknown: number;
  total: number;
  judged: number;
  /** Upper bound. Null when nothing in the window was readable. */
  rateJudged: number | null;
  /** Lower bound. */
  rateAll: number | null;
}

/** Shape a raw count row. Kept here so the bounds are computed in exactly one
 *  place no matter which query produced the counts. */
export function toEnginePresence(row: {
  engine: string; total: number; named: number; unknown_count: number;
}): EnginePresence {
  const total = Number(row.total) || 0;
  const named = Number(row.named) || 0;
  const unknown = Number(row.unknown_count) || 0;
  const judged = Math.max(0, total - unknown);
  return {
    engine: row.engine,
    named,
    unknown,
    total,
    judged,
    rateJudged: judged === 0 ? null : named / judged,
    rateAll: total === 0 ? null : named / total,
  };
}
