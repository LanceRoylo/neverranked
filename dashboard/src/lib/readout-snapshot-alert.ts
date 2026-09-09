/**
 * readout-snapshot-alert.ts — tell a human when the readout snapshot is missing.
 *
 * WHY THIS EXISTS. buildReadoutSnapshot has four guards that refuse to write
 * rather than write something wrong, and the best of them says so outright:
 * "Refusing to write a snapshot that asserts absence it cannot measure."
 * Every one returned a bare boolean that its only caller discarded, so all
 * four were indistinguishable from the step never running.
 *
 * The cost is dated. The weekly cadence exists so the readout-shape row stays
 * fresher than FORENSIC_SNAPSHOT_MAX_AGE_DAYS. Miss it and buildClientSnapshot
 * writes a LEGACY-shape row with a newer week_start, report-facts prefers that
 * one, and the readout works in week 1 and breaks in week 4 -- landing broken
 * on the 25th, which is when a customer reads it.
 *
 * NOT A RETRY. Unlike the per-keyword citation run, none of these four
 * conditions is transient. Retrying will not register an owned domain or
 * resolve a business name. Attempts would be spent on something only a human
 * can fix, which is why this raises an alert instead of throwing.
 */

const REASONS: Record<string, { human: string; fix: string }> = {
  no_owned_domain: {
    human: "no active owned domain is registered",
    fix: "Insert the client's own domain in `domains` with is_competitor = 0 and active = 1, then re-run the weekly extras workflow.",
  },
  no_business_name: {
    human: "no business name could be resolved",
    fix: "Layer 2 is measured by NAME, so without one every model-knowledge surface would read 0% and the snapshot would assert an absence it never measured. Set customers.name (or the injection_configs entry) for this client.",
  },
  no_runs_in_window: {
    human: "no citation runs landed in the month-to-date window",
    fix: "Measurement did not run, or ran under a different client_slug. Check citation_keywords.active = 1 and the citation workflow's recent cron_runs before the 25th.",
  },
  no_recognized_engines: {
    human: "runs exist but none mapped to a known engine label",
    fix: "An engine label drifted from READOUT_ENGINE_LABEL. Compare the engine values in citation_runs against that map.",
  },
};

export interface SnapshotAlertInput {
  clientSlug: string;
  reason: string;
  /** customers.status IN ('active','pilot'). */
  paying: boolean;
  /** Unix seconds. */
  now: number;
}

export interface BoundStatement {
  sql: string;
  binds: (string | number)[];
}

/**
 * Upsert keyed per client, mirroring the digest hold alert. created_at is
 * never bumped, so a snapshot that has been missing for three weeks does not
 * present as a problem discovered this morning.
 */
export function snapshotMissingAlert(i: SnapshotAlertInput): BoundStatement {
  const r = REASONS[i.reason] ?? {
    human: `an unrecognized guard fired (${i.reason})`,
    fix: "Read the [readout-snapshot] line in the worker logs for this client.",
  };
  const stamp = new Date(i.now * 1000).toISOString().slice(0, 10);
  const title = i.paying
    ? `PAYING CLIENT readout snapshot missing: ${i.clientSlug}`
    : `Readout snapshot missing: ${i.clientSlug}`;
  const body =
    `The month-to-date readout snapshot was not written because ${r.human}. ` +
    `Still missing as of ${stamp}. ${r.fix} ` +
    `Left unfixed, the readout falls back to a legacy-shape row and renders wrong on the 25th. ` +
    `(This row refreshes while the problem persists. Its date is when it STARTED.)`;

  return {
    sql: `INSERT INTO admin_inbox
            (kind, title, body, action_url, target_type, target_id, target_slug, urgency, status, created_at)
          VALUES ('readout_snapshot_missing', ?, ?, '/admin/qa', ?, 0, ?, ?, 'pending', ?)
          ON CONFLICT (kind, target_type, target_id) DO UPDATE SET
            title       = excluded.title,
            body        = excluded.body,
            urgency     = excluded.urgency,
            status      = 'pending',
            resolved_at = NULL,
            resolved_by = NULL`,
    binds: [
      title,
      body,
      `readout:${i.clientSlug}`,
      i.clientSlug,
      i.paying ? "high" : "normal",
      i.now,
    ],
  };
}
