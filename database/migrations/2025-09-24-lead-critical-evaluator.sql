-- LEAD Critical Evaluator Database Schema
-- Stores results from mandatory business value assessments
-- Date: 2025-09-24

-- 1. Create lead_evaluations table for storing LEAD evaluation results
CREATE TABLE IF NOT EXISTS lead_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    -- Evaluation dimensions from 4-question framework
    business_value TEXT CHECK (business_value IN ('HIGH', 'MEDIUM', 'LOW')) NOT NULL,
    duplication_risk TEXT CHECK (duplication_risk IN ('HIGH', 'MEDIUM', 'LOW')) NOT NULL,
    resource_cost TEXT CHECK (resource_cost IN ('HIGH', 'MEDIUM', 'LOW')) NOT NULL,
    scope_complexity TEXT CHECK (scope_complexity IN ('HIGH', 'MEDIUM', 'LOW')) NOT NULL,

    -- Decision matrix results
    final_decision TEXT CHECK (final_decision IN ('APPROVE', 'CONDITIONAL', 'CONSOLIDATE', 'DEFER', 'REJECT', 'CLARIFY')) NOT NULL,
    confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    justification TEXT NOT NULL,
    required_actions TEXT[], -- Array of required actions

    -- Metadata
    evaluated_at TIMESTAMPTZ DEFAULT NOW(),
    evaluator TEXT DEFAULT 'LEAD_CRITICAL_EVALUATOR_v1.0',
    evaluation_version TEXT DEFAULT '1.0',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one evaluation per SD (or allow re-evaluations with different timestamps)
    UNIQUE(sd_id, evaluated_at)
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_evaluations_sd_id ON lead_evaluations(sd_id);
CREATE INDEX IF NOT EXISTS idx_lead_evaluations_decision ON lead_evaluations(final_decision);
CREATE INDEX IF NOT EXISTS idx_lead_evaluations_confidence ON lead_evaluations(confidence_score);
CREATE INDEX IF NOT EXISTS idx_lead_evaluations_evaluated_at ON lead_evaluations(evaluated_at DESC);

-- 3. Create function to get latest evaluation for an SD
CREATE OR REPLACE FUNCTION get_latest_lead_evaluation(p_sd_id TEXT)
RETURNS TABLE (
    evaluation_id UUID,
    business_value TEXT,
    duplication_risk TEXT,
    resource_cost TEXT,
    scope_complexity TEXT,
    final_decision TEXT,
    confidence_score INTEGER,
    justification TEXT,
    required_actions TEXT[],
    evaluated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        id,
        le.business_value,
        le.duplication_risk,
        le.resource_cost,
        le.scope_complexity,
        le.final_decision,
        le.confidence_score,
        le.justification,
        le.required_actions,
        le.evaluated_at
    FROM lead_evaluations le
    WHERE le.sd_id = p_sd_id
    ORDER BY le.evaluated_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 4. Create view for LEAD dashboard showing evaluation summary
CREATE OR REPLACE VIEW v_lead_evaluation_summary AS
SELECT
    sd.id as sd_id,
    sd.title,
    sd.status,
    sd.target_application,
    sd.priority,
    le.final_decision,
    le.confidence_score,
    le.justification,
    le.evaluated_at,
    CASE
        WHEN le.final_decision = 'APPROVE' THEN 'Ready for PLAN handoff'
        WHEN le.final_decision = 'CONDITIONAL' THEN 'Needs additional analysis'
        WHEN le.final_decision = 'CONSOLIDATE' THEN 'Merge with existing SD'
        WHEN le.final_decision = 'DEFER' THEN 'Lower priority queue'
        WHEN le.final_decision = 'REJECT' THEN 'No business justification'
        WHEN le.final_decision = 'CLARIFY' THEN 'Requires better definition'
        ELSE 'Not evaluated'
    END as next_action
FROM strategic_directives_v2 sd
LEFT JOIN lead_evaluations le ON sd.id = le.sd_id
WHERE le.id IS NULL OR le.id = (
    SELECT id FROM lead_evaluations
    WHERE sd_id = sd.id
    ORDER BY evaluated_at DESC
    LIMIT 1
);

-- 5. Create trigger to update SD status based on LEAD evaluation
CREATE OR REPLACE FUNCTION update_sd_after_lead_evaluation()
RETURNS TRIGGER AS $$
BEGIN
    -- Update SD status based on LEAD decision
    UPDATE strategic_directives_v2
    SET
        status = CASE
            WHEN NEW.final_decision = 'APPROVE' THEN 'active'
            WHEN NEW.final_decision = 'REJECT' THEN 'rejected'
            WHEN NEW.final_decision IN ('CONDITIONAL', 'CLARIFY') THEN 'pending_revision'
            ELSE status -- Keep current status for DEFER/CONSOLIDATE
        END,
        updated_at = NOW()
    WHERE id = NEW.sd_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create the trigger
DROP TRIGGER IF EXISTS trigger_update_sd_after_lead_eval ON lead_evaluations;
CREATE TRIGGER trigger_update_sd_after_lead_eval
    AFTER INSERT ON lead_evaluations
    FOR EACH ROW
    EXECUTE FUNCTION update_sd_after_lead_evaluation();

-- 7. Add RLS policies for lead_evaluations
ALTER TABLE lead_evaluations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read evaluations
CREATE POLICY IF NOT EXISTS "lead_evaluations_select" ON lead_evaluations
    FOR SELECT TO authenticated
    USING (true);

-- Allow service role to manage evaluations
CREATE POLICY IF NOT EXISTS "lead_evaluations_all" ON lead_evaluations
    FOR ALL TO service_role
    USING (true);

-- 8. Add comments for documentation
COMMENT ON TABLE lead_evaluations IS 'Stores results from LEAD Critical Evaluator framework - mandatory business value assessments';
COMMENT ON COLUMN lead_evaluations.business_value IS 'Assessment of business impact: HIGH/MEDIUM/LOW';
COMMENT ON COLUMN lead_evaluations.duplication_risk IS 'Risk of overlapping with existing work: HIGH/MEDIUM/LOW';
COMMENT ON COLUMN lead_evaluations.resource_cost IS 'Estimated resource requirements: HIGH/MEDIUM/LOW';
COMMENT ON COLUMN lead_evaluations.scope_complexity IS 'Complexity and scope control assessment: HIGH/MEDIUM/LOW';
COMMENT ON COLUMN lead_evaluations.final_decision IS 'LEAD decision: APPROVE/CONDITIONAL/CONSOLIDATE/DEFER/REJECT/CLARIFY';
COMMENT ON COLUMN lead_evaluations.confidence_score IS 'Confidence in evaluation (0-100)';
COMMENT ON COLUMN lead_evaluations.required_actions IS 'Array of actions required before proceeding';
COMMENT ON FUNCTION get_latest_lead_evaluation IS 'Returns the most recent LEAD evaluation for a given SD';
COMMENT ON VIEW v_lead_evaluation_summary IS 'Dashboard view showing LEAD evaluation status for all SDs';