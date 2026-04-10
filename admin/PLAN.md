# Never Ranked Admin Dashboard — Phase 1 Plan

**Status:** Draft, awaiting Lance's sign-off
**Author:** Claude (Never Ranked agent)
**Date:** 2026-04-09
**Target:** `admin.neverranked.com`

---

## Why this exists

You're launching Never Ranked as a one-person agency that runs mostly async. The work is real (audits, citation tracking, monthly reports, implementation review), the deliverables are file-based (markdown, PDFs, schema patches), and the volume is going to grow from zero to ~10–15 active clients before you'd consider hiring. Right now, "the system" lives in your head and in scattered files. That works for one client. It breaks at three.

**The dashboard replaces "stuff in your head" with "stuff in a system you own."** It's the operating layer of the agency.

---

## Goals

1. **Single source of truth** for every client, every stage, every deliverable.
2. **Zero third-party SaaS** — owned end to end on Cloudflare. No Notion, no Airtable, no Linear.
3. **Editorial design** that matches the marketing site. The dashboard tells the same story the website tells: AI-native, deliberate, owned.
4. **Same workflow as the marketing site** — `wrangler deploy` from a directory, period. No new tools to learn.
5. **Phase 1 ships in one focused session** (~3–4 hours of build time).
6. **Solo first, multi-user later.** Single password for now. Magic links / SSO when you hire.

## Non-goals for Phase 1

- No automated citation tracking (Phase 2)
- No client-facing read-only views (Phase 3)
- No Stripe webhook integration (Phase 3)
- No file uploads / R2 storage (Phase 3)
- No email notifications (Phase 3)
- No real-time anything
- No mobile app

---

## Architecture in one paragraph

A single Cloudflare Worker at `admin.neverranked.com`, written in plain TypeScript with no React or build framework. It server-renders HTML strings using the same editorial palette as `neverranked.com`. State lives in Cloudflare D1 (hosted SQLite). Auth is a single password held in a Wrangler secret, paired with an HMAC-signed cookie. Deploy is `wrangler deploy` from `admin/`. The marketing site at the repo root and the admin dashboard in `admin/` are two separate Workers in the same git repo, sharing the same Cloudflare account and the same deploy muscle memory.

---

## Stack (with reasoning for every decision)

| Choice | Why |
|---|---|
| **Cloudflare Worker** | You're already on Cloudflare for the marketing site. Same deploy command (`wrangler deploy`), same DNS, same dashboard, same billing. Zero new vendor learning curve. |
| **TypeScript, no framework** | The marketing site is hand-written HTML/CSS, no React. The dashboard should match that DNA. No build step beyond `wrangler` compiling TS. No framework lock-in. Easier to read and modify in two years. |
| **Server-rendered HTML strings** | Dashboards are mostly tables and forms. Hand-written SSR is faster, simpler, and renders in <50ms. You can read the source. No client-side state management. |
| **Cloudflare D1 (SQLite)** | Cloudflare-native, runs in the same edge as the Worker, free tier is 5GB / 5M reads/day / 100K writes/day (we'll use 0.001% of that). SQL means real queries, real joins, real reporting. Migrations are versioned files. SQLite philosophy aligns with your "owned, not rented" rule. |
| **Cookie auth, HMAC-signed** | Single `ADMIN_PASSWORD` env var. POST `/login`, set a signed cookie, valid 7 days. No JWT library, no auth provider, no OAuth flow. Phase 3 adds proper magic links once employees join. |
| **Editorial palette** | Same `#121212` bg, gold accents, Playfair Display / DM Mono / Barlow Condensed as the marketing site. The dashboard *looks* like Never Ranked. Sales calls become "I'll show you our internal tool too" moments. |
| **Same git repo** | Marketing site at root, admin in `admin/` subdir. One repo, two `wrangler.jsonc` files, two Workers. Single source of truth, single deploy mental model. |

---

## Data model

Two tables in Phase 1. Aggressively minimal. Resist the urge to add fields you "might need."

```sql
-- migrations/0001_initial.sql

CREATE TABLE clients (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,        -- url-safe identifier, e.g. "montaic"
  name            TEXT NOT NULL,                -- display name, e.g. "Montaic"
  domain          TEXT,                          -- their website, e.g. "montaic.com"
  contact_name    TEXT,
  contact_email   TEXT,
  stage           TEXT NOT NULL DEFAULT 'prospect',  -- see STAGES below
  plan            TEXT,                          -- "audit" | "signal" | "amplify" | NULL
  notes           TEXT,                          -- freeform markdown
  created_at      INTEGER NOT NULL,             -- unix seconds
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_clients_stage ON clients(stage);
CREATE INDEX idx_clients_updated ON clients(updated_at DESC);

CREATE TABLE intake_submissions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT,
  email           TEXT NOT NULL,
  domain          TEXT NOT NULL,
  goals           TEXT,                          -- freeform: "what they said they want"
  source          TEXT,                          -- "marketing-site-form" | "manual" | "email"
  status          TEXT NOT NULL DEFAULT 'new',  -- "new" | "contacted" | "converted" | "rejected"
  client_id       INTEGER,                       -- set when converted to a client
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX idx_intake_status ON intake_submissions(status);
CREATE INDEX idx_intake_created ON intake_submissions(created_at DESC);
```

### STAGES (the client lifecycle)

```
prospect    → identified but no money has changed hands
paid        → paid for the audit, work hasn't started
auditing    → audit is actively being run
delivered   → audit deliverables sent, awaiting next step
implementing → client is implementing fixes, you're checking in
ongoing     → on a monthly retainer (signal or amplify)
churned     → stopped paying, archived
```

These are stored as TEXT (not an enum) so we can rename or add stages later without a migration. The dashboard will validate against a const list in the Worker code.

---

## Routes

Eight routes total in Phase 1. Six page routes, one API endpoint, one auth.

| Method | Path | Auth? | Purpose |
|---|---|---|---|
| GET | `/` | yes | Home dashboard: "What's on deck this week" + counts by stage + last 5 intake submissions |
| GET | `/login` | no | Password entry form |
| POST | `/login` | no | Validate password, set signed cookie, redirect to `/` |
| GET | `/logout` | yes | Clear cookie, redirect to `/login` |
| GET | `/clients` | yes | Table of every client. Filterable by stage. Sortable. |
| GET | `/clients/new` | yes | Form: create a new client |
| POST | `/clients` | yes | Insert new client, redirect to detail |
| GET | `/clients/:slug` | yes | Detail view: contact info, current stage, plan, notes |
| POST | `/clients/:slug` | yes | Update fields (stage, notes, plan) |
| GET | `/intake` | yes | Inbox of submissions from the marketing site form |
| POST | `/intake/:id/convert` | yes | Convert intake to client (creates client row, links it back) |
| POST | `/intake/:id/status` | yes | Update intake status (contacted, rejected, etc.) |
| POST | `/api/intake` | no (CORS-restricted) | Public endpoint the marketing site POSTs to |

That's 13 endpoints across 8 logical routes. All HTML responses except `/api/intake` which returns JSON.

---

## Auth approach

**Login flow:**
1. Lance hits any protected route → middleware checks for `nr_admin` cookie.
2. Cookie missing or invalid → 302 redirect to `/login?next=<original-path>`.
3. POST `/login` → check `password === env.ADMIN_PASSWORD`.
4. If match: generate signed cookie. Format: `<unix-timestamp>.<HMAC-SHA256(timestamp, ADMIN_SECRET)>`. Set `Secure`, `HttpOnly`, `SameSite=Strict`, `Max-Age=604800` (7 days).
5. Redirect to `next` param or `/`.

**Middleware on every protected request:**
1. Read `nr_admin` cookie.
2. Split on `.`, verify HMAC matches.
3. Verify timestamp is within 7 days.
4. If valid → continue. If invalid → 302 to `/login`.

**Two secrets to set via `wrangler secret put`:**
- `ADMIN_PASSWORD` — the login password (you choose it)
- `ADMIN_SECRET` — random 32-byte hex for HMAC signing (I'll generate)

**Why this approach:** It's two functions and a cookie. No JWT library, no OAuth provider, no session table. For a one-person tool, more auth = more attack surface and more complexity to debug. When you hire your first employee, we upgrade to per-user accounts (separate `users` table, magic-link sign-in via Cloudflare Email Workers). Phase 3.

**`/api/intake` is the one unauthenticated route.** It accepts POSTs from the marketing site's audit form. To prevent random spam:
- CORS allowlist: only `https://neverranked.com` and `https://www.neverranked.com`
- Honeypot field (hidden input that bots fill, humans don't)
- Rate limit by IP (Cloudflare's built-in rate limiting, 5 requests / 10 min)
- Require email and domain to be present

---

## UI / page-by-page sketch

I'll write the HTML in the same vanilla style as the marketing site. Plain CSS in a `<style>` block per layout, no Tailwind, no CSS-in-JS. Same fonts loaded from Google Fonts. Same color tokens.

### `/login`

Just a centered card. Logo wordmark at top. Single password input. Single submit button. Editorial. ~50 lines of HTML.

### `/` (home dashboard)

Three sections, top to bottom:

1. **This week** — clients grouped by "next action due this week" (manual notes field for now; Phase 2 adds real scheduling)
2. **Pipeline counts** — six numbers: prospect, paid, auditing, delivered, implementing, ongoing. Each is clickable → goes to filtered `/clients` view.
3. **Recent intake** — table of the 5 most recent intake submissions with status badges. Click → goes to `/intake`.

### `/clients`

A single big table. Columns: Name | Domain | Stage | Plan | Updated | (action: view). Filter dropdown at top: "All stages" / "Prospect" / "Paid" / etc. Sortable headers. Add New button top-right → `/clients/new`.

### `/clients/new`

Form with: Name (required), Slug (auto-generated from name, editable), Domain, Contact Name, Contact Email, Stage (dropdown, default "prospect"), Plan (dropdown), Notes (textarea). One Save button.

### `/clients/:slug`

Two-column layout. Left: contact card + stage selector + plan selector + save button. Right: notes (markdown rendered). Below: link to the audit folder in the repo (`audits/<slug>/` if it exists). Stage and notes are inline-editable: change them, hit Save, reload.

### `/intake`

Same table format as `/clients`. Columns: Email | Domain | Status | Created | (actions: convert / mark contacted / reject). Filter by status. Convert opens a modal/form pre-filling client data from the intake row.

---

## Visual style

Same palette as marketing site, with one critical difference: **denser spacing**. The marketing site uses editorial whitespace (clamp() margins, 64px gutters). The dashboard needs to fit a lot of data on screen. So:

- Same background, text, gold colors
- Same fonts (Playfair for headlines, Barlow Condensed for labels, DM Mono for body and tables)
- Tighter padding (16px instead of 64px)
- Tables use mono font
- Stage badges are uppercase Barlow Condensed in gold
- Hover states use the same gold underline / opacity transitions
- Forms use bordered inputs with gold focus rings

It should *feel* like the marketing site shrunk into a control panel. Not like a generic admin template.

---

## Repository layout

```
neverranked/
├── index.html                       (marketing — existing)
├── dist/                            (marketing build — existing)
├── og.png                           (marketing — existing)
├── wrangler.jsonc                   (marketing Worker config — existing)
├── audits/                          (client work product — existing)
├── audit-template/                  (audit template — existing)
├── scripts/                         (run-audit.py — existing)
├── content/                         (launch post — existing)
└── admin/                           (NEW — dashboard Worker)
    ├── PLAN.md                      (this file)
    ├── package.json
    ├── tsconfig.json
    ├── wrangler.jsonc
    ├── migrations/
    │   └── 0001_initial.sql
    └── src/
        ├── index.ts                 (Worker entry, router)
        ├── auth.ts                  (cookie HMAC, middleware)
        ├── db.ts                    (D1 query helpers)
        ├── render.ts                (HTML rendering helpers, escaping)
        ├── styles.ts                (CSS string, shared across pages)
        ├── views/
        │   ├── layout.ts            (base HTML, nav, footer)
        │   └── components.ts        (table, badge, form-field helpers)
        └── routes/
            ├── login.ts
            ├── home.ts
            ├── clients.ts
            ├── client-detail.ts
            ├── client-new.ts
            ├── intake.ts
            └── api-intake.ts
```

Total: ~15 source files, ~1500 lines of code estimated. Small enough to read in one sitting.

---

## Deploy plan

1. `cd admin/`
2. `wrangler d1 migrations apply neverranked-admin --remote` — create the tables in production D1
3. `wrangler secret put ADMIN_PASSWORD` — Lance enters chosen password
4. `wrangler secret put ADMIN_SECRET` — I generate a random 32-byte hex, Lance pastes
5. `wrangler deploy` — ship the Worker
6. The first deploy uses `workers_dev: true` so we can test at `neverranked-admin.lanceroylo.workers.dev`
7. Once verified, add `routes` for `admin.neverranked.com` to wrangler.jsonc and redeploy
8. Cloudflare auto-provisions the DNS record + TLS cert

---

## What I've already done before pausing

When you said "ok," I started building immediately. Before you said "plan first," I had created:

1. `admin/` directory + `src/routes/`, `src/views/`, `migrations/` subdirs
2. `admin/package.json` (basic, with wrangler scripts — see content above)
3. `admin/tsconfig.json` (strict TS config for Workers)
4. **A D1 database** named `neverranked-admin` in your Cloudflare account
   - ID: `e4155448-94b2-4ae1-a397-4dad247c895d`
   - Region: WNAM (Western North America)
   - Status: empty, no tables yet

**Reversibility:** All files can be deleted. The D1 database is on free tier, costs $0/month, can be left or deleted via `wrangler d1 delete neverranked-admin`. My recommendation: keep it parked. We'll use it.

---

## Open questions for you

Read the plan, then tell me:

1. **Scope** — Does Phase 1 cover the right things? Anything missing? Anything I should cut? Specifically: am I right that you don't need deliverables tracking (which files exist for which client) in Phase 1? My instinct is "no, that lives in the filesystem already and the client detail page can just link to the folder." Confirm or push back.

2. **Stages list** — Are the seven stages right? `prospect / paid / auditing / delivered / implementing / ongoing / churned`. Should I rename any? Add any (e.g., "discovery call scheduled")? Remove any?

3. **Plans list** — I have `audit / signal / amplify`. Are "signal" and "amplify" the right names for the two retainer tiers? (We discussed those earlier — confirming.) Is there a third tier?

4. **Domain** — `admin.neverranked.com` or different (`ops.`, `desk.`, `inside.`)? My recommendation: `admin.`

5. **Login password** — Pick one now and remember it. I won't see it. You'll set it via `wrangler secret put ADMIN_PASSWORD` when we deploy.

6. **Marketing-site intake** — Should I update the `/audit` section on `neverranked.com` to actually POST to `/api/intake` as part of Phase 1? Right now the audit section is editorial copy, no form. We'd need to add a real form. **My recommendation:** yes — Phase 1 isn't useful without a way for prospects to enter the system. I'd add a small inline form to the marketing site as part of this build.

7. **Notes format** — I'm planning to render notes as markdown (so you can write structured notes per client). Confirm or push back.

8. **Existing audit work as seed data** — Should I seed the database with one row for Montaic so you have something to look at on the first load? My recommendation: yes.

9. **Sign-off to start building** — once you've answered above, do I have the green light to execute exactly the plan as written?

---

## My recommendation for how you respond

You don't need to write paragraphs. A reply like this is plenty:

```
1. Scope looks right. Cut nothing, add nothing.
2. Stages: rename "auditing" to "in audit", rest fine.
3. Plans correct.
4. admin. is fine.
5. Will set password at deploy time.
6. Yes, add the form to the marketing site.
7. Markdown notes yes.
8. Yes seed Montaic.
9. Approved. Build it.
```

That's enough for me to execute.
