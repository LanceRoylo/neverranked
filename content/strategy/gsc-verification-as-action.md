---
title: "GSC verification as the next action-surface walkthrough"
status: queued for 2026-05-14
session_context: continued from 2026-05-13 actions-surface session
---

# GSC verification -- next action surface

## What this is

Add Google Search Console verification as the 6th action type in the
`/actions/<slug>` surface. Same pattern as Bing for Business and Apple
Business Connect:

1. We can't sign in to the client's Google account
2. Everything else is prepared in the walkthrough
3. Once verified, we pull their real GSC data into the dashboard,
   prompt discovery, audit deliverables, and citation work

## Why this matters for the agentic story

The product thesis we've been shipping toward: every external account
NeverRanked needs access to becomes a one-time walkthrough the client
completes themselves. After GSC, the system can:

1. Pull actual organic search query data per client (currently we have
   gsc_snapshots scaffolding but most clients aren't connected)
2. Cross-reference GSC queries with citation_runs to find prompts
   where the client gets traffic from Google but not from AI engines
3. Feed real query data into prompt-auto-expand so the tracked prompt
   set grows from REAL user behavior, not just generated candidates
4. Make the weekly digest stronger with GSC delta data

## What's already in the codebase

- `dashboard/src/gsc.ts` -- OAuth flow + data pull functions
- `gsc_snapshots` table -- schema is already there
- Weekly digest reads from this when present
- Most existing clients are NOT verified (the connection flow exists
  but isn't surfaced cleanly)

## Walkthrough shape (step-driven, ~6 steps)

1. Open Google Search Console
2. Add property (URL prefix or domain)
3. Pick verification method (DNS TXT vs HTML file vs Google Tag Manager
   vs domain ownership via Google Domains)
4. Apply verification (copy-paste TXT record or whatever method)
5. Wait for Google to verify (~5 min to 24 hours)
6. Grant NeverRanked access via OAuth (this is the key step)

## Where the OAuth flow lives now

Check `dashboard/src/routes/` for existing OAuth handlers if any. May
need to add a `/oauth/google/callback` route if it doesn't exist.

## Boundary framing for the action card

> "We can't verify your Google Search Console property. Google
> requires you to prove you own the domain through DNS or HTML
> verification. Everything else is ready: we'll guide you through
> the verification method that's easiest for your setup, and once
> Google confirms ownership, granting NeverRanked access is a
> one-click step."

## Estimated work

- Walkthrough definition in registry.ts: 30 min
- OAuth callback handler (if not present): 60 min
- Per-client GSC connection tracking in injection_configs: 15 min
- Test against Hawaii Theatre as the first real connection: 30 min

Total: ~2 to 3 hours for full ship.

## Open questions for tomorrow

1. Does the existing gsc.ts OAuth flow work end-to-end already, or
   does it need wiring? Check `dashboard/src/routes/gsc.ts` if exists.
2. Are we pulling GSC data on a cron today, or only when manually
   triggered? The weekly-extras workflow has a `gsc-pull` step but
   only fires when there's a connection.
3. What's the relationship between GSC data and the FAQ generator?
   The multi-source pipeline currently uses citation_runs and Reddit;
   adding GSC queries as a third source could close more citation
   gaps.

## Reminder mechanism

This doc was created at the end of the 2026-05-13 session as a
hand-off. An admin_inbox item with kind='reminder' was also created
to surface in the cockpit when Lance logs in. Both should fire
together so the context is impossible to miss.
