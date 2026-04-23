/**
 * Impact strip -- shared visual pattern for "what did this actually
 * produce?" at the top of each surface. The content-pipeline calendar
 * was the original; this module lets every other route render the
 * same shape with their own metrics without reimplementing the CSS.
 *
 * Pattern: eyebrow label + grid of stat cells (big serif numeral,
 * short mono caption, optional accent color). Only renders when
 * there's at least one meaningful value.
 *
 * Callers pass an array of ImpactStat. Missing/null values render
 * as dashes so a half-populated strip still looks intentional.
 */

export interface ImpactStat {
  /** Big display value, rendered in serif. Pass null for "--". */
  value: string | number | null;
  /** Optional smaller suffix after the value (e.g. "/ 12"). */
  suffix?: string;
  /** Short caption shown below the value, mono + faint. */
  label: string;
  /** Optional color override for the value. Falls back to --text.
   *  Use "var(--green)" for positive outcomes, "var(--red)" for deltas. */
  accent?: string;
  /** Optional hover-title for extra context. */
  hint?: string;
}

export interface ImpactStripOptions {
  /** Label above the grid. Default: "Impact". */
  eyebrow?: string;
  /** Optional right-aligned context (e.g. time period). */
  caption?: string;
}

function fmt(v: string | number | null): string {
  if (v === null || v === undefined) return "--";
  if (typeof v === "number" && Number.isFinite(v)) {
    return v.toLocaleString();
  }
  return String(v);
}

export function renderImpactStrip(stats: ImpactStat[], opts: ImpactStripOptions = {}): string {
  // Skip rendering entirely if every stat is null -- an empty strip
  // looks broken, a missing strip looks intentional.
  const hasAny = stats.some(s => s.value !== null && s.value !== undefined && s.value !== "" && s.value !== 0);
  if (!hasAny) return "";

  const cells = stats.map(s => `
    <div${s.hint ? ` title="${s.hint.replace(/"/g, "&quot;")}"` : ""}>
      <div style="font-family:var(--serif);font-size:32px;line-height:1;font-weight:400;color:${s.accent || "var(--text)"}">
        ${fmt(s.value)}${s.suffix ? `<span style="font-size:18px;color:var(--text-faint)"> ${s.suffix}</span>` : ""}
      </div>
      <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:6px;letter-spacing:.06em">${s.label}</div>
    </div>
  `).join("");

  return `
    <div style="margin-bottom:28px;padding:22px 26px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px">
        <div class="label" style="color:var(--gold)">${opts.eyebrow || "Impact"}</div>
        ${opts.caption ? `<div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${opts.caption}</div>` : ""}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:20px">
        ${cells}
      </div>
    </div>
  `;
}
