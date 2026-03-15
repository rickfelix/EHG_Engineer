-- Migration: Extend Risk Schema for Unified Lifecycle
-- SD: SD-LEO-INFRA-EXTEND-RISK-SCHEMA-001
-- Adds product_risk and legal_risk columns (completing 6-category model)
-- Adds risk_context and review_period columns
-- Extends gate_number range to 1-25 for operations stages

-- Product risk columns (same pattern as existing categories)
ALTER TABLE risk_recalibration_forms
  ADD COLUMN IF NOT EXISTS product_risk_previous VARCHAR,
  ADD COLUMN IF NOT EXISTS product_risk_current VARCHAR,
  ADD COLUMN IF NOT EXISTS product_risk_delta VARCHAR,
  ADD COLUMN IF NOT EXISTS product_risk_justification TEXT,
  ADD COLUMN IF NOT EXISTS product_risk_mitigations JSONB;

-- Legal risk columns
ALTER TABLE risk_recalibration_forms
  ADD COLUMN IF NOT EXISTS legal_risk_previous VARCHAR,
  ADD COLUMN IF NOT EXISTS legal_risk_current VARCHAR,
  ADD COLUMN IF NOT EXISTS legal_risk_delta VARCHAR,
  ADD COLUMN IF NOT EXISTS legal_risk_justification TEXT,
  ADD COLUMN IF NOT EXISTS legal_risk_mitigations JSONB;

-- Context and scheduling columns
ALTER TABLE risk_recalibration_forms
  ADD COLUMN IF NOT EXISTS risk_context TEXT DEFAULT 'evaluation',
  ADD COLUMN IF NOT EXISTS review_period TEXT;

-- Extend gate_number constraint to allow operations stages (7-25)
-- First drop existing constraint if it exists, then add new one
DO $$
BEGIN
  -- Check if constraint exists and drop it
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'risk_recalibration_forms'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%gate_number%'
  ) THEN
    EXECUTE 'ALTER TABLE risk_recalibration_forms DROP CONSTRAINT ' ||
      (SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'risk_recalibration_forms'
       AND constraint_type = 'CHECK'
       AND constraint_name LIKE '%gate_number%'
       LIMIT 1);
  END IF;
END $$;

ALTER TABLE risk_recalibration_forms
  ADD CONSTRAINT risk_recalibration_forms_gate_number_check
  CHECK (gate_number >= 1 AND gate_number <= 25);

-- Replace UNIQUE constraint with partial unique index for contextual partitioning
DROP INDEX IF EXISTS idx_risk_forms_unique_context;
CREATE UNIQUE INDEX idx_risk_forms_unique_context
  ON risk_recalibration_forms (venture_id, gate_number, risk_context)
  WHERE status != 'superseded';

-- Update fn_update_risk_form_chairman_flag to count all 6 categories
CREATE OR REPLACE FUNCTION fn_update_risk_form_chairman_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- Count populated risk categories (6 total)
  DECLARE
    category_count INTEGER := 0;
  BEGIN
    IF NEW.market_risk_current IS NOT NULL THEN category_count := category_count + 1; END IF;
    IF NEW.technical_risk_current IS NOT NULL THEN category_count := category_count + 1; END IF;
    IF NEW.financial_risk_current IS NOT NULL THEN category_count := category_count + 1; END IF;
    IF NEW.operational_risk_current IS NOT NULL THEN category_count := category_count + 1; END IF;
    IF NEW.product_risk_current IS NOT NULL THEN category_count := category_count + 1; END IF;
    IF NEW.legal_risk_current IS NOT NULL THEN category_count := category_count + 1; END IF;

    -- Chairman review required when all 6 categories are populated
    NEW.chairman_review_required := (category_count >= 6);
    RETURN NEW;
  END;
END;
$$ LANGUAGE plpgsql;
