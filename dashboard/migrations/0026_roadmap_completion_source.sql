-- Track who/what completed a roadmap item
--
-- Background: clients were getting confused looking at the roadmap.
-- Empty checkbox + "START" button reads as "click to make the system
-- do work" -- but the system never does work from a roadmap click.
-- Items get marked done by one of three actors:
--
--   user  -- the user manually checked the box (honor system)
--   scan  -- the Monday auto-completion cron detected the fix is live
--   admin -- ops marked it done from the admin view
--
-- Stamping the source lets the UI show "verified by scan on Apr 13"
-- vs "marked by you on Apr 13" vs "marked by ops on Apr 13" so the
-- provenance is clear after the fact.
--
-- Backfill leaves existing rows NULL on purpose: we don't know how
-- they were completed, and pretending we do would lie to users.

ALTER TABLE roadmap_items ADD COLUMN completed_by TEXT;
