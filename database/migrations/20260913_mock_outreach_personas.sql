-- SD-LEO-INFRA-DEMAND-ENGINE-PART-001 FR-6/FR-7 -- a synthetic-persona registry for the mock
-- first-stranger-run executor. A new, isolated table (no existing production table altered,
-- no existing data at risk) so this is a plain additive migration, not chairman-gated.
--
-- Every persona is stamped with its provenance (mock_run_id + persona_template) so a mock
-- run's inputs are reproducible and auditable (FR-6). mock_run_id is NOT a foreign key to
-- venture_channel_publish_ledger.mock_run_id -- that column has no unique/PK constraint to
-- reference, and a single mock run spans many ledger rows, not one.

CREATE TABLE IF NOT EXISTS mock_outreach_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_run_id UUID NOT NULL,
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  persona_template TEXT NOT NULL,
  display_name TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mock_outreach_personas_run ON mock_outreach_personas(mock_run_id);
CREATE INDEX IF NOT EXISTS idx_mock_outreach_personas_venture ON mock_outreach_personas(venture_id);

COMMENT ON TABLE mock_outreach_personas IS
'SD-LEO-INFRA-DEMAND-ENGINE-PART-001 FR-6/FR-7: synthetic personas authored for a declared mock '
'run, stamped with the mock_run_id and persona_template that produced them so a mock run''s '
'inputs are reproducible and auditable.';
COMMENT ON COLUMN mock_outreach_personas.mock_run_id IS
'Correlates to venture_channel_publish_ledger.mock_run_id for the same declared mock run.';
COMMENT ON COLUMN mock_outreach_personas.persona_template IS
'Which persona template generated this synthetic persona (provenance).';

-- RLS: same authenticated-venture-scoped read + service-role-full-access shape as the
-- sibling venture_channel_publish_ledger (20260710_venture_channel_autonomy_ledger.sql).
ALTER TABLE mock_outreach_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mop_venture_access" ON mock_outreach_personas
  FOR SELECT TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      WHERE v.company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid())
    )
  );
CREATE POLICY "mop_service_role" ON mock_outreach_personas
  FOR ALL TO service_role USING (true) WITH CHECK (true);
