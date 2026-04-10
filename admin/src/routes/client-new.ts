// GET /clients/new + POST /clients

import type { Env } from "../types";
import { isStage, isPlan } from "../types";
import { esc, page, redirect, slugify } from "../render";
import { layout } from "../views/layout";
import { stageSelect, planSelect } from "../views/components";
import { createClient, getClientBySlug } from "../db";

interface FormState {
  name: string;
  slug: string;
  domain: string;
  contact_name: string;
  contact_email: string;
  stage: string;
  plan: string;
  notes: string;
  error?: string;
}

function form(state: FormState): string {
  const err = state.error ? `<div class="flash">${esc(state.error)}</div>` : "";
  return `
<div class="section-head">
  <h1>New <em>client.</em></h1>
  <div class="meta"><a href="/clients">← Back to clients</a></div>
</div>
${err}
<form class="form" method="POST" action="/clients">
  <div class="field">
    <label>Name</label>
    <input type="text" name="name" value="${esc(state.name)}" required autofocus />
    <div class="hint">Display name, e.g. "Montaic"</div>
  </div>
  <div class="field">
    <label>Slug</label>
    <input type="text" name="slug" value="${esc(state.slug)}" />
    <div class="hint">URL-safe identifier. Leave blank to auto-generate from name.</div>
  </div>
  <div class="field">
    <label>Domain</label>
    <input type="text" name="domain" value="${esc(state.domain)}" placeholder="example.com" />
  </div>
  <div class="field">
    <label>Contact name</label>
    <input type="text" name="contact_name" value="${esc(state.contact_name)}" />
  </div>
  <div class="field">
    <label>Contact email</label>
    <input type="email" name="contact_email" value="${esc(state.contact_email)}" />
  </div>
  <div class="field">
    <label>Stage</label>
    ${stageSelect((state.stage || "prospect") as any)}
  </div>
  <div class="field">
    <label>Plan</label>
    ${planSelect((state.plan || null) as any)}
  </div>
  <div class="field">
    <label>Notes (markdown)</label>
    <textarea name="notes">${esc(state.notes)}</textarea>
    <div class="hint">Supports # headings, **bold**, *italic*, \`code\`, - lists, [links](https://...)</div>
  </div>
  <div class="form-actions">
    <button type="submit" class="btn">Create client →</button>
    <a href="/clients" class="btn ghost">Cancel</a>
  </div>
</form>`;
}

export function showClientNew(): Response {
  const body = form({
    name: "",
    slug: "",
    domain: "",
    contact_name: "",
    contact_email: "",
    stage: "prospect",
    plan: "",
    notes: "",
  });
  return page(layout({ title: "New client", nav: "clients", body }));
}

export async function handleClientCreate(request: Request, env: Env): Promise<Response> {
  const fd = await request.formData();
  const name = String(fd.get("name") ?? "").trim();
  let slug = String(fd.get("slug") ?? "").trim();
  const domain = String(fd.get("domain") ?? "").trim();
  const contact_name = String(fd.get("contact_name") ?? "").trim();
  const contact_email = String(fd.get("contact_email") ?? "").trim();
  const stageRaw = String(fd.get("stage") ?? "prospect");
  const planRaw = String(fd.get("plan") ?? "");
  const notes = String(fd.get("notes") ?? "");

  const state: FormState = {
    name,
    slug,
    domain,
    contact_name,
    contact_email,
    stage: stageRaw,
    plan: planRaw,
    notes,
  };

  if (!name) {
    state.error = "Name is required.";
    return page(layout({ title: "New client", nav: "clients", body: form(state) }), { status: 400 });
  }

  if (!slug) slug = slugify(name);
  if (!slug) {
    state.error = "Could not generate a slug from the name. Provide one manually.";
    return page(layout({ title: "New client", nav: "clients", body: form(state) }), { status: 400 });
  }

  const existing = await getClientBySlug(env.DB, slug);
  if (existing) {
    state.error = `A client with slug "${slug}" already exists. Pick a different one.`;
    state.slug = slug;
    return page(layout({ title: "New client", nav: "clients", body: form(state) }), { status: 409 });
  }

  const stage = isStage(stageRaw) ? stageRaw : "prospect";
  const plan = isPlan(planRaw) ? planRaw : null;

  await createClient(env.DB, {
    slug,
    name,
    domain: domain || null,
    contact_name: contact_name || null,
    contact_email: contact_email || null,
    stage,
    plan,
    notes: notes || null,
  });

  return redirect(`/clients/${encodeURIComponent(slug)}`);
}
