-- Migration: Pattern Lifecycle Management
-- SD: SD-PATTERN-LIFECYCLE-001
-- Description: Lifecycle states and transition rules for patterns

-- ============================================
-- Add lifecycle columns to failure_patterns
-- ============================================
-- Note: lifecycle_status already exists in failure_patterns table from initial migration
-- This migration adds transition rules and deprecation tracking

-- ============================================
-- Table: pattern_lifecycle_rules
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_lifecycle_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Transition
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,

  -- Rule definition
  rule_name TEXT NOT NULL,
  rule_description TEXT,

  -- Conditions (JSONB for flexible evaluation)
  required_conditions JSONB DEFAULT '[]',
  -- Example: [{"type": "min_usage_days", "value": 30}, {"type": "approval_required", "approver_role": "lead"}]

  -- Validation
  is_automatic BOOLEAN DEFAULT FALSE,
  requires_approval BOOLEAN DEFAULT TRUE,
  approver_role TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(from_status, to_status)
);

-- ============================================
-- Table: pattern_deprecations
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_deprecations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  pattern_id VARCHAR(20) NOT NULL, -- References failure_patterns.pattern_id

  -- Deprecation details
  deprecated_at TIMESTAMPTZ DEFAULT NOW(),
  deprecated_by TEXT DEFAULT 'SYSTEM',
  reason TEXT NOT NULL,

  -- Replacement
  superseded_by VARCHAR(20), -- New pattern ID if applicable
  migration_notes TEXT,

  -- Grace period
  sunset_date TIMESTAMPTZ, -- When pattern will be archived

  -- Status tracking
  status VARCHAR(20) DEFAULT 'deprecated' CHECK (status IN ('deprecated', 'sunsetting', 'archived')),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deprecations_pattern ON pattern_deprecations(pattern_id);
CREATE INDEX IF NOT EXISTS idx_deprecations_status ON pattern_deprecations(status);
CREATE INDEX IF NOT EXISTS idx_deprecations_sunset ON pattern_deprecations(sunset_date);

-- ============================================
-- Seed: Lifecycle transition rules
-- ============================================
INSERT INTO pattern_lifecycle_rules (from_status, to_status, rule_name, rule_description, required_conditions, is_automatic, requires_approval)
VALUES
  ('draft', 'active', 'Activate Pattern', 'Move pattern from draft to active use', '[{"type": "has_prevention_measures"}, {"type": "has_detection_signals"}]', FALSE, TRUE),
  ('active', 'deprecated', 'Deprecate Pattern', 'Mark pattern as deprecated with optional replacement', '[{"type": "has_deprecation_reason"}]', FALSE, TRUE),
  ('deprecated', 'archived', 'Archive Pattern', 'Move deprecated pattern to archive after sunset period', '[{"type": "past_sunset_date"}]', TRUE, FALSE),
  ('deprecated', 'active', 'Reactivate Pattern', 'Restore deprecated pattern to active status', '[{"type": "lead_approval"}]', FALSE, TRUE),
  ('archived', 'active', 'Restore Archived', 'Restore archived pattern (exceptional cases)', '[{"type": "admin_approval"}]', FALSE, TRUE)
ON CONFLICT (from_status, to_status) DO UPDATE SET updated_at = NOW();

-- ============================================
-- Function: Validate lifecycle transition
-- ============================================
CREATE OR REPLACE FUNCTION validate_pattern_lifecycle_transition(
  p_pattern_id VARCHAR(20),
  p_new_status VARCHAR(20)
) RETURNS TABLE (
  is_valid BOOLEAN,
  message TEXT,
  required_conditions JSONB
) AS $$
DECLARE
  v_current_status VARCHAR(20);
  v_rule RECORD;
BEGIN
  -- Get current status
  SELECT lifecycle_status INTO v_current_status
  FROM failure_patterns
  WHERE pattern_id = p_pattern_id;

  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Pattern not found'::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  -- Check if transition is allowed
  SELECT * INTO v_rule
  FROM pattern_lifecycle_rules
  WHERE from_status = v_current_status
    AND to_status = p_new_status
    AND is_active = TRUE;

  IF v_rule IS NULL THEN
    RETURN QUERY SELECT FALSE,
      format('Transition from %s to %s is not allowed', v_current_status, p_new_status)::TEXT,
      NULL::JSONB;
    RETURN;
  END IF;

  -- Return valid with conditions
  RETURN QUERY SELECT TRUE,
    format('Transition allowed: %s', v_rule.rule_name)::TEXT,
    v_rule.required_conditions;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- View: Pattern lifecycle status
-- ============================================
CREATE OR REPLACE VIEW v_pattern_lifecycle_status AS
SELECT
  fp.pattern_id,
  fp.pattern_name,
  fp.status,
  fp.lifecycle_status,
  fp.occurrence_count,
  fp.last_seen_at,
  pd.deprecated_at,
  pd.reason AS deprecation_reason,
  pd.superseded_by,
  pd.sunset_date,
  CASE
    WHEN pd.sunset_date IS NOT NULL AND pd.sunset_date < NOW() THEN 'past_sunset'
    WHEN pd.sunset_date IS NOT NULL THEN 'sunsetting'
    WHEN fp.lifecycle_status = 'deprecated' THEN 'deprecated'
    WHEN fp.lifecycle_status = 'active' THEN 'active'
    ELSE fp.lifecycle_status
  END AS effective_status
FROM failure_patterns fp
LEFT JOIN pattern_deprecations pd ON pd.pattern_id = fp.pattern_id
ORDER BY fp.lifecycle_status, fp.pattern_id;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE pattern_lifecycle_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_deprecations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view lifecycle rules"
ON pattern_lifecycle_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages lifecycle rules"
ON pattern_lifecycle_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can view deprecations"
ON pattern_deprecations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create deprecations"
ON pattern_deprecations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Service role manages deprecations"
ON pattern_deprecations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON pattern_lifecycle_rules TO authenticated;
GRANT SELECT, INSERT ON pattern_deprecations TO authenticated;
GRANT SELECT ON v_pattern_lifecycle_status TO authenticated;
