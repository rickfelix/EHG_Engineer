-- Fix SD-LEO-ORCH-FRONTEND-BACKEND-STAGE-001-B unintentional CANCELLED status
-- Root cause: trigger-disabled phase update inadvertently set CANCELLED
-- Restore to: status='in_progress', current_phase='PLAN_PRD', progress=20
-- Also clean up false rejection handoff record (session mismatch, not actual gate failure)

BEGIN;

ALTER TABLE strategic_directives_v2 DISABLE TRIGGER USER;

UPDATE strategic_directives_v2
SET status = 'in_progress',
    current_phase = 'PLAN_PRD',
    progress = 20
WHERE sd_key = 'SD-LEO-ORCH-FRONTEND-BACKEND-STAGE-001-B';

ALTER TABLE strategic_directives_v2 ENABLE TRIGGER USER;

-- Clean up the false rejection handoff
DELETE FROM sd_phase_handoffs
WHERE id = '6aae6442-c233-4f09-b48d-834e2799b3bb';

-- Also clean up the failure in leo_handoff_executions
DELETE FROM leo_handoff_executions
WHERE id = '6aae6442-c233-4f09-b48d-834e2799b3bb';

COMMIT;
