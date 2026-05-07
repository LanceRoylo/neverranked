#!/usr/bin/env node
'use strict';

/**
 * scripts/utm-audit.mjs
 *
 * Scans the repo for check.neverranked.com mentions and reports
 * which files have UTM-less links that should be tagged.
 *
 * UTM standard (per surface):
 *   pitch/<slug>/index.html  -> ?utm_source=pitch&utm_medium=email&utm_campaign=<slug>
 *   blog/<slug>/index.html   -> ?utm_source=blog&utm_medium=organic&utm_campaign=<slug>
 *   index.html (root)        -> ?utm_source=homepage&utm_medium=organic
 *   for-agencies/, etc.      -> ?utm_source=<dir>&utm_medium=organic
 *   social/posts/.../caption.md  -> reference, not deployed (skip)
 *   linkedin/captions/*.txt      -> intent surface, not auto-published
 *
 * Usage:
 *   node scripts/utm-audit.mjs              # report only
 *   node scripts/utm-audit.mjs --details    # show line-by-line
 */

import { readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DETAILS = process.argv.includes('--details');

const grepOut = execSync(
  `cd /Users/lanceroylo/Desktop/neverranked && grep -rn 'check\\.neverranked\\.com' \
    --include='*.html' --include='*.md' --include='*.txt' \
    pitch/ blog/ index.html for-agencies/ kit/ about/ social/ linkedin/ 2>/dev/null || true`,
  { encoding: 'utf8' }
);

const lines = grepOut.split('\n').filter(Boolean);

let totalRefs = 0;
let untagged = 0;
let tagged = 0;
const byFile = new Map();

for (const line of lines) {
  totalRefs++;
  const colonIdx = line.indexOf(':');
  const colonIdx2 = line.indexOf(':', colonIdx + 1);
  const file = line.slice(0, colonIdx);
  const lineNum = line.slice(colonIdx + 1, colonIdx2);
  const content = line.slice(colonIdx2 + 1);
  const hasUtm = /[?&]utm_source=/i.test(content);
  if (hasUtm) tagged++; else untagged++;
  if (!byFile.has(file)) byFile.set(file, { tagged: 0, untagged: 0, lines: [] });
  const e = byFile.get(file);
  if (hasUtm) e.tagged++; else e.untagged++;
  if (!hasUtm) e.lines.push({ line: lineNum, content: content.trim() });
}

console.log('=== UTM AUDIT ===');
console.log(`Total check.neverranked.com mentions: ${totalRefs}`);
console.log(`  Tagged with UTM:   ${tagged}`);
console.log(`  Missing UTM tags:  ${untagged}`);
console.log();

// Group by surface
const surfaces = {
  'pitch/': { files: 0, untagged: 0 },
  'blog/': { files: 0, untagged: 0 },
  'index.html': { files: 0, untagged: 0 },
  'for-agencies/': { files: 0, untagged: 0 },
  'kit/': { files: 0, untagged: 0 },
  'about/': { files: 0, untagged: 0 },
  'social/': { files: 0, untagged: 0 },
  'linkedin/': { files: 0, untagged: 0 },
  'other': { files: 0, untagged: 0 },
};

for (const [file, data] of byFile) {
  if (data.untagged === 0) continue;
  let bucket = 'other';
  for (const prefix of Object.keys(surfaces)) {
    if (file.startsWith(prefix)) { bucket = prefix; break; }
  }
  surfaces[bucket].files++;
  surfaces[bucket].untagged += data.untagged;
}

console.log('Untagged by surface:');
for (const [s, data] of Object.entries(surfaces)) {
  if (data.files > 0) {
    console.log(`  ${s.padEnd(20)} ${data.files} file(s), ${data.untagged} untagged mention(s)`);
  }
}

if (DETAILS) {
  console.log();
  console.log('=== UNTAGGED MENTIONS (first 5 per file) ===');
  for (const [file, data] of byFile) {
    if (data.untagged === 0) continue;
    console.log(`\n${file} (${data.untagged} untagged):`);
    for (const l of data.lines.slice(0, 5)) {
      console.log(`  L${l.line}: ${l.content.slice(0, 110)}`);
    }
    if (data.lines.length > 5) console.log(`  ... and ${data.lines.length - 5} more`);
  }
}
