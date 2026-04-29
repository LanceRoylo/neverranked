-- Phase 4B: Person schema completeness
--
-- Phase 4A tracked author presence (named author meta or any Person
-- schema). That treated `{"@type":"Person","name":"Jane"}` as
-- equivalent to a fully-fleshed-out Person node with url, jobTitle,
-- worksFor, sameAs etc. AI engines use those richer fields to
-- evaluate authorship authority -- a name alone is cargo-cult.
--
-- We now run any detected Person node through the schema-grader
-- (60+ = "complete") and track pages_with_complete_author
-- separately from pages_with_author so the dashboard can surface
-- "X% of your pages have weak author bios" as a distinct gap.

ALTER TABLE author_coverage ADD COLUMN pages_with_complete_author INTEGER NOT NULL DEFAULT 0;
