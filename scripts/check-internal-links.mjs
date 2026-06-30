#!/usr/bin/env node
// check-internal-links.mjs — fail the build if any shipped page links to an
// internal path that does not resolve to a real file in dist/.
//
// This catches the "linked but frozen / soft-200 homepage fallback" class of
// bug: a page is referenced from the nav/body but its folder was never added
// to build.sh DIRS, so the Worker's single-page-application not_found_handling
// serves index.html at 200 and the dead link looks alive. See the
// build_dirs_whitelist_gotcha note. Runs in build.sh after dist/ is assembled.
//
// Only the homepage-fallback class is in scope: internal (root-relative) page
// and asset links. External URLs, mailto/tel, and same-page #anchors are
// skipped. Declared _redirects sources (e.g. /signin) count as resolving.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

if (!existsSync(DIST)) {
  console.error("check-internal-links: dist/ not found; run the build first.");
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

// Declared redirect sources resolve even without a backing file.
const redirectSources = new Set();
const redirectsPath = join(DIST, "_redirects");
if (existsSync(redirectsPath)) {
  for (const line of readFileSync(redirectsPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const src = t.split(/\s+/)[0];
    if (src && src.startsWith("/")) redirectSources.add(src.replace(/\/+$/, ""));
  }
}

function resolves(rawPath) {
  const p = rawPath.split("#")[0].split("?")[0];
  if (p === "") return true; // same-page query/anchor
  if (p === "/") return existsSync(join(DIST, "index.html"));
  if (redirectSources.has(p.replace(/\/+$/, ""))) return true;
  const candidates = [];
  if (p.endsWith("/")) {
    candidates.push(join(DIST, p, "index.html"));
  } else {
    const last = p.slice(p.lastIndexOf("/") + 1);
    if (last.includes(".")) candidates.push(join(DIST, p)); // asset or explicit .html
    else {
      candidates.push(join(DIST, p + "/index.html"));
      candidates.push(join(DIST, p + ".html"));
    }
  }
  return candidates.some((c) => existsSync(c));
}

const files = walk(DIST);
const linkRe = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
const dead = [];

for (const f of files) {
  const html = readFileSync(f, "utf8");
  const rel = "/" + f.slice(DIST.length + 1);
  const seen = new Set();
  let m;
  while ((m = linkRe.exec(html))) {
    const raw = m[1].trim();
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/#")) continue;
    const key = raw.split("#")[0].split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    if (!resolves(raw)) dead.push({ page: rel, link: key });
  }
}

if (dead.length) {
  console.error(`\n✗ check-internal-links: ${dead.length} dead internal link(s) (each would serve the homepage fallback at 200):`);
  const byPage = {};
  for (const d of dead) (byPage[d.page] ??= new Set()).add(d.link);
  for (const [page, links] of Object.entries(byPage)) {
    console.error(`  ${page}`);
    for (const l of links) console.error(`      -> ${l}`);
  }
  console.error(`\n  Fix: add the target folder to scripts/build.sh DIRS, or correct/remove the link.`);
  process.exit(1);
}
console.log(`✓ check-internal-links: all internal links resolve (${files.length} pages scanned).`);
