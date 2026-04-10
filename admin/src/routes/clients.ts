// GET /clients — list view with stage filter

import type { Env, Client } from "../types";
import { isStage } from "../types";
import { esc, page, formatDate } from "../render";
import { layout } from "../views/layout";
import { stageBadge, planCell, stageFilterBar } from "../views/components";
import { listClients } from "../db";

export async function showClientsList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const stageParam = url.searchParams.get("stage");
  const filter = isStage(stageParam) ? { stage: stageParam } : undefined;
  const current = filter?.stage ?? "all";

  const clients = await listClients(env.DB, filter);

  const body = `
<div class="section-head">
  <h1><em>Clients.</em></h1>
  <div class="meta">§ ${clients.length} ${clients.length === 1 ? "client" : "clients"} shown</div>
</div>

${stageFilterBar(current)}

${renderTable(clients)}
`;

  return page(layout({ title: "Clients", nav: "clients", body }));
}

function renderTable(clients: Client[]): string {
  if (clients.length === 0) {
    return `
<div class="table-wrap">
  <table>
    <tbody><tr class="empty-row"><td>No clients in this view. <a href="/clients/new">Add one →</a></td></tr></tbody>
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
  <td>${planCell(c.plan)}</td>
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
        <th>Name</th>
        <th>Domain</th>
        <th>Stage</th>
        <th>Plan</th>
        <th>Contact</th>
        <th>Updated</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}
