#!/usr/bin/env node
/**
 * agent-readiness-check.mjs
 *
 * Audit a URL for AI agent task-surface coverage. Looks for Schema.org
 * Action types in the rendered HTML's JSON-LD blocks.
 *
 * Usage:
 *   node scripts/agent-readiness-check.mjs --url=https://example.com [--vertical=hospitality] [--json]
 *
 * Vertical baselines:
 *   - hospitality:           ReserveAction, ContactAction
 *   - financial-services:    ApplyAction, ContactAction, ReserveAction
 *   - professional-services: ReserveAction, ContactAction
 *   - commerce:              BuyAction, OrderAction, ContactAction
 *   - default (no vertical): scores actions present without a baseline
 *
 * Score: 0-100 across (presence × correctness × target-reachability)
 */

import { argv, exit } from 'node:process';

const args = Object.fromEntries(
  argv.slice(2).flatMap(a => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [[m[1], m[2] ?? true]] : [];
  })
);

if (!args.url) {
  console.error('Usage: --url=<base-url> [--vertical=<vertical>] [--json]');
  exit(1);
}

const VERTICAL_BASELINES = {
  'hospitality':           ['ReserveAction', 'ContactAction'],
  'financial-services':    ['ApplyAction', 'ContactAction', 'ReserveAction'],
  'professional-services': ['ReserveAction', 'ContactAction'],
  'commerce':              ['BuyAction', 'OrderAction', 'ContactAction'],
};

const ALL_ACTION_TYPES = [
  'ReserveAction', 'ApplyAction', 'BuyAction', 'OrderAction',
  'ContactAction', 'AskAction', 'SubscribeAction', 'RegisterAction',
];

const baseUrl = args.url.replace(/\/+$/, '');
const vertical = args.vertical || null;
const expectedActions = vertical ? VERTICAL_BASELINES[vertical] : null;

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const raw = m[1].trim();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed['@graph']) blocks.push(...parsed['@graph']);
      else blocks.push(parsed);
    } catch {
      // Malformed JSON-LD — skip silently
    }
  }
  return blocks;
}

function extractActions(blocks) {
  const found = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const t = Array.isArray(b['@type']) ? b['@type'] : [b['@type']];
    for (const type of t) {
      if (typeof type === 'string' && ALL_ACTION_TYPES.includes(type)) {
        found.push({ type, block: b });
      }
    }
    // Also check nested potentialAction on Organization, LocalBusiness, etc.
    if (b.potentialAction) {
      const pa = Array.isArray(b.potentialAction) ? b.potentialAction : [b.potentialAction];
      for (const a of pa) {
        if (a && a['@type'] && ALL_ACTION_TYPES.includes(a['@type'])) {
          found.push({ type: a['@type'], block: a, viaPotentialAction: true });
        }
      }
    }
  }
  return found;
}

function validateAction(action) {
  const issues = [];
  const b = action.block;
  if (!b.name) issues.push('missing name');
  if (!b.target) issues.push('missing target');
  if (b.target && !b.target.urlTemplate && !b.target.url) issues.push('target missing urlTemplate or url');
  // ReserveAction ideally has query-input
  if (action.type === 'ReserveAction' && !b['query-input'] && !b.queryInput) {
    issues.push('ReserveAction missing query-input (agents cannot supply parameters)');
  }
  return issues;
}

async function checkTargetReachable(action) {
  const b = action.block;
  if (!b.target) return null;
  let url = b.target.urlTemplate || b.target.url;
  if (!url) return null;
  // Strip {placeholder} segments to test the base URL responds
  url = url.replace(/\{[^}]+\}/g, '').replace(/[?&]$/, '');
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

console.error(`Fetching ${baseUrl}...`);
const html = await fetch(baseUrl).then(r => r.text()).catch(e => {
  console.error(`Fetch failed: ${e}`);
  exit(1);
});

const blocks = extractJsonLd(html);
const actions = extractActions(blocks);

console.error(`Found ${blocks.length} JSON-LD blocks, ${actions.length} Action types`);

const checked = [];
for (const a of actions) {
  const issues = validateAction(a);
  const reachable = await checkTargetReachable(a);
  checked.push({
    type: a.type,
    name: a.block.name || '(unnamed)',
    target: (a.block.target?.urlTemplate || a.block.target?.url || null),
    issues,
    reachable,
    viaPotentialAction: !!a.viaPotentialAction,
  });
}

const presentTypes = new Set(checked.map(c => c.type));
const missing = expectedActions
  ? expectedActions.filter(t => !presentTypes.has(t))
  : [];

let score = 0;
const findings = [];

if (checked.length === 0) {
  findings.push({ ok: false, msg: 'No Action schemas detected — site is not agent-ready at all' });
} else {
  // 30 points for ANY action coverage
  score += 30;
  findings.push({ ok: true, msg: `${checked.length} Action type(s) detected: ${[...presentTypes].join(', ')}` });

  // Up to 30 more points for vertical baseline coverage
  if (expectedActions) {
    const coverage = (expectedActions.length - missing.length) / expectedActions.length;
    const vp = Math.round(coverage * 30);
    score += vp;
    if (missing.length === 0) {
      findings.push({ ok: true, msg: `Full vertical baseline coverage (${vertical})` });
    } else {
      findings.push({ ok: false, msg: `Vertical baseline incomplete (${vertical}). Missing: ${missing.join(', ')}` });
    }
  } else {
    score += 15; // Half-credit when no vertical baseline supplied
  }

  // Up to 20 points for validation correctness
  const totalIssues = checked.reduce((sum, c) => sum + c.issues.length, 0);
  const issuePenalty = Math.min(20, totalIssues * 5);
  score += 20 - issuePenalty;
  if (totalIssues === 0) {
    findings.push({ ok: true, msg: 'All Action schemas pass basic validation' });
  } else {
    findings.push({ ok: false, msg: `${totalIssues} validation issue(s) across actions` });
  }

  // Up to 20 points for target reachability
  const reachableCount = checked.filter(c => c.reachable && c.reachable.ok).length;
  const reachableScore = checked.length > 0 ? Math.round((reachableCount / checked.length) * 20) : 0;
  score += reachableScore;
  findings.push({
    ok: reachableCount === checked.length,
    msg: `${reachableCount} of ${checked.length} action target URLs respond 2xx`
  });
}

const result = {
  url: baseUrl,
  vertical,
  score,
  grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
  actions: checked,
  missing_for_vertical: missing,
  findings,
};

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`\nAgent Readiness — ${baseUrl}`);
  if (vertical) console.log(`Vertical: ${vertical}`);
  console.log(`\nScore: ${result.score} / 100  (grade ${result.grade})`);
  console.log(`Actions detected: ${checked.length}`);
  if (missing.length) console.log(`Missing for vertical: ${missing.join(', ')}`);
  console.log(`\nFindings:`);
  for (const f of result.findings) console.log(`  ${f.ok ? '✓' : '✗'} ${f.msg}`);
  if (checked.length > 0) {
    console.log(`\nAction details:`);
    for (const c of checked) {
      console.log(`  • ${c.type}: ${c.name}`);
      if (c.target) console.log(`    target: ${c.target}`);
      if (c.issues.length) console.log(`    issues: ${c.issues.join('; ')}`);
      if (c.reachable) {
        console.log(`    reachable: ${c.reachable.ok ? 'yes' : 'no'} (${c.reachable.status || c.reachable.error})`);
      }
    }
  }
  console.log();
}
