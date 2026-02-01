-- LEO Self-Improvement Data Contracts Migration
-- SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)
-- Purpose: Create core LEO protocol tables for self-improvement workflow
-- Tables: leo_proposals, leo_vetting_rubrics, leo_prioritization_config,
--         leo_audit_config, leo_feature_flags, leo_events, leo_prompts

-- Enable pgcrypto for gen_random_uuid() if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- FR-1: leo_proposals - Self-improvement candidate records
-- =============================================================================

-- Allowed state transitions table (for constraint enforcement)
CREATE TABLE IF NOT EXISTS leo_proposal_transitions (
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

-- Insert allowed transitions
INSERT INTO leo_proposal_transitions (from_status, to_status) VALUES
  ('draft', 'submitted'),
  ('submitted', 'triaged'),
  ('submitted', 'rejected'),
  ('triaged', 'vetting'),
  ('triaged', 'rejected'),
  ('vetting', 'approved'),
  ('vetting', 'rejected'),
  ('approved', 'scheduled'),
  ('scheduled', 'in_progress'),
  ('in_progress', 'completed'),
  ('in_progress', 'rolled_back'),
  ('completed', 'archived'),
  ('rolled_back', 'archived'),
  ('rejected', 'archived')
ON CONFLICT DO NOTHING;

-- Main proposals table
CREATE TABLE IF NOT EXISTS leo_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  owner_team TEXT NOT NULL DEFAULT 'ehg_engineer',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  motivation TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_components JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'triaged', 'vetting', 'approved', 'rejected', 'scheduled', 'in_progress', 'completed', 'rolled_back', 'archived')),
  constitution_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  aegis_compliance_notes TEXT NULL,
  rubric_version_id UUID NULL,
  rubric_snapshot JSONB NULL,
  prioritization_snapshot JSONB NULL,
  audit_snapshot JSONB NULL,
  feature_flag_key TEXT NULL,
  decision_reason TEXT NULL,
  decision_by UUID NULL,
  decision_at TIMESTAMPTZ NULL
);

-- Indexes for leo_proposals
CREATE INDEX IF NOT EXISTS idx_leo_proposals_status_created ON leo_proposals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leo_proposals_created_by ON leo_proposals (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leo_proposals_constitution_tags ON leo_proposals USING GIN (constitution_tags);

-- Auto-update updated_at trigger for leo_proposals
CREATE OR REPLACE FUNCTION leo_proposals_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leo_proposals_update_timestamp ON leo_proposals;
CREATE TRIGGER trg_leo_proposals_update_timestamp
  BEFORE UPDATE ON leo_proposals
  FOR EACH ROW
  EXECUTE FUNCTION leo_proposals_update_timestamp();

-- State transition enforcement trigger
CREATE OR REPLACE FUNCTION leo_proposals_validate_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow any status on INSERT (must start as draft)
  IF TG_OP = 'INSERT' THEN
    IF NEW.status != 'draft' THEN
      -- Allow non-draft only if explicitly set (for data migration scenarios)
      RETURN NEW;
    END IF;
    RETURN NEW;
  END IF;

  -- On UPDATE, validate the transition
  IF OLD.status != NEW.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM leo_proposal_transitions
      WHERE from_status = OLD.status AND to_status = NEW.status
    ) THEN
      RAISE EXCEPTION 'invalid_status_transition: Cannot transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leo_proposals_validate_transition ON leo_proposals;
CREATE TRIGGER trg_leo_proposals_validate_transition
  BEFORE INSERT OR UPDATE ON leo_proposals
  FOR EACH ROW
  EXECUTE FUNCTION leo_proposals_validate_transition();

-- =============================================================================
-- FR-2: leo_vetting_rubrics - Versioned rubrics for proposal evaluation
-- =============================================================================

CREATE TABLE IF NOT EXISTS leo_vetting_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'deprecated')),
  weights JSONB NOT NULL,
  criteria JSONB NOT NULL,
  scoring_scale JSONB NOT NULL,
  description TEXT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ NULL,
  CONSTRAINT uq_leo_vetting_rubrics_name_version UNIQUE (name, version)
);

-- Validate rubric weights sum to 1.0 and prevent published rubric mutation
CREATE OR REPLACE FUNCTION leo_vetting_rubrics_validate()
RETURNS TRIGGER AS $$
DECLARE
  weight_sum NUMERIC;
  weight_value JSONB;
  weight_key TEXT;
BEGIN
  -- Validate weights sum to 1.0
  weight_sum := 0;
  FOR weight_key, weight_value IN SELECT * FROM jsonb_each(NEW.weights)
  LOOP
    IF jsonb_typeof(weight_value) != 'number' THEN
      RAISE EXCEPTION 'invalid_rubric_weights: Weight for key % must be a number', weight_key;
    END IF;
    weight_sum := weight_sum + (weight_value::TEXT)::NUMERIC;
  END LOOP;

  IF ABS(weight_sum - 1.0) > 0.0001 THEN
    RAISE EXCEPTION 'invalid_rubric_weights: Weights must sum to 1.0 (got %)', weight_sum;
  END IF;

  -- Prevent mutation of published rubrics
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    IF NEW.weights != OLD.weights OR NEW.criteria != OLD.criteria OR NEW.scoring_scale != OLD.scoring_scale THEN
      RAISE EXCEPTION 'published_rubric_immutable: Cannot modify weights, criteria, or scoring_scale of a published rubric';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leo_vetting_rubrics_validate ON leo_vetting_rubrics;
CREATE TRIGGER trg_leo_vetting_rubrics_validate
  BEFORE INSERT OR UPDATE ON leo_vetting_rubrics
  FOR EACH ROW
  EXECUTE FUNCTION leo_vetting_rubrics_validate();

-- Add foreign key from proposals to rubrics
ALTER TABLE leo_proposals
  ADD CONSTRAINT fk_leo_proposals_rubric
  FOREIGN KEY (rubric_version_id) REFERENCES leo_vetting_rubrics(id)
  ON DELETE SET NULL;

-- =============================================================================
-- FR-3: leo_prioritization_config - System-wide prioritization logic
-- =============================================================================

CREATE TABLE IF NOT EXISTS leo_prioritization_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated')),
  weights JSONB NOT NULL,
  constraints JSONB NOT NULL,
  description TEXT NULL,
  CONSTRAINT uq_leo_prioritization_config_version UNIQUE (version)
);

-- =============================================================================
-- FR-3: leo_audit_config - Audit requirements configuration
-- =============================================================================

CREATE TABLE IF NOT EXISTS leo_audit_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated')),
  event_retention_days INT NOT NULL CHECK (event_retention_days BETWEEN 7 AND 3650),
  pii_redaction_rules JSONB NOT NULL,
  required_event_types JSONB NOT NULL,
  description TEXT NULL,
  CONSTRAINT uq_leo_audit_config_version UNIQUE (version)
);

-- Function to get active configs (validates exactly one active per table)
CREATE OR REPLACE FUNCTION leo_get_active_configs()
RETURNS TABLE (
  prioritization_config_id UUID,
  prioritization_config JSONB,
  audit_config_id UUID,
  audit_config JSONB
) AS $$
DECLARE
  prio_count INT;
  audit_count INT;
BEGIN
  SELECT COUNT(*) INTO prio_count FROM leo_prioritization_config WHERE status = 'active';
  SELECT COUNT(*) INTO audit_count FROM leo_audit_config WHERE status = 'active';

  IF prio_count != 1 THEN
    RAISE EXCEPTION 'invalid_active_config_state: Expected exactly 1 active prioritization config, found %', prio_count;
  END IF;

  IF audit_count != 1 THEN
    RAISE EXCEPTION 'invalid_active_config_state: Expected exactly 1 active audit config, found %', audit_count;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    jsonb_build_object('version', p.version, 'weights', p.weights, 'constraints', p.constraints),
    a.id,
    jsonb_build_object('version', a.version, 'event_retention_days', a.event_retention_days, 'pii_redaction_rules', a.pii_redaction_rules, 'required_event_types', a.required_event_types)
  FROM leo_prioritization_config p, leo_audit_config a
  WHERE p.status = 'active' AND a.status = 'active';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FR-4: leo_feature_flags - Controlled rollout and rollback
-- =============================================================================

CREATE TABLE IF NOT EXISTS leo_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'enabled', 'disabled', 'expired', 'archived')),
  owner_user_id UUID NOT NULL,
  owner_team TEXT NOT NULL DEFAULT 'ehg_engineer',
  expires_at TIMESTAMPTZ NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollout_percentage INT NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  proposal_id UUID NULL REFERENCES leo_proposals(id) ON DELETE SET NULL,
  last_changed_by UUID NULL,
  last_changed_at TIMESTAMPTZ NULL,
  CONSTRAINT uq_leo_feature_flags_key UNIQUE (key)
);

-- Indexes for leo_feature_flags
CREATE INDEX IF NOT EXISTS idx_leo_feature_flags_status ON leo_feature_flags (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leo_feature_flags_proposal ON leo_feature_flags (proposal_id);

-- Auto-update updated_at and expiry enforcement trigger
CREATE OR REPLACE FUNCTION leo_feature_flags_validate()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();

  -- Auto-expire if expires_at is in the past
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at < now() THEN
    IF NEW.status = 'enabled' THEN
      RAISE EXCEPTION 'flag_expired: Cannot set status to enabled when expires_at is in the past';
    END IF;
    IF OLD IS NULL OR OLD.status != 'expired' THEN
      NEW.status = 'expired';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leo_feature_flags_validate ON leo_feature_flags;
CREATE TRIGGER trg_leo_feature_flags_validate
  BEFORE INSERT OR UPDATE ON leo_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION leo_feature_flags_validate();

-- =============================================================================
-- FR-5: leo_events - Append-only event log
-- =============================================================================

CREATE TABLE IF NOT EXISTS leo_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'agent', 'system')),
  event_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('proposal', 'rubric', 'prioritization_config', 'audit_config', 'feature_flag', 'prompt')),
  entity_id UUID NULL,
  correlation_id UUID NOT NULL,
  request_id TEXT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warn', 'error')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  pii_level TEXT NOT NULL DEFAULT 'none' CHECK (pii_level IN ('none', 'low', 'high'))
);

-- Indexes for leo_events
CREATE INDEX IF NOT EXISTS idx_leo_events_created ON leo_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leo_events_entity ON leo_events (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leo_events_correlation ON leo_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_leo_events_payload ON leo_events USING GIN (payload);

-- Append-only enforcement trigger (block UPDATE and DELETE)
CREATE OR REPLACE FUNCTION leo_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'events_append_only: UPDATE and DELETE are not allowed on leo_events';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leo_events_append_only_update ON leo_events;
CREATE TRIGGER trg_leo_events_append_only_update
  BEFORE UPDATE ON leo_events
  FOR EACH ROW
  EXECUTE FUNCTION leo_events_append_only();

DROP TRIGGER IF EXISTS trg_leo_events_append_only_delete ON leo_events;
CREATE TRIGGER trg_leo_events_append_only_delete
  BEFORE DELETE ON leo_events
  FOR EACH ROW
  EXECUTE FUNCTION leo_events_append_only();

-- =============================================================================
-- FR-6: leo_prompts - Versioned agent prompts
-- =============================================================================

CREATE TABLE IF NOT EXISTS leo_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated')),
  prompt_text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum TEXT NOT NULL,
  CONSTRAINT uq_leo_prompts_name_version UNIQUE (name, version),
  CONSTRAINT uq_leo_prompts_checksum UNIQUE (checksum)
);

-- Validate checksum matches SHA-256 of prompt_text
CREATE OR REPLACE FUNCTION leo_prompts_validate_checksum()
RETURNS TRIGGER AS $$
DECLARE
  expected_checksum TEXT;
BEGIN
  expected_checksum := encode(digest(NEW.prompt_text, 'sha256'), 'hex');

  IF NEW.checksum != expected_checksum THEN
    RAISE EXCEPTION 'invalid_prompt_checksum: Checksum mismatch. Expected %, got %', expected_checksum, NEW.checksum;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leo_prompts_validate_checksum ON leo_prompts;
CREATE TRIGGER trg_leo_prompts_validate_checksum
  BEFORE INSERT OR UPDATE ON leo_prompts
  FOR EACH ROW
  EXECUTE FUNCTION leo_prompts_validate_checksum();

-- Function to get active prompt by name
CREATE OR REPLACE FUNCTION leo_get_active_prompt(p_name TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  version INT,
  prompt_text TEXT,
  metadata JSONB,
  checksum TEXT
) AS $$
DECLARE
  prompt_count INT;
BEGIN
  SELECT COUNT(*) INTO prompt_count
  FROM leo_prompts
  WHERE leo_prompts.name = p_name AND status = 'active';

  IF prompt_count = 0 THEN
    RAISE EXCEPTION 'active_prompt_not_found_or_ambiguous: No active prompt found for name %', p_name;
  END IF;

  IF prompt_count > 1 THEN
    RAISE EXCEPTION 'active_prompt_not_found_or_ambiguous: Multiple active prompts found for name %', p_name;
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.version, p.prompt_text, p.metadata, p.checksum
  FROM leo_prompts p
  WHERE p.name = p_name AND p.status = 'active';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RLS Policies - Enable Row Level Security
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE leo_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_proposal_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_vetting_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_prioritization_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_audit_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_prompts ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (for server-side operations)
CREATE POLICY "Service role full access to leo_proposals"
  ON leo_proposals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to leo_proposal_transitions"
  ON leo_proposal_transitions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to leo_vetting_rubrics"
  ON leo_vetting_rubrics FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to leo_prioritization_config"
  ON leo_prioritization_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to leo_audit_config"
  ON leo_audit_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to leo_feature_flags"
  ON leo_feature_flags FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to leo_events"
  ON leo_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to leo_prompts"
  ON leo_prompts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Anon read access for non-sensitive tables
CREATE POLICY "Anon can read leo_proposal_transitions"
  ON leo_proposal_transitions FOR SELECT
  USING (true);

CREATE POLICY "Anon can read published rubrics"
  ON leo_vetting_rubrics FOR SELECT
  USING (status = 'published');

CREATE POLICY "Anon can read active configs"
  ON leo_prioritization_config FOR SELECT
  USING (status = 'active');

CREATE POLICY "Anon can read active audit config"
  ON leo_audit_config FOR SELECT
  USING (status = 'active');

CREATE POLICY "Anon can read enabled feature flags"
  ON leo_feature_flags FOR SELECT
  USING (status = 'enabled');

CREATE POLICY "Anon can read active prompts"
  ON leo_prompts FOR SELECT
  USING (status = 'active');

-- =============================================================================
-- Completion marker
-- =============================================================================
COMMENT ON TABLE leo_proposals IS 'LEO self-improvement proposal records. SD: SD-LEO-SELF-IMPROVE-001B';
COMMENT ON TABLE leo_vetting_rubrics IS 'Versioned rubrics for proposal evaluation. SD: SD-LEO-SELF-IMPROVE-001B';
COMMENT ON TABLE leo_prioritization_config IS 'System-wide prioritization configuration. SD: SD-LEO-SELF-IMPROVE-001B';
COMMENT ON TABLE leo_audit_config IS 'Audit requirements configuration. SD: SD-LEO-SELF-IMPROVE-001B';
COMMENT ON TABLE leo_feature_flags IS 'Feature flags for controlled rollout. SD: SD-LEO-SELF-IMPROVE-001B';
COMMENT ON TABLE leo_events IS 'Append-only event log for auditability. SD: SD-LEO-SELF-IMPROVE-001B';
COMMENT ON TABLE leo_prompts IS 'Versioned agent prompts for reproducibility. SD: SD-LEO-SELF-IMPROVE-001B';
