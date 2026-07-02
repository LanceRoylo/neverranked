/**
 * Admin memo review + approval surface — /admin/memos
 *
 * The human quality gate for the memo draft-generator. Drafts arrive with
 * delivered_at NULL (invisible to customer + Atlas). This surface lets
 * Lance:
 *   - see all drafts and delivered memos
 *   - read + edit a draft's body
 *   - APPROVE & DELIVER it (sets delivered_at = now, which is the moment
 *     Atlas starts referencing it)
 *   - generate drafts on demand (in addition to the 24th cron)
 *
 * Nothing here ever emails the customer. "Deliver" only means the memo
 * becomes visible in the customer's dashboard + Atlas context. The memo
 * is a pull artifact (the customer reads it), not a push.
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";

interface MemoRow {
  id: number;
  client_slug: string;
  month_key: string;
  title: string | null;
  body_markdown: string;
  delivered_at: number | null;
  updated_at: number;
}

// ── List ─────────────────────────────────────────────────────────────

export async function handleMemoInbox(user: User, env: Env): Promise<Response> {
  const rows = (await env.DB.prepare(
    `SELECT m.id, m.client_slug, m.month_key, m.title, m.delivered_at, m.updated_at,
            c.name as customer_name
       FROM monthly_memos m
       LEFT JOIN customers c ON c.client_slug = m.client_slug
      ORDER BY (m.delivered_at IS NULL) DESC, m.updated_at DESC`
  ).all<MemoRow & { customer_name: string | null }>()).results;

  const drafts = rows.filter((r) => r.delivered_at === null);
  const delivered = rows.filter((r) => r.delivered_at !== null);

  const row = (r: MemoRow & { customer_name: string | null }) => {
    const state = r.delivered_at
      ? `<span style="color:#7bdca0">delivered ${new Date(r.delivered_at * 1000).toISOString().slice(0, 10)}</span>`
      : `<span style="color:#e8c767">DRAFT</span>`;
    return `<tr>
      <td><a href="/admin/memos/${r.id}" style="color:var(--gold)">${esc(r.customer_name || r.client_slug)}</a></td>
      <td>${esc(r.month_key)}</td>
      <td>${esc(r.title || "(untitled)")}</td>
      <td>${state}</td>
    </tr>`;
  };

  const body = `
    <h1 style="font-weight:400">Monthly memos</h1>
    <form method="POST" action="/admin/memos/generate" style="margin:16px 0 28px">
      <button type="submit" style="background:var(--gold);color:#1a1500;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-family:ui-monospace,monospace">
        Generate drafts now (all active customers)
      </button>
      <span style="color:var(--dim);font-size:13px;margin-left:12px">Also runs automatically on the 24th.</span>
    </form>

    <h2 style="font-weight:400;color:#e8c767">Drafts awaiting review (${drafts.length})</h2>
    ${drafts.length === 0 ? `<p style="color:var(--dim)">No drafts in the queue.</p>` : `
    <table style="width:100%;border-collapse:collapse;margin-bottom:36px">
      <thead><tr style="text-align:left;color:var(--dim);font-size:12px">
        <th>Customer</th><th>Month</th><th>Title</th><th>State</th>
      </tr></thead>
      <tbody>${drafts.map(row).join("")}</tbody>
    </table>`}

    <h2 style="font-weight:400">Delivered (${delivered.length})</h2>
    ${delivered.length === 0 ? `<p style="color:var(--dim)">None delivered yet.</p>` : `
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="text-align:left;color:var(--dim);font-size:12px">
        <th>Customer</th><th>Month</th><th>Title</th><th>State</th>
      </tr></thead>
      <tbody>${delivered.map(row).join("")}</tbody>
    </table>`}
  `;
  return html(layout("Monthly memos", body, user));
}

// ── Detail / edit ────────────────────────────────────────────────────

export async function handleMemoDetail(id: number, user: User, env: Env): Promise<Response> {
  const m = await env.DB.prepare(
    `SELECT m.*, c.name as customer_name FROM monthly_memos m
       LEFT JOIN customers c ON c.client_slug = m.client_slug WHERE m.id = ?`
  ).bind(id).first<MemoRow & { customer_name: string | null }>();
  if (!m) return html(layout("Not found", `<p>Memo ${id} not found.</p>`, user), 404);

  const delivered = m.delivered_at !== null;
  const body = `
    <p style="margin-bottom:4px"><a href="/admin/memos" style="color:var(--dim)">&larr; All memos</a></p>
    <h1 style="font-weight:400">${esc(m.customer_name || m.client_slug)} &middot; ${esc(m.month_key)}</h1>
    <p style="color:${delivered ? "#7bdca0" : "#e8c767"};font-family:ui-monospace,monospace;font-size:13px">
      ${delivered ? `DELIVERED ${new Date(m.delivered_at! * 1000).toISOString().slice(0, 10)} — visible to customer + Atlas` : `DRAFT — not visible to customer or Atlas until you deliver`}
    </p>

    <form method="POST" action="/admin/memos/${m.id}">
      <label style="display:block;color:var(--dim);font-size:12px;margin:18px 0 4px">Title</label>
      <input name="title" value="${esc(m.title || "")}" style="width:100%;background:#131316;border:1px solid #2a2a2e;color:#e8e8ea;padding:10px;border-radius:6px;font-family:Georgia,serif;font-size:15px">

      <label style="display:block;color:var(--dim);font-size:12px;margin:18px 0 4px">Body (markdown)</label>
      <textarea name="body_markdown" rows="28" style="width:100%;background:#131316;border:1px solid #2a2a2e;color:#e8e8ea;padding:12px;border-radius:6px;font-family:ui-monospace,monospace;font-size:13px;line-height:1.6">${esc(m.body_markdown)}</textarea>

      <div style="margin-top:18px;display:flex;gap:12px;align-items:center">
        <button type="submit" name="action" value="save" style="background:#2a2a2e;color:#e8e8ea;border:none;border-radius:6px;padding:10px 18px;cursor:pointer;font-family:ui-monospace,monospace">
          Save draft
        </button>
        ${delivered ? "" : `
        <button type="submit" name="action" value="deliver" style="background:var(--gold);color:#1a1500;border:none;border-radius:6px;padding:10px 18px;cursor:pointer;font-family:ui-monospace,monospace"
          onclick="return confirm('Deliver this memo? It becomes visible to the customer and Atlas immediately.')">
          Approve &amp; deliver
        </button>`}
        ${delivered ? `
        <button type="submit" name="action" value="undeliver" style="background:#3a1a1a;color:#e8a0a0;border:none;border-radius:6px;padding:10px 18px;cursor:pointer;font-family:ui-monospace,monospace"
          onclick="return confirm('Pull this memo back to draft? It will disappear from the customer view and Atlas.')">
          Revert to draft
        </button>` : ""}
      </div>
    </form>
  `;
  return html(layout(`Memo ${m.month_key}`, body, user));
}

// ── Save / deliver / revert ──────────────────────────────────────────

export async function handleMemoSave(id: number, request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const action = String(form.get("action") || "save");
  const title = String(form.get("title") || "").slice(0, 200);
  const body = String(form.get("body_markdown") || "");

  if (action === "deliver") {
    // Fail-closed gate: re-vet the (possibly hand-edited) body against the
    // same checks the generator runs. A flagged number or banned phrasing
    // blocks delivery unless Lance explicitly overrides after seeing the
    // flags. Without this, a fabricated figure could be one-click delivered
    // into the customer dashboard and Atlas.
    const override = String(form.get("override") || "") === "1";
    if (!override) {
      const memo = await env.DB.prepare(
        `SELECT client_slug FROM monthly_memos WHERE id=?`
      ).bind(id).first<{ client_slug: string }>();
      if (memo) {
        const { vetMemoBody } = await import("../lib/memo-generator");
        const vet = await vetMemoBody(env, memo.client_slug, body, new Date());
        if (vet.unverifiedNumbers.length || vet.toneViolations.length) {
          // Persist the edits as a draft (don't lose them), then block.
          await env.DB.prepare(
            `UPDATE monthly_memos SET title=?, body_markdown=?, updated_at=unixepoch() WHERE id=?`
          ).bind(title, body, id).run();
          return renderDeliveryBlocked(id, title, body, vet, user);
        }
      }
    }
    await env.DB.prepare(
      `UPDATE monthly_memos SET title=?, body_markdown=?, delivered_at=unixepoch(), updated_at=unixepoch() WHERE id=?`
    ).bind(title, body, id).run();
    // Freeze the report's chart data (facts_json) now that it is delivered. This
    // is the catch-all that makes charts automatic for EVERY report -- generated
    // or hand-authored -- so no future customer needs the HTC hand-backfill.
    // Best-effort: a failure leaves the report narrative-only, never blocks it.
    try {
      const meta = await env.DB.prepare(
        `SELECT client_slug, month_key FROM monthly_memos WHERE id=?`
      ).bind(id).first<{ client_slug: string; month_key: string }>();
      if (meta) {
        const { emitReportFacts } = await import("../lib/report-facts");
        await emitReportFacts(env, meta.client_slug, meta.month_key);
      }
    } catch { /* charts are optional; delivery already succeeded */ }
    // Graduation tracker: record the real ship decision on this memo's latest
    // verdict. ship_as_is = delivered body unchanged from what the judge saw
    // (true agreement); ship_edited = Lance rewrote before delivering.
    // Race note: if the monthly generate cron regenerated this memo in the
    // instant between the deliver write above and this read, a newer verdict is
    // targeted and the hash mismatch records ship_edited. That is the SAFE
    // direction -- it undercounts agreement, never manufactures a clean ship --
    // so at worst it delays go-live, never advances it wrongly.
    try {
      const { hashDraft } = await import("../lib/deliverable-judge");
      const v = await env.DB.prepare(
        `SELECT id, draft_hash FROM deliverable_verdicts WHERE artifact_type='monthly_memo' AND artifact_id=? ORDER BY id DESC LIMIT 1`
      ).bind(id).first<{ id: number; draft_hash: string | null }>();
      if (v) {
        const decision = v.draft_hash && v.draft_hash === hashDraft(body) ? "ship_as_is" : "ship_edited";
        await env.DB.prepare(
          `UPDATE deliverable_verdicts SET lance_decision=?, lance_decided_at=unixepoch() WHERE id=?`
        ).bind(decision, v.id).run();
      }
    } catch (e) {
      console.warn("graduation capture failed (memo delivered ok):", String(e).slice(0, 200));
    }
  } else if (action === "undeliver") {
    await env.DB.prepare(
      `UPDATE monthly_memos SET delivered_at=NULL, updated_at=unixepoch() WHERE id=?`
    ).bind(id).run();
    // A pull-back is a reject signal against the latest verdict.
    try {
      await env.DB.prepare(
        `UPDATE deliverable_verdicts SET lance_decision='reverted', lance_decided_at=unixepoch()
         WHERE id = (SELECT id FROM deliverable_verdicts WHERE artifact_type='monthly_memo' AND artifact_id=? ORDER BY id DESC LIMIT 1)`
      ).bind(id).run();
    } catch { /* best-effort */ }
  } else {
    await env.DB.prepare(
      `UPDATE monthly_memos SET title=?, body_markdown=?, updated_at=unixepoch() WHERE id=?`
    ).bind(title, body, id).run();
  }
  return redirect(`/admin/memos/${id}`);
}

// Rendered when a deliver is blocked by the fail-closed memo gate. Shows the
// flags plus an explicit override path (which re-submits the saved body).
function renderDeliveryBlocked(
  id: number,
  title: string,
  body: string,
  vet: { unverifiedNumbers: string[]; toneViolations: string[] },
  user: User,
): Response {
  const items: string[] = [];
  if (vet.unverifiedNumbers.length) items.push(`<li><strong>Unverified numbers</strong> (not found in the measured data): <span style="color:#e8c767">${esc(vet.unverifiedNumbers.join(", "))}</span></li>`);
  if (vet.toneViolations.length) items.push(`<li><strong>Tone / phrasing blocks</strong>: <span style="color:#e8a0a0">${esc(vet.toneViolations.join(", "))}</span></li>`);
  const inner = `
    <p style="margin-bottom:4px"><a href="/admin/memos/${id}" style="color:var(--dim)">&larr; Back to the memo</a></p>
    <h1 style="font-weight:400;color:#e8a0a0">Delivery blocked</h1>
    <p style="color:var(--dim);max-width:62ch">This memo was not delivered. The body tripped the same gates the generator runs, so it is held until you fix the flags or explicitly override. Your edits are saved as a draft.</p>
    <ul style="line-height:1.9">${items.join("")}</ul>
    <div style="margin-top:24px;display:flex;gap:12px;align-items:center">
      <a href="/admin/memos/${id}" style="background:var(--gold);color:#1a1500;border-radius:6px;padding:10px 18px;text-decoration:none;font-family:ui-monospace,monospace">Go back and fix</a>
      <form method="POST" action="/admin/memos/${id}" style="margin:0" onsubmit="return confirm('Deliver despite the flags? It becomes visible to the customer and Atlas immediately.')">
        <input type="hidden" name="action" value="deliver">
        <input type="hidden" name="override" value="1">
        <input type="hidden" name="title" value="${esc(title)}">
        <input type="hidden" name="body_markdown" value="${esc(body)}">
        <button type="submit" style="background:#5a1a1a;color:#e8c0c0;border:1px solid #7a2a2a;border-radius:6px;padding:10px 18px;cursor:pointer;font-family:ui-monospace,monospace">Deliver anyway</button>
      </form>
    </div>
  `;
  return html(layout(`Delivery blocked · memo ${id}`, inner, user));
}

// ── Generate on demand ───────────────────────────────────────────────

export async function handleMemoGenerate(user: User, env: Env): Promise<Response> {
  const { generateAllMemoDrafts } = await import("../lib/memo-generator");
  const results = await generateAllMemoDrafts(env, new Date());
  const ok = results.filter((r) => r.ok);
  const body = `
    <p><a href="/admin/memos" style="color:var(--dim)">&larr; All memos</a></p>
    <h1 style="font-weight:400">Generated ${ok.length} draft(s)</h1>
    <ul style="line-height:1.8">
      ${results.map((r) => `<li>${esc(r.slug)}: ${r.ok
        ? `drafted${r.unverifiedNumbers ? ` — <span style="color:#e8c767">check figures: ${esc(r.unverifiedNumbers.join(", "))}</span>` : ""}${r.toneViolations ? ` — <span style="color:#e8a0a0">tone: ${esc(r.toneViolations.join(", "))}</span>` : ""}${r.gate ? ` — <span style="color:${r.gate.would_ship ? "#7bdca0" : "#9aa0e8"}">gate: ${r.gate.would_ship ? "would ship" : "would escalate"} (judge ${esc(r.gate.judge_verdict)}${r.gate.verifier_objected ? ", verifier objected" : r.gate.judge_verdict === "ship" ? ", verifier clear" : ""})${r.gate.judge_reasons && r.gate.judge_reasons.length ? ": " + esc(r.gate.judge_reasons[0]) : ""}</span>` : ""}`
        : `<span style="color:#e8a0a0">failed: ${esc(r.error || "unknown")}</span>`}</li>`).join("")}
    </ul>
    <p style="margin-top:20px"><a href="/admin/memos" style="color:var(--gold)">Review the queue &rarr;</a></p>
  `;
  return html(layout("Generated drafts", body, user));
}
