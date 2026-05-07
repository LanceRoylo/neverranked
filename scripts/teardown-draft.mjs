#!/usr/bin/env node
'use strict';

/**
 * scripts/teardown-draft.mjs
 *
 * First-touch teardown email drafter. Takes a URL + business context,
 * runs the technical scan, and asks Claude to write a personalized
 * cold teardown email naming 3 specific homepage gaps with a comped
 * audit offer.
 *
 * This is the COLD outreach the prospect gets FIRST. Different from:
 *   - delivery-email.md: what Lance sends WITH the audit AFTER they reply
 *   - the auto SMB cold (lib/generator.js): templated, batch-sent, less specific
 *
 * Pre-drafts Lance's hand-written teardowns for hand-raisers identified
 * in the dashboard. Lance fills in recipient + reviews + sends.
 *
 * Usage:
 *   node scripts/teardown-draft.mjs --url=https://example.com \
 *        --business="Example Inc" --slug=example-inc \
 *        [--first-name=Joe] [--market="Honolulu HI"] \
 *        [--vertical=smb]
 *
 * Output: teardowns/<slug>.md  (with email body + scan summary)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const args = Object.fromEntries(
  process.argv.slice(2).flatMap(a => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [[m[1], m[2] ?? true]] : [];
  })
);

if (!args.url || !args.business || !args.slug) {
  console.error('Required: --url=<url> --business="<Business Name>" --slug=<kebab-slug>');
  console.error('Optional: --first-name=<name> --market="<City State>" --vertical=<smb|agency>');
  process.exit(1);
}

const TEARDOWN_DIR = resolve(REPO_ROOT, 'teardowns');
mkdirSync(TEARDOWN_DIR, { recursive: true });

// Reuse a temp scan dir per slug
const scanDir = resolve(TEARDOWN_DIR, '_scan', args.slug);
mkdirSync(scanDir, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Run technical scan (or reuse if exists)
// ---------------------------------------------------------------------------

const intakePath = resolve(scanDir, 'intake-report.json');
if (!existsSync(intakePath) || args['force-scan']) {
  console.log(`[1/2] Scanning ${args.url}...`);
  const py = spawnSync('python3', [
    resolve(REPO_ROOT, 'scripts', 'run-audit.py'),
    args.url, '--out', scanDir,
  ], { stdio: 'inherit' });
  if (py.status !== 0) {
    console.error('run-audit.py failed');
    process.exit(1);
  }
} else {
  console.log('[1/2] Reusing existing scan');
}

const scan = JSON.parse(readFileSync(intakePath, 'utf8'));

// ---------------------------------------------------------------------------
// 2. Claude API
// ---------------------------------------------------------------------------

function getClaudeApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const cfg = resolve(REPO_ROOT, '..', 'neverranked-outreach', 'config.json');
  if (existsSync(cfg)) {
    const c = JSON.parse(readFileSync(cfg, 'utf8'));
    if (c.anthropic_api_key) return c.anthropic_api_key;
  }
  throw new Error('ANTHROPIC_API_KEY not found');
}

function callClaude(prompt, maxTokens = 1500) {
  const apiKey = getClaudeApiKey();
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
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
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(raw);
          if (p.error) return rejectP(new Error(`Claude: ${p.error.message || JSON.stringify(p.error)}`));
          resolveP(p.content?.[0]?.text || '');
        } catch (e) { rejectP(new Error('Bad JSON: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', rejectP);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// 3. Generate teardown email
// ---------------------------------------------------------------------------

console.log('[2/2] Drafting teardown email...');

const prompt = `You are drafting a personalized cold teardown email from Lance Roylo (founder of NeverRanked) to a hand-raiser who recently scanned their own site on check.neverranked.com. The tone is direct, specific, and respectful — Lance noticed they scanned and is reaching out personally with a comped offer.

VOICE RULES (NEVER VIOLATE):
- No em dashes ("—" or "--"). Use periods, commas, parentheses.
- No semicolons in prose. Use periods.
- No banned words: transform, leverage, seamless, cutting-edge, revolutionize, empower, unlock, hidden gem, synergy, robust.
- No filler openers: "In today's world", "Welcome to", "Hope this helps", "Excited to", "Looking forward to".
- No generic SaaS sales tone. Founder voice. Lance is one person sending one email to one prospect.

CLIENT CONTEXT:
- Business: ${args.business}
- Domain: ${args.url}
- First name (if known): ${args['first-name'] || 'unknown'}
- Market: ${args.market || 'unknown'}
- Vertical: ${args.vertical || 'unknown'}

SCAN DATA (from check.neverranked.com technical scan):
\`\`\`json
${JSON.stringify(scan, null, 2).slice(0, 8000)}
\`\`\`

WRITE the email body following this structure (this is the proven structure from the Drake / Emanate teardowns Lance just sent today):

1. Greeting: just the first name if known (e.g. "Joe,"), otherwise no greeting at all (start with the substantive sentence).

2. ONE-line opener that quotes a specific buyer query and names the gap. For local businesses: "When [their actual buyer persona] asks Perplexity for '[real buyer query in their category and city]', [business name] is not in the answer." For B2B vendors (signals: technical title + small headcount + product-marketing language): "When [buyer persona for their product] asks Perplexity for '[product category query]', [business name] is not in the answer." Then drop the score: "Your AEO Readiness Score is [N]/100, which is the structural reason."

3. ONE paragraph with three specific, named gaps from the scan as a numbered list. Each gap names a specific schema type, technical signal, or content issue. Reference real numbers from the scan (word counts, H1 counts, missing schema types). Format as "1. [Gap name]. [One-sentence why it matters]." three times.

4. ONE-line transition that names the audit and comps it. Pattern: "Normally $750. I'll comp it on this one." OR "I'd run the full audit on the right set of [their buyer category] queries. Normally $750. I'll comp it on this one."

5. ONE-line CTA: "Reply 'send it' and I'll get yours started." OR similar low-friction direct ask.

6. Sign-off: "Lance" on its own line.

NO em dashes anywhere. NO semicolons. Target 130-200 words. Direct, founder-voice, specific.

Output the email body ONLY. No subject line, no preamble, no markdown headers. Just the email body Lance pastes into Gmail.

ALSO suggest a subject line in this exact format on a separate line at the top:
SUBJECT: <subject line under 60 chars, follows pattern: "{FirstName/Business}: {gap-or-score}, three fixes that move it" or similar>

Then a blank line, then the email body.`;

const out = await callClaude(prompt, 1500);

// Parse subject + body
const lines = out.split('\n');
const subjectLine = lines.find(l => l.match(/^subject:/i)) || '';
const subjectClean = subjectLine.replace(/^subject:\s*/i, '').trim();
const bodyStart = lines.findIndex(l => l.match(/^subject:/i));
const body = lines.slice(bodyStart + 1).join('\n').trim();

// ---------------------------------------------------------------------------
// 4. Write artifact
// ---------------------------------------------------------------------------

const score = scan.summary?.aeo_score ?? scan.summary?.grade ?? '?';
const homepage = scan.pages?.[args.url] || scan.pages?.[args.url + '/'] || Object.values(scan.pages || {})[0] || {};

const doc = `# Teardown email: ${args.business}

**Status:** DRAFT (review then send)

**To:** _(fill in recipient. Apollo / Hunter / LinkedIn lookup needed.)_
**Subject:** ${subjectClean || `${args.business}: three fixes that move the score`}
**From:** lance@hi.neverranked.com

---

## The email

${body}

---

## Scan summary (for your reference, not the email)


- **Domain:** ${args.url}
- **AEO score:** ${scan.summary?.aeo_score ?? '?'}/100
- **Pages sampled:** ${scan.pages_sampled}
- **Title:** \`${homepage.title || '(none)'}\` (${homepage.title_len || 0} chars)
- **Meta description:** ${homepage.meta_desc ? '✓ present' : '✗ missing'}
- **H1 count:** ${homepage.h1_count || 0}
- **Canonical:** ${homepage.canonical ? '✓ ' + homepage.canonical : '✗ missing'}
- **OG image:** ${homepage.og_image ? '✓' : '✗ missing'}
- **JSON-LD blocks:** ${homepage.jsonld_count ?? 0}
- **Red flags:** ${(scan.red_flags || []).slice(0, 5).map(f => '\n  - ' + (typeof f === 'string' ? f : (f.message || JSON.stringify(f)))).join('')}

---

## Send checklist

- [ ] Find recipient email (Apollo lookup, Hunter, or LinkedIn → contact info)
- [ ] Verify the buyer-query example in the opener still feels right for them
- [ ] Customize greeting if first name is known but not used
- [ ] Send from \`lance@hi.neverranked.com\` so reply lands in your normal inbox
- [ ] After send: log in \`pitch/_meta/log.md\` Inbound section as TEARDOWN SENT
`;

const docPath = resolve(TEARDOWN_DIR, `${args.slug}.md`);
writeFileSync(docPath, doc, 'utf8');
console.log(`         wrote ${docPath}`);
console.log();
console.log(`SUBJECT: ${subjectClean}`);
console.log(`BODY (first 200 chars): ${body.slice(0, 200).replace(/\n/g, ' ')}...`);
