/**
 * measurement-in-progress.ts — what a client sees between kickoff and their
 * first complete reading.
 *
 * Every paying client hits this window. Three runs spread across the month
 * means roughly three weeks pass before there is anything to compare, and
 * until 2026-08-24 the cockpit answered that window with a 404.
 *
 * The frozen expectation ladder says month one IS the baseline, so
 * pre-engagement pilot data is deliberately NOT shown here. It is not their
 * reading, and presenting it invites a fair question about what they are
 * paying for.
 *
 * What is shown instead is the thing the engagement rests on: a question set
 * fixed and dated before any measurement existed. For a client who hired an
 * independent auditor, watching the measurement run against a pre-committed
 * set is not a placeholder. It is the product.
 */
const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface InProgress {
  slug: string;
  customerName: string;
  categoryLabel: string | null;
  questionCount: number;
  runsDone: number;
  runsTarget: number;
  runDays: number[];
  monthLabel: string;
  firstReadingLabel: string | null;
}

export function renderMeasurementInProgress(d: InProgress): string {
  const pct = d.runsTarget > 0 ? Math.round((d.runsDone / d.runsTarget) * 100) : 0;
  const remaining = Math.max(0, d.runsTarget - d.runsDone);

  // Stated from counts, never asserted, so the sentence stays true as runs land.
  const status =
    d.runsDone === 0
      ? `Measurement starts this month. Nothing has been captured yet.`
      : d.runsDone >= d.runsTarget
        ? `All ${d.runsTarget} passes are captured. Your first reading is being assembled.`
        : `${d.runsDone} of ${d.runsTarget} passes captured. ${remaining} to go.`;

  const when = d.firstReadingLabel
    ? `Your first complete reading lands after the final pass, on or about ${esc(d.firstReadingLabel)}.`
    : `Your first complete reading lands after the final pass this month.`;

  return `<section class="nr-chart">
    <h3 class="nr-ctitle">Baseline month in progress</h3>
    <p class="nr-cnote">${esc(status)} ${when}</p>

    <div class="mip-track"><div class="mip-fill" style="width:${pct}%"></div></div>
    <div class="mip-legend">${d.runsDone} of ${d.runsTarget} measurement passes${d.runDays.length ? ` &middot; run days ${d.runDays.join(", ")} of each month` : ""}</div>

    <p class="nr-cnote"><strong>${d.questionCount} questions, frozen.</strong> They were fixed and dated before any measurement was taken, and they do not change between runs. That is deliberate. A question set that can be edited after results arrive can be edited to flatter them. Yours cannot.</p>

    <p class="nr-cnote">There is no movement to report yet because there is no prior reading to move from. That is what a baseline is, and it is why this first month reads differently from the ones that follow. If the first reading is unflattering in places, that is the baseline doing its job.</p>

    <p class="nr-cnote">What arrives: a written readout with the reasoning shown, a prioritized punch list where every item names a first click your team can make, and the readiness cross-map. <a href="/c/${esc(d.slug)}/plan/">What to expect, month by month</a>.</p>
  </section>`;
}
