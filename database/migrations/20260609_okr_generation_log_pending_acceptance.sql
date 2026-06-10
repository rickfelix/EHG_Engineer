-- SD-LEO-INFRA-REVIVE-EVA-ACCEPTANCE-STATE-001
-- Additive, backward-compatible: extend okr_generation_log.status to allow
-- 'pending_chairman_acceptance' so EVA monthly OKR generation can land in a
-- pending state (awaiting the chairman's Friday-flow acceptance) instead of
-- auto-going-live. No new table, no column drops, no existing rows mutated.
--
-- Original constraint (database/migrations/20260220_okr_monthly_system.sql:55):
--   status TEXT DEFAULT 'completed' CHECK (status IN ('running','completed','failed'))
-- @approved-by: codestreetlabs@gmail.com

ALTER TABLE okr_generation_log
  DROP CONSTRAINT IF EXISTS okr_generation_log_status_check;

ALTER TABLE okr_generation_log
  ADD CONSTRAINT okr_generation_log_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'pending_chairman_acceptance'));
