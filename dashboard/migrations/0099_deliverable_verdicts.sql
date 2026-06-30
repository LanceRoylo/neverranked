-- Gate 3 (the editorial ship gate) shadow verdicts.
--
-- Each row is what the judge (Anthropic Opus 4.8, grounded on lance_decisions)
-- plus the cross-provider verifier (OpenAI gpt-4o, adversarial) decided on a
-- deliverable draft. Boots in shadow mode: nothing auto-ships, effective_action
-- is always 'escalate'. would_ship records what the gate WOULD do live so the
-- graduation tracker (Phase 2) can compare it against Lance's real later
-- decision and surface the agreement rate / "ready to go live" signal.

CREATE TABLE IF NOT EXISTS deliverable_verdicts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_type     TEXT NOT NULL,            -- 'monthly_memo' | 'readout'
  artifact_id       INTEGER,                  -- the memo id, null for offline readouts
  client_slug       TEXT,
  judge_verdict     TEXT NOT NULL,            -- 'ship' | 'escalate'
  judge_confidence  TEXT,                     -- 'high' | 'medium' | 'low'
  judge_reasons     TEXT,                     -- JSON array of short reasons
  verifier_objected INTEGER,                  -- 0/1, null when the judge escalated (verify skipped)
  verifier_reason   TEXT,
  would_ship        INTEGER NOT NULL DEFAULT 0, -- 1 if the gate would have shipped live
  effective_action  TEXT NOT NULL,            -- 'ship' | 'escalate' (always 'escalate' in shadow)
  mode              TEXT NOT NULL DEFAULT 'shadow',
  lance_decision    TEXT,                     -- filled when Lance later decides, for the graduation compare
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_deliverable_verdicts_artifact
  ON deliverable_verdicts (artifact_type, artifact_id);
