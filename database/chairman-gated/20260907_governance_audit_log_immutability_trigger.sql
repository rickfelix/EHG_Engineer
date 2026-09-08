-- SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E (FR-3) -- append-only immutability trigger on the
-- EXISTING public.governance_audit_log table.
--
-- @approved-by: <PENDING -- chairman must add this line + a token before apply>
--   Chairman verification NOT yet obtained. This file is staged only.
--   WHY chairman-gated rather than database/migrations/: this file creates TRIGGERS -- lands in
--   scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set (TIER-2, the literal
--   words UPDATE/DELETE/TRUNCATE/DO appear in the trigger definitions and verify block).
--
-- ============================================================================
-- WHY THIS TABLE, WHY NOW.
--
-- Measured live (see docs/audits/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E-write-caller-census.md,
-- FR-1 of this SD): governance_audit_log has ZERO immutability triggers today, and
-- anon/authenticated/service_role all hold full arwdDxtm grants -- RLS is its only barrier, per the
-- CAPA-002E migration's own header (database/migrations/20260904_capa_002e_audit_triggers_and_
-- disposition_constraints.sql). RLS does not bind service_role (rolbypassrls=true), so nothing
-- today stops a service-role caller from mutating or deleting an audit-of-record row.
--
-- SCOPE, PER FR-1's CENSUS: this migration adds ONLY the append-only guard (blocks UPDATE, DELETE,
-- TRUNCATE). It does NOT touch existing grants/RLS, and does NOT modify the sibling CAPA-002E
-- migration's audit_trigger_generic() -- that trigger INSTRUMENTS writes on OTHER tables by
-- inserting INTO governance_audit_log; this migration only protects rows already written here. The
-- census found no application UPDATE/DELETE call site for this table at all (its only direct
-- app-level writer, lib/eva/event-bus/handlers/budget-exceeded.js:70, only INSERTs).
--
-- MODELLED ON: database/chairman-gated/20260907_feedback_immutability_trigger.sql (same SD),
-- itself modelled on 20260821_solomon_ledger_attestations.sql's unconditional-freeze trigger trio.
-- governance_audit_log has NO inbound or outbound foreign keys (measured live), so unlike the
-- feedback migration's TRUNCATE probe, no FK pre-empts this table's own trigger.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.governance_audit_log_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $freeze$
BEGIN
  RAISE EXCEPTION
    'governance_audit_log is append-only: row % cannot be modified after insert (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E). It is an audit-of-record log; a correction is a NEW row.',
    OLD.id;
END
$freeze$;

DROP TRIGGER IF EXISTS governance_audit_log_no_update ON public.governance_audit_log;
CREATE TRIGGER governance_audit_log_no_update
  BEFORE UPDATE ON public.governance_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.governance_audit_log_freeze();

CREATE OR REPLACE FUNCTION public.governance_audit_log_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $nodelete$
BEGIN
  RAISE EXCEPTION
    'governance_audit_log is append-only: row % cannot be deleted (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E). Without this guard, delete-and-reinsert bypasses the update freeze completely.',
    OLD.id;
END
$nodelete$;

DROP TRIGGER IF EXISTS governance_audit_log_no_delete_trg ON public.governance_audit_log;
CREATE TRIGGER governance_audit_log_no_delete_trg
  BEFORE DELETE ON public.governance_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.governance_audit_log_no_delete();

-- Row-level triggers do NOT fire for TRUNCATE -- only a statement-level trigger can intercept it.
CREATE OR REPLACE FUNCTION public.governance_audit_log_no_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $notrunc$
BEGIN
  RAISE EXCEPTION 'governance_audit_log is append-only: TRUNCATE is not permitted (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E). It would erase the entire governance audit history with no row-level trigger able to observe it.';
END
$notrunc$;

DROP TRIGGER IF EXISTS governance_audit_log_no_truncate_trg ON public.governance_audit_log;
CREATE TRIGGER governance_audit_log_no_truncate_trg
  BEFORE TRUNCATE ON public.governance_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.governance_audit_log_no_truncate();

-- SECURITY (mirrors chairman_ratifications SEC finding M1): default ORIGIN-mode triggers are
-- suppressed by `SET LOCAL session_replication_role = 'replica'`. ALWAYS-mode triggers still fire
-- in replica mode. governance_audit_log has no legitimate logical-replication/bulk-load use case
-- that needs replica-mode suppression, so there is no cost to closing this.
ALTER TABLE public.governance_audit_log ENABLE ALWAYS TRIGGER governance_audit_log_no_update;
ALTER TABLE public.governance_audit_log ENABLE ALWAYS TRIGGER governance_audit_log_no_delete_trg;
ALTER TABLE public.governance_audit_log ENABLE ALWAYS TRIGGER governance_audit_log_no_truncate_trg;

COMMENT ON TABLE public.governance_audit_log IS
  'Append-only as of SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E: no UPDATE/DELETE/TRUNCATE is '
  'permitted post-insert (governance_audit_log_no_update / _no_delete_trg / _no_truncate_trg, all '
  'ENABLE ALWAYS). Existing grants/RLS and the CAPA-002E audit_trigger_generic() INSERT path are '
  'UNCHANGED by this migration.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFY. Behavioural proof, not merely existential -- probes a row THIS BLOCK inserts and
-- deliberately aborts the nested subtransaction (custom SQLSTATE) to discard it.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  truncate_was_blocked boolean := false;
  probe_id uuid;
BEGIN
  ASSERT to_regclass('public.governance_audit_log') IS NOT NULL, 'governance_audit_log table does not exist';

  BEGIN
    INSERT INTO public.governance_audit_log (table_name, record_id, operation)
    VALUES ('probe_table', gen_random_uuid()::text, 'probe')
    RETURNING id INTO probe_id;

    IF NOT EXISTS (SELECT 1 FROM public.governance_audit_log WHERE id = probe_id) THEN
      RAISE EXCEPTION 'governance_audit_log: probe INSERT did not land -- cannot verify the append-only guard';
    END IF;

    BEGIN
      UPDATE public.governance_audit_log SET operation = 'tampered' WHERE id = probe_id;
      RAISE EXCEPTION 'governance_audit_log: GUARD DID NOT FIRE -- an UPDATE was ACCEPTED.' USING ERRCODE = 'P0101';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected (the trigger's own P0001 rejection)
    END;

    BEGIN
      DELETE FROM public.governance_audit_log WHERE id = probe_id;
      RAISE EXCEPTION 'governance_audit_log: GUARD DID NOT FIRE -- a DELETE was ACCEPTED.' USING ERRCODE = 'P0102';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected (the trigger's own P0001 rejection)
    END;

    RAISE EXCEPTION 'internal: discard verify-block probe row (expected)' USING ERRCODE = 'P0100';
  EXCEPTION
    WHEN SQLSTATE 'P0100' THEN NULL; -- expected, deliberate cleanup -- probe row is now gone
  END;

  -- governance_audit_log has no inbound/outbound FKs (measured live), so unlike feedback's probe,
  -- this table's own trigger is the FIRST thing TRUNCATE hits -- the plain raise_exception catch
  -- is sufficient here.
  BEGIN
    EXECUTE 'TRUNCATE public.governance_audit_log';
  EXCEPTION
    WHEN raise_exception THEN truncate_was_blocked := true;
  END;
  IF NOT truncate_was_blocked THEN
    RAISE EXCEPTION 'governance_audit_log: GUARD DID NOT FIRE -- TRUNCATE succeeded. The append-only guarantee is decorative; refusing to deploy.';
  END IF;

  RAISE NOTICE 'governance_audit_log verified: append-only triggers present and correct (INSERT unaffected, UPDATE/DELETE/TRUNCATE rejected)';
END
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK -- see 20260907_governance_audit_log_immutability_trigger_DOWN.sql
--
-- APPLY (chairman ceremony; this file is NOT worker/Adam-delegatable -- it creates triggers):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260907_governance_audit_log_immutability_trigger.sql" \
--     --prod-deploy --allow-any-path
--
-- VERIFY (run after apply):
--   SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.governance_audit_log'::regclass
--     AND tgname LIKE 'governance_audit_log_no_%'; -- expect 3 rows, tgenabled = 'A' (ALWAYS)
-- ============================================================================
