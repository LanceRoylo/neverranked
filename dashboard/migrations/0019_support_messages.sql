-- Support messages from the client dashboard contact form
CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  client_slug TEXT,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_messages_user ON support_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created ON support_messages(created_at DESC);
