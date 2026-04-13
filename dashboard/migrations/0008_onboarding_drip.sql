-- Track onboarding drip emails for new paying clients
ALTER TABLE users ADD COLUMN onboarding_drip_start INTEGER;
ALTER TABLE users ADD COLUMN onboarding_drip_day3 INTEGER;
ALTER TABLE users ADD COLUMN onboarding_drip_day7 INTEGER;
