-- Phase 3: RAG + Continuity
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- 
-- Prerequisites: pgvector extension must already be enabled.
-- (It was enabled in Phase 1 — verify via: SELECT * FROM pg_extension WHERE extname = 'vector';)

-- 1. Add the embedding column (1536 dims = gemini-embedding-001 with outputDimensionality:1536)
--    NOTE: The column may already exist as vector(1536) from the original schema.
--    If so, this is a no-op.
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 2. IVFFlat index for fast approximate cosine-distance search
CREATE INDEX IF NOT EXISTS journal_entries_embedding_idx
  ON journal_entries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- 3. RPC function used by the app to do similarity search
--    (avoids exposing raw vector operations to the anon key)
CREATE OR REPLACE FUNCTION match_journal_entries(
  p_user_id   uuid,
  p_embedding vector(1536),
  p_limit     int DEFAULT 3
)
RETURNS SETOF journal_entries
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM journal_entries
  WHERE user_id = p_user_id
    AND embedding IS NOT NULL
  ORDER BY embedding <=> p_embedding
  LIMIT p_limit;
$$;

-- Grant execute to authenticated users only
REVOKE EXECUTE ON FUNCTION match_journal_entries FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION match_journal_entries TO authenticated;
