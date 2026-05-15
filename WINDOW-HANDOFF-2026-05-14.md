# Cross-window handoff — 2026-05-14 night session

This is from the **non-ASB window** (decision-capture / infra / liveness work).
The other window is doing **ASB + MVNP meeting prep** (May 18). This file
exists so the two windows don't collide on git, deploys, or shared files.

## Git state — READ THIS FIRST

- Local `main` is **behind `origin/main`**. After our push, the
  voice-janitor bot pushed an auto-fix commit (`59b19f4`). Plus an
  `Autonomy log: 2026-05-14` commit landed from elsewhere.
- We did **not** `git pull` because there are unstaged changes in the
  working tree (yours + ours) and we didn't want to disrupt active work.
- **Before either window commits/pushes again:** coordinate. Stash, pull
  --rebase, pop. Do not force-push.
- We only ever `git add`-ed two files by name (never `git add .`):
  - `scripts/voice-janitor.mjs`
  - `.github/workflows/voice-janitor.yml`
  Everything else in the working tree is untouched by us and still yours.

## What this window DEPLOYED tonight (live in prod)

1. **check.neverranked.com** (schema-check Worker) — pricing fix
   ($500 → $750) + Pulse CTA added. Deployed via `wrangler deploy`.
2. **app.neverranked.com** (dashboard Worker) — multiple deploys:
   - 13 new decision-capture surfaces (NVI, content-review, qa sweeps,
     warm-prospects)
   - New endpoint `POST /api/admin/external-decision`
   - **Auth-ordering fix:** moved `sync-prospects` + `external-decision`
     above the auth wall. This also un-broke `sync-prospects` which was
     silently 302-ing to /login.
3. **@neverranked/mcp** — published `0.1.3` to npm (version-drift +
   vertical-enum fixes).
4. **Voice-janitor cron** — was never committed (0 runs ever). Committed,
   pushed, verified end-to-end. Now live daily 3am HST.

If the ASB window also deploys the dashboard Worker, that's fine
(same codebase, last deploy wins) — but `git pull --rebase` first so
you're building on our committed source, not an older tree.

## Secrets rotated tonight

- `ADMIN_SECRET` on the dashboard Worker was **rotated**. New value is
  in `neverranked-outreach/config.json` as `neverranked_admin_secret`.
  Any other tool/script using the old ADMIN_SECRET will now 401 until
  updated. (import-warm-fuel.js + the new decision-push both use the
  new value.)

## Files this window created/modified (avoid editing in parallel)

- `scripts/voice-janitor.mjs` (committed)
- `.github/workflows/voice-janitor.yml` (committed)
- `dashboard/src/index.ts` (deployed, NOT committed)
- `dashboard/src/routes/admin-nvi.ts` (deployed, NOT committed)
- `dashboard/src/routes/content-review.ts` (deployed, NOT committed)
- `dashboard/src/routes/warm-prospects.ts` (deployed, NOT committed)
- `dashboard/src/routes/external-decision.ts` (NEW, deployed, NOT committed)
- `dashboard/src/lib/decision-log.ts` (read only, untouched)
- `mcp-server/src/index.ts`, `mcp-server/src/lib/pkg-info.ts` (NEW),
  `mcp-server/src/tools/aeo-scan.ts`, `mcp-server/package.json`
  (published to npm, NOT committed)
- `neverranked-outreach/lib/decision-push.js` (NEW), `lib/db.js`,
  `config.json` (different repo)

The dashboard `src/` changes are **deployed but uncommitted**. When
either window does the eventual commit, include them. Don't revert them.

## Open finding (RESOLVED by ASB window)

Outreach send volume degraded — the ASB window root-caused + fixed it
(apollo-fetch page:1, hardcoded real_estate vertical, laptop-sleep
cron). Do not re-diagnose. See WINDOW-HANDOFF-2026-05-14-ASB-WINDOW.md.

## NEW (added after first handoff) — fail-closed output grader

Shipped a factual+voice fail-closed grader so nothing prospect-facing
ships ungraded (root cause: 2026-05-14 Preview with fabricated client
name + wrong case-study stat).

New files:
- `dashboard/src/preview/output-grader.ts` (NEW, deployed, NOT committed)
- `neverranked-outreach/lib/output-grader.js` (NEW, NOT committed)
  Both carry a byte-identical `CANONICAL_FACTS` block — KEEP IN SYNC.

Files this window ADDED to (additive only, did NOT touch your edits):
- `dashboard/src/preview/generator.ts` — added a grader call + held
  branch inside `buildAutonomousPreview` and an optional `status` arg
  to `savePreviewDraft`. **Did NOT touch `SYSTEM_PROMPT`** (your Hawaii
  Theatre prompt fix is intact). The merged file must keep BOTH.
- `dashboard/src/routes/preview.ts` — `handlePreviewPublic` now 404s
  any status other than draft/published (fail-closed: a held Preview
  must not render even via direct slug). You said you didn't touch this
  handler body; low collision risk, flagging anyway.
- `neverranked-outreach/scripts/generate.js` — grader gate before the
  auto-approve block; a grader fail forces prospect status `held`
  (new status, no CHECK constraint, send step ignores it).

Verified: the actual 2026-05-14 bad pattern (fake client + "thirty
days") returns FAIL; a legit score-led email whose number matches
ground truth returns PASS clean. Dashboard deployed (version
c580ad98). Outreach files syntax-clean, not yet exercised in a real
pipeline run.

## Safe for the ASB window to do without coordinating

- Anything under `pitch/`, `content/meeting-evidence/`, `may-18-meeting/`,
  ASB/MVNP docs — this window has not touched any of those.
- Read-only anything.

## NOT safe without a heads-up to this window

- `git push` (rebase coordination needed)
- Editing any dashboard `src/` file listed above
- Re-deploying the schema-check or dashboard Worker (coordinate so we
  don't deploy over each other mid-edit)
