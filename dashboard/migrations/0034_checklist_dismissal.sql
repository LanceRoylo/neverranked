-- Phase 2 onboarding wizard: per-user dismissal state for the
-- "Getting started" checklist card. NULL = never dismissed (show
-- while any step is incomplete). Non-null = dismissed at that epoch.
-- Reset to NULL by clicking "Getting started" in the avatar menu.

ALTER TABLE users ADD COLUMN checklist_dismissed_at INTEGER;
