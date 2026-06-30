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

STRUCTURE (markdown, in this order):
1. A short title line as an H2 (## ...), e.g. "## June 2026: what moved".
2. A one or two sentence opening addressed to the customer's primary contact by first name if provided, else no name.
3. "### Where you stand" : rank in cohort, citation share, and the change since last period if this is not the first memo.
4. "### What you own" : the questions or framings where the customer is cited most. Name them with their percentages.
5. "### Where you are invisible" (first memo) or "### What moved" (later memos): the weak questions and notable deltas. Be specific with numbers. For later memos, lead with what changed since last month.
6. "### The punch list, in priority order" : a proposed, numbered, prioritized list of interventions, each tied to a specific measured gap. Open this section by stating plainly that this is the proposed order and that prioritization is Lance's call. Keep to 2 to 4 items. Each item names the gap it addresses.
7. "### Where AI looks" : the off-site sources AI pulls its category answers from. State the source-type mix (independent web, review directories, and the like, with their shares) and name the top third-party hosts the customer should aim to be cited on. Frame this as where the leverage is, not a promise, and note that the customer or their agency works this list while we map it. If no off-site data is provided, omit this section entirely.
8. "### One engine note" : if any engine is a notable outlier (very high or very low share), note it. Frame low-data or ambiguous engine behavior as "watching, not prescribing." If nothing stands out, keep this to one sentence or omit.
9. "### What I am watching next month" : 2 to 3 specific things, tied to the punch list.
10. Close with a short line reminding the customer they can ask Atlas about the numbers between memos, and that Atlas reports data while this memo handles what to do. Sign as "Lance".

HONESTY GUARDRAILS:
- Never promise a lift or a result. Measure, do not predict.
- Never claim causation. State correlation as correlation.
- If the data is thin or a window is short, say so plainly rather than over-reading it.

OUTPUT FORMAT:
Return ONLY a JSON object, no prose around it:
{"title": "<short title, e.g. June 2026: what moved>", "body_markdown": "<the full memo in markdown, starting with the ## title line>"}`;

export interface MemoDraftResult {
  ok: boolean;
  memoId?: number;
  title?: string;
  toneViolations?: string[];
  unverifiedNumbers?: string[];
  error?: string;
}

// Build the allowed-number set from inputs for the fabrication guard.
function allowedNumberSet(inp: MemoInputs): Set<string> {
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
  for (const m of inp.cohort.members) add(m.mentions);
  for (const e of inp.by_engine) { add(e.current_share_pct); add(e.prior_share_pct); add(Math.abs(e.delta_pp)); add(e.current_runs); }
  for (const qn of inp.by_question) { add(qn.current_pct); add(qn.prior_pct); add(Math.abs(qn.delta_pp)); add(qn.current_runs); }
  for (const st of inp.offsite.source_types) add(st.share_pct);
  for (const h of inp.offsite.hosts) add(h.share_pct);
  return s;
}

// Numbers that are always safe regardless of data: small counts/ordinals,
// 7 engines, day-of-month and years for dates.
function isSafeNumber(tok: string): boolean {
  const n = Number(tok);
  if (Number.isNaN(n)) return false;
  if (Number.isInteger(n) && n >= 0 && n <= 31) return true; // ordinals, days, small counts
  if (Number.isInteger(n) && n >= 2024 && n <= 2030) return true; // years
  return false;
}

// Extract numeric tokens from the draft and flag any specific number that
// is neither in the allowed set nor trivially safe.
function findUnverifiedNumbers(body: string, allowed: Set<string>): string[] {
  // Strip thousands separators so "2,346" reads as one number, not "2"
  // and "346". Without this, every comma-formatted figure trips a false
  // positive on its tail segment.
  const normalized = body.replace(/(\d),(\d{3})\b/g, "$1$2");
  const tokens = normalized.match(/\d+(?:\.\d+)?/g) ?? [];
  const bad = new Set<string>();
  for (const t of tokens) {
    if (allowed.has(t)) continue;
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
      max_tokens: 2500,
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
    const unverified = findUnverifiedNumbers(parsed.body_markdown, allowedNumberSet(inputs));

    // Save as DRAFT (delivered_at NULL). Flag metadata is stored in the
    // title prefix is avoided; instead we return it for the review UI.
    const res = await env.DB.prepare(
      `INSERT INTO monthly_memos (client_slug, month_key, title, body_markdown, delivered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, unixepoch(), unixepoch())
       ON CONFLICT(client_slug, month_key) DO UPDATE SET
         title = excluded.title,
         body_markdown = excluded.body_markdown,
         updated_at = excluded.updated_at
       WHERE monthly_memos.delivered_at IS NULL`
    ).bind(slug, monthKey, parsed.title, parsed.body_markdown).run();

    // Fetch the id (the upsert may have updated an existing draft).
    const row = await env.DB.prepare(
      `SELECT id FROM monthly_memos WHERE client_slug = ? AND month_key = ?`
    ).bind(slug, monthKey).first<{ id: number }>();

    return {
      ok: true,
      memoId: row?.id,
      title: parsed.title,
      toneViolations: toneViolations.length ? toneViolations : undefined,
      unverifiedNumbers: unverified.length ? unverified : undefined,
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
): Promise<{ unverifiedNumbers: string[]; toneViolations: string[] }> {
  const inputs = await gatherMemoInputs(env, slug, now);
  const tone = checkHumanTone(body, "customer-email");
  const toneViolations = tone.violations.filter((v) => v.severity === "block").map((v) => `${v.pattern}: ${v.match}`);
  const unverifiedNumbers = findUnverifiedNumbers(body, allowedNumberSet(inputs));
  return { unverifiedNumbers, toneViolations };
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
