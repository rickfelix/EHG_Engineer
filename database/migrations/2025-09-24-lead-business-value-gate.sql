-- LEAD Business Value Gate System
-- Move Critical Evaluator to BEGINNING of workflow, not end
-- Prevents wasted implementation effort on low-value initiatives
-- Date: 2025-09-24

-- ============================================================================
-- NEW SD WORKFLOW PHASES WITH UPFRONT BUSINESS EVALUATION
-- ============================================================================

-- Add new status values for business value evaluation
ALTER TYPE IF EXISTS strategic_directive_status ADD VALUE IF NOT EXISTS 'pending_business_evaluation';
ALTER TYPE IF EXISTS strategic_directive_status ADD VALUE IF NOT EXISTS 'business_rejected';
ALTER TYPE IF EXISTS strategic_directive_status ADD VALUE IF NOT EXISTS 'business_approved';

-- Update status check constraint to include new values
ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS strategic_directives_v2_status_check;

ALTER TABLE strategic_directives_v2
ADD CONSTRAINT strategic_directives_v2_status_check
CHECK (status IN (
  'draft',
  'pending_business_evaluation',
  'business_rejected',
  'business_approved',
  'active',
  'superseded',
  'completed'
));

-- ============================================================================
-- BUSINESS VALUE EVALUATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_business_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    -- Business value assessment
    business_problem_statement TEXT,
    solution_value_proposition TEXT,
    measurable_outcomes JSONB DEFAULT '[]',
    roi_calculation JSONB DEFAULT '{}',

    -- Duplication & resource analysis
    duplication_risk TEXT CHECK (duplication_risk IN ('NONE', 'LOW', 'MEDIUM', 'HIGH')),
    existing_capabilities_analysis TEXT,
    resource_justification TEXT,
    opportunity_cost TEXT,

    -- Scope & complexity assessment
    scope_clarity_score INTEGER CHECK (scope_clarity_score >= 1 AND scope_clarity_score <= 10),
    complexity_assessment TEXT CHECK (complexity_assessment IN ('SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX')),
    minimum_viable_scope TEXT,

    -- LEAD evaluation decision
    evaluation_result TEXT NOT NULL CHECK (evaluation_result IN (
        'APPROVE', 'CONDITIONAL', 'CONSOLIDATE', 'DEFER', 'REJECT', 'CLARIFY'
    )),
    evaluation_rationale TEXT NOT NULL,
    conditional_requirements TEXT,

    -- Metadata
    evaluated_by TEXT DEFAULT 'LEAD',
    evaluation_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_business_evaluations_sd_id ON sd_business_evaluations(sd_id);
CREATE INDEX idx_business_evaluations_result ON sd_business_evaluations(evaluation_result);

-- ============================================================================
-- BUSINESS VALUE GATE FUNCTIONS
-- ============================================================================

-- Function to check if SD can proceed to PLAN phase
CREATE OR REPLACE FUNCTION can_proceed_to_plan(p_sd_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_status TEXT;
    v_evaluation_result TEXT;
BEGIN
    -- Get current status
    SELECT status INTO v_status
    FROM strategic_directives_v2
    WHERE id = p_sd_id;

    -- If already active or beyond, it can proceed
    IF v_status IN ('active', 'completed') THEN
        RETURN TRUE;
    END IF;

    -- Check if business evaluation exists and is approved
    SELECT evaluation_result INTO v_evaluation_result
    FROM sd_business_evaluations
    WHERE sd_id = p_sd_id
    ORDER BY evaluation_date DESC
    LIMIT 1;

    -- Must have APPROVE evaluation to proceed
    RETURN v_evaluation_result = 'APPROVE';
END;
$$ LANGUAGE plpgsql;

-- Function to enforce business value gate
CREATE OR REPLACE FUNCTION enforce_business_value_gate()
RETURNS TRIGGER AS $$
DECLARE
    v_can_proceed BOOLEAN;
BEGIN
    -- Only check when moving to active status (ready for PLAN handoff)
    IF NEW.status = 'active' AND OLD.status != 'active' THEN
        SELECT can_proceed_to_plan(NEW.id) INTO v_can_proceed;

        IF NOT v_can_proceed THEN
            RAISE EXCEPTION 'BUSINESS_VALUE_GATE_VIOLATION: SD % cannot proceed to PLAN phase without LEAD business evaluation approval. Current status: %, Required: APPROVED business evaluation.',
                NEW.id, NEW.status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce business value gate
DROP TRIGGER IF EXISTS tr_enforce_business_value_gate ON strategic_directives_v2;
CREATE TRIGGER tr_enforce_business_value_gate
    BEFORE UPDATE ON strategic_directives_v2
    FOR EACH ROW
    EXECUTE FUNCTION enforce_business_value_gate();

-- ============================================================================
-- UPDATED SD WORKFLOW STATES
-- ============================================================================

-- Function to move SD to business evaluation phase
CREATE OR REPLACE FUNCTION request_business_evaluation(p_sd_id TEXT, p_rationale TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE strategic_directives_v2
    SET
        status = 'pending_business_evaluation',
        current_phase = 'LEAD_BUSINESS_EVALUATION',
        updated_at = NOW()
    WHERE id = p_sd_id
      AND status = 'draft';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot move SD % to business evaluation. Must be in draft status.', p_sd_id;
    END IF;

    RAISE NOTICE 'SD % moved to business evaluation phase. LEAD must evaluate business value before any PLAN/EXEC work can begin.', p_sd_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to complete business evaluation
CREATE OR REPLACE FUNCTION complete_business_evaluation(
    p_sd_id TEXT,
    p_evaluation_result TEXT,
    p_rationale TEXT,
    p_business_problem TEXT DEFAULT NULL,
    p_solution_value TEXT DEFAULT NULL,
    p_duplication_risk TEXT DEFAULT 'LOW'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_new_status TEXT;
BEGIN
    -- Insert business evaluation
    INSERT INTO sd_business_evaluations (
        sd_id,
        business_problem_statement,
        solution_value_proposition,
        duplication_risk,
        evaluation_result,
        evaluation_rationale
    ) VALUES (
        p_sd_id,
        p_business_problem,
        p_solution_value,
        p_duplication_risk,
        p_evaluation_result,
        p_rationale
    );

    -- Determine new status based on evaluation result
    CASE p_evaluation_result
        WHEN 'APPROVE' THEN v_new_status := 'business_approved';
        WHEN 'REJECT' THEN v_new_status := 'business_rejected';
        ELSE v_new_status := 'pending_business_evaluation'; -- CONDITIONAL, CLARIFY, etc.
    END CASE;

    -- Update SD status
    UPDATE strategic_directives_v2
    SET
        status = v_new_status,
        current_phase = CASE
            WHEN p_evaluation_result = 'APPROVE' THEN 'READY_FOR_PLAN'
            WHEN p_evaluation_result = 'REJECT' THEN 'REJECTED'
            ELSE 'LEAD_BUSINESS_EVALUATION'
        END,
        updated_at = NOW()
    WHERE id = p_sd_id;

    RAISE NOTICE 'Business evaluation completed for SD %: % - %', p_sd_id, p_evaluation_result, p_rationale;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR BUSINESS VALUE WORKFLOW
-- ============================================================================

-- View for SDs needing business evaluation
CREATE OR REPLACE VIEW v_sds_needing_business_evaluation AS
SELECT
    sd.id,
    sd.title,
    sd.priority,
    sd.created_at,
    sd.description,
    CASE WHEN be.id IS NULL THEN TRUE ELSE FALSE END as needs_evaluation
FROM strategic_directives_v2 sd
LEFT JOIN sd_business_evaluations be ON sd.id = be.sd_id
WHERE sd.status = 'pending_business_evaluation'
   OR (sd.status = 'draft' AND be.id IS NULL)
ORDER BY sd.priority DESC, sd.created_at ASC;

-- View for business evaluation history
CREATE OR REPLACE VIEW v_business_evaluation_history AS
SELECT
    be.*,
    sd.title,
    sd.priority,
    sd.status as current_sd_status
FROM sd_business_evaluations be
JOIN strategic_directives_v2 sd ON be.sd_id = sd.id
ORDER BY be.evaluation_date DESC;

-- ============================================================================
-- NOTIFICATION SYSTEM FOR BUSINESS EVALUATION
-- ============================================================================

-- Extend retro_notifications for business evaluation workflow
INSERT INTO retro_notifications (sd_id, notification_type, payload, status)
SELECT
    id,
    'business_evaluation_needed',
    json_build_object(
        'sd_id', id,
        'action', 'lead_business_evaluation',
        'sd_title', title,
        'priority', priority,
        'created_date', created_at
    )::jsonb,
    'pending'
FROM strategic_directives_v2
WHERE status = 'draft'
  AND id NOT IN (SELECT sd_id FROM sd_business_evaluations)
  AND created_at > NOW() - INTERVAL '1 day'; -- Only recent SDs

-- ============================================================================
-- VERIFICATION & EXAMPLES
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🚀 BUSINESS VALUE GATE SYSTEM INSTALLED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ New SD Workflow: Draft → Business Evaluation → Approved → Active → PLAN';
    RAISE NOTICE '✅ Business Value Gate: Blocks PLAN/EXEC work until LEAD approves';
    RAISE NOTICE '✅ Critical Evaluator now runs BEFORE implementation, not after';
    RAISE NOTICE '✅ Prevents wasted effort on low-value initiatives';
    RAISE NOTICE '';
    RAISE NOTICE '📋 New Functions Available:';
    RAISE NOTICE '   • request_business_evaluation(sd_id) - Move SD to evaluation phase';
    RAISE NOTICE '   • complete_business_evaluation(sd_id, result, rationale) - LEAD decision';
    RAISE NOTICE '   • can_proceed_to_plan(sd_id) - Check if SD can progress';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 Protection: SDs cannot reach active status without business approval';
END;
$$;