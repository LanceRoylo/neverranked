#!/usr/bin/env node
'use strict';

/**
 * scripts/audit-generate.mjs
 *
 * NeverRanked audit auto-populator.
 *
 * Takes a target URL (or an outreach prospect ID), runs the technical
 * scan via scripts/run-audit.py, then calls Claude to populate the
 * audit-template/*.md sections with specific findings derived from the
 * scan data. Output lands in audits/<slug>/ ready for review.
 *
 * V1 scope (~auto, ~30 min review):
 *   ✓ 02-technical-audit.md   (auto-populated from scan)
 *   ✓ 03-schema-review.md     (auto-populated from scan, with ready-to-paste JSON-LD)
 *   ✓ 07-roadmap.md           (auto-populated, synthesizes prior sections)
 *   ✓ 00-executive-summary.md (auto-populated last, references others)
 *   ⌛ 04-keyword-gap.md      (template with TODO markers — needs market intel)
 *   ⌛ 05-ai-citations.md     (template with TODO markers — needs live citation queries)
 *   ⌛ 06-competitor-teardown (template with TODO markers — needs competitor list)
 *
 * Phase 2 will fill in 04/05/06 once the citation-tracking pipeline
 * and competitor inference layers exist.
 *
 * Usage:
 *   node scripts/audit-generate.mjs --url=https://drakerep.com --client=drake-real-estate
 *   node scripts/audit-generate.mjs --prospect-id=192             # pulls URL + client from outreach DB
 *   node scripts/audit-generate.mjs --url=... --client=... --skip-scan   # reuse existing raw/intake-report.json
 *
 * Output: audits/<client>/00-executive-summary.md, 02-...07-roadmap.md, raw/intake-report.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).flatMap(a => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [[m[1], m[2] ?? true]] : [];
  })
);

const SKIP_SCAN = !!args['skip-scan'];
const DELIVERY_EMAIL_ONLY = !!args['delivery-email-only'];
const PDF = !!args['pdf'];

// ---------------------------------------------------------------------------
// Resolve client info
// ---------------------------------------------------------------------------

function resolveClient() {
  if (args['prospect-id']) {
    // Pull from neverranked-outreach DB
    const outreachRoot = resolve(REPO_ROOT, '..', 'neverranked-outreach');
    if (!existsSync(join(outreachRoot, 'lib', 'db.js'))) {
      throw new Error(`Cannot find neverranked-outreach repo at ${outreachRoot}`);
    }
    const id = parseInt(args['prospect-id'], 10);
    const out = execSync(
      `cd "${outreachRoot}" && node -e "
        const raw = require('./lib/db').getDb();
        const p = raw.prepare(\\"SELECT id, brokerage_name, broker_name, email, market, vertical, listing_url, notes FROM prospects WHERE id = ?\\").get(${id});
        if (!p) { console.error('No prospect with id ${id}'); process.exit(1); }
        console.log(JSON.stringify(p));
      "`,
      { encoding: 'utf8' }
    );
    const p = JSON.parse(out);
    const slug = (p.brokerage_name || `prospect-${id}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return {
      slug,
      url: p.listing_url,
      name: p.brokerage_name,
      contact: p.broker_name,
      email: p.email,
      market: p.market,
      vertical: p.vertical,
      notes: (() => { try { return JSON.parse(p.notes || '{}'); } catch { return {}; } })(),
      prospect_id: id,
    };
  }

  if (!args.url || !args.client) {
    throw new Error('Required: --url=<url> --client=<slug>  OR  --prospect-id=<id>');
  }
  return {
    slug: args.client,
    url: args.url,
    name: args.name || args.client,
    contact: args.contact || null,
    email: null,
    market: args.market || null,
    vertical: args.vertical || 'unknown',
    notes: {},
    prospect_id: null,
  };
}

// ---------------------------------------------------------------------------
// Claude API client
// ---------------------------------------------------------------------------

function getClaudeApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  // Fallback: outreach repo's config.json
  const outreachConfig = resolve(REPO_ROOT, '..', 'neverranked-outreach', 'config.json');
  if (existsSync(outreachConfig)) {
    const cfg = JSON.parse(readFileSync(outreachConfig, 'utf8'));
    if (cfg.anthropic_api_key) return cfg.anthropic_api_key;
  }
  throw new Error('ANTHROPIC_API_KEY not set and no fallback found');
}

const MODEL = 'claude-sonnet-4-5-20250929';

function callClaude(prompt, maxTokens = 4000) {
  const apiKey = getClaudeApiKey();
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });

  return new Promise((resolveP, rejectP) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) return rejectP(new Error(`Claude: ${parsed.error.message || JSON.stringify(parsed.error)}`));
          resolveP(parsed.content?.[0]?.text || '');
        } catch (e) {
          rejectP(new Error('Bad JSON from Claude: ' + raw.slice(0, 200)));
        }
      });
    });
    req.on('error', rejectP);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Section generators
// ---------------------------------------------------------------------------

const VOICE_RULES = `
VOICE RULES (NEVER VIOLATE):
- No em dashes anywhere ("—" or "--"). Use periods, commas, or parentheses instead.
- No semicolons in prose. Use periods.
- No banned words: transform, leverage, seamless, cutting-edge, revolutionize, empower, unlock, hidden gem, synergy, robust.
- No filler openers: "In today's world", "In an era of", "Welcome to", "We help you", "We're excited to", "Hope this helps".
- Specific over generic. Name the schema type, the page URL, the actual gap. Not "various improvements."
- Numbers wherever possible. "12 of 25 sampled pages missing canonical" beats "many pages have issues."
- Write like Lance Roylo: direct, founder-voice, first-person plural for NeverRanked ("we", "our scan").
- Style: editorial, not corporate. Reads like a thoughtful peer review, not a SaaS auto-report.

THE CLARITY PRINCIPLE (canonical NR operating rule, codified in
content/operating-principles.md):

The reader is a small business owner with VARIABLE technical depth.
Some are tech-comfortable founders, some have never edited a meta tag
in their life. Write so BOTH can act. Use the three-layer pattern on
every finding that requires the customer to ship the change:

  Layer 1 (the headline): Plain English + business outcome.
    Lead with what the change is and why it matters. NO jargon.
    NO schema-spec terms in the first sentence.
    Example: "Add social preview cards to your website pages.
    Right now when your site is shared on LinkedIn or referenced
    by ChatGPT, the preview is blank. With this fix every share
    shows a proper image and title."

  Layer 2 (how to actually do it): Platform-specific guidance.
    If you can infer the customer's stack from the scan
    (WordPress signals, Webflow signals, Squarespace, Wix, etc.),
    name the specific path. If not, give the four most common
    paths AS BULLETS, plus a code snippet for custom-coded sites.
    Example:
      - WordPress (Yoast or Rank Math): Settings -> Social -> upload default image
      - Squarespace: Settings -> Marketing -> SEO -> enable preview image
      - Webflow: Page Settings -> Open Graph -> upload image
      - Wix: SEO Tools -> Social Share -> upload image
      - Custom-coded: paste this in <head>: <meta property="og:image" content="...">

  Layer 3 (technical detail for dev/agency): Schema specs, property
    names, validation tools. Available, never in the way. Place
    AFTER Layer 1 and Layer 2 in the document order.

Apply the three-layer pattern automatically when a finding requires
the customer to ship a change. Schema deployment items handled by
NR's snippet do NOT need Layer 2 (NR ships them). Items the customer
ships always need all three layers.

ANTI-PATTERNS THAT MUST NEVER APPEAR (these violate the Clarity Principle):
- "Address it to remove the penalty" (vague, untranslated)
- A finding that names a schema type without saying what it does
- Code blocks with no preceding plain-English sentence explaining what they do
- Tables of "missing X / missing Y" without a "what to do about it" column
- The phrase "structured data" without a 5-word inline gloss the first
  time it appears in any deliverable
`.trim();

function buildSectionPrompt(sectionName, templateContent, scanData, client, extraGuidance = '') {
  return `You are populating a NeverRanked client audit section. Replace every {placeholder} block in the template below with specific findings derived from the scan data. Keep all section headers, tables, code blocks, and structure intact. Only fill the {placeholders}.

${VOICE_RULES}

CLIENT CONTEXT:
- Business: ${client.name}
- Domain: ${client.url}
- Contact: ${client.contact || 'unknown'}
- Market: ${client.market || 'unknown'}
- Vertical: ${client.vertical}
- Apollo industry tag: ${client.notes?.industry || 'unknown'}
- Title (if known): ${client.notes?.title || 'unknown'}
- Employee count (if known): ${client.notes?.employee_count || 'unknown'}

If the title + employee count signals B2B vendor (technical role, small headcount), treat the audit accordingly: schema gaps that matter are SoftwareApplication, Service, Organization, FAQPage. NOT LocalBusiness. Buyer queries are "best [product category] for [their buyer persona]," not "best [industry] in [city]."

SCAN DATA (intake-report.json):
\`\`\`json
${JSON.stringify(scanData, null, 2).slice(0, 12000)}
\`\`\`

${extraGuidance}

TEMPLATE TO POPULATE:
\`\`\`markdown
${templateContent}
\`\`\`

Return ONLY the populated markdown. No preamble, no explanation. Keep all headers and structure intact. Replace every {placeholder}.`;
}

async function writeDeliveryEmail(client, auditDir, execSum, roadmap, tech, schema) {
  const deliveryPrompt = `You are drafting the delivery email Lance Roylo sends to a prospect when handing over a completed NeverRanked audit. The prospect previously replied "send it" (or similar) to a teardown / cold email and is now expecting the deliverable.

${VOICE_RULES}

CLIENT CONTEXT:
- Business: ${client.name}
- Contact: ${client.contact || 'unknown'}
- Email: ${client.email || 'unknown'}
- Domain: ${client.url}
- Vertical: ${client.vertical}
${client.notes?.title ? `- Title: ${client.notes.title}` : ''}

EXECUTIVE SUMMARY (use the headline finding + grade in the email opener, do NOT paste the full summary):

${(execSum || '').slice(0, 4000)}

ROADMAP TOP-LINE (reference the M1 priority in the email):

${(roadmap || '').slice(0, 2500)}

WRITE the email body following this structure:

1. ONE-line opener that pulls a specific finding from the executive summary (no greeting beyond the first name).
2. ONE paragraph naming the headline grade + the most critical fix from the M1 roadmap, with a number to make it concrete.
3. ONE paragraph telling them where to find the deliverables. Reference the EXACT filenames from this list (do not guess section numbers): 00-executive-summary.md, 02-technical-audit.md, 03-schema-review.md, 07-roadmap.md. Tell them to start with 00-executive-summary.md, then jump to 03-schema-review.md for paste-ready JSON-LD blocks.
4. ONE-line offer of a 20-minute walkthrough call if they want to talk through the M1 fixes live (no pressure if they prefer async).
5. Sign-off "Lance" on its own line.

NO em dashes. NO semicolons. NO banned words. NO "Hope this helps." NO "Looking forward to hearing." Direct, founder-voice. 110-180 words target.

Output the email body ONLY. No subject line, no preamble. Just the body Lance copies into Gmail.`;

  const deliveryEmail = await callClaude(deliveryPrompt, 1200);
  const subjectLine = `Your NeverRanked audit: ${client.name}`;
  const deliveryDoc = `# Delivery email — ${client.name}\n\n**To:** ${client.email || 'TBD'}\n**Subject:** ${subjectLine}\n\n---\n\n${deliveryEmail}\n`;
  writeFileSync(resolve(auditDir, 'delivery-email.md'), deliveryDoc, 'utf8');
  console.log(`         wrote delivery-email.md (${deliveryEmail.length} chars)`);
}

// ---------------------------------------------------------------------------
// Agent readiness helpers
// ---------------------------------------------------------------------------

/**
 * Substitutes agent_readiness_check v2 findings into the 03b template.
 * Inputs:
 *   - tpl: raw template string from audit-template/03b-agent-readiness.md
 *   - client: { name, slug, url, vertical? }
 *   - r: AgentReadinessResult from agentReadinessCheck()
 * Output: populated markdown ready to write to the audit directory.
 */
function populateAgentReadinessTemplate(tpl, client, r) {
  const today = new Date().toISOString().slice(0, 10);

  // ActionTypes found summary
  const actionTypes = [...new Set(r.actions.map((a) => a.type))];
  const actionTypesFound = actionTypes.length === 0
    ? 'NONE detected on the root URL.'
    : actionTypes.join(', ');

  // Details table or none paragraph
  let actionDetails;
  if (r.actions.length === 0) {
    actionDetails = 'No Action schemas were found in the JSON-LD or Microdata of this URL. This puts you in the same bucket as roughly 95% of enterprise sites today. See "How you compare" below.';
  } else {
    actionDetails = '| ActionType | Format | Name | Target | Issues |\n|---|---|---|---|---|\n';
    for (const a of r.actions) {
      const targetCell = a.target ? `\`${a.target.slice(0, 60)}${a.target.length > 60 ? '...' : ''}\`` : '_(missing)_';
      const issuesCell = a.issues.length === 0 ? 'none' : a.issues.join('; ');
      actionDetails += `| ${a.type} | ${a.format} | ${a.name} | ${targetCell} | ${issuesCell} |\n`;
    }
  }

  // Vertical or null note
  const verticalLabel = client.vertical || r.vertical || null;
  let missingSection;
  if (!verticalLabel) {
    missingSection = 'No vertical was specified for this audit, so we did not apply a vertical baseline. To get a vertical-specific gap analysis, re-run with `--vertical=<vertical>` (supported: hospitality, restaurants, financial-services, professional-services, healthcare, education, commerce, saas, media, real-estate, nonprofit, government, performing-arts).';
  } else if (r.missing_for_vertical.length === 0) {
    missingSection = `Full baseline coverage for the **${verticalLabel}** vertical. Every ActionType we would expect for a site in this category is present.`;
  } else {
    missingSection = `For the **${verticalLabel}** vertical, our baseline expects: ${(r.missing_for_vertical.length > 0 ? r.missing_for_vertical : []).concat(r.actions.map((a) => a.type)).filter((v, i, arr) => arr.indexOf(v) === i).join(', ')}.\n\nMissing on your site: **${r.missing_for_vertical.join(', ')}**.`;
  }

  // Why-missing-matters list
  let whyMatters;
  if (!r.why_missing_matters || Object.keys(r.why_missing_matters).length === 0) {
    whyMatters = '_(No missing ActionTypes flagged for this vertical.)_';
  } else {
    whyMatters = '';
    for (const [type, why] of Object.entries(r.why_missing_matters)) {
      whyMatters += `- **${type}** — ${why}\n`;
    }
  }

  return tpl
    .replace(/\{Client Name\}/g, client.name || client.slug)
    .replace(/\{YYYY-MM-DD\}/g, today)
    .replace(/\{SCORE\}/g, String(r.score))
    .replace(/\{GRADE\}/g, r.grade)
    .replace(/\{ACTION_TYPES_FOUND_OR_NONE\}/g, actionTypesFound)
    .replace(/\{ACTION_DETAILS_TABLE_OR_NONE_PARAGRAPH\}/g, actionDetails)
    .replace(/\{VERTICAL_OR_NULL\}/g, verticalLabel || '_unspecified_')
    .replace(/\{MISSING_BASELINE_SECTION_OR_NO_VERTICAL_NOTE\}/g, missingSection)
    .replace(/\{WHY_MISSING_MATTERS_LIST\}/g, whyMatters);
}

// ---------------------------------------------------------------------------
// Reddit citation surface helpers
// ---------------------------------------------------------------------------

/**
 * Substitutes Reddit citation surface findings into the 05b template.
 *
 * Three modes:
 *
 * 1. Tracked client with Reddit data: fills in specific subreddits + the
 *    "you named in N of M" deployment block. Surface object is fetched
 *    via wrangler d1 execute; if that fails for any reason, falls through
 *    to mode 2.
 *
 * 2. Tracked client with zero Reddit citations in window: educational
 *    beat + "Reddit volume in your category is below the detection
 *    threshold" note.
 *
 * 3. Prospect (no client_slug yet in citation_keywords): educational
 *    beat + "you'll see your specific subreddit surface once tracking
 *    starts" CTA.
 *
 * The educational content lands in every audit regardless. Specific
 * data is a bonus when it's available.
 */
function populateRedditSurfaceTemplate(tpl, client, surface) {
  const today = new Date().toISOString().slice(0, 10);

  // Mode selection
  const isTrackedClientWithSignal = surface && surface.has_signal && surface.total_reddit_mentions > 0;
  const isTrackedClientNoSignal = surface && !surface.has_signal;

  // --- Summary block ---
  let summary;
  if (isTrackedClientWithSignal) {
    const pct = Math.round(surface.client_named_ratio * 100);
    summary = `Across the last 90 days, AI engines cited Reddit threads ${surface.total_reddit_mentions} times when answering ${client.name || client.slug}'s tracked queries. ${client.name || client.slug} was named alongside ${surface.client_named_in_reddit} of those (${pct}%). NeverRanked converts that surface into FAQPage schema deployed on your own domain so the same engines cite you directly.`;
  } else if (isTrackedClientNoSignal) {
    summary = `In the 90-day tracking window, AI engines did not cite any Reddit threads when answering ${client.name || client.slug}'s tracked queries. That can mean Reddit volume is genuinely low for the category, or it can mean our query set hasn't surfaced the subreddits where the category is being discussed. Adding 5-10 broader prompts to the tracking set is usually enough to confirm which.`;
  } else {
    summary = `${client.name || client.slug} is not yet in NeverRanked's continuous citation tracking, so the specific Reddit surface for your category is not in this report. Once tracking starts (Pulse tier or above), this section populates automatically with the subreddits where AI engines pull "best X for Y" answers about your category, and where your brand appears (or doesn't) in those threads.`;
  }

  // --- Subreddit table ---
  let table;
  if (isTrackedClientWithSignal) {
    table = "| Subreddit | Mentions | You named | Top competitor | Example query |\n";
    table += "|---|---|---|---|---|\n";
    for (const s of surface.subreddits) {
      const pct = Math.round(s.client_named_ratio * 100);
      const comp = s.top_competitor ? `${s.top_competitor} (×${s.top_competitor_count})` : "—";
      const example = (s.example_keyword || "—").slice(0, 60);
      table += `| r/${s.subreddit} | ${s.mention_count} | ${pct}% (${s.client_named_count}) | ${comp} | ${example} |\n`;
    }
  } else {
    table = "_No subreddit data for this audit. See the Summary above for the reason._";
  }

  // --- Interpretation block ---
  let interpretation;
  if (isTrackedClientWithSignal) {
    const zeroSubs = surface.subreddits.filter((s) => s.client_named_ratio === 0);
    if (zeroSubs.length > 0) {
      const top3 = zeroSubs.slice(0, 3).map((s) => "r/" + s.subreddit).join(", ");
      interpretation = `${zeroSubs.length} of the subreddits in the table cite your category but never mention you. ${top3}${zeroSubs.length > 3 ? "..." : ""} are the highest-leverage threads to engage with. These are not necessarily the biggest subreddits — they are the ones AI engines are actively pulling from when answering questions in your category, which means a presence there compounds twice (the engine cites the thread, and your reply is in the thread).`;
    } else {
      interpretation = `You appear in every subreddit our tracking found citing your category. That is the defense position. The work shifts from "get into the conversation" to "stay in the conversation as new threads appear." NeverRanked monitors weekly for new citation-generating Reddit threads and flags them as they emerge.`;
    }
  } else {
    interpretation = `Reddit is one of the highest-leverage citation surfaces because subreddits operate as topic-specific Q&A archives that AI engines treat as authoritative. A single well-placed reply on a citation-generating thread can produce months of AI-search visibility because the thread keeps being cited in answers as long as it ranks within the subreddit. The action is not "post a lot on Reddit" — the action is "be present on the threads AI engines are already pulling from."`;
  }

  // --- Deployment block ---
  let deployment;
  if (isTrackedClientWithSignal) {
    deployment = `For every subreddit in the table above, NeverRanked pulls the questions being asked on the cited threads, clusters them into the distinct underlying questions, and generates voice-matched answers from your business profile. The output is a FAQPage JSON-LD block we deploy to your domain. AI engines cite well-structured FAQ schema on authoritative domains the same way they cite Reddit. You own the source, you own the answer, no Reddit account required.`;
  } else {
    deployment = `When NeverRanked detects citation-generating Reddit threads in your category, we extract the questions being asked, cluster them, and generate FAQPage schema deployed on your own domain. The same AI engines that cite Reddit cite well-structured FAQ schema on authoritative sites. You ship the answer on your domain, no Reddit account required.`;
  }

  return tpl
    .replace(/\{Client Name\}/g, client.name || client.slug)
    .replace(/\{YYYY-MM-DD\}/g, today)
    .replace(/\{REDDIT_SUMMARY_BLOCK\}/g, summary)
    .replace(/\{REDDIT_SUBREDDIT_TABLE_OR_NONE\}/g, table)
    .replace(/\{REDDIT_INTERPRETATION_BLOCK\}/g, interpretation)
    .replace(/\{REDDIT_DEPLOYMENT_BLOCK\}/g, deployment);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const client = resolveClient();
  const auditDir = resolve(REPO_ROOT, 'audits', client.slug);
  const rawDir = resolve(auditDir, 'raw');
  const templateDir = resolve(REPO_ROOT, 'audit-template');

  console.log(`[audit] target: ${client.url}`);
  console.log(`[audit] client: ${client.name} (${client.slug})`);
  console.log(`[audit] out: ${auditDir}`);
  console.log();

  // Fast path: only regenerate the delivery email from existing audit files.
  // Reuses populated sections, no scan, no resection regeneration.
  if (DELIVERY_EMAIL_ONLY) {
    console.log('[delivery-email-only] reusing existing audit sections');
    const tech     = readFileSync(resolve(auditDir, '02-technical-audit.md'), 'utf8');
    const schema   = readFileSync(resolve(auditDir, '03-schema-review.md'), 'utf8');
    const roadmap  = readFileSync(resolve(auditDir, '07-roadmap.md'), 'utf8');
    const execSum  = readFileSync(resolve(auditDir, '00-executive-summary.md'), 'utf8');
    await writeDeliveryEmail(client, auditDir, execSum, roadmap, tech, schema);
    console.log(`\nDONE: ${auditDir}/delivery-email.md`);
    return;
  }

  // 1. Run technical scan
  const intakePath = resolve(rawDir, 'intake-report.json');
  if (!SKIP_SCAN || !existsSync(intakePath)) {
    console.log('[1/5] Running technical scan via run-audit.py...');
    mkdirSync(rawDir, { recursive: true });
    const py = spawnSync('python3', [
      resolve(REPO_ROOT, 'scripts', 'run-audit.py'),
      client.url,
      '--out', rawDir,
    ], { stdio: 'inherit' });
    if (py.status !== 0) throw new Error('run-audit.py failed');
  } else {
    console.log('[1/5] Reusing existing intake-report.json (--skip-scan)');
  }

  if (!existsSync(intakePath)) throw new Error(`No intake-report.json at ${intakePath}`);
  const scan = JSON.parse(readFileSync(intakePath, 'utf8'));

  // 2. Auto-populate technical + schema sections
  const sections = [
    {
      file: '02-technical-audit.md',
      label: 'Technical audit',
      guidance: `Apply the Clarity Principle three-layer pattern to each finding. The headline is the OUTCOME (what fixing this changes for the business), not the technical observation. Then explain the gap in plain English. Then give the platform-specific where-to-fix-it guidance (WordPress / Squarespace / Webflow / Wix / custom-coded). THEN the code-level fix.

Find the 3-5 most material technical issues. Lead with the highest-impact one. Tables with specific page URLs preferred over generic claims.

Anti-patterns to AVOID:
- Heading: "Canonical tags missing"  (this is the diagnostic, not the outcome)
- Heading: "Make sure Google sees the right version of each page"  (THIS is the outcome, lead with it)
- Body skipping straight to "Add <link rel='canonical' href='...'>" without explaining what canonical means in 8 words inline
- "Address it to remove the penalty" — never, ever ship that phrase`,
    },
    {
      file: '03-schema-review.md',
      label: 'Schema review',
      guidance: `Apply the Clarity Principle three-layer pattern to EVERY finding in this section. Each schema gap finding must include:

  LAYER 1 (lead with this): Plain English headline + business outcome.
    NO schema-spec jargon in the first sentence. Translate first.
    Example: "Tell Google and AI engines who you are."
    Then 1-2 sentences explaining the business consequence:
    "Right now, when ChatGPT or Perplexity is asked about your category,
    they have no structured way to know your name, address, or services.
    They cite competitors who do."

  LAYER 2 (where to add it, by platform): Specific guidance based on
    common CMS / site builder paths. Use the customer's actual stack if
    inferable from the scan (look at meta generator tags, asset paths,
    URL patterns). If not inferable, list the most common paths:
      - WordPress: Yoast / Rank Math / SEOPress plugins typically auto-generate this. Confirm it is on under SEO -> General -> Knowledge Graph (or similar). Add logo URL.
      - Squarespace: Settings -> Business Information. Most fields populate automatically.
      - Webflow: Project Settings -> SEO -> Sitewide Schema. Paste the JSON-LD block from below.
      - Wix: SEO Tools -> Structured Data. Add as JSON-LD.
      - Custom-coded: Paste the JSON-LD block (Layer 3 below) into the <head> of every page (or use a sitewide template).

  LAYER 3 (the paste-ready code, for dev / agency): Complete JSON-LD
    block with real values from the scan (business name, URL, address,
    etc.). Include @context, @type, all required fields per schema.org.
    Wrap in a markdown code block with the language fence \\\`\\\`\\\`json.
    BELOW the code block, add 1-2 sentences explaining the design
    choices (why @id chaining, why specific fields) so the dev knows
    what to adapt.

Order in the rendered finding: Layer 1 (headline + why), Layer 2 (where), Layer 3 (code + design notes).

DO NOT lead with the schema type name in the heading. The heading is
the OUTCOME, not the spec. Schema type goes in Layer 3.`,
    },
  ];

  for (const [i, s] of sections.entries()) {
    console.log(`[${i+2}/5] Generating ${s.label}...`);
    const tpl = readFileSync(resolve(templateDir, s.file), 'utf8');
    const out = await callClaude(buildSectionPrompt(s.label, tpl, scan, client, s.guidance));
    writeFileSync(resolve(auditDir, s.file), out, 'utf8');
    console.log(`         wrote ${s.file} (${out.length} chars)`);
  }

  // 3. Roadmap (synthesizes prior sections)
  console.log('[4/5] Generating 90-day roadmap...');
  const roadmapTpl = readFileSync(resolve(templateDir, '07-roadmap.md'), 'utf8');
  const tech = readFileSync(resolve(auditDir, '02-technical-audit.md'), 'utf8');
  const schema = readFileSync(resolve(auditDir, '03-schema-review.md'), 'utf8');
  const roadmapOut = await callClaude(buildSectionPrompt(
    'Roadmap',
    roadmapTpl,
    scan,
    client,
    `The roadmap synthesizes the technical and schema findings into a sequenced 90-day plan. Every roadmap item must trace back to a specific finding from the prior sections (cite by section). Order: highest-impact, lowest-effort first. Group by month (M1, M2, M3) or by week if granularity helps.\n\nPRIOR SECTIONS FOR REFERENCE:\n\n## 02 (Technical Audit)\n${tech.slice(0, 4000)}\n\n## 03 (Schema Review)\n${schema.slice(0, 4000)}`
  ));
  writeFileSync(resolve(auditDir, '07-roadmap.md'), roadmapOut, 'utf8');
  console.log(`         wrote 07-roadmap.md (${roadmapOut.length} chars)`);

  // 4. Executive summary (synthesizes everything)
  console.log('[5/5] Generating executive summary...');
  const execTpl = readFileSync(resolve(templateDir, '00-executive-summary.md'), 'utf8');
  const execOut = await callClaude(buildSectionPrompt(
    'Executive summary',
    execTpl,
    scan,
    client,
    `One-page headline findings. Lead with the overall grade (A/B/C/D/F) and a one-sentence justification. Three "biggest issues" in priority order. Three "biggest opportunities." A "headline number" (e.g., "12 of 25 pages missing canonical tags"). Reads like the cover sheet a busy founder reads in 90 seconds.\n\nPRIOR SECTIONS FOR REFERENCE:\n\n## Technical\n${tech.slice(0, 3000)}\n\n## Schema\n${schema.slice(0, 3000)}\n\n## Roadmap\n${roadmapOut.slice(0, 3000)}`
  ));
  writeFileSync(resolve(auditDir, '00-executive-summary.md'), execOut, 'utf8');
  console.log(`         wrote 00-executive-summary.md (${execOut.length} chars)`);

  // 5. Copy templates for sections we don't auto-populate yet (Phase 2)
  for (const f of ['04-keyword-gap.md', '05-ai-citations.md', '06-competitor-teardown.md']) {
    const dst = resolve(auditDir, f);
    if (!existsSync(dst)) {
      const tpl = readFileSync(resolve(templateDir, f), 'utf8');
      // Inject a TODO header
      const stamped = `<!-- AUDIT-GENERATE V1 LEAVES THIS SECTION AS TEMPLATE.\n     Phase 2 will auto-populate via citation-tracker.py + competitor inference.\n     For now: hand-fill, OR ship the audit without it. -->\n\n${tpl}`;
      writeFileSync(dst, stamped, 'utf8');
    }
  }

  // 5b. Copy the static proof-point section into every audit. Hawaii
  // Theatre case study, CEO-approved 2026-05-10 for marketing use.
  // Static (not AI-generated) so every audit closes with the same
  // verifiable proof point regardless of the prospect's vertical.
  // Lives at audit-template/08-proof.md.
  {
    const dst = resolve(auditDir, '08-proof.md');
    const tpl = readFileSync(resolve(templateDir, '08-proof.md'), 'utf8');
    writeFileSync(dst, tpl, 'utf8');
  }

  // 5c. Agent readiness section. Runs the v2 agent_readiness_check
  // (Schema.org ActionType detection across JSON-LD + Microdata) against
  // the client URL, then substitutes findings into the 03b template.
  // The section is forward-looking — it positions the client for the
  // agent-commerce shift. Failing the scan should not block the audit,
  // so wrap in try/catch.
  try {
    console.log('[5c] Running agent_readiness_check v2...');
    const { agentReadinessCheck } = await import(
      resolve(REPO_ROOT, 'mcp-server', 'dist', 'tools', 'agent-readiness-check.js')
    );
    const arResult = await agentReadinessCheck({
      url: client.url,
      vertical: client.vertical || undefined,
    });
    const tpl = readFileSync(resolve(templateDir, '03b-agent-readiness.md'), 'utf8');
    const populated = populateAgentReadinessTemplate(tpl, client, arResult);
    writeFileSync(resolve(auditDir, '03b-agent-readiness.md'), populated, 'utf8');
    console.log(`         wrote 03b-agent-readiness.md (score ${arResult.score} / ${arResult.grade})`);
  } catch (err) {
    console.warn(`[5c] agent_readiness_check failed — leaving 03b as template: ${err.message || err}`);
    // Fall back to copying the raw template so 03b exists in the audit folder
    const tpl = readFileSync(resolve(templateDir, '03b-agent-readiness.md'), 'utf8');
    writeFileSync(resolve(auditDir, '03b-agent-readiness.md'), tpl, 'utf8');
  }

  // 5d. Reddit citation surface. Educational beat for every audit
  // (works for prospects). If client_slug has tracking data, the
  // populate helper fills in the specific subreddit table; otherwise
  // it ships as the educational variant.
  //
  // Optional D1 lookup: skipped by default to keep audit-generate fast.
  // To enable per-client data, set REDDIT_SURFACE_FETCH=1 and ensure
  // the wrangler CLI can reach the remote D1 database.
  {
    console.log('[5d] Composing Reddit citation surface section...');
    let surface = null;
    if (process.env.REDDIT_SURFACE_FETCH === '1') {
      try {
        const sinceSec = Math.floor(Date.now() / 1000) - 90 * 86400;
        const sql = `SELECT cr.cited_urls, cr.client_cited, cr.competitors_mentioned, ck.keyword FROM citation_runs cr JOIN citation_keywords ck ON ck.id = cr.keyword_id WHERE ck.client_slug = '${client.slug}' AND cr.run_at >= ${sinceSec} AND cr.cited_urls LIKE '%reddit.com%'`;
        const out = execSync(
          `cd "${resolve(REPO_ROOT, 'dashboard')}" && npx wrangler d1 execute neverranked-app --remote --json --command "${sql.replace(/"/g, '\\"')}"`,
          { encoding: 'utf8' },
        );
        // Parse the JSON output and aggregate in-process (mirrors
        // getRedditCitationSurface in dashboard/src/citations.ts).
        const parsed = JSON.parse(out);
        const rows = parsed?.[0]?.results || [];
        if (rows.length > 0) {
          const SUBREDDIT_RE = /reddit\.com\/r\/([A-Za-z0-9_]+)/i;
          const bySub = new Map();
          let total = 0, named = 0;
          for (const r of rows) {
            let urls = [];
            try { urls = JSON.parse(r.cited_urls || '[]'); } catch {}
            const subs = new Set();
            for (const u of urls) {
              const m = String(u).match(SUBREDDIT_RE);
              if (m && m[1]) subs.add(m[1].toLowerCase());
            }
            if (subs.size === 0) continue;
            total++;
            if (r.client_cited === 1) named++;
            let comps = [];
            try {
              const list = JSON.parse(r.competitors_mentioned || '[]');
              for (const c of list) { const k = String(c || '').toLowerCase().trim(); if (k) comps.push(k); }
            } catch {}
            for (const sub of subs) {
              let agg = bySub.get(sub);
              if (!agg) { agg = { mentions: 0, named: 0, competitors: new Map(), example_keyword: null }; bySub.set(sub, agg); }
              agg.mentions++;
              if (r.client_cited === 1) agg.named++;
              if (!agg.example_keyword) agg.example_keyword = r.keyword;
              for (const c of comps) agg.competitors.set(c, (agg.competitors.get(c) || 0) + 1);
            }
          }
          const subreddits = [...bySub.entries()].map(([sub, a]) => {
            const sorted = [...a.competitors.entries()].sort((x, y) => y[1] - x[1]);
            return {
              subreddit: sub,
              mention_count: a.mentions,
              client_named_count: a.named,
              client_named_ratio: a.mentions > 0 ? a.named / a.mentions : 0,
              top_competitor: sorted[0]?.[0] || null,
              top_competitor_count: sorted[0]?.[1] || 0,
              example_keyword: a.example_keyword,
            };
          }).sort((a, b) => b.mention_count - a.mention_count).slice(0, 10);
          surface = {
            total_reddit_mentions: total,
            client_named_in_reddit: named,
            client_named_ratio: total > 0 ? named / total : 0,
            subreddits,
            briefs_drafted: 0,
            has_signal: total > 0,
          };
        } else {
          surface = { total_reddit_mentions: 0, client_named_in_reddit: 0, client_named_ratio: 0, subreddits: [], briefs_drafted: 0, has_signal: false };
        }
        console.log(`         Reddit surface: ${surface.total_reddit_mentions} mentions across ${surface.subreddits.length} subreddits`);
      } catch (err) {
        console.warn(`[5d] D1 fetch failed — falling back to educational template: ${err.message || err}`);
        surface = null;
      }
    } else {
      console.log('         (educational mode — set REDDIT_SURFACE_FETCH=1 for client-specific data)');
    }
    const tpl = readFileSync(resolve(templateDir, '05b-reddit-surface.md'), 'utf8');
    const populated = populateRedditSurfaceTemplate(tpl, client, surface);
    writeFileSync(resolve(auditDir, '05b-reddit-surface.md'), populated, 'utf8');
    console.log(`         wrote 05b-reddit-surface.md`);
  }

  // 6. Delivery email draft — what Lance sends when delivering the audit
  console.log('[6/6] Drafting delivery email...');
  await writeDeliveryEmail(client, auditDir, execOut, roadmapOut, tech, schema);

  console.log();
  console.log('='.repeat(60));
  console.log(`AUDIT GENERATED: ${auditDir}/`);
  console.log('='.repeat(60));
  // Optional: render to PDF
  if (PDF) {
    console.log('[7/7] Rendering audit.pdf...');
    spawnSync('node', [resolve(REPO_ROOT, 'scripts', 'audit-pdf.mjs'), auditDir], { stdio: 'inherit' });
  }

  console.log();
  console.log('Auto-populated:');
  console.log('  ✓ 00-executive-summary.md');
  console.log('  ✓ 02-technical-audit.md');
  console.log('  ✓ 03-schema-review.md');
  console.log('  ✓ 07-roadmap.md');
  console.log('  ✓ delivery-email.md (copy-paste into Gmail when shipping)');
  if (PDF) console.log('  ✓ audit.pdf (single branded deliverable for the prospect)');
  console.log();
  console.log('Templates left for hand-fill (Phase 2 will auto):');
  console.log('  ⌛ 04-keyword-gap.md');
  console.log('  ⌛ 05-ai-citations.md');
  console.log('  ⌛ 06-competitor-teardown.md');
  console.log();
  console.log('Next: review the four auto-populated files, edit as needed, deliver.');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
