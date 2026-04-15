-- Add client_note column to roadmap_items so clients can leave notes on tasks
ALTER TABLE roadmap_items ADD COLUMN client_note TEXT;
