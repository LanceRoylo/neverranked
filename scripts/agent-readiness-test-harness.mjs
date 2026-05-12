#!/usr/bin/env node
/**
 * agent-readiness-test-harness.mjs
 *
 * Runs the v2 agent_readiness_check detection logic against ~25 real-world
 * sites across verticals. Mirrors the logic in
 * mcp-server/src/tools/agent-readiness-check.ts so the harness reflects
 * exactly what production produces.
 *
 * Output: writes a JSON dataset to data/agent-readiness-baseline-{date}.json
 * and prints a per-site summary to stdout.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { argv } from 'node:process';

const ALL_ACTION_TYPES = [
  'SearchAction',
  'ReserveAction', 'CheckInAction', 'CheckOutAction', 'RsvpAction',
  'ApplyAction', 'AuthorizeAction',
  'BuyAction', 'OrderAction', 'PayAction', 'PreOrderAction',
  'TipAction', 'RentAction', 'QuoteAction', 'DonateAction',
  'ContactAction', 'AskAction', 'CommunicateAction',
  'WatchAction', 'ListenAction', 'ReadAction', 'PlayAction',
  'SubscribeAction', 'RegisterAction', 'JoinAction',
  'ChooseAction', 'ReviewAction',
  'TrackAction', 'DownloadAction',
];

const VERTICAL_BASELINES = {
  hospitality:             ['ReserveAction', 'ContactAction'],
  restaurants:             ['ReserveAction', 'OrderAction', 'ContactAction'],
  'financial-services':    ['ApplyAction', 'ContactAction', 'ReserveAction'],
  'professional-services': ['ReserveAction', 'ContactAction'],
  healthcare:              ['ReserveAction', 'ContactAction', 'ApplyAction'],
  education:               ['ApplyAction', 'ContactAction', 'RegisterAction'],
  commerce:                ['BuyAction', 'OrderAction', 'ContactAction'],
  saas:                    ['SubscribeAction', 'ChooseAction', 'ContactAction'],
  media:                   ['SearchAction', 'SubscribeAction'],
  'real-estate':           ['ContactAction', 'ReserveAction', 'ApplyAction'],
  nonprofit:               ['DonateAction', 'ContactAction', 'SubscribeAction'],
  government:              ['ApplyAction', 'ContactAction', 'SearchAction'],
  'performing-arts':       ['BuyAction', 'ReserveAction', 'ContactAction'],
};

const TEST_PANEL = [
  // Banking
  { url: 'https://www.asbhawaii.com',          vertical: 'financial-services', label: 'ASB (Hawaii)' },
  { url: 'https://www.fhb.com',                vertical: 'financial-services', label: 'First Hawaiian Bank' },
  { url: 'https://www.boh.com',                vertical: 'financial-services', label: 'Bank of Hawaii' },
  { url: 'https://www.centralpacificbank.com', vertical: 'financial-services', label: 'Central Pacific Bank' },
  { url: 'https://www.chase.com',              vertical: 'financial-services', label: 'Chase (national)' },
  { url: 'https://www.wellsfargo.com',         vertical: 'financial-services', label: 'Wells Fargo (national)' },
  // Hospitality
  { url: 'https://www.marriott.com',           vertical: 'hospitality',        label: 'Marriott' },
  { url: 'https://www.hilton.com',             vertical: 'hospitality',        label: 'Hilton' },
  { url: 'https://www.hawaiitheatre.com',      vertical: 'performing-arts',    label: 'Hawaii Theatre (case study)' },
  // Restaurants / reservations
  { url: 'https://www.opentable.com',          vertical: 'restaurants',        label: 'OpenTable' },
  { url: 'https://resy.com',                   vertical: 'restaurants',        label: 'Resy' },
  // E-commerce
  { url: 'https://www.amazon.com',             vertical: 'commerce',           label: 'Amazon' },
  { url: 'https://www.bestbuy.com',            vertical: 'commerce',           label: 'Best Buy' },
  { url: 'https://www.shopify.com',            vertical: 'saas',               label: 'Shopify (SaaS)' },
  // Healthcare
  { url: 'https://www.mayoclinic.org',         vertical: 'healthcare',         label: 'Mayo Clinic' },
  { url: 'https://healthy.kaiserpermanente.org', vertical: 'healthcare',       label: 'Kaiser Permanente' },
  // Education
  { url: 'https://www.harvard.edu',            vertical: 'education',          label: 'Harvard' },
  // SaaS
  { url: 'https://stripe.com',                 vertical: 'saas',               label: 'Stripe' },
  { url: 'https://github.com',                 vertical: 'saas',               label: 'GitHub' },
  // Government
  { url: 'https://www.irs.gov',                vertical: 'government',         label: 'IRS' },
  // Known-positive controls
  { url: 'https://www.google.com',             vertical: null,                 label: 'Google (SearchAction control)' },
  { url: 'https://www.yelp.com',               vertical: 'restaurants',        label: 'Yelp (control)' },
  { url: 'https://www.airbnb.com',             vertical: 'hospitality',        label: 'Airbnb (control)' },
  { url: 'https://www.expedia.com',            vertical: 'hospitality',        label: 'Expedia (control)' },
  { url: 'https://www.etsy.com',               vertical: 'commerce',           label: 'Etsy (control)' },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) NeverRanked-Bot/1.0 (+https://neverranked.com/bot)';

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed && typeof parsed === 'object' && '@graph' in parsed) {
        blocks.push(...parsed['@graph']);
      } else if (parsed && typeof parsed === 'object') {
        blocks.push(parsed);
      }
    } catch {}
  }
  return blocks;
}

function walkForActions(node, path, out, depth = 0) {
  if (depth > 12 || !node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkForActions(item, path, out, depth + 1);
    return;
  }
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  for (const t of types) {
    if (typeof t === 'string' && ALL_ACTION_TYPES.includes(t)) {
      out.push({ type: t, block: node, viaPotentialAction: path === 'potentialAction', depth });
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '@type' || key === '@context' || typeof value !== 'object') continue;
    walkForActions(value, key, out, depth + 1);
  }
}

function extractActionsJsonLd(blocks) {
  const out = [];
  for (const b of blocks) walkForActions(b, '', out);
  const seen = new Set();
  const deduped = [];
  for (const a of out) {
    const key = `${a.type}|${a.block.name || ''}|${JSON.stringify(a.block.target || '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ type: a.type, block: a.block, viaPotentialAction: a.viaPotentialAction });
  }
  return deduped;
}

function extractActionsMicrodata(html) {
  const out = [];
  const itemTypeRe = /itemscope[^>]*itemtype=["']https?:\/\/schema\.org\/([A-Z][A-Za-z]+Action)["']/gi;
  let m;
  while ((m = itemTypeRe.exec(html)) !== null) {
    const type = m[1];
    if (!ALL_ACTION_TYPES.includes(type)) continue;
    out.push({ type, block: { '@type': type }, viaPotentialAction: false });
  }
  return out;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status };
    const html = await res.text();
    return { html, status: res.status };
  } catch (e) {
    clearTimeout(timer);
    return { error: e.message || String(e), status: 0 };
  }
}

async function scanSite(site) {
  const t0 = Date.now();
  const fetched = await fetchHtml(site.url);
  const elapsed = Date.now() - t0;

  if (fetched.error) {
    return {
      ...site,
      elapsed_ms: elapsed,
      fetch_error: fetched.error,
      fetch_status: fetched.status,
      blocks_found: 0,
      jsonld_present: false,
      actions: [],
      action_types: [],
      missing_for_vertical: site.vertical ? VERTICAL_BASELINES[site.vertical] : [],
    };
  }

  const blocks = extractJsonLd(fetched.html);
  const jsonLdActions = extractActionsJsonLd(blocks);
  const microActions = extractActionsMicrodata(fetched.html);
  const allActions = [
    ...jsonLdActions.map(a => ({ ...a, format: 'json-ld' })),
    ...microActions.map(a => ({ ...a, format: 'microdata' })),
  ];
  const action_types = [...new Set(allActions.map(a => a.type))];
  const expected = site.vertical ? VERTICAL_BASELINES[site.vertical] : null;
  const missing = expected ? expected.filter(t => !action_types.includes(t)) : [];

  return {
    ...site,
    elapsed_ms: elapsed,
    fetch_status: fetched.status,
    blocks_found: blocks.length,
    jsonld_present: blocks.length > 0,
    html_size: fetched.html.length,
    actions: allActions.map(a => ({
      type: a.type,
      format: a.format,
      via_potential_action: a.viaPotentialAction,
      has_name: !!a.block.name,
      has_target: !!a.block.target,
      target_is_object: typeof a.block.target === 'object',
    })),
    action_types,
    missing_for_vertical: missing,
    full_baseline_coverage: expected && missing.length === 0,
  };
}

async function main() {
  const args = Object.fromEntries(
    argv.slice(2).flatMap(a => {
      const m = a.match(/^--([^=]+)(?:=(.*))?$/);
      return m ? [[m[1], m[2] ?? true]] : [];
    }),
  );

  const sites = args.site
    ? [{ url: args.site, vertical: args.vertical || null, label: args.site }]
    : TEST_PANEL;

  console.log(`agent_readiness_check v2 — ${sites.length} sites\n`);

  const results = [];
  for (const s of sites) {
    process.stdout.write(`Scanning ${s.label}... `);
    const r = await scanSite(s);
    results.push(r);

    if (r.fetch_error) {
      console.log(`BLOCKED (${r.fetch_error})`);
    } else {
      const presence = r.actions.length === 0 ? 'no actions' :
        `${r.action_types.length} ActionTypes [${r.action_types.join(', ')}] via ${[...new Set(r.actions.map(a => a.format))].join('+')}`;
      console.log(`${presence}, ${r.blocks_found} JSON-LD blocks, ${r.elapsed_ms}ms`);
    }
  }

  const blocked = results.filter(r => r.fetch_error);
  const scanned = results.filter(r => !r.fetch_error);
  const withJsonLd = scanned.filter(r => r.jsonld_present);
  const withAnyAction = scanned.filter(r => r.actions.length > 0);
  const fullBaseline = scanned.filter(r => r.full_baseline_coverage);

  console.log(`\nv2 SUMMARY:`);
  console.log(`  Scanned successfully: ${scanned.length}/${results.length}`);
  console.log(`  Blocked / failed: ${blocked.length}`);
  console.log(`  Sites with JSON-LD blocks: ${withJsonLd.length}/${scanned.length}`);
  console.log(`  Sites with ANY action detected: ${withAnyAction.length}/${scanned.length}`);
  console.log(`  Sites with full vertical baseline coverage: ${fullBaseline.length}/${scanned.length}`);

  const allTypesSeen = [...new Set(scanned.flatMap(r => r.action_types))];
  console.log(`  ActionTypes observed across panel: ${allTypesSeen.join(', ') || 'NONE'}`);

  const byVertical = {};
  for (const r of scanned) {
    const v = r.vertical || '(no vertical)';
    if (!byVertical[v]) byVertical[v] = { total: 0, withActions: 0 };
    byVertical[v].total++;
    if (r.actions.length > 0) byVertical[v].withActions++;
  }
  console.log(`\nBY VERTICAL:`);
  for (const [v, stats] of Object.entries(byVertical)) {
    console.log(`  ${v}: ${stats.withActions}/${stats.total} sites with actions detected`);
  }

  if (!existsSync('data')) mkdirSync('data', { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const outPath = `data/agent-readiness-baseline-${today}.json`;
  writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    detection_version: 'v2',
    panel_size: sites.length,
    summary: {
      scanned: scanned.length,
      blocked: blocked.length,
      with_jsonld: withJsonLd.length,
      with_any_action: withAnyAction.length,
      full_baseline_coverage: fullBaseline.length,
      action_types_observed: allTypesSeen,
    },
    by_vertical: byVertical,
    results,
  }, null, 2));
  console.log(`\nDataset written: ${outPath}`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
