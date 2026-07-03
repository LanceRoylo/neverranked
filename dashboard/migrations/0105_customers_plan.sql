-- The standing engagement plan ("expectation ladder"), set at kickoff and
-- frozen: the customer-facing month-by-month map of what to expect when.
-- Rendered at /c/<slug>/plan/ and graded by each monthly readout.
ALTER TABLE customers ADD COLUMN plan_markdown TEXT;
ALTER TABLE customers ADD COLUMN plan_set_at INTEGER;
