-- Citation tracking: keywords, individual runs, weekly snapshots
-- Enables automated AI citation share monitoring per client

CREATE TABLE citation_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL,
  keyword TEXT NOT NULL,
  category TEXT DEFAULT 'primary',
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_citation_keywords_client ON citation_keywords (client_slug, active);

CREATE TABLE citation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id INTEGER NOT NULL,
  engine TEXT NOT NULL,
  response_text TEXT NOT NULL,
  cited_entities TEXT NOT NULL DEFAULT '[]',
  cited_urls TEXT NOT NULL DEFAULT '[]',
  client_cited INTEGER DEFAULT 0,
  run_at INTEGER NOT NULL,
  FOREIGN KEY (keyword_id) REFERENCES citation_keywords(id)
);

CREATE INDEX idx_citation_runs_keyword ON citation_runs (keyword_id, run_at DESC);
CREATE INDEX idx_citation_runs_engine ON citation_runs (engine, run_at DESC);

CREATE TABLE citation_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL,
  week_start INTEGER NOT NULL,
  total_queries INTEGER NOT NULL,
  client_citations INTEGER NOT NULL,
  citation_share REAL NOT NULL,
  top_competitors TEXT NOT NULL DEFAULT '[]',
  keyword_breakdown TEXT NOT NULL DEFAULT '[]',
  engines_breakdown TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_citation_snapshots_client ON citation_snapshots (client_slug, week_start DESC);
CREATE INDEX idx_citation_snapshots_week ON citation_snapshots (week_start DESC);
