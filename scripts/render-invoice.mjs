#!/usr/bin/env node
//
// render-invoice.mjs — monthly invoice for a measurement client.
//
// WHY THIS EXISTS (2026-08-30): the only invoice artifact on disk for Prince
// was NR-PW-001, hand-built 2026-07-16, and by launch it was wrong twice over.
// It billed the SUPERSEDED pricing ($4,500 kickoff + $1,500/month against an
// executed $750/month), and it described "baseline measurement across 7 AI
// engines" -- the taxonomy formally retracted in Amendment No. 1, which
// corrects Exhibit A of the very agreement the invoice bills against. Sending
// a client an invoice that contradicts their own contract is a credibility
// problem, not a clerical one.
//
// So: generated from D1 and from the executed terms, never hand-edited.
//
//   node scripts/render-invoice.mjs <client-slug> <YYYY-MM> --number NR-PW-002 [--out <dir>]
//
// Read-only against D1. Refuses to overwrite an existing invoice file.

import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const [slug, period] = args;
const numIdx = args.indexOf("--number");
const invoiceNo = numIdx >= 0 ? args[numIdx + 1] : null;
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args[outIdx + 1] : process.cwd();
if (!slug || !/^\d{4}-\d{2}$/.test(period || "") || !invoiceNo) {
  console.error("usage: node scripts/render-invoice.mjs <client-slug> <YYYY-MM> --number <INV-NO> [--out <dir>]");
  process.exit(2);
}

// Oahu GET visible pass-on rate. 4.0% state + 0.5% county surcharge grossed
// up, which is why it is 4.712% and not 4.5%. Matches NR-PW-001.
// Bill-to says "Attn: Accounts Payable", NOT the relationship contact's name.
// NR-PW-001 addressed it to the client's Director of Sales & Marketing "/
// Accounts Payable", which she is not. The relationship contact appears as
// c/o so the invoice still routes, without asserting a role they do not hold.
const GET_RATE = 0.04712;
const NET_DAYS = 15;

const DB = "neverranked-app";
const DASH = new URL("../dashboard/", import.meta.url).pathname;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function q(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { cwd: DASH, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const i = out.indexOf("[");
  return JSON.parse(out.slice(i))[0].results;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const c = q(`SELECT name, category_label, mrr_cents, primary_contact_name, primary_contact_email
             FROM customers WHERE client_slug='${slug.replace(/'/g, "''")}'`)[0];
if (!c) { console.error(`no customers row for ${slug}`); process.exit(1); }
if (!c.mrr_cents) { console.error(`mrr_cents is 0 or NULL for ${slug}; refusing to invoice an unpriced client`); process.exit(1); }

const [py, pm] = period.split("-").map(Number);
const periodLabel = new Date(Date.UTC(py, pm - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const issued = new Date(Date.UTC(py, pm - 1, 1));
const due = new Date(Date.UTC(py, pm - 1, 1 + NET_DAYS));
const fmt = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

const subtotal = c.mrr_cents / 100;
const get = Math.round(subtotal * GET_RATE * 100) / 100;
const total = subtotal + get;

const html = `<meta charset="utf-8"><title>${esc(c.name)} invoice ${esc(invoiceNo)}</title>
<style>
  @page { size: letter; margin: 0.8in; }
  :root { --ink:#1a1a1a; --mid:#555; --rule:#d8d2c6; --gold:#9a7b3f; --cream:#f7f4ee; }
  body { margin:0; font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
         color:var(--ink); font-size:10.6pt; line-height:1.5; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; }
  .brand { font-weight:700; font-size:14pt; }
  .brand span { color:var(--gold); }
  .addr { color:var(--mid); font-size:9.2pt; line-height:1.45; margin-top:5px; }
  .title { text-align:right; }
  .title h1 { margin:0; font-size:21pt; letter-spacing:1px; color:var(--gold); }
  .title div { color:var(--mid); font-size:9.2pt; margin-top:3px; }
  .title b { color:var(--ink); }
  .rule { border-top:2px solid var(--ink); margin:16px 0 18px; }
  .cols { display:flex; justify-content:space-between; gap:34px; margin-bottom:20px; }
  .lbl { font-family:-apple-system,"Helvetica Neue",sans-serif; font-size:7.6pt; letter-spacing:1.3px;
         text-transform:uppercase; color:var(--mid); margin-bottom:5px; }
  table { width:100%; border-collapse:collapse; }
  th { background:var(--ink); color:#fff; text-align:left; padding:8px 12px;
       font-family:-apple-system,"Helvetica Neue",sans-serif; font-size:7.8pt;
       letter-spacing:1.2px; text-transform:uppercase; font-weight:600; }
  th.r, td.r { text-align:right; }
  td { padding:12px; border-bottom:1px solid var(--rule); vertical-align:top; }
  .desc { color:var(--mid); font-size:9.3pt; margin-top:4px; }
  .totals { margin-left:auto; width:52%; margin-top:12px; }
  .totals div { display:flex; justify-content:space-between; padding:5px 12px; }
  .grand { background:var(--cream); font-weight:700; font-size:12.5pt; padding:11px 12px !important; }
  .note { background:var(--cream); border-left:3px solid var(--gold); padding:12px 15px;
          margin-top:22px; font-size:9.5pt; }
  .pay { margin-top:20px; font-size:9.5pt; }
  .foot { border-top:1px solid var(--rule); margin-top:24px; padding-top:9px;
          text-align:center; color:var(--mid); font-size:8.4pt; }
</style>
<div class="top">
  <div><div class="brand">Never <span>Ranked</span> LLC</div>
    <div class="addr">1121 Nuuanu Ave #104<br>Honolulu, HI 96817<br>lance@hi.neverranked.com</div></div>
  <div class="title"><h1>INVOICE</h1>
    <div>Invoice no. <b>${esc(invoiceNo)}</b></div>
    <div>Date: <b>${fmt(issued)}</b></div>
    <div>Due: <b>Net ${NET_DAYS}</b></div>
    <div>Terms: due by ${fmt(due)}</div></div>
</div>
<div class="rule"></div>
<div class="cols">
  <div><div class="lbl">Bill to</div>
    <b>${esc(c.name)}</b><br>Attn: Accounts Payable<br>
    <span style="color:var(--mid)">c/o ${esc(c.primary_contact_name || "")}</span></div>
  <div><div class="lbl">Engagement</div>
    AI Citation Measurement<br>Category: ${esc(c.category_label || "")}<br>Period: ${esc(periodLabel)}</div>
</div>
<table>
  <tr><th>Description</th><th class="r">Amount</th></tr>
  <tr><td><b>Monthly measurement &middot; ${esc(periodLabel)}</b>
    <div class="desc">The locked question set measured against six AI tools plus a Bing organic
    control, seven measured surfaces in all, run repeatedly through the month against the frozen
    baseline. Includes the monthly research memo, the prioritized punch list, the readiness
    cross-map, and ATLAS dashboard access.</div></td>
    <td class="r">$${money(subtotal)}</td></tr>
</table>
<div class="totals">
  <div><span>Subtotal</span><span>$${money(subtotal)}</span></div>
  <div><span>Hawaii GET (${(GET_RATE * 100).toFixed(3)}%)</span><span>$${money(get)}</span></div>
  <div class="grand"><span>Total due</span><span>$${money(total)}</span></div>
</div>
<div class="note">
  <b>Initial term.</b> Three-month initial term at $${money(subtotal)} per month plus applicable
  Hawaii GET, invoiced monthly, continuing month to month thereafter. The one-time $950
  baseline-month fee is waived for the initial term. Fees are for the research service and are
  not contingent on any citation, ranking, traffic, or revenue outcome. See the Client Services
  Agreement dated September 1, 2026 for full terms.
</div>
<div class="pay">
  <div class="lbl">Payment</div>
  Check payable to <b>Never Ranked LLC</b> at the address above, or ACH / wire on request.
  Please reference invoice <b>${esc(invoiceNo)}</b>.
</div>
<div class="foot">Never Ranked LLC &middot; Honolulu, Hawaii &middot; Thank you.</div>`;

const stem = `NeverRanked-${c.name.replace(/[^A-Za-z0-9]+/g, "-")}-Invoice-${invoiceNo}`;
const htmlPath = join(outDir, `${stem}.html`);
const pdfPath = join(outDir, `${stem}.pdf`);
if (existsSync(pdfPath) && !args.includes("--force")) {
  console.error(`\n  refusing to overwrite ${pdfPath}\n  an issued invoice is a financial record. Use a new --number.\n`);
  process.exit(1);
}
writeFileSync(htmlPath, html);
execFileSync(CHROME, ["--headless", "--disable-gpu", "--no-pdf-header-footer",
  `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { stdio: "ignore" });

console.log(`\n  ${invoiceNo}  ${c.name}  ${periodLabel}`);
console.log(`  subtotal  $${money(subtotal)}`);
console.log(`  GET       $${money(get)}   (${(GET_RATE * 100).toFixed(3)}%)`);
console.log(`  total     $${money(total)}   due ${fmt(due)}`);
console.log(`  pdf       ${pdfPath}\n`);
