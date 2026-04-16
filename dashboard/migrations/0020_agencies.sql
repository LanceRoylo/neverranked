-- NeverRanked Dashboard -- Agency white-label (Phase 1 co-branded)
--
-- Adds the agencies table, links users and domains to agencies, and adds
-- the columns needed for per-client slot billing and internal-vs-full
-- client access modes.
--
-- All new columns are nullable or have safe defaults so existing direct
-- clients (agency_id IS NULL) continue to work unchanged.

CREATE TABLE agencies (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  contact_email         TEXT NOT NULL,
  logo_url              TEXT,
  primary_color         TEXT NOT NULL DEFAULT '#c9a84c',
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | active | paused | archived
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,
  signal_slot_item_id   TEXT,      -- Stripe subscription_item id for Signal slots
  amplify_slot_item_id  TEXT,      -- Stripe subscription_item id for Amplify slots
  intro_discount_ends_at INTEGER,  -- unix ts when the 90-day 20% intro discount ends
  notes                 TEXT,      -- internal ops notes
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_agencies_slug ON agencies(slug);
CREATE INDEX idx_agencies_status ON agencies(status);
CREATE INDEX idx_agencies_stripe_customer ON agencies(stripe_customer_id);

-- Link users to agencies. Agency admins have role='agency_admin' AND a
-- non-null agency_id. Clients that belong to an agency may still log in
-- (Mode 2 / client-facing access) and have agency_id set for branding
-- context.
ALTER TABLE users ADD COLUMN agency_id INTEGER REFERENCES agencies(id);
CREATE INDEX idx_users_agency ON users(agency_id);

-- Link domains (clients) to agencies. NULL = direct client (existing behavior).
-- plan: signal | amplify -- used for slot billing
-- client_access: internal | full
--   internal = Mode 1 default. Client never logs in. Agency runs everything
--     and delivers branded reports.
--   full = Mode 2. Client can log into a co-branded dashboard.
-- activated_at: when this domain was activated under its agency (for
--   slot billing proration). NULL for direct clients.
ALTER TABLE domains ADD COLUMN agency_id INTEGER REFERENCES agencies(id);
ALTER TABLE domains ADD COLUMN plan TEXT;
ALTER TABLE domains ADD COLUMN client_access TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE domains ADD COLUMN activated_at INTEGER;

CREATE INDEX idx_domains_agency ON domains(agency_id);
CREATE INDEX idx_domains_plan ON domains(plan);

-- Pending agency applications. Populated by /agency/apply public form,
-- reviewed and approved via the Ops cockpit.
CREATE TABLE agency_applications (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_name       TEXT NOT NULL,
  contact_name      TEXT NOT NULL,
  contact_email     TEXT NOT NULL,
  website           TEXT,
  estimated_clients INTEGER,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by       INTEGER,
  reviewed_at       INTEGER,
  agency_id         INTEGER, -- set when status flips to approved
  created_at        INTEGER NOT NULL
);

CREATE INDEX idx_agency_applications_status ON agency_applications(status, created_at DESC);
CREATE INDEX idx_agency_applications_email ON agency_applications(contact_email);

-- Agency invites for adding users (either their own team or Mode-2 clients).
-- Reuses the existing magic_links flow downstream but tracks the agency
-- context so the resulting user inherits agency_id correctly.
CREATE TABLE agency_invites (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id     INTEGER NOT NULL REFERENCES agencies(id),
  email         TEXT NOT NULL,
  role          TEXT NOT NULL, -- agency_admin | client
  client_slug   TEXT,          -- required when role='client', binds the invitee to this domain
  token         TEXT NOT NULL UNIQUE,
  expires_at    INTEGER NOT NULL,
  used_at       INTEGER,
  invited_by    INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE INDEX idx_agency_invites_token ON agency_invites(token);
CREATE INDEX idx_agency_invites_agency ON agency_invites(agency_id);

-- Slot billing ledger. One row per slot state change (activation, pause,
-- reactivation, removal) so we can audit what the agency was billed for
-- and reconcile against Stripe.
CREATE TABLE agency_slot_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id       INTEGER NOT NULL REFERENCES agencies(id),
  domain_id       INTEGER NOT NULL REFERENCES domains(id),
  plan            TEXT NOT NULL, -- signal | amplify
  event_type      TEXT NOT NULL, -- activated | paused | resumed | removed
  stripe_item_id  TEXT,          -- which subscription_item was adjusted
  quantity_before INTEGER,
  quantity_after  INTEGER,
  prorated_amount INTEGER,        -- cents, for audit (nullable)
  note            TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_agency_slot_events_agency ON agency_slot_events(agency_id, created_at DESC);
CREATE INDEX idx_agency_slot_events_domain ON agency_slot_events(domain_id, created_at DESC);
