-- NeverRanked Dashboard — Initial schema
-- Phase 1a: Auth + core tables

CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  role            TEXT NOT NULL DEFAULT 'client',
  client_slug     TEXT,
  created_at      INTEGER NOT NULL,
  last_login_at   INTEGER
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_client_slug ON users(client_slug);

CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE magic_links (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  expires_at      INTEGER NOT NULL,
  used            INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_email ON magic_links(email);

CREATE TABLE domains (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug     TEXT NOT NULL,
  domain          TEXT NOT NULL,
  is_competitor   INTEGER NOT NULL DEFAULT 0,
  competitor_label TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_domains_client_domain ON domains(client_slug, domain);
CREATE INDEX idx_domains_client ON domains(client_slug);
CREATE INDEX idx_domains_active ON domains(active);

CREATE TABLE scan_results (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id       INTEGER NOT NULL,
  url             TEXT NOT NULL,
  aeo_score       INTEGER NOT NULL,
  grade           TEXT NOT NULL,
  schema_types    TEXT NOT NULL DEFAULT '[]',
  red_flags       TEXT NOT NULL DEFAULT '[]',
  technical_signals TEXT NOT NULL DEFAULT '[]',
  schema_coverage TEXT NOT NULL DEFAULT '[]',
  signals_json    TEXT NOT NULL DEFAULT '{}',
  scan_type       TEXT NOT NULL DEFAULT 'cron',
  error           TEXT,
  scanned_at      INTEGER NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE INDEX idx_scan_results_domain ON scan_results(domain_id, scanned_at DESC);
CREATE INDEX idx_scan_results_scanned ON scan_results(scanned_at DESC);

CREATE TABLE page_scans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id       INTEGER NOT NULL,
  url             TEXT NOT NULL,
  schema_types    TEXT NOT NULL DEFAULT '[]',
  aeo_score       INTEGER NOT NULL,
  grade           TEXT NOT NULL,
  last_scanned_at INTEGER NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE UNIQUE INDEX idx_page_scans_domain_url ON page_scans(domain_id, url);
CREATE INDEX idx_page_scans_domain ON page_scans(domain_id);

CREATE TABLE roadmap_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug     TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'custom',
  status          TEXT NOT NULL DEFAULT 'pending',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  due_date        INTEGER,
  completed_at    INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_roadmap_client ON roadmap_items(client_slug, sort_order);
CREATE INDEX idx_roadmap_status ON roadmap_items(client_slug, status);

CREATE TABLE email_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL,
  type            TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_email_log_email ON email_log(email, created_at DESC);

CREATE TABLE monitored_pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id   INTEGER NOT NULL,
  url         TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE UNIQUE INDEX idx_monitored_pages_url ON monitored_pages(domain_id, url);
