# Hand-off — local outreach tool prospect sync

**Endpoint:** `POST https://app.neverranked.com/api/admin/sync-prospects`

**Auth:** Header `X-Admin-Secret: <ADMIN_SECRET>`. Same value used by `/api/admin/leads.json` and `/api/admin/referrers`.

## Why

The dashboard's Build Preview flow now auto-generates personalized Previews using prospect metadata (name, company, domain) plus a lightweight homepage scan. The dashboard doesn't have access to that metadata unless the local outreach tool pushes it. This endpoint is the one-way sync.

## Body shape

Bulk push (preferred — call once at startup, then again whenever a prospect is added or edited):

```json
{
  "prospects": [
    {
      "prospect_id": 192,
      "email": "mark@asbhawaii.com",
      "name": "Mark Cunningham",
      "company_name": "American Savings Bank",
      "domain": "asbhawaii.com",
      "vertical": "community banking",
      "city": "Honolulu",
      "notes": "Talked about Bing for Business at the May 13 meeting"
    },
    {
      "prospect_id": 108,
      "email": "...",
      "name": "...",
      "company_name": "...",
      "domain": "...",
      "vertical": "...",
      "city": "...",
      "notes": "..."
    }
  ]
}
```

Single push (for incremental updates):

```json
{
  "prospect_id": 192,
  "email": "mark@asbhawaii.com",
  "name": "Mark Cunningham",
  "company_name": "American Savings Bank",
  "domain": "asbhawaii.com",
  "vertical": "community banking"
}
```

Required field: `prospect_id` (integer). All other fields are optional but the more you provide, the more personalized the Preview.

## Curl example

```bash
curl -X POST https://app.neverranked.com/api/admin/sync-prospects \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"prospects":[{"prospect_id":192,"email":"mark@asbhawaii.com","name":"Mark Cunningham","company_name":"American Savings Bank","domain":"asbhawaii.com","vertical":"community banking","city":"Honolulu"}]}'
```

Response:

```json
{ "ok": true, "upserted": 1, "skipped": [], "skipped_count": 0 }
```

## Behavior

1. **Upsert per `prospect_id`.** Existing rows get overwritten with the latest values. `last_synced_at` is bumped.
2. **Idempotent.** Safe to re-run the entire list periodically. No duplicate rows.
3. **Best-effort per row.** A malformed row gets reported in `skipped` but doesn't abort the rest.
4. **Domain normalization.** Lowercased, https:// and trailing slash stripped before storage.

## When to call

Three reasonable cadences:

1. **One-time bulk sync** of every existing prospect. Run this once and Build Preview is unlocked for everyone currently in the warmth list.
2. **On send.** When the local tool sends an outreach email to a new prospect, sync that prospect's metadata immediately so D1 has it before any pixel fires.
3. **Periodic.** Cron job in the local tool that re-syncs all prospects daily. Catches any local-side edits (changed names, added domains, etc.).

## What the dashboard does with the data

Once a prospect is synced, clicking Build Preview in `/admin/warm-prospects/<id>` triggers:

1. **Metadata lookup** in `outreach_prospects` — pulls name, company, domain, etc.
2. **Lightweight homepage scan** of the domain — fetches title, meta, schema types, gaps. Takes ~1-2 seconds.
3. **Tier-aware Sonnet generation** — depth scales by signal tier (hot = 5 sections, fading = 3 sections), with the company name, scan findings, and any notes you provided woven into the copy.
4. **Draft saved** at `/admin/preview/<slug>/edit` — review, tweak, publish.

## What happens if a prospect isn't synced

The Build Preview button surfaces a build error banner at the top of the warm-prospect detail page:

> "Prospect metadata not synced. Push prospect data from the local outreach tool to /api/admin/sync-prospects first."

Or:

> "Prospect has no domain on file. Update the prospect in the local outreach tool with a domain, then re-sync."

No half-baked Previews ship. The error is the system telling you which gap to fix.
