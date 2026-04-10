// GET / — home dashboard. Three sections: this week, pipeline counts, recent intake.

import type { Env, Client, IntakeSubmission } from "../types";
import { STAGES, STAGE_LABELS } from "../types";
import { esc, page, formatDate } from "../render";
import { layout } from "../views/layout";
import { stageBadge, intakeStatusBadge } from "../views/components";
import { countClientsByStage, listClients, listIntake } from "../db";

export async function showHome(_request: Request, env: Env): Promise<Response> {
  const [counts, activeClients, recentIntake] = await Promise.all([
    countClientsByStage(env.DB),
    listClients(env.DB),
    listIntake(env.DB, { limit: 5 }),
  ]);

  const thisWeek = activeClients
    .filter((c) => c.stage !== "churned" && c.stage !== "prospect")
    .slice(0, 6);

  const body = `
<div class="section-head">
  <h1>On <em>deck.</em></h1>
  <div class="meta">§ ${new Date().toISOString().slice(0, 10)}</div>
</div>

${renderStats(counts)}

<div class="section-head" style="margin-top:8px">
  <h1 style="font-size:22px">This <em>week</em></h1>
  <div class="meta">Non-prospect, non-churned — most recently updated</div>
</div>
${renderOnDeck(thisWeek)}

<div class="section-head" style="margin-top:36px">
  <h1 style="font-size:22px">Recent <em>intake</em></h1>
  <div class="meta"><a href="/intake">View all →</a></div>
</div>
${renderRecentIntake(recentIntake)}
`;

  return page(layout({ title: "Dashboard", nav: "home", body }));
}

function renderStats(counts: Record<string, number>): string {
  const cells = STAGES.map((s) => {
    const n = counts[s] ?? 0;
    return `
    <div class="stat">
      <a href="/clients?stage=${esc(s)}">
        <div class="label">${esc(STAGE_LABELS[s])}</div>
        <div class="value">${n}</div>
      </a>
    </div>`;
  }).join("");
  return `<div class="stats">${cells}</div>`;
}

function renderOnDeck(clients: Client[]): string {
  if (clients.length === 0) {
    return `
<div class="table-wrap">
  <table>
    <tbody><tr class="empty-row"><td>Nothing on deck yet. When you move a client past <b>prospect</b>, they show up here.</td></tr></tbody>
  </table>
</div>`;
  }
  const rows = clients
    .map(
      (c) => `
<tr>
  <td><a href="/clients/${esc(c.slug)}">${esc(c.name)}</a></td>
  <td class="muted mono">${esc(c.domain ?? "—")}</td>
  <td>${stageBadge(c.stage)}</td>
  <td class="muted">${esc(c.contact_email ?? "—")}</td>
  <td class="muted mono">${formatDate(c.updated_at)}</td>
</tr>`,
    )
    .join("");
  return `
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Client</th>
        <th>Domain</th>
        <th>Stage</th>
        <th>Contact</th>
        <th>Updated</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

function renderRecentIntake(items: IntakeSubmission[]): string {
  if (items.length === 0) {
    return `
<div class="table-wrap">
  <table>
    <tbody><tr class="empty-row"><td>No intake submissions yet. When the marketing site POSTs to /api/intake, they land here.</td></tr></tbody>
  </table>
</div>`;
  }
  const rows = items
    .map(
      (i) => `
<tr>
  <td class="mono">${esc(i.email)}</td>
  <td class="muted mono">${esc(i.domain)}</td>
  <td>${intakeStatusBadge(i.status)}</td>
  <td class="muted mono">${formatDate(i.created_at)}</td>
</tr>`,
    )
    .join("");
  return `
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Email</th>
        <th>Domain</th>
        <th>Status</th>
        <th>Received</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}
