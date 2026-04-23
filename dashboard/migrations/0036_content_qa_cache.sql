-- Cache the content QA result on the draft so the editor page can show
-- badges (pass / warn / held) and the fact-claims list without re-running
-- the Claude pass on every render. Populated on generation; invalidated
-- on every manual edit (cleared in the save handler).

ALTER TABLE content_drafts ADD COLUMN qa_result_json TEXT;
ALTER TABLE content_drafts ADD COLUMN qa_level TEXT;
