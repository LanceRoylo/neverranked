-- Atlas Chat surface: the data-interpretation layer of the customer
-- dashboard. Lives at /c/<slug>/atlas. Answers data questions about
-- a paying customer's own measurement; refuses prescriptive questions
-- (which live in the hand-written monthly memo). See
-- atlas-system-prompt.md for the contract.
--
-- This migration adds four tables. Three are canonical artifacts that
-- the broader practice needed to formalize anyway (customers,
-- monthly_memos, brand_brains). One is the chat itself (atlas_messages).
--
-- Reasoning for building the canonical tables now rather than letting
-- Atlas degrade against missing schema:
--   - Atlas's promise ("ask the data") is only as strong as the data
--     context it receives. Half a context is a half-good Atlas.
--   - The artifacts (memos, brand-brains) are real deliverables of the
--     practice. They need a home regardless of Atlas.
--   - Empty rows are fine on day 1. The loader degrades honestly when
--     a section is empty ("I don't have a monthly memo in context yet").
--     As Lance writes the first HTC memo, it lands in monthly_memos and
--     Atlas has it immediately.

-- ────────────────────────────────────────────────────────────────────
-- 1. customers — canonical customer-of-record table.
--
-- client_settings has only avg_deal_value (legacy, narrow). domains has
-- slugs but is per-domain, not per-customer. There's no single source of
-- truth for "who is HTC, what category, when did they sign, what's their
-- MRR". This table is that source.
--
-- Status values:
--   'active'    — paying, served by Atlas
--   'paused'    — paused billing, frozen Atlas
--   'churned'   — ended; Atlas locked, data retained
--   'pilot'     — pre-pivot pilot (HTC's status — proof-point, not paying)

CREATE TABLE IF NOT EXISTS customers (
  client_slug   TEXT PRIMARY KEY,    -- canonical; joins to domains.client_slug, citation_keywords.client_slug, etc.
  name          TEXT NOT NULL,       -- "Hawaii Theatre Center"
  category      TEXT NOT NULL,       -- canonical category slug, e.g., 'theater-honolulu', 'cpa-honolulu'
  category_label TEXT,               -- human-readable, e.g., "Honolulu performing-arts venues"
  signed_at     INTEGER,             -- unix ts; null if pilot/not-yet-paying
  mrr_cents     INTEGER NOT NULL DEFAULT 0,  -- $1,500/mo = 150000
  status        TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'paused' | 'churned' | 'pilot'
  primary_contact_email TEXT,
  primary_contact_name  TEXT,
  notes         TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_category ON customers(category);

-- Seed HTC. The first customer. Pilot status, $0 MRR, but a real
-- engagement of record. Signed_at = the day the snippet went live
-- (2026-04-15 ≈ unix 1776470400, ten days before the 45→95 measurement).
INSERT OR IGNORE INTO customers (client_slug, name, category, category_label, signed_at, mrr_cents, status, primary_contact_name)
VALUES (
  'hawaii-theatre',
  'Hawaii Theatre Center',
  'theater-honolulu',
  'Honolulu performing-arts venues',
  1776470400,
  0,
  'pilot',
  'Greg'
);

-- ────────────────────────────────────────────────────────────────────
-- 2. monthly_memos — the hand-written research memo Lance ships on the
-- 25th of each month. The action layer. Atlas references these in
-- context but never composes new prescriptive language; it can quote
-- or summarize prior memos when the customer asks "what did the last
-- memo say about X".
--
-- month_key is YYYY-MM (e.g. '2026-05'). One memo per slug per month.
-- delivered_at = when Lance approved + sent it; null = drafted but
-- not delivered. Atlas only reads delivered memos.

CREATE TABLE IF NOT EXISTS monthly_memos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug   TEXT NOT NULL,
  month_key     TEXT NOT NULL,        -- 'YYYY-MM'
  title         TEXT,                  -- e.g. "May 2026 delta memo"
  body_markdown TEXT NOT NULL,         -- full memo, markdown
  delivered_at  INTEGER,               -- unix ts, null = draft
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_memos_slug_month
  ON monthly_memos(client_slug, month_key);
CREATE INDEX IF NOT EXISTS idx_monthly_memos_delivered
  ON monthly_memos(client_slug, delivered_at DESC);

-- ────────────────────────────────────────────────────────────────────
-- 3. brand_brains — per-customer structured knowledge file. Atlas reads
-- sections 5, 6, 7 (recommendation trajectory, citation trajectory,
-- open threads). Other sections (background, voice, etc.) are for the
-- monthly-memo author and aren't loaded into Atlas context.
--
-- section_number is 1..N, stable per customer. title is human-readable.
-- body_markdown is the section content. updated_at lets the loader pick
-- the freshest version when sections are revised.
--
-- Why a row-per-section instead of one JSON blob: lets Lance edit one
-- section without re-saving the whole file, lets the loader pull just
-- the sections Atlas needs, and the section_number lookup is fast.

CREATE TABLE IF NOT EXISTS brand_brains (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug    TEXT NOT NULL,
  section_number INTEGER NOT NULL,    -- 1..N
  title          TEXT NOT NULL,
  body_markdown  TEXT NOT NULL,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_brains_slug_section
  ON brand_brains(client_slug, section_number);

-- ────────────────────────────────────────────────────────────────────
-- 4. atlas_messages — the chat. Append-only conversation history per
-- slug. Loaded into Atlas's request context as the last N turns (cap
-- at ~20 turns to stay under the model context window comfortably).
--
-- grader_verdict captures the fail-closed factual grader's output on
-- assistant turns so we can audit Atlas's behavior over time. Verdicts:
--   'pass'           — went out as-is
--   'pass-redraft'   — failed first attempt, passed re-draft
--   'punt-fallback'  — failed twice, surfaced Punt 5
--   null             — user turn (no grading)
--
-- flagged_at is non-null when a user turn triggered the flag-it path.
-- Used by the inbox view to find what Lance needs to respond to.

CREATE TABLE IF NOT EXISTS atlas_messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug    TEXT NOT NULL,
  role           TEXT NOT NULL,       -- 'user' | 'assistant' | 'system' (rare; for inline notes)
  content        TEXT NOT NULL,
  grader_verdict TEXT,                -- 'pass' | 'pass-redraft' | 'punt-fallback' | null
  grader_reason  TEXT,                -- reason string from grader when rejected
  flagged_at     INTEGER,             -- unix ts; non-null = "flag it" triggered on this user turn
  flag_resolved_at INTEGER,           -- when Lance closed the flag
  model_usage    TEXT,                -- JSON: {input_tokens, output_tokens, model}
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_atlas_messages_slug_ts
  ON atlas_messages(client_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_messages_flagged
  ON atlas_messages(flagged_at)
  WHERE flagged_at IS NOT NULL;
