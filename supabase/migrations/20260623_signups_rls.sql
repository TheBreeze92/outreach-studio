-- Enable Row Level Security on the signups table.
-- The service role key (used in /api/subscribe) bypasses RLS by design.
-- The anon key (if ever exposed) can only insert — no reads, updates, or deletes.

ALTER TABLE signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_only"
  ON signups
  FOR INSERT
  TO anon
  WITH CHECK (true);
