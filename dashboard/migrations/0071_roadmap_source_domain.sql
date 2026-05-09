-- 0071: Citation-gap source_domain column on roadmap_items.
--
-- Background: when the auto-roadmap-from-citation-gaps logic shipped
-- (commit 6b24421), the source domain for each gap-driven item was
-- encoded inside the user-editable `description` field via a
-- `[gap-source: <domain>]` tag. The audit (commit 7632db7 + later
-- pass) flagged two coupled risks:
--
--   L1: a user editing the description in the dashboard could
--       accidentally remove the tag, breaking dedup. Next sync run
--       inserts a duplicate. Auto-resolve never fires for the orphan.
--   L2: same root cause, surfaces as silent leak of orphan items
--       that pile up forever.
--
-- Fix: a dedicated `source_domain TEXT` column. The dashboard's
-- description field stays user-editable for notes and context; the
-- code's dedup + auto-resolve lookup uses the protected column.
--
-- Backfill: read the existing `[gap-source: <domain>]` tag out of
-- description for any row where refresh_source = 'citation_gap'.
-- SUBSTR + INSTR avoids a regex dependency. Tag format is
-- "[gap-source: <domain>]" placed as the last line of description.
--
-- Index: client-slug + source_domain composite, partial on
-- source_domain IS NOT NULL so it stays compact (most rows will
-- never have a source_domain).

ALTER TABLE roadmap_items ADD COLUMN source_domain TEXT;

UPDATE roadmap_items
SET source_domain = TRIM(
  SUBSTR(
    description,
    INSTR(description, '[gap-source: ') + 13,
    INSTR(SUBSTR(description, INSTR(description, '[gap-source: ') + 13), ']') - 1
  )
)
WHERE refresh_source = 'citation_gap'
  AND description LIKE '%[gap-source: %]%';

CREATE INDEX IF NOT EXISTS idx_roadmap_items_source_domain
  ON roadmap_items(client_slug, source_domain)
  WHERE source_domain IS NOT NULL;
