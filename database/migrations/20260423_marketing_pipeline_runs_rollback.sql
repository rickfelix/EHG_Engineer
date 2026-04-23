-- Rollback: marketing_pipeline_runs
-- SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A (Phase 0)

DROP POLICY IF EXISTS "venture_read_marketing_pipeline_runs" ON marketing_pipeline_runs;
DROP POLICY IF EXISTS "service_role_all_marketing_pipeline_runs" ON marketing_pipeline_runs;
DROP TABLE IF EXISTS marketing_pipeline_runs;
