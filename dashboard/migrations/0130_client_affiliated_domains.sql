-- A client's AFFILIATED sites: pages that belong to the client's group but are
-- not the client's own site. The case that prompted it (decided 2026-10-05): a
-- parent hotel group's page for the hotel. AI tools cite it, and until now it
-- was counted as an independent third-party source, put in the list of places
-- to "get listed", and offered in the memo's punch list.
--
-- Listed SEPARATELY (source type "affiliated", label "Your group's other
-- sites") and NEVER counted as the client's own site: not in own-site link
-- shares, venue share, own_site_pulls or site_in_sources. Never counted as a
-- competitor either, so do not mark a domain that also hosts competing
-- properties (an umbrella brand domain) without a path_prefix.
--
-- WHY A TABLE AND NOT A domains COLUMN. Every row in `domains` is seen by
-- code that reads is_competitor as a boolean (the competitor pages, share of
-- voice, scans, plan limits), so an "affiliated" value there would be shown
-- and scanned as a competitor. Nothing outside the readout snapshot and the
-- memo inputs reads this table. Its absence (before this migration is
-- applied) reads as "no affiliated domains", which changes nothing.
--
-- domain: bare host, no scheme, no www. Subdomains match.
-- path_prefix: '' for the whole domain, or a path such as '/hotels/example'
--   to mark only the pages under it. Matches the path itself and anything
--   below it, never a sibling ('/hotels/example' does not match
--   '/hotels/example-two').
--
-- Apply with `npm run db:migrate`, never `d1 execute --file`: the latter
-- writes no d1_migrations row and the next apply re-runs this file.
CREATE TABLE IF NOT EXISTS client_affiliated_domains (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL,
  domain      TEXT NOT NULL,
  path_prefix TEXT NOT NULL DEFAULT '',
  note        TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (client_slug, domain, path_prefix)
);
CREATE INDEX IF NOT EXISTS idx_client_affiliated_domains_slug
  ON client_affiliated_domains(client_slug, active);
