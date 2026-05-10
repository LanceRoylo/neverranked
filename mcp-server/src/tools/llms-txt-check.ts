/**
 * llms_txt_check tool — audits a site's /llms.txt against the
 * NeverRanked scoring rubric.
 *
 * Logic mirrors scripts/llms-txt-check.mjs in the NeverRanked repo.
 * Standard at https://neverranked.com/standards/llms-txt.
 */

interface Finding {
  ok: boolean;
  msg: string;
}

interface LlmsTxtResult {
  url: string;
  llms_txt_url: string;
  present: boolean;
  score: number;
  grade: string;
  findings: Finding[];
  flags: string[];
  attribution: string;
  standard_url: string;
}

export async function llmsTxtCheck(args: { url: string }): Promise<LlmsTxtResult> {
  const baseUrl = String(args.url || "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("url is required");
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error(
      `url must include the protocol. Got: "${baseUrl}". Try "https://${baseUrl.replace(/^[a-z]+:\/*/, "")}" instead.`,
    );
  }

  const llmsUrl = `${baseUrl}/llms.txt`;
  const fullUrl = `${baseUrl}/llms-full.txt`;

  const findings: Finding[] = [];
  const flags: string[] = [];
  let score = 0;
  let body = "";
  let lastModified: string | null = null;
  let present = false;

  // 1. Presence (30 pts) — 404 is a valid-and-expected output state
  // (not an error), so we catch network errors but treat any HTTP
  // response as data.
  let main: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      main = await fetch(llmsUrl, { redirect: "follow", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    const msg = isAbort
      ? `llms.txt fetch timed out after 30s for ${llmsUrl}. Site may be down. Retry, or try a different URL.`
      : `llms.txt fetch could not reach ${baseUrl}. Network error: ${err instanceof Error ? err.message : String(err)}. Confirm the URL is reachable.`;
    console.error("[neverranked/mcp]", "llms_txt_check", "network-error", llmsUrl, err);
    throw new Error(msg);
  }

  if (main.ok) {
    body = await main.text();
    if (body.trim().length > 0) {
      present = true;
      score += 30;
      findings.push({ ok: true, msg: "llms.txt is present and serves content" });
      lastModified = main.headers.get("last-modified");
    }
  }
  if (!present) {
    findings.push({ ok: false, msg: `llms.txt missing or empty (status ${main.status})` });
  }

  if (present) {
    // 2. H1 (10 pts)
    const h1 = body.match(/^#\s+(.+)$/m);
    if (h1 && h1[1].trim().length > 0) {
      score += 10;
      findings.push({ ok: true, msg: `H1 present: "${h1[1].trim()}"` });
    } else {
      findings.push({ ok: false, msg: "No H1 detected (required by spec)" });
    }

    // 3. Blockquote description (10 pts)
    const blockquote = body.match(/^>\s+(.+)$/m);
    if (blockquote && blockquote[1].trim().length >= 20) {
      score += 10;
      findings.push({ ok: true, msg: "Blockquote description present" });
    } else {
      findings.push({ ok: false, msg: "No blockquote description, or too short" });
    }

    // 4. H2 sections (10 pts)
    const h2s = [...body.matchAll(/^##\s+(.+)$/gm)];
    if (h2s.length >= 1) {
      score += 10;
      findings.push({ ok: true, msg: `${h2s.length} H2 section(s) found` });
    } else {
      findings.push({ ok: false, msg: "No H2 sections — links are uncategorized" });
    }

    // 5. Link count (10 pts)
    const links = [...body.matchAll(/^\s*-\s*\[([^\]]+)\]\(([^)]+)\)/gm)];
    const linkCount = links.length;
    if (linkCount >= 5 && linkCount <= 30) {
      score += 10;
      findings.push({ ok: true, msg: `${linkCount} curated links (in healthy range)` });
    } else if (linkCount > 30) {
      flags.push(`Sitemap-style: ${linkCount} links (curation lost above ~30)`);
      findings.push({ ok: false, msg: `${linkCount} links — likely auto-generated, no points` });
    } else {
      findings.push({ ok: false, msg: `Only ${linkCount} links (too sparse)` });
    }

    // 6. Link health (up to 20 pts, sample of 10)
    const sample = links.slice(0, 10).map((m) => m[2]);
    let healthy = 0;
    for (const u of sample) {
      try {
        const r = await fetch(u, { method: "HEAD", redirect: "follow" });
        if (r.ok) healthy++;
        if (/[?&](utm_|gclid=|fbclid=|ref=)/i.test(u)) {
          flags.push(`Tracking params in URL: ${u}`);
        }
        try {
          const parsed = new URL(u);
          const baseHost = new URL(baseUrl).host;
          if (parsed.host !== baseHost && !parsed.host.endsWith(`.${baseHost}`)) {
            flags.push(`External or mismatched host: ${u}`);
          }
        } catch {}
      } catch {}
    }
    const linkScore = sample.length > 0 ? Math.round((healthy / sample.length) * 20) : 0;
    score += linkScore;
    findings.push({
      ok: healthy === sample.length,
      msg: `${healthy} of ${sample.length} sampled links return 200 OK`,
    });

    // 7. llms-full.txt (5 pts)
    try {
      const full = await fetch(fullUrl, { method: "HEAD", redirect: "follow" });
      if (full.ok) {
        score += 5;
        findings.push({ ok: true, msg: "llms-full.txt also present (bonus)" });
      } else {
        findings.push({ ok: false, msg: "llms-full.txt not deployed (optional)" });
      }
    } catch {
      findings.push({ ok: false, msg: "llms-full.txt could not be fetched" });
    }

    // 8. Freshness (5 pts)
    if (lastModified) {
      const ageDays = (Date.now() - new Date(lastModified).getTime()) / 86400000;
      if (ageDays <= 90) {
        score += 5;
        findings.push({ ok: true, msg: `Last-Modified ${Math.round(ageDays)}d ago — fresh` });
      } else if (ageDays > 180) {
        flags.push(`Stale: last modified ${Math.round(ageDays)} days ago`);
        findings.push({ ok: false, msg: `Last-Modified ${Math.round(ageDays)}d ago — stale` });
      } else {
        findings.push({ ok: false, msg: `Last-Modified ${Math.round(ageDays)}d ago — getting stale` });
      }
    } else {
      findings.push({ ok: false, msg: "No Last-Modified header — cannot assess freshness" });
    }
  }

  return {
    url: baseUrl,
    llms_txt_url: llmsUrl,
    present,
    score,
    grade: score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F",
    findings,
    flags,
    attribution: "Powered by NeverRanked. https://neverranked.com",
    standard_url: "https://neverranked.com/standards/llms-txt",
  };
}
