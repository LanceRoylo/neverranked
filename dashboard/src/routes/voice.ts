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
import { extractVoiceProfile } from "../voice-engine";
import { canUseDraftingFeature } from "../gating";

/**
 * Render the "Amplify-only" upgrade nudge. Shown to clients on Signal or
 * Audit when they land on /voice or /drafts. Admins and agency_admins
 * bypass this entirely because they do the work on clients' behalf.
 */
function renderUpgradeNudge(title: string, clientSlug: string, user: User): string {
  const body = `
    <div style="margin-bottom:24px">
      <div class="label" style="margin-bottom:8px"><a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}</div>
      <h1>${title}</h1>
    </div>

    <div class="card" style="border:1px solid var(--gold-dim);background:linear-gradient(135deg,var(--bg-lift) 0%,rgba(201,168,76,.04) 100%)">
      <div class="label" style="margin-bottom:8px;color:var(--gold)">\u00a7 Amplify tier feature</div>
      <h3 style="font-style:italic;margin-bottom:12px">In-dashboard drafting is an <em style="color:var(--gold)">Amplify</em> tier feature</h3>
      <div style="font-size:13px;color:var(--text-soft);line-height:1.75;max-width:720px;margin-bottom:18px">
        Voice profile and in-dashboard drafting belong to the Amplify retainer. We learn how you write from samples you upload, then draft articles, FAQs, and landing pages that read like you wrote them. Drafts live in the dashboard with editor, version history, voice score, and export. Nothing leaves your account.
      </div>
      <div style="font-size:12px;color:var(--text-faint);line-height:1.6;margin-bottom:20px;max-width:720px">
        Signal clients get the citation tracking, schema work, monthly brief, and roadmap -- everything that identifies where to write. Amplify adds the drafting that turns the roadmap into finished content.
      </div>
      <a href="https://app.neverranked.com/checkout/amplify" class="btn">Upgrade to Amplify</a>
      <a href="mailto:hello@neverranked.com?subject=Amplify%20upgrade%20question" style="margin-left:14px;font-size:12px;color:var(--gold)">Questions first? Email us &rarr;</a>
    </div>

    ${buildGlossary()}
  `;
  return layout(title, body, user, clientSlug);
}

export async function handleVoicePage(clientSlug: string, user: User, env: Env, url?: URL): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  if (!canUseDraftingFeature(user)) {
    return html(renderUpgradeNudge("Voice", clientSlug, user));
  }

  // Error/info banner passed through URL params so the form can tell the
  // user what happened after a fetch attempt. Keeps the handler stateless
  // without a flash session.
  const fetchError = url?.searchParams.get("fetch_error") || "";
  const fetchedOk = url?.searchParams.get("fetched") || "";

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
    ? `${totalWords.toLocaleString()} words uploaded. Enough for us to build a reliable voice profile (a pattern of how you write that drafts are matched against).`
    : `${totalWords.toLocaleString()} of ${recommendedMinWords.toLocaleString()} words uploaded. Add more samples to sharpen how closely drafts sound like you.`;

  const fingerprintCard = fpData
    ? `
      <div class="card">
        <div class="label" style="margin-bottom:4px">Your voice profile</div>
        <div style="font-size:11px;color:var(--text-faint);margin-bottom:12px;max-width:720px;line-height:1.55">
          Summary of how you write, learned from the samples below. Every draft is generated to match this pattern so it reads like you wrote it.
        </div>
        <div style="font-size:13px;color:var(--text-soft);line-height:1.7;margin-bottom:14px;max-width:780px">
          ${esc(fpData.summary || "Profile computed. See details below.")}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:8px">
          ${fpData.tone ? `<div><div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">Tone</div><div style="font-size:12px;color:var(--text)">${fpData.tone.map(t => esc(t)).join(", ")}</div></div>` : ""}
          ${fpData.sentence_length ? `<div><div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">Sentences</div><div style="font-size:12px;color:var(--text)">${esc(fpData.sentence_length)}</div></div>` : ""}
          ${fpData.vocabulary_notes ? `<div><div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">Vocabulary</div><div style="font-size:12px;color:var(--text)">${fpData.vocabulary_notes.map(t => esc(t)).join("<br>")}</div></div>` : ""}
          ${fpData.forbidden_patterns ? `<div><div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">Avoid</div><div style="font-size:12px;color:var(--text)">${fpData.forbidden_patterns.map(t => esc(t)).join(", ")}</div></div>` : ""}
        </div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:18px">
          Built ${new Date((fp!.computed_at) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })} &middot; from ${fp!.sample_count} sample${fp!.sample_count === 1 ? "" : "s"} (${fp!.total_word_count.toLocaleString()} words)
        </div>
      </div>
    `
    : `
      <div class="card" style="border:1px solid var(--gold-dim)">
        <div class="label" style="margin-bottom:4px;color:var(--gold)">Voice profile coming online</div>
        <div style="font-size:11px;color:var(--text-faint);margin-bottom:12px;max-width:720px;line-height:1.55">
          Your profile is a short summary of how you write (tone, rhythm, word choice, what to avoid). We build it from the samples you upload so drafts sound like you and not like AI.
        </div>
        <div style="font-size:13px;color:var(--text-soft);line-height:1.7;max-width:720px">
          Your profile builds automatically once the first draft is requested, or when your admin runs "Build profile" (Phase 2 of this feature rolls out shortly). In the meantime, upload as many representative samples as you can. Blog posts, service pages, case studies, emails, podcast transcripts, anything that sounds like you when you write.
        </div>
      </div>
    `;

  const samplesList = samples.length === 0
    ? `
      <div style="padding:24px 28px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <h3 style="margin-bottom:8px;font-style:italic">No samples uploaded yet</h3>
        <p style="color:var(--text-faint);font-size:13px;line-height:1.7;margin:0;max-width:640px">
          Start with three or four pieces of your best existing writing. Use the form above to paste URLs of published pieces, or expand the fallback to paste text directly. The voice engine uses these as the ground truth for what "sounds like you."
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
          <form method="POST" action="/voice/${esc(clientSlug)}/sample/${s.id}/delete" style="margin-top:10px" onsubmit="return confirm('Remove this sample from the voice profile? This cannot be undone.')">
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
        Content drafts sound like AI unless someone teaches them how you write. Upload samples of your real writing below and we use them to learn your style (tone, rhythm, word choice, things to avoid). Every article, FAQ, or landing page we draft gets matched against that style so it reads like you wrote it. The voice score on each draft tells you how close it came.
      </div>
    </div>

    ${fingerprintCard}

    ${(user.role === "admin" || user.role === "agency_admin") && samples.length > 0 ? `
      <!-- Build/rebuild profile action. Only admins see this button; the
           extraction is LLM-backed and a client triggering it on every
           page load would rack up API costs. -->
      <div style="margin:16px 0 0;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <form method="POST" action="/voice/${esc(clientSlug)}/build" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Building\u2026';">
          <button type="submit" class="btn" title="Reads all samples below and distills them into a voice profile. Uses an Anthropic API call; typically takes 10-25 seconds.">${fpData ? "Rebuild profile" : "Build profile now"}</button>
        </form>
        <span style="font-size:11px;color:var(--text-faint);line-height:1.55;max-width:520px">
          ${fpData
            ? "Rebuilding reads all current samples and replaces the existing profile. Do this whenever you add or remove a meaningful sample."
            : "Builds your voice profile from the samples below. Uses an Anthropic API call so it takes ~15 seconds. Admins only."}
        </span>
      </div>
    ` : ""}

    <!-- Coverage summary -->
    <div style="margin:24px 0 12px;font-size:12px;color:var(--text-soft);line-height:1.6;max-width:720px">
      ${coverageLabel}
    </div>

    <!-- Upload form: URL-primary, paste-fallback. Point us at a URL and
         we fetch, extract the article body, and save. If the piece is
         behind a login, in a PDF, or still a draft, use the paste fallback. -->
    <div class="card" style="margin-bottom:32px">
      <div class="label" style="margin-bottom:4px">Add a sample</div>
      <div style="font-size:11px;color:var(--text-faint);margin-bottom:14px;max-width:680px;line-height:1.55">
        Paste the URL of a piece you've published and we'll fetch it and extract the article body. Works for blog posts, service pages, case studies, anything with a public URL. For drafts or gated content, expand "Or paste the text directly" at the bottom of this card.
      </div>

      ${fetchError ? `
        <div style="margin-bottom:14px;padding:12px 14px;background:rgba(201,106,106,.08);border-left:2px solid var(--red,#c96a6a);border-radius:0 3px 3px 0;font-size:12px;color:var(--text-soft);line-height:1.6">
          ${esc(fetchError)}
        </div>
      ` : ""}
      ${fetchedOk ? `
        <div style="margin-bottom:14px;padding:12px 14px;background:rgba(106,154,106,.08);border-left:2px solid var(--green,#6a9a6a);border-radius:0 3px 3px 0;font-size:12px;color:var(--text-soft);line-height:1.6">
          Fetched and saved. Review the extracted text below and remove the sample if the parsing looks off.
        </div>
      ` : ""}

      <form method="POST" action="/voice/${esc(clientSlug)}/sample" style="display:flex;flex-direction:column;gap:12px">
        <input type="url" name="source_url" placeholder="https://example.com/blog/my-article" style="padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
        <input type="text" name="title" placeholder="Title (optional \u2014 we'll use the page title if blank)" style="padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <button type="submit" name="mode" value="fetch" class="btn">Fetch and save</button>
          <span style="font-size:11px;color:var(--text-faint)">Typically takes 1-3 seconds. We extract the article body and drop navigation, footers, and ads.</span>
        </div>

        <details style="margin-top:10px;border-top:1px solid var(--line);padding-top:14px">
          <summary style="cursor:pointer;font-family:var(--label);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);outline:none">Or paste the text directly</summary>
          <div style="margin-top:12px;font-size:11px;color:var(--text-faint);line-height:1.55;max-width:640px;margin-bottom:10px">
            Use this for drafts, private pages, PDFs, or anywhere we can't reach. If you fill this in, we use the pasted text instead of fetching.
          </div>
          <textarea name="body" placeholder="Paste the full text of the piece. Longer is better \u2014 aim for 500+ words per sample." rows="10" style="width:100%;padding:12px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;line-height:1.6;border-radius:3px;resize:vertical"></textarea>
          <div style="margin-top:10px">
            <button type="submit" name="mode" value="paste" class="btn btn-ghost">Save pasted text</button>
          </div>
        </details>
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

/**
 * Extract the main article text from a fetched HTML document. Intentionally
 * simple and heuristic -- Cloudflare Workers don't have DOMParser and a
 * full Readability port is overkill for this pass. The rules:
 *
 *   1. Strip scripts, styles, noscript, and common non-article chrome
 *      (nav, header, footer, aside, form).
 *   2. Prefer the contents of <article> or <main> if present, else the
 *      full body.
 *   3. Convert block-level closers to double newlines so paragraph breaks
 *      survive the tag strip.
 *   4. Strip remaining tags, decode common HTML entities, collapse
 *      whitespace.
 *
 * Separately pulls the <title> tag (or first <h1>) as the page title so
 * the caller doesn't have to prompt the user for one.
 */
function extractArticleText(htmlDoc: string): { title: string | null; body: string; wordCount: number } {
  const stripped = htmlDoc
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|aside|header|footer|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const articleMatch = stripped.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)
    || stripped.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const articleHtml = articleMatch ? articleMatch[1] : stripped;

  const withBreaks = articleHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article|tr)>/gi, "\n\n");

  const text = withBreaks
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&(rsquo|lsquo);/g, "'")
    .replace(/&(rdquo|ldquo);/g, '"')
    .replace(/&hellip;/g, "...")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  const titleMatch = htmlDoc.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = htmlDoc.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const rawTitle = (titleMatch?.[1] || h1Match?.[1] || "").replace(/<[^>]+>/g, "").trim();
  const title = rawTitle ? rawTitle.replace(/\s+/g, " ").slice(0, 200) : null;

  return { title, body: text, wordCount: countWords(text) };
}

export async function handleVoiceSampleCreate(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  if (!canUseDraftingFeature(user)) {
    return redirect(`/voice/${encodeURIComponent(clientSlug)}`);
  }
  const form = await request.formData();
  const mode = ((form.get("mode") as string) || "fetch").trim();
  const titleInput = ((form.get("title") as string) || "").trim();
  const sourceUrlInput = ((form.get("source_url") as string) || "").trim();
  const bodyText = ((form.get("body") as string) || "").trim();

  const slugPath = encodeURIComponent(clientSlug);
  const errorRedirect = (msg: string) => redirect(`/voice/${slugPath}?fetch_error=${encodeURIComponent(msg)}`);

  // Paste path wins if the user explicitly pasted body text, OR if they
  // submitted the paste button.
  if (mode === "paste" || (mode !== "fetch" && bodyText.length > 0)) {
    if (!bodyText) {
      return errorRedirect("Pasted text is empty. Add some content and try again.");
    }
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO voice_samples (client_slug, title, source_url, body, word_count, uploaded_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      clientSlug,
      titleInput || null,
      sourceUrlInput || null,
      bodyText,
      countWords(bodyText),
      user.id,
      now,
      now
    ).run();
    return redirect(`/voice/${slugPath}?fetched=1`);
  }

  // Fetch path
  if (!sourceUrlInput) {
    return errorRedirect("Add a URL to fetch from, or use the 'paste the text directly' option below.");
  }
  let parsed: URL;
  try {
    parsed = new URL(sourceUrlInput);
  } catch {
    return errorRedirect("That URL doesn't look valid. Include https:// and the full path.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return errorRedirect("URL must start with http:// or https://.");
  }

  let htmlDoc: string;
  try {
    const resp = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NeverRanked-VoiceImporter/1.0; +https://neverranked.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    if (!resp.ok) {
      return errorRedirect(`The site returned HTTP ${resp.status}. Try the 'paste the text directly' option instead.`);
    }
    htmlDoc = await resp.text();
  } catch (e: unknown) {
    const msg = e instanceof Error && e.name === "AbortError"
      ? "Fetch timed out after 12 seconds. The site may be slow or blocking us. Use the paste fallback."
      : "Could not reach that URL. Use the paste fallback.";
    return errorRedirect(msg);
  }

  const extracted = extractArticleText(htmlDoc);
  if (extracted.wordCount < 50) {
    return errorRedirect(
      `Only ${extracted.wordCount} words extracted from that page. It may be behind a paywall, heavily JavaScript-rendered, or not an article page. Try the paste fallback.`
    );
  }

  const finalTitle = titleInput || extracted.title || "Untitled sample";
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO voice_samples (client_slug, title, source_url, body, word_count, uploaded_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    clientSlug,
    finalTitle,
    parsed.toString(),
    extracted.body,
    extracted.wordCount,
    user.id,
    now,
    now
  ).run();

  return redirect(`/voice/${slugPath}?fetched=1`);
}

export async function handleVoiceBuildProfile(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin" && user.role !== "agency_admin") {
    return html(layout("Forbidden", `<div class="empty"><h3>Admins only</h3></div>`, user), 403);
  }
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  const slugPath = encodeURIComponent(clientSlug);
  try {
    await extractVoiceProfile(env, clientSlug);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to build voice profile.";
    return redirect(`/voice/${slugPath}?fetch_error=${encodeURIComponent(msg)}`);
  }
  return redirect(`/voice/${slugPath}?fetched=1`);
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
