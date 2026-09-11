#!/usr/bin/env node
/**
 * retire-claim.mjs — find every surface a retired claim still lives on.
 *
 * WHY THIS EXISTS. Three claims have been retired: the 45-to-95 score lift
 * (2026-05), Microsoft Copilot as a measured tool (2026-08-22), and the
 * weekly digest (2026-09-11). Each cleanup was partial, and the remainder
 * surfaced later by accident:
 *
 *   2026-09-10  the gate that guards PUBLIC SOCIAL still enforced the retired
 *               engine taxonomy, and four queued posts named Copilot. Found
 *               while chasing something else entirely.
 *   2026-09-10  57 cite-verb instances across 19 live pages, four days after
 *               the methodology page said the opposite.
 *   2026-09-11  the morning briefing priced MRR off two archived SKUs and had
 *               read $0 for five weeks.
 *   2026-09-11  a scheduled task armed for Monday to re-run a pre-registered
 *               test whose P1 hypothesis is about Copilot, and another on the
 *               20th expecting an Amplify subscription to renew.
 *
 * Retiring a claim in code does not retire it in the world. A claim lives in
 * source, in built output, in the marketing fuel registry, in queued and
 * published posts, in other repos, and in scheduled tasks that will wake up
 * weeks later and act on it. This walks all of them in one pass.
 *
 * It DECIDES NOTHING. It prints where the claim still is, grouped by surface,
 * so a human can rule on each. Some hits are correct: a grader names the
 * banned phrase in order to ban it, and a retraction page names what it
 * retracts. Those belong in an allowlist with a reason, not in a silent skip.
 *
 *   node scripts/retire-claim.mjs "Microsoft Copilot|\\bCopilot\\b"
 *   node scripts/retire-claim.mjs "amplify" --name "Amplify SKU"
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const pattern = process.argv[2];
if (!pattern) {
  console.error('usage: retire-claim.mjs "<regex>" [--name "label"]');
  process.exit(2);
}
const nameIdx = process.argv.indexOf("--name");
const label = nameIdx > -1 ? process.argv[nameIdx + 1] : pattern;
const re = new RegExp(pattern, "i");

const HOME = process.env.HOME;
const P = (p) => join(HOME, "Projects", p);

/** Every surface a claim can outlive its retirement on. The point of the
 *  list is that it is longer than anyone remembers unaided. */
const SURFACES = [
  { name: "site source (published)",   root: P("neverranked"),            skip: [/^dist\//, /^node_modules/, /^\.git/, /^\.claude\/worktrees/, /^scripts\/retire-claim/], ext: [".html"] },
  { name: "site build output",         root: P("neverranked/dist"),        skip: [/^node_modules/], ext: [".html", ".xml"] },
  { name: "app + tooling source",      root: P("neverranked"),             skip: [/^dist\//, /^node_modules/, /^\.git/, /^\.claude\/worktrees/, /node_modules/, /^scripts\/retire-claim/], ext: [".ts", ".mjs", ".js", ".sql"] },
  { name: "marketing fuel + queue",    root: P("neverranked-marketing"),   skip: [/^node_modules/, /^\.git/, /^\.claude\/worktrees/, /renders\//], ext: [".json", ".js", ".mjs", ".md"] },
  { name: "outreach worker",           root: P("neverranked-outreach"),    skip: [/^node_modules/, /^\.git/, /^\.claude\/worktrees/, /^dryrun\/out\//], ext: [".ts", ".mjs", ".js"] },
  { name: "brand + playbooks",         root: P("hello-momentum-agency/brand-guidelines"), skip: [], ext: [".md"] },
  { name: "SCHEDULED TASKS (wake up later and act)", root: join(HOME, ".claude", "scheduled-tasks"), skip: [], ext: [".md"] },
];

function walk(dir, root, skip, ext, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e);
    const rel = relative(root, full);
    if (skip.some((s) => s.test(rel))) continue;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, root, skip, ext, out);
    else if (ext.some((x) => e.endsWith(x))) out.push(full);
  }
  return out;
}

let total = 0;
const report = [];
for (const s of SURFACES) {
  if (!existsSync(s.root)) continue;
  const hits = [];
  for (const f of walk(s.root, s.root, s.skip, s.ext)) {
    let txt;
    try { txt = readFileSync(f, "utf8"); } catch { continue; }
    const lines = txt.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      hits.push({ file: relative(s.root, f), line: i + 1, text: lines[i].trim().slice(0, 110) });
    }
  }
  if (hits.length) { report.push({ surface: s.name, root: s.root, hits }); total += hits.length; }
}

console.log(`\nRETIREMENT SWEEP: ${label}\n${"=".repeat(60)}`);
if (!total) {
  console.log("No surface still carries it.\n");
  process.exit(0);
}
for (const r of report) {
  const byFile = new Map();
  for (const h of r.hits) byFile.set(h.file, (byFile.get(h.file) || 0) + 1);
  console.log(`\n${r.surface}  (${r.hits.length} in ${byFile.size} file${byFile.size === 1 ? "" : "s"})`);
  console.log(`  ${r.root}`);
  for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) {
    const first = r.hits.find((h) => h.file === f);
    console.log(`    ${String(n).padStart(3)}x  ${f}`);
    console.log(`         L${first.line}: ${first.text}`);
  }
}
console.log(`\n${"=".repeat(60)}`);
console.log(`${total} occurrence(s) across ${report.length} surface(s).`);
console.log(`Rule on each. A grader that names the phrase in order to ban it is`);
console.log(`correct and belongs in an allowlist with a reason, not a silent skip.`);
console.log(`A scheduled task is the one that will act on its own if left alone.\n`);
