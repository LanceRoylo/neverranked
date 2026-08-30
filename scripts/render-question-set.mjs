#!/usr/bin/env node
//
// render-question-set.mjs — regenerate a client's measured question set.
//
// WHY THIS EXISTS (2026-08-30): the delivered Question Set PDF was authored by
// hand, which cost us twice. It still carries the taxonomy retired on
// 2026-08-22 ("all seven AI engines"), and the verification hash convention
// was undocumented -- it had to be brute-forced back out of the artifact
// before this reissue could honestly stamp anything. Both are the same defect:
// a client-facing fact with no generator behind it drifts from the truth.
//
// The hash convention, now pinned by test and reproduced against the
// 2026-06-26 stamp on Prince's delivered set:
//
//     sha256( questions.sort().join("\n") )      // no trailing newline
//
// Sorted, so the stamp does not depend on row order in the database. A set
// that has not changed produces the SAME hash, which is the entire point: an
// unchanged hash is the proof, and minting a fresh one on an unchanged set
// would falsely imply the set moved.
//
// Client questions live in D1 and are read at run time, so this file carries
// no client data and is safe in a public repo.
//
//   node scripts/render-question-set.mjs <client-slug> [--out <dir>]
//
// Read-only against D1. Writes HTML + PDF to --out (default: cwd).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const slug = args[0];
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args[outIdx + 1] : process.cwd();
if (!slug || slug.startsWith("--")) {
  console.error("usage: node scripts/render-question-set.mjs <client-slug> [--out <dir>]");
  process.exit(2);
}

const DB = "neverranked-app";
const DASH = new URL("../dashboard/", import.meta.url).pathname;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function q(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { cwd: DASH, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const i = Math.min(...[out.indexOf("["), out.indexOf("{")].filter((n) => n >= 0));
  return JSON.parse(out.slice(i))[0].results;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- data -----------------------------------------------------------------
const S = slug.replace(/'/g, "''");
const cust = q(`SELECT name, category_label FROM customers WHERE client_slug='${S}'`)[0];
if (!cust) { console.error(`no customers row for ${slug}`); process.exit(1); }
const rows = q(`SELECT keyword FROM citation_keywords WHERE client_slug='${S}' ORDER BY id`);
const questions = rows.map((r) => r.keyword);
if (!questions.length) { console.error(`no citation_keywords for ${slug}`); process.exit(1); }

const setHash = createHash("sha256").update([...questions].sort().join("\n")).digest("hex");

// The base set is whatever was locked first; anything past 18 is client-added.
const BASE_N = 18;
const base = questions.slice(0, BASE_N);
const custom = questions.slice(BASE_N);
const blanks = Math.max(0, 30 - questions.length);

// ---- document -------------------------------------------------------------
// Taxonomy is the ONLY correct form (2026-08-22 reclassification): six AI
// tools plus a Bing organic control. Bing returns keyword-search results, not
// an AI answer, and calling it an AI engine is the claim we retracted.
const SURFACES = "six AI tools plus a Bing organic control, seven measured surfaces in all";

const li = (arr, start) => arr.map((k, i) =>
  `<li><span class="n">${start + i}.</span> ${esc(k)}</li>`).join("\n");

const html = `<meta charset="utf-8"><title>${esc(cust.name)} question set</title>
<style>
  @page { size: letter; margin: 0.72in 0.8in; }
  :root { --ink:#1a1a1a; --mid:#4a4a4a; --rule:#d8d2c6; --gold:#9a7b3f; --cream:#f7f4ee; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
         color:var(--ink); font-size:10.5pt; line-height:1.42; }
  .head { display:flex; justify-content:space-between; align-items:baseline;
          border-bottom:1.5px solid var(--ink); padding-bottom:6px; margin-bottom:18px; }
  .brand { font-weight:700; font-size:12.5pt; letter-spacing:.1px; }
  .brand span { color:var(--gold); }
  .kicker { font-family:-apple-system,"Helvetica Neue",sans-serif; font-size:7.6pt;
            letter-spacing:1.5px; text-transform:uppercase; color:var(--mid); }
  h1 { font-size:17.5pt; text-align:center; margin:0 0 5px; letter-spacing:.2px; }
  .sub { text-align:center; color:var(--mid); font-size:9.2pt; margin-bottom:15px; }
  p { margin:0 0 9px; }
  .lock { background:var(--cream); border-left:3px solid var(--gold);
          padding:11px 14px; margin:14px 0 16px; font-size:9.9pt; }
  .lock b { font-weight:700; }
  .hash { font-family:"SF Mono",Menlo,monospace; font-size:8.1pt; color:var(--mid);
          margin-top:9px; word-break:break-all; }
  h2 { font-family:-apple-system,"Helvetica Neue",sans-serif; font-size:9pt; letter-spacing:1.3px;
       text-transform:uppercase; color:var(--gold); margin:17px 0 8px; }
  .grp { font-family:-apple-system,"Helvetica Neue",sans-serif; font-size:8.2pt; letter-spacing:1.1px;
         text-transform:uppercase; color:var(--mid); margin:11px 0 5px; }
  ol { list-style:none; margin:0; padding:0; }
  ol li { padding:2.4px 0 2.4px 30px; position:relative; font-size:10pt; }
  ol li .n { position:absolute; left:0; width:24px; text-align:right; color:var(--mid); }
  .slot { border-bottom:1px solid var(--rule); padding:6.5px 0 3px; }
  .slot .n { color:var(--gold); font-weight:600; font-size:10pt; }
  .quiet { color:var(--mid); }
  .foot { border-top:1px solid var(--rule); margin-top:16px; padding-top:8px;
          text-align:center; color:var(--mid); font-size:8.4pt; }
</style>
<div class="head"><div class="brand">Never <span>Ranked</span> LLC</div>
  <div class="kicker">${esc(cust.name)} &middot; Question set</div></div>

<h1>THE MEASURED QUESTION SET</h1>
<div class="sub">${esc(cust.name)} &middot; ${esc(cust.category_label || "")} &middot; Honolulu, English-language market</div>

<p>These are the questions we put to ${SURFACES}, at least three times a month, every month.
They are the whole measurement. If a question is not on this list, we are not measuring it,
which is why the list is worth your attention before we start rather than after.</p>

<p class="quiet">One of those seven is a Bing organic control. It is classic keyword search, not
an answer engine, and we read it precisely so you can see how differently the AI tools behave.
We do not describe it as an AI engine, and earlier documents that did were corrected in
Amendment No. 1.</p>

<div class="lock">
  <b>The ${base.length} below are already locked.</b> They were fixed and hash-stamped on
  26 June 2026, before any measurement was taken, and they have not changed since. That is
  deliberate: a question set that can be edited after the results come in can be edited to
  flatter the results. Yours cannot.
  <div class="hash">query set hash &middot; ${setHash}</div>
</div>

<h2>The ${base.length} base questions</h2>
<div class="grp">Head intent &mdash; the broad questions with the most competition</div>
<ol>${li(base.slice(0, 9), 1)}</ol>
<div class="grp">Long tail &mdash; narrower questions, less competition, higher intent</div>
<ol>${li(base.slice(9), 10)}</ol>

<h2>Your 12</h2>
${custom.length ? `<ol>${li(custom, BASE_N + 1)}</ol>` : ""}
${blanks ? Array.from({ length: blanks }, (_, i) =>
  `<div class="slot"><span class="n">${questions.length + i + 1}</span></div>`).join("\n") : ""}

<p style="margin-top:13px">You can add up to twelve of your own, for thirty in total. They lock
with the rest when the baseline month starts, so it is worth taking a little time on them.</p>

<p><b>What makes a useful one.</b> Write the question a guest would type who does not yet know
${esc(cust.name)} exists. <span class="quiet">"Where should I stay in Honolulu with kids and a
pool" either finds you or it does not, and that is the thing worth watching. "Is ${esc(cust.name)}
nice" only tells us what an engine says about a hotel the guest has already chosen.</span> The
best sources are the trips you actually win: the Ala Moana shoppers, the golf package, the club
lounge, the marina view, the convention booking, whatever converts on your booking page.</p>

<p>Nothing here is irreversible. Until the baseline run you can add, cut, or reword anything on
this page, including our eighteen. After that you can still change the set, and every change is
logged with its date, so anyone reading a later report can see exactly what was measured in any
given month. The only cost is history: a reworded question is a new question and starts its own
record, and a deleted one takes its trend with it. What the lock prevents is a set being quietly
edited after a result comes in, which is the one thing that would make the whole measurement
worthless.</p>

<p><b>How to verify the stamp yourself.</b> Sort the questions alphabetically, join them with a
single newline between each, and take the SHA-256 of that text. It will equal the hash above.
If it ever does not, the set has changed and we owe you an explanation.</p>

<div class="foot">Never Ranked LLC &middot; Honolulu, Hawaii &middot; lance@hi.neverranked.com
&middot; neverranked.com/standards/methodology</div>`;

// DATED filename, always. A delivered client artifact is the record of what
// that client actually received, and a generator that can overwrite one is
// the same defect this script exists to remove. The undated
// `...-Question-Set.pdf` is the 2026-08-18 delivery; never write over it.
const today = new Date().toISOString().slice(0, 10);
const stem = `NeverRanked-${cust.name.replace(/[^A-Za-z0-9]+/g, "-")}-Question-Set-${today}`;
const htmlPath = join(outDir, `${stem}.html`);
const pdfPath = join(outDir, `${stem}.pdf`);
if (existsSync(pdfPath) && !args.includes("--force")) {
  console.error(`\n  refusing to overwrite ${pdfPath}\n  pass --force if that is genuinely what you want.\n`);
  process.exit(1);
}
writeFileSync(htmlPath, html);
execFileSync(CHROME, ["--headless", "--disable-gpu", "--no-pdf-header-footer",
  `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { stdio: "ignore" });

console.log(`\n  client     ${cust.name}`);
console.log(`  questions  ${questions.length} (${base.length} base + ${custom.length} custom, ${blanks} blank slots)`);
console.log(`  set hash   ${setHash}`);
console.log(`  pdf        ${pdfPath}\n`);
