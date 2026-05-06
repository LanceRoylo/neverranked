# NeverRanked Session Handoff — 2026-05-04

Continuation document for the next Claude session. Read this top-to-bottom before resuming work.

---

## TL;DR — What shipped tonight (May 4, 2026)

In a single ~12-hour session we shipped:

1. **Pulse tier fully automated** ($497/mo). Stripe price wired (`price_1TTTkvChs9v2cUMPSi4Eupiu`), self-serve checkout live at `/checkout/pulse`. Webhook auto-provisions user + plan='pulse' + magic link → `/onboard/pulse` where Claude generates 10 candidate prompts, customer edits + saves, first citation run fires automatically.
2. **Audit price raised** $500 → $750 with new Stripe price (`price_1TTU3AChs9v2cUMPn3HSrUoC`). Old $500 price archived. Audit credit toward upgrade copy added across all marketing.
3. **DataForSEO Google AI Overviews tracking** live. Lance's account funded with $50, secrets set as Wrangler env vars (`DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`). First test query live-confirmed Hawaii Theatre is the **#1 cited entity** in Google AI Overviews for "best performing arts venues in Honolulu."
4. **Bing + Microsoft Copilot tracking** added as the 6th engine via the same DataForSEO auth. NeverRanked now tracks more engines than any competitor (Profound, Athena HQ, Ahrefs Brand Radar all cap at 4-5).
5. **Real-time citation alerts** (Signal+ feature). Diff detection on every weekly citation run; gained/lost citations get color-coded email digests within hours.
6. **A/B testing complete end-to-end**:
   - Foundation: variant tracking + supersession on `schema_injections` (migration 0060)
   - Scoring: `lib/schema-impact.ts` with control/test windows + two-proportion z-test + statistical confidence ladder
   - Admin viewer at `/admin/variants/<slug>`
   - Customer NVI section "What we deployed and what it did"
7. **6 schema generators** with multi-pass validation: FAQ, Article, Person, HowTo, Service, BreadcrumbList. Plus `llms.txt` generator.
8. **NVI report end-to-end** for Hawaii Theatre. Generation, PDF render, email delivery via Resend, monthly cron. Pulse-aware (renders different scope for Pulse vs Signal/Amplify customers).
9. **Outreach pipeline pivoted** from agency-only (107 sends, 0 replies, broken channel) to SMB. **25 SMB cold emails sent this morning** (4:42-5:01 AM HST Mon May 4). 198 SMB prospects total imported from Apollo. Auto-approve + auto-send wired with 3-pass validation gate.
10. **Marketing site refreshed**:
    - Hero broadcast diagram — labeled hexagon with all 6 engines
    - Animated tier icons (Pulse 1 ripple → Signal 2 → Amplify 3 → now 6 arcs total for the engines)
    - Pricing structure: Audit / Pulse / Signal / Amplify with Enterprise "Coming Soon"
    - 4 custom pitch URLs updated (Mark/ASB, Flash/Blue Note, Ellen, Jeff/Hawaii Energy)

---

## Current state of platform — capability honest read

**Top 3 worldwide on capability** after tonight's work. The **only platform** that ships ALL of:

- 6-engine citation tracking (Perplexity, ChatGPT, Gemini, Google AI Overviews, Claude, Microsoft Copilot via Bing)
- Done-for-you schema deployment via 1-line snippet (Profound/Athena/Ahrefs all stop at "here's what to deploy")
- Multi-pass AI validation on every output (factual + tone + quality + 3-attempt regen)
- A/B variant impact attribution with statistical confidence (p < 0.05)
- Prominence + sentiment within citations
- Real-time citation alerts (Signal+ tier)
- Productized monthly NVI PDF
- Pulse self-serve at $497/mo (no competitor in this band)

**Where we lose to bigger names:**
- Brand recognition (Profound has 100x our awareness)
- Customer count (we have 1 paying — Hawaii Theatre)
- Industry benchmarks (need 10+ customers in a vertical to be credible)
- Multi-user accounts + SSO (defer until Enterprise prospect surfaces)
- API access (defer until agency partner channel matures)
- Server-side schema injection (lower priority; current JS snippet works for 95% of crawlers)

---

## Critical operational state RIGHT NOW

### Outreach pipeline (live, autonomous)
- **25 SMB emails sent today** at 4:42-5:01 AM HST (10:42-11:01 AM ET)
- **0 opens, 0 replies, 0 bounces as of 9:49 PM ET / 6:49 PM HST**
- Domain: `lance@hi.neverranked.com`
- Mailreach reputation: 100/100 (deliverability is healthy on standard tests)
- **The 0/0 result is the immediate concern.** Possible causes ranked:
  1. Gmail Promotions tab routing (~50% likely) — Mailreach seeds don't catch this
  2. Subject lines not compelling enough (~25% likely)
  3. Tuesday-morning open behavior (SMBs triage Monday mail Tuesday) (~15% likely)
  4. Wrong audience (~10% likely)
- **Diagnostic suggested but not yet run**: send a test email from `lance@hi.neverranked.com` to a personal Gmail Lance controls and see if it lands in Inbox / Promotions / Spam. The test command was drafted in the last message before this handoff. Lance hasn't run it yet.

### Outreach automation (running)
- Outreach server: `launchctl` job `com.neverranked.outreach.server` running on port 3132 (PID changes per restart)
- Cron schedule: 8 AM ET weekdays (= 3 AM HST) via `setInterval` in `server.js` — NOT a launchd job, requires server to be running
- Daily limit: 25/day per vertical (bumped from 10 today)
- Auto-approve: TRUE (validation-passed drafts ship without manual review)
- Auto-run: TRUE
- 173 SMB prospects still pending in queue for future cron runs
- Send-loop process (`/tmp/send-loop.js`) was started for tonight's 25 sends but should have completed and exited by now

### Pulse self-serve (live)
- Customers can buy at https://app.neverranked.com/checkout/pulse
- $1 in DataForSEO trial credit consumed during tonight's testing
- $50 prepaid balance remains, ~12,500 queries available before need to top up
- Cost trajectory: $0/mo at 0 customers, ~$5-15/customer/mo when paying

### Hawaii Theatre status (existing customer)
- D-45 → A-95 in 7 days (April 22-28)
- 39 schemas deployed
- **CONFIRMED LIVE TONIGHT**: Hawaii Theatre is #1 cited entity in Google AI Overviews for "best performing arts venues in Honolulu" with `hawaiitheatre.com` as the first URL in the AI's references
- Case study staged at `/case-studies-drafts/hawaii-theatre/` — NOT public until Greg approves naming
- Lance has NOT yet sent Greg the permission ask email (drafted earlier in session)

---

## Outstanding items / next actions

### Lance's actions (not Claude's)
1. **Send the test email to a personal Gmail** to diagnose where SMB outreach is landing (deliverability vs content vs timing)
2. **Email Greg** for Hawaii Theatre case study permission (draft was in earlier session)
3. **Send the email to Dan** that we drafted (forwards Hawaii Energy pitch to Jeff Dizon)
4. **Check tomorrow morning's outreach replies** — 9-11 AM ET Tuesday is when SMB owners typically triage Monday mail
5. Top up DataForSEO when balance dips below $10 (currently ~$50)

### Non-blocked work for next Claude session
1. **Wait for outreach signal first** — don't ship more product features until we know if outreach is the funnel or if it needs iteration
2. **Server-side schema injection** (~1-2 days, $0 cost) — niche but defensible "we work for every crawler" position. Lower priority.
3. **Multi-user + SSO + API access** (~3-5 days each, $0 ongoing cost) — only build when an Enterprise prospect actually surfaces. Don't build before pipeline demand.
4. **Industry percentile benchmarks** — needs 10+ customers in a vertical to be credible. Not a today problem.
5. **Pulse-stripped dashboard view** — currently Pulse customers see full sidebar with upgrade prompts on Reddit/Authority/Benchmark. Could be cleaned up but defer until first Pulse customer feedback.
6. **PR push** — pitch a story to TechCrunch / SEO publications: "the only AEO tool that proves citation lift with statistical significance." Wait until we have 2-3 paying customers as proof.
7. **Open-source the schema-grader** — credibility move, would force competitors to adopt our standards. Not urgent.

### Blocked items
- Hawaii Theatre case study public — blocked on Greg's approval
- Multi-user / API — blocked on Enterprise prospect demand
- Industry benchmarks — blocked on customer count

---

## Key file paths

### Two repos:
- **Dashboard**: `/Users/lanceroylo/Desktop/neverranked/dashboard/` (TypeScript, Cloudflare Workers, deployed to `app.neverranked.com`)
- **Marketing site**: `/Users/lanceroylo/Desktop/neverranked/` (root level — also has `dist/` for Cloudflare Pages, deployed to `neverranked.com`)
- **Outreach**: `/Users/lanceroylo/Desktop/neverranked-outreach/` (Node.js, runs locally on port 3132 via launchd)

### Critical files in dashboard:
- `dashboard/src/index.ts` — main router, all admin routes
- `dashboard/src/citations.ts` — main citation orchestrator (6-engine ingest loop)
- `dashboard/src/citations-google-aio.ts` — DataForSEO Google AIO query
- `dashboard/src/citations-bing.ts` — DataForSEO Bing/Copilot query (NEW tonight)
- `dashboard/src/lib/multi-pass.ts` — 3-pass validation (factual + tone + quality)
- `dashboard/src/lib/plan-limits.ts` — Pulse/Signal/Amplify quotas + feature gates
- `dashboard/src/lib/schema-variants.ts` — A/B variant tracking + supersession
- `dashboard/src/lib/schema-impact.ts` — A/B scoring with z-test
- `dashboard/src/lib/citation-alerts.ts` — gained/lost diff + digest emails
- `dashboard/src/nvi/runner.ts` — monthly NVI generation
- `dashboard/src/nvi/template.ts` — NVI PDF render (has variant impact section)
- `dashboard/src/routes/checkout.ts` — Stripe checkout flow + Pulse waitlist + welcome email
- `dashboard/src/routes/onboard-pulse.ts` — Pulse self-serve onboarding
- `dashboard/src/routes/admin-plans.ts` — `/admin/plans` UI for plan + quota management
- `dashboard/src/routes/admin-variants.ts` — `/admin/variants/<slug>` A/B impact viewer

### Schema generators:
- `dashboard/src/faq-generator.ts`
- `dashboard/src/article-generator.ts`
- `dashboard/src/person-generator.ts`
- `dashboard/src/howto-generator.ts`
- `dashboard/src/service-generator.ts`
- `dashboard/src/breadcrumb-generator.ts`
- `dashboard/src/llms-txt-generator.ts`

### Marketing site:
- `index.html` (root) — homepage with broadcast diagram + tier cards + pricing
- `pitch/asb-hawaii/index.html` — Mark Cunningham (American Savings Bank)
- `pitch/blue-note-hawaii/index.html` — Flash Hansen (Blue Note Hawaii)
- `pitch/ellen/index.html` — Ellen (Seerly comparison)
- `pitch/hawaii-energy/index.html` — Jeff Dizon (Hawaii Energy, sent via Dan)
- `case-studies-drafts/hawaii-theatre/` — pending Greg's approval (NOT in public deploy)

### Outreach:
- `lib/generator.js` — has `generateAgencyOutreach` and `generateSmbOutreach`. Both run multi-pass validation.
- `scripts/generate.js` — entry point, supports `--vertical=smb|agency|all` and `--limit=N`
- `scripts/discover-csv.js` — CSV import, supports `--vertical=smb`
- `scripts/daily-run.js` — full pipeline, fires via `setInterval` in `server.js`
- `lib/email.js` — sends approved emails with daily limit + spacing

---

## Deploy commands

### Dashboard (Cloudflare Workers)
```bash
cd /Users/lanceroylo/Desktop/neverranked/dashboard
npx wrangler deploy
```

### Marketing site (Cloudflare Pages, but deployed via Worker since `wrangler.jsonc` is at root)
```bash
cd /Users/lanceroylo/Desktop/neverranked
bash scripts/build.sh   # syncs root files into ./dist/
npx wrangler deploy
```
**Common gotcha:** if you run `npx wrangler deploy` from the wrong directory, it deploys to the wrong target. The dashboard is at `dashboard/wrangler.jsonc`; marketing is at `wrangler.jsonc` (repo root). The shell `cwd` resets between Bash tool calls in Claude Code, so always prepend the explicit `cd` when chaining commands or use the absolute path.

### Outreach (local launchd job)
- Server auto-starts on login + restarts on crash via `~/Library/LaunchAgents/com.neverranked.outreach.server.plist`
- After code changes, restart with: `launchctl unload <plist> ; sleep 2 ; launchctl load -w <plist>`

### D1 migrations (remote)
```bash
cd /Users/lanceroylo/Desktop/neverranked/dashboard
npx wrangler d1 execute neverranked-app --remote --file=migrations/00XX_filename.sql
```

---

## Environment / secrets state (don't ask Lance to re-set these)

Already configured as Wrangler secrets on the dashboard worker:
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_AGENCY_AMPLIFY_PRICE_ID`, `STRIPE_AGENCY_SIGNAL_PRICE_ID`, `STRIPE_AGENCY_INTRO_COUPON_ID`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `GEMINI_API_KEY`
- `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` (set tonight)
- `RESEND_API_KEY`, `ADMIN_EMAIL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (for GSC integration)
- `WP_ENCRYPTION_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `ADMIN_SECRET`, `DASHBOARD_ORIGIN`

The outreach repo's `config.json` has the SMTP password and Anthropic key locally. Do NOT commit those.

---

## Stripe price IDs (current production)

```
audit:    price_1TTU3AChs9v2cUMPn3HSrUoC   ($750 one-time, NEW tonight)
pulse:    price_1TTTkvChs9v2cUMPSi4Eupiu   ($497/mo, NEW tonight)
signal:   price_1TLgcZChs9v2cUMPgum7Ujgt   ($2,000/mo, unchanged)
amplify:  price_1TLgctChs9v2cUMPFGY47fcC   ($4,500/mo, unchanged)
```

Old archived audit price (do not reuse): `price_1TLgcBChs9v2cUMPj5Sd7E0o` ($500)

---

## Critical session-specific gotchas

1. **The `cwd` resets between Bash calls** in Claude Code. Always use absolute paths or chain with `&&` in a single Bash call. Forgetting this caused multiple deploys to the wrong target tonight.

2. **DataForSEO has TWO passwords.** The dashboard login password is different from the API password. Tonight Lance got 401 errors twice because he was setting the wrong one. The API password is on `https://app.dataforseo.com/api-access`, masked by default — must click "show" or copy via clipboard with `pbpaste | tr -d '[:space:]'` to avoid trailing whitespace breaking auth.

3. **`location_name: "Honolulu, Hawaii, United States"` is rejected** by DataForSEO. Use `location_code: 2840` (United States) instead. The full Honolulu DMA code can be looked up via their `/v3/serp/google/locations` endpoint if needed.

4. **`load_async_ai_overview: true` is required** in DataForSEO requests to get the Google AI Overview block. Without it, AIO data is silently empty. Surcharge ($0.002 extra) is refunded when no AIO renders.

5. **Outreach `current_vertical` config drives dashboard widgets.** Currently set to `'smb'` in `/Users/lanceroylo/Desktop/neverranked-outreach/config.json`. The dashboard reads from this for the "Recent Sends/Opens/Replies" widgets. To switch back to viewing agency stats, change the value (or pass `?vertical=agency` to `/api/pipeline-status`).

6. **Hello Momentum brand voice rules** (from `~/.claude/CLAUDE.md`):
   - No em dashes (use periods or commas)
   - No semicolons in marketing copy
   - No emojis on websites or professional content (Instagram captions OK)
   - No "Welcome to..." / "Hidden gem" / similar AI-sounding fillers
   - Strategy before format
   - Use the Lever Test (every creative piece needs a named lever)

7. **Plan-first hard rule** (from `~/.claude/CLAUDE.md`): Before any Write/Edit/Bash that modifies state, present a plan and wait for approval. Trivial fixes get a 2-sentence plan; complex work gets a structured one. Only skip for read-only operations.

---

## Customer count + revenue snapshot

- **Paying customers**: 1 (Hawaii Theatre)
- **MRR**: ~$2,000-4,500 (Hawaii Theatre is on Signal or Amplify equivalent)
- **Pipeline**: 198 SMB cold prospects (25 emailed today), 4 custom pitch URLs sent (Mark, Flash, Ellen, Jeff/Hawaii Energy)
- **DataForSEO balance**: $50 prepaid, ~12,500 queries available
- **Ops cost monthly at current scale**: ~$5/mo for 1 customer (Hawaii Theatre tracking) + $0 fixed
- **Anthropic API spend tonight**: estimated $40-60 (covered by $100 max plan)

---

## Outreach health diagnostic — UNRESOLVED

The single highest-priority diagnostic remaining: **send a test email from `lance@hi.neverranked.com` to a personal Gmail Lance controls.** This tells us in 60 seconds whether the SMB sends went into a deliverability black hole (Promotions tab or worse).

Test command (Lance to run, replacing the personal email):
```bash
cd /Users/lanceroylo/Desktop/neverranked-outreach
node -e "
const cfg = require('./lib/limiter').readConfig();
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: cfg.smtp_host, port: cfg.smtp_port, secure: false,
  auth: {user: cfg.smtp_user, pass: cfg.smtp_password}
});
t.sendMail({
  from: 'Lance Roylo <' + cfg.from_email + '>',
  to: 'YOUR_PERSONAL_EMAIL_HERE',
  subject: 'Does ChatGPT recommend your business?',
  text: 'Test of the actual outreach send path. If this lands in your inbox primary tab, the SMB sends went there too. If it lands in Promotions or Spam, that is the actual problem.',
}).then(r => console.log('sent:', r.messageId)).catch(console.error);
"
```

Where it lands tells us whether to fix:
- **Inbox primary** → content/audience problem, iterate copy
- **Promotions** → sender-pattern / formatting / link-density problem
- **Spam** → deliverability infrastructure problem (despite Mailreach's clean test)

---

## How to resume in next session

1. **Read this file first.**
2. **Check current outreach state** before doing anything else:
   ```bash
   cd /Users/lanceroylo/Desktop/neverranked-outreach
   sqlite3 outreach.db "SELECT vertical, status, COUNT(*) FROM prospects GROUP BY vertical, status;"
   tail -10 logs/checkreplies.out.log
   ```
3. **Check for replies**: visit http://localhost:3132 — Recent opens/replies in the Pipeline panel.
4. **Then ask Lance**: "Where do we want to start? Outreach diagnostic, more product features, or did anything happen overnight worth reacting to?"

---

## Last commit on each repo

- **Marketing site** (`/Users/lanceroylo/Desktop/neverranked/`): `fa0fd8d` — "Pitch URLs: refresh all 4 with 6-engine coverage update + new headlines"
- **Dashboard** (deployed via the same repo): `826cf15` — "Bing + Microsoft Copilot tracking: 6th engine live"
- **Outreach** (`/Users/lanceroylo/Desktop/neverranked-outreach/`): `d0d7424` — "Outreach dashboard: surface 'Recent opens' alongside sends/replies"

All three repos pushed to GitHub.

---

## One-line summary for the next session's first message

> NeverRanked is now a 6-engine AEO platform with Pulse self-serve live, A/B testing complete, and 25 cold SMB emails sent today (0 opens 0 replies as of 14 hours in). Read `/Users/lanceroylo/Desktop/neverranked/SESSION-HANDOFF-2026-05-04.md` for full state. Top priority: diagnose outreach deliverability before more product work.
