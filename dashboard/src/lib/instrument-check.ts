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

type ProbeResult = { engine: string; version: string } | null;

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
      { model: "gpt-5-search-api", messages: [{ role: "user", content: "hi" }], max_tokens: 16 },
    ).then((r) => (typeof r?.model === "string" ? { engine: "openai", version: r.model } : null)));
  }

  if (env.ANTHROPIC_API_KEY) {
    probes.push(post("https://api.anthropic.com/v1/messages",
      { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      { model: "claude-haiku-4-5-20251001", max_tokens: 8, messages: [{ role: "user", content: "hi" }] },
    ).then((r) => (typeof r?.model === "string" ? { engine: "anthropic", version: r.model } : null)));
  }

  if (env.PERPLEXITY_API_KEY) {
    probes.push(post("https://api.perplexity.ai/v1/agent",
      { Authorization: `Bearer ${env.PERPLEXITY_API_KEY}` },
      { model: "perplexity/sonar", input: "hi", max_output_tokens: 16 },
    ).then((r) => (typeof r?.model === "string" ? { engine: "perplexity", version: r.model } : null)));
  }

  if (env.GEMINI_API_KEY) {
    probes.push(post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {},
      { contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 8 } },
    ).then((r) => (typeof r?.modelVersion === "string" ? { engine: "gemini", version: r.modelVersion } : null)));
  }

  if (env.TOGETHER_API_KEY) {
    probes.push(post("https://api.together.xyz/v1/chat/completions",
      { Authorization: `Bearer ${env.TOGETHER_API_KEY}` },
      // Keep in lockstep with GEMMA_MODEL in citations.ts — probing a
      // different model than the runner measures would record the wrong
      // instrument.
      { model: "google/gemma-4-31B-it", max_tokens: 8, messages: [{ role: "user", content: "hi" }] },
    ).then((r) => (typeof r?.model === "string" ? { engine: "gemma", version: r.model } : null)));
  }

  return Promise.all(probes);
}

export async function checkInstrumentVersions(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const now = Math.floor(Date.now() / 1000);
  const results = (await probeAll(env)).filter((r): r is NonNullable<ProbeResult> => r !== null);

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

  console.log(`[instrument-probe] recorded ${results.length} engine version(s) for ${today}`);
}
