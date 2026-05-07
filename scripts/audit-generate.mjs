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
      guidance: 'Find the 3-5 most material technical issues. Lead with the highest-impact one. Each finding needs a code-level fix recommendation. Tables with specific page URLs preferred over generic claims.',
    },
    {
      file: '03-schema-review.md',
      label: 'Schema review',
      guidance: 'Critical: each schema gap finding must include a complete, ready-to-paste JSON-LD code block in the "Fix" subsection. Use real values from the scan (the actual business name, URL, etc.) so the client can copy-paste with minimal edits. Include @context, @type, and all required fields per schema.org.',
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

  console.log();
  console.log('='.repeat(60));
  console.log(`AUDIT GENERATED: ${auditDir}/`);
  console.log('='.repeat(60));
  console.log();
  console.log('Auto-populated:');
  console.log('  ✓ 00-executive-summary.md');
  console.log('  ✓ 02-technical-audit.md');
  console.log('  ✓ 03-schema-review.md');
  console.log('  ✓ 07-roadmap.md');
  console.log();
  console.log('Templates left for hand-fill (Phase 2 will auto):');
  console.log('  ⌛ 04-keyword-gap.md');
  console.log('  ⌛ 05-ai-citations.md');
  console.log('  ⌛ 06-competitor-teardown.md');
  console.log();
  console.log('Next: review the four auto-populated files, edit as needed, deliver.');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
