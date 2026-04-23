-- Phase C: outcome tracking for published content. Adds metadata so we
-- can tell whether a shipped piece actually did its job -- earned new
-- citations, got indexed, started ranking.
--
-- Also adds a target_keyword_id so scheduled topics are tied to a
-- specific citation_keyword row when available. That's the connective
-- tissue between "what we wrote about" and "did it move the needle."

ALTER TABLE scheduled_drafts ADD COLUMN target_keyword_id INTEGER;     -- FK to citation_keywords, may be null for pure manual topics
ALTER TABLE scheduled_drafts ADD COLUMN wp_post_id INTEGER;            -- WordPress post.id; used to re-fetch the post if needed
ALTER TABLE scheduled_drafts ADD COLUMN outcome_checked_at INTEGER;    -- last time we ran the outcome scan for this item
ALTER TABLE scheduled_drafts ADD COLUMN earned_citations_count INTEGER DEFAULT 0; -- citations seen AFTER publish_at where client_cited=1 on target keyword
ALTER TABLE scheduled_drafts ADD COLUMN rank_current INTEGER;          -- latest GSC rank for target keyword; null if unknown
ALTER TABLE scheduled_drafts ADD COLUMN rank_peak INTEGER;             -- best (lowest number) rank ever observed
ALTER TABLE scheduled_drafts ADD COLUMN indexed_at INTEGER;            -- first time we observed any GSC impression for this URL
