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
import { createAlertIfFresh } from "../admin-alerts";

/** version === null means the probe RAN and FAILED. That is a signal, not
 *  an absence: it is how a dead key, a retired model or an exhausted spend
 *  limit shows up here. It must never be silently discarded. */
type ProbeResult = { engine: string; version: string | null };

const TIMEOUT_MS = 30_000;

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.log(`[instrument-probe] ${url} -> HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      return null;
    }
    return (await resp.json()) as Record<string, unknown>;
  } catch (e) {
    console.log(`[instrument-probe] ${url} threw: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Minimal probes. Prompts are one word and outputs capped tiny: the point
 *  is the `model` field in the response envelope, not the answer. */
async function probeAll(env: Env): Promise<ProbeResult[]> {
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
    ).then((r) => ({ engine: "openai", version: typeof r?.model === "string" ? r.model : null })));
  }

  if (env.ANTHROPIC_API_KEY) {
    probes.push(post("https://api.anthropic.com/v1/messages",
      { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      { model: "claude-haiku-4-5-20251001", max_tokens: 8, messages: [{ role: "user", content: "hi" }] },
    ).then((r) => ({ engine: "anthropic", version: typeof r?.model === "string" ? r.model : null })));
  }

  if (env.PERPLEXITY_API_KEY) {
    probes.push(post("https://api.perplexity.ai/v1/agent",
      { Authorization: `Bearer ${env.PERPLEXITY_API_KEY}` },
      { model: "perplexity/sonar", input: "hi", max_output_tokens: 16 },
    ).then((r) => ({ engine: "perplexity", version: typeof r?.model === "string" ? r.model : null })));
  }

  if (env.GEMINI_API_KEY) {
    probes.push(post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {},
      { contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 8 } },
    ).then((r) => ({ engine: "gemini", version: typeof r?.modelVersion === "string" ? r.modelVersion : null })));
  }

  if (env.TOGETHER_API_KEY) {
    probes.push(post("https://api.together.xyz/v1/chat/completions",
      { Authorization: `Bearer ${env.TOGETHER_API_KEY}` },
      // Keep in lockstep with GEMMA_MODEL in citations.ts — probing a
      // different model than the runner measures would record the wrong
      // instrument.
      { model: "google/gemma-4-31B-it", max_tokens: 8, messages: [{ role: "user", content: "hi" }] },
    ).then((r) => ({ engine: "gemma", version: typeof r?.model === "string" ? r.model : null })));
  }

  return Promise.all(probes);
}

export async function checkInstrumentVersions(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const now = Math.floor(Date.now() / 1000);
  const all = await probeAll(env);
  const results = all.filter((r): r is { engine: string; version: string } => r.version !== null);
  const failed = all.filter((r) => r.version === null).map((r) => r.engine);

  // A probe that fails writes no row, so the ABSENCE of a row is the finding.
  // On 2026-08-30 openai was the only surface missing from instrument_versions
  // while it was serving a quarter of its normal volume, and nothing said so.
  if (failed.length) {
    const detail =
      `No response from: ${failed.join(", ")}. The probe is one tiny call per engine, so a failure here means the ` +
      `API refused us -- dead or rotated key, retired model id, exhausted credit balance, or a monthly spend / rate ` +
      `limit reached. Measurement on ${failed.length === 1 ? "this surface" : "these surfaces"} is very likely ` +
      `degraded right now, and a client readout covering today will omit it from the grid and question movement.`;
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
