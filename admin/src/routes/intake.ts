// GET /intake + POST /intake/:id/convert + POST /intake/:id/status

import type { Env, IntakeSubmission } from "../types";
import { isIntakeStatus } from "../types";
import { esc, page, redirect, formatDate, slugify } from "../render";
import { layout } from "../views/layout";
import { intakeStatusBadge, intakeFilterBar } from "../views/components";
import {
  listIntake,
  getIntake,
  setIntakeStatus,
  createClient,
  linkIntakeToClient,
  getClientBySlug,
} from "../db";

export async function showIntakeList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const filter = isIntakeStatus(statusParam) ? { status: statusParam } : undefined;
  const current = filter?.status ?? "all";

  const items = await listIntake(env.DB, filter);

  const body = `
<div class="section-head">
  <h1><em>Intake.</em></h1>
  <div class="meta">§ ${items.length} ${items.length === 1 ? "submission" : "submissions"} shown</div>
</div>

${intakeFilterBar(current)}

${renderTable(items)}
`;

  return page(layout({ title: "Intake", nav: "intake", body }));
}

function renderTable(items: IntakeSubmission[]): string {
  if (items.length === 0) {
    return `
<div class="table-wrap">
  <table>
    <tbody><tr class="empty-row"><td>No submissions in this view.</td></tr></tbody>
  </table>
</div>`;
  }

  const rows = items
    .map((i) => {
      const actions =
        i.status === "converted"
          ? `<span class="muted">— converted —</span>`
          : `
<div class="row-actions">
  <form method="POST" action="/intake/${i.id}/convert">
    <button type="submit" title="Convert to client">Convert →</button>
  </form>
  <form method="POST" action="/intake/${i.id}/status">
    <input type="hidden" name="status" value="contacted" />
    <button type="submit">Mark contacted</button>
  </form>
  <form method="POST" action="/intake/${i.id}/status">
    <input type="hidden" name="status" value="rejected" />
    <button type="submit">Reject</button>
  </form>
</div>`;

      const goalsSnippet = i.goals ? esc(i.goals.slice(0, 120)) + (i.goals.length > 120 ? "…" : "") : "";

      return `
<tr>
  <td class="mono">${esc(i.email)}</td>
  <td class="muted mono">${esc(i.domain)}</td>
  <td>${intakeStatusBadge(i.status)}</td>
  <td class="muted">${goalsSnippet || "—"}</td>
  <td class="muted mono">${formatDate(i.created_at)}</td>
  <td>${actions}</td>
</tr>`;
    })
    .join("");

  return `
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Email</th>
        <th>Domain</th>
        <th>Status</th>
        <th>Goals</th>
        <th>Received</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

export async function handleIntakeConvert(
  _request: Request,
  env: Env,
  id: number,
): Promise<Response> {
  const intake = await getIntake(env.DB, id);
  if (!intake) return new Response("Not found", { status: 404 });
  if (intake.status === "converted") {
    return redirect("/intake");
  }

  // Build a new client from the intake row
  let baseSlug = slugify(intake.domain.replace(/^www\./, "").split(".")[0] ?? intake.email.split("@")[0]);
  if (!baseSlug) baseSlug = `client-${id}`;

  // Ensure uniqueness
  let slug = baseSlug;
  let suffix = 2;
  while (await getClientBySlug(env.DB, slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  const name = intake.name || intake.domain;
  const clientId = await createClient(env.DB, {
    slug,
    name,
    domain: intake.domain,
    contact_name: intake.name ?? null,
    contact_email: intake.email,
    stage: "prospect",
    plan: null,
    notes: intake.goals
      ? `# Converted from intake\n\n## Stated goals\n\n${intake.goals}\n`
      : `# Converted from intake\n`,
  });

  await linkIntakeToClient(env.DB, id, clientId);
  return redirect(`/clients/${encodeURIComponent(slug)}`);
}

export async function handleIntakeStatus(
  request: Request,
  env: Env,
  id: number,
): Promise<Response> {
  const fd = await request.formData();
  const status = String(fd.get("status") ?? "");
  if (!isIntakeStatus(status)) {
    return new Response("Invalid status", { status: 400 });
  }
  const intake = await getIntake(env.DB, id);
  if (!intake) return new Response("Not found", { status: 404 });
  await setIntakeStatus(env.DB, id, status);
  return redirect("/intake");
}
