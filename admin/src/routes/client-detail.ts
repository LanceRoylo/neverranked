// GET /clients/:slug + POST /clients/:slug

import type { Env } from "../types";
import { isStage, isPlan } from "../types";
import { esc, page, redirect, formatDate, renderNotes, trust } from "../render";
import { layout } from "../views/layout";
import { stageBadge, planCell, stageSelect, planSelect } from "../views/components";
import { getClientBySlug, updateClient } from "../db";

export async function showClientDetail(
  _request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const client = await getClientBySlug(env.DB, slug);
  if (!client) {
    return page(
      layout({
        title: "Not found",
        nav: "clients",
        body: `
<div class="section-head">
  <h1>Not <em>found.</em></h1>
  <div class="meta"><a href="/clients">← Back</a></div>
</div>
<p class="muted">No client with slug <code>${esc(slug)}</code>.</p>`,
      }),
      { status: 404 },
    );
  }

  const notesHtml = renderNotes(client.notes);
  const auditFolder = `audits/${client.slug}/`;

  const body = `
<div class="section-head">
  <h1>${esc(client.name)}<em>.</em></h1>
  <div class="meta">
    <a href="/clients">← All clients</a>
    &nbsp;·&nbsp;
    Created ${formatDate(client.created_at)}
    &nbsp;·&nbsp;
    Updated ${formatDate(client.updated_at)}
  </div>
</div>

<div class="detail-grid">
  <aside>
    <div class="card">
      <h2>§ Identity</h2>
      <dl class="detail-kv">
        <dt>Slug</dt>
        <dd><code>${esc(client.slug)}</code></dd>
        <dt>Domain</dt>
        <dd>${
          client.domain
            ? `<a href="https://${esc(client.domain)}" target="_blank" rel="noopener">${esc(client.domain)}</a>`
            : `<span class="muted">—</span>`
        }</dd>
        <dt>Stage</dt>
        <dd>${stageBadge(client.stage)}</dd>
        <dt>Plan</dt>
        <dd>${planCell(client.plan)}</dd>
      </dl>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>§ Contact</h2>
      <dl class="detail-kv">
        <dt>Name</dt>
        <dd>${client.contact_name ? esc(client.contact_name) : `<span class="muted">—</span>`}</dd>
        <dt>Email</dt>
        <dd>${
          client.contact_email
            ? `<a href="mailto:${esc(client.contact_email)}">${esc(client.contact_email)}</a>`
            : `<span class="muted">—</span>`
        }</dd>
      </dl>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>§ Audit folder</h2>
      <p class="muted" style="margin:0;font-size:12px">
        Local: <code>${esc(auditFolder)}</code>
      </p>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>§ Update</h2>
      <form method="POST" action="/clients/${esc(client.slug)}" class="form">
        <div class="field">
          <label>Stage</label>
          ${stageSelect(client.stage)}
        </div>
        <div class="field">
          <label>Plan</label>
          ${planSelect(client.plan)}
        </div>
        <div class="field">
          <label>Domain</label>
          <input type="text" name="domain" value="${esc(client.domain ?? "")}" />
        </div>
        <div class="field">
          <label>Contact name</label>
          <input type="text" name="contact_name" value="${esc(client.contact_name ?? "")}" />
        </div>
        <div class="field">
          <label>Contact email</label>
          <input type="email" name="contact_email" value="${esc(client.contact_email ?? "")}" />
        </div>
        <div class="field">
          <label>Notes (markdown)</label>
          <textarea name="notes">${esc(client.notes ?? "")}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">Save →</button>
        </div>
      </form>
    </div>
  </aside>

  <div class="detail-notes">
    ${notesHtml || `<p class="muted"><em>No notes yet. Use the form to add them.</em></p>`}
  </div>
</div>`;

  return page(layout({ title: client.name, nav: "clients", body }));
}

export async function handleClientUpdate(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const existing = await getClientBySlug(env.DB, slug);
  if (!existing) {
    return new Response("Not found", { status: 404 });
  }

  const fd = await request.formData();
  const stageRaw = String(fd.get("stage") ?? "");
  const planRaw = String(fd.get("plan") ?? "");
  const domain = String(fd.get("domain") ?? "").trim();
  const contact_name = String(fd.get("contact_name") ?? "").trim();
  const contact_email = String(fd.get("contact_email") ?? "").trim();
  const notes = String(fd.get("notes") ?? "");

  await updateClient(env.DB, slug, {
    stage: isStage(stageRaw) ? stageRaw : undefined,
    plan: isPlan(planRaw) ? planRaw : planRaw === "" ? null : undefined,
    domain: domain || null,
    contact_name: contact_name || null,
    contact_email: contact_email || null,
    notes: notes || null,
  });

  return redirect(`/clients/${encodeURIComponent(slug)}`);
}
