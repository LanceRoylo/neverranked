-- Never Ranked Admin Dashboard — Phase 1 initial schema
-- Two tables: clients + intake_submissions
-- Stripe columns included up front so Phase 3 doesn't need a migration for them.

CREATE TABLE clients (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                   TEXT NOT NULL UNIQUE,
  name                   TEXT NOT NULL,
  domain                 TEXT,
  contact_name           TEXT,
  contact_email          TEXT,
  stage                  TEXT NOT NULL DEFAULT 'prospect',
  plan                   TEXT,
  notes                  TEXT,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

CREATE INDEX idx_clients_stage ON clients(stage);
CREATE INDEX idx_clients_updated ON clients(updated_at DESC);

CREATE TABLE intake_submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT,
  email        TEXT NOT NULL,
  domain       TEXT NOT NULL,
  goals        TEXT,
  source       TEXT,
  status       TEXT NOT NULL DEFAULT 'new',
  client_id    INTEGER,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX idx_intake_status ON intake_submissions(status);
CREATE INDEX idx_intake_created ON intake_submissions(created_at DESC);

-- Seed row: Montaic as first client, stage = ongoing (A1/A1.5 deployed, Claire running quick-wins bundle)
INSERT INTO clients (slug, name, domain, contact_name, contact_email, stage, plan, notes, created_at, updated_at)
VALUES (
  'montaic',
  'Montaic',
  'montaic.com',
  'Lance Roylo',
  'support@montaic.com',
  'ongoing',
  'amplify',
  '# Montaic

Founder-led, AI-native listing content platform for real estate and marine professionals.

## Audit status
- A1 (root Organization + WebSite schema): DEPLOYED, validated
- A1.5 (per-page schemas wired to root Org): DEPLOYED, validated, 3 items, 0 errors
- A7 + A6 + A9 (canonicals + free-grader stack + meta rewrites): handoff sent to Claire
- A1.6 (Person schema on /agents/[slug]): pending
- A2+ (breadcrumbs, HowTo, og:images, pillar article, entity registration): pending

## Notes
- Separate business entity from Never Ranked, but Lance is the founder of both.
- Montaic is Never Ranked''s in-house AEO lab. Every technique ships on Montaic first.',
  unixepoch(),
  unixepoch()
);
