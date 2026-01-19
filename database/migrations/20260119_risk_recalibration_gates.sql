-- ============================================================================
-- Risk Re-calibration Protocol - Phase Boundary Gates
-- SD-LIFECYCLE-GAP-005: Strategic Risk Forecasting
-- ============================================================================
-- Implements:
--   FR-1: Risk re-calibration gates at phase boundaries (Gates 3, 4, 5, 6)
--   FR-2: Risk categories (market, technical, financial, operational)
--   FR-3: Risk levels (CRITICAL, HIGH, MEDIUM, LOW)
--   FR-4: Delta tracking (↓, →, ↑, ★, ✓)
--   FR-5: Escalation triggers and chairman review requirements
--   FR-6: Integration with LEO Protocol phase transitions
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. RISK RE-CALIBRATION FORMS (per gate, per venture)
-- ============================================================================

CREATE TABLE IF NOT EXISTS risk_recalibration_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  gate_number INT NOT NULL CHECK (gate_number IN (3, 4, 5, 6)),

  -- Gate context
  from_phase VARCHAR(50) NOT NULL CHECK (from_phase IN ('IDEATION', 'VALIDATION', 'DEVELOPMENT', 'SCALING')),
  to_phase VARCHAR(50) NOT NULL CHECK (to_phase IN ('VALIDATION', 'DEVELOPMENT', 'SCALING', 'EXIT')),

  -- Assessment metadata
  assessment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessor_type VARCHAR(20) NOT NULL CHECK (assessor_type IN ('LEO', 'CHAIRMAN', 'HUMAN')),
  assessor_id UUID REFERENCES auth.users(id),

  -- Previous assessment reference (for delta calculation)
  previous_assessment_id UUID REFERENCES risk_recalibration_forms(id),
  previous_assessment_date TIMESTAMPTZ,

  -- Risk assessments by category
  market_risk_previous VARCHAR(20) CHECK (market_risk_previous IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'N/A')),
  market_risk_current VARCHAR(20) NOT NULL CHECK (market_risk_current IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  market_risk_delta VARCHAR(10) NOT NULL CHECK (market_risk_delta IN ('IMPROVED', 'STABLE', 'DEGRADED', 'NEW', 'RESOLVED')),
  market_risk_justification TEXT,
  market_risk_mitigations JSONB DEFAULT '[]'::JSONB,

  technical_risk_previous VARCHAR(20) CHECK (technical_risk_previous IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'N/A')),
  technical_risk_current VARCHAR(20) NOT NULL CHECK (technical_risk_current IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  technical_risk_delta VARCHAR(10) NOT NULL CHECK (technical_risk_delta IN ('IMPROVED', 'STABLE', 'DEGRADED', 'NEW', 'RESOLVED')),
  technical_risk_justification TEXT,
  technical_risk_mitigations JSONB DEFAULT '[]'::JSONB,

  financial_risk_previous VARCHAR(20) CHECK (financial_risk_previous IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'N/A')),
  financial_risk_current VARCHAR(20) NOT NULL CHECK (financial_risk_current IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  financial_risk_delta VARCHAR(10) NOT NULL CHECK (financial_risk_delta IN ('IMPROVED', 'STABLE', 'DEGRADED', 'NEW', 'RESOLVED')),
  financial_risk_justification TEXT,
  financial_risk_mitigations JSONB DEFAULT '[]'::JSONB,

  operational_risk_previous VARCHAR(20) CHECK (operational_risk_previous IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'N/A')),
  operational_risk_current VARCHAR(20) NOT NULL CHECK (operational_risk_current IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  operational_risk_delta VARCHAR(10) NOT NULL CHECK (operational_risk_delta IN ('IMPROVED', 'STABLE', 'DEGRADED', 'NEW', 'RESOLVED')),
  operational_risk_justification TEXT,
  operational_risk_mitigations JSONB DEFAULT '[]'::JSONB,

  -- New and resolved risks
  new_risks JSONB DEFAULT '[]'::JSONB, -- [{category, level, description, mitigations}]
  resolved_risks JSONB DEFAULT '[]'::JSONB, -- [{category, previous_level, resolution_notes}]

  -- Overall assessment
  risk_trajectory VARCHAR(20) NOT NULL CHECK (risk_trajectory IN ('IMPROVING', 'STABLE', 'DEGRADING')),
  blocking_risks BOOLEAN NOT NULL DEFAULT FALSE,
  chairman_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  go_decision VARCHAR(20) NOT NULL CHECK (go_decision IN ('GO', 'NO_GO', 'CONDITIONAL')),
  conditions JSONB DEFAULT '[]'::JSONB, -- Array of conditions for CONDITIONAL decision

  -- Approval workflow
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED')),
  approved_by UUID REFERENCES auth.users(id),
  approval_date TIMESTAMPTZ,
  approval_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one form per gate per venture
  UNIQUE(venture_id, gate_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_risk_recal_venture ON risk_recalibration_forms(venture_id);
CREATE INDEX IF NOT EXISTS idx_risk_recal_gate ON risk_recalibration_forms(gate_number);
CREATE INDEX IF NOT EXISTS idx_risk_recal_status ON risk_recalibration_forms(status);
CREATE INDEX IF NOT EXISTS idx_risk_recal_decision ON risk_recalibration_forms(go_decision);
CREATE INDEX IF NOT EXISTS idx_risk_recal_chairman_review ON risk_recalibration_forms(chairman_review_required) WHERE chairman_review_required = TRUE;

COMMENT ON TABLE risk_recalibration_forms IS 'SD-LIFECYCLE-GAP-005: Risk re-calibration forms at phase boundary gates (Gates 3, 4, 5, 6)';
COMMENT ON COLUMN risk_recalibration_forms.gate_number IS 'Gate 3: Ideation→Validation, Gate 4: Validation→Development, Gate 5: Development→Scaling, Gate 6: Scaling→Exit';
COMMENT ON COLUMN risk_recalibration_forms.market_risk_delta IS 'IMPROVED (↓), STABLE (→), DEGRADED (↑), NEW (★), RESOLVED (✓)';
COMMENT ON COLUMN risk_recalibration_forms.blocking_risks IS 'TRUE if any CRITICAL risks exist without Chairman approval';
COMMENT ON COLUMN risk_recalibration_forms.chairman_review_required IS 'TRUE if any CRITICAL risk or 2+ HIGH risks';

-- ============================================================================
-- 2. RISK ESCALATION LOG (audit trail for escalations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS risk_escalation_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  risk_form_id UUID NOT NULL REFERENCES risk_recalibration_forms(id) ON DELETE CASCADE,
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,

  -- Escalation metadata
  escalation_type VARCHAR(30) NOT NULL CHECK (escalation_type IN (
    'CRITICAL_RISK',
    'MULTIPLE_HIGH_RISKS',
    'CONSECUTIVE_DEGRADATION',
    'NEW_CRITICAL_RISK',
    'MANUAL_ESCALATION'
  )),
  escalation_reason TEXT NOT NULL,
  risk_category VARCHAR(20) CHECK (risk_category IN ('MARKET', 'TECHNICAL', 'FINANCIAL', 'OPERATIONAL')),
  risk_level VARCHAR(20) CHECK (risk_level IN ('CRITICAL', 'HIGH')),

  -- Response tracking
  escalated_to VARCHAR(20) NOT NULL CHECK (escalated_to IN ('CHAIRMAN', 'EVA', 'CHAIRMAN_AND_EVA')),
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_time_hours DECIMAL(6,2),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_risk_escalation_form ON risk_escalation_log(risk_form_id);
CREATE INDEX IF NOT EXISTS idx_risk_escalation_venture ON risk_escalation_log(venture_id);
CREATE INDEX IF NOT EXISTS idx_risk_escalation_type ON risk_escalation_log(escalation_type);
CREATE INDEX IF NOT EXISTS idx_risk_escalation_unresolved ON risk_escalation_log(resolved_at) WHERE resolved_at IS NULL;

COMMENT ON TABLE risk_escalation_log IS 'SD-LIFECYCLE-GAP-005: Audit trail for risk escalations requiring chairman/EVA review';
COMMENT ON COLUMN risk_escalation_log.response_time_hours IS 'Time from escalation to resolution. Target: <4hrs for CRITICAL, <24hrs for HIGH';

-- ============================================================================
-- 3. GATE PASSAGE LOG (tracks when ventures pass/fail gates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS risk_gate_passage_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  gate_number INT NOT NULL CHECK (gate_number IN (3, 4, 5, 6)),
  risk_form_id UUID NOT NULL REFERENCES risk_recalibration_forms(id),

  -- Passage outcome
  passed BOOLEAN NOT NULL,
  blocked_reason TEXT,

  -- Risk summary at passage time
  critical_risks_count INT NOT NULL DEFAULT 0,
  high_risks_count INT NOT NULL DEFAULT 0,
  medium_risks_count INT NOT NULL DEFAULT 0,
  low_risks_count INT NOT NULL DEFAULT 0,

  -- Timestamps
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  passed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_risk_gate_passage_venture ON risk_gate_passage_log(venture_id);
CREATE INDEX IF NOT EXISTS idx_risk_gate_passage_gate ON risk_gate_passage_log(gate_number);
CREATE INDEX IF NOT EXISTS idx_risk_gate_passage_outcome ON risk_gate_passage_log(passed);

COMMENT ON TABLE risk_gate_passage_log IS 'SD-LIFECYCLE-GAP-005: Tracks gate passage attempts and outcomes with risk summary';

-- ============================================================================
-- 4. FUNCTION: Evaluate Risk Re-calibration Gate
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_evaluate_risk_recalibration_gate(
  p_venture_id UUID,
  p_gate_number INT
)
RETURNS JSONB AS $$
DECLARE
  v_form_record RECORD;
  v_critical_count INT := 0;
  v_high_count INT := 0;
  v_medium_count INT := 0;
  v_low_count INT := 0;
  v_outcome VARCHAR(20);
  v_blocking_reason TEXT;
BEGIN
  -- Fetch the risk form
  SELECT * INTO v_form_record
  FROM risk_recalibration_forms
  WHERE venture_id = p_venture_id
    AND gate_number = p_gate_number
  LIMIT 1;

  -- If no form exists, gate fails
  IF v_form_record IS NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'FAIL',
      'reason', 'Risk re-calibration form not submitted',
      'blocking_risks', true
    );
  END IF;

  -- Count risk levels
  IF v_form_record.market_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;
  IF v_form_record.market_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;
  IF v_form_record.market_risk_current = 'MEDIUM' THEN v_medium_count := v_medium_count + 1; END IF;
  IF v_form_record.market_risk_current = 'LOW' THEN v_low_count := v_low_count + 1; END IF;

  IF v_form_record.technical_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;
  IF v_form_record.technical_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;
  IF v_form_record.technical_risk_current = 'MEDIUM' THEN v_medium_count := v_medium_count + 1; END IF;
  IF v_form_record.technical_risk_current = 'LOW' THEN v_low_count := v_low_count + 1; END IF;

  IF v_form_record.financial_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;
  IF v_form_record.financial_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;
  IF v_form_record.financial_risk_current = 'MEDIUM' THEN v_medium_count := v_medium_count + 1; END IF;
  IF v_form_record.financial_risk_current = 'LOW' THEN v_low_count := v_low_count + 1; END IF;

  IF v_form_record.operational_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;
  IF v_form_record.operational_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;
  IF v_form_record.operational_risk_current = 'MEDIUM' THEN v_medium_count := v_medium_count + 1; END IF;
  IF v_form_record.operational_risk_current = 'LOW' THEN v_low_count := v_low_count + 1; END IF;

  -- Evaluate blocking conditions
  IF v_critical_count > 0 AND v_form_record.approved_by IS NULL THEN
    v_outcome := 'FAIL';
    v_blocking_reason := format('%s CRITICAL risk(s) without Chairman approval', v_critical_count);
  ELSIF v_high_count >= 2 AND v_form_record.chairman_review_required = TRUE AND v_form_record.approved_by IS NULL THEN
    v_outcome := 'FAIL';
    v_blocking_reason := format('%s HIGH risk(s) require Chairman review', v_high_count);
  ELSIF v_form_record.go_decision = 'NO_GO' THEN
    v_outcome := 'FAIL';
    v_blocking_reason := 'Risk assessment decision: NO_GO';
  ELSIF v_form_record.go_decision = 'CONDITIONAL' AND (v_form_record.conditions IS NULL OR jsonb_array_length(v_form_record.conditions) = 0) THEN
    v_outcome := 'FAIL';
    v_blocking_reason := 'CONDITIONAL decision without specified conditions';
  ELSE
    v_outcome := 'PASS';
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'reason', v_blocking_reason,
    'critical_risks', v_critical_count,
    'high_risks', v_high_count,
    'medium_risks', v_medium_count,
    'low_risks', v_low_count,
    'form_id', v_form_record.id,
    'go_decision', v_form_record.go_decision,
    'risk_trajectory', v_form_record.risk_trajectory,
    'chairman_approved', (v_form_record.approved_by IS NOT NULL)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_evaluate_risk_recalibration_gate IS 'SD-LIFECYCLE-GAP-005: Evaluates if venture can pass risk gate based on risk levels and approval status';

-- ============================================================================
-- 5. FUNCTION: Check Escalation Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_check_risk_escalation_triggers(
  p_risk_form_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_form_record RECORD;
  v_escalations JSONB := '[]'::JSONB;
  v_critical_count INT := 0;
  v_high_count INT := 0;
BEGIN
  -- Fetch the risk form
  SELECT * INTO v_form_record
  FROM risk_recalibration_forms
  WHERE id = p_risk_form_id;

  IF v_form_record IS NULL THEN
    RETURN jsonb_build_object('error', 'Risk form not found');
  END IF;

  -- Count CRITICAL and HIGH risks
  IF v_form_record.market_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;
  IF v_form_record.technical_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;
  IF v_form_record.financial_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;
  IF v_form_record.operational_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;

  IF v_form_record.market_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;
  IF v_form_record.technical_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;
  IF v_form_record.financial_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;
  IF v_form_record.operational_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;

  -- Trigger 1: Any CRITICAL risk
  IF v_critical_count > 0 THEN
    v_escalations := v_escalations || jsonb_build_object(
      'type', 'CRITICAL_RISK',
      'reason', format('%s CRITICAL risk(s) identified', v_critical_count),
      'requires_review', 'CHAIRMAN_AND_EVA',
      'response_time_target', '4 hours'
    );
  END IF;

  -- Trigger 2: Two or more HIGH risks
  IF v_high_count >= 2 THEN
    v_escalations := v_escalations || jsonb_build_object(
      'type', 'MULTIPLE_HIGH_RISKS',
      'reason', format('%s HIGH risk(s) identified', v_high_count),
      'requires_review', 'CHAIRMAN',
      'response_time_target', '24 hours'
    );
  END IF;

  -- Trigger 3: Risk degradation in multiple categories
  DECLARE
    v_degraded_count INT := 0;
  BEGIN
    IF v_form_record.market_risk_delta = 'DEGRADED' THEN v_degraded_count := v_degraded_count + 1; END IF;
    IF v_form_record.technical_risk_delta = 'DEGRADED' THEN v_degraded_count := v_degraded_count + 1; END IF;
    IF v_form_record.financial_risk_delta = 'DEGRADED' THEN v_degraded_count := v_degraded_count + 1; END IF;
    IF v_form_record.operational_risk_delta = 'DEGRADED' THEN v_degraded_count := v_degraded_count + 1; END IF;

    IF v_degraded_count >= 2 THEN
      v_escalations := v_escalations || jsonb_build_object(
        'type', 'CONSECUTIVE_DEGRADATION',
        'reason', format('%s risk categories degraded since last review', v_degraded_count),
        'requires_review', 'CHAIRMAN',
        'response_time_target', '24 hours'
      );
    END IF;
  END;

  -- Trigger 4: New CRITICAL risk identified
  IF v_critical_count > 0 THEN
    DECLARE
      v_new_critical_count INT := 0;
    BEGIN
      IF v_form_record.market_risk_current = 'CRITICAL' AND v_form_record.market_risk_delta = 'NEW' THEN v_new_critical_count := v_new_critical_count + 1; END IF;
      IF v_form_record.technical_risk_current = 'CRITICAL' AND v_form_record.technical_risk_delta = 'NEW' THEN v_new_critical_count := v_new_critical_count + 1; END IF;
      IF v_form_record.financial_risk_current = 'CRITICAL' AND v_form_record.financial_risk_delta = 'NEW' THEN v_new_critical_count := v_new_critical_count + 1; END IF;
      IF v_form_record.operational_risk_current = 'CRITICAL' AND v_form_record.operational_risk_delta = 'NEW' THEN v_new_critical_count := v_new_critical_count + 1; END IF;

      IF v_new_critical_count > 0 THEN
        v_escalations := v_escalations || jsonb_build_object(
          'type', 'NEW_CRITICAL_RISK',
          'reason', format('%s new CRITICAL risk(s) identified', v_new_critical_count),
          'requires_review', 'CHAIRMAN_AND_EVA',
          'response_time_target', '4 hours'
        );
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object(
    'escalations_required', jsonb_array_length(v_escalations) > 0,
    'escalations', v_escalations,
    'critical_risks', v_critical_count,
    'high_risks', v_high_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_check_risk_escalation_triggers IS 'SD-LIFECYCLE-GAP-005: Checks if risk assessment triggers escalation requirements';

-- ============================================================================
-- 6. FUNCTION: Record Gate Passage
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_record_risk_gate_passage(
  p_venture_id UUID,
  p_gate_number INT,
  p_passed BOOLEAN,
  p_blocked_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_risk_form_id UUID;
  v_gate_result JSONB;
  v_passage_id UUID;
BEGIN
  -- Get the risk form ID
  SELECT id INTO v_risk_form_id
  FROM risk_recalibration_forms
  WHERE venture_id = p_venture_id
    AND gate_number = p_gate_number
  LIMIT 1;

  IF v_risk_form_id IS NULL THEN
    RAISE EXCEPTION 'Risk form not found for venture % gate %', p_venture_id, p_gate_number;
  END IF;

  -- Evaluate the gate
  v_gate_result := fn_evaluate_risk_recalibration_gate(p_venture_id, p_gate_number);

  -- Insert passage log
  INSERT INTO risk_gate_passage_log (
    venture_id,
    gate_number,
    risk_form_id,
    passed,
    blocked_reason,
    critical_risks_count,
    high_risks_count,
    medium_risks_count,
    low_risks_count,
    passed_at
  ) VALUES (
    p_venture_id,
    p_gate_number,
    v_risk_form_id,
    p_passed,
    COALESCE(p_blocked_reason, v_gate_result->>'reason'),
    (v_gate_result->>'critical_risks')::INT,
    (v_gate_result->>'high_risks')::INT,
    (v_gate_result->>'medium_risks')::INT,
    (v_gate_result->>'low_risks')::INT,
    CASE WHEN p_passed THEN NOW() ELSE NULL END
  ) RETURNING id INTO v_passage_id;

  RETURN v_passage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_record_risk_gate_passage IS 'SD-LIFECYCLE-GAP-005: Records gate passage attempt with outcome and risk summary';

-- ============================================================================
-- 7. TRIGGER: Auto-update chairman_review_required flag
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_update_risk_form_chairman_flag()
RETURNS TRIGGER AS $$
DECLARE
  v_critical_count INT := 0;
  v_high_count INT := 0;
BEGIN
  -- Count CRITICAL and HIGH risks
  IF NEW.market_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;
  IF NEW.technical_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;
  IF NEW.financial_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;
  IF NEW.operational_risk_current = 'CRITICAL' THEN v_critical_count := v_critical_count + 1; END IF;

  IF NEW.market_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;
  IF NEW.technical_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;
  IF NEW.financial_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;
  IF NEW.operational_risk_current = 'HIGH' THEN v_high_count := v_high_count + 1; END IF;

  -- Set chairman_review_required flag
  IF v_critical_count > 0 OR v_high_count >= 2 THEN
    NEW.chairman_review_required := TRUE;
  ELSE
    NEW.chairman_review_required := FALSE;
  END IF;

  -- Set blocking_risks flag
  IF v_critical_count > 0 THEN
    NEW.blocking_risks := TRUE;
  ELSE
    NEW.blocking_risks := FALSE;
  END IF;

  -- Update timestamp
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_risk_form_chairman_flag ON risk_recalibration_forms;

CREATE TRIGGER trg_update_risk_form_chairman_flag
  BEFORE INSERT OR UPDATE ON risk_recalibration_forms
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_risk_form_chairman_flag();

COMMENT ON FUNCTION fn_update_risk_form_chairman_flag IS 'SD-LIFECYCLE-GAP-005: Auto-updates chairman_review_required and blocking_risks flags based on risk levels';

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE risk_recalibration_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_escalation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_gate_passage_log ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on risk_recalibration_forms"
ON risk_recalibration_forms
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on risk_escalation_log"
ON risk_escalation_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on risk_gate_passage_log"
ON risk_gate_passage_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can read their ventures' risk data
CREATE POLICY "Authenticated users can read risk forms"
ON risk_recalibration_forms
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read risk escalations"
ON risk_escalation_log
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read gate passages"
ON risk_gate_passage_log
FOR SELECT
TO authenticated
USING (true);

-- ============================================================================
-- 9. VIEW: Risk Gate Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW v_risk_gate_dashboard AS
SELECT
  v.id AS venture_id,
  v.name AS venture_name,
  v.current_lifecycle_stage,

  -- Gate 3 status
  rrf3.id AS gate3_form_id,
  rrf3.go_decision AS gate3_decision,
  rrf3.status AS gate3_status,
  rrf3.chairman_review_required AS gate3_chairman_review,
  rgl3.passed AS gate3_passed,

  -- Gate 4 status
  rrf4.id AS gate4_form_id,
  rrf4.go_decision AS gate4_decision,
  rrf4.status AS gate4_status,
  rrf4.chairman_review_required AS gate4_chairman_review,
  rgl4.passed AS gate4_passed,

  -- Gate 5 status
  rrf5.id AS gate5_form_id,
  rrf5.go_decision AS gate5_decision,
  rrf5.status AS gate5_status,
  rrf5.chairman_review_required AS gate5_chairman_review,
  rgl5.passed AS gate5_passed,

  -- Gate 6 status
  rrf6.id AS gate6_form_id,
  rrf6.go_decision AS gate6_decision,
  rrf6.status AS gate6_status,
  rrf6.chairman_review_required AS gate6_chairman_review,
  rgl6.passed AS gate6_passed,

  -- Active escalations
  (SELECT COUNT(*) FROM risk_escalation_log WHERE venture_id = v.id AND resolved_at IS NULL) AS active_escalations

FROM ventures v
LEFT JOIN risk_recalibration_forms rrf3 ON v.id = rrf3.venture_id AND rrf3.gate_number = 3
LEFT JOIN risk_gate_passage_log rgl3 ON v.id = rgl3.venture_id AND rgl3.gate_number = 3
LEFT JOIN risk_recalibration_forms rrf4 ON v.id = rrf4.venture_id AND rrf4.gate_number = 4
LEFT JOIN risk_gate_passage_log rgl4 ON v.id = rgl4.venture_id AND rgl4.gate_number = 4
LEFT JOIN risk_recalibration_forms rrf5 ON v.id = rrf5.venture_id AND rrf5.gate_number = 5
LEFT JOIN risk_gate_passage_log rgl5 ON v.id = rgl5.venture_id AND rgl5.gate_number = 5
LEFT JOIN risk_recalibration_forms rrf6 ON v.id = rrf6.venture_id AND rrf6.gate_number = 6
LEFT JOIN risk_gate_passage_log rgl6 ON v.id = rgl6.venture_id AND rgl6.gate_number = 6
ORDER BY v.current_lifecycle_stage DESC, v.name;

COMMENT ON VIEW v_risk_gate_dashboard IS 'SD-LIFECYCLE-GAP-005: Dashboard view showing risk gate status for all ventures';

-- ============================================================================
-- 10. VERIFICATION
-- ============================================================================

DO $$
DECLARE
  table_count INTEGER;
  function_count INTEGER;
BEGIN
  -- Verify tables created
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('risk_recalibration_forms', 'risk_escalation_log', 'risk_gate_passage_log');

  IF table_count = 3 THEN
    RAISE NOTICE '✅ Migration SD-LIFECYCLE-GAP-005: Tables created successfully';
  ELSE
    RAISE WARNING '⚠️ Migration SD-LIFECYCLE-GAP-005: Expected 3 tables, found %', table_count;
  END IF;

  -- Verify functions created
  SELECT COUNT(*) INTO function_count
  FROM pg_proc
  WHERE proname IN (
    'fn_evaluate_risk_recalibration_gate',
    'fn_check_risk_escalation_triggers',
    'fn_record_risk_gate_passage',
    'fn_update_risk_form_chairman_flag'
  );

  IF function_count = 4 THEN
    RAISE NOTICE '✅ Migration SD-LIFECYCLE-GAP-005: Functions created successfully';
  ELSE
    RAISE WARNING '⚠️ Migration SD-LIFECYCLE-GAP-005: Expected 4 functions, found %', function_count;
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Create risk re-calibration UI in venture management dashboard
-- 2. Integrate gate evaluation with phase transition logic
-- 3. Create chairman review workflow for escalated risks
-- 4. Add risk metrics tracking and reporting
-- ============================================================================
