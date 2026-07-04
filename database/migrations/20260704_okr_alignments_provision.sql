-- okr_alignments — provisions the table lib/eva/intelligence-loader.js has queried since
-- SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-C shipped. SD-LEO-INFRA-PROVISION-OKR-ALIGNMENTS-001.
-- Chairman-approved 2026-07-04 (feedback b5b0e80a metadata.chairman_decision): reachable-but-
-- unprovisioned per the table-estate reconciliation audit (docs/audits/
-- SD-LEO-INFRA-TABLE-ESTATE-RECONCILIATION-001.md) -- eva:okr/heal degrade silently on every
-- run without this table. Schema derived strictly from the consumer (lib/eva/intelligence-loader.js
-- _loadOkrImpact): selects id, key_result_id, contribution_type, impact_weight filtered by sd_id.
--
-- Additive (new table) -- no change to any existing table. No writer exists yet in this repo;
-- an empty table is a valid start (producers populate it later, per SD scope).
--
-- FK-type correction (first prod-deploy attempt failed atomically, rolled back cleanly):
-- strategic_directives_v2.id is `character varying`, NOT uuid, despite storing UUID-formatted
-- strings and despite intelligence-loader.js's own comment claiming "sd_id (uuid)" -- confirmed
-- via information_schema.columns. sd_id here is varchar to match the real FK target type.
--
-- @approved-by: codestreetlabs@gmail.com

CREATE TABLE IF NOT EXISTS okr_alignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id             character varying NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  key_result_id     uuid REFERENCES key_results(id) ON DELETE SET NULL,
  contribution_type text,
  impact_weight     numeric DEFAULT 1.0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_okr_alignments_sd_id ON okr_alignments (sd_id);
CREATE INDEX IF NOT EXISTS idx_okr_alignments_key_result_id ON okr_alignments (key_result_id);

-- RLS: authenticated read; service_role full write (mirrors the venture_capture_snapshots /
-- adam_task_ledger governance-table convention).
ALTER TABLE okr_alignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS okr_alignments_read ON okr_alignments;
CREATE POLICY okr_alignments_read ON okr_alignments
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS okr_alignments_service_write ON okr_alignments;
CREATE POLICY okr_alignments_service_write ON okr_alignments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE okr_alignments IS 'Links a Strategic Directive (sd_id) to the Key Result(s) it contributes to, feeding lib/eva/intelligence-loader.js _loadOkrImpact for the corrective-SD-generator OKR-alignment intelligence signal (eva:okr / heal pipelines). Empty by default -- producers populate it; SD-LEO-INFRA-PROVISION-OKR-ALIGNMENTS-001.';
COMMENT ON COLUMN okr_alignments.key_result_id IS 'Nullable: an alignment may target the parent objective without a specific key result (the loader filters falsy key_result_id values via .filter(Boolean) before fetching key_results).';
COMMENT ON COLUMN okr_alignments.impact_weight IS 'Multiplier used by intelligence-loader.js: totalScore += 10 * impact_weight * urgencyMultiplier. Defaults to 1.0; the loader also applies its own `?? 1.0` fallback for legacy/null rows.';
