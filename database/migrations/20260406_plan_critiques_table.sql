-- SD-LEO-INFRA-PRE-PLAN-ADVERSARIAL-001
-- Pre-PLAN Adversarial Critique Gate: persist critique results for audit trail
-- Phase 1: advisory-only mode. Override columns reserved for Phase 2 promotion.

CREATE TABLE IF NOT EXISTS plan_critiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id text NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  prd_id text NOT NULL REFERENCES product_requirements_v2(id) ON DELETE CASCADE,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_severity text NOT NULL CHECK (overall_severity IN ('block', 'warn', 'note', 'pass')),
  override_reason text,
  override_by text,
  model_used text,
  token_usage jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_critiques_sd_id ON plan_critiques (sd_id);
CREATE INDEX IF NOT EXISTS idx_plan_critiques_severity ON plan_critiques (overall_severity);
CREATE INDEX IF NOT EXISTS idx_plan_critiques_created_at ON plan_critiques USING brin (created_at);

ALTER TABLE plan_critiques ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users (matches product_requirements_v2 pattern)
CREATE POLICY plan_critiques_select_authenticated ON plan_critiques
  FOR SELECT TO authenticated USING (true);

-- Service role full access (for gate writes)
CREATE POLICY plan_critiques_service_all ON plan_critiques
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE plan_critiques IS 'Pre-PLAN adversarial critique results from devils-advocate.js critiquePlanProposal(). Phase 1: advisory only — never blocks handoffs.';
COMMENT ON COLUMN plan_critiques.findings IS 'Array of {severity, category, message, location, suggested_fix}';
COMMENT ON COLUMN plan_critiques.overall_severity IS 'block|warn|note|pass — Phase 1 advisory does not act on block';
COMMENT ON COLUMN plan_critiques.override_reason IS 'Phase 2 reserved: chairman override rationale when block was bypassed';
COMMENT ON COLUMN plan_critiques.token_usage IS 'LLM token usage for cost tracking: {input_tokens, output_tokens}';
