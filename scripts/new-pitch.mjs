#!/usr/bin/env node
'use strict';

/**
 * scripts/new-pitch.mjs
 *
 * Scaffold a new prospect pitch following the established
 * neverranked.com/pitch/<slug>/ pattern (see
 * ~/.claude/.../memory/pitch_pattern.md for the full spec).
 *
 * What this script automates:
 *   1. Clones a template pitch (default: jordan-iq360) into
 *      pitch/<new-slug>/.
 *   2. Swaps metadata throughout index.html:
 *      - <title>, <meta name="description">
 *      - <link rel="canonical">
 *      - og:title, og:description, og:url, og:image
 *      - twitter:image
 *      - JSON-LD BreadcrumbList name + item
 *      - All utm_campaign= occurrences -> new slug
 *      - Tracking pixel /track/pitch/<old> -> /track/pitch/<new>
 *      - "For <Old Recipient>" eyebrow / hero copy
 *   3. Clones og.html template, swaps recipient + tag + h1 +
 *      meta + url so the new pitch ships with a tailored OG.
 *   4. Renders og.png via scripts/capture-og-pitch.mjs.
 *   5. Runs bash scripts/build.sh so dist/pitch/<new>/ is
 *      ready to deploy.
 *   6. Prints the body sections that still need hand-written
 *      content (the 8 narrative sections).
 *
 * What this script does NOT automate (intentionally):
 *   - The body content of the 8 sections (warm opener, both
 *     tools in one paragraph each, side-by-side table, etc.).
 *     These have to be tailored to the prospect and the
 *     conversation. A scaffolded pitch is a head-start, not
 *     a finished artifact.
 *
 * Usage:
 *   node scripts/new-pitch.mjs \
 *     --slug "jane-acme" \
 *     --recipient "Jane Smith" \
 *     --company "Acme Corp" \
 *     --tag "Wealth Advisor &middot; Seven Engines &middot; AEO Audit" \
 *     --h1 "Five things AI engines can't see <em>about Acme Corp.</em>" \
 *     --description "A private brief for Jane Smith at Acme Corp comparing where AI engines do and do not cite the firm." \
 *     [--template jordan-iq360]
 *     [--no-render]   (skip OG render and build, just write files)
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PITCH_DIR = resolve(REPO_ROOT, 'pitch');

// -----------------------------------------------------------------
// Args
// -----------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    slug: null,
    recipient: null,
    company: null,
    tag: null,
    h1: null,
    description: null,
    template: 'jordan-iq360',
    render: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case '--slug':         out.slug = next; i++; break;
      case '--recipient':    out.recipient = next; i++; break;
      case '--company':      out.company = next; i++; break;
      case '--tag':          out.tag = next; i++; break;
      case '--h1':           out.h1 = next; i++; break;
      case '--description':  out.description = next; i++; break;
      case '--template':     out.template = next; i++; break;
      case '--no-render':    out.render = false; break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        if (a.startsWith('--')) {
          process.stderr.write(`Unknown flag: ${a}\n`);
          process.exit(2);
        }
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`Scaffold a new prospect pitch at neverranked.com/pitch/<slug>/.

Required:
  --slug          URL slug, e.g. "jane-acme"
  --recipient     Full name, e.g. "Jane Smith"
  --company       Company name, e.g. "Acme Corp"
  --tag           Recipient tag pill, e.g. "Wealth Advisor &middot; Seven Engines &middot; AEO Audit"
  --h1            Hero h1, use <em>...</em> for the italic gold span
  --description   <meta name="description"> + og:description content

Optional:
  --template      Slug to clone from. Default: jordan-iq360
  --no-render     Skip OG render and build step (just write files)

Output:
  pitch/<slug>/index.html       (cloned and swapped)
  pitch/<slug>/og.html          (cloned and swapped)
  pitch/<slug>/og.png           (rendered)
  dist/pitch/<slug>/...         (after build.sh)

After scaffolding, hand-write the 8 narrative sections.
`);
}

const args = parseArgs(process.argv);
if (!args.slug || !args.recipient || !args.company || !args.tag || !args.h1 || !args.description) {
  process.stderr.write('error: --slug, --recipient, --company, --tag, --h1, --description are required\n\n');
  printHelp();
  process.exit(2);
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(args.slug)) {
  process.stderr.write(`error: slug "${args.slug}" must be lowercase a-z, 0-9, hyphens\n`);
  process.exit(2);
}

const templateDir = resolve(PITCH_DIR, args.template);
const newDir = resolve(PITCH_DIR, args.slug);

if (!existsSync(templateDir)) {
  process.stderr.write(`error: template pitch/${args.template}/ not found\n`);
  process.exit(2);
}
if (existsSync(newDir)) {
  process.stderr.write(`error: pitch/${args.slug}/ already exists. Pick a different slug or delete the old one.\n`);
  process.exit(2);
}

// -----------------------------------------------------------------
// Clone files
// -----------------------------------------------------------------

mkdirSync(newDir, { recursive: true });
for (const f of readdirSync(templateDir)) {
  if (f === 'og.png') continue; // re-rendered below
  copyFileSync(resolve(templateDir, f), resolve(newDir, f));
}
process.stdout.write(`[1/5] Cloned pitch/${args.template}/ -> pitch/${args.slug}/\n`);

// -----------------------------------------------------------------
// Find the template's recipient name to do the eyebrow swap.
// We do this by reading the template's <title> and pulling the
// "For <Name>" prefix.
// -----------------------------------------------------------------

const templateHtml = readFileSync(resolve(templateDir, 'index.html'), 'utf8');
const templateTitleMatch = templateHtml.match(/<title>For ([^<\/]+?)(?:\s*\/\s*[^<]*)?<\/title>/);
const templateRecipient = templateTitleMatch ? templateTitleMatch[1].trim() : null;
if (!templateRecipient) {
  process.stderr.write(`warning: could not detect template recipient name from <title>. Eyebrow swap may be incomplete.\n`);
}

// -----------------------------------------------------------------
// Swap metadata in index.html
// -----------------------------------------------------------------

function swapInFile(filePath, swaps) {
  let txt = readFileSync(filePath, 'utf8');
  for (const [from, to] of swaps) {
    if (typeof from === 'string') {
      txt = txt.split(from).join(to);
    } else {
      txt = txt.replace(from, to);
    }
  }
  writeFileSync(filePath, txt, 'utf8');
}

const indexPath = resolve(newDir, 'index.html');
const titleNew = `For ${args.recipient} / ${args.company} -- Never Ranked`;
const ogTitleNew = `For ${args.recipient} / ${args.company}`;

const swaps = [
  // Title and meta description
  [/<title>[^<]+<\/title>/, `<title>${titleNew}</title>`],
  [/<meta name="description" content="[^"]+">/, `<meta name="description" content="${args.description}">`],
  // Canonical
  [/<link rel="canonical" href="[^"]+"/, `<link rel="canonical" href="https://neverranked.com/pitch/${args.slug}/"`],
  // OG
  [/<meta property="og:title" content="[^"]+">/, `<meta property="og:title" content="${ogTitleNew}">`],
  [/<meta property="og:description" content="[^"]+">/, `<meta property="og:description" content="${args.description}">`],
  [/<meta property="og:url" content="[^"]+">/, `<meta property="og:url" content="https://neverranked.com/pitch/${args.slug}/">`],
  [/<meta property="og:image" content="[^"]+">/, `<meta property="og:image" content="https://neverranked.com/pitch/${args.slug}/og.png">`],
  [/<meta name="twitter:image" content="[^"]+">/, `<meta name="twitter:image" content="https://neverranked.com/pitch/${args.slug}/og.png">`],
  // JSON-LD BreadcrumbList
  [/"name": "Pitch \/ [^"]+",/, `"name": "Pitch / ${args.recipient} / ${args.company}",`],
  [/"item": "https:\/\/neverranked\.com\/pitch\/[^"]+\/"/, `"item": "https://neverranked.com/pitch/${args.slug}/"`],
  // UTM campaigns
  [new RegExp(`utm_campaign=${args.template}`, 'g'), `utm_campaign=${args.slug}`],
  // Tracking pixel
  [new RegExp(`/track/pitch/${args.template}`, 'g'), `/track/pitch/${args.slug}`],
];

// Recipient name swap, if we detected one. Skip if names happen to
// collide with common words.
if (templateRecipient && templateRecipient.length > 3) {
  swaps.push([new RegExp(`\\b${templateRecipient.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'g'), args.recipient]);
}

swapInFile(indexPath, swaps);
process.stdout.write(`[2/5] Metadata swapped in pitch/${args.slug}/index.html\n`);

// -----------------------------------------------------------------
// Swap content in og.html
// -----------------------------------------------------------------

const ogHtmlPath = resolve(newDir, 'og.html');
if (existsSync(ogHtmlPath)) {
  let og = readFileSync(ogHtmlPath, 'utf8');
  // Replace the kicker. Existing structure is
  //   <div class="kicker"><span>Private Brief</span> / For <Old>...</div>
  og = og.replace(
    /<div class="kicker"><span>[^<]+<\/span>[^<]*<\/div>/,
    `<div class="kicker"><span>Private Brief</span> / For ${args.company}</div>`
  );
  // Replace the recipient tag
  og = og.replace(
    /<span class="recipient-tag">[^<]+<\/span>/,
    `<span class="recipient-tag">${args.tag}</span>`
  );
  // Replace the h1
  og = og.replace(
    /<h1>[\s\S]+?<\/h1>/,
    `<h1>${args.h1}</h1>`
  );
  // Replace the meta line
  og = og.replace(
    /<div class="meta">[^<]+<\/div>/,
    `<div class="meta">Lance Roylo / Private brief, ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}</div>`
  );
  // Replace the URL line
  og = og.replace(
    /<div class="url">[^<]+<\/div>/,
    `<div class="url">neverranked.com/pitch/${args.slug}</div>`
  );
  writeFileSync(ogHtmlPath, og, 'utf8');
  process.stdout.write(`[3/5] OG template swapped in pitch/${args.slug}/og.html\n`);
}

// -----------------------------------------------------------------
// Render og.png + build dist/
// -----------------------------------------------------------------

if (args.render) {
  process.stdout.write('[4/5] Rendering og.png via capture-og-pitch.mjs...\n');
  const rend = spawnSync('node', ['scripts/capture-og-pitch.mjs', args.slug], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (rend.status !== 0) {
    process.stderr.write(`warning: OG render failed (exit ${rend.status}). Files written but og.png missing.\n`);
  } else {
    process.stdout.write(rend.stdout);
  }

  process.stdout.write('[5/5] Running build.sh...\n');
  const build = spawnSync('bash', ['scripts/build.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (build.status !== 0) {
    process.stderr.write(`warning: build.sh failed (exit ${build.status}). Run manually.\n`);
  }
} else {
  process.stdout.write('[4/5] --no-render set, skipping OG render and build.\n');
  process.stdout.write('[5/5] Skipped.\n');
}

// -----------------------------------------------------------------
// Tell the operator what is left to do
// -----------------------------------------------------------------

process.stdout.write(`
Scaffolded: pitch/${args.slug}/

Live URL (after deploy): https://neverranked.com/pitch/${args.slug}/

Next steps, in order:

1. Open pitch/${args.slug}/index.html and rewrite the 8 narrative
   sections to match this prospect:
     00 Why this exists (warm opener, reference the conversation)
     01 Both tools / approaches in one paragraph each
     02 Side-by-side capability table
     03 When the comparison subject is the right call
     04 When Never Ranked is the right call
     05 Case study (usually Hawaii Theatre at 97% citation rate)
     06 Pricing side by side
     07 Why NeverRanked, honestly
     08 Decision tree + audit offer + agency close

2. Verify the page renders correctly:
     open dist/pitch/${args.slug}/index.html

3. Voice-check the file before commit:
     grep -iE "unlock|leverage|effortless|seamless|—" pitch/${args.slug}/index.html

4. Commit and push:
     git add pitch/${args.slug}/ dist/pitch/${args.slug}/
     git commit -m "Pitch: <one-line>"
     git push

5. Verify in incognito:
     https://neverranked.com/pitch/${args.slug}/

6. Send the cover email with the URL.

`);
