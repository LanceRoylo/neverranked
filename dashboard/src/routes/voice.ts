/**
 * Dashboard -- /voice/:clientSlug route
 *
 * Where the client uploads writing samples and sees their voice fingerprint.
 * Samples feed the drafting pipeline: when the system generates a draft for
 * this client, it reads the fingerprint and matches the client's existing
 * voice.
 *
 * Phase 1: upload + list samples, stub the fingerprint with "awaiting first
 * compute" copy. The extractor lands in phase 2.
 */

import type { Env, User, VoiceSample, VoiceFingerprint, VoiceFingerprintData } from "../types";
import { layout, html, esc, redirect } from "../render";
import { canAccessClient } from "../agency";
import { buildGlossary } from "../glossary";

export async function handleVoicePage(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  const samples = (await env.DB.prepare(
    "SELECT id, title, source_url, body, word_count, created_at FROM voice_samples WHERE client_slug = ? ORDER BY created_at DESC"
  ).bind(clientSlug).all<Pick<VoiceSample, "id" | "title" | "source_url" | "body" | "word_count" | "created_at">>()).results;

  const fp = await env.DB.prepare(
    "SELECT fingerprint_json, sample_count, total_word_count, computed_at, model FROM voice_fingerprints WHERE client_slug = ?"
  ).bind(clientSlug).first<VoiceFingerprint>();

  let fpData: VoiceFingerprintData | null = null;
  if (fp?.fingerprint_json) {
    try { fpData = JSON.parse(fp.fingerprint_json) as VoiceFingerprintData; } catch { fpData = null; }
  }

  const totalWords = samples.reduce((s, r) => s + (r.word_count || 0), 0);
  const recommendedMinWords = 2000;
  const coverageLabel = totalWords >= recommendedMinWords
    ? `${totalWords.toLocaleString()} words uploaded. Enough signal to extract a reliable voice fingerprint.`
    : `${totalWords.toLocaleString()} of ${recommendedMinWords.toLocaleString()} words uploaded. Add more samples to sharpen the voice match.`;

  const fingerprintCard = fpData
    ? `
      <div class="card">
        <div class="label" style="margin-bottom:10px">Your voice fingerprint</div>
        <div style="font-size:13px;color:var(--text-soft);line-height:1.7;margin-bottom:14px;max-width:780px">
          ${esc(fpData.summary || "Fingerprint computed. See details below.")}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:8px">
          ${fpData.tone ? `<div><div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">Tone</div><div style="font-size:12px;color:var(--text)">${fpData.tone.map(t => esc(t)).join(", ")}</div></div>` : ""}
          ${fpData.sentence_length ? `<div><div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">Sentences</div><div style="font-size:12px;color:var(--text)">${esc(fpData.sentence_length)}</div></div>` : ""}
          ${fpData.vocabulary_notes ? `<div><div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">Vocabulary</div><div style="font-size:12px;color:var(--text)">${fpData.vocabulary_notes.map(t => esc(t)).join("<br>")}</div></div>` : ""}
          ${fpData.forbidden_patterns ? `<div><div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">Avoid</div><div style="font-size:12px;color:var(--text)">${fpData.forbidden_patterns.map(t => esc(t)).join(", ")}</div></div>` : ""}
        </div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:18px">
          Computed ${new Date((fp!.computed_at) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })} &middot; from ${fp!.sample_count} sample${fp!.sample_count === 1 ? "" : "s"} (${fp!.total_word_count.toLocaleString()} words)
        </div>
      </div>
    `
    : `
      <div class="card" style="border:1px solid var(--gold-dim)">
        <div class="label" style="margin-bottom:10px;color:var(--gold)">Voice engine coming online</div>
        <div style="font-size:13px;color:var(--text-soft);line-height:1.7;max-width:720px">
          Your fingerprint will be computed once the first draft is requested, or when your admin runs the "Compute fingerprint" action (Phase 2 of this feature rolls out shortly). In the meantime, upload as many representative samples as you can. Blog posts, service pages, case studies, emails, podcast transcripts, anything that sounds like you when you write.
        </div>
      </div>
    `;

  const samplesList = samples.length === 0
    ? `
      <div style="padding:24px 28px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <h3 style="margin-bottom:8px;font-style:italic">No samples uploaded yet</h3>
        <p style="color:var(--text-faint);font-size:13px;line-height:1.7;margin:0;max-width:640px">
          Start with three or four pieces of your best existing writing. Paste the full text below and give each one a short title. The voice engine uses these as the ground truth for what "sounds like you."
        </p>
      </div>
    `
    : samples.map(s => `
        <div style="padding:16px 18px;background:var(--bg-edge);border:1px solid var(--line);border-radius:4px;margin-bottom:10px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin-bottom:6px">
            <div style="font-size:14px;color:var(--text);font-weight:500">${esc(s.title || "Untitled sample")}</div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);white-space:nowrap">${s.word_count.toLocaleString()} words</div>
          </div>
          ${s.source_url ? `<div style="font-size:11px;color:var(--text-faint);margin-bottom:8px"><a href="${esc(s.source_url)}" target="_blank" rel="noopener" style="color:var(--gold-dim)">${esc(s.source_url)}</a></div>` : ""}
          <div style="font-size:12px;color:var(--text-soft);line-height:1.6;max-height:6em;overflow:hidden;position:relative">
            ${esc(s.body.slice(0, 520))}${s.body.length > 520 ? "\u2026" : ""}
          </div>
          <form method="POST" action="/voice/${esc(clientSlug)}/sample/${s.id}/delete" style="margin-top:10px" onsubmit="return confirm('Remove this sample from the voice fingerprint? This cannot be undone.')">
            <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:10px">Remove</button>
          </form>
        </div>
    `).join("");

  const body = `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px"><a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}</div>
      <h1>Your <em>voice</em></h1>
    </div>

    <!-- What this page does -->
    <div style="margin-bottom:28px;padding:16px 20px;background:var(--bg-lift);border-left:2px solid var(--gold-dim);border-radius:0 3px 3px 0">
      <div class="label" style="margin-bottom:8px;color:var(--gold)">\u00a7 Why this matters</div>
      <div style="font-size:12px;color:var(--text-soft);line-height:1.7;max-width:820px">
        Content drafts sound like AI unless someone teaches them how you write. Upload samples of your real writing here and the drafting engine uses them as ground truth for every article, FAQ, or landing page it generates for you. More samples = better match. The voice score on every draft tells you how close it came.
      </div>
    </div>

    ${fingerprintCard}

    <!-- Coverage summary -->
    <div style="margin:24px 0 12px;font-size:12px;color:var(--text-soft);line-height:1.6;max-width:720px">
      ${coverageLabel}
    </div>

    <!-- Upload form -->
    <div class="card" style="margin-bottom:32px">
      <div class="label" style="margin-bottom:12px">Add a sample</div>
      <form method="POST" action="/voice/${esc(clientSlug)}/sample" style="display:flex;flex-direction:column;gap:12px">
        <input type="text" name="title" placeholder="Sample title (e.g. 'Blog post: why we stopped doing cold outreach')" style="padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px" required>
        <input type="url" name="source_url" placeholder="Source URL (optional, e.g. the live URL of this piece)" style="padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
        <textarea name="body" placeholder="Paste the full text of the piece. Longer is better. Aim for at least 500 words per sample." rows="12" style="padding:12px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;line-height:1.6;border-radius:3px;resize:vertical" required></textarea>
        <div style="display:flex;gap:12px;align-items:center">
          <button type="submit" class="btn">Save sample</button>
          <span style="font-size:11px;color:var(--text-faint)">Stored only for your client slug. Nothing leaves your account.</span>
        </div>
      </form>
    </div>

    <!-- Samples list -->
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:12px">Samples (${samples.length})</div>
      ${samplesList}
    </div>

    ${buildGlossary()}
  `;

  return html(layout("Voice", body, user, clientSlug));
}

// ---------- POST handlers ----------

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function handleVoiceSampleCreate(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  const form = await request.formData();
  const title = ((form.get("title") as string) || "").trim() || null;
  const sourceUrl = ((form.get("source_url") as string) || "").trim() || null;
  const bodyText = ((form.get("body") as string) || "").trim();

  if (!bodyText) {
    return redirect(`/voice/${encodeURIComponent(clientSlug)}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const words = countWords(bodyText);

  await env.DB.prepare(
    `INSERT INTO voice_samples (client_slug, title, source_url, body, word_count, uploaded_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(clientSlug, title, sourceUrl, bodyText, words, user.id, now, now).run();

  return redirect(`/voice/${encodeURIComponent(clientSlug)}`);
}

export async function handleVoiceSampleDelete(clientSlug: string, sampleId: number, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  await env.DB.prepare(
    "DELETE FROM voice_samples WHERE id = ? AND client_slug = ?"
  ).bind(sampleId, clientSlug).run();
  return redirect(`/voice/${encodeURIComponent(clientSlug)}`);
}
