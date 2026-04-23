-- Rollback: marketing_feedback_cycles
-- SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A (Phase 0)

DROP POLICY IF EXISTS "venture_read_marketing_feedback_cycles" ON marketing_feedback_cycles;
DROP POLICY IF EXISTS "service_role_all_marketing_feedback_cycles" ON marketing_feedback_cycles;
DROP TABLE IF EXISTS marketing_feedback_cycles;
