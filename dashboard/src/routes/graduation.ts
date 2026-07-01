/**
 * Dashboard -- /admin/graduation
 *
 * The go-live scoreboard for the deliverable judge gate. The gate runs in
 * SHADOW: it records what it WOULD do (would_ship) but never auto-ships.
 * This page scores those shadow verdicts against Lance's real later decisions
 * so the flip to live is earned on evidence, not calendar.
 *
 * The governing metric is the FALSE-SHIP RATE: of the drafts the judge would
 * have shipped, how many did Lance NOT ship as-is (he edited or reverted)?
 * Each of those is a case where auto-ship would have put a weak deliverable in
 * front of a paying customer. It must be zero on a real sample before go-live.
 *
 * ship_as_is  = delivered unchanged from the drafted body the judge saw (true agreement)
 * ship_edited = Lance rewrote before delivering (judge's ship would have been premature)
 * reverted    = pulled back after delivering
 *
 * This build intentionally does NOT auto-ship. It captures evidence and shows
 * readiness. The live flip is a deliberate, separate step once a type is green.
 */

import type { Env, User } from "../types";
import { html, layout, esc } from "../render";

// Go-live thresholds per deliverable type. A type is "ready" only when all hold.
const MIN_DECIDED = 10;    // enough decided verdicts for the rate to mean anything
const MIN_SAFE_SHIPS = 8;  // the judge cleanly agreed on this many real ships
const MAX_FALSE_SHIPS = 0; // one false ship blocks go-live

interface TypeStats {
  artifact_type: string;
  total: number;
  decided: number;
  would_ship_total: number;
  safe_ships: number;      // would_ship=1 AND ship_as_is  -> the judge was right to ship
  false_ships: number;     // would_ship=1 AND NOT ship_as_is -> DANGEROUS: judge would have over-shipped
  over_escalates: number;  // would_ship=0 AND ship_as_is  -> judge too conservative (minor)
  agreed_escalates: number;// would_ship=0 AND NOT ship_as_is -> judge rightly held back
}

function readiness(s: TypeStats): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (s.false_ships > MAX_FALSE_SHIPS) reasons.push(`${s.false_ships} false ship(s) on record (must be 0)`);
  if (s.decided < MIN_DECIDED) reasons.push(`only ${s.decided}/${MIN_DECIDED} decided verdicts`);
  if (s.safe_ships < MIN_SAFE_SHIPS) reasons.push(`only ${s.safe_ships}/${MIN_SAFE_SHIPS} clean agreed ships`);
  return { ready: reasons.length === 0, reasons };
}

function pct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return `${Math.round((n / d) * 100)}%`;
}

export async function handleGraduation(user: User, env: Env): Promise<Response> {
  let stats: TypeStats[] = [];
  let queryOk = true;
  try {
    // Count only the LATEST verdict per artifact. A regenerated memo leaves
    // older verdict rows behind (lance_decision NULL forever); counting them
    // would inflate the denominator and muddy the false-ship rate. Rows with a
    // NULL artifact_id (offline readouts) are each distinct, so keep them all.
    // false_ships = the judge would have shipped but Lance did NOT ship as-is
    // (he edited or reverted) -- the dangerous case a live gate must never hit.
    stats = (await env.DB.prepare(
      `SELECT artifact_type,
              COUNT(*) as total,
              SUM(CASE WHEN lance_decision IS NOT NULL THEN 1 ELSE 0 END) as decided,
              SUM(CASE WHEN would_ship=1 THEN 1 ELSE 0 END) as would_ship_total,
              SUM(CASE WHEN would_ship=1 AND lance_decision='ship_as_is' THEN 1 ELSE 0 END) as safe_ships,
              SUM(CASE WHEN would_ship=1 AND lance_decision IS NOT NULL AND lance_decision<>'ship_as_is' THEN 1 ELSE 0 END) as false_ships,
              SUM(CASE WHEN would_ship=0 AND lance_decision='ship_as_is' THEN 1 ELSE 0 END) as over_escalates,
              SUM(CASE WHEN would_ship=0 AND lance_decision IS NOT NULL AND lance_decision<>'ship_as_is' THEN 1 ELSE 0 END) as agreed_escalates
       FROM deliverable_verdicts
       WHERE artifact_id IS NULL
          OR id = (SELECT MAX(x.id) FROM deliverable_verdicts x
                   WHERE x.artifact_type = deliverable_verdicts.artifact_type
                     AND x.artifact_id = deliverable_verdicts.artifact_id)
       GROUP BY artifact_type
       ORDER BY artifact_type`
    ).all<TypeStats>()).results;
  } catch {
    queryOk = false;
  }

  const totalVerdicts = stats.reduce((a, s) => a + s.total, 0);

  const explainer = `
    <div class="card" style="border:1px dashed var(--line)">
      <div class="label">How the flip is earned</div>
      <p style="color:var(--text-mute);font-size:14px;line-height:1.6;margin:10px 0 0">
        The judge gate runs in <b style="color:var(--text)">shadow</b>. It records what it would do,
        but nothing auto-ships. A deliverable type goes live only when its shadow calls have matched
        your real decisions: at least ${MIN_DECIDED} decided verdicts, at least ${MIN_SAFE_SHIPS} clean
        agreed ships, and <b style="color:var(--text)">zero false ships</b> (a draft the judge would have
        shipped that you edited or pulled back). Until then, every deliverable still queues for you.
      </p>
    </div>`;

  const cards = stats.map((s) => {
    const r = readiness(s);
    const falseRate = pct(s.false_ships, s.would_ship_total);
    const barColor = r.ready ? "#5ec76a" : s.false_ships > 0 ? "#e07158" : "#e8c767";
    const cell = (label: string, val: string, color = "var(--text)") =>
      `<div><div style="font-family:var(--serif);font-size:22px;color:${color}">${esc(val)}</div><div class="label" style="margin-top:2px">${esc(label)}</div></div>`;
    return `
      <div class="card" style="border-left:3px solid ${barColor}">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div style="font-family:var(--serif);font-size:19px;color:var(--text)">${esc(s.artifact_type)}</div>
          <div style="font-family:var(--label);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${barColor}">
            ${r.ready ? "ready for go-live review" : "shadow (not ready)"}
          </div>
        </div>
        <div style="display:flex;gap:30px;flex-wrap:wrap;margin-top:16px">
          ${cell("verdicts", String(s.total))}
          ${cell("decided", String(s.decided))}
          ${cell("false ships", String(s.false_ships), s.false_ships > 0 ? "#e07158" : "#5ec76a")}
          ${cell("false-ship rate", falseRate, s.false_ships > 0 ? "#e07158" : "var(--text)")}
          ${cell("clean agreed ships", `${s.safe_ships}/${MIN_SAFE_SHIPS}`)}
          ${cell("over-escalates", String(s.over_escalates), "var(--text-faint)")}
        </div>
        ${r.ready
          ? `<div style="margin-top:14px;padding:12px 14px;border:1px solid rgba(94,199,106,.35);border-radius:6px;background:rgba(94,199,106,.05);color:#7bdca0;font-size:13px">
               This type has earned go-live. Flipping it is a deliberate follow-up step (auto-deliver + sampling verify), not automatic here.
             </div>`
          : `<div style="margin-top:14px;color:var(--text-faint);font-size:13px">Blocking go-live: ${r.reasons.map(esc).join("; ")}.</div>`}
      </div>`;
  }).join("");

  const body = `
    <div class="section-header">
      <h1>Graduation tracker</h1>
      <div class="section-sub">Go-live scoreboard for the deliverable judge gate. Earned on evidence, held in shadow until green.</div>
    </div>
    ${explainer}
    ${!queryOk
      ? `<div class="card" style="border:1px solid #e07158"><div style="color:#e07158">The verdict table could not be read. Status is unverified.</div></div>`
      : totalVerdicts === 0
        ? `<div class="card"><div class="label">No verdicts yet</div>
             <p style="color:var(--text-mute);font-size:14px;line-height:1.6;margin:10px 0 0">
               Nothing has run through the gate. Generate memos on <a href="/admin/memos" style="color:var(--gold)">/admin/memos</a>;
               each records a shadow verdict here, and your deliver or revert on it fills in the decision. The track record builds from there.
             </p>
           </div>`
        : cards}
  `;

  return html(layout("Graduation tracker", body, user));
}
