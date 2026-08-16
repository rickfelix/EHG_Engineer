-- ROLLBACK for 20260816_plan_critiques_add_metadata_and_content_hash.sql
-- SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001 — TR-3

ALTER TABLE plan_critiques DROP COLUMN IF EXISTS metadata, DROP COLUMN IF EXISTS content_hash;
