-- @approved-by: codestreetlabs@gmail.com
-- Migration: merge_witness_telemetry — OBSERVE-ONLY audit of the mergeWork() P1-P5 precondition ladder.
-- SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001 (FR-3). One row per ladder evaluation, every PR merge attempt, all lanes.
-- Additive (new table) — no change to any existing table. Chairman-gated apply (requires_chairman_apply).
-- Written server-side only from lib/ship/auto-merge.mjs via the service-role client; RLS mirrors solomon_advice_outcome_ledger.
-- DATABASE sub-agent pre-implementation review: sub_agent_execution_results row 44085d71-b5c4-4201-9da3-37b15a0c62d7 (CONDITIONAL_PASS, confidence 92).

CREATE TABLE IF NOT EXISTS merge_witness_telemetry (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number     INTEGER NOT NULL,
  repo          TEXT,
  work_key      TEXT,
  tier          TEXT,
  lane          TEXT NOT NULL,
  via_mergework BOOLEAN NOT NULL DEFAULT true,
  overall       TEXT NOT NULL DEFAULT 'observe-only',
  rungs         JSONB NOT NULL,          -- [{id:'P1',status,reason}, ... x5]
  evaluated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merge_witness_telemetry_pr ON merge_witness_telemetry(pr_number);
CREATE INDEX IF NOT EXISTS idx_merge_witness_telemetry_evaluated_at ON merge_witness_telemetry(evaluated_at DESC);
-- Serves the Ship-witness D adoption gauge: GROUP BY lane WHERE evaluated_at >= now()-interval '7 days'.
CREATE INDEX IF NOT EXISTS idx_merge_witness_telemetry_lane_evaluated_at ON merge_witness_telemetry(lane, evaluated_at DESC);

ALTER TABLE merge_witness_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merge_witness_telemetry_read ON merge_witness_telemetry;
CREATE POLICY merge_witness_telemetry_read ON merge_witness_telemetry
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS merge_witness_telemetry_service_write ON merge_witness_telemetry;
CREATE POLICY merge_witness_telemetry_service_write ON merge_witness_telemetry
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE merge_witness_telemetry IS 'OBSERVE-ONLY audit of the mergeWork() P1-P5 precondition ladder (SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001). One row per evaluation; never changes any lane merge decision. rungs=[{id,status,reason}] with status IN (pass|fail|not_applicable|not_evaluable). Powers the Ship-witness D adoption gauge.';

-- Rollback:
-- DROP POLICY IF EXISTS merge_witness_telemetry_service_write ON merge_witness_telemetry;
-- DROP POLICY IF EXISTS merge_witness_telemetry_read ON merge_witness_telemetry;
-- DROP INDEX IF EXISTS idx_merge_witness_telemetry_lane_evaluated_at;
-- DROP INDEX IF EXISTS idx_merge_witness_telemetry_evaluated_at;
-- DROP INDEX IF EXISTS idx_merge_witness_telemetry_pr;
-- DROP TABLE IF EXISTS merge_witness_telemetry;
