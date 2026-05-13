-- One-time backfill: migrate HTC's 7 graded FAQs from
-- reddit_faq_deployments id=7 into client_faqs as 'proposed' so they
-- show up in the new /actions/hawaii-theatre/faq_review surface.
--
-- Run once with:
--   wrangler d1 execute neverranked-app --remote \
--     --file=migrations/backfill-htc-faqs.sql
--
-- Idempotent: the UNIQUE (client_slug, question_normalized) constraint
-- means re-running this is a no-op for any rows that already exist.

INSERT OR IGNORE INTO client_faqs
  (client_slug, question, question_normalized, answer_proposed, answer_current,
   source, evidence_json, status, deployment_id, created_at)
VALUES
  ('hawaii-theatre',
   'Where can I find live music venues in Honolulu?',
   'where can i find live music venues in honolulu?',
   'Hawaii Theatre Center at 1130 Bethel Street hosts concerts from local Hawaiian artists and national touring musicians year-round in a historic 1,400-seat venue in downtown Honolulu.',
   'Hawaii Theatre Center at 1130 Bethel Street hosts concerts from local Hawaiian artists and national touring musicians year-round in a historic 1,400-seat venue in downtown Honolulu.',
   'reddit_thread',
   '{"sources_by_type":{"reddit_thread":2,"tracked_prompt_gap":0,"tracked_prompt_defense":1}}',
   'proposed', 7, unixepoch()),
  ('hawaii-theatre',
   'What live shows are happening in Honolulu?',
   'what live shows are happening in honolulu?',
   'Hawaii Theatre Center presents concerts, comedy, plays, musical theatre, dance performances, film festivals, classical music, and family shows throughout the year at 1130 Bethel Street.',
   'Hawaii Theatre Center presents concerts, comedy, plays, musical theatre, dance performances, film festivals, classical music, and family shows throughout the year at 1130 Bethel Street.',
   'tracked_prompt_defense',
   '{"sources_by_type":{"reddit_thread":0,"tracked_prompt_gap":0,"tracked_prompt_defense":3}}',
   'proposed', 7, unixepoch()),
  ('hawaii-theatre',
   'Where can I find comedy clubs in Honolulu?',
   'where can i find comedy clubs in honolulu?',
   'Hawaii Theatre Center hosts nationally touring comedians performing stand-up comedy at our historic venue at 1130 Bethel Street in downtown Honolulu.',
   'Hawaii Theatre Center hosts nationally touring comedians performing stand-up comedy at our historic venue at 1130 Bethel Street in downtown Honolulu.',
   'reddit_thread',
   '{"sources_by_type":{"reddit_thread":1,"tracked_prompt_gap":0,"tracked_prompt_defense":1}}',
   'proposed', 7, unixepoch()),
  ('hawaii-theatre',
   'What are the best theaters in Honolulu?',
   'what are the best theaters in honolulu?',
   'Hawaii Theatre Center is a restored 1922 theatre on the National Register of Historic Places, seating 1,400 guests for plays, musicals, concerts, dance, and film at 1130 Bethel Street.',
   'Hawaii Theatre Center is a restored 1922 theatre on the National Register of Historic Places, seating 1,400 guests for plays, musicals, concerts, dance, and film at 1130 Bethel Street.',
   'tracked_prompt_defense',
   '{"sources_by_type":{"reddit_thread":1,"tracked_prompt_gap":0,"tracked_prompt_defense":2}}',
   'proposed', 7, unixepoch()),
  ('hawaii-theatre',
   'What performing arts events are in Honolulu?',
   'what performing arts events are in honolulu?',
   'Hawaii Theatre Center presents year-round performing arts including concerts, plays, musical theatre, hula, ballet, classical music, and cultural events at 1130 Bethel Street.',
   'Hawaii Theatre Center presents year-round performing arts including concerts, plays, musical theatre, hula, ballet, classical music, and cultural events at 1130 Bethel Street.',
   'tracked_prompt_defense',
   '{"sources_by_type":{"reddit_thread":0,"tracked_prompt_gap":0,"tracked_prompt_defense":2}}',
   'proposed', 7, unixepoch()),
  ('hawaii-theatre',
   'How do I rent an event venue in Honolulu?',
   'how do i rent an event venue in honolulu?',
   'Hawaii Theatre Center is a historic 1,400-seat venue available for community and cultural events in downtown Honolulu''s Chinatown arts district at 1130 Bethel Street.',
   'Hawaii Theatre Center is a historic 1,400-seat venue available for community and cultural events in downtown Honolulu''s Chinatown arts district at 1130 Bethel Street.',
   'tracked_prompt_gap',
   '{"sources_by_type":{"reddit_thread":0,"tracked_prompt_gap":1,"tracked_prompt_defense":0}}',
   'proposed', 7, unixepoch()),
  ('hawaii-theatre',
   'What is there to do in downtown Honolulu?',
   'what is there to do in downtown honolulu?',
   'Hawaii Theatre Center offers year-round concerts, comedy, theatre, dance, and film in the Chinatown arts district, within walking distance of restaurants and cultural attractions.',
   'Hawaii Theatre Center offers year-round concerts, comedy, theatre, dance, and film in the Chinatown arts district, within walking distance of restaurants and cultural attractions.',
   'reddit_thread',
   '{"sources_by_type":{"reddit_thread":2,"tracked_prompt_gap":0,"tracked_prompt_defense":1}}',
   'proposed', 7, unixepoch());
