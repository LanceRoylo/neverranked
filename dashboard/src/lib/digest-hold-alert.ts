/**
 * digest-hold-alert.ts — the notification path for a held digest.
 *
 * WHY THIS EXISTS. The grader hold has always inserted an admin_inbox row,
 * and that insert has been failing since 2026-05-18. admin_inbox carries
 * UNIQUE(kind, target_type, target_id) and the insert hard-coded
 * target_type 'digest' with target_id 0, so every hold for every client
 * collided on the same key as row 43 and threw. The throw landed in a
 * `catch {}` commented "Inbox is non-critical". One row exists all-time,
 * for testclient@example.com. Every real hold in the 113 days since,
 * including six for a paying client, was recorded nowhere a human reads.
 *
 * The guard was never the problem. The guard worked perfectly and held
 * every thin digest it should have. What failed was the sentence that was
 * supposed to say so.
 *
 * TWO DECISIONS WORTH KEEPING.
 *
 * Keyed per CLIENT, not per send. One live row per client that refreshes
 * is what an operator can act on. Per-send rows would have produced 24
 * duplicates in 12 days, which is its own kind of silence.
 *
 * created_at is NEVER updated on conflict. It is the day the client
 * stopped hearing from us, and the briefing sorts and ages on it. Bumping
 * it each morning would make a hold that has run six days read as one day
 * old, which is exactly how a chronic problem disguises itself as a fresh
 * one.
 */

export interface HoldAlertInput {
  /** Client the held digest belonged to. Falls back to the recipient. */
  clientSlug: string;
  recipient: string;
  /** customers.status IN ('active','pilot'). A paying client hearing
   *  nothing and an unpaid beta hearing nothing are not the same event. */
  paying: boolean;
  voicePass: boolean;
  substancePass: boolean;
  issues: string[];
  /** Unix seconds. Injected so the row is testable. */
  now: number;
}

export interface BoundStatement {
  sql: string;
  binds: (string | number)[];
}

/** 'high' for a client who pays, 'normal' otherwise. The briefing's
 *  needs-you lane sorts on this, so it is the difference between a
 *  revenue problem surfacing and sitting behind fourteen routine rows. */
export function holdUrgency(paying: boolean): "high" | "normal" {
  return paying ? "high" : "normal";
}

/**
 * The upsert that records a held digest where a human will see it.
 *
 * Returned rather than executed so the exact SQL and bindings can be
 * asserted in a test. The bug this replaces was invisible precisely
 * because the statement was inline, its failure was swallowed, and
 * nothing anywhere asserted that it worked.
 */
export function holdInboxUpsert(i: HoldAlertInput): BoundStatement {
  const urgency = holdUrgency(i.paying);
  const stamp = new Date(i.now * 1000).toISOString().slice(0, 10);
  const title = i.paying
    ? `PAYING CLIENT heard nothing: digest held for ${i.clientSlug}`
    : `Digest held by grader: ${i.clientSlug}`;
  const body =
    `Recipient: ${i.recipient}. Still held as of ${stamp}. ` +
    `Voice pass: ${i.voicePass}. Substance pass: ${i.substancePass}. ` +
    `Issues: ${i.issues.join("; ").slice(0, 800)} ` +
    `(This row refreshes on every hold. Its date is when the holds STARTED, not the latest one.)`;

  return {
    // ON CONFLICT names the real constraint. Without it this is the
    // statement that has thrown daily since May.
    sql: `INSERT INTO admin_inbox
            (kind, title, body, action_url, target_type, target_id, target_slug, urgency, status, created_at)
          VALUES ('digest_held_by_grader', ?, ?, '/admin/email-test', ?, 0, ?, ?, 'pending', ?)
          ON CONFLICT (kind, target_type, target_id) DO UPDATE SET
            title       = excluded.title,
            body        = excluded.body,
            urgency     = excluded.urgency,
            status      = 'pending',
            resolved_at = NULL,
            resolved_by = NULL`,
    binds: [title, body, `digest:${i.clientSlug}`, i.clientSlug, urgency, i.now],
  };
}
