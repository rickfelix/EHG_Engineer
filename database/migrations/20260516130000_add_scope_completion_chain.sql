-- Sibling A FR-A-1: scope_completion_chain table (ADDITIVE-ONLY)
-- Tracks expected-vs-actual completion chain for SDs/handoffs/orchestrator children.
-- Ordinal 20260516130000 strictly > Child 0 ordinals 20260516120000/120001 (in main).

CREATE TABLE IF NOT EXISTS scope_completion_chain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  expected_phase TEXT,
  actual_phase TEXT,
  expected_completion_at TIMESTAMPTZ,
  actual_completion_at TIMESTAMPTZ,
  chain_status TEXT NOT NULL DEFAULT 'in_progress',
  correlation_id UUID,
  smoke_test_passed_at TIMESTAMPTZ,
  runtime_observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scope_completion_chain_entity_type_check'
  ) THEN
    ALTER TABLE scope_completion_chain
      ADD CONSTRAINT scope_completion_chain_entity_type_check
      CHECK (entity_type IN ('sd', 'handoff', 'phase', 'child_sd'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scope_completion_chain_chain_status_check'
  ) THEN
    ALTER TABLE scope_completion_chain
      ADD CONSTRAINT scope_completion_chain_chain_status_check
      CHECK (chain_status IN ('in_progress', 'completed', 'abandoned', 'superseded'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scope_completion_chain_entity ON scope_completion_chain (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_scope_completion_chain_status ON scope_completion_chain (chain_status);
CREATE INDEX IF NOT EXISTS idx_scope_completion_chain_correlation ON scope_completion_chain (correlation_id);
CREATE INDEX IF NOT EXISTS idx_scope_completion_chain_created ON scope_completion_chain (created_at DESC);

COMMENT ON TABLE scope_completion_chain IS 'Sibling A (SD-WRITERCONSUMER-...-001-A) — tracks expected-vs-actual completion chain for SDs/handoffs/phases/child_sd entities. Writer-consumer asymmetry instrumentation.';
