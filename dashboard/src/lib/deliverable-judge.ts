/**
 * deliverable-judge.ts — gate 3: the editorial-quality ship gate.
 *
 * Runs AFTER the deterministic gates (number-traceability + house voice). Two
 * independent layers, by design:
 *
 *   judge  : "Would Lance ship this draft to a paying customer as-is?" Grounded
 *            on lance_decisions (his revealed approve/edit/reject standard).
 *            Anthropic Opus 4.8 (his best-taste model).
 *   verify : runs ONLY on a "ship" verdict. An adversarial skeptic on a DIFFERENT
 *            provider (OpenAI gpt-4o) whose only job is to find the strongest
 *            reason NOT to ship. Different weights, different failure modes, so
 *            the verify is real and not the judge re-grading itself.
 *
 * Asymmetry is the point: the only dangerous verdict is "ship" (a false escalate
 * costs Lance 30 seconds; a false ship puts a weak deliverable in front of a
 * paying customer), so only "ship" gets the second look.
 *
 * BOOTS IN SHADOW (escalate-everything): effective_action is always "escalate"
 * for now. The verdict is still computed and stored (would_ship = what the gate
 * WOULD do live) so the graduation tracker can measure the gate against Lance's
 * real later decisions. Nothing ships autonomously until graduation flips it.
 */
import type { Env } from "../types";
import { recentDecisions } from "./decision-log";
import { gradeWithLLM } from "./qa-llm-grader";

const JUDGE_MODEL = "claude-opus-4-8";
// Upgraded 2026-07-01 from claude-sonnet-4-5 to claude-sonnet-5 (a strict
// improvement over 4.5, confirmed live on our key). The judge falls back to this
// if the primary is unavailable, so the gate never goes dark; the verdict records
// when it fell back. Sonnet 5 defaults to adaptive thinking, so callJudgeModel
// disables thinking to keep the short JSON verdict inside max_tokens.
const JUDGE_FALLBACK_MODEL = "claude-sonnet-5";
const VERIFY_MODEL = "gpt-4o";

// A cheap, deterministic hash of a drafted body. The graduation tracker
// compares this (captured at gate time) to the body Lance actually delivers,
// to tell "shipped as-is" (true agreement) from "shipped after edits".
// Whitespace-normalized so trivial reflowing does not read as an edit. Not a
// security hash, just change detection.
export function hashDraft(s: string): string {
  const norm = (s || "").replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export interface DeliverableVerdict {
  judge_verdict: "ship" | "escalate";
  judge_confidence: "high" | "medium" | "low";
  judge_reasons: string[];
  verifier_objected: boolean | null; // null when the judge escalated (verify skipped)
  verifier_reason: string | null;
  would_ship: boolean; // what the gate WOULD do live (judge=ship AND verifier did not object)
  effective_action: "ship" | "escalate";
  mode: "shadow" | "live";
}

export interface GateArgs {
  artifactType: string; // "monthly_memo" | "readout"
  artifactId?: number | null;
  clientSlug?: string | null;
  factsJson: string;
  draftMarkdown: string;
}

// One judge call against a specific model. Returns the parsed verdict, or an
// error string so the caller can fall back and surface WHY the model failed
// (instead of silently returning "judge layer unavailable").
async function callJudgeModel(
  key: string, model: string, system: string, user: string,
): Promise<{ verdict: "ship" | "escalate"; confidence: "high" | "medium" | "low"; reasons: string[] } | { error: string }> {
  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      // No temperature: Opus 4.8 AND claude-sonnet-5 both reject it ("deprecated
      // for this model", HTTP 400). thinking disabled so Sonnet 5's default
      // adaptive thinking cannot consume the 700-token budget before the JSON
      // verdict (Opus 4.8 accepts disabled too, so both models stay consistent).
      body: JSON.stringify({ model, max_tokens: 700, thinking: { type: "disabled" }, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    return { error: `${model}: fetch failed (${String(e).slice(0, 100)})` };
  }
  if (!resp.ok) {
    const b = await resp.text().catch(() => "");
    return { error: `${model}: HTTP ${resp.status} ${b.slice(0, 160)}` };
  }
  let text = "";
  try {
    const data = (await resp.json()) as { content?: Array<{ text?: string }> };
    text = (data.content?.map((b) => b.text || "").join("") || "").trim();
  } catch {
    return { error: `${model}: unreadable response body` };
  }
  try {
    const m = text.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(m ? m[0] : text) as { verdict?: string; confidence?: string; reasons?: unknown };
    const verdict = obj.verdict === "ship" ? "ship" : "escalate";
    const confidence = (["high", "medium", "low"] as const).includes(obj.confidence as "high") ? (obj.confidence as "high" | "medium" | "low") : "low";
    const reasons = Array.isArray(obj.reasons) ? obj.reasons.map(String).slice(0, 5) : [];
    return { verdict, confidence, reasons };
  } catch {
    return { error: `${model}: unparseable verdict` };
  }
}

// ── the judge: Anthropic Opus 4.8, grounded on lance_decisions ──────
async function runJudge(
  env: Env,
  args: GateArgs,
): Promise<{ verdict: "ship" | "escalate"; confidence: "high" | "medium" | "low"; reasons: string[] } | { error: string }> {
  const key = (env as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY;
  if (!key) return { error: "ANTHROPIC_API_KEY missing" };

  const decisions = await recentDecisions(env, { artifactType: args.artifactType, limit: 25 }).catch(() => []);
  const examples = decisions.length
    ? decisions
        .map((d) => `- [${d.decision_kind}] ${d.prior_state ?? "?"} -> ${d.new_state ?? "?"}${d.note ? `  note: ${d.note.slice(0, 200)}` : ""}`)
        .join("\n")
    : "(no prior decisions on this artifact type yet, so lean conservative and escalate when unsure)";

  const system = `You are the ship gate for NeverRanked's customer deliverables, standing in for Lance Roylo's editorial judgment. Decide whether Lance would ship the draft below to a paying customer AS-IS, or whether he would pull it back to edit first.

You are NOT checking numbers or banned punctuation. Separate deterministic gates already guarantee every number traces to the data and the voice rules hold. Your job is EDITORIAL QUALITY:
- Does it lead with the single most action-worthy finding (the largest fixable gap or movement), not a victory lap?
- Does every interpretation follow from the facts, with no over-reading or invented causation?
- Is the punch list specific, prioritized, and doable, not generic advice that fits any business?
- Does it read like a sharp analyst who respects a busy executive's time?

Be conservative. When in doubt, escalate. A false escalate costs Lance 30 seconds. A false ship puts a weak deliverable in front of a paying customer with his name on it.

Return ONLY a JSON object, no prose: {"verdict":"ship"|"escalate","confidence":"high"|"medium"|"low","reasons":["short reason", "..."]}.`;

  const user = `LANCE'S RECENT DECISIONS on ${args.artifactType} (his revealed standard for what ships vs what he edits or rejects):
${examples}

FACTS (the measured data behind this draft):
${args.factsJson.slice(0, 4000)}

DRAFT to judge:
${args.draftMarkdown.slice(0, 8000)}

Would Lance ship this as-is? Return only the JSON verdict.`;

  // Try the primary judge model, then the fallback. Capture the primary error
  // so a degraded verdict stays transparent about which model actually judged.
  const models = [JUDGE_MODEL, JUDGE_FALLBACK_MODEL];
  const errors: string[] = [];
  for (let i = 0; i < models.length; i++) {
    const r = await callJudgeModel(key, models[i], system, user);
    if ("verdict" in r) {
      if (i > 0) {
        console.warn(`deliverable judge fell back to ${models[i]}; primary error: ${errors[0] ?? "?"}`);
        r.reasons = [...r.reasons, `[judged by fallback ${models[i]}; primary unavailable: ${errors[0] ?? "unknown"}]`].slice(0, 6);
      }
      return r;
    }
    errors.push(r.error);
  }
  console.warn(`deliverable judge unavailable across all models: ${errors.join(" | ")}`);
  return { error: errors.join(" | ").slice(0, 400) };
}

// ── the verifier: OpenAI gpt-4o, adversarial, only on a "ship" verdict ──
async function runVerify(env: Env, args: GateArgs): Promise<{ objected: boolean; reason: string; available: boolean }> {
  const system = `You are an independent skeptic verifying a customer deliverable that a first judge already approved for shipping. Your ONLY job is to find the single strongest reason this draft should NOT go to a paying customer as-is.

Look for: a claim that does not follow from the FACTS, a headline that buries the real lede, a punch-list item generic enough to fit any business (it fails the swap test), a section that restates numbers without interpreting them, hedging that dodges the finding.

You are NOT checking banned punctuation or whether numbers trace to the data. Separate gates handle those. If you find a real, specific problem, object. If the draft is genuinely sound, do not manufacture an objection.

Return ONLY JSON: {"objected": true|false, "reason": "the single strongest problem, or empty if none"}.`;
  const user = `FACTS:
${args.factsJson.slice(0, 4000)}

DRAFT (a first judge approved this for shipping):
${args.draftMarkdown.slice(0, 8000)}

Find the strongest reason NOT to ship, or confirm it is sound.`;

  const r = await gradeWithLLM<{ objected: boolean; reason: string }>(env, {
    systemPrompt: system,
    userPrompt: user,
    model: VERIFY_MODEL,
    maxTokens: 400,
    responseSchema: {
      type: "object",
      additionalProperties: false,
      properties: { objected: { type: "boolean" }, reason: { type: "string" } },
      required: ["objected", "reason"],
    },
  });
  // If verify is unavailable (API error), report available:false so the caller
  // never counts a failed verify as a clean pass. A missing verify must not
  // read as "did not object" — that would let an unverified draft record as a
  // would_ship and contaminate the graduation signal (and, live, auto-ship).
  if (!r.ok || !r.parsed) return { objected: false, reason: "", available: false };
  return { objected: !!r.parsed.objected, reason: String(r.parsed.reason || ""), available: true };
}

// ── the gate ────────────────────────────────────────────────────────
export async function gateDeliverable(env: Env, args: GateArgs): Promise<DeliverableVerdict> {
  const judge = await runJudge(env, args);
  // Judge unavailable -> fail safe to escalate, and record the ACTUAL error in
  // the reason (visible in the verdict row) instead of a generic "unavailable".
  const jv = "verdict" in judge
    ? judge
    : { verdict: "escalate" as const, confidence: "low" as const, reasons: [`judge unavailable: ${judge.error}`.slice(0, 400)] };

  let verifier_objected: boolean | null = null;
  let verifier_reason: string | null = null;
  let verifyCleared = false; // the verifier actually ran AND did not object
  if (jv.verdict === "ship") {
    const v = await runVerify(env, args);
    if (v.available) {
      verifier_objected = v.objected;
      verifier_reason = v.reason || null;
      verifyCleared = !v.objected;
    } else {
      // Verify could not run: record objection as unknown (null), do NOT clear.
      verifier_objected = null;
      verifier_reason = "verifier unavailable";
      verifyCleared = false;
    }
  }

  // What the gate WOULD do live: ship only if the judge approved AND the
  // verifier actually ran and did not object. A missing/failed verify never
  // counts as a clear, so it never records a would_ship.
  const would_ship = jv.verdict === "ship" && verifyCleared;

  const verdict: DeliverableVerdict = {
    judge_verdict: jv.verdict,
    judge_confidence: jv.confidence,
    judge_reasons: jv.reasons,
    verifier_objected,
    verifier_reason,
    would_ship,
    effective_action: "escalate", // shadow: nothing auto-ships yet
    mode: "shadow",
  };

  // Best-effort durable store for the graduation tracker (Phase 2). No-op if the
  // migration has not been applied yet; the verdict is still returned + surfaced.
  try {
    await env.DB.prepare(
      `INSERT INTO deliverable_verdicts
         (artifact_type, artifact_id, client_slug, judge_verdict, judge_confidence, judge_reasons,
          verifier_objected, verifier_reason, would_ship, effective_action, mode, draft_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        args.artifactType,
        args.artifactId ?? null,
        args.clientSlug ?? null,
        jv.verdict,
        jv.confidence,
        JSON.stringify(jv.reasons),
        verifier_objected === null ? null : verifier_objected ? 1 : 0,
        verifier_reason,
        would_ship ? 1 : 0,
        "escalate",
        "shadow",
        hashDraft(args.draftMarkdown),
      )
      .run();
  } catch {
    /* table not migrated yet, or write failed; verdict still returned */
  }

  return verdict;
}
