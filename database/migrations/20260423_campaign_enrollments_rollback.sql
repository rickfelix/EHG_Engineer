-- Rollback: campaign_enrollments
-- SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A (Phase 0)
-- Use ONLY if the forward migration caused a regression in prod.
-- Safe: table is additive; nothing else reads from it pre-Phase-1.

DROP POLICY IF EXISTS "venture_read_campaign_enrollments" ON campaign_enrollments;
DROP POLICY IF EXISTS "service_role_all_campaign_enrollments" ON campaign_enrollments;
DROP TABLE IF EXISTS campaign_enrollments;
