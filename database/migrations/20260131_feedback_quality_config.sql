-- Feedback Quality Layer Configuration Migration
-- SD: SD-LEO-SELF-IMPROVE-001C (Phase 1: Data & Config Foundations)
-- Purpose: Create feedback_quality_config table and initial configuration entries
-- for the Feedback Quality Layer (sanitization, enhancement, quarantine)

-- Enable pgcrypto for gen_random_uuid() if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- feedback_quality_config - Configuration for feedback quality processing
-- =============================================================================

CREATE TABLE IF NOT EXISTS feedback_quality_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'system',

  -- Configuration versioning
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deprecated')),

  -- Thresholds
  threshold_low INT NOT NULL DEFAULT 30 CHECK (threshold_low BETWEEN 0 AND 100),
  quarantine_risk_threshold INT NOT NULL DEFAULT 70 CHECK (quarantine_risk_threshold BETWEEN 0 AND 100),
  quality_score_min INT NOT NULL DEFAULT 0 CHECK (quality_score_min BETWEEN 0 AND 100),
  quality_score_max INT NOT NULL DEFAULT 100 CHECK (quality_score_max BETWEEN 0 AND 100),

  -- Redaction configuration
  redaction_tokens JSONB NOT NULL DEFAULT '{
    "email": "[REDACTED_EMAIL]",
    "phone": "[REDACTED_PHONE]",
    "credit_card": "[REDACTED_CC]",
    "ssn": "[REDACTED_SSN]",
    "api_key": "[REDACTED_API_KEY]",
    "password": "[REDACTED_PASSWORD]",
    "jwt": "[REDACTED_JWT]",
    "ip_address": "[REDACTED_IP]",
    "prompt_injection": "[BLOCKED_INJECTION]"
  }'::jsonb,

  -- Sanitization patterns with severity levels
  sanitization_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Prompt injection patterns (high-risk)
  injection_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Scoring rubric weights (must sum to 1.0)
  scoring_weights JSONB NOT NULL DEFAULT '{
    "clarity": 0.25,
    "actionability": 0.25,
    "specificity": 0.20,
    "relevance": 0.15,
    "completeness": 0.15
  }'::jsonb,

  -- Enhancement rules
  enhancement_rules JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Feature flags
  enable_sanitization BOOLEAN NOT NULL DEFAULT true,
  enable_enhancement BOOLEAN NOT NULL DEFAULT true,
  enable_quarantine BOOLEAN NOT NULL DEFAULT true,
  enable_issue_patterns BOOLEAN NOT NULL DEFAULT true,
  enable_audit_logging BOOLEAN NOT NULL DEFAULT true,

  -- Processing configuration
  max_processing_time_ms INT NOT NULL DEFAULT 5000,
  max_retries INT NOT NULL DEFAULT 3,
  dlq_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  description TEXT NULL,

  CONSTRAINT uq_feedback_quality_config_version UNIQUE (version)
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION feedback_quality_config_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feedback_quality_config_update_timestamp ON feedback_quality_config;
CREATE TRIGGER trg_feedback_quality_config_update_timestamp
  BEFORE UPDATE ON feedback_quality_config
  FOR EACH ROW
  EXECUTE FUNCTION feedback_quality_config_update_timestamp();

-- Validate scoring weights sum to 1.0
CREATE OR REPLACE FUNCTION feedback_quality_config_validate()
RETURNS TRIGGER AS $$
DECLARE
  weight_sum NUMERIC;
  weight_value JSONB;
  weight_key TEXT;
BEGIN
  -- Validate scoring weights sum to 1.0
  weight_sum := 0;
  FOR weight_key, weight_value IN SELECT * FROM jsonb_each(NEW.scoring_weights)
  LOOP
    IF jsonb_typeof(weight_value) != 'number' THEN
      RAISE EXCEPTION 'invalid_scoring_weights: Weight for key % must be a number', weight_key;
    END IF;
    weight_sum := weight_sum + (weight_value::TEXT)::NUMERIC;
  END LOOP;

  IF ABS(weight_sum - 1.0) > 0.0001 THEN
    RAISE EXCEPTION 'invalid_scoring_weights: Weights must sum to 1.0 (got %)', weight_sum;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feedback_quality_config_validate ON feedback_quality_config;
CREATE TRIGGER trg_feedback_quality_config_validate
  BEFORE INSERT OR UPDATE ON feedback_quality_config
  FOR EACH ROW
  EXECUTE FUNCTION feedback_quality_config_validate();

-- Enable RLS
ALTER TABLE feedback_quality_config ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to feedback_quality_config"
  ON feedback_quality_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Anon can read active config
CREATE POLICY "Anon can read active feedback_quality_config"
  ON feedback_quality_config FOR SELECT
  USING (status = 'active');

-- Function to get active config
CREATE OR REPLACE FUNCTION get_active_feedback_quality_config()
RETURNS feedback_quality_config AS $$
DECLARE
  config_count INT;
  result feedback_quality_config;
BEGIN
  SELECT COUNT(*) INTO config_count FROM feedback_quality_config WHERE status = 'active';

  IF config_count = 0 THEN
    RAISE EXCEPTION 'no_active_feedback_quality_config: No active configuration found';
  END IF;

  IF config_count > 1 THEN
    RAISE EXCEPTION 'multiple_active_feedback_quality_config: Multiple active configurations found';
  END IF;

  SELECT * INTO result FROM feedback_quality_config WHERE status = 'active';
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Insert initial configuration with prompt injection patterns
-- =============================================================================

INSERT INTO feedback_quality_config (
  version,
  status,
  created_by,
  threshold_low,
  quarantine_risk_threshold,
  sanitization_patterns,
  injection_patterns,
  scoring_weights,
  enhancement_rules,
  description
) VALUES (
  1,
  'active',
  'SD-LEO-SELF-IMPROVE-001C',
  30,  -- Items below this score get enhancement
  70,  -- Items at or above this risk score get quarantined
  -- Sanitization patterns for PII (severity: low, medium, high)
  '[
    {"pattern": "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b", "type": "email", "severity": "medium", "action": "redact"},
    {"pattern": "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b", "type": "phone", "severity": "medium", "action": "redact"},
    {"pattern": "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b", "type": "credit_card", "severity": "high", "action": "redact"},
    {"pattern": "\\b\\d{3}[-]?\\d{2}[-]?\\d{4}\\b", "type": "ssn", "severity": "high", "action": "redact"},
    {"pattern": "\\b(sk|pk|api)[-_]?[a-zA-Z0-9]{20,}\\b", "type": "api_key", "severity": "high", "action": "redact"},
    {"pattern": "password\\s*[:=]\\s*[^\\s]+", "type": "password", "severity": "high", "action": "redact", "flags": "i"},
    {"pattern": "\\beyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b", "type": "jwt", "severity": "high", "action": "redact"},
    {"pattern": "\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b", "type": "ip_address", "severity": "low", "action": "redact"}
  ]'::jsonb,
  -- Prompt injection patterns (all high severity, trigger quarantine)
  '[
    {"pattern": "ignore (all )?(previous|prior|above) (instructions|prompts|rules)", "type": "ignore_instruction", "severity": "critical", "risk_score": 95},
    {"pattern": "disregard (your|all|any) (instructions|programming|rules)", "type": "ignore_instruction", "severity": "critical", "risk_score": 95},
    {"pattern": "forget (everything|all|your) (you|instructions|rules)", "type": "ignore_instruction", "severity": "critical", "risk_score": 95},
    {"pattern": "you are now (a |an |)?(different|new|unrestricted)", "type": "role_hijack", "severity": "critical", "risk_score": 90},
    {"pattern": "act as (a |an |)?(different|unrestricted|jailbroken)", "type": "role_hijack", "severity": "critical", "risk_score": 90},
    {"pattern": "pretend (to be|you are) (a |an |)?(different|unrestricted)", "type": "role_hijack", "severity": "critical", "risk_score": 90},
    {"pattern": "\\[system\\]|\\[INST\\]|<<SYS>>|<\\|im_start\\|>", "type": "system_prompt_injection", "severity": "critical", "risk_score": 100},
    {"pattern": "output (your|the) (system|initial|original) prompt", "type": "prompt_extraction", "severity": "critical", "risk_score": 85},
    {"pattern": "reveal (your|the) (instructions|system|prompt)", "type": "prompt_extraction", "severity": "critical", "risk_score": 85},
    {"pattern": "DAN|jailbreak|bypass (safety|content|filter)", "type": "jailbreak_attempt", "severity": "critical", "risk_score": 95},
    {"pattern": "sudo|admin mode|developer mode|god mode", "type": "privilege_escalation", "severity": "high", "risk_score": 80},
    {"pattern": "base64|hex|rot13|encode|decode.*instruction", "type": "obfuscation_attempt", "severity": "high", "risk_score": 75}
  ]'::jsonb,
  -- Scoring weights
  '{
    "clarity": 0.25,
    "actionability": 0.25,
    "specificity": 0.20,
    "relevance": 0.15,
    "completeness": 0.15
  }'::jsonb,
  -- Enhancement rules
  '[
    {"condition": "missing_context", "action": "add_context_prompt", "priority": 1},
    {"condition": "vague_description", "action": "specificity_enhancement", "priority": 2},
    {"condition": "missing_steps", "action": "add_reproduction_template", "priority": 3},
    {"condition": "no_expected_outcome", "action": "add_expected_outcome_prompt", "priority": 4}
  ]'::jsonb,
  'Initial Feedback Quality Layer configuration for SD-LEO-SELF-IMPROVE-001C Phase 1'
) ON CONFLICT (version) DO NOTHING;

-- =============================================================================
-- Add feature flags for Feedback Quality Layer
-- =============================================================================

-- Insert feature flags into leo_feature_flags (requires owner_user_id)
-- Using a placeholder UUID for system-created flags
DO $$
DECLARE
  system_user_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO leo_feature_flags (key, name, description, status, owner_user_id, owner_team, rollout_percentage)
  VALUES
    ('feedback_quality_sanitization', 'Feedback Sanitization', 'Enable PII redaction and sanitization in feedback processing', 'enabled', system_user_id, 'ehg_engineer', 100),
    ('feedback_quality_enhancement', 'Feedback Enhancement', 'Enable quality scoring and enhancement of low-quality feedback', 'enabled', system_user_id, 'ehg_engineer', 100),
    ('feedback_quality_quarantine', 'Feedback Quarantine', 'Enable quarantine of high-risk feedback (prompt injection, etc.)', 'enabled', system_user_id, 'ehg_engineer', 100),
    ('feedback_quality_issue_patterns', 'Issue Patterns Integration', 'Enable integration with issue_patterns for processed feedback', 'enabled', system_user_id, 'ehg_engineer', 100),
    ('feedback_quality_audit', 'Feedback Audit Trail', 'Enable full audit trail for feedback processing', 'enabled', system_user_id, 'ehg_engineer', 100)
  ON CONFLICT (key) DO NOTHING;
END $$;

-- =============================================================================
-- Completion marker
-- =============================================================================
COMMENT ON TABLE feedback_quality_config IS 'Configuration for Feedback Quality Layer. SD: SD-LEO-SELF-IMPROVE-001C';
