/**
 * /admin/plans — view and assign plans to clients.
 *
 * One row per active client_slug. Shows: current plan (from
 * domains.plan), this-month schema usage, tracked-prompt count,
 * and a select-box to change the plan.
 *
 * The plan change is a single UPDATE to domains.plan. All quota
 * enforcement reads through getPlanForClient(), so the change takes
 * effect on the next generator call -- no cache to bust, no service
 * to restart.
 *
 * Manual onboarding for the first wave of Pulse customers happens
 * here: take a waitlist entry from admin_inbox, create the
 * domains row (or update existing), set plan='pulse', then add
 * 10 citation_keywords for them. Self-serve onboarding comes later.
 */
import type { Env, User } from "../types";
import { layout, html } from "../render";
import {
  getPlanLimits,
  countMonthlySchemas,
  countTrackedPrompts,
  type Plan,
} from "../lib/plan-limits";

interface ClientRow {
  client_slug: string;
  domain: string;
  plan: string | null;
  schemas_this_month: number;
  prompts_tracked: number;
  pulse_cap_schemas: number;
  pulse_cap_prompts: number;
  active: number;
}

export async function handleAdminPlans(request: Request, env: Env, user: User): Promise<Response> {
  if (user.role !== "admin") {
    return html(layout("Forbidden", `<div class="empty"><h3>Admin only</h3></div>`), 403);
  }

  const url = new URL(request.url);

  // Handle POST for plan changes.
  if (request.method === "POST") {
    const form = await request.formData();
    const slug = (form.get("client_slug") || "").toString();
    const plan = (form.get("plan") || "").toString().toLowerCase();
    if (!slug) return new Response("missing client_slug", { status: 400 });
    const validPlans = ["pulse", "signal", "amplify", "enterprise"];
    if (!validPlans.includes(plan)) return new Response("invalid plan", { status: 400 });
    await env.DB.prepare(
      "UPDATE domains SET plan = ?, updated_at = unixepoch() WHERE client_slug = ?"
    ).bind(plan, slug).run();
    return Response.redirect(`${url.origin}/admin/plans`, 303);
  }

  // GET: render the table.
  const domains = await env.DB.prepare(
    "SELECT client_slug, domain, plan, active FROM domains ORDER BY client_slug ASC"
  ).all<{ client_slug: string; domain: string; plan: string | null; active: number }>();

  const rows: ClientRow[] = [];
  for (const d of (domains.results || [])) {
    const [schemas, prompts] = await Promise.all([
      countMonthlySchemas(env, d.client_slug),
      countTrackedPrompts(env, d.client_slug),
    ]);
    const pulseLimits = getPlanLimits("pulse");
    rows.push({
      ...d,
      schemas_this_month: schemas,
      prompts_tracked: prompts,
      pulse_cap_schemas: pulseLimits.monthlySchemas,
      pulse_cap_prompts: pulseLimits.trackedPrompts,
    });
  }

  // Tier summary (stripe header bar)
  const planCounts: Record<string, number> = { pulse: 0, signal: 0, amplify: 0, enterprise: 0, unset: 0 };
  for (const r of rows) {
    const p = (r.plan || "unset").toLowerCase();
    planCounts[p] = (planCounts[p] || 0) + 1;
  }

  const summaryHtml = `
    <div style="display:flex;gap:16px;margin-bottom:24px">
      ${(["pulse", "signal", "amplify", "enterprise", "unset"] as const).map(p => `
        <div style="flex:1;padding:18px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
          <div style="font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">${p}</div>
          <div style="font-family:var(--serif);font-size:32px;color:var(--text);margin-top:6px">${planCounts[p] || 0}</div>
        </div>
      `).join("")}
    </div>
  `;

  const tableRows = rows.map(r => {
    const plan: Plan = (r.plan === "pulse" || r.plan === "signal" || r.plan === "amplify" || r.plan === "enterprise")
      ? r.plan as Plan : "signal";
    const limits = getPlanLimits(plan);
    const schemaCapDisplay = limits.monthlySchemas === -1 ? "∞" : `${limits.monthlySchemas}`;
    const promptCapDisplay = limits.trackedPrompts === -1 ? "∞" : `${limits.trackedPrompts}`;
    const schemaPct = limits.monthlySchemas === -1 ? 0 : Math.min(100, Math.round((r.schemas_this_month / limits.monthlySchemas) * 100));
    const promptPct = limits.trackedPrompts === -1 ? 0 : Math.min(100, Math.round((r.prompts_tracked / limits.trackedPrompts) * 100));
    const schemaWarn = schemaPct >= 100 ? "color:var(--red,#c14a3a)" : schemaPct >= 80 ? "color:var(--gold)" : "";
    const promptWarn = promptPct >= 100 ? "color:var(--red,#c14a3a)" : promptPct >= 80 ? "color:var(--gold)" : "";
    const inactive = r.active === 0 ? "opacity:.5" : "";
    return `
      <tr style="${inactive}">
        <td style="padding:10px 12px"><a href="/admin/clients/${encodeURIComponent(r.client_slug)}" style="color:var(--gold)">${r.client_slug}</a></td>
        <td style="padding:10px 12px;font-family:var(--mono);font-size:12px;color:var(--text-mute)">${r.domain}</td>
        <td style="padding:10px 12px">
          <form method="POST" action="/admin/plans" style="display:inline">
            <input type="hidden" name="client_slug" value="${r.client_slug}">
            <select name="plan" onchange="this.form.submit()" style="background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:6px 10px;font-family:var(--mono);font-size:12px;border-radius:3px">
              <option value="pulse" ${plan === "pulse" ? "selected" : ""}>Pulse</option>
              <option value="signal" ${plan === "signal" ? "selected" : ""}>Signal</option>
              <option value="amplify" ${plan === "amplify" ? "selected" : ""}>Amplify</option>
              <option value="enterprise" ${plan === "enterprise" ? "selected" : ""}>Enterprise</option>
            </select>
          </form>
        </td>
        <td style="padding:10px 12px;font-family:var(--mono);font-size:12px;${schemaWarn}">${r.schemas_this_month}/${schemaCapDisplay}</td>
        <td style="padding:10px 12px;font-family:var(--mono);font-size:12px;${promptWarn}">${r.prompts_tracked}/${promptCapDisplay}</td>
      </tr>
    `;
  }).join("");

  return html(layout("Plans & Quotas", `
    <div style="max-width:1100px;margin:0 auto;padding:24px">
      <h1 style="font-family:var(--serif);font-weight:400;margin:0 0 8px 0">Plans &amp; Quotas</h1>
      <p style="color:var(--text-mute);margin:0 0 24px 0">One row per client. Change the plan from the dropdown — applies on the next generator run.</p>
      ${summaryHtml}
      <table style="width:100%;border-collapse:collapse;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;overflow:hidden">
        <thead>
          <tr style="background:var(--bg-edge);text-align:left">
            <th style="padding:12px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Client</th>
            <th style="padding:12px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Domain</th>
            <th style="padding:12px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Plan</th>
            <th style="padding:12px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Schemas (this month)</th>
            <th style="padding:12px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Prompts</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="margin-top:32px;color:var(--text-faint);font-family:var(--mono);font-size:11px">
        Quotas reset on the 1st of each UTC month. Pulse: ${getPlanLimits("pulse").monthlySchemas} schemas/mo, ${getPlanLimits("pulse").trackedPrompts} prompts.
        Signal: unlimited schemas, ${getPlanLimits("signal").trackedPrompts} prompts. Amplify: unlimited schemas, ${getPlanLimits("amplify").trackedPrompts} prompts.
      </p>
    </div>
  `));
}
