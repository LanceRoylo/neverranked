/**
 * Shared visual primitives — server-side SVG renderers that any
 * dashboard surface can import. The signature treatment is the score
 * gauge: gold dial with layered Gaussian glow, glowing terminator
 * dot, ambient backdrop, tick marks. Custom-built (no chart.js) so we
 * own the aesthetic and keep visual identity consistent across the
 * marketing site, the NVI report, the customer dashboard, and the
 * audit deliverable.
 *
 * Per HM principle #14 (Beauty Is Functional): aesthetics are how
 * strategy lands. Same gauge everywhere = recurring visual signature.
 */

const COLOR_GOLD = "#c9a84c";
const COLOR_GOLD_WARM = "#e8c767";
const COLOR_LINE = "#222";
const COLOR_TEXT = "#e8e6df";
const COLOR_TEXT_FAINT = "#555";
const COLOR_GOOD = "#4ade80";
const COLOR_WARN = "#e8c767";
const COLOR_BAD = "#e88a6e";

export interface GaugeOptions {
  /** SVG viewbox width. Default 360. */
  width?: number;
  /** SVG viewbox height. Default 240. */
  height?: number;
  /** Show the score number centered inside the gauge. Default true. */
  showScore?: boolean;
  /** Show the "/100" denominator label. Default true. */
  showDenom?: boolean;
  /** Show the grade word ("Strong", "Building", "Weak", "Absent") below score. Default true. */
  showGrade?: boolean;
  /** ARIA label override. */
  ariaLabel?: string;
  /** Filter ID prefix -- when multiple gauges render on the same
   * page, each needs unique filter IDs to avoid collision. */
  idPrefix?: string;
}

/**
 * Render a half-circle score gauge as inline SVG markup. Score and
 * max may be any positive numbers; the dial fills proportionally.
 *
 * Usage:
 *   const svg = renderGauge(56, 100);
 *   const svgSmall = renderGauge(56, 100, { width: 200, height: 130, idPrefix: "kpi" });
 */
export function renderGauge(score: number, max: number, opts: GaugeOptions = {}): string {
  const W = opts.width ?? 360;
  const H = opts.height ?? 240;
  const showScore = opts.showScore ?? true;
  const showDenom = opts.showDenom ?? true;
  const showGrade = opts.showGrade ?? true;
  const idP = opts.idPrefix ?? "g";

  const pct = max > 0 ? Math.min(1, Math.max(0, score / max)) : 0;
  const CX = W / 2;
  // CY positioned so the dial sits in the lower portion -- gauges read
  // bottom-heavy. Slight offset for tick mark visibility above the arc.
  const CY = H * 0.78;
  const R = Math.min(W * 0.38, H * 0.58);

  const polar = (theta: number) => ({
    x: CX + R * Math.cos((theta * Math.PI) / 180),
    y: CY + R * Math.sin((theta * Math.PI) / 180),
  });
  const arc = (start: number, end: number) => {
    const s = polar(start), e = polar(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };

  const trackPath = arc(180, 360);
  const fillEndAngle = 180 + 180 * pct;
  const fillPath = pct > 0 ? arc(180, fillEndAngle) : "";
  const tip = polar(fillEndAngle);

  const scaledScore = max > 0 ? Math.round((score / max) * 100) : 0;
  const grade = scaledScore >= 80 ? "Strong" : scaledScore >= 50 ? "Building" : scaledScore >= 25 ? "Weak" : "Absent";
  const gradeColor = scaledScore >= 80 ? COLOR_GOOD : scaledScore >= 50 ? COLOR_WARN : COLOR_BAD;

  const strokeWidth = R * 0.105; // dial thickness scales with gauge size
  const tickInner = R - strokeWidth * 1.6;

  // Tick marks every 25%. Lit ticks (active range) gold-tinted; unlit
  // mute. Quiet detail that makes the gauge feel engineered.
  const ticks: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const a = 180 + (i / 4) * 180;
    const outer = polar(a);
    const inner = {
      x: CX + tickInner * Math.cos((a * Math.PI) / 180),
      y: CY + tickInner * Math.sin((a * Math.PI) / 180),
    };
    const lit = (i / 4) <= pct;
    const color = lit ? COLOR_GOLD : COLOR_LINE;
    const opacity = lit ? 0.55 : 0.4;
    ticks.push(
      `<line x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" stroke="${color}" stroke-width="${lit ? 1.5 : 1}" opacity="${opacity}"/>`,
    );
  }

  // Font sizes scale with gauge size so the gauge looks proportional
  // at any width.
  const scoreFontSize = Math.round(R * 0.55);
  const denomFontSize = Math.round(R * 0.075);
  const gradeFontSize = Math.round(R * 0.075);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${opts.ariaLabel ?? `Score ${scaledScore} out of 100`}">
    <defs>
      <filter id="${idP}_glowGold" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${R * 0.045}" result="b1"/>
        <feGaussianBlur in="SourceGraphic" stdDeviation="${R * 0.105}" result="b2"/>
        <feMerge>
          <feMergeNode in="b2"/>
          <feMergeNode in="b1"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="${idP}_glowText" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${R * 0.022}" result="b1"/>
        <feMerge>
          <feMergeNode in="b1"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <linearGradient id="${idP}_dialFill" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${COLOR_GOLD}" stop-opacity="0.85"/>
        <stop offset="50%" stop-color="${COLOR_GOLD_WARM}" stop-opacity="1"/>
        <stop offset="100%" stop-color="${COLOR_GOLD}" stop-opacity="0.95"/>
      </linearGradient>
    </defs>
    <circle cx="${CX}" cy="${CY}" r="${R - strokeWidth * 2}" fill="none" stroke="${COLOR_LINE}" stroke-width="1" opacity="0.35"/>
    ${ticks.join("\n    ")}
    <path d="${trackPath}" fill="none" stroke="${COLOR_LINE}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="0.7"/>
    ${fillPath ? `
    <path d="${fillPath}" fill="none" stroke="${COLOR_GOLD}" stroke-width="${strokeWidth}" stroke-linecap="round" filter="url(#${idP}_glowGold)" opacity="0.55"/>
    <path d="${fillPath}" fill="none" stroke="url(#${idP}_dialFill)" stroke-width="${strokeWidth}" stroke-linecap="round"/>
    <!-- Stacked-circles halo. Replaces the filter-based glow that was
         creating subtle rectangular artifacts when the gauge rendered
         on dark pages. Manual halo = predictable rendering, no filter
         buffer to clip or composite. -->
    <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="${R * 0.18}" fill="${COLOR_GOLD_WARM}" opacity="0.08"/>
    <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="${R * 0.13}" fill="${COLOR_GOLD_WARM}" opacity="0.18"/>
    <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="${R * 0.09}" fill="${COLOR_GOLD_WARM}" opacity="0.45"/>
    <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="${R * 0.067}" fill="${COLOR_GOLD_WARM}"/>
    <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="${R * 0.03}" fill="#fff" opacity="0.92"/>
    ` : ""}
    ${showScore ? `<text x="${CX}" y="${CY - R * 0.16}" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-size="${scoreFontSize}" font-weight="900" fill="${COLOR_TEXT}" letter-spacing="-0.025em" filter="url(#${idP}_glowText)">${scaledScore}</text>` : ""}
    ${showDenom ? `<text x="${CX}" y="${CY + R * 0.06}" text-anchor="middle" font-family="SF Mono, ui-monospace, monospace" font-size="${denomFontSize}" fill="${COLOR_TEXT_FAINT}" letter-spacing="0.28em" text-transform="uppercase">out of 100</text>` : ""}
    ${showGrade ? `<text x="${CX}" y="${CY + R * 0.24}" text-anchor="middle" font-family="SF Mono, ui-monospace, monospace" font-size="${gradeFontSize}" fill="${gradeColor}" letter-spacing="0.32em" text-transform="uppercase" font-weight="500">— ${grade} —</text>` : ""}
  </svg>`;
}
