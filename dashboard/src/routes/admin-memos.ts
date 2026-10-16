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
 *   - generate drafts on demand (in addition to the 15th preview and the
 *     full-month draft on the 2nd)
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
  const { endOfPreviousMonthUTC, monthLabel, monthWindowOf } = await import("../lib/month-end-snapshot");
  const lastMonth = monthWindowOf(endOfPreviousMonthUTC(new Date()));
  const lastMonthLabel = monthLabel(lastMonth.monthKey);

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
    <form method="POST" action="/admin/memos/generate" style="margin:16px 0 8px">
      <button type="submit" style="background:var(--gold);color:#1a1500;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-family:ui-monospace,monospace">
        Generate drafts now (this month to date, all active customers)
      </button>
      <span style="color:var(--dim);font-size:13px;margin-left:12px">Also runs automatically: a preview on the 15th, the full month on the 2nd.</span>
    </form>
    <form method="POST" action="/admin/memos/generate?full_month=1" style="margin:0 0 28px">
      <button type="submit" style="background:#1d1d1d;color:var(--gold);border:1px solid #4a4a4a;border-radius:6px;padding:8px 16px;cursor:pointer;font-family:ui-monospace,monospace">
        Draft ${esc(lastMonthLabel)} in full
      </button>
      <span style="color:var(--dim);font-size:13px;margin-left:12px">The 2nd-of-month path: checks each month-end snapshot, rebuilds it once if needed, and refuses rather than draft a partial month. Months already delivered are skipped.</span>
    </form>

    <div style="margin:0 0 28px;padding:12px 14px;border:1px solid #333;border-radius:8px">
      <div style="color:var(--dim);font-size:13px;margin-bottom:8px">
        Rebuild a readout snapshot from D1, in the Worker. Do this before regenerating when a
        snapshot's provenance is not the Worker, then regenerate so the memo's facts come from it.
      </div>
      ${[...new Set(drafts.map((d) => d.client_slug))].map((sl) => `
        <form method="POST" action="/admin/snapshots/${esc(sl)}/rebuild" style="display:inline-block;margin:0 8px 0 0">
          <button type="submit" style="background:#1d1d1d;color:var(--gold);border:1px solid #4a4a4a;border-radius:6px;padding:6px 12px;cursor:pointer;font-family:ui-monospace,monospace;font-size:13px">
            Rebuild snapshot &middot; ${esc(sl)}
          </button>
        </form>`).join("")}
    </div>

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
        `SELECT client_slug, month_key, facts_json, rules_hash FROM monthly_memos WHERE id=?`
      ).bind(id).first<{ client_slug: string; month_key: string; facts_json: string | null; rules_hash: string | null }>();
      if (memo) {
        const { vetMemoBody, memoRulesHash } = await import("../lib/memo-generator");
        // The memo's own month, not the wall clock. A full-month memo is
        // delivered after its month ends, and vetting October's figures on
        // 3 November with new Date() read November's first days as the data.
        const { memoClockFor } = await import("../lib/month-end-snapshot");
        const vet = await vetMemoBody(env, memo.client_slug, body, memoClockFor(memo.month_key, new Date()), memo.facts_json);
        // Was this draft written under the rules we run today?
        //
        // The memo regenerates on the 15th and the 24th. A rule fixed on the
        // 24th at 09:00 does not reach a draft written at 06:03, and re-vetting
        // the BODY cannot see it: the checks here look for bad numbers and
        // banned phrasing, not for a sentence that is merely wrong in a way
        // the new prompt would have prevented. On 2026-09-24 a draft sat ready
        // to deliver containing the exact line that morning's last fix existed
        // to stop, and every existing gate passed it.
        let staleRules: string | null = null;
        try {
          const current = await memoRulesHash();
          if (memo.rules_hash !== current) {
            staleRules = memo.rules_hash
              ? `This draft was written under generator rules ${memo.rules_hash}; the deployed rules are ${current}. Regenerate it before delivering, or override if you have read it against the current rules yourself.`
              : `This draft predates rule tracking, so the rules that produced it are unknown. Regenerate it before delivering.`;
          }
        } catch { /* a check that cannot run must not block a delivery on its own */ }
        if (vet.unverifiedNumbers.length || vet.toneViolations.length || vet.claimIssues.length || staleRules) {
          // Persist the edits as a draft (don't lose them), then block.
          await env.DB.prepare(
            `UPDATE monthly_memos SET title=?, body_markdown=?, updated_at=unixepoch() WHERE id=?`
          ).bind(title, body, id).run();
          return renderDeliveryBlocked(id, title, body, { ...vet, staleRules }, user);
        }
      }
    }
    // Last-resort chart backfill, BEFORE delivery is stamped.
    //
    // This block used to sit after the UPDATE below, and emitReportFacts
    // refuses outright when delivered_at is set. So it could never do
    // anything: from the day that guard landed until 2026-09-16 the call was
    // dead and the comment above it claimed it was "the catch-all that makes
    // charts automatic for EVERY report". A stated safety net that cannot fire
    // is worse than no safety net, because it stops anyone looking.
    //
    // Now it runs first, and ONLY when the memo has no frozen facts at all.
    // That fixes the real gap -- a hand-authored memo delivered with
    // facts_json NULL renders narrative-only forever -- without touching the
    // immutability rule. Existing facts are never regenerated here: the body
    // was vetted against them a few lines up, and rewriting the numbers after
    // that vet would leave prose and charts describing different data.
    try {
      const meta = await env.DB.prepare(
        `SELECT client_slug, month_key, facts_json FROM monthly_memos WHERE id=?`
      ).bind(id).first<{ client_slug: string; month_key: string; facts_json: string | null }>();
      if (meta && meta.facts_json == null) {
        const { emitReportFacts } = await import("../lib/report-facts");
        const wrote = await emitReportFacts(env, meta.client_slug, meta.month_key);
        console.log(`[deliver] ${meta.client_slug}/${meta.month_key}: no frozen facts, backfill ${wrote ? "wrote" : "declined"}`);
      }
    } catch { /* charts are optional; delivery must not block on them */ }
    await env.DB.prepare(
      `UPDATE monthly_memos SET title=?, body_markdown=?, delivered_at=unixepoch(), updated_at=unixepoch() WHERE id=?`
    ).bind(title, body, id).run();
    // Releasing does not email the client (see the file header). Raise the
    // reminder to tell them, so a released readout cannot sit unseen the way
    // the 2026-09 one did for ten days. See lib/readout-seen-watch.ts.
    try {
      const { notifyOnDeliver } = await import("../lib/readout-seen-watch");
      await notifyOnDeliver(env, id);
    } catch (e) {
      console.log(`[deliver] notify-client reminder failed for memo ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
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
  vet: { unverifiedNumbers: string[]; toneViolations: string[]; claimIssues?: string[]; staleRules?: string | null },
  user: User,
): Response {
  const items: string[] = [];
  if (vet.staleRules) items.push(`<li><strong>Written under older generator rules</strong>: <span style="color:#9aa0e8">${esc(vet.staleRules)}</span></li>`);
  if (vet.unverifiedNumbers.length) items.push(`<li><strong>Unverified numbers</strong> (not found in the measured data): <span style="color:#e8c767">${esc(vet.unverifiedNumbers.join(", "))}</span></li>`);
  if (vet.toneViolations.length) items.push(`<li><strong>Tone / phrasing blocks</strong>: <span style="color:#e8a0a0">${esc(vet.toneViolations.join(", "))}</span></li>`);
  // Claim issues get one line each with the offending sentence quoted, because
  // unlike a bare number these are only actionable if you can see the sentence.
  for (const c of vet.claimIssues || []) {
    items.push(`<li><strong>Says something the data does not</strong>: <span style="color:#e8a0a0">${esc(c)}</span></li>`);
  }
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

export async function handleMemoGenerate(user: User, env: Env, fullMonth = false): Promise<Response> {
  const { generateAllMemoDrafts, generateFullMonthDrafts } = await import("../lib/memo-generator");
  // fullMonth: last month in full, through the same guarded path the cron
  // runs on the 2nd (month-end snapshot checked, rebuilt once, refused loudly).
  // This is the recovery step a month_end_snapshot_missing item points to.
  const { endOfPreviousMonthUTC, monthLabel, monthWindowOf } = await import("../lib/month-end-snapshot");
  const clock = fullMonth ? endOfPreviousMonthUTC(new Date()) : new Date();
  const results = fullMonth ? await generateFullMonthDrafts(env, clock) : await generateAllMemoDrafts(env, clock);
  const ok = results.filter((r) => r.ok);
  const body = `
    <p><a href="/admin/memos" style="color:var(--dim)">&larr; All memos</a></p>
    <h1 style="font-weight:400">${fullMonth ? `${esc(monthLabel(monthWindowOf(clock).monthKey))} in full: ` : ""}generated ${ok.length} draft(s)</h1>
    <ul style="line-height:1.8">
      ${results.map((r) => `<li>${esc(r.slug)}: ${r.skipped ? `<span style="color:var(--dim)">skipped: ${esc(r.skipped)}</span>` : r.ok
        ? `drafted${r.unverifiedNumbers ? ` — <span style="color:#e8c767">check figures: ${esc(r.unverifiedNumbers.join(", "))}</span>` : ""}${r.toneViolations ? ` — <span style="color:#e8a0a0">tone: ${esc(r.toneViolations.join(", "))}</span>` : ""}${r.gate ? ` — <span style="color:${r.gate.would_ship ? "#7bdca0" : "#9aa0e8"}">gate: ${r.gate.would_ship ? "would ship" : "would escalate"} (judge ${esc(r.gate.judge_verdict)}${r.gate.verifier_objected ? ", verifier objected" : r.gate.judge_verdict === "ship" ? ", verifier clear" : ""})${r.gate.judge_reasons && r.gate.judge_reasons.length ? ": " + esc(r.gate.judge_reasons[0]) : ""}</span>` : ""}`
        : `<span style="color:#e8a0a0">failed: ${esc(r.error || "unknown")}</span>`}</li>`).join("")}
    </ul>
    <p style="margin-top:20px"><a href="/admin/memos" style="color:var(--gold)">Review the queue &rarr;</a></p>
  `;
  return html(layout("Generated drafts", body, user));
}


// ── Rebuild one readout snapshot ─────────────────────────────────────────
//
// WHY THIS EXISTS. On 2026-09-23 a laptop launchd job ran the forensic bridge,
// which writes citation_snapshots from disk files, and it overwrote the row
// the Worker had written that Monday for BOTH live clients. measured_at on the
// stored rows matches the two bridge executions to the second, and the absent
// `layer` key (which buildReadoutSnapshot always writes and the bridge never
// does) is the fingerprint. Every figure in both September memos derived from
// those rows.
//
// The only caller of buildReadoutSnapshot was the Monday weekly-extras
// workflow, so the sole way to recover was to run a workflow that also fires a
// replicate sweep, a GSC pull, a backup and a Reddit check -- a great deal of
// side effect to rebuild one row the day before a delivery.
//
// This rebuilds exactly one client's snapshot from D1, in the Worker, on the
// same month-to-date window the Monday step uses, and reports the refusal
// instead of swallowing it. The four guards inside buildReadoutSnapshot refuse
// to write rather than write something wrong, and a refusal used to look
// exactly like a clean run from outside.
export async function handleRebuildSnapshot(user: User, env: Env, slug: string, month?: string | null): Promise<Response> {
  const { buildReadoutSnapshot } = await import("../citations");
  const now = new Date();
  const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const monthEnd = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000);

  // ?month=YYYY-MM for a month that has ENDED rebuilds that month's month-end
  // snapshot (the row the full-month memo reads) instead of the current month
  // to date. Anything else keeps the old behaviour.
  if (month) {
    const { monthWindowForKey, buildMonthEndSnapshot, loadMonthEndSnapshot, monthLabel } = await import("../lib/month-end-snapshot");
    const w = monthWindowForKey(month);
    if (!w || w.end > Math.floor(now.getTime() / 1000)) {
      return html(layout("Rebuild month-end snapshot", `<p style="color:#e8a0a0">${esc(month)} is not a month that has ended. A month-end snapshot can only be built once the month is over.</p><p><a href="/admin/memos" style="color:var(--gold)">&larr; All memos</a></p>`, user));
    }
    let r: { ok: boolean; reason?: string };
    try { r = await buildMonthEndSnapshot(env, slug, w); }
    catch (e) { r = { ok: false, reason: e instanceof Error ? e.message : String(e) }; }
    const row = await loadMonthEndSnapshot(env, slug, w).catch(() => null);
    return html(layout(`Month-end snapshot &middot; ${esc(slug)}`, `
      <p><a href="/admin/memos" style="color:var(--dim)">&larr; All memos</a></p>
      <h1 style="font-weight:400">${r.ok ? "Month-end snapshot built" : "Month-end snapshot NOT built"} &middot; ${esc(slug)} &middot; ${esc(monthLabel(w.monthKey))}</h1>
      <ul style="line-height:1.9">
        <li>Stored row: ${row ? `measured ${esc(new Date((row.measured_at ?? 0) * 1000).toISOString().slice(0, 16).replace("T", " "))} UTC` : "<strong style=\"color:#e8a0a0\">none</strong>"}</li>
        ${r.ok ? "" : `<li style="color:#e8a0a0">Refused: ${esc(r.reason ?? "unknown")}.</li>`}
      </ul>`, user));
  }

  const before = await env.DB.prepare(
    `SELECT datetime(measured_at,'unixepoch') AS measured, instr(engines_breakdown,'layer') AS has_layer,
            COALESCE(query_set_hash,'') AS qs, COALESCE(query_set_changed_in_window,0) AS qs_changed
       FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`,
  ).bind(slug).first<{ measured: string | null; has_layer: number; qs: string; qs_changed: number }>().catch(() => null);

  let res: { ok: boolean; reason?: string };
  try {
    res = await buildReadoutSnapshot(env, slug, monthStart, monthEnd);
  } catch (e) {
    res = { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  const after = await env.DB.prepare(
    `SELECT datetime(measured_at,'unixepoch') AS measured, instr(engines_breakdown,'layer') AS has_layer,
            COALESCE(query_set_hash,'') AS qs, COALESCE(query_set_changed_in_window,0) AS qs_changed
       FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`,
  ).bind(slug).first<{ measured: string | null; has_layer: number; qs: string; qs_changed: number }>().catch(() => null);

  // `layer` is the provenance tell: the Worker writes it on every engine, the
  // bridge writes it on none. If it is present afterwards, this row came from
  // the Worker and from D1.
  const wrote = res.ok && !!after?.has_layer;
  const body = `
    <p><a href="/admin/memos" style="color:var(--dim)">&larr; All memos</a></p>
    <h1 style="font-weight:400">${wrote ? "Snapshot rebuilt" : "Snapshot NOT rebuilt"} &middot; ${esc(slug)}</h1>
    <ul style="line-height:1.9">
      <li>Before: measured ${esc(before?.measured ?? "none")} &middot; provenance ${before?.has_layer ? "Worker" : "<strong style=\"color:#e8a0a0\">not the Worker</strong>"}</li>
      <li>After: measured ${esc(after?.measured ?? "none")} &middot; provenance ${after?.has_layer ? "<strong style=\"color:#7bdca0\">Worker</strong>" : "<strong style=\"color:#e8a0a0\">not the Worker</strong>"}</li>
      <li>Question set: ${after?.qs ? `<code>${esc(after.qs.slice(0, 12))}</code>` : "<span style=\"color:#e8c767\">not stamped</span>"}${after?.qs_changed ? ` &middot; <strong style=\"color:#e8c767\">the set CHANGED inside this window, so the aggregate spans more than one set</strong>` : ""}</li>
      ${res.ok ? "" : `<li style="color:#e8a0a0">Refused: ${esc(res.reason ?? "unknown")}. The guards refuse rather than write something wrong; this is a real condition to fix, not a retry.</li>`}
    </ul>
    <p style="color:var(--dim)">The memo must be regenerated after this so its facts come from the rebuilt snapshot. Delivery already blocks a draft written under older rules.</p>`;
  return html(layout(`Rebuild snapshot &middot; ${esc(slug)}`, body, user));
}
