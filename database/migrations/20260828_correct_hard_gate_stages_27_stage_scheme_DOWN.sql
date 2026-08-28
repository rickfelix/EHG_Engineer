-- Rollback for 20260828_correct_hard_gate_stages_27_stage_scheme.sql
-- Restores the pre-fix (stale, pre-27-stage-scheme) hard_gate_stages value.

BEGIN;

UPDATE chairman_dashboard_config
SET hard_gate_stages = '[3,5,10,13,17,18,19,23,24,25]'::jsonb
WHERE config_key = 'default';

COMMIT;
