/**
 * digest-verdict.ts — the editorial spine of the weekly digest.
 *
 * The 2026-08-10 redesign: the digest leads with ONE verdict sentence and
 * shows ONLY movement that cleared a threshold. Everything else lives in a
 * single compact numbers table where each figure appears exactly once.
 *
 * WHY THRESHOLDS. The digest grader held every compose for three months,
 * correctly: ten stacked data cards repeated the same domain's numbers in
 * four places, so any two could read as a contradiction. Structure was the
 * defect. A number stated once cannot disagree with itself, and a week
 * where nothing crossed a threshold is HONESTLY described as quiet — the
 * confidence to send "nothing moved, nothing needs you" in two lines is
 * the measurement-discipline brand doing its job.
 *
 * Named creative lever (HM): Specificity — every line a concrete measured
 * fact with its denominator, in the format "one verdict, then receipts."
 *
 * VOCABULARY DISCIPLINE (see citation-digest-shape.test.ts): share is % of
 * ALL citations (weighted); coverage is queries-cited-at-all (a stock).
 * Never render one with the other's words. House style: no em dashes, no
 * semicolons in client copy.
 */

export interface ClientWeek {
  domain: string;
  clientSlug: string;
  /** AEO readiness score, 0-100. */
  score: number;
  scorePrev: number | null;
  /** Citation share 0..1, null when citation tracking has no snapshot. */
  share: number | null;
  sharePrev: number | null;
  /** Coverage: tracked queries where the client is cited at all. */
  coverageWon: number | null;
  coverageTotal: number | null;
  /** Google Search Console clicks for the latest window. */
  clicks: number | null;
  clicksPrev: number | null;
  /** Roadmap items completed this week (titles). */
  shippedThisWeek: string[];
  /** Notable events (wins and concerns only reach the digest). */
  events: Array<{ severity: "info" | "win" | "concern"; title: string }>;
  /** Pending actions that need the client. */
  actionsPending: number;
}

/** Movement thresholds. Below these, a change is noise and stays in the
 * numbers table only. Share moves in percentage POINTS. */
export const SHARE_MOVE_PTS = 2;
export const SCORE_MOVE_PTS = 3;
export const CLICKS_MOVE_REL = 0.2;
export const CLICKS_MOVE_MIN = 5;

export interface MovedItem {
  kind: "share" | "score" | "clicks" | "shipped" | "event";
  direction: "up" | "down" | "note";
  text: string;
}

export interface WeekReport {
  domain: string;
  clientSlug: string;
  verdict: string;
  moved: MovedItem[];
  needsYou: boolean;
}

const pct = (v: number): number => Math.round(v * 100);

/** Movement for one client, priority order: share, score, clicks, shipped,
 * events. Share leads because it is the outcome metric — the number that
 * moves revenue conversations — while score is an input. */
export function movedItems(c: ClientWeek): MovedItem[] {
  const out: MovedItem[] = [];

  if (c.share !== null && c.sharePrev !== null) {
    const diff = pct(c.share) - pct(c.sharePrev);
    if (Math.abs(diff) >= SHARE_MOVE_PTS) {
      out.push({
        kind: "share",
        direction: diff > 0 ? "up" : "down",
        text:
          diff > 0
            ? `Citation share climbed ${diff} points to ${pct(c.share)}% of all citations across tracked queries.`
            : `Citation share slipped ${Math.abs(diff)} points to ${pct(c.share)}% of all citations across tracked queries.`,
      });
    }
  }

  if (c.scorePrev !== null) {
    const diff = c.score - c.scorePrev;
    if (Math.abs(diff) >= SCORE_MOVE_PTS) {
      out.push({
        kind: "score",
        direction: diff > 0 ? "up" : "down",
        text:
          diff > 0
            ? `AEO readiness score rose ${diff} points to ${c.score}/100.`
            : `AEO readiness score fell ${Math.abs(diff)} points to ${c.score}/100.`,
      });
    }
  }

  if (c.clicks !== null && c.clicksPrev !== null && c.clicksPrev > 0) {
    const diff = c.clicks - c.clicksPrev;
    if (
      Math.abs(diff) >= CLICKS_MOVE_MIN &&
      Math.abs(diff) / c.clicksPrev >= CLICKS_MOVE_REL
    ) {
      out.push({
        kind: "clicks",
        direction: diff > 0 ? "up" : "down",
        text:
          diff > 0
            ? `Search clicks up ${diff} week over week (${c.clicksPrev} to ${c.clicks}).`
            : `Search clicks down ${Math.abs(diff)} week over week (${c.clicksPrev} to ${c.clicks}).`,
      });
    }
  }

  for (const title of c.shippedThisWeek.slice(0, 3)) {
    out.push({ kind: "shipped", direction: "note", text: `Shipped: ${title}` });
  }

  for (const e of c.events) {
    if (e.severity === "info") continue;
    out.push({
      kind: "event",
      direction: e.severity === "win" ? "up" : "down",
      text: e.title,
    });
  }

  return out;
}

/** One sentence that IS the email. Everything below it is receipts. */
export function weekReport(c: ClientWeek): WeekReport {
  const moved = movedItems(c);
  const needsYou = c.actionsPending > 0;

  let verdict: string;
  const lead = moved[0];
  if (lead) {
    verdict =
      moved.length === 1
        ? `${c.domain}: ${lead.text}`
        : `${c.domain}: ${lead.text} ${moved.length - 1} more change${moved.length - 1 === 1 ? "" : "s"} below.`;
  } else if (needsYou) {
    verdict = `Quiet week for ${c.domain} on the numbers. ${c.actionsPending} item${c.actionsPending === 1 ? "" : "s"} below need${c.actionsPending === 1 ? "s" : ""} you.`;
  } else {
    const bits: string[] = [];
    if (c.share !== null) bits.push(`share held at ${pct(c.share)}%`);
    bits.push(`score ${c.score}/100`);
    verdict = `Quiet week for ${c.domain}: ${bits.join(", ")}. Nothing needs you.`;
  }

  return { domain: c.domain, clientSlug: c.clientSlug, verdict, moved, needsYou };
}

/** Subject line: the verdict, compressed. One voice from inbox row to
 * final line. */
export function digestSubject(reports: WeekReport[]): string {
  if (reports.length === 1) {
    const r = reports[0];
    const lead = r.moved[0];
    if (lead) {
      // Strip the trailing period and the domain prefix is already there.
      return `${r.domain}: ${lead.text.replace(/\.$/, "")}`.slice(0, 78);
    }
    return r.needsYou
      ? `${r.domain}: quiet week, one thing needs you`
      : `${r.domain}: quiet week, nothing needs you`;
  }
  const movedCount = reports.filter((r) => r.moved.length > 0).length;
  if (movedCount === 0) {
    return `Weekly report: all ${reports.length} domains quiet`;
  }
  return `Weekly report: movement on ${movedCount} of ${reports.length} domains`;
}
