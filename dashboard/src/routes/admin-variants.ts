/**
 * /admin/variants/<slug> — schema variant impact viewer.
 *
 * Lists every deployed variant for a client with its before/after
 * citation rate, lift, statistical confidence, and a human-readable
 * summary. This is where Lance (and eventually customers, on a
 * stripped view) can see "did our schema deployments actually move
 * citations or not?"
 *
 * No competitor in AEO has this view today. It's the layer that
 * proves the work works.
 */
import type { Env, User } from "../types";
import { layout, html } from "../render";
import { computeAllVariantImpacts, type VariantImpact } from "../lib/schema-impact";

export async function handleAdminVariants(
  clientSlug: string,
  user: User,
  env: Env,
): Promise<Response> {
  if (user.role !== "admin") {
    return html(layout("Forbidden", `<div class="empty"><h3>Admin only</h3></div>`), 403);
  }

  const impacts = await computeAllVariantImpacts(env, clientSlug);

  // Counts for the header bar
  const counts = {
    high: impacts.filter((i) => i.confidence === "high").length,
    medium: impacts.filter((i) => i.confidence === "medium").length,
    low: impacts.filter((i) => i.confidence === "low").length,
    insufficient: impacts.filter((i) => i.confidence === "insufficient").length,
  };

  const summaryBar = `
    <div style="display:flex;gap:14px;margin-bottom:24px">
      ${[
        { k: "high", label: "Significant lift", color: "var(--green,#4ade80)", n: counts.high },
        { k: "medium", label: "Suggestive", color: "var(--gold)", n: counts.medium },
        { k: "low", label: "No effect", color: "var(--text-faint)", n: counts.low },
        { k: "insufficient", label: "Need more data", color: "var(--text-mute)", n: counts.insufficient },
      ].map((b) => `
        <div style="flex:1;padding:16px 18px;background:var(--bg-lift);border:1px solid var(--line);border-left:3px solid ${b.color};border-radius:4px">
          <div style="font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">${b.label}</div>
          <div style="font-family:var(--serif);font-size:28px;color:var(--text);margin-top:4px">${b.n}</div>
        </div>
      `).join("")}
    </div>`;

  if (impacts.length === 0) {
    return html(layout("Variants", `
      <div style="max-width:760px;margin:0 auto;padding:24px">
        <h1 style="font-family:var(--serif);font-weight:400;margin:0 0 8px 0">Variant impact &middot; ${esc(clientSlug)}</h1>
        <p style="color:var(--text-mute);margin:0 0 24px 0">No deployed variants yet. Approve a schema in /admin/inject/${esc(clientSlug)} and impact data starts accruing immediately.</p>
      </div>
    `));
  }

  const rows = impacts.map((i) => renderRow(i)).join("");

  return html(layout("Variants", `
    <div style="max-width:1100px;margin:0 auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <h1 style="font-family:var(--serif);font-weight:400;margin:0">Variant impact &middot; ${esc(clientSlug)}</h1>
        <a href="/admin/plans" style="color:var(--gold);font-family:var(--mono);font-size:12px">All clients &rarr;</a>
      </div>
      <p style="color:var(--text-mute);margin:0 0 24px 0">
        Each row is one deployed schema variant. Citation rate measured 4 weeks before vs. 4 weeks after deploy, with a 7-day blackout at the boundary. Two-proportion z-test for significance.
      </p>
      ${summaryBar}
      <div style="display:flex;flex-direction:column;gap:14px">${rows}</div>
      <p style="margin-top:32px;color:var(--text-faint);font-family:var(--mono);font-size:11px;line-height:1.6">
        Methodology: variants are auto-assigned (A, B, C, ...) per (client, type, target) tuple. When a new variant deploys, the prior one is marked superseded. We attribute citation_runs by run_at vs. deployed_at/superseded_at. Both windows need at least 20 runs to score; below that we say so instead of guessing.
      </p>
    </div>
  `));
}

function renderRow(i: VariantImpact): string {
  const confColors: Record<VariantImpact["confidence"], string> = {
    high: "var(--green,#4ade80)",
    medium: "var(--gold)",
    low: "var(--text-faint)",
    insufficient: "var(--text-mute)",
  };
  const arrow = i.lift_pp > 0 ? "▲" : i.lift_pp < 0 ? "▼" : "—";
  const arrowColor = i.lift_pp > 0 ? "var(--green,#4ade80)" : i.lift_pp < 0 ? "var(--red,#ef4444)" : "var(--text-faint)";
  const deployed = new Date(i.deployed_at * 1000).toISOString().slice(0, 10);
  const superseded = i.superseded_at ? new Date(i.superseded_at * 1000).toISOString().slice(0, 10) : "live";
  let target = "";
  try { const arr = JSON.parse(i.target_pages); target = Array.isArray(arr) ? arr[0] || "" : ""; } catch {}

  return `
    <div style="padding:18px 22px;background:var(--bg-lift);border:1px solid var(--line);border-left:3px solid ${confColors[i.confidence]};border-radius:4px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;font-family:var(--mono);font-size:12px">
        <div>
          <strong style="color:var(--text)">${esc(i.schema_type)}${i.variant ? `-${esc(i.variant)}` : ""}</strong>
          <span style="color:var(--text-faint)"> &middot; ${esc(target || "(no target)")}</span>
        </div>
        <div style="color:var(--text-faint)">deployed ${deployed} &middot; ${superseded}</div>
      </div>
      <div style="display:flex;gap:24px;align-items:baseline;margin-bottom:10px">
        <div style="font-family:var(--mono);font-size:12px;color:var(--text-mute)">
          control: <strong style="color:var(--text)">${(i.control.rate * 100).toFixed(1)}%</strong>
          <span style="color:var(--text-faint)"> (${i.control.cited}/${i.control.runs})</span>
        </div>
        <div style="font-family:var(--mono);font-size:12px;color:var(--text-mute)">
          test: <strong style="color:var(--text)">${(i.test.rate * 100).toFixed(1)}%</strong>
          <span style="color:var(--text-faint)"> (${i.test.cited}/${i.test.runs})</span>
        </div>
        <div style="font-family:var(--mono);font-size:14px;color:${arrowColor}">
          ${arrow} ${Math.abs(i.lift_pp).toFixed(1)} pp
        </div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.1em;margin-left:auto">
          ${i.confidence}${i.confidence !== "insufficient" ? ` &middot; p=${i.p_value.toFixed(3)}` : ""}
        </div>
      </div>
      <p style="margin:0;font-size:13px;line-height:1.6;color:var(--text-soft)">${esc(i.summary)}</p>
    </div>`;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
