/**
 * engine-spend.ts — what the measurement costs, per call, recorded rather than
 * guessed.
 *
 * WHY THIS EXISTS. On 2026-09-12 the OpenAI balance hit zero and every OpenAI
 * measurement stopped. It was noticed because the instrument went dark, not
 * because anything warned that the balance was falling. There was no spend
 * tracking of any kind: asked on 2026-09-15 what the measurement costs, the
 * only honest answer was an estimate built from call counts and stored response
 * lengths.
 *
 * A measurement company that cannot measure its own cost of measurement is
 * funny in the wrong way.
 *
 * TWO KINDS OF NUMBER, NEVER MIXED. Some providers report what a call cost.
 * DataForSEO returns a `cost` field per task. Those rows are `reported` and are
 * true. Token-priced providers return usage but not money, so the cost is
 * derived from the rate table below and those rows are `estimated`. The
 * distinction is a column, not a comment, because a total that silently blends
 * a measured figure with a modelled one is the exact defect this codebase keeps
 * finding in its own reports.
 *
 * THE RATE TABLE IS A GUESS UNTIL RECONCILED. Rates were taken from public
 * pricing pages on 2026-09-15 and have never been checked against an invoice.
 * Until `reconciledAgainstInvoice` is set for a provider, treat its estimated
 * totals as indicative. Reconciling is a person opening a billing page once and
 * writing the date here.
 */

export type SpendBasis = "reported" | "estimated";

export interface EngineRates {
  /** USD per million input tokens. */
  inputPerM: number;
  /** USD per million output tokens. */
  outputPerM: number;
  /** Flat USD per call on top of tokens, where a provider charges one. */
  perCall?: number;
  /** Calls per day that cost nothing before metering starts. */
  freeCallsPerDay?: number;
  /** Where the numbers came from and when. */
  source: string;
  /** Set to a date string once someone has compared this against a real bill.
   *  Null means the totals are indicative only. */
  reconciledAgainstInvoice: string | null;
}

/**
 * Keys are the `engine` values written to citation_runs. Anything absent from
 * this table costs nothing as far as we can prove, which is recorded as a zero
 * with basis `estimated` rather than skipped, so an unpriced engine shows up as
 * a visible zero instead of quietly vanishing from the total.
 */
export const RATES: Record<string, EngineRates> = {
  openai: {
    inputPerM: 1.25,
    outputPerM: 10.0,
    source: "gpt-5-search-api public pricing, read 2026-09-15",
    reconciledAgainstInvoice: null,
  },
  gemini: {
    inputPerM: 0.3,
    outputPerM: 2.5,
    // Grounding with Google Search on the 2.5 family: 1,500 requests/day free,
    // then $35 per 1,000. Current volume is ~81/day, so grounding is free and
    // the token rates are the whole cost. If volume ever crosses 1,500/day this
    // entry is wrong by $35 per extra thousand and must be updated.
    freeCallsPerDay: 1500,
    perCall: 0.035,
    source: "Gemini 2.5 grounding, 1500/day free then $35/1k, read 2026-09-15",
    reconciledAgainstInvoice: null,
  },
  perplexity: {
    inputPerM: 1.0,
    outputPerM: 1.0,
    perCall: 0.005,
    source: "Perplexity Agent API, indicative. NOT verified against a bill.",
    reconciledAgainstInvoice: null,
  },
  anthropic: {
    inputPerM: 0.8,
    outputPerM: 4.0,
    source: "Claude, indicative",
    reconciledAgainstInvoice: null,
  },
  gemma: {
    inputPerM: 0.1,
    outputPerM: 0.2,
    source: "Gemma, indicative",
    reconciledAgainstInvoice: null,
  },
};

export interface SpendInput {
  engine: string;
  inputTokens?: number;
  outputTokens?: number;
  /** What the provider said this cost. When present it WINS and the row is
   *  recorded as reported. */
  providerCostUsd?: number;
  /** Calls already made to this engine today, to apply a free allowance. */
  callsSoFarToday?: number;
}

export interface SpendRow {
  engine: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  basis: SpendBasis;
}

/**
 * Pure. One call in, one costed row out.
 *
 * A provider-reported cost is never overridden by the rate table, including
 * when it is zero: DataForSEO refunds the AI Overview surcharge when no
 * overview renders, and a refunded call genuinely cost nothing.
 */
export function costOfCall(c: SpendInput): SpendRow {
  const inTok = Math.max(0, c.inputTokens ?? 0);
  const outTok = Math.max(0, c.outputTokens ?? 0);

  if (typeof c.providerCostUsd === "number" && Number.isFinite(c.providerCostUsd)) {
    return {
      engine: c.engine,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: round6(Math.max(0, c.providerCostUsd)),
      basis: "reported",
    };
  }

  const rate = RATES[c.engine];
  if (!rate) {
    return { engine: c.engine, inputTokens: inTok, outputTokens: outTok, costUsd: 0, basis: "estimated" };
  }

  let cost = (inTok / 1_000_000) * rate.inputPerM + (outTok / 1_000_000) * rate.outputPerM;

  if (rate.perCall) {
    const free = rate.freeCallsPerDay ?? 0;
    const withinFree = (c.callsSoFarToday ?? 0) < free;
    if (!withinFree) cost += rate.perCall;
  }

  return { engine: c.engine, inputTokens: inTok, outputTokens: outTok, costUsd: round6(cost), basis: "estimated" };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** True when every provider contributing to a total has been checked against a
 *  real bill. Until then a total must be labelled indicative wherever shown. */
export function totalsAreReconciled(engines: string[]): boolean {
  return engines.every((e) => RATES[e]?.reconciledAgainstInvoice != null);
}

/**
 * Write one costed row. Never throws: spend accounting must not be able to
 * fail a measurement. A lost row understates the total, which is visible as a
 * number that does not match a bill. A thrown error would lose the measurement
 * itself, which is the product.
 */
export async function recordSpend(
  env: { DB: D1Database },
  engine: string,
  usage: { inputTokens?: number; outputTokens?: number; providerCostUsd?: number } | undefined,
  keywordId: number | null,
  nowSecs: number,
  callsSoFarToday?: number,
): Promise<void> {
  try {
    const row = costOfCall({
      engine,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      providerCostUsd: usage?.providerCostUsd,
      callsSoFarToday,
    });
    await env.DB.prepare(
      `INSERT INTO engine_spend (engine, run_at, keyword_id, input_tokens, output_tokens, cost_usd, basis)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(row.engine, nowSecs, keywordId, row.inputTokens, row.outputTokens, row.costUsd, row.basis).run();
  } catch (e) {
    console.log(`[engine-spend] failed to record ${engine}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export interface SpendTotal {
  engine: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** True only when every row in this total was provider-reported. */
  allReported: boolean;
}

/** Spend per engine over the last `days`. */
export async function spendByEngine(
  env: { DB: D1Database },
  days = 30,
): Promise<SpendTotal[]> {
  const rows = (await env.DB.prepare(
    `SELECT engine,
            COUNT(*)                                            AS calls,
            COALESCE(SUM(input_tokens), 0)                      AS inputTokens,
            COALESCE(SUM(output_tokens), 0)                     AS outputTokens,
            COALESCE(SUM(cost_usd), 0)                          AS costUsd,
            SUM(CASE WHEN basis = 'reported' THEN 1 ELSE 0 END) AS reportedRows
       FROM engine_spend
      WHERE run_at >= strftime('%s','now') - ? * 86400
      GROUP BY engine
      ORDER BY costUsd DESC`,
  ).bind(days).all<SpendTotal & { reportedRows: number }>()).results ?? [];
  return rows.map((r) => ({
    engine: r.engine,
    calls: r.calls,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: Math.round(r.costUsd * 100) / 100,
    allReported: r.reportedRows === r.calls,
  }));
}
