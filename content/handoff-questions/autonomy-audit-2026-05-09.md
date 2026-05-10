# Autonomy audit: which dashboard automations are silently dead?

Triggered by tonight's discovery that the Monday weekly citation
cron has not produced any `citation_runs` rows in 30+ days (filed
separately as `citation-cron-not-firing.md`). The hypothesis: if
one cron silently failed for 30 days without anyone noticing, others
might be dead too.

This is an empirical audit of D1 evidence vs. the automations
declared in `dashboard/src/cron.ts`. Read-only, no code changes
from this window. Output is a prioritized list of items the other
window or a future session should fix.

## Evidence: which automation tables are alive

Activity in the last 7 days (production D1):

| Table / signal | 7-day count | Latest row | Interpretation |
|---|---|---|---|
| `scan_results` (per-domain weekly scans) | 9 | 2026-05-08 | **Healthy.** Monday SCAN_DOMAIN_WORKFLOW fans out and produces 8-11 scan rows per Monday consistently. |
| `roadmap_items` | 81 | recent | **Healthy.** Citation-gap items + manual additions both writing. |
| `admin_alerts` | 12 | recent | **Healthy.** Alert sweeps creating rows. |
| `email_log` (magic_link) | 4 of 25 total | 2026-05-08 | **Healthy.** Auth emails sending. |
| `citation_runs` | 81 | tonight (manual) | **Broken.** Filed separately. |
| `email_log` (digest) | 0 in 7 days | **2026-04-28** | **Broken.** Last digest email is 12 days old. Should fire every Monday. |
| `email_log` (onboarding_drip) | 0 in 7 days | **2026-04-25** | **Suspect.** Last drip email is 15 days old, lifetime total is 2. Either no eligible users or the producer is broken. |
| `gsc_snapshots` | 0 in 7 days | **2026-04-11** | **Broken.** Last GSC pull is 29 days old. Lifetime total is 4. |
| `content_drafts` | 0 in 7 days | -- | **Suspect.** Content pipeline produces no drafts; could be by design (manual gate) or broken. |

Crons declared in `wrangler.jsonc`:
- `0 6 * * *` -- daily 06:00 UTC
- `0 17 * * *` -- daily 17:00 UTC

Both fire (the magic_link emails at 17:00 UTC and the Monday scan
fanout both prove the schedule is registered and the worker
processes invocations).

## Confirmed broken cron paths

### 1. Weekly digest fanout

**Symptom:** No `email_log` rows of type `digest` since 2026-04-28
(12 days). Should fire every Monday at 06:00 UTC for every user
with `email_digest = 1`.

**Likely cause:** Per the comment block in
`dashboard/src/workflows/send-digest.ts`, this exact failure mode
was already encountered and partially fixed by introducing a
per-user workflow. The fanout is dispatched from
`dashboard/src/cron.ts` line 68-84:

```
for (const u of users) {
  await env.SEND_DIGEST_WORKFLOW.create({ params: { userId: u.id } });
}
```

This inner loop has its own subrequest budget (the cron handler is
a separate invocation). The break is somewhere else: either the
loop never runs (gated by `domains.length === 0`?), `users` query
returns empty, or the per-user workflow is failing silently
post-dispatch.

**Verification:** check `email_digest = 1` user count, check
SEND_DIGEST_WORKFLOW instance status in Cloudflare dashboard,
inspect runtime logs for last Monday at 06:00 UTC.

**Fix shape:** unknown until verification narrows. May be a one-line
fix. Estimated effort: 30-60 minutes of investigation + fix.

### 2. GSC pull

**Symptom:** Only 4 `gsc_snapshots` rows ever created. Last one
2026-04-11 (29 days ago). Should fire weekly via the
`WeeklyExtrasWorkflow.gsc-pull` step.

**Likely cause:** Same workflow (`WeeklyExtrasWorkflow`) that
processes citations. Two possibilities:

- The workflow itself is not firing (would also kill citations,
  which is at least partially correlated).
- The GSC step inside the workflow is failing silently.

The comment in `dashboard/src/workflows/weekly-extras.ts` notes
that "the citations step burns through ~1000 subreqs over 3
minutes," so by the time `step.do("gsc-pull")` runs, the budget
is gone. Fixing citations to per-keyword workflows (filed in the
companion handoff doc) would also unblock GSC, since GSC then
runs in a fresh budget.

**Verification:** confirm WeeklyExtrasWorkflow instance status in
Cloudflare dashboard. Check whether `gsc-pull` step ever
completes successfully.

**Fix shape:** likely included free with the per-keyword citation
fix, since both share the workflow budget.

### 3. Citation runs (filed separately)

See `content/handoff-questions/citation-cron-not-firing.md`. The
fix shape there (per-keyword workflow dispatch) likely also
unblocks GSC.

## Suspect but not confirmed

### Onboarding / nurture drip emails

**Symptom:** 2 onboarding_drip emails ever, last 2026-04-25.
Could be by design if there are no eligible users in the drip
window, or could be a broken sweep. Run `sendOnboardingDripEmails`
from `runDailyTasks` daily.

**Verification:** read `onboarding_drip_*` columns on `users`
table. If there are users at drip stages 2-7 with `last_sent_at`
older than the drip cadence, the producer is broken.

### Content pipeline drafts

**Symptom:** Zero `content_drafts` rows in 7 days.

**Verification:** could be intentional if content_drafts is
written only on manual trigger. Check `runContentPipeline` call
sites and the gating logic.

### admin_inbox

**Symptom:** Only 1 row in 7 days. Surfacing alerts is the
purpose of this surface; if Lance has 9+ unread alerts (per the
HANDOFF doc), the writer side is functioning. The 1-in-7-days
shape is consistent with low alert volume, not a broken writer.

## Why this matters operationally

NeverRanked sells autonomous citation infrastructure. The promise
to clients (and the value proposition behind the State of AEO
report) is: this system runs itself and surfaces what matters
without a human babysitting the producer.

Tonight's discovery surface area:

- 1 broken cron (citations) led to the realization that the
  State of AEO report has been built on manual-trigger data
  for 30+ days.
- 2 more broken crons (digest, GSC) found within an hour of
  digging.
- The weekly customer digest -- the surface where customers
  see citation movement and the State of AEO industry block --
  has not fired in 12 days.

The good news: the per-keyword workflow refactor proposed in
`citation-cron-not-firing.md` likely unblocks GSC for free, and
the digest fix is separate but small.

## Recommended sequencing

For whichever window picks this up:

1. **Verify and fix the digest fanout (suspected 1-line bug).** ~30 min.
2. **Ship the per-keyword workflow refactor for citations + GSC.** ~1-2 hours.
3. **Add a daily heartbeat sweep** that checks each major
   automation table for staleness and writes admin_inbox rows
   when anything goes 8+ days without activity. ~30 min. This
   prevents the next 30-day silent failure.
4. **Run the audit again in 14 days** to confirm the dead
   automations are alive again.

Total effort: ~2-3 hours of dashboard/src/ work.

## Files this audit recommends touching

- `dashboard/src/cron.ts`
- `dashboard/src/workflows/weekly-extras.ts` (or replacement)
- `dashboard/src/workflows/send-digest.ts` (verify, possibly fix)
- `dashboard/src/workflows/run-citation-for-keyword.ts` (new file)
- `dashboard/wrangler.jsonc` (register new workflow)
- `dashboard/src/admin-alerts.ts` (heartbeat sweep)

All in the other window's actively-patched zone. This window will
not touch any of them without explicit handoff.
