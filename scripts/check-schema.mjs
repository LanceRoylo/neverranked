#!/usr/bin/env node
/**
 * check-schema.mjs — every JSON-LD block on every shipped page must parse.
 *
 * WHY THIS EXISTS. On 2026-08-18 a CSS-removal pass on index.html deleted a
 * line that happened to be a closing brace inside the homepage Organization
 * schema. The address object was left unclosed, so contactPoint and
 * potentialAction nested inside it and the whole block stopped parsing.
 *
 * Nothing caught it. The build passed, check-claims passed,
 * check-internal-links passed, the page rendered perfectly, and Playwright
 * saw no console error because invalid JSON-LD fails silently in a browser.
 * Google Search Console found it three days later and emailed about it.
 *
 * That is a bad way for an AEO company to learn its own structured data is
 * broken, and the failure mode is exactly the one this business sells
 * against: a machine-readable claim that no human ever looks at.
 *
 * Runs against dist/, so it checks what actually ships.
 *
 *   node scripts/check-schema.mjs
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".html")) out.push(p);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error("check-schema: dist/ not found — run scripts/build.sh first.");
  process.exit(1);
}

const RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const bad = [];
let blocks = 0;
const files = walk(DIST);

for (const f of files) {
  const html = readFileSync(f, "utf8");
  let m, i = 0;
  RE.lastIndex = 0;
  while ((m = RE.exec(html)) !== null) {
    i++; blocks++;
    try {
      const parsed = JSON.parse(m[1]);
      // A block that parses but carries no @type is not doing anything for
      // any engine, which is its own kind of broken.
      const types = Array.isArray(parsed) ? parsed : [parsed];
      for (const t of types) {
        if (t && typeof t === "object" && !t["@type"] && !t["@graph"]) {
          bad.push({ f, i, why: "parses but has no @type or @graph" });
        }
      }
    } catch (e) {
      bad.push({ f, i, why: String(e.message).slice(0, 120) });
    }
  }
}

if (bad.length) {
  console.error(`\n✗ check-schema: ${bad.length} bad JSON-LD block(s):\n`);
  for (const b of bad) {
    console.error(`  ${b.f.replace(DIST + "/", "")}  block #${b.i}`);
    console.error(`      ${b.why}\n`);
  }
  console.error("  Invalid structured data fails SILENTLY in a browser. Nothing");
  console.error("  else in this repo catches it. Fix before shipping.\n");
  process.exit(1);
}

console.log(`✓ check-schema: ${blocks} JSON-LD block(s) across ${files.length} page(s) all parse.`);
