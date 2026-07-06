-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-FLEET-WIDE-AUDIT-001 (FR-3)
-- Fleet-wide venture design-pass ledger: one row per real (build_model='leo_bridge') venture,
-- classifying whether it hit the MarketLens-class defect (a shipped landing with no design pass).
-- Persisted results table (NOT a VIEW) -- build_state/design_pass require git-commit and
-- filesystem evidence that SQL cannot read; TESTING (row 8bba1835) and DATABASE (row cfa8e1fd)
-- both confirmed a VIEW cannot express this. Written by scripts/audit-venture-design-pass.mjs,
-- idempotently upserted on venture_id on every run (current-state snapshot, not a history log).
-- Additive, reversible. No drops/renames.

CREATE TABLE IF NOT EXISTS venture_design_pass_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  venture_name text NOT NULL,
  build_path text NOT NULL,
  build_state text NOT NULL CHECK (build_state IN ('realized', 'latent', 'insufficient_evidence')),
  design_pass text NOT NULL CHECK (design_pass IN ('yes', 'no', 'insufficient_evidence')),
  evidence_basis text NOT NULL CHECK (evidence_basis IN ('structural_ui', 'stitch_artifact', 'design_fidelity_score', 'none')),
  disposition text NOT NULL CHECK (disposition IN ('realized_defect', 'realized_design_pass_confirmed', 'latent_at_risk', 'insufficient_evidence')),
  is_cancelled boolean NOT NULL DEFAULT false,
  remediation_status text NOT NULL DEFAULT 'not_applicable' CHECK (remediation_status IN ('not_applicable', 'none_found', 'remediation_in_progress', 'remediation_completed')),
  evidence_detail jsonb,
  classifier_version text NOT NULL,
  classifier_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venture_id)
);

CREATE OR REPLACE FUNCTION fn_venture_design_pass_ledger_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venture_design_pass_ledger_touch_updated_at ON venture_design_pass_ledger;
CREATE TRIGGER trg_venture_design_pass_ledger_touch_updated_at
  BEFORE UPDATE ON venture_design_pass_ledger
  FOR EACH ROW EXECUTE FUNCTION fn_venture_design_pass_ledger_touch_updated_at();

ALTER TABLE venture_design_pass_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venture_design_pass_ledger_service_role_all ON venture_design_pass_ledger;
CREATE POLICY venture_design_pass_ledger_service_role_all ON venture_design_pass_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS venture_design_pass_ledger_authenticated_select ON venture_design_pass_ledger;
CREATE POLICY venture_design_pass_ledger_authenticated_select ON venture_design_pass_ledger
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE venture_design_pass_ledger IS
  'SD-LEO-INFRA-FLEET-WIDE-AUDIT-001: fleet-wide classification of leo_bridge ventures by build state and design-pass status, scoping the follow-on decomposer/gate fix to the real blast radius.';

-- ROLLBACK (reversible):
--   DROP TRIGGER IF EXISTS trg_venture_design_pass_ledger_touch_updated_at ON venture_design_pass_ledger;
--   DROP FUNCTION IF EXISTS fn_venture_design_pass_ledger_touch_updated_at();
--   DROP TABLE IF EXISTS venture_design_pass_ledger;
