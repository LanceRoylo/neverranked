/**
 * readiness-crossmap.ts — renders the readiness cross-map for a monthly readout.
 *
 * Exhibit A lists this among the Deliverables. It answers a different question
 * from the citation charts beside it:
 *
 *   Citation data  — can an AI engine TALK about you. Observational. You do
 *                    not control it.
 *   This           — can an AI agent DO something with you: book, apply, buy,
 *                    contact. Structural. You control it entirely.
 *
 * It makes no causal claim. Deploying Action schema does not make an engine
 * cite you, and the 2026-05 retraction is what happens when someone says
 * otherwise. Standard: /standards/agent-readiness/
 *
 * The four states exist because flattening them into "0" is how you tell a
 * client a competitor is ahead of them on the strength of WordPress defaults.
 * An unverifiable competitor is never rendered as a zero.
 */
const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface CrossMapRow {
  domain: string;
  label: string | null;
  isOwned: boolean;
  score: number | null;
  grade: string | null;
  state: string;
}

const STATE_LABEL: Record<string, string> = {
  deployed: "Deployed",
  off_baseline: "Other actions only",
  boilerplate_only: "CMS default only",
  verified_zero: "None",
  unverifiable: "Could not verify",
};

const STATE_NOTE: Record<string, string> = {
  deployed: "Machine-readable booking or contact actions an agent can call.",
  off_baseline: "Deliberate Action markup, but not the kind this category needs.",
  boilerplate_only: "Only what the content system emits by default. An agent still cannot act.",
  verified_zero: "Scanned cleanly. No Action markup present.",
  unverifiable: "The site refused automated inspection. We do not publish a score we could not take.",
};

export function renderReadinessCrossMap(rows: CrossMapRow[], scannedAt?: number): string {
  if (!rows || rows.length === 0) return "";

  const verified = rows.filter((r) => r.state !== "unverifiable");
  const blocked = rows.filter((r) => r.state === "unverifiable");
  const deployed = verified.filter((r) => r.state === "deployed");
  const you = rows.find((r) => r.isOwned);

  const order = ["deployed", "off_baseline", "boilerplate_only", "verified_zero", "unverifiable"];
  const sorted = [...rows].sort((a, b) => {
    if (a.isOwned !== b.isOwned) return a.isOwned ? -1 : 1;
    return order.indexOf(a.state) - order.indexOf(b.state);
  });

  const body = sorted.map((r) => {
    const name = esc(r.label || r.domain);
    const val = r.state === "unverifiable" ? "&mdash;" : `${r.score ?? 0}`;
    return `<tr${r.isOwned ? ' class="own"' : ""}>
      <td>${name}${r.isOwned ? " <strong>(you)</strong>" : ""}</td>
      <td class="num">${val}</td>
      <td>${esc(STATE_LABEL[r.state] || r.state)}</td>
    </tr>`;
  }).join("");

  // The headline sentence is assembled from counts, never asserted. If the
  // category ever does deploy, this says so instead.
  let headline: string;
  if (deployed.length === 0) {
    headline = `Of the ${verified.length} site${verified.length === 1 ? "" : "s"} we could inspect, including yours, none exposes actions an AI agent could use to book or make contact.`;
  } else {
    const names = deployed.map((d) => esc(d.label || d.domain)).join(", ");
    headline = `${deployed.length} of the ${verified.length} sites we could inspect expose usable agent actions: ${names}.`;
  }

  const youLine = you
    ? you.state === "unverifiable"
      ? "Your own site refused the scan, so this month reports nothing for it. That is worth fixing before the next reading."
      : `Your own site scores ${you.score ?? 0}. ${esc(STATE_NOTE[you.state] || "")}`
    : "";

  const blockedLine = blocked.length
    ? `<p class="nr-cnote">${blocked.length} of ${rows.length} sites refused automated inspection: ${blocked.map((b) => esc(b.label || b.domain)).join(", ")}. They are shown as unmeasured rather than as zero. We do not publish a number we did not take.</p>`
    : "";

  const when = scannedAt ? new Date(scannedAt * 1000).toISOString().slice(0, 10) : "";

  return `<section class="nr-chart">
    <h3 class="nr-ctitle">Readiness cross-map</h3>
    <p class="nr-cnote">${headline} ${youLine}</p>
    <div class="table-wrap"><table class="nr-table">
      <thead><tr><th>Site</th><th class="num">Score</th><th>Agent actions</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    ${blockedLine}
    <p class="nr-cnote">Separate from the citation figures above and not a cause of them. This measures whether the machine-readable instructions exist for an agent to complete a task on a site. Deploying them does not make an AI engine cite you. Method at <a href="/standards/agent-readiness/">/standards/agent-readiness/</a>.${when ? ` Scanned ${esc(when)}.` : ""}</p>
  </section>`;
}
