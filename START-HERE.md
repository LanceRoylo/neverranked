# START HERE — NeverRanked single-window onboarding

You are now the single, canonical window for NeverRanked. Another
window did a session of work on 2026-05-18 and has been closed. This
file is the orientation entrypoint — read it, then follow its
pointers. Get up to speed before doing anything.

1. **Work location:** Use the main repo at
   `/Users/lanceroylo/Desktop/neverranked` on branch `main`. Do not
   create new worktrees. ~8 stale `claude/*` worktrees remain from
   the old multi-window era — leave them alone (pruning is parked
   pending explicit go-ahead).

2. **Read first, in order:** (a) auto-memory `MEMORY.md` index and
   the entries it points to — durable decisions live there;
   (b) `SESSION-HANDOFF-2026-05-18.md` in the repo root —
   operational state from the last session.

3. **Current state (verified clean):** `main` == `origin/main`,
   working tree clean, 0 stashes, both deploy workflows (dashboard +
   Pages) green. Nothing is mid-flight.

4. **What shipped last session:** PR #28 merged (Hawaii Theatre meta
   description now durable in the migration ledger, live in prod); a
   large deployed-but-uncommitted pile committed in 5 commits + stale
   stash dropped + `dist/` rebuilt; 10 Dependabot PRs merged; an
   incident fixed (wrangler 4.90.1 needs Node >=22, all CI bumped
   20->22, dashboard deploy verified working); redundant
   `beautiful-wilbur` branch deleted.

5. **Deliberately open — do not "finish" without a decision:** PRs
   #14/#15/#16 (TypeScript 5.9.3->6.0.3) and #17 (@types/node
   22->25). Recommendation on record: decline — TS 6 is a breaking
   major, repo has pre-existing `tsc` errors, CI only gates on
   `tsx --test` so green checks wouldn't prove safety. Leave them
   open as Dependabot reminders unless Lance decides otherwise.

6. **Date-bound, cron-tracked (act only when the date arrives):**
   2026-05-20 — Benjamin decision-indexer re-run with smarter
   `--skip-done`; 2026-05-20 — free-check gate-LEVEL A/B test ends,
   needs a mild-vs-aggressive keep/revert decision. Details in
   memory.

7. **Workflow norms going forward:** single window only; durable
   decisions go to auto-memory, not new handoff docs
   (`SESSION-HANDOFF-2026-05-18.md` is explicitly the last of its
   kind); follow the plan-first rule in `~/.claude/CLAUDE.md` before
   any state-changing action; commit and push at end of session.

8. **GSC note:** Google Search Console brand verification is a
   deliberate pre-scale gate (~100 customers), not a near-term
   blocker — but the weekly test-user re-auth churn may force it
   earlier. See memory `gsc_verification_prescale`. Don't re-flag it
   as urgent.
