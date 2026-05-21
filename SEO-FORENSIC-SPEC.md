# SEO Forensic Module — Build Spec

**Status:** spec, pre-build
**Date:** 2026-05-21
**Owner:** Lance
**Branch in use when this was drafted:** `claude/analyze-aeo-transcript-6nQBR` (this file lives there until merged)

---

## What this document is

A self-contained handoff for the next Claude Code session at the laptop. Goal: extend the existing AEO forensic tool (the public scorer at `check.neverranked.com`, the analyzer package, the dashboard scan) to **also diagnose SEO**, so a single audit returns one combined report covering schema, AEO, and SEO findings — without breaking the ~20 files that consume `red_flags` today.

This file is a feature spec in the NVI-SPEC.md tradition, not a session-handoff doc. `SESSION-HANDOFF-2026-05-18.md` was explicitly the last session handoff; durable decisions go to auto-memory. This is a *build plan*, which is a different category — same shelf as `NVI-SPEC.md` and `EXPLAINER.md`.

---

## Why we're doing this

The product pivoted from "diagnose AND ship the fix" to **forensic-only diagnosis** (see "Pivot evidence" below). The natural next move is broadening what the forensic tool grades.

**Strategic framing:** A common skeptic argument — most recently in the YouTube transcript Lance reviewed on 2026-05-21 — is "AEO is just SEO with a new label." Rather than fight that on the acronym front, we co-opt it: the same forensic grader covers schema, AEO, and SEO in one report, all measured with the same rigor and run on our own domain publicly. Positioning shifts from "AEO grader" to "forensic grader for how AI engines and search engines actually cite you, end to end."

This widens the addressable market without diluting the moat. The moat was never the acronym — it was the schema-completeness math, the 90-day citation tracking, and the publicly verifiable score on our own domain.

---

## Table of contents

1. [Pivot evidence (where the code stands today)](#pivot-evidence)
2. [What we already grade](#what-we-already-grade)
3. [The SEO gap](#the-seo-gap)
4. [Structural decision — typed findings as a parallel field](#structural-decision)
5. [Build plan v1, ordered](#build-plan)
6. [Concrete starter diffs](#starter-diffs)
7. [What NOT to do](#what-not-to-do)
8. [Verification checklist](#verification-checklist)
9. [Open questions for Lance](#open-questions)

---

<a id="pivot-evidence"></a>
## 1. Pivot evidence — the forensic-only direction shipped

Verified in code as of `claude/analyze-aeo-transcript-6nQBR` HEAD:

- `tools/schema-check/src/index.ts` (3,301 lines, serves `check.neverranked.com`) — pure diagnosis. POST `/api/check` fetches a URL, runs `buildReportFollowingSnippets()`, returns a graded `Report`. No write-back, no deploy.
- `admin/src/routes/` — the old `/inject/<slug>` deploy route is no longer present. Recent meta-description work (PR #28, Hawaii Theatre, migration `0096`) ships via the inject snippet that the **customer** loads. NeverRanked reads what's there and scores it; the customer owns the deploy surface.
- `audit-template/` and `remediation-template/` are markdown the agency fills in, not auto-applied patches.
- `dashboard/src/audit-delivery.ts` generates a Claude-drafted advisory report, stores in KV, emails a link. Diagnostic only.

This is the "tell people what needs fixing" posture Lance described. SEO diagnosis fits the same posture.

---

<a id="what-we-already-grade"></a>
## 2. What we already grade (so we don't redo it)

In `packages/aeo-analyzer/src/extract.ts` → `Signals` (see `types.ts`), already extracted and surfaced in the report:

| Signal | Where | Already flagged in `flags.ts`? |
|---|---|---|
| `<title>` length | `signals.title_len` | Yes (30–65 char band) |
| Meta description length | `signals.meta_desc_len` | Yes (80–160 char band) |
| Canonical URL | `signals.canonical` | Yes |
| `robots` meta tag | `signals.robots_meta` | **No — extracted but never scored** |
| `og:title/description/image/type`, Twitter card | `signals.og_*`, `twitter_*` | Partial (og:image only) |
| H1 count + first H1 text | `signals.h1_count`, `h1_first` | Yes |
| Internal vs external link counts | `signals.links_*` | External only |
| Word count | `signals.word_count` | Yes (<300 thin-content flag) |
| Images + missing alt text | `signals.img_count`, `img_no_alt` | Yes |
| JSON-LD parse errors | `signals.jsonld_parse_errors` | Yes |
| Author meta + Person schema | `signals.author_meta`, `has_person_schema` | Via schema-grader |
| Trust-platform outbound links | `signals.trust_profile_links` | Via schema-grader |

A meaningful chunk of "SEO 101" is already in the pipeline. The work below is mostly: score what's already extracted, add a handful of new extractions, and refactor presentation so the report can speak in SEO language as well as AEO language.

---

<a id="the-seo-gap"></a>
## 3. The SEO gap — what's missing

Ordered by effort, easy first:

| Gap | Where it lives now | Lift |
|---|---|---|
| Score `robots_meta` (flag `noindex`, `nofollow`, `none`) | Already in `signals.robots_meta`; not flagged | 3 lines in `flags.ts` |
| Score full Open Graph + Twitter Card coverage | Already in `signals.og_*` / `twitter_*`; only og:image flagged | ~5 lines in `flags.ts` |
| Internal link count flag (`links_internal < 3` = thin internal linking) | Already extracted; not flagged | 2 lines |
| `viewport` meta (mobile-friendly hint) | Not extracted | ~10 lines (extract + flag) |
| HTTPS scheme + HSTS header check | Need response headers exposed to analyzer | small, requires plumbing |
| `robots.txt` fetch + parse | New network call from scorer | 1–2 hours |
| `sitemap.xml` discovery + reachability | New network call | 1–2 hours |
| Core Web Vitals (LCP, INP, CLS) | External — PageSpeed Insights API | half-day, requires API key |
| Redirect chain depth, broken outbound links | Requires per-link fetch | medium (defer to v2) |
| Mixed-content detection | Needs full HTML scan + URL parse | small |

**Defer to v2:** redirect chains, broken-link crawling, JS-rendered content (would require headless browser). These are real SEO concerns but they cross the boundary from "static analysis of one URL" to "site crawl," which is a bigger architectural change.

---

<a id="structural-decision"></a>
## 4. Structural decision — typed findings as a parallel field, not a replacement

**The constraint we discovered:** `red_flags: string[]` is consumed by ~20 files across `dashboard/src/`, `tools/schema-check/src/`, `mcp-server/src/`, and the analyzer package itself. A hot swap is several days of migration with real risk to email templates, the audit narrative, the MCP tool surface, and the share/report routes.

**The decision:** add a typed `findings` field to `Report` *alongside* `red_flags`, not in place of it. New code emits findings; `red_flags` is populated by mapping findings to strings for back-compat. Eventually consumers migrate to `findings` on their own schedule. Until then, nothing breaks.

```ts
// packages/aeo-analyzer/src/types.ts
export type FindingCategory = "schema" | "aeo" | "seo" | "content" | "performance";
export type FindingSeverity = "critical" | "warning" | "info";

export interface Finding {
  /** Stable key, e.g. "seo.robots_noindex" — for dedupe and analytics */
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  /** One-line, human-readable, present-tense */
  message: string;
  /** Optional metric name surfaced in the UI, e.g. "title_len" */
  metric?: string;
  /** Observed value */
  value?: number | string | null;
  /** What "good" looks like, e.g. "30–65 chars" */
  baseline?: string;
  /** Plain-English remediation, ≤140 chars */
  recommendation?: string;
}

export interface Report {
  url: string;
  domain: string;
  signals: Signals;
  schema_coverage: { type: string; present: boolean }[];
  findings: Finding[];      // NEW — typed, all-category
  red_flags: string[];      // KEPT — derived from findings for back-compat
  grade: string;
  aeo_score: number;
  technical_signals: TechnicalSignal[];
}
```

Mapping helper (lives in `flags.ts`):

```ts
export function findingsToRedFlags(findings: Finding[]): string[] {
  return findings
    .filter((f) => f.severity !== "info")
    .map((f) => f.message);
}
```

This costs us almost nothing today and unlocks every downstream improvement: severity-weighted grading, category filters in the dashboard, "SEO findings" vs "AEO findings" tabs in the report, structured email digests, MCP tool returns that an agent can actually reason about.

**Open question for Lance (see §9):** should the new `findings` field also drive the score? Current `calculateAeoScore` in `score.ts` looks at raw signals, not flags. Adding SEO would either (a) keep AEO score as-is and add a separate SEO subscore, or (b) collapse into one weighted "Forensic Score." Recommend (a) for v1 — easier to explain, doesn't disturb existing benchmarks. Decision pending.

---

<a id="build-plan"></a>
## 5. Build plan v1, ordered

Effort estimates are for one Claude Code session at the laptop, assuming green CI and the existing `tsx --test` gate.

### Step 0 — branch + safety
- Confirm working tree clean. Branch off `main` for the build work, separate from `claude/analyze-aeo-transcript-6nQBR` (which holds this spec).
- Name suggestion: `feat/seo-forensic-v1`.

### Step 1 — typed findings infrastructure (½ day)
1. Add `Finding`, `FindingCategory`, `FindingSeverity`, extend `Report` in `packages/aeo-analyzer/src/types.ts`.
2. Rewrite `flags.ts`:
   - Convert each existing flag to a `Finding` with id, category (mostly `aeo` or `content`), severity, metric, baseline, recommendation.
   - Add `findingsToRedFlags()` mapper.
   - Export `generateFindings(signals): Finding[]` as the new primary; keep `generateRedFlags(signals): string[]` as a thin wrapper that calls the new one + the mapper.
3. Update `report.ts` to populate both `findings` and `red_flags` on the `Report`.
4. Add unit tests in `packages/aeo-analyzer/src/__tests__/findings.test.ts`:
   - All existing red_flag conditions still produce a matching Finding.
   - `red_flags` output is byte-identical to pre-refactor for the same input HTML (use one of the existing fixtures).
5. Verify `tsx --test` is green. Do NOT touch consumers yet — back-compat means they keep working.

**Gate:** before moving on, confirm `dashboard/src/scanner.ts`, `dashboard/src/routes/report.ts`, and `tools/schema-check/src/index.ts` all still render reports identically. The whole point of the parallel-field design is that this step ships invisibly.

### Step 2 — score the already-extracted SEO signals (1 hour)
Add these findings in `generateFindings()`:

| id | Trigger | Severity | Message template |
|---|---|---|---|
| `seo.robots_noindex` | `robots_meta` contains `noindex` | critical | "Page has `noindex` directive — will be excluded from search and AI indexes" |
| `seo.robots_nofollow` | `robots_meta` contains `nofollow` (page-level) | warning | "Page-level `nofollow` blocks link equity flow" |
| `seo.og_incomplete` | Any of `og_title`, `og_description`, `og_type` missing | warning | "Open Graph tags incomplete — social and AI preview cards will degrade" |
| `seo.twitter_missing` | `twitter_card` false | info | "No Twitter Card meta — preview rendering on X is suboptimal" |
| `seo.thin_internal_linking` | `links_internal < 3` | warning | "Only N internal links — page is poorly connected within the site" |

This step is the smallest-possible proof that the typed-findings model works for SEO, before adding anything that requires new extraction or network calls.

### Step 3 — extract + score new on-page signals (½ day)
Add to `extract.ts` → `Signals`:
- `viewport_meta: string | null`
- `lang_attr: string | null` (`<html lang="...">`)
- `has_https: boolean` (from the URL itself, not headers)
- `mixed_content_count: number` (http:// URLs in src/href on an https:// page)

Then add findings: `seo.no_viewport`, `seo.no_lang`, `seo.no_https`, `seo.mixed_content`.

### Step 4 — robots.txt + sitemap.xml fetch (1–2 hours)
- New module `packages/aeo-analyzer/src/crawl-prereqs.ts`.
- Fetch `/robots.txt` and `/sitemap.xml` from the URL's origin in parallel.
- Emit findings: `seo.no_robots_txt`, `seo.no_sitemap`, `seo.robots_blocks_url` (parse User-agent: * Disallow: rules against the scanned URL), `seo.sitemap_unreachable`.
- Wire into `buildReportFollowingSnippets()` (async path) only. Sync `buildReport` stays pure HTML — the public scorer at check.neverranked.com keeps its single-URL, no-side-effects guarantee.

### Step 5 — Core Web Vitals via PageSpeed Insights (½–1 day)
- Free Google API: `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=...&category=performance`.
- Key already exists for other GCP work — check Lance's env before generating a new one.
- New module `packages/aeo-analyzer/src/pagespeed.ts`. Emits `performance.lcp_slow`, `performance.inp_slow`, `performance.cls_high`, with the actual numbers as `value`.
- Wire into async path only. Add a cache layer keyed by URL + date (CWV doesn't move minute-to-minute and PSI calls aren't free in latency terms — 5–15s per call).

### Step 6 — surface area updates (½ day)
- `tools/schema-check/src/index.ts`: render findings grouped by category in the UI. Schema findings first, AEO second, SEO third, performance last. Use the existing card styles.
- `dashboard/src/routes/report.ts` and `domain.ts`: add a "SEO findings" tab or section.
- `tools/schema-check/og-image.html`: if a domain gets a high SEO score, surface it. Optional — leave to v2 if running long.

### Step 7 — positioning copy (no code) — defer
- Update check.neverranked.com landing copy: "AEO + SEO forensic grader."
- Update `EXPLAINER.md` Section 1 to mention SEO coverage.
- Hold this until the build is verified. Code first, copy second.

---

<a id="starter-diffs"></a>
## 6. Concrete starter diffs

These are not the full implementation — they're what the laptop session should type first to confirm the design works end-to-end before going wide.

### 6a. Extend `types.ts` (paste-ready)

```ts
// Append to packages/aeo-analyzer/src/types.ts

export type FindingCategory = "schema" | "aeo" | "seo" | "content" | "performance";
export type FindingSeverity = "critical" | "warning" | "info";

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  message: string;
  metric?: string;
  value?: number | string | null;
  baseline?: string;
  recommendation?: string;
}
```

Then in `Report`:

```ts
export interface Report {
  url: string;
  domain: string;
  signals: Signals;
  schema_coverage: { type: string; present: boolean }[];
  findings: Finding[];   // NEW
  red_flags: string[];   // unchanged
  grade: string;
  aeo_score: number;
  technical_signals: TechnicalSignal[];
}
```

### 6b. New shape of `flags.ts`

```ts
import type { Signals, Finding } from "./types";
import { hasSchemaType } from "./hierarchy";

export function generateFindings(signals: Signals): Finding[] {
  const findings: Finding[] = [];

  if (!signals.canonical) {
    findings.push({
      id: "aeo.no_canonical",
      category: "aeo",
      severity: "warning",
      message: "No canonical tag detected -- risk of duplicate content in AI indexes",
      recommendation: "Add <link rel=\"canonical\" href=\"...\"> to the document head",
    });
  }
  // ... port every existing flag the same way ...

  // NEW SEO findings (Step 2):
  if (signals.robots_meta && /noindex/i.test(signals.robots_meta)) {
    findings.push({
      id: "seo.robots_noindex",
      category: "seo",
      severity: "critical",
      message: "Page has `noindex` directive -- will be excluded from search and AI indexes",
      metric: "robots_meta",
      value: signals.robots_meta,
      recommendation: "Remove `noindex` from the robots meta tag unless this page is intentionally hidden",
    });
  }
  // ... etc

  return findings;
}

export function findingsToRedFlags(findings: Finding[]): string[] {
  return findings
    .filter((f) => f.severity !== "info")
    .map((f) => f.message);
}

// Back-compat shim. Keeps every existing consumer working.
export function generateRedFlags(signals: Signals): string[] {
  return findingsToRedFlags(generateFindings(signals));
}
```

### 6c. Wire into `report.ts`

```ts
const findings = generateFindings(signals);
const redFlags = findingsToRedFlags(findings);
// ... rest unchanged

return {
  url,
  domain,
  signals,
  schema_coverage: schemaCoverage,
  findings,         // NEW
  red_flags: redFlags,
  grade,
  aeo_score: aeoScore,
  technical_signals: technicalSignals,
};
```

### 6d. The test that proves nothing broke

```ts
// packages/aeo-analyzer/src/__tests__/findings.test.ts
import { test } from "node:test";
import assert from "node:assert";
import { generateFindings, generateRedFlags, findingsToRedFlags } from "../flags";

test("generateRedFlags output matches findings-derived output", () => {
  // Use the same fixture the existing tests use; if there isn't one,
  // construct a minimal Signals object covering all existing flag paths.
  const signals = /* ... */;
  const findings = generateFindings(signals);
  const viaFindings = findingsToRedFlags(findings);
  const direct = generateRedFlags(signals);
  assert.deepStrictEqual(direct, viaFindings);
});

test("findings have stable ids and required fields", () => {
  const findings = generateFindings(/* fixture */);
  for (const f of findings) {
    assert.match(f.id, /^[a-z]+\.[a-z_]+$/, `bad id: ${f.id}`);
    assert.ok(["schema","aeo","seo","content","performance"].includes(f.category));
    assert.ok(["critical","warning","info"].includes(f.severity));
    assert.ok(f.message.length > 0);
  }
});
```

---

<a id="what-not-to-do"></a>
## 7. What NOT to do

- **Do not refactor `red_flags` consumers in Step 1.** The whole point of the parallel field is that consumers migrate later, individually. A 20-file refactor inside a feature add is how you ship a regression to email templates and the audit PDF in the same week.
- **Do not change `calculateAeoScore` weights.** SEO gets a separate subscore (Step 5 or later). Touching AEO weights changes every historical benchmark on every tracked client, and we can't explain that to customers mid-flight.
- **Do not add a headless browser** for JS-rendered content. That's a different product category. If a SaaS app needs JS-rendered analysis, that's a paid integration tier later.
- **Do not skip the back-compat test in §6d.** It is the entire safety case for the parallel-field design.
- **Do not deploy schema or content to client sites from this work.** The pivot is explicitly forensic-only. SEO findings are advisory output. Customer ships fixes (or we do, as a separate, gated engagement).
- **Do not commit a PageSpeed API key.** Use environment variables; verify `.gitignore` and `_headers` before pushing.

---

<a id="verification-checklist"></a>
## 8. Verification checklist

Before merging Step 1:
- [ ] `npm test` (or `tsx --test`) green in `packages/aeo-analyzer/`.
- [ ] Manually scan one URL via `tools/schema-check` locally; confirm the rendered report is visually identical to pre-refactor.
- [ ] `dashboard/src/scanner.ts` runs against a fixture and produces an unchanged `red_flags` array.
- [ ] No diff in `dist/` output that isn't a deterministic rebuild.

Before merging the full Step 2–4 SEO module:
- [ ] Run the public scorer against `neverranked.com` and at least one client domain. Confirm new SEO findings appear, grouped by category.
- [ ] Confirm `aeo_score` is unchanged on a domain that had a known score before the change.
- [ ] Confirm the dashboard scan, the share route, and the email digest all render without runtime errors against a Report that now has both `findings` and `red_flags`.
- [ ] Update `state-of-aeo` generator if it surfaces findings — check it doesn't crash on the new field.

---

<a id="open-questions"></a>
## 9. Open questions for Lance

1. **Score model.** Separate AEO score + SEO score + (later) Performance score, all shown side by side? Or one composite Forensic Score? Recommend separate-then-composite-later. Decision needed before Step 5.
2. **Public surface naming.** Is the public scorer renamed (`check.neverranked.com` → "Forensic Grader") or does the URL stay and the copy expand? Pure positioning, no code dependency.
3. **Tier impact.** Does SEO diagnosis live in the free `check.neverranked.com` tier, or is it Signal-tier-only? Recommend: keep the free tier as-is, expand the *paid* dashboard to include SEO. Free tier stays the wedge, paid tier widens.
4. **YouTube/Reddit findings.** The 2026-05-11 State of AEO report shows YouTube as the most-cited third-party source. Worth a future `aeo.absent_from_youtube` finding ("brand has no YouTube presence — top citation source")? Probably v2, but flagging now so we don't forget.
5. **Robots.txt parser scope.** Full directive parser, or just "does the file exist + is the scanned URL blocked"? Recommend the simpler version for v1.

---

## Appendix — file paths to know

- `packages/aeo-analyzer/src/types.ts` — `Signals`, `Report`, `TechnicalSignal` definitions
- `packages/aeo-analyzer/src/extract.ts` — HTML → Signals
- `packages/aeo-analyzer/src/flags.ts` — Signals → string[] today, → Finding[] after Step 1
- `packages/aeo-analyzer/src/score.ts` — Signals → score (untouched by v1)
- `packages/aeo-analyzer/src/report.ts` — composes everything
- `packages/aeo-analyzer/src/schema-grader.ts` — per-block schema completeness
- `packages/aeo-analyzer/src/hierarchy.ts` — schema.org subtype matching
- `tools/schema-check/src/index.ts` — public scorer worker (check.neverranked.com)
- `dashboard/src/scanner.ts` — weekly cron scan
- `dashboard/src/audit-delivery.ts` — Claude-drafted audit narrative
- `EXPLAINER.md` — current positioning, update in Step 7
- `NVI-SPEC.md` — the three-layer scoring chain (schema-grader → AEO Readiness → AI Presence). SEO subscore would slot alongside AEO Readiness.

---

*End of spec. The laptop session should read this top to bottom, then start with §6a and §6d in parallel — type the new type, then write the test that proves the back-compat path works, then port `flags.ts` until the test passes.*
