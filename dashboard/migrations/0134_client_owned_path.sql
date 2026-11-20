-- A client's OWN pages on a shared domain (2026-11-11).
--
-- The case that prompted it: one venue of a group whose venues all live on a
-- single domain (example.test/hawaii/, example.test/nyc/, example.test/london/).
-- Own-site matching was host-only, so every venue's pages counted as the
-- client's own site: in run-level client_cited, in own-site link counts, venue
-- share, own_site_pulls and site_in_sources.
--
-- With a row here, a page counts as the client's own site only when it is on
-- the owned host AND at or below path_prefix ('/hawaii' matches '/hawaii' and
-- '/hawaii/menu', never '/hawaiian'). The group's other venue pages are then
-- ordinary pages on another site; mark the domain in client_affiliated_domains
-- (migration 0130) to list them as "Your group's other sites".
--
-- One row per client. No row, an inactive row, an empty path_prefix, or the
-- table being absent (before this migration is applied) all mean host-only
-- matching, exactly as before. Removing a client's row reverts that client.
--
-- Apply with `npm run db:migrate`, never `d1 execute --file`: the latter
-- writes no d1_migrations row and the next apply re-runs this file.
CREATE TABLE IF NOT EXISTS client_owned_paths (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL UNIQUE,
  path_prefix TEXT NOT NULL DEFAULT '',
  note        TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
