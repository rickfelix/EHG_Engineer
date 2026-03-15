-- Migration: Financial Schema Cleanup for Stage 5/7 Integration
-- SD: SD-LEO-INFRA-WIRE-STAGE-FINANCIAL-001
-- Phase 2A: Wire Stage 5/7 Financial Models to Structured Storage
-- Already executed against DB on 2026-03-15

ALTER TABLE financial_models DROP CONSTRAINT IF EXISTS fk_company;
ALTER TABLE financial_projections DROP CONSTRAINT IF EXISTS fk_model;
ALTER TABLE financial_scenarios DROP CONSTRAINT IF EXISTS fk_scenario_model;

ALTER TABLE modeling_requests DROP CONSTRAINT IF EXISTS modeling_requests_request_type_check;
ALTER TABLE modeling_requests ADD CONSTRAINT modeling_requests_request_type_check
  CHECK (request_type = ANY(ARRAY[
    'time_horizon','build_cost','market_trend','portfolio_synergy',
    'kill_gate_prediction','nursery_reeval','competitive_density',
    'profitability_forecast','revenue_architecture'
  ]));

ALTER TABLE financial_models
  ADD CONSTRAINT uq_financial_models_venture_template
  UNIQUE (venture_id, template_type);

DROP POLICY IF EXISTS modeling_requests_service_all ON modeling_requests;
CREATE POLICY modeling_requests_select ON modeling_requests
  FOR SELECT TO authenticated USING (
    venture_id IN (SELECT v.id FROM ventures v JOIN user_company_access uca ON v.company_id = uca.company_id WHERE uca.user_id = auth.uid() AND uca.is_active = true)
  );
CREATE POLICY modeling_requests_insert ON modeling_requests
  FOR INSERT TO authenticated WITH CHECK (
    venture_id IN (SELECT v.id FROM ventures v JOIN user_company_access uca ON v.company_id = uca.company_id WHERE uca.user_id = auth.uid() AND uca.is_active = true)
  );
CREATE POLICY modeling_requests_update ON modeling_requests
  FOR UPDATE TO authenticated USING (
    venture_id IN (SELECT v.id FROM ventures v JOIN user_company_access uca ON v.company_id = uca.company_id WHERE uca.user_id = auth.uid() AND uca.is_active = true)
  );
CREATE POLICY modeling_requests_service ON modeling_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
