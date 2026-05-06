/**
 * Visual rendering for the entity-graph audit. Server-side SVG, no
 * client JS. Two custom-built charts (no chart.js dependency) that
 * become part of NeverRanked's signature visual vocabulary.
 *
 * Per Lance's design mandate: visuals are the lead, prose supports.
 * Aesthetics aren't decoration -- they're how the strategy lands.
 *
 * Color/type palette mirrors the marketing site:
 *   - bg:        #0c0c0c
 *   - text:      #e8e6df
 *   - text-mute: #888
 *   - gold:      #c9a84c   (primary accent)
 *   - gold-warm: #e8c767   (highlights)
 *   - good:      #4ade80   (signal present)
 *   - warn:      #e8c767   (signal partial)
 *   - bad:       #e88a6e   (signal absent)
 *   - serif:     'Playfair Display' for headlines
 *   - mono:      'SF Mono' for labels/numbers
 *   - sans:      ui-sans-serif body
 */

import type { PartialEntityAudit, SignalKey, SignalResult } from "./entity-graph";

interface SignalRowMeta {
  key: SignalKey;
  label: string;
  short: string;
  description: string;
  // The "coming soon" flag is intentional copy: we surface signals
  // that aren't yet implemented so the visual feels complete and the
  // customer sees the roadmap rather than a half-empty chart.
  shipped: boolean;
}

const SIGNAL_ROWS: SignalRowMeta[] = [
  { key: "wikidata",          label: "Wikidata entry",            short: "Wikidata",      description: "Brand has a Wikidata entry. AI engines lean on Wikidata heavily.", shipped: true },
  { key: "wikipedia",         label: "Wikipedia article",         short: "Wikipedia",     description: "Brand has a standalone Wikipedia article (not a disambiguation).", shipped: true },
  { key: "org_schema",        label: "Organization schema",       short: "Org schema",    description: "Homepage JSON-LD with Organization type, ≥50% of key properties filled.", shipped: true },
  { key: "sameas_depth",      label: "sameAs link graph",         short: "sameAs",        description: "≥3 authoritative external profiles linked from Organization schema (LinkedIn, Crunchbase, G2, etc).", shipped: true },
  { key: "person_schema",     label: "Person schema",             short: "Person",        description: "≥1 Person node with jobTitle and sameAs (E-E-A-T author signal).", shipped: true },
  { key: "knowledge_panel",   label: "Knowledge panel signals",   short: "Knowledge",     description: "Composite proxy for Google Knowledge Panel eligibility.", shipped: true },
  { key: "about_authority",   label: "About-page authority",      short: "Authority",     description: "Founding date, awards, longevity markers, author bios with credentials.", shipped: true },
  { key: "brand_consistency", label: "Cross-platform visibility", short: "Visibility",    description: "Brand owns its top Google result and appears on review platforms.", shipped: true },
];

function statusFor(sig: SignalResult | undefined, shipped: boolean): "good" | "warn" | "bad" | "soon" {
  if (!shipped) return "soon";
  if (!sig) return "bad";
  if (sig.error) return "bad";
  if (sig.present) return "good";
  // Partial-credit cases: if Org schema has SOME completeness but
  // below threshold, surface it as warn instead of pure bad. Same for
  // sameAs with 1-2 platforms (below the 3-platform "present" bar).
  const ev = sig.evidence as Record<string, unknown> | undefined;
  if (ev) {
    const pct = ev["completeness_pct"];
    if (typeof pct === "number" && pct >= 25) return "warn";
    const platforms = ev["platform_count"];
    if (typeof platforms === "number" && platforms >= 1) return "warn";
    const persons = ev["person_count"];
    if (typeof persons === "number" && persons >= 1) return "warn";
  }
  return "bad";
}

const COLOR = {
  bg: "#0c0c0c",
  panel: "rgba(255,255,255,0.02)",
  line: "#222",
  text: "#e8e6df",
  textSoft: "#aaa",
  textMute: "#888",
  textFaint: "#555",
  gold: "#c9a84c",
  goldWarm: "#e8c767",
  good: "#4ade80",
  warn: "#e8c767",
  bad: "#e88a6e",
  soon: "#3a3a3a",
};

/**
 * Half-circle gauge SVG. Custom, no chart lib. Returns just the SVG
 * markup, ready to drop inside any HTML container.
 *
 * Visual logic: gold tick on the dial at the customer's current
 * score, faint full track for context, large numeric centered. The
 * gauge spans 180° from -90° to +90° around the center.
 */
function renderGauge(score: number, max: number): string {
  const pct = max > 0 ? Math.min(1, Math.max(0, score / max)) : 0;
  const W = 360, H = 240, CX = W / 2, CY = 188, R = 138;
  // SVG arc helpers
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
  // Map percentage 0..1 → angle 180..360 (left half clockwise to right)
  const fillEndAngle = 180 + 180 * pct;
  const fillPath = pct > 0 ? arc(180, fillEndAngle) : "";
  const tip = polar(fillEndAngle);

  const scaledScore = max > 0 ? Math.round((score / max) * 100) : 0;
  const grade = scaledScore >= 80 ? "Strong" : scaledScore >= 50 ? "Building" : scaledScore >= 25 ? "Weak" : "Absent";
  const gradeColor = scaledScore >= 80 ? COLOR.good : scaledScore >= 50 ? COLOR.warn : COLOR.bad;

  // Tick marks every 25% along the dial. The active range glows; the
  // inactive range stays mute. Tiny detail, makes the gauge feel
  // engineered rather than rendered.
  const ticks: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const a = 180 + (i / 4) * 180;
    const inner = polar(a);
    const inner2 = {
      x: CX + (R - 22) * Math.cos((a * Math.PI) / 180),
      y: CY + (R - 22) * Math.sin((a * Math.PI) / 180),
    };
    const lit = (i / 4) <= pct;
    const color = lit ? COLOR.gold : COLOR.line;
    const opacity = lit ? 0.55 : 0.4;
    ticks.push(`<line x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${inner2.x.toFixed(2)}" y2="${inner2.y.toFixed(2)}" stroke="${color}" stroke-width="${lit ? 1.5 : 1}" opacity="${opacity}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Entity score ${scaledScore} out of 100">
    <defs>
      <!-- Soft outer glow on the long dial path. Filter region is
           computed from the source's bounding box, so a tall/wide
           source gets adequate room for a stdDeviation=14 blur. -->
      <filter id="glowGold" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b1"/>
        <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="b2"/>
        <feMerge>
          <feMergeNode in="b2"/>
          <feMergeNode in="b1"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <!-- Dedicated filter for the small terminator dot. Tiny source
           (r=9 circle) means the default filter bounds are too small
           and a stdDeviation=14 blur clips into a visible square.
           userSpaceOnUse + explicit large region keeps the halo round. -->
      <filter id="glowText" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b1"/>
        <feMerge>
          <feMergeNode in="b1"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <!-- Dial gradient: not flat gold but a slight light-to-light
           shimmer along the arc so the curve has dimension. -->
      <linearGradient id="dialFill" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${COLOR.gold}" stop-opacity="0.85"/>
        <stop offset="50%" stop-color="${COLOR.goldWarm}" stop-opacity="1"/>
        <stop offset="100%" stop-color="${COLOR.gold}" stop-opacity="0.95"/>
      </linearGradient>
    </defs>
    <!-- Faint inner ring marks the dial radius without competing -->
    <circle cx="${CX}" cy="${CY}" r="${R - 28}" fill="none" stroke="${COLOR.line}" stroke-width="1" opacity="0.35"/>
    <!-- Tick marks -->
    ${ticks.join("\n    ")}
    <!-- Track (the unlit portion) -->
    <path d="${trackPath}" fill="none" stroke="${COLOR.line}" stroke-width="14" stroke-linecap="round" opacity="0.7"/>
    ${fillPath ? `
    <!-- Glow pass underneath, then sharp dial on top -->
    <path d="${fillPath}" fill="none" stroke="${COLOR.gold}" stroke-width="14" stroke-linecap="round" filter="url(#glowGold)" opacity="0.55"/>
    <path d="${fillPath}" fill="none" stroke="url(#dialFill)" stroke-width="14" stroke-linecap="round"/>
    <!-- Glowing terminator dot at the dial tip. Uses #glowDot which
         has a userSpaceOnUse region big enough that the blur halo
         doesn't clip into a square. -->
    <!-- Stacked-circles halo. No filter -- avoids the rectangular
         filter-region artifact that earlier glow approaches produced. -->
    <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="24" fill="${COLOR.goldWarm}" opacity="0.08"/>
    <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="17" fill="${COLOR.goldWarm}" opacity="0.18"/>
    <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="12" fill="${COLOR.goldWarm}" opacity="0.4"/>
    <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="9" fill="${COLOR.goldWarm}"/>
    <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="4" fill="#fff" opacity="0.92"/>
    ` : ""}
    <!-- Score number with soft glow -->
    <text x="${CX}" y="${CY - 22}" text-anchor="middle"
          font-family="Playfair Display, serif" font-size="74" font-weight="900" fill="${COLOR.text}"
          letter-spacing="-0.025em" filter="url(#glowText)">${scaledScore}</text>
    <text x="${CX}" y="${CY + 8}" text-anchor="middle"
          font-family="SF Mono, ui-monospace, monospace" font-size="10" fill="${COLOR.textFaint}"
          letter-spacing="0.28em" text-transform="uppercase">out of 100</text>
    <text x="${CX}" y="${CY + 32}" text-anchor="middle"
          font-family="SF Mono, ui-monospace, monospace" font-size="10" fill="${gradeColor}"
          letter-spacing="0.32em" text-transform="uppercase" font-weight="500">— ${grade} —</text>
  </svg>`;
}

/**
 * The signal grid. 8 rows, one per signal. Each row shows: status
 * pip, signal label, short evidence string, weight badge. "Coming
 * soon" rows render dim with a roadmap chip.
 *
 * Restraint over decoration: no animations, no gradients, no icons
 * beyond a single pip. The data is the design.
 */
function renderSignalGrid(audit: PartialEntityAudit): string {
  const rows = SIGNAL_ROWS.map((meta) => {
    const sig = audit.signals[meta.key];
    const status = statusFor(sig, meta.shipped);
    const pipColor = status === "good" ? COLOR.good : status === "warn" ? COLOR.warn : status === "bad" ? COLOR.bad : COLOR.soon;
    const labelColor = meta.shipped ? COLOR.text : COLOR.textMute;
    const weight = sig?.weight ?? 0;

    let evidenceText = "";
    if (status === "soon") {
      evidenceText = "shipping next";
    } else if (sig) {
      const ev = (sig.evidence ?? {}) as Record<string, unknown>;
      if (meta.key === "wikidata") {
        evidenceText = sig.present ? `${ev["label"] ?? "found"} — ${ev["description"] ?? ""}` : "no Wikidata entry";
      } else if (meta.key === "wikipedia") {
        evidenceText = sig.present ? `${ev["title"] ?? "found"}` : "no article";
      } else if (meta.key === "org_schema") {
        const pct = ev["completeness_pct"];
        if (typeof pct === "number") {
          const missing = (ev["missing"] as string[]) || [];
          evidenceText = `${pct}% complete${missing.length ? ` — missing ${missing.join(", ")}` : ""}`;
        } else {
          evidenceText = "no Organization schema on homepage";
        }
      } else if (meta.key === "sameas_depth") {
        const platforms = (ev["platforms_linked"] as string[]) || [];
        const count = ev["platform_count"] ?? 0;
        evidenceText = platforms.length
          ? `${count} authoritative — ${platforms.join(", ")}`
          : "no sameAs links to authoritative platforms";
      } else if (meta.key === "person_schema") {
        const c = ev["person_count"] ?? 0;
        const jt = ev["with_jobtitle"] ?? 0;
        const sa = ev["with_sameas"] ?? 0;
        evidenceText = `${c} Person nodes (${jt} with jobTitle, ${sa} with sameAs)`;
      } else if (meta.key === "knowledge_panel") {
        const pct = ev["composite_pct"];
        evidenceText = typeof pct === "number"
          ? `${pct}% composite — ${sig.present ? "likely eligible" : "below eligibility threshold"}`
          : "no signal";
      } else if (meta.key === "about_authority") {
        if (sig.error || !ev["score"]) {
          evidenceText = "no /about page detected";
        } else {
          const founded = ev["founding_year"];
          const awards = ev["awards_mentioned"] ?? 0;
          const titles = ev["team_titles_mentioned"] ?? 0;
          const parts: string[] = [];
          if (founded) parts.push(`founded ${founded}`);
          if (awards) parts.push(`${awards} award/recognition mention${awards === 1 ? "" : "s"}`);
          if (titles) parts.push(`${titles} team title${titles === 1 ? "" : "s"}`);
          evidenceText = parts.length ? parts.join(" · ") : `score ${ev["score"]}/100`;
        }
      } else if (meta.key === "brand_consistency") {
        if (sig.error) {
          evidenceText = "skipped — DataForSEO not configured";
        } else {
          const owned = ev["top_result_is_owned"];
          const platforms = (ev["review_platforms_found"] as string[]) || [];
          const ownedTop10 = ev["owned_count_top10"] ?? 0;
          const parts: string[] = [];
          parts.push(owned ? "brand owns top Google result" : "top result not brand-owned");
          parts.push(`${ownedTop10} of top 10 brand-owned`);
          if (platforms.length) parts.push(`${platforms.length} review platform${platforms.length === 1 ? "" : "s"}: ${platforms.slice(0, 3).join(", ")}`);
          evidenceText = parts.join(" · ");
        }
      }
    }

    const url = sig?.url || null;
    const linkOpen = url ? `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">` : "";
    const linkClose = url ? `</a>` : "";

    // Glow pip: layered radial halo + sharp dot. Becomes a tiny
    // light when active, recedes when not.
    const glowRgb = status === "good" ? "74,222,128" : status === "warn" ? "232,199,103" : status === "bad" ? "232,138,110" : "60,60,60";
    const pipBlock = `<div style="position:relative;width:14px;height:14px">
      ${status === "good" || status === "warn" ? `<div style="position:absolute;inset:-7px;border-radius:50%;background:radial-gradient(circle,rgba(${glowRgb},0.45) 0%,rgba(${glowRgb},0) 70%)"></div>` : ""}
      <div style="position:absolute;left:3px;top:3px;width:8px;height:8px;border-radius:50%;background:${pipColor};box-shadow:0 0 0 1px rgba(${glowRgb},0.25), 0 0 8px rgba(${glowRgb},${status === "good" ? 0.6 : status === "warn" ? 0.4 : 0.15})"></div>
    </div>`;
    return `<div style="display:grid;grid-template-columns:14px 1fr auto;gap:18px;align-items:center;padding:14px 18px;border-bottom:1px solid ${COLOR.line}">
      ${pipBlock}
      <div>
        ${linkOpen}<div style="color:${labelColor};font-size:14px;font-weight:500;letter-spacing:-0.005em">${esc(meta.label)}${url ? ` <span style="color:${COLOR.gold};font-size:11px">↗</span>` : ""}</div>${linkClose}
        <div style="color:${COLOR.textMute};font-size:12px;margin-top:3px;font-family:SF Mono, ui-monospace, monospace">${esc(evidenceText)}</div>
      </div>
      <div style="color:${COLOR.textFaint};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;font-family:SF Mono, ui-monospace, monospace">+${weight}</div>
    </div>`;
  }).join("");

  return `<div style="background:${COLOR.panel};border:1px solid ${COLOR.line};border-radius:6px;overflow:hidden">
    ${rows}
  </div>`;
}

/**
 * Action priority bar list. Each row is a horizontal bar where the
 * fill width is proportional to score_lift / max_lift, gold with a
 * soft halo. Title + detail on the left, effort + lift number on the
 * right. Top action gets a "DO THIS FIRST" pill -- single point of
 * emphasis that turns the chart from informative to motivating.
 *
 * Renders nothing when there are no actions (i.e., a perfect score).
 * Caps at 5 actions so we surface the highest-leverage few rather
 * than burying the customer in a TODO list.
 */
function renderActionBars(audit: PartialEntityAudit): string {
  const actions = (audit.actions || []).slice(0, 5);
  if (actions.length === 0) return "";

  const maxLift = Math.max(...actions.map((a) => a.score_lift));

  const rows = actions.map((action, i) => {
    const widthPct = Math.max(8, Math.round((action.score_lift / Math.max(maxLift, 1)) * 100));
    const isFirst = i === 0;
    const firstChip = isFirst
      ? `<span style="display:inline-block;font-family:SF Mono, ui-monospace, monospace;font-size:9px;color:${COLOR.bg};background:${COLOR.gold};letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:3px 8px;border-radius:3px;margin-right:10px;vertical-align:1px">do first</span>`
      : `<span style="display:inline-block;font-family:SF Mono, ui-monospace, monospace;font-size:10px;color:${COLOR.textFaint};letter-spacing:0.18em;width:18px;text-align:right;margin-right:10px">${String(action.priority).padStart(2, "0")}</span>`;

    return `<div style="padding:16px 18px;border-bottom:1px solid ${COLOR.line}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;color:${COLOR.text};font-weight:500;letter-spacing:-0.005em;line-height:1.4">${firstChip}${esc(action.title)}</div>
          <div style="font-size:12px;color:${COLOR.textMute};margin-top:6px;line-height:1.55;font-family:SF Mono, ui-monospace, monospace">${esc(action.detail)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:Playfair Display, serif;font-size:24px;font-weight:900;color:${COLOR.gold};letter-spacing:-0.02em;line-height:1">+${action.score_lift}</div>
          <div style="font-family:SF Mono, ui-monospace, monospace;font-size:10px;color:${COLOR.textFaint};letter-spacing:0.18em;text-transform:uppercase;margin-top:3px">${esc(action.effort)}</div>
        </div>
      </div>
      <!-- Lift bar with glow -->
      <div style="height:4px;background:${COLOR.line};border-radius:2px;overflow:hidden;position:relative">
        <div style="position:absolute;inset:0 ${100 - widthPct}% 0 0;background:linear-gradient(90deg, ${COLOR.gold} 0%, ${COLOR.goldWarm} 100%);box-shadow:0 0 8px rgba(232,199,103,${isFirst ? 0.55 : 0.3});border-radius:2px"></div>
      </div>
    </div>`;
  }).join("");

  return `
    <div style="margin-top:32px">
      <div style="font-family:SF Mono, ui-monospace, monospace;font-size:10px;color:${COLOR.textMute};letter-spacing:0.22em;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:12px">
        <span>Where to start</span>
        <span style="flex:1;height:1px;background:linear-gradient(90deg, ${COLOR.line} 0%, transparent 100%)"></span>
        <span style="color:${COLOR.gold}">${actions.length} prioritized actions</span>
      </div>
      <div style="background:${COLOR.panel};border:1px solid ${COLOR.line};border-radius:6px;overflow:hidden">
        ${rows}
      </div>
    </div>`;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
}

/**
 * Full audit card — gauge + signal grid + brand header. Used in the
 * admin viewer route, and (in a later chapter) embedded into NVI
 * reports and the customer-facing audit deliverable.
 */
export function renderEntityAuditCard(audit: PartialEntityAudit): string {
  const score = audit.partial_score;
  const max = audit.partial_max;
  const fullMax = 100; // total signal weight when all 8 ship; we display partial-out-of-100 so customers don't recalibrate later

  return `<div style="background:${COLOR.bg};color:${COLOR.text};font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;padding:48px 36px;max-width:820px;margin:0 auto;min-height:100vh;box-sizing:border-box">
    <div style="display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;margin-bottom:32px">
      <div>
        <div style="font-family:SF Mono, ui-monospace, monospace;font-size:11px;color:${COLOR.gold};letter-spacing:0.28em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:10px">
          <span style="display:inline-block;width:6px;height:6px;background:${COLOR.gold};border-radius:50%;box-shadow:0 0 0 3px rgba(201,168,76,0.18), 0 0 12px rgba(232,199,103,0.6)"></span>
          <span>Entity graph audit</span>
        </div>
        <h1 style="font-family:Playfair Display, serif;font-weight:900;font-size:42px;letter-spacing:-0.028em;line-height:1;margin:0">${esc(audit.brand)}</h1>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;font-family:SF Mono, ui-monospace, monospace;font-size:12px;color:${COLOR.textMute}">
          <span style="display:inline-block;width:14px;height:1px;background:${COLOR.gold};opacity:0.6"></span>
          <span>${esc(audit.domain)}</span>
        </div>
      </div>
      <div style="margin-right:-14px">${renderGauge(score, fullMax)}</div>
    </div>
    <div style="font-family:SF Mono, ui-monospace, monospace;font-size:10px;color:${COLOR.textMute};letter-spacing:0.22em;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:12px">
      <span>Eight signals</span>
      <span style="flex:1;height:1px;background:linear-gradient(90deg, ${COLOR.line} 0%, transparent 100%)"></span>
      <span style="color:${COLOR.gold}">${score} / ${fullMax} so far</span>
    </div>
    ${renderSignalGrid(audit)}
    ${renderActionBars(audit)}
    <div style="margin-top:28px;font-family:SF Mono, ui-monospace, monospace;font-size:11px;color:${COLOR.textFaint};line-height:1.8;max-width:60ch">
      Score is the sum of weighted signals. Each row shows the lift available if you complete it. The eight together represent the off-site and on-site identity surfaces that AI engines lean on most when deciding to cite a brand.
    </div>
  </div>`;
}
