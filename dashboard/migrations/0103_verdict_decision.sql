-- Graduation tracker (Phase 2) support for the deliverable judge gate.
--
-- draft_hash: a deterministic hash of the drafted body at gate time. When
-- Lance later delivers a memo, we compare the delivered body's hash to this.
-- Equal => he shipped it AS-IS (true agreement with the judge). Different =>
-- he edited before shipping (the judge's "would ship" would have been
-- premature). The graduation metric MUST use ship-as-is, not any delivery,
-- or the agreement rate inflates and an unsafe go-live looks earned.
--
-- lance_decided_at: when his real decision landed on this verdict.
-- (lance_decision itself already exists on the table from 0099.)
ALTER TABLE deliverable_verdicts ADD COLUMN draft_hash TEXT;
ALTER TABLE deliverable_verdicts ADD COLUMN lance_decided_at INTEGER;
