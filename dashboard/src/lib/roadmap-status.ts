/**
 * roadmap-status.ts — one definition of "this item is finished".
 *
 * WHY THIS EXISTS. On 2026-09-15 a retired client's 56 open items were set to
 * 'cancelled' rather than 'done', because marking them done would assert work
 * nobody performed. Two queries were taught the new status. An audit the same
 * day found six more that were not, including one that could flip a cancelled
 * item back to 'done' and two that showed cancelled work to a customer as
 * outstanding or overdue.
 *
 * That is this codebase's signature failure, and the cause every time is the
 * same: the rule lived in each call site instead of in one place. So it lives
 * here now.
 *
 * 'done' means we did it. 'cancelled' means it will not be done and that is
 * settled. Both are finished. Neither is outstanding.
 */

export const TERMINAL_ROADMAP_STATUSES = ["done", "cancelled"] as const;

/** For SQL. Interpolated, not bound, because a bound list needs one placeholder
 *  per value and this is a fixed literal set with no user input in it. */
export const TERMINAL_SQL = "('done', 'cancelled')";

/** Is this item finished, by any route? */
export function isTerminalStatus(status: string | null | undefined): boolean {
  return status === "done" || status === "cancelled";
}

/** Is there still work outstanding on this item? */
export function isOpenStatus(status: string | null | undefined): boolean {
  return !isTerminalStatus(status);
}
