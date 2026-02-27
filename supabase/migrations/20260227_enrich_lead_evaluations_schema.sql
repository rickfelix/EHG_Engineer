-- SD-MAN-ORCH-IMPROVE-STEP-LEAD-002-C: Enrich lead_evaluations schema
-- Add numeric score columns (0-100) for quantitative analysis
-- Add technical_debt_impact and dependency_risk enum columns

ALTER TABLE lead_evaluations
  ADD COLUMN IF NOT EXISTS business_value_score integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS duplication_risk_score integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS resource_cost_score integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS scope_complexity_score integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS technical_debt_impact text DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS dependency_risk text DEFAULT 'NONE';

-- Add check constraints (separate statements for IF NOT EXISTS compatibility)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_evaluations_business_value_score_range') THEN
    ALTER TABLE lead_evaluations ADD CONSTRAINT lead_evaluations_business_value_score_range CHECK (business_value_score >= 0 AND business_value_score <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_evaluations_duplication_risk_score_range') THEN
    ALTER TABLE lead_evaluations ADD CONSTRAINT lead_evaluations_duplication_risk_score_range CHECK (duplication_risk_score >= 0 AND duplication_risk_score <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_evaluations_resource_cost_score_range') THEN
    ALTER TABLE lead_evaluations ADD CONSTRAINT lead_evaluations_resource_cost_score_range CHECK (resource_cost_score >= 0 AND resource_cost_score <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_evaluations_scope_complexity_score_range') THEN
    ALTER TABLE lead_evaluations ADD CONSTRAINT lead_evaluations_scope_complexity_score_range CHECK (scope_complexity_score >= 0 AND scope_complexity_score <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_evaluations_technical_debt_impact_check') THEN
    ALTER TABLE lead_evaluations ADD CONSTRAINT lead_evaluations_technical_debt_impact_check CHECK (technical_debt_impact IN ('NONE','LOW','MEDIUM','HIGH','CRITICAL'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_evaluations_dependency_risk_check') THEN
    ALTER TABLE lead_evaluations ADD CONSTRAINT lead_evaluations_dependency_risk_check CHECK (dependency_risk IN ('NONE','LOW','MEDIUM','HIGH','CRITICAL'));
  END IF;
END $$;
