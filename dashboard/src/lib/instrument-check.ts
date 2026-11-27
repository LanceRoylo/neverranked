/**
 * Daily instrument probe — which model version is each AI surface ACTUALLY
 * serving today, and did it change?
 *
 * WHY: the engines change models without notice, which is the premise of the
 * whole product. Twice in August 2026 a surface changed instrument under us
 * (gpt-4o-mini-search-preview began 404ing 2026-08-21; Perplexity retires
 * Sonar 2026-09-27). A client's number moving the same week an engine swaps
 * instruments is unattributable without a dated record — the referee is
 * guessing, and the optimisation vendor claims the win.
 *
 * DESIGN: one tiny call per engine per day, recording the model version the
 * RESPONSE reports (not what we requested — verified live: requesting
 * "gpt-5-search-api" returns "gpt-5-search-api-2025-10-14"). Deliberately a
 * separate probe rather than capture inside the measurement path: the runner
 * has 14 insert sites across two code paths, and this shipped four days
 * before a client launch. The probe touches nothing the measurement uses.
 *
 * Failures record nothing (no row) rather than a sentinel, so a transient
 * probe error cannot masquerade as a version change. The diff compares
 * against the LAST RECORDED version, not literally yesterday, so a gap in
 * probing does not swallow a change.
 *
 * Bing organic and Google AI Overviews are DataForSEO SERP captures with no
 * model identity to report; they are out of scope here (SERP layout changes
 * are a different class of drift).
 *
 * HONEST LIMITS (verified live 2026-08-29): OpenAI reports a true dated
 * snapshot (gpt-5-search-api-2025-10-14) — the strongest signal. Anthropic
 * echoes the dated ID requested, so a swap requires a visible ID change.
 * Perplexity echoes the "perplexity/sonar" ALIAS, so a silent backend swap
 * under that alias will NOT show here; the Sonar retirement (2026-09-27)
 * will manifest as probe failures instead, which also alarm.
 */
import type { Env } from "../types";
import { resolveGemmaProvider } from "../citations";
import { createAlertIfFresh } from "../admin-alerts";

/** version === null means the probe RAN and FAILED. That is a signal, not
 *  an absence: it is how a dead key, a retired model or an exhausted spend
 *  limit shows up here. It must never be silently discarded. */
export type ProbeResult = {
  engine: string;
  version: string | null;
  /** Why it failed, in words safe to store. Set only when version is null. */
  failure?: string;
  /** The provider was busy or timed out, as opposed to refusing us. */
  transient?: boolean;
};

const TIMEOUT_MS = 30_000;

/** Google answered this probe with 503s on three nights running at the moment
 *  the sweep started, while the sweep on the same key and model collected 58
 *  of 63. One wait and one more try tells a busy provider from a dead key. */
const RETRY_WAIT_MS = 5_000;

type Posted = { json: Record<string, unknown> | null; failure?: string; transient?: boolean };

/** Provider error text can echo the request, and Gemini's key is in the URL. */
const scrub = (t: string) => t.replace(/key=[^&\s"']+/g, "key=***").replace(/\s+/g, " ").trim().slice(0, 160);

async function attempt(url: string, headers: Record<string, string>, body: unknown): Promise<Posted> {
  const host = new URL(url).host;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) {
      const failure = `HTTP ${resp.status}: ${scrub(await resp.text())}`;
      console.log(`[instrument-probe] ${host} -> ${failure}`);
      return { json: null, failure, transient: resp.status >= 500 };
    }
    return { json: (await resp.json()) as Record<string, unknown> };
  } catch (e) {
    const failure = `no response: ${scrub(e instanceof Error ? e.message : String(e))}`;
    console.log(`[instrument-probe] ${host} ${failure}`);
    return { json: null, failure, transient: true };
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, retryWaitMs: number): Promise<Posted> {
  const first = await attempt(url, headers, body);
  if (!first.transient) return first;
  await new Promise((r) => setTimeout(r, retryWaitMs));
  const second = await attempt(url, headers, body);
  return second.failure ? { ...second, failure: `${second.failure} (after one retry)` } : second;
}

/** The result of a probe, reading its version from the named field. */
function read(engine: string, r: Posted, field: string): ProbeResult {
  const v = r.json?.[field];
  if (typeof v === "string") return { engine, version: v };
  return { engine, version: null, failure: r.failure ?? `answered with no ${field} field`, transient: r.transient ?? false };
}

/** Minimal probes. Prompts are one word and outputs capped tiny: the point
 *  is the `model` field in the response envelope, not the answer.
 *
 *  EXPORTED for the on-demand route (/admin/health/run-live-probe). This
 *  function makes the calls and NOTHING ELSE: no rows, no alerts, no version
 *  diffing. That separation is the reason it is safe to run by hand at any
 *  time -- checkInstrumentVersions() owns every side effect.
 *
 *  It exists as a route because on 2026-09-12 the OpenAI balance hit zero and
 *  there was no way to confirm the fix short of waiting ~23h for the next
 *  06:00 UTC sweep. The engine health check reads D1 only, so it can report a
 *  stale verdict with total confidence. A live call is the only thing that
 *  answers "is this surface actually reachable right now". */
export async function probeAll(env: Env, retryWaitMs = RETRY_WAIT_MS): Promise<ProbeResult[]> {
  const probes: Promise<ProbeResult>[] = [];

  if (env.OPENAI_API_KEY) {
    probes.push(post("https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      // No token cap. NOT because the model rejects max_tokens -- the runner
      // in citations.ts sends max_tokens: 1024 to this same model and gets
      // rows back. The probe's failures were rate-limiting: it used to run
      // immediately AFTER the sweep dispatched, inside the 80,000 TPM burst,
      // so it was 429d like everything else. It now runs BEFORE the sweep.
      // Dropping the cap just removes one variable from a call whose only
      // job is to read the `model` field off the envelope.
      { model: "gpt-5-search-api", messages: [{ role: "user", content: "hi" }] },
      retryWaitMs,
    ).then((r) => read("openai", r, "model")));
  }

  if (env.ANTHROPIC_API_KEY) {
    probes.push(post("https://api.anthropic.com/v1/messages",
      { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      { model: "claude-haiku-4-5-20251001", max_tokens: 8, messages: [{ role: "user", content: "hi" }] },
      retryWaitMs,
    ).then((r) => read("anthropic", r, "model")));
  }

  if (env.PERPLEXITY_API_KEY) {
    probes.push(post("https://api.perplexity.ai/v1/agent",
      { Authorization: `Bearer ${env.PERPLEXITY_API_KEY}` },
      { model: "perplexity/sonar", input: "hi", max_output_tokens: 16 },
      retryWaitMs,
    ).then((r) => read("perplexity", r, "model")));
  }

  if (env.GEMINI_API_KEY) {
    probes.push(post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {},
      { contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 8 } },
      retryWaitMs,
    ).then((r) => read("gemini", r, "modelVersion")));
  }

  // Host comes from the SAME resolver the runner uses. This block used to
  // hardcode the Together endpoint, so the moment DEEPINFRA_API_KEY takes over
  // (Together deprecation, 2026-09-15) the probe would have kept calling a dead
  // host and reported gemma as down while measurement ran fine. The comment
  // below already warned about model drift; host drift is the same failure.
  const gemmaProvider = resolveGemmaProvider(env);
  if (gemmaProvider) {
    probes.push(post(gemmaProvider.endpoint,
      { Authorization: `Bearer ${gemmaProvider.apiKey}` },
      // Keep in lockstep with GEMMA_MODEL in citations.ts — probing a
      // different model than the runner measures would record the wrong
      // instrument.
      { model: "google/gemma-4-31B-it", max_tokens: 8, messages: [{ role: "user", content: "hi" }] },
      retryWaitMs,
    ).then((r) => read("gemma", r, "model")));
  }

  return Promise.all(probes);
}

/** The alert's words. A busy provider and a refusal send the reader to
 *  different places, and the text used to call every failure a refusal. The
 *  leading "No response from:" is parsed by alert-autoclose. */
export function probeFailureDetail(failures: ProbeResult[]): string {
  const names = failures.map((f) => f.engine).join(", ");
  const reasons = failures.map((f) => `${f.engine}: ${f.failure ?? "no reason recorded"}.`).join(" ");
  const meaning = failures.every((f) => f.transient)
    ? `Each failure was the provider being busy or timing out, not a refusal, so on its own this does not point at a key or credit problem. Check whether last night's rows landed for ${failures.length === 1 ? "this surface" : "these surfaces"} before acting.`
    : `At least one was a refusal, which usually means a dead or rotated key, a retired model id, an exhausted credit balance, or a monthly spend or rate limit. Measurement there is very likely degraded right now, and a client readout covering today will omit it from the grid and question movement.`;
  return `No response from: ${names}. ${reasons} ${meaning}`;
}

export async function checkInstrumentVersions(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const now = Math.floor(Date.now() / 1000);
  const all = await probeAll(env);
  const results = all.filter((r): r is { engine: string; version: string } => r.version !== null);
  const failures = all.filter((r) => r.version === null);
  const failed = failures.map((r) => r.engine);

  // A probe that fails writes no row, so the ABSENCE of a row is the finding.
  // On 2026-08-30 openai was the only surface missing from instrument_versions
  // while it was serving a quarter of its normal volume, and nothing said so.
  if (failed.length) {
    const detail = probeFailureDetail(failures);
    console.log(`[instrument-probe] FAILED: ${detail}`);
    await createAlertIfFresh(env, {
      clientSlug: "_system",
      type: "instrument_probe_failed",
      title: `Instrument probe got no answer from ${failed.join(", ")}`,
      detail,
      windowHours: 12,
    });
  }

  for (const { engine, version } of results) {
    // Last RECORDED version for this engine, from any prior day.
    const prev = await env.DB.prepare(
      `SELECT model_version, day FROM instrument_versions
        WHERE engine = ? AND day < ? ORDER BY day DESC LIMIT 1`,
    ).bind(engine, today).first<{ model_version: string; day: string }>();

    await env.DB.prepare(
      `INSERT INTO instrument_versions (day, engine, model_version, checked_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (day, engine) DO UPDATE SET model_version = excluded.model_version, checked_at = excluded.checked_at`,
    ).bind(today, engine, version, now).run();

    if (prev && prev.model_version !== version) {
      const title = `INSTRUMENT CHANGE: ${engine} model version changed`;
      const detail =
        `${engine} served "${version}" today; last recorded was "${prev.model_version}" on ${prev.day}. ` +
        `Any client comparison spanning this boundary crosses an instrument change on this surface and must be ` +
        `labeled as such (see AMENDMENT-01-COVERING-NOTE for the standing language). This is the event the ` +
        `methodology changelog records.`;
      console.log(`[instrument-change] ${detail}`);
      await createAlertIfFresh(env, {
        clientSlug: "_system",
        type: "instrument_change",
        title,
        detail,
        windowHours: 24,
      });
    } else if (!prev) {
      console.log(`[instrument-probe] ${engine}: first recording, version "${version}"`);
    }
  }

  console.log(`[instrument-probe] recorded ${results.length} engine version(s) for ${today}; ${failed.length} failed.`);
}
