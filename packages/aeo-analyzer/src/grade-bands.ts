/**
 * Shared grade-band utility.
 *
 * Three different scoring systems live in this codebase, all
 * 0-100, all using A-F bands:
 *
 *   - Schema-grader (per-schema completeness)
 *   - AEO Readiness Score (per-domain, per scan)
 *   - AI Presence Score / NVI (per-client, per month)
 *
 * Before this module they each had their own band mapping that
 * drifted slightly over time (the schema-grader's "deploy
 * threshold" at 60 conflicted with calculateGrade's C-band
 * starting at 70, etc.). This module consolidates the bands so
 * a B on any one of the three means the same band of quality.
 *
 * Customers should never have to learn three slightly different
 * scales. One vocabulary, one source of truth.
 *
 * See NVI-SPEC.md "How NVI fits" for the rationale.
 */

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface GradeBand {
  grade: Grade;
  /** Minimum score (inclusive) to land in this band. */
  min: number;
  /** Maximum score (inclusive) for this band. */
  max: number;
  /** Hex color associated with the band for dashboard / report rendering. */
  color: string;
  /** Short label suitable for badges / pills. */
  label: string;
  /** One-line description usable as a tooltip or help-text. */
  meaning: string;
}

/**
 * The canonical bands. Match the existing dashboard grade banner
 * thresholds (so customer-facing bands don't change visually) but
 * unified across all three scoring systems.
 *
 * 90+ = A   cite-ready / portfolio-quality
 * 75+ = B   strong with specific gaps
 * 60+ = C   threshold zone, deploys but flagged
 * 40+ = D   structural problems
 *  0+ = F   critical
 */
export const GRADE_BANDS: GradeBand[] = [
  {
    grade: "A",
    min: 90,
    max: 100,
    color: "#4ade80",
    label: "Cite-ready",
    meaning: "AI engines can confidently use this as a source. Defense mode.",
  },
  {
    grade: "B",
    min: 75,
    max: 89,
    color: "#e8c767",
    label: "Strong foundation",
    meaning: "Strong foundation with a few specific gaps. A focused 30-45 day push typically moves to A.",
  },
  {
    grade: "C",
    min: 60,
    max: 74,
    color: "#facc15",
    label: "Threshold",
    meaning: "Visible but not first-choice. Competitors with better structure are getting picked over you.",
  },
  {
    grade: "D",
    min: 40,
    max: 59,
    color: "#f59e0b",
    label: "Needs work",
    meaning: "Real structural problems. AI engines are skipping you for cleaner sources.",
  },
  {
    grade: "F",
    min: 0,
    max: 39,
    color: "#ef4444",
    label: "Critical",
    meaning: "AI engines cannot parse you well enough to cite. Every week without action the gap widens.",
  },
];

/** Look up the band for a numeric score. Always returns a band
 *  (F at the floor, A at the ceiling). */
export function gradeBand(score: number): GradeBand {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  for (const band of GRADE_BANDS) {
    if (clamped >= band.min) return band;
  }
  return GRADE_BANDS[GRADE_BANDS.length - 1]; // F
}

/** Just the letter grade. Convenience for the common case. */
export function gradeFor(score: number): Grade {
  return gradeBand(score).grade;
}

/** True if a score is at or above the C-band deploy threshold (60).
 *  This is the empirical "below this you take an 18-pp citation
 *  penalty" cutoff from the 730-citation study, used by the
 *  schema-grader to gate deploys. */
export function meetsDeployThreshold(score: number): boolean {
  return score >= 60;
}

/** Bucket name used by the dashboard's existing per-schema rendering.
 *  Kept for backwards compatibility with the 'green/gold/red'
 *  palette already used on /admin/inject. New code should prefer
 *  gradeBand() and use the .color directly. */
export type ColorBucket = "green" | "gold" | "red";

export function colorBucket(score: number): ColorBucket {
  if (score >= 80) return "green";
  if (score >= 60) return "gold";
  return "red";
}
