-- Migration Fix: Leo Feature Flags Foundation
-- Addresses: Column "flag_key" does not exist error
-- Strategy: DROP and recreate to ensure correct schema

-- =============================================================================
-- Drop existing tables if they exist with incorrect schema
-- =============================================================================

DROP TABLE IF EXISTS leo_feature_flag_audit_log CASCADE;
DROP TABLE IF EXISTS leo_feature_flag_policies CASCADE;
DROP TABLE IF EXISTS leo_kill_switches CASCADE;
DROP TABLE IF EXISTS leo_feature_flags CASCADE;

-- =============================================================================
-- Table: leo_feature_flags
-- Core feature flag definitions
-- =============================================================================

CREATE TABLE leo_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by flag_key
CREATE INDEX idx_leo_feature_flags_flag_key
  ON leo_feature_flags(flag_key);

COMMENT ON TABLE leo_feature_flags IS 'Feature flag definitions for LEO Protocol runtime control';
COMMENT ON COLUMN leo_feature_flags.flag_key IS 'Unique identifier used in code (e.g., quality_layer_sanitization)';
COMMENT ON COLUMN leo_feature_flags.is_enabled IS 'Global enable/disable toggle - if false, flag always evaluates to disabled';

-- =============================================================================
-- Table: leo_feature_flag_policies
-- Per-environment rollout policies
-- =============================================================================

CREATE TABLE leo_feature_flag_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id UUID NOT NULL REFERENCES leo_feature_flags(id) ON DELETE CASCADE,
  rollout_percentage INT NOT NULL DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  user_targeting JSONB NOT NULL DEFAULT '{}'::jsonb,
  environment TEXT NOT NULL DEFAULT 'production',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Only one policy per flag per environment
  UNIQUE(flag_id, environment)
);

-- Index for policy lookups
CREATE INDEX idx_leo_feature_flag_policies_flag_env
  ON leo_feature_flag_policies(flag_id, environment);

COMMENT ON TABLE leo_feature_flag_policies IS 'Per-environment rollout policies for feature flags';
COMMENT ON COLUMN leo_feature_flag_policies.rollout_percentage IS 'Percentage of users to enable (0-100). 100 = all users';
COMMENT ON COLUMN leo_feature_flag_policies.user_targeting IS 'JSON with allowlist/blocklist subject_ids for targeting';
COMMENT ON COLUMN leo_feature_flag_policies.environment IS 'Target environment (production, staging, development)';

-- =============================================================================
-- Table: leo_kill_switches
-- Emergency kill switches for global feature disablement
-- =============================================================================

CREATE TABLE leo_kill_switches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  activated_by TEXT,
  deactivated_at TIMESTAMPTZ,
  deactivated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE leo_kill_switches IS 'Emergency kill switches for instant global disablement';
COMMENT ON COLUMN leo_kill_switches.switch_key IS 'Kill switch identifier (e.g., CONST-009 for feature flags)';
COMMENT ON COLUMN leo_kill_switches.is_active IS 'When true, all associated features are disabled';

-- =============================================================================
-- Trigger: Auto-update updated_at timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to leo_feature_flags
DROP TRIGGER IF EXISTS set_updated_at_leo_feature_flags ON leo_feature_flags;
CREATE TRIGGER set_updated_at_leo_feature_flags
  BEFORE UPDATE ON leo_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Apply to leo_feature_flag_policies
DROP TRIGGER IF EXISTS set_updated_at_leo_feature_flag_policies ON leo_feature_flag_policies;
CREATE TRIGGER set_updated_at_leo_feature_flag_policies
  BEFORE UPDATE ON leo_feature_flag_policies
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Apply to leo_kill_switches
DROP TRIGGER IF EXISTS set_updated_at_leo_kill_switches ON leo_kill_switches;
CREATE TRIGGER set_updated_at_leo_kill_switches
  BEFORE UPDATE ON leo_kill_switches
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- Table: leo_feature_flag_audit_log
-- Audit trail for flag changes
-- =============================================================================

CREATE TABLE leo_feature_flag_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  changed_by TEXT,
  environment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leo_feature_flag_audit_log_flag_key
  ON leo_feature_flag_audit_log(flag_key, created_at DESC);

CREATE INDEX idx_leo_feature_flag_audit_log_created_at
  ON leo_feature_flag_audit_log(created_at DESC);

COMMENT ON TABLE leo_feature_flag_audit_log IS 'Audit trail for all feature flag operations';

-- =============================================================================
-- Seed initial feature flags for Phase 1 quality layer
-- =============================================================================

INSERT INTO leo_feature_flags (flag_key, display_name, description, is_enabled)
VALUES
  ('quality_layer_sanitization', 'Quality Layer: Sanitization', 'Controls PII redaction and prompt injection detection in feedback processing', true),
  ('quality_layer_quarantine', 'Quality Layer: Quarantine', 'Controls risk-based quarantine of potentially harmful feedback', true),
  ('quality_layer_audit_logging', 'Quality Layer: Audit Logging', 'Controls audit trail generation for feedback processing', true),
  ('quality_layer_enhancement', 'Quality Layer: Enhancement', 'Controls automatic feedback enhancement suggestions', true);

-- Create default policies for production environment
INSERT INTO leo_feature_flag_policies (flag_id, rollout_percentage, environment, user_targeting)
SELECT id, 100, 'production', '{"allowlist": {"subject_ids": []}, "blocklist": {"subject_ids": []}}'::jsonb
FROM leo_feature_flags
WHERE flag_key IN ('quality_layer_sanitization', 'quality_layer_quarantine', 'quality_layer_audit_logging', 'quality_layer_enhancement');

-- Insert CONST-009 kill switch
INSERT INTO leo_kill_switches (switch_key, display_name, description, is_active)
VALUES (
  'CONST-009',
  'Feature Flag Kill Switch',
  'When active, all feature flags evaluate to disabled regardless of their configured state. Use for emergency rollback.',
  false
);

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON leo_feature_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON leo_feature_flag_policies TO authenticated;
GRANT SELECT, UPDATE ON leo_kill_switches TO authenticated;
GRANT SELECT, INSERT ON leo_feature_flag_audit_log TO authenticated;

-- Service role has full access
GRANT ALL ON leo_feature_flags TO service_role;
GRANT ALL ON leo_feature_flag_policies TO service_role;
GRANT ALL ON leo_kill_switches TO service_role;
GRANT ALL ON leo_feature_flag_audit_log TO service_role;
