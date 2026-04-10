// Small rendering helpers used across pages.

import { esc } from "../render";
import {
  STAGE_LABELS,
  PLAN_LABELS,
  INTAKE_STATUS_LABELS,
  STAGES,
  PLANS,
  INTAKE_STATUSES,
} from "../types";
import type { Stage, Plan, IntakeStatus } from "../types";

export function stageBadge(stage: string): string {
  const cls = `badge badge-${esc(stage)}`;
  const label = (STAGE_LABELS as Record<string, string>)[stage] ?? stage;
  return `<span class="${cls}">${esc(label)}</span>`;
}

export function intakeStatusBadge(status: string): string {
  const cls = `badge badge-${esc(status)}`;
  const label = (INTAKE_STATUS_LABELS as Record<string, string>)[status] ?? status;
  return `<span class="${cls}">${esc(label)}</span>`;
}

export function planCell(plan: string | null): string {
  if (!plan) return `<span class="badge">—</span>`;
  const label = (PLAN_LABELS as Record<string, string>)[plan] ?? plan;
  return `<span class="badge">${esc(label)}</span>`;
}

export function stageSelect(current?: Stage | null, name = "stage"): string {
  const options = STAGES.map(
    (s) =>
      `<option value="${esc(s)}" ${s === current ? "selected" : ""}>${esc(STAGE_LABELS[s])}</option>`,
  ).join("");
  return `<select name="${esc(name)}">${options}</select>`;
}

export function planSelect(current?: Plan | null, name = "plan"): string {
  const options = [
    `<option value="" ${!current ? "selected" : ""}>— no plan —</option>`,
    ...PLANS.map(
      (p) =>
        `<option value="${esc(p)}" ${p === current ? "selected" : ""}>${esc(PLAN_LABELS[p])}</option>`,
    ),
  ].join("");
  return `<select name="${esc(name)}">${options}</select>`;
}

export function intakeStatusSelect(current?: IntakeStatus | null, name = "status"): string {
  const options = INTAKE_STATUSES.map(
    (s) =>
      `<option value="${esc(s)}" ${s === current ? "selected" : ""}>${esc(INTAKE_STATUS_LABELS[s])}</option>`,
  ).join("");
  return `<select name="${esc(name)}">${options}</select>`;
}

export function stageFilterBar(current: string): string {
  const mk = (key: string, label: string) => {
    const active = current === key ? "active" : "";
    const href = key === "all" ? "/clients" : `/clients?stage=${esc(key)}`;
    return `<a href="${href}" class="${active}">${esc(label)}</a>`;
  };
  return `
<div class="filter-bar">
  <div class="filters">
    ${mk("all", "All")}
    ${STAGES.map((s) => mk(s, STAGE_LABELS[s])).join("\n    ")}
  </div>
  <a href="/clients/new" class="btn">+ New client</a>
</div>`;
}

export function intakeFilterBar(current: string): string {
  const mk = (key: string, label: string) => {
    const active = current === key ? "active" : "";
    const href = key === "all" ? "/intake" : `/intake?status=${esc(key)}`;
    return `<a href="${href}" class="${active}">${esc(label)}</a>`;
  };
  return `
<div class="filter-bar">
  <div class="filters">
    ${mk("all", "All")}
    ${INTAKE_STATUSES.map((s) => mk(s, INTAKE_STATUS_LABELS[s])).join("\n    ")}
  </div>
  <span class="meta" style="font-family:var(--label);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">§ Inbound audit requests</span>
</div>`;
}
