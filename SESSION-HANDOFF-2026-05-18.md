# Session handoff — 2026-05-18

**This is the LAST window/session handoff doc.** NeverRanked is
consolidating to a single Claude window. Going forward the canonical
sources of truth are **auto-memory + git history**, not handoff files.
Read memory first (`MEMORY.md` index) — durable decisions live there,
not here. This file only captures non-memory operational state from
this session.

## Shipped this window (all on `origin/main`, tree clean)

1. **PR #28 merged** — HTC meta description shipped as numbered
   migration `0096`. Greg's approved copy is now durable in the
   migration ledger and live in prod (`/inject/hawaii-theatre.json`,
   single row, homepage-only).
2. **Uncommitted pile stabilized** — the deployed-but-uncommitted
   working tree was committed in 5 coherent commits (privacy GSC
   section + verification prep, ASB 05-18 meeting docs, 4 social
   carousels + Jordan PDF, `.well-known/security.txt` + handoff
   record, deterministic `dist/` rebuild). Stale `stash@{0}`
   ("free monitoring tier design spec") dropped — verified 100%
   superseded dist build noise, zero unique source.
3. **Dependabot sweep** — 10 low-risk PRs merged green (Actions
   bumps, workers-types, playwright, wrangler).
4. **Incident found + fixed:** wrangler 4.90.1 requires Node >=22;
   all CI was pinned to Node 20 → `deploy-dashboard` was broken.
   Bumped all 11 Node pins across 9 workflows to 22, pushed,
   **verified dashboard deploy succeeds** (dry-run + worker deploy +
   `No migrations to apply`). `beautiful-wilbur` branch deleted
   (superseded by #6/#7; did not fix Node).

## Deliberately open — NOT forgotten

- **PRs #14, #15, #16** — TypeScript `5.9.3 -> 6.0.3` (admin,
  mcp-server, schema-check). **Recommend decline.** TS 6 is a major
  with breaking changes; repo already carries pre-existing `tsc`
  errors and CI only gates on `tsx --test`, so a green check would
  not prove the type layer survives. No functional gain now.
- **PR #17** — `@types/node 22 -> 25` (mcp-server). Hold; pairs with
  the TS decision. Revisit together if/when the toolchain is moved
  intentionally. Leave open as a Dependabot reminder; don't close.

## Date-bound, cron-tracked (no action unless date reached)

- **2026-05-20** — Atlas decision-indexer re-run with smarter
  `--skip-done` (recover rate-limit-truncated sessions). See memory
  `atlas_indexer_followup` (renamed 2026-05-24 from `benjamin_indexer_followup`).
- **2026-05-20** — Free-check gate-LEVEL A/B test ends; needs a
  mild-vs-aggressive decision + keep/revert call. See memory
  `freecheck_gate_ab`.

## Durable context — see memory, not this file

- One window per project (`feedback_single_window`).
- GSC verification is a pre-scale gate + weekly test-user re-auth
  caveat (`gsc_verification_prescale`).
- Positioning, margins, pitch pattern, deploy gotchas, etc. — all
  already in `MEMORY.md`.

## Optional future cleanup (not done — needs explicit go-ahead)

~8 stale `claude/*` git worktrees remain from the multi-window era
(`git worktree list`). Prunable to reduce confusion, but destructive,
so left for an explicit decision.
