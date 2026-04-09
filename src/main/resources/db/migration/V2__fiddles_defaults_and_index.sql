-- Add server-side default for created_at so the DB handles it if the app omits it
ALTER TABLE fiddles ALTER COLUMN created_at SET DEFAULT now();

-- Index on created_at for potential time-based queries (recent fiddles, cleanup)
CREATE INDEX idx_fiddles_created_at ON fiddles (created_at);
