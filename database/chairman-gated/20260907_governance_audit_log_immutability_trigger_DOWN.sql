-- ROLLBACK for 20260907_governance_audit_log_immutability_trigger.sql
-- SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E (FR-3)
--
-- Drops ONLY the triggers/functions this migration added -- never the governance_audit_log table
-- itself, which pre-existed this SD and carries production rows.

BEGIN;

DROP TRIGGER IF EXISTS governance_audit_log_no_truncate_trg ON public.governance_audit_log;
DROP TRIGGER IF EXISTS governance_audit_log_no_delete_trg ON public.governance_audit_log;
DROP TRIGGER IF EXISTS governance_audit_log_no_update ON public.governance_audit_log;

DROP FUNCTION IF EXISTS public.governance_audit_log_no_truncate();
DROP FUNCTION IF EXISTS public.governance_audit_log_no_delete();
DROP FUNCTION IF EXISTS public.governance_audit_log_freeze();

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.governance_audit_log'::regclass AND tgname LIKE 'governance_audit_log_no_%') THEN
    RAISE EXCEPTION 'governance_audit_log DOWN failed: a governance_audit_log_no_% trigger still exists';
  END IF;
  ASSERT to_regclass('public.governance_audit_log') IS NOT NULL,
    'governance_audit_log table must still exist after this DOWN -- it pre-existed this SD and is never dropped';
  RAISE NOTICE 'governance_audit_log DOWN verified: immutability triggers/functions removed, table intact';
END
$verify$;

COMMIT;
