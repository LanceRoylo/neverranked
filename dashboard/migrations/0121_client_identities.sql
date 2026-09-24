-- One business is many strings, and we were scoring only one of them.
--
-- Measured 2026-09-23 on prince-waikiki. The models name the hotel under the
-- identity it carried BEFORE its rebrand, and we recorded every one of those
-- as an absence:
--   Gemma  named "Prince Waikiki" 57 times, 52 of them pointing at
--          princehotel.com / princehotels.com. Scored: 4.
--   Claude named it once, as "Hawaii Prince Hotel Waikiki" on
--          hawaiiprincehotel.com. Scored: 0.
-- The matcher looked for princewaikiki.com and nothing else, so a model that
-- knows the hotel perfectly well under its former name reads as never having
-- heard of it.
--
-- Identity is therefore DATA, not a domain column: current names and domains,
-- the legacy ones the models still carry, and an explicit deny list, because
-- the first pass at this matched LIKE '%prince%' and swept in Princeville
-- Resort on Kauai, a different property on a different island.
--
-- status:
--   canonical  the identity in use today
--   legacy     formerly used by this business; a match is REAL but stale, and
--              the staleness is itself the finding
--   deny       looks like a match and is not one. Deny always wins.
CREATE TABLE IF NOT EXISTS client_identities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('domain','name')),
  value       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('canonical','legacy','deny')),
  note        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (client_slug, kind, value)
);
CREATE INDEX IF NOT EXISTS idx_client_identities_slug ON client_identities(client_slug, status);

INSERT OR IGNORE INTO client_identities (client_slug, kind, value, status, note) VALUES
  ('prince-waikiki','domain','princewaikiki.com','canonical','Current site.'),
  ('prince-waikiki','domain','hawaiiprincehotel.com','legacy','Pre-rebrand domain. Claude still returns this one.'),
  ('prince-waikiki','domain','princehotel.com','legacy','Parent-company domain. 2026-09: most of Gemma''s mentions point here.'),
  ('prince-waikiki','domain','princehotels.com','legacy','Parent-company plural variant, same source as princehotel.com.'),
  ('prince-waikiki','domain','princeresortshawaii.com','legacy','Parent-company portal; hosts Prince Waikiki fact sheets and collateral.'),
  ('prince-waikiki','name','Prince Waikiki','canonical','Current name.'),
  ('prince-waikiki','name','Prince Waikiki Hotel','canonical','Common variant with the category word attached.'),
  ('prince-waikiki','name','Hawaii Prince Hotel Waikiki','legacy','Pre-rebrand name. A model using this knows the hotel and has stale training data.'),
  ('prince-waikiki','name','Hawaii Prince Hotel','legacy','Shortened pre-rebrand name.'),
  -- Deny. Each of these survives a naive substring match on "prince".
  ('prince-waikiki','domain','princeville.com','deny','Princeville Resort is a different property on Kauai.'),
  ('prince-waikiki','name','Princeville','deny','Kauai resort and the town around it. Never this client.'),
  ('prince-waikiki','name','Princeville Resort Kauai','deny','Different property, different island.'),
  ('prince-waikiki','name','The Makai Club at Princeville','deny','Kauai, not Waikiki.'),
  -- DECLARED, not assumed: counting the golf club would raise this customer's
  -- delivered numbers, so it is a decision on the record rather than a quiet
  -- side effect of a substring match. Hawaii Prince Golf Club is affiliated
  -- with the hotel and is not the hotel. 2026-09: 17 Perplexity citations sat
  -- on this domain. Flip to 'legacy' only as a deliberate, dated change.
  ('prince-waikiki','domain','hawaiiprincegolf.com','deny','Affiliated golf club in Ewa Beach, a separate property from the Waikiki hotel.'),
  -- Aggregator subdomains carrying the client name. These are third-party
  -- listing pages ABOUT the client, which belong in off-site sources, not in
  -- owned citations.
  ('prince-waikiki','domain','princewaikiki.honoluluhhotel.com','deny','Third-party aggregator subdomain, not owned.'),
  ('prince-waikiki','domain','princewaikiki.honolulucityhotels.com','deny','Third-party aggregator subdomain, not owned.'),

  ('hawaii-theatre','domain','hawaiitheatre.com','canonical','Current site.'),
  ('hawaii-theatre','name','Hawaii Theatre Center','canonical','Full current name.'),
  ('hawaii-theatre','name','Hawaii Theatre','canonical','Short form in common use.');
