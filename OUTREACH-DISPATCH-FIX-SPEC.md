# Outreach Follow-up Dispatch Fix — Spec

Status: SPEC ONLY (not yet implemented)
Owner repo: `/Users/lanceroylo/Desktop/neverranked-outreach/` (separate tree, `worker/` subdir)
Author context: written 2026-05-18 from the neverranked dashboard window after
fixing the parallel digest-dispatch failure. Same root cause class.

> Do not implement from the dashboard window. `neverranked-outreach/` has
> uncommitted edits across multiple windows (see
> `WINDOW-HANDOFF-2026-05-14-ASB-WINDOW.md`). Execute this in that repo's
> own window, after reconciling its working tree.

---

## 1. The incident (observed, not theoretical)

On 2026-05-18, queried from prod D1 `neverranked-app`, table `outreach_send_log`:

1. `0` rows with action `email_sent` (cold/initial outreach) — nothing net-new went out.
2. `20` rows `followup_1_sent` — succeeded ~20:00 UTC.
3. `256` rows `followup_error` between 12:06–12:37 UTC, every one with:
   `touch 1: send host unreachable: Too many subrequests by single Worker invocation`

## 2. Root cause (same class as the digest failure)

1. The follow-up sender does **N inline sends inside one Worker invocation**.
2. This Cloudflare account is on the **Workers FREE plan**: a hard
   **50 subrequests per invocation**, NOT configurable (the `limits`
   block is paid-only; the API rejects it on Free — confirmed on the
   dashboard deploy 2026-05-18).
3. Each Resend send is ~1 subrequest. A batch of 256 blows the 50 cap
   after ~50 sends; the rest fail `followup_error` in one blast.
4. Failures were historically swallowed (`.catch(()=>{})`, noted in the
   05-14 handoff), so the engine reported healthy while dropping sends.

This is the identical pattern fixed on the dashboard digest path:
work that fans out many sends must NOT do it inline in one invocation,
and on Free plan you cannot buy headroom — isolation + chunking is the
only fix.

## 3. Required fix

### 3a. Chunk the send loop (mandatory)

Never attempt more than a safe fixed batch per invocation. Budget math:
50 subrequests/invocation, leave margin for D1 + Resend + tracking →
**cap at 20 sends per invocation**. Two acceptable designs:

1. **Cursor + small batch per cron tick (simplest).** Each cron tick
   sends ≤20 due items ordered by priority, advances a cursor/marks
   sent, exits. A 256 backlog drains over ≥13 ticks instead of one
   over-budget blast. Add enough cron frequency to clear daily volume.
2. **Per-batch Workflow fan-out (mirrors the digest fix).** Cron
   enumerates due prospects, dispatches one Workflow instance per
   chunk of ≤20. Each instance is its own invocation with its own
   fresh 50 budget. Higher complexity; use only if cadence needs it.

Recommendation: start with #1 (cursor + batch). It is the lowest-risk
change and matches current volume.

### 3b. Isolated invocation

The follow-up sender must run in its own scheduled invocation, not
sharing one with cold-send, enrichment, or any sweep. If multiple
schedules exist, route by `event.cron` (Cloudflare passes the exact
cron string; see the dashboard `scheduled()` handler in
`dashboard/src/index.ts` for the reference pattern).

### 3c. Fail loud

1. Remove every `.catch(()=>{})` on send paths. Log per-attempt
   outcome to `outreach_send_log` (already happening for the 256 —
   keep it, do not swallow).
2. Write a `cron_runs` row per send tick:
   `task_name='outreach_followups'`, status `success` only if
   `errors === 0 && sent === attempted`, else `partial`/`failure`,
   detail `sent=X/Y errors=Z`. (Mirror
   `dispatchWeeklyDeliveries()` in `dashboard/src/cron.ts`.)

### 3d. Heartbeat invariant (in THIS repo: `scripts/heartbeat.mjs`)

Add an `outreach-dispatch-result` invariant that reads the latest
`outreach_followups` `cron_runs` row (authoritative, like the new
`digest-dispatch-result` check), and fails if:
1. latest run status != success, OR
2. `followup_error` count in the last 24h exceeds a small threshold
   (e.g. > 5), OR
3. expected cold sends on a send-day = 0.

Do NOT key the invariant off an N-day email window — a single manual
re-fire masks it for days (the exact trap that hid the digest outage
~12 days).

## 4. Verification (before declaring done)

1. Re-run the follow-up sender against the existing backlog.
2. Confirm `outreach_send_log` shows `followup_1_sent` (not
   `followup_error`) and the backlog drains across ticks.
3. Confirm a truthful `cron_runs` `outreach_followups` row.
4. Confirm zero `Too many subrequests` errors in the period.
5. Watch one real scheduled cycle land clean.

## 5. Out of scope / open

- Open tracking is unreliable (Apple Mail Privacy / proxy prefetch
  fires the pixel ~100%). Do not use open-rate to judge copy. Separate
  workstream if real engagement signal is needed.
- Cold (`email_sent`) volume being 0 on 2026-05-18 was a side effect
  of the same invocation dying; confirm the cold path is also chunked
  and isolated, not just follow-ups.

## 6. Related (already shipped on the dashboard side, for reference)

- Dashboard digest dispatch isolated to its own `15 6 * * *` cron,
  fail-loud `digest_dispatch` `cron_runs`, heartbeat invariant
  rewritten to read it. Versions `8c64f87d` / `89e37040`.
- Open follow-up (separate): the digest content grader applies a
  marketing-prose rubric to a data email and holds ~100% of digests.
  Decision pending: build a data-email rubric. Not this spec.
