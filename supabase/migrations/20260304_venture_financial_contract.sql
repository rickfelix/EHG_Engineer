-- Migration: Create venture_financial_contract table
-- SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-F (Financial Consistency Contract)
-- Purpose: Canonical financial metrics per venture, set by Stage 5,
--          validated by downstream stages (8, 15, 19, 20).

CREATE TABLE IF NOT EXISTS venture_financial_contract (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  capital_required NUMERIC,
  cac_estimate NUMERIC,
  ltv_estimate NUMERIC,
  unit_economics JSONB,
  pricing_model TEXT,
  price_points JSONB,
  revenue_projection JSONB,
  set_by_stage INTEGER NOT NULL,
  last_refined_by_stage INTEGER,
  refinement_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id)
);

-- Index for fast lookups by venture
CREATE INDEX IF NOT EXISTS idx_vfc_venture_id ON venture_financial_contract(venture_id);

-- Enable RLS
ALTER TABLE venture_financial_contract ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY "service_role_full_access" ON venture_financial_contract
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: read access
CREATE POLICY "authenticated_read" ON venture_financial_contract
  FOR SELECT
  TO authenticated
  USING (true);

-- RPC: validate_financial_consistency
-- Callable from any Supabase client to validate proposed financial data
-- against the stored contract for a venture.
CREATE OR REPLACE FUNCTION validate_financial_consistency(
  p_venture_id UUID,
  p_stage_number INT,
  p_proposed_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_capital_required NUMERIC;
  v_cac_estimate NUMERIC;
  v_ltv_estimate NUMERIC;
  v_deviations JSONB := '[]'::jsonb;
  v_proposed_val NUMERIC;
  v_pct_deviation NUMERIC;
  v_severity TEXT;
  v_has_block BOOLEAN := FALSE;
  v_has_warning BOOLEAN := FALSE;
BEGIN
  -- Get the contract values directly
  SELECT capital_required, cac_estimate, ltv_estimate
  INTO v_capital_required, v_cac_estimate, v_ltv_estimate
  FROM venture_financial_contract
  WHERE venture_id = p_venture_id;

  -- No contract = backward compatible
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'consistent', TRUE,
      'deviations', '[]'::jsonb,
      'message', 'No contract exists (pre-Stage 5)'
    );
  END IF;

  -- Check capital_required
  v_proposed_val := (p_proposed_data ->> 'capital_required')::NUMERIC;
  IF v_capital_required IS NOT NULL AND v_proposed_val IS NOT NULL AND v_capital_required != 0 THEN
    v_pct_deviation := ABS((v_proposed_val - v_capital_required) / v_capital_required);
    IF v_pct_deviation > 0.50 THEN v_severity := 'block'; v_has_block := TRUE;
    ELSIF v_pct_deviation > 0.20 THEN v_severity := 'warning'; v_has_warning := TRUE;
    ELSE v_severity := 'ok'; END IF;
    v_deviations := v_deviations || jsonb_build_object(
      'field', 'capital_required', 'contract_value', v_capital_required,
      'proposed_value', v_proposed_val, 'pct_deviation', ROUND(v_pct_deviation * 100, 2), 'severity', v_severity);
  END IF;

  -- Check cac_estimate
  v_proposed_val := (p_proposed_data ->> 'cac_estimate')::NUMERIC;
  IF v_cac_estimate IS NOT NULL AND v_proposed_val IS NOT NULL AND v_cac_estimate != 0 THEN
    v_pct_deviation := ABS((v_proposed_val - v_cac_estimate) / v_cac_estimate);
    IF v_pct_deviation > 0.50 THEN v_severity := 'block'; v_has_block := TRUE;
    ELSIF v_pct_deviation > 0.20 THEN v_severity := 'warning'; v_has_warning := TRUE;
    ELSE v_severity := 'ok'; END IF;
    v_deviations := v_deviations || jsonb_build_object(
      'field', 'cac_estimate', 'contract_value', v_cac_estimate,
      'proposed_value', v_proposed_val, 'pct_deviation', ROUND(v_pct_deviation * 100, 2), 'severity', v_severity);
  END IF;

  -- Check ltv_estimate
  v_proposed_val := (p_proposed_data ->> 'ltv_estimate')::NUMERIC;
  IF v_ltv_estimate IS NOT NULL AND v_proposed_val IS NOT NULL AND v_ltv_estimate != 0 THEN
    v_pct_deviation := ABS((v_proposed_val - v_ltv_estimate) / v_ltv_estimate);
    IF v_pct_deviation > 0.50 THEN v_severity := 'block'; v_has_block := TRUE;
    ELSIF v_pct_deviation > 0.20 THEN v_severity := 'warning'; v_has_warning := TRUE;
    ELSE v_severity := 'ok'; END IF;
    v_deviations := v_deviations || jsonb_build_object(
      'field', 'ltv_estimate', 'contract_value', v_ltv_estimate,
      'proposed_value', v_proposed_val, 'pct_deviation', ROUND(v_pct_deviation * 100, 2), 'severity', v_severity);
  END IF;

  RETURN jsonb_build_object(
    'consistent', NOT v_has_block AND NOT v_has_warning,
    'deviations', v_deviations,
    'stage', p_stage_number,
    'hasBlock', v_has_block,
    'hasWarning', v_has_warning
  );
END;
$$;
