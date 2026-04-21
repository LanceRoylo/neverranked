-- Client settings: per-client knobs that aren't tied to a specific domain or user.
-- Starting with avg_deal_value for ROI estimation. Keeping the table open so we
-- can add more fields later (e.g. primary_goal, industry, reporting preferences)
-- without a migration per setting.
--
-- avg_deal_value is stored in cents (INTEGER) to avoid floating-point rounding
-- issues on currency math. NULL means "not set" and the dashboard shows a
-- prompt instead of a number rather than guessing.

CREATE TABLE IF NOT EXISTS client_settings (
  client_slug TEXT PRIMARY KEY,
  avg_deal_value INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
