#!/usr/bin/env node
'use strict';

/**
 * scripts/utm-retrofit.mjs
 *
 * Adds UTM parameters to every check.neverranked.com link in the
 * deployed HTML surfaces (pitch/, blog/, index.html, for-agencies/,
 * kit/, about/). Idempotent — skips links that already have utm_source.
 *
 * UTM standard (per surface):
 *   pitch/<slug>/index.html   -> utm_source=pitch&utm_medium=email&utm_campaign=<slug>
 *   blog/<slug>/index.html    -> utm_source=blog&utm_medium=organic&utm_campaign=<slug>
 *   index.html (root)         -> utm_source=homepage&utm_medium=organic
 *   for-agencies/index.html   -> utm_source=for_agencies&utm_medium=organic
 *   kit/index.html            -> utm_source=kit&utm_medium=organic
 *   about/index.html          -> utm_source=about&utm_medium=organic
 *
 * Skip social/ (caption .md files are reference, not deployed) and
 * linkedin/ (captions for manual posting).
 *
 * Usage:
 *   node scripts/utm-retrofit.mjs              # apply
 *   node scripts/utm-retrofit.mjs --dry-run    # preview, no writes
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// Match check.neverranked.com URLs with optional path and query string.
// Captures: prefix (https?://), path (everything after .com up to the next
// quote/whitespace/angle-bracket).
const URL_RE = /(https?:\/\/)?check\.neverranked\.com((?:\/[^\s"'<>]*)?)/g;

function paramsFor(file) {
  // file is repo-relative
  if (file === 'index.html') {
    return 'utm_source=homepage&utm_medium=organic';
  }
  if (file.startsWith('pitch/')) {
    const slug = file.split('/')[1];
    return `utm_source=pitch&utm_medium=email&utm_campaign=${slug}`;
  }
  if (file.startsWith('blog/')) {
    const slug = file.split('/')[1];
    return `utm_source=blog&utm_medium=organic&utm_campaign=${slug}`;
  }
  if (file.startsWith('for-agencies/')) {
    return 'utm_source=for_agencies&utm_medium=organic';
  }
  if (file.startsWith('kit/')) {
    return 'utm_source=kit&utm_medium=organic';
  }
  if (file.startsWith('about/')) {
    return 'utm_source=about&utm_medium=organic';
  }
  return null;
}

function transformUrl(match, prefix, path, file) {
  // If already has utm_source, leave alone
  if (/[?&]utm_source=/i.test(match)) return match;

  const utm = paramsFor(file);
  if (!utm) return match;

  // Reconstruct: prefix + check.neverranked.com + path
  // Path may contain a query string already.
  const url = (prefix || 'https://') + 'check.neverranked.com' + (path || '');
  // Determine separator
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + utm;
}

// Walk the surfaces
function* walkHtml(dir, prefix = '') {
  const full = resolve(REPO, prefix, dir);
  let entries;
  try { entries = readdirSync(full); } catch { return; }
  for (const e of entries) {
    const sub = `${prefix ? prefix + '/' : ''}${dir}/${e}`;
    const fullSub = resolve(REPO, sub);
    let st;
    try { st = statSync(fullSub); } catch { continue; }
    if (st.isDirectory()) {
      yield* walkHtml(e, `${prefix ? prefix + '/' : ''}${dir}`);
    } else if (e === 'index.html' || e.endsWith('.html')) {
      yield sub;
    }
  }
}

const targetSurfaces = ['pitch', 'blog', 'for-agencies', 'kit', 'about'];
const files = ['index.html'];
for (const surface of targetSurfaces) {
  for (const f of walkHtml(surface)) files.push(f);
}

let totalRefs = 0;
let totalChanged = 0;
let filesChanged = 0;

for (const file of files) {
  const fullPath = resolve(REPO, file);
  let content;
  try { content = readFileSync(fullPath, 'utf8'); } catch { continue; }

  let fileChanges = 0;
  const newContent = content.replace(URL_RE, (match, prefix, path) => {
    totalRefs++;
    const transformed = transformUrl(match, prefix, path, file);
    if (transformed !== match) {
      totalChanged++;
      fileChanges++;
    }
    return transformed;
  });

  if (fileChanges > 0) {
    filesChanged++;
    console.log(`  ${file}: ${fileChanges} ref(s) tagged`);
    if (!DRY_RUN) {
      writeFileSync(fullPath, newContent, 'utf8');
    }
  }
}

console.log();
console.log('=== UTM RETROFIT COMPLETE ===');
console.log(`Mode:           ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
console.log(`Files scanned:  ${files.length}`);
console.log(`Files changed:  ${filesChanged}`);
console.log(`References:     ${totalRefs} total, ${totalChanged} tagged`);
