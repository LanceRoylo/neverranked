# Cross-window handoff — 2026-05-14 night session

This is from the **non-ASB window** (decision-capture / infra / liveness work).
The other window is doing **ASB + MVNP meeting prep** (May 18). This file
exists so the two windows don't collide on git, deploys, or shared files.

## ⚠ URGENT ACTION FOR ASB WINDOW — Greg/HTC FAQ edits (2026-05-15)

Greg Dunn (CEO, Hawaii Theatre Center) emailed Ron + Lance edits to
the FAQ. This is YOUR lane (you own clients/hawaii-theatre, you hold
schema_injections id=358 + reddit_faq_deployments id=7 mid-work, you
made the 13→5 filtering call). The infra window deliberately did NOT
touch the live schema. Execute from your window.

SITUATION (clarified by Lance 2026-05-15): a full FAQ set was
drafted. The grader flagged some as overstatement so only the
passing ones went live (the 5 in schema 358). Lance then EMAILED
GREG the full picture (numbered list). Greg replied editing /
deleting / adding / green-lighting per item. Greg's reply is now
the FINAL AUTHORITY — he hand-curated the FAQ himself. The
overstatement filter is MOOT: the client reviewed and chose. Do not
re-apply it. Do not treat this as a "restore N" judgment call.

HARD DEPENDENCY: Greg's numbering (2,4,6,7,9,11,12,13 + "rest green
lit") maps to THE EMAIL LANCE SENT GREG, not the live 5. To apply
this you NEED that outbound email (the numbered FAQ list Lance sent).
Greg's reply alone is insufficient — items 1,3,5,8,10,etc. ("the
rest, green lit") are only defined by the sent list. Get the sent
email from Lance first. Final live FAQ = (sent list, with Greg's
deletes removed + his adds/replacements applied + green-lit items
kept verbatim).

Edits (Greg's numbering; "add" = append to existing answer, "use" =
replace answer verbatim with his text):

- #2 ticketing — ADD: "Be sure to only buy your tickets from
  hawaiitheatre.com as tickets sold on the resale market may not be
  valid, or the face value and ticketing fees you are charged could
  be higher than the actual price offered from the venue."
- #4 children/tickets — ADD: "The theatre does require every patron
  to have a ticket for a seat at the show, including toddlers. Only
  certain shows are suitable for children under 3 years old."
- #6 parking — ADD: "There are also private parking lots that offer
  paid public parking at Marks Garage and Pickles at Forté."
  (Correct proper noun confirmed by Lance 2026-05-15: the venue is
  "Pickles at Forté". Greg's email said "Pickles on Forte" — use the
  corrected name above. No need to ping Greg.)
- #7 accessibility — ADD: "Patrons are also offered reasonable
  accommodation at the door should they require accessible seating.
  The Theatre also offers certain shows with ASL interpretation upon
  request."
- #9 — REMOVE all mention of competing venues. (May already be
  affected by your 2-Q drop — cross-check.)
- #11 classical music — REPLACE verbatim with Greg's block (Stardew
  Valley / Elf / Studio Ghibli; HSO partnership ended June 2026).
  Full text in Greg's email to Ron+Lance 2026-05-15 ~10:56am.
- #12 venue rental — REPLACE verbatim (Kissed by God premiere,
  Magnum PI/NCIS filming, BBB Torch Awards, Azamara; link
  hawaiitheatre.com/venue-rental). Full text in email.
- #13 film — REPLACE verbatim (Anime/Waimea/Mountain festivals,
  Rainbow Film Festival in memory of Adam Baron, Barco 4K laser,
  15'x22' LED wall; link hawaiitheatre.com/upcoming-events). Full
  text in email.
- All other items: green-lit as-is by Greg.

⏱ CLIENT CLOCK IS LIVE: Lance sent Greg an acknowledgment email
2026-05-15 confirming all edits are "going in now" and promising
"I will email you the moment the updated version is live." The CEO
is now actively expecting a live-confirmation. Treat this as the
top-priority client task. When you ship it, tell Lance so he can
send Greg the live follow-up.

"Pickles at Forté" proper noun is confirmed by Lance. The ONE thing
you must get from Lance before executing: the original outbound
email he sent Greg (the numbered FAQ list Greg is replying to).
Greg's reply verbatim text for #11/#12/#13 is in his email to
Ron+Lance 2026-05-15 ~10:56am — pull from there, do not paraphrase
a CEO's approved copy. Apply Greg's deletes too (#9: remove all
competing-venue mentions).

Grader note: these are HTC's OWN facts (their FAQ content), NOT
NeverRanked client claims. CANONICAL_FACTS in the output-grader is
unaffected — do not touch it.

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

## Migration prerequisites — ALL 4 GREEN (2026-05-15)

The 4 Lance-only prerequisites for the outreach→Workers migration
(Option A) are now all satisfied. Migration is execution-ready; only
the coordinated cross-window window remains.

1. Send-host account + payment — Fly.io account created, card on
   file, free trial active. NOT deployed yet (correct — that's the
   migration execution step, held for the coordinated window). Do NOT
   click "Select repository" on Fly until the migration runs.
2. Gmail app password — verified valid (16-char, authed against
   smtp.gmail.com, no email sent). The send host reuses this exact
   credential from neverranked-outreach/config.json smtp_password.
3. DKIM/SPF on hi.neverranked.com — already fully configured (Google
   Workspace: SPF include:_spf.google.com, valid google._domainkey
   DKIM, DMARC p=none, MX smtp.google.com). No new DNS needed because
   Option A sends via Gmail SMTP. Later optimization (not a blocker):
   DMARC is p=none; tightening to p=quarantine improves deliverability.
4. Cloudflare account 2FA — enabled via TOTP (Mobile App Auth).
   Required setting a Cloudflare password first (account was GitHub-
   SSO, no standalone password) via the forgot-password email flow.
   Recovery codes saved by Lance.

Safety gate status: the fail-closed output grader (roadmap #2) is
LIVE (dashboard deployed). Per the ASB window's hard-ordering rule,
#2 had to be live before any auto-send path — it is. The migration's
send path is now safe to build in the coordinated window.

## REPLY — HTC Greg/Ron tasks (2026-05-17, infra window)

Task 2 (add Greg+Ron as admins on hawaii-theatre): **already done, no
change made, and DO NOT elevate roles.** Both exist in D1 as
role=`client`, client_slug=`hawaii-theatre`, onboarded, logged in
(Greg id 40, Ron id 39). This schema has only client / agency_admin /
admin. There is NO client-admin tier — `admin` is GLOBAL NeverRanked
superadmin (all clients + all of /admin/* + D1 tooling). Setting
either to role=admin would be a security incident. A `client` user
with the matching client_slug already has full client access + the
/team invite flow. Task 2 is satisfied with zero mutations. Did not
touch the users table.

Task 1 (Greg's 403): **DONE 2026-05-17.** Added
gregorydunn@hawaiitheatre.com + ronmcdaniel@hawaiitheatre.com as
GCP OAuth test users (project=neverranked, Audience tab). Verified:
4/100 test users, both listed. 403 clears immediately for both.
WORDING FIX (still stands): handoff said "Google Analytics" — the
dashboard requests ONLY `webmasters.readonly` (Search Console). No
GA integration exists. Greg hit the 403 on Search Console. GSC prep
work (privacy §08, justification) remains correct.

STRATEGIC NOTE: the "Connect Google Search Console" CTA renders on
EVERY client dashboard with no connected GSC property
(status.ts). Every future client hits this same 403 until the app
is verified/published. Test-user add is per-client + 100 cap. The
GSC verification submission (prep sheet, ready) is the real fix and
should not sit much longer now that real clients are hitting it.

## Privacy page — GSC section added + DEPLOYED (2026-05-16)

`privacy/index.html` edited: new section 08 "Google Search Console
Data" (required prerequisite for tomorrow's Google OAuth brand
verification submission), prior section 08 renumbered to 09, "last
updated" bumped to May 2026. Built + deployed to neverranked.com
(live, verified at /privacy/). NOT committed. `privacy/` is in
neither window's lane; ASB window has not touched it. No collision.

## New uncommitted work — SEO-vs-AEO carousel (2026-05-15)

Infra window built a 9-slide IG/LinkedIn carousel at
`social/posts/2026-05-15-seo-vs-aeo-disappearing-list/` (9 source-N.html,
render.mjs, 9 card-N.png, caption.md, alt-text.md, platforms.md).
`social/` is not in either window's lane and you have not touched it —
flagging only, no collision expected. Not committed.

## NOT safe without a heads-up to this window

- `git push` (rebase coordination needed)
- Editing any dashboard `src/` file listed above
- Re-deploying the schema-check or dashboard Worker (coordinate so we
  don't deploy over each other mid-edit)
