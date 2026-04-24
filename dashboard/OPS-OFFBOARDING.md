# Offboarding Ops

There is no self-serve "delete agency" or "delete client" flow in the
dashboard. Offboarding is a manual SQL sequence via
`wrangler d1 execute neverranked-app --remote`.

No `ON DELETE CASCADE` is declared on any of the FKs, and this is
intentional: several child tables are ledgers or compliance records
(`agency_slot_events`, `email_delivery_log`, `exit_surveys`,
`nps_responses`) that must outlive the parent for accounting and audit.
A cascade would silently shred them.

## Offboard an AGENCY

Recommended: **don't hard-delete.** Soft-offboard instead — it preserves
the ledger, keeps invoice history resolvable, and lets you re-activate
without rebuilding state.

```sql
UPDATE agencies
   SET status = 'offboarded',
       updated_at = strftime('%s','now')
 WHERE id = :agency_id;

-- Deactivate every client under that agency (keeps data, stops scans):
UPDATE domains
   SET active = 0, updated_at = strftime('%s','now')
 WHERE agency_id = :agency_id;

-- Optional: revoke agency-admin logins without destroying the user rows
-- (kept for audit of who touched what before the exit):
UPDATE users
   SET role = 'viewer', updated_at = strftime('%s','now')
 WHERE agency_id = :agency_id AND role = 'agency_admin';
```

Then cancel the Stripe subscription from the Stripe dashboard. Don't
rely on webhooks to cancel it — if the webhook fails, the sub keeps
billing.

Hard-delete is only appropriate for agencies that never activated
(no `stripe_subscription_id`, no clients, test/demo rows). Sequence,
respecting FK order — children first:

```sql
-- Run inside a single session. Abort if any count-check returns
-- unexpectedly high values; that means this is a real agency, not a
-- test row.
SELECT COUNT(*) FROM domains WHERE agency_id = :agency_id;  -- expect 0
SELECT COUNT(*) FROM agency_slot_events WHERE agency_id = :agency_id;
SELECT COUNT(*) FROM email_delivery_log WHERE agency_id = :agency_id;

DELETE FROM agency_invites WHERE agency_id = :agency_id;
DELETE FROM exit_surveys WHERE agency_id = :agency_id;
DELETE FROM nps_responses WHERE agency_id = :agency_id;
DELETE FROM agency_slot_events WHERE agency_id = :agency_id;
DELETE FROM email_delivery_log WHERE agency_id = :agency_id;
DELETE FROM users WHERE agency_id = :agency_id;
DELETE FROM agencies WHERE id = :agency_id;
```

If a DELETE fails with `FOREIGN KEY constraint failed`, stop and
investigate — a new child table has been added since this doc was
written.

## Offboard a CLIENT (single domain under an agency)

Recommended: deactivate, don't delete.

```sql
UPDATE domains
   SET active = 0, updated_at = strftime('%s','now')
 WHERE client_slug = :slug AND agency_id = :agency_id;
```

Then reconcile Stripe to decrement the slot count. In the dashboard,
hit POST `/agency/clients/new` with any change — `reconcileAgencySlots`
will sync the quantity. Or invoke it directly from a scratch worker
route.

Hard-delete a client (only for test rows or domains that never ran):

```sql
-- Drain FK-linked children first (order matters):
DELETE FROM scan_results WHERE domain_id = :domain_id;
DELETE FROM page_scans WHERE domain_id = :domain_id;
DELETE FROM monitored_pages WHERE domain_id = :domain_id;
DELETE FROM agency_slot_events WHERE domain_id = :domain_id;

-- Orphan cleanup (no FKs, but these leak if you skip them):
DELETE FROM roadmap_items WHERE client_slug = :slug;
DELETE FROM roadmap_phases WHERE client_slug = :slug;
DELETE FROM citation_keywords WHERE client_slug = :slug;
DELETE FROM citation_snapshots WHERE client_slug = :slug;
DELETE FROM gsc_properties WHERE client_slug = :slug;
DELETE FROM gsc_snapshots WHERE client_slug = :slug;
DELETE FROM competitor_suggestions WHERE client_slug = :slug;
DELETE FROM schema_injections WHERE client_slug = :slug;
DELETE FROM injection_configs WHERE client_slug = :slug;
DELETE FROM page_views WHERE client_slug = :slug;
DELETE FROM support_messages WHERE client_slug = :slug;
DELETE FROM client_settings WHERE client_slug = :slug;
DELETE FROM voice_samples WHERE client_slug = :slug;
DELETE FROM voice_fingerprints WHERE client_slug = :slug;
DELETE FROM content_drafts WHERE client_slug = :slug;
DELETE FROM scheduled_drafts WHERE client_slug = :slug;
DELETE FROM wp_connections WHERE client_slug = :slug;
DELETE FROM admin_alerts WHERE client_slug = :slug;

-- Finally:
DELETE FROM domains WHERE id = :domain_id;
```

Competitor rows (`is_competitor = 1`) have no children worth keeping,
and admin already ships a self-serve delete at `/admin/competitors`
([admin.ts:580](src/routes/admin.ts:580)).

## When a new child table is added

If you add a table with `FOREIGN KEY (... ) REFERENCES agencies(id)` or
`REFERENCES domains(id)` — update this doc in the same migration PR.
Future-you will be grateful.
