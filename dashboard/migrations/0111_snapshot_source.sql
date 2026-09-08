-- 0111: name which pipeline owns each client's citation_snapshots row.
--
-- WHY. Two pipelines write readout-shape snapshots and they use DIFFERENT
-- measurement definitions for the model-knowledge engines (Claude, Gemma):
--
--   'bridge' -- dryrun/forensic/bridge-to-d1.mjs. Counts model-emitted URLs
--               as citations, so Claude scores on a URL denominator. This is
--               what produced hawaii-theatre's delivered readouts.
--   'sweep'  -- buildReadoutSnapshot in the Worker. Follows the PUBLISHED
--               methodology: Layer 1 on cited URLs, Layer 2 on brand-name
--               mentions in the response.
--
-- Before this column the two were told apart by forensicSnapshotIsCurrent,
-- which infers ownership from the shape and freshness of the last row. That
-- inference is self-fulfilling: the moment the sweep writes a readout-shape
-- row it starts looking "bridge-managed" and stops updating. Worse, it would
-- have let the sweep OVERWRITE hawaii-theatre's bridge numbers mid-engagement,
-- silently changing a client's basis without disclosure.
--
-- Ownership is a fact about the engagement, not something to re-derive from
-- data every Monday. So it is stored.
--
-- Default 'sweep' is the safe default: a new client is measured by the
-- Cloudflare sweep unless someone deliberately stands up a forensic category
-- and flips this. Only hawaii-theatre is bridge-owned today.
--
-- See neverranked-docs/CLAIMS-VS-CODE-AUDIT-2026-09-06.md finding 2.

ALTER TABLE measurement_registry
  ADD COLUMN snapshot_source TEXT NOT NULL DEFAULT 'sweep';

UPDATE measurement_registry
   SET snapshot_source = 'bridge'
 WHERE client_slug = 'hawaii-theatre';
