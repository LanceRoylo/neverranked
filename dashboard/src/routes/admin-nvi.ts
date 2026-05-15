/**
 * Admin NVI inbox + approve flow.
 *
 *   GET  /admin/nvi                  list of all reports, filter by status
 *   GET  /admin/nvi/preview/:id      HTML preview (already wired in index.ts)
 *   GET  /admin/nvi/pdf/:id          download the rendered PDF from R2
 *   POST /admin/nvi/render/:id       (re)render PDF + store in R2
 *   POST /admin/nvi/approve/:id      mark approved, ready for send
 *   POST /admin/nvi/send/:id         email PDF to subscription's delivery_email
 *   POST /admin/nvi/run/:slug        trigger runner for current month
 *
 * Human-in-the-loop: status flow is
 *   pending --(admin reviews + approves)--> approved --(send)--> sent
 * Nothing leaves Neverranked without a human ack.
 */
import type { Env, User } from "../types";
import { html, layout, redirect, esc } from "../render";

interface ReportListRow {
  id: number;
  client_slug: string;
  reporting_period: string;
  tier: string;
  ai_presence_score: number;
  prev_score: number | null;
  status: string;
  generated_at: number;
  approved_at: number | null;
  sent_at: number | null;
  pdf_r2_key: string | null;
}

export async function handleNviInbox(user: User, env: Env, url: URL): Promise<Response> {
  if (user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const statusFilter = url.searchParams.get("status") || "all";
  const where = statusFilter === "all" ? "" : "WHERE status = ?";
  const stmt = statusFilter === "all"
    ? env.DB.prepare(`SELECT * FROM nvi_reports ORDER BY generated_at DESC LIMIT 100`)
    : env.DB.prepare(`SELECT * FROM nvi_reports ${where} ORDER BY generated_at DESC LIMIT 100`).bind(statusFilter);

  const rows = (await stmt.all<ReportListRow>()).results;

  const fmt = (ts: number | null) =>
    ts ? new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";

  const statusBadge = (s: string): string => {
    const colors: Record<string, string> = {
      pending: "var(--gold)",
      approved: "#4ade80",
      sent: "var(--text-faint)",
      failed: "var(--red)",
    };
    const color = colors[s] || "var(--text-faint)";
    return `<span style="display:inline-block;padding:2px 8px;border:1px solid ${color};border-radius:2px;font-family:var(--label);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${color}">${esc(s)}</span>`;
  };

  const filterTab = (s: string, label: string): string => {
    const active = statusFilter === s;
    return `<a href="/admin/nvi?status=${s}" style="padding:6px 14px;border:1px solid var(--line);border-radius:2px;font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:${active ? "var(--gold)" : "var(--text-faint)"};${active ? "border-color:var(--gold);" : ""}text-decoration:none">${label}</a>`;
  };

  const body = `
    <div class="section-header">
      <h1>NVI Inbox</h1>
      <div class="section-sub">Monthly report review and delivery</div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:24px">
      ${filterTab("all", "All")}
      ${filterTab("pending", "Pending review")}
      ${filterTab("approved", "Approved, not sent")}
      ${filterTab("sent", "Sent")}
      ${filterTab("failed", "Failed")}
    </div>

    ${rows.length === 0 ? `
      <div style="padding:32px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;text-align:center;color:var(--text-faint)">
        No NVI reports in this view.
      </div>
    ` : `
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:var(--text-soft)">
        <thead>
          <tr style="border-bottom:1px solid var(--line-strong);text-align:left">
            <th style="padding:10px 12px;font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-mute)">Client</th>
            <th style="padding:10px 12px;font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-mute)">Period</th>
            <th style="padding:10px 12px;font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-mute)">Tier</th>
            <th style="padding:10px 12px;font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-mute)">Score</th>
            <th style="padding:10px 12px;font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-mute)">Status</th>
            <th style="padding:10px 12px;font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-mute)">Generated</th>
            <th style="padding:10px 12px;font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-mute)">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => {
            const delta = r.prev_score !== null ? r.ai_presence_score - r.prev_score : null;
            const deltaStr = delta === null ? "" : delta > 0 ? ` (+${delta})` : delta < 0 ? ` (${delta})` : "";
            return `
              <tr style="border-bottom:1px solid var(--line)">
                <td style="padding:12px"><strong>${esc(r.client_slug)}</strong></td>
                <td style="padding:12px;font-family:var(--mono)">${esc(r.reporting_period)}</td>
                <td style="padding:12px;text-transform:uppercase;font-family:var(--label);font-size:10px;letter-spacing:.12em">${esc(r.tier)}</td>
                <td style="padding:12px"><strong>${r.ai_presence_score}</strong>${deltaStr}</td>
                <td style="padding:12px">${statusBadge(r.status)}</td>
                <td style="padding:12px;font-size:11px;color:var(--text-faint)">${fmt(r.generated_at)}</td>
                <td style="padding:12px">
                  <a href="/admin/nvi/preview/${r.id}" target="_blank" style="color:var(--gold);text-decoration:underline;text-underline-offset:3px;font-size:11px">Preview</a>
                  ${r.status === "pending" ? `
                    <form method="POST" action="/admin/nvi/approve/${r.id}" style="display:inline;margin-left:12px">
                      <button type="submit" style="background:none;border:1px solid var(--green);color:var(--green);padding:3px 10px;font-family:var(--label);font-size:9px;text-transform:uppercase;letter-spacing:.14em;cursor:pointer;border-radius:2px">Approve</button>
                    </form>
                  ` : ""}
                  ${r.status === "approved" && r.pdf_r2_key ? `
                    <form method="POST" action="/admin/nvi/send/${r.id}" style="display:inline;margin-left:8px">
                      <button type="submit" style="background:none;border:1px solid var(--gold);color:var(--gold);padding:3px 10px;font-family:var(--label);font-size:9px;text-transform:uppercase;letter-spacing:.14em;cursor:pointer;border-radius:2px">Send</button>
                    </form>
                  ` : ""}
                  ${r.status === "approved" && !r.pdf_r2_key ? `
                    <form method="POST" action="/admin/nvi/render/${r.id}" style="display:inline;margin-left:8px">
                      <button type="submit" style="background:none;border:1px solid var(--gold);color:var(--gold);padding:3px 10px;font-family:var(--label);font-size:9px;text-transform:uppercase;letter-spacing:.14em;cursor:pointer;border-radius:2px">Render PDF</button>
                    </form>
                  ` : ""}
                  ${r.pdf_r2_key ? `
                    <a href="/admin/nvi/pdf/${r.id}" target="_blank" style="color:var(--text-faint);text-decoration:underline;text-underline-offset:3px;font-size:11px;margin-left:12px">PDF</a>
                  ` : ""}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `}
  `;

  return html(layout("NVI Inbox", body, user));
}

export async function handleNviApprove(reportId: number, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const now = Math.floor(Date.now() / 1000);
  const priorRow = await env.DB.prepare(
    "SELECT status, client_slug, reporting_period, score FROM nvi_reports WHERE id = ?"
  ).bind(reportId).first<{ status: string; client_slug: string; reporting_period: string; score: number | null }>();
  await env.DB.prepare(
    "UPDATE nvi_reports SET status = 'approved', approved_at = ?, approver_user_id = ? WHERE id = ? AND status = 'pending'"
  ).bind(now, user.id, reportId).run();
  const { recordLanceDecision } = await import("../lib/decision-log");
  await recordLanceDecision(env, user.id, {
    artifact_type: "nvi_report",
    artifact_id: reportId,
    decision_kind: "approve",
    prior_state: priorRow?.status ?? null,
    new_state: "approved",
    metadata: {
      client_slug: priorRow?.client_slug,
      reporting_period: priorRow?.reporting_period,
      score: priorRow?.score,
    },
  });
  // Auto-render the PDF AND send the email. Approve = ship.
  // If you've already reviewed the insight + action and clicked
  // approve, the second click to "Send" is pure friction.
  // If render fails, status stays 'approved' with no pdf_r2_key
  // and the inbox shows a "Render PDF" retry button.
  // If send fails after render succeeds, status stays 'approved'
  // and the inbox shows a "Send" button (legacy retry path).
  // Also resolves the matching admin_inbox row so the cockpit /
  // sidebar pending count reflects the action.
  try {
    const { renderAndStoreNviPdf } = await import("../nvi/pdf");
    const r = await renderAndStoreNviPdf(env, reportId);
    if (!r.ok) {
      console.log(`[nvi-approve] render failed: ${r.reason}`);
      return redirect("/admin/nvi?status=approved");
    }
    const { sendNviReport } = await import("../nvi/email");
    const send = await sendNviReport(env, reportId);
    if (!send.ok) {
      console.log(`[nvi-approve] send failed: ${send.reason}`);
      return redirect("/admin/nvi?status=approved");
    }
    // Resolve the inbox row so the cockpit + 7am email don't keep
    // re-surfacing it
    await env.DB.prepare(
      `UPDATE admin_inbox SET status = 'resolved', resolved_at = ?, resolved_by = ?
         WHERE target_type = 'nvi_report' AND target_id = ? AND status = 'pending'`
    ).bind(now, user.id, reportId).run();
  } catch (e) {
    console.log(`[nvi-approve] exception: ${e}`);
    return redirect("/admin/nvi?status=approved");
  }
  return redirect("/admin/nvi?status=sent");
}

export async function handleNviRender(reportId: number, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const { renderAndStoreNviPdf } = await import("../nvi/pdf");
  const r = await renderAndStoreNviPdf(env, reportId);
  if (!r.ok) {
    return new Response(`Render failed: ${r.reason}`, { status: 500 });
  }
  const { recordLanceDecision } = await import("../lib/decision-log");
  await recordLanceDecision(env, user.id, {
    artifact_type: "nvi_report",
    artifact_id: reportId,
    decision_kind: "render",
    metadata: { retry_path: true },
  });
  return redirect(`/admin/nvi?status=approved`);
}

export async function handleNviPdfDownload(reportId: number, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const row = await env.DB.prepare(
    "SELECT pdf_r2_key, client_slug, reporting_period FROM nvi_reports WHERE id = ?"
  ).bind(reportId).first<{ pdf_r2_key: string | null; client_slug: string; reporting_period: string }>();
  if (!row?.pdf_r2_key) return new Response("PDF not yet rendered", { status: 404 });
  const { fetchNviPdf } = await import("../nvi/pdf");
  const pdf = await fetchNviPdf(env, row.pdf_r2_key);
  if (!pdf) return new Response("PDF not found in R2", { status: 404 });
  return new Response(pdf.bytes, {
    headers: {
      "content-type": pdf.contentType,
      "content-disposition": `inline; filename="nvi-${row.client_slug}-${row.reporting_period}.pdf"`,
    },
  });
}

export async function handleNviSend(reportId: number, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const { sendNviReport } = await import("../nvi/email");
  const r = await sendNviReport(env, reportId);
  if (!r.ok) return new Response(`Send failed: ${r.reason}`, { status: 500 });
  const { recordLanceDecision } = await import("../lib/decision-log");
  await recordLanceDecision(env, user.id, {
    artifact_type: "nvi_report",
    artifact_id: reportId,
    decision_kind: "send",
    metadata: { retry_path: true },
  });
  return redirect("/admin/nvi?status=sent");
}

export async function handleNviRunNow(slug: string, user: User, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const period = currentPeriod();

  // Quick guards that we can return synchronously
  const sub = await env.DB.prepare(
    "SELECT tier FROM nvi_subscriptions WHERE client_slug = ? AND active = 1"
  ).bind(slug).first<{ tier: string }>();
  if (!sub) {
    return new Response(JSON.stringify({ error: `no active NVI subscription for ${slug}` }, null, 2), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }
  const existing = await env.DB.prepare(
    "SELECT id FROM nvi_reports WHERE client_slug = ? AND reporting_period = ?"
  ).bind(slug, period).first<{ id: number }>();
  if (existing) {
    return new Response(JSON.stringify({
      error: `report ${existing.id} already exists for ${slug} ${period}`,
      hint: `Preview at /admin/nvi/preview/${existing.id} or delete the row to re-run.`,
    }, null, 2), {
      status: 409, headers: { "content-type": "application/json" },
    });
  }

  // Async fire. The runner takes 3-5 min for ~42 queries, far longer
  // than the Workers fetch-handler wall-clock limit. ctx.waitUntil
  // hands off to the runtime which gives us up to 15min of background
  // budget for the actual work.
  ctx.waitUntil((async () => {
    try {
      const { runMonthlyNviReport } = await import("../nvi/runner");
      const r = await runMonthlyNviReport(env, slug, period);
      console.log(`[nvi-run-now] ${slug} ${period}: ${r.ok ? `ok report ${r.reportId} score ${r.score}` : `failed: ${r.reason}`}`);
    } catch (e) {
      console.log(`[nvi-run-now] ${slug} exception: ${e instanceof Error ? e.message : String(e)}`);
    }
  })());

  return new Response(JSON.stringify({
    ok: true,
    status: "running",
    client: slug,
    period,
    poll_at: "/admin/nvi",
    note: "Runner dispatched. Citation queries take 3-5 minutes. Report will appear at /admin/nvi as 'pending' when done.",
  }, null, 2), { headers: { "content-type": "application/json" } });
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
