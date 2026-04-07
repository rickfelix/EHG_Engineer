-- SD-BRAINSTORM-TALLY-SCORING-ORCHESTRATOR-ORCH-001-B
-- Create brainstorm_vote_tallies table for append-only vote audit trail
-- Stores individual board seat votes with Borda scoring for brainstorm sessions

CREATE TABLE IF NOT EXISTS brainstorm_vote_tallies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_session_id UUID NOT NULL REFERENCES debate_sessions(id),
  seat_code TEXT NOT NULL CHECK (seat_code IN ('CSO', 'CRO', 'CTO', 'CISO', 'COO', 'CFO')),
  candidate_number INTEGER NOT NULL,
  rank_position INTEGER NOT NULL CHECK (rank_position BETWEEN 1 AND 3),
  borda_points INTEGER NOT NULL CHECK (borda_points BETWEEN 1 AND 3),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(debate_session_id, seat_code, rank_position)
);

-- RLS: service role only
ALTER TABLE brainstorm_vote_tallies ENABLE ROW LEVEL SECURITY;

-- Append-only enforcement: block UPDATE and DELETE
CREATE OR REPLACE FUNCTION enforce_brainstorm_vote_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'brainstorm_vote_tallies is append-only. UPDATE and DELETE are not permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_brainstorm_vote_append_only
  BEFORE UPDATE OR DELETE ON brainstorm_vote_tallies
  FOR EACH ROW
  EXECUTE FUNCTION enforce_brainstorm_vote_append_only();

-- Index for efficient lookups by debate session
CREATE INDEX idx_brainstorm_vote_tallies_session
  ON brainstorm_vote_tallies(debate_session_id);

COMMENT ON TABLE brainstorm_vote_tallies IS 'Append-only audit trail for brainstorm board seat votes with Borda scoring';
