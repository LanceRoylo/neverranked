-- An invoice was issued to the only paying client and nothing recorded whether
-- it was paid.
--
-- NR-PW-002 went out 2026-09-04 for $785.34, net 15, due 2026-09-16. On
-- 2026-09-29, thirteen days past due, there was no record of receipt anywhere:
-- not in this database, not in the docs repo. The SEND is documented in
-- forensic detail, gates checked, PDF verified from its own text, measurement
-- confirmed real before billing. The receipt is documented nowhere.
--
-- The same asymmetry produces the other half of the problem: the invoice exists
-- because somebody remembered to run scripts/render-invoice.mjs. Nothing asks
-- on the first of the month whether it happened.
--
-- Both matter more from December, when the three-month initial term rolls to
-- month-to-month and the invoices become indefinite.
--
-- This table is the record. lib/invoice-watch.ts reads it and raises an inbox
-- item when a month has no invoice, or when an issued one passes its due date
-- unpaid.

CREATE TABLE IF NOT EXISTS client_invoices (
  invoice_no   TEXT PRIMARY KEY,
  client_slug  TEXT NOT NULL,
  -- YYYY-MM of the service period, not of issue. An invoice dated 1 October
  -- for October measurement has period '2026-10'.
  period       TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  tax_cents      INTEGER NOT NULL DEFAULT 0,
  total_cents    INTEGER NOT NULL,
  issued_at    INTEGER,
  due_at       INTEGER,
  -- NULL until it actually goes to the client. Generating a PDF is not issuing.
  sent_at      INTEGER,
  -- NULL means unknown, NOT unpaid. The difference is the whole point of the
  -- table: "we have not recorded a payment" and "they did not pay" are
  -- different statements and only one of them is ours to make.
  paid_at      INTEGER,
  paid_cents   INTEGER,
  method       TEXT,
  -- 'draft' | 'sent' | 'paid' | 'void'
  status       TEXT NOT NULL DEFAULT 'draft',
  note         TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_client_invoices_client
  ON client_invoices(client_slug, period DESC);
CREATE INDEX IF NOT EXISTS idx_client_invoices_outstanding
  ON client_invoices(status, due_at);

-- Backfill from the record. Re-runnable.
INSERT OR IGNORE INTO client_invoices
  (invoice_no, client_slug, period, subtotal_cents, tax_cents, total_cents,
   issued_at, due_at, sent_at, paid_at, status, note)
VALUES
  ('NR-PW-001', 'prince-waikiki', '2026-07', 0, 0, 0,
   CAST(strftime('%s','2026-07-16') AS INTEGER), NULL, NULL, NULL, 'void',
   'Hand-built 2026-07-16 and never sendable: billed the superseded $4,500 kickoff plus $1,500/month against an executed $750/month, and described "7 AI engines", the taxonomy Amendment No. 1 retracts. Superseded by NR-PW-002. Recorded so the numbering has no gap.'),

  ('NR-PW-002', 'prince-waikiki', '2026-09', 75000, 3534, 78534,
   CAST(strftime('%s','2026-09-01') AS INTEGER),
   CAST(strftime('%s','2026-09-16') AS INTEGER),
   CAST(strftime('%s','2026-09-04') AS INTEGER),
   NULL, 'sent',
   'First of the three-month initial term. Heather confirmed 2026-09-05 it was with Accounting for processing. paid_at is NULL meaning UNRECORDED, not unpaid: as of 2026-09-29 nobody had checked the bank.'),

  ('NR-PW-003', 'prince-waikiki', '2026-10', 75000, 3534, 78534,
   CAST(strftime('%s','2026-10-01') AS INTEGER),
   CAST(strftime('%s','2026-10-16') AS INTEGER),
   NULL, NULL, 'draft',
   'Second of the initial term. Generated 2026-09-29, held for a 10-01 send so the invoice date matches the calendar. Carries the Exhibit A amendment signature ask.');
