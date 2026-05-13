/**
 * Digest grader.
 *
 * Final check before a Monday digest leaves the building. Pulls a
 * plaintext rendition of the digest body and asks Haiku two questions:
 *
 *   1. VOICE — does this read as human-written, on brand for
 *      NeverRanked / Hello Momentum? No em dashes, no semicolons in
 *      marketing copy, no banned filler ("delve", "in today's
 *      fast-paced", "elevate", three-adjective lists, etc.)
 *   2. SUBSTANCE — is this actually telling the client something, or
 *      is it formulaic filler with empty sections and no useful
 *      signal?
 *
 * Pass: send the email.
 * Fail: hold for review. Log to admin_inbox with the failing axis and
 * reason. Lance can read the digest in the dashboard preview and
 * either fix the data or override-send.
 *
 * The grader is fail-closed: if Haiku is unreachable or returns
 * unparseable output, the digest is held. We never auto-send a digest
 * that we couldn't grade.
 */

import type { Env } from "./types";

const HAIKU_MODEL = "claude-haiku-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

const SYSTEM = `You grade the body of a weekly client digest email for a SaaS company called NeverRanked. NeverRanked tracks how often AI engines (ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, Gemma) cite a client's business in their answers.

Two checks. Both must pass for the digest to ship.

1. VOICE — Reads as written by a real human in the NeverRanked house voice. Fail if you see:
   - Em dashes
   - Semicolons in marketing prose
   - AI-tell phrases: "delve", "in today's fast-paced", "elevate", "robust", "comprehensive", "seamless", "leverage", "in conclusion", "feel free to"
   - Three-adjective lists ("fast, scalable, and reliable")
   - Formulaic openers: "Welcome to", "Nestled in", "Hidden gem", "Rare opportunity"
   - Phrases that sound corporate-templated rather than direct

2. SUBSTANCE — There's actual signal for the reader. Fail if you see:
   - Empty sections rendered as filler ("0 new citations" presented as if it were a win)
   - Numbers that contradict each other within the same digest
   - Sections that say nothing more than the section header
   - A "this week's highlights" section that lists zero highlights
   - Calls-to-action with no underlying action

Return STRICT JSON, no prose:
{
  "verdict": "pass" | "fail",
  "voice_pass": true | false,
  "substance_pass": true | false,
  "issues": ["<short reason 1>", "<short reason 2>"]
}`;

export interface DigestGradeResult {
  verdict: "pass" | "fail";
  voice_pass: boolean;
  substance_pass: boolean;
  issues: string[];
}

/**
 * Grade a digest body. Pass body as plain-rendered text (stripped of
 * HTML tags) for best results -- the grader cares about content, not
 * markup.
 */
export async function gradeDigest(env: Env, plaintextBody: string): Promise<DigestGradeResult> {
  if (!env.ANTHROPIC_API_KEY) {
    // No key, can't grade. Fail-closed.
    return { verdict: "fail", voice_pass: false, substance_pass: false, issues: ["ANTHROPIC_API_KEY not set"] };
  }
  const userMessage = `Digest body to grade:

${plaintextBody.slice(0, 14000)}

Return JSON only.`;

  let raw = "";
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessage }],
        max_tokens: 1200,
        temperature: 0.0,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      return { verdict: "fail", voice_pass: false, substance_pass: false, issues: [`grader API ${resp.status}`] };
    }
    const json = (await resp.json()) as { content: { type: string; text: string }[] };
    raw = json.content?.[0]?.text || "";
  } catch (e) {
    return { verdict: "fail", voice_pass: false, substance_pass: false, issues: [`grader fetch error: ${(e as Error).message}`] };
  }

  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) {
    return { verdict: "fail", voice_pass: false, substance_pass: false, issues: ["grader output unparseable"] };
  }
  try {
    const parsed = JSON.parse(m[0]) as {
      verdict?: string;
      voice_pass?: boolean;
      substance_pass?: boolean;
      issues?: string[];
    };
    return {
      verdict: parsed.verdict === "pass" ? "pass" : "fail",
      voice_pass: Boolean(parsed.voice_pass),
      substance_pass: Boolean(parsed.substance_pass),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    return { verdict: "fail", voice_pass: false, substance_pass: false, issues: ["grader JSON parse error"] };
  }
}

/**
 * Strip HTML so the grader sees the same content the client will see.
 * Cheap text-only version: drop tags, collapse whitespace, decode the
 * three entities the renderer emits.
 */
export function htmlToPlaintext(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
