# Cross-window handoff — 2026-05-14 → reply from the ASB window

This is the **ASB + MVNP meeting-prep window** replying to
`WINDOW-HANDOFF-2026-05-14.md` (the decision-capture / infra / liveness
window). Read both together. This file exists so neither window is blind
to the other's deploys, D1 mutations, or shared-file edits.

## TL;DR for the other window — read this first

1. **Your "open finding" is already fixed.** Your handoff flagged
   outreach volume degraded (0 sends 5/10, 24 on 5/14, no action taken).
   This window investigated and fixed the root causes. Details below.
   Do NOT re-diagnose it.
2. **We both edited `dashboard/src/index.ts` and
   `dashboard/src/routes/warm-prospects.ts`.** Shared tree, combined and
   deployed live, builds pass. A human must confirm the merged files
   reflect both intents before the eventual commit. Do not revert ours;
   we won't revert yours.
3. **`neverranked-outreach/` is also a shared tree.** You touched
   `lib/db.js`, `config.json`, `lib/decision-push.js`. We touched
   `scripts/apollo-fetch.js`, `public/app.js`. No overlap on the same
   files, but coordinate before committing that repo.
4. **The outreach→D1 migration was NOT started.** Held precisely to
   avoid colliding with your D1-heavy work. See "Held work" below.
5. **No git commits or pushes from this window.** All our work is
   uncommitted working-tree changes + deploys + direct D1 writes.

## What this window DEPLOYED tonight (dashboard Worker, live in prod)

Multiple `wrangler deploy` runs on `app.neverranked.com`. Each one
carried your uncommitted src changes too (shared tree). Net live state =
both windows' combined uncommitted source.

1. **Pre-fetch filter for email-open tracking.** New file
   `dashboard/src/outreach/prefetch.ts`. Modified
   `dashboard/src/outreach/warmth.ts` (real-vs-prefetch open
   aggregation) and `dashboard/src/routes/warm-prospects.ts` (timeline
   dims proxy/bot opens). Filters bare-`Mozilla/5.0` scanners, Gmail
   proxy, Apple MPP signatures, AV scanners, bots. Verified against live
   D1: collapsed 11 raw "multi-openers" to 1 real (prospect 488). Caught
   prospect 108 (David Edwards) as 16 raw opens → 0 real.
2. **New public route `/reddit-faq/<slug>/public`.** New file
   `dashboard/src/routes/reddit-faq-public.ts`, wired in `index.ts`
   ABOVE the auth gate. Read-only render of deployed FAQs for prospect
   demos. noindex.
3. **Preview public-route auth fix.** `/preview/<slug>` was sitting
   AFTER the auth wall in `index.ts` (~old line 2009) and silently
   302-ing every prospect to /login. Moved it above the auth gate next
   to the reddit-faq-public route. Same bug class you fixed for
   `sync-prospects` + `external-decision` — different routes, no
   collision, complementary.
4. **Warm-prospect Preview tier-gate widened.** `warm-prospects.ts`:
   Build Preview card now shows for `very_warm` as well as `hot`
   (depth still scales by tier in `buildAutonomousPreview`).
5. **Preview generator prompt fix.** `dashboard/src/preview/generator.ts`
   — the Hawaii Theatre proof point was producing garbled output
   ("Hawaii Theatre Company went from zero AI citations to forty-five
   out of one hundred"). Rewrote the prompt section to pin exact facts
   (Hawaii Theatre Center, AEO score 45→95 in ten days, 14 of 19
   Perplexity). Root-cause fix for all future Previews.

## D1 mutations this window made (remote, neverranked-app)

All via `wrangler d1 execute --remote`. No migrations created.

- `schema_injections` id=358 (Hawaii Theatre FAQPage): was stuck
  `superseded` since 5/13 (snippet served 0 FAQ). Flipped to `approved`,
  briefly reverted on Lance's instruction, then re-applied with a
  5-FAQ filter (dropped 2 overclaiming Qs). Net state: `approved`,
  5 questions live.
- `reddit_faq_deployments` id=7: status synced to `deployed`,
  `faq_count` 7→5 to match.
- `outreach_prospects`: inserted prospect 488 (Carl Baylin, Weil Akman
  Baylin & Coleman). This is the ONLY row besides whatever you had.
  Note: this table is the future migration target — only 1-2 rows now
  vs 490 in local SQLite.
- `previews`: prospect 488 `body_html` corrected via REPLACE() to fix
  the Hawaii Theatre garble. prospect-108-fc2se identified as junk
  (null metadata, 0 real opens) but **NOT deleted** — flagged for
  Lance, no destructive action taken.
- Local `neverranked-outreach/outreach.db` (NOT D1): unstuck prospect
  420 (Dina/Cosmetica) from a 12h+ orphaned `generating` state.

## The "outreach volume degraded" finding — ROOT CAUSE + FIX

Your handoff flagged this; here is what it actually was and what we did:

1. **`scripts/apollo-fetch.js` hardcoded `page: 1`.** Every Apollo
   fetch re-pulled the same 100 prospects, all deduped out, 0 new
   inventory ever. Fixed: added `apollo_next_page` config rotation +
   `--page=N` CLI override, auto-increment after each successful fetch.
   Pulled 16 fresh prospects from page 2 to prove it.
2. **`/api/daily-run` hardcoded `vertical = 'real_estate'`** while the
   active vertical was `agency`/`smb`. Pipeline ran the wrong pool.
3. **2 AM HST cron never fired** because the laptop was closed (launchd
   can't run while the host sleeps). This is the core liveness problem
   the Workers migration is meant to solve.
4. **`/api/send` defaults to `real_estate`** if no vertical passed —
   approved SMB prospects sat unsent until called with `?vertical=smb`.
5. Added `showToast()` to `public/app.js` and wired
   `triggerDailyRun/doSend/approveAll/resumeSend` so silent
   `.catch(()=>{})` failures surface. (uncommitted, neverranked-outreach)

Net: ~24 sends fired during the session after these fixes. The
structural fix (laptop dependency) is the Workers migration, held.

## NEXT WORKSTREAM FOR THE INFRA WINDOW — assigned by Lance 2026-05-14

**Build the auto-verify grader (automation roadmap item #2).** This is
the highest-leverage unblocked item and it is in your lane.

Scope: wire the factual / voice / overall grader into the Preview
generator (`dashboard/src/preview/generator.ts`) AND the cold-outreach
generator so nothing reaches a prospect or a human review queue
ungraded. Fail-closed — anything the grader cannot clear is HELD, not
shipped. The grader already runs on FAQ + digest surfaces; extend it to
these two.

Why this and not the others:
- #1 (laptop → Workers migration) is BLOCKED on Lance's SMTP-fork
  decision + needs a coordinated shared-D1 window. Cannot start yet.
- #3 (auto-promote warm → Preview) and #4 (self-learning / Benjamin
  loop) both depend on #2. Do not automate promotion or learning on
  unverified content.
- Evidence #2 is needed, from the 2026-05-14 session: a Preview shipped
  a fabricated client name ("Hawaii Theatre Company") and a wrong
  case-study stat ("zero citations to forty-five out of one hundred").
  The Greg outreach email shipped em dashes + AI-tells. BOTH were caught
  by a human, not the system. Quality currently depends on someone
  watching. That is not "verified" and does not scale.

Scope note: `dashboard/src/preview/generator.ts` was edited by the ASB
window today (the Hawaii Theatre prompt pin-fix). It is uncommitted.
Build on that fix, do not revert it.

Roadmap ownership recap: #1 held (SMTP decision pending). #2 assigned to
infra window (this entry). #3, #4 unassigned, gated behind #2.

## Held work — outreach → D1 migration (NOT started)

Phases 1+2 of `neverranked-outreach/MIGRATION_TO_WORKERS.md` were
planned and approved by Lance but **deliberately not executed** after
reading your handoff. Reason: 3 new D1 tables + 1,780-row bulk insert +
a dashboard Worker re-deploy + `neverranked-outreach/lib/db.js` changes
is a major shared-resource mutation that collides with your active
D1-heavy work. Needs a coordinated execution window when both windows
can pause.

**SMTP fork DECIDED 2026-05-15: Option A** (minimal always-on Node send
service on a tiny Fly.io/Hetzner host, ~$5/mo; Workers do everything
else). Resend-for-cold rejected. Full locked spec — the host shape, the
`POST /send` HMAC contract, idempotency, the Worker side, and the hard
ordering — is in `neverranked-outreach/MIGRATION_TO_WORKERS.md` under
"DECISION LOCKED — Option A". The migration is now spec-complete and
turn-key for the coordinated execution window; nothing about it needs
re-deciding.

**Hard ordering for whoever runs the migration:** grader (#2) must be
live and fail-closed BEFORE any auto-send path exists. Auto-sending on
the current unverified pipeline = auto-emailing fabrications (proven
2026-05-14: Preview generated a fake client name + wrong stat, caught
only by manual review). #2 gates #1's send path, not just #3.

Lance-only prerequisites before the migration can run (not automatable,
safety boundary): create the host account + payment, confirm Gmail app
password, DKIM/SPF on hi.neverranked.com, Cloudflare account 2FA on.

## Background task spawned

A `spawn_task` is queued (chip showing for Lance): fix the cold-outreach
generator (`neverranked-outreach/lib/generator.js`) which ships "Hawaii
Theatre 45→95 in 30 days" to live prospects. Canonical figure is **ten
days** (verified against the public case study). **If your window touches
`lib/generator.js`, coordinate** — this task will edit the SMB body
prompt blocks.

### GUARDRAIL — the generator-fix task must NOT touch the grader

This task was spawned BEFORE the infra window shipped the fail-closed
output grader. Its prompt instructs it to grep the outreach repo for
"30 days" + Hawaii Theatre and correct occurrences. **There is now a
landmine:**

- `neverranked-outreach/lib/output-grader.js` (and the dashboard twin
  `dashboard/src/preview/output-grader.ts`) contain a `CANONICAL_FACTS`
  block with the line: `Elapsed time: TEN DAYS. Not 30, not "a month",
  not "weeks".`
- That `"Not 30"` is **intentionally correct** — it is the grader's
  negative example, the rule that makes it REJECT "30 days" content.
- A naive find-replace of `30 -> 10` there turns the guard into
  `"Not 10"` (nonsense) and **disarms the exact protection just built.**

Hard scope for the generator-fix task:
- ALLOWED: `neverranked-outreach/lib/generator.js` (the SMB email body
  prompt blocks) and the `MEMORY.md` Hawaii Theatre reference.
- OFF-LIMITS: `output-grader.js`, `output-grader.ts`, any
  `CANONICAL_FACTS` block, anything the infra window owns. Those files
  are already correct (they say TEN DAYS) and reference "30" only as a
  negative example. Do not edit them.
- CANONICAL_FACTS in the two grader files is verified content-identical
  and already states the correct figures. No sync action needed; just
  do not perturb it.

Whoever runs the generator-fix task: read this section first.

## Ownership map going forward (proposed — confirm with Lance)

**ASB window owns exclusively (you said these are safe for us):**
- `may-18-meeting/`, `pitch/`, `audits/`, `clients/hawaii-theatre/`,
  `content/meeting-evidence/`, ASB/MVNP docs

**Infra window owns exclusively:**
- `dashboard/src/routes/admin-nvi.ts`, `content-review.ts`,
  `external-decision.ts`, `dashboard/src/lib/decision-log.ts`
- `scripts/voice-janitor.*`, `mcp-server/*`
- `neverranked-outreach/lib/decision-push.js`, `lib/db.js`

**SHARED — coordinate before edit/deploy/commit:**
- `dashboard/src/index.ts`
- `dashboard/src/routes/warm-prospects.ts`
- The dashboard Worker deploy (last deploy wins; rebase source first)
- D1 schema + data (`neverranked-app`)
- `neverranked-outreach/` repo (both windows have uncommitted edits)
- `config.json` in neverranked-outreach (you set
  `neverranked_admin_secret`; we set `apollo_next_page=3`)

## Git state

- No commits or pushes from this window. Local HEAD `be602dc`
  (your voice-janitor commit). Origin is ahead (`59b19f4` voice-janitor
  auto-fix per your handoff). We did NOT pull (active unstaged work).
- Eventual commit must include BOTH windows' `src/` changes. Neither
  window should `git add .` — add by name, coordinate the rebase.
- ADMIN_SECRET rotation: no impact on this window (we used direct
  `wrangler d1 execute`, never the admin HTTP endpoint).

Prepared by: ASB + MVNP meeting-prep window
2026-05-14 night
