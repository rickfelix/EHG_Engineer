-- SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E (FR-2) -- append-only immutability trigger on the
-- EXISTING public.feedback table.
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
-- Named directly in the parent orchestrator's (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001) own exit
-- test: "an update to a chairman-originated feedback row fails under the service role." Measured
-- live (see docs/audits/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E-write-caller-census.md, FR-1 of
-- this SD): feedback has ZERO immutability triggers today, and anon/authenticated/service_role all
-- hold full arwdDxtm grants -- RLS is whatever policy exists, but nothing stops a service-role
-- caller (which bypasses RLS entirely, rolbypassrls=true) from mutating or deleting a row.
--
-- SCOPE, PER FR-1's CENSUS: this migration adds ONLY the append-only guard (blocks UPDATE, DELETE,
-- TRUNCATE). It does NOT touch existing grants or RLS policies -- the separate, already-staged
-- grant-layer REVOKE initiative (docs/audits/sensitive-table-write-grant-audit.md) is out of this
-- SD's scope and is not applied here. feedback's normal lifecycle is INSERT-then-read; the census
-- found no application UPDATE/DELETE call site outside ad-hoc .artifacts/* one-off scripts, so this
-- guard should not break any legitimate writer.
--
-- MODELLED ON: database/chairman-gated/20260821_solomon_ledger_attestations.sql's append-only
-- trigger trio (unconditional freeze, no partial-mutation exception -- unlike
-- 20260823_chairman_ratifications.sql's one-sanctioned-transition shape, feedback has no analogous
-- single legitimate post-insert mutation to allow). DIFFERS from both precedents in one necessary
-- way: this migration does NOT CREATE TABLE (feedback already exists with production rows), so
-- there is no table-creation DDL here, and the verify block must probe against a freshly-INSERTed
-- row of its own (never touching real production rows) using a deliberate-abort pattern so the
-- probe is discarded rather than requiring a DELETE the new guard would itself reject.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- APPEND-ONLY. Triggers, not RLS -- service_role bypasses RLS (rolbypassrls=true) and is the role
-- most writers here run as. No sanctioned mutation exists post-insert; every UPDATE is rejected.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.feedback_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $freeze$
BEGIN
  RAISE EXCEPTION
    'feedback is append-only: row % cannot be modified after insert (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E). A correction is a NEW row, so the original chairman-originated content survives.',
    OLD.id;
END
$freeze$;

DROP TRIGGER IF EXISTS feedback_no_update ON public.feedback;
CREATE TRIGGER feedback_no_update
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.feedback_freeze();

CREATE OR REPLACE FUNCTION public.feedback_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $nodelete$
BEGIN
  RAISE EXCEPTION
    'feedback is append-only: row % cannot be deleted (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E). Without this guard, delete-and-reinsert bypasses the update freeze completely.',
    OLD.id;
END
$nodelete$;

DROP TRIGGER IF EXISTS feedback_no_delete_trg ON public.feedback;
CREATE TRIGGER feedback_no_delete_trg
  BEFORE DELETE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.feedback_no_delete();

-- Row-level triggers do NOT fire for TRUNCATE -- only a statement-level trigger can intercept it.
CREATE OR REPLACE FUNCTION public.feedback_no_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $notrunc$
BEGIN
  RAISE EXCEPTION 'feedback is append-only: TRUNCATE is not permitted (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E). It would erase the entire feedback history with no row-level trigger able to observe it.';
END
$notrunc$;

DROP TRIGGER IF EXISTS feedback_no_truncate_trg ON public.feedback;
CREATE TRIGGER feedback_no_truncate_trg
  BEFORE TRUNCATE ON public.feedback
  FOR EACH STATEMENT EXECUTE FUNCTION public.feedback_no_truncate();

-- SECURITY (mirrors chairman_ratifications SEC finding M1): default ORIGIN-mode triggers are
-- suppressed by `SET LOCAL session_replication_role = 'replica'`. ALWAYS-mode triggers still fire
-- in replica mode. feedback has no legitimate logical-replication/bulk-load use case that needs
-- replica-mode suppression, so there is no cost to closing this.
ALTER TABLE public.feedback ENABLE ALWAYS TRIGGER feedback_no_update;
ALTER TABLE public.feedback ENABLE ALWAYS TRIGGER feedback_no_delete_trg;
ALTER TABLE public.feedback ENABLE ALWAYS TRIGGER feedback_no_truncate_trg;

COMMENT ON TABLE public.feedback IS
  'Append-only as of SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E: no UPDATE/DELETE/TRUNCATE is '
  'permitted post-insert (feedback_no_update / feedback_no_delete_trg / feedback_no_truncate_trg, '
  'all ENABLE ALWAYS). Existing grants/RLS are UNCHANGED by this migration -- see '
  'docs/audits/sensitive-table-write-grant-audit.md for the separate, still-staged grant-tightening '
  'initiative. A correction is recorded as a NEW row, never an edit to an existing one.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFY. Behavioural proof, not merely existential -- probes a row THIS BLOCK inserts and
-- deliberately aborts the nested subtransaction (custom SQLSTATE) to discard it, since a real
-- DELETE (correctly rejected by the guard proved just below) could never clean it up otherwise.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  truncate_was_blocked boolean := false;
  probe_id uuid;
BEGIN
  ASSERT to_regclass('public.feedback') IS NOT NULL, 'feedback table does not exist';

  BEGIN
    INSERT INTO public.feedback (type, source_application, source_type, title)
    VALUES ('issue', 'terminal:probe-verify', 'manual_feedback', 'probe: SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E verify')
    RETURNING id INTO probe_id;

    -- INSERT must still succeed (append-only means INSERT is unaffected) -- already proven by
    -- reaching here without exception; explicit existence check for clarity.
    IF NOT EXISTS (SELECT 1 FROM public.feedback WHERE id = probe_id) THEN
      RAISE EXCEPTION 'feedback: probe INSERT did not land -- cannot verify the append-only guard';
    END IF;

    -- UPDATE must be rejected. A distinct custom SQLSTATE on the "guard did not fire" branch keeps
    -- it from being conflated with the trigger's own P0001 rejection caught right below.
    BEGIN
      UPDATE public.feedback SET title = 'tampered' WHERE id = probe_id;
      RAISE EXCEPTION 'feedback: GUARD DID NOT FIRE -- an UPDATE was ACCEPTED.' USING ERRCODE = 'P0101';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected (the trigger's own P0001 rejection)
    END;

    -- DELETE must be rejected.
    BEGIN
      DELETE FROM public.feedback WHERE id = probe_id;
      RAISE EXCEPTION 'feedback: GUARD DID NOT FIRE -- a DELETE was ACCEPTED.' USING ERRCODE = 'P0102';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected (the trigger's own P0001 rejection)
    END;

    -- Deliberate cleanup abort -- discards the probe row (append-only means it can never be
    -- DELETEd for real, so the whole nested block is rolled back instead).
    RAISE EXCEPTION 'internal: discard verify-block probe row (expected)' USING ERRCODE = 'P0100';
  EXCEPTION
    WHEN SQLSTATE 'P0100' THEN NULL; -- expected, deliberate cleanup -- probe row is now gone
  END;

  -- TRUNCATE gets the behavioural boolean-flag test: row-level triggers don't fire for TRUNCATE at
  -- all, so this proves SOME mechanism actually rejects it (never run against real data -- feedback
  -- carries production rows, so this must reject before anything is erased). feedback has an inbound
  -- FK (feedback_sd_map.feedback_id) that Postgres checks BEFORE firing any TRUNCATE trigger, so in
  -- practice that FK -- not this migration's trigger -- is what blocks TRUNCATE today (SQLSTATE
  -- 0A000/feature_not_supported, "cannot truncate a table referenced in a foreign key constraint").
  -- The trigger remains as defense-in-depth for if that FK is ever removed; both rejection paths are
  -- accepted here since either one means the append-only guarantee holds.
  BEGIN
    EXECUTE 'TRUNCATE public.feedback';
  EXCEPTION
    WHEN raise_exception THEN truncate_was_blocked := true; -- our own trigger fired
    WHEN feature_not_supported THEN truncate_was_blocked := true; -- blocked by the inbound FK first
  END;
  IF NOT truncate_was_blocked THEN
    RAISE EXCEPTION 'feedback: GUARD DID NOT FIRE -- TRUNCATE succeeded. The append-only guarantee is decorative; refusing to deploy.';
  END IF;

  RAISE NOTICE 'feedback verified: append-only triggers present and correct (INSERT unaffected, UPDATE/DELETE/TRUNCATE rejected)';
END
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK -- see 20260907_feedback_immutability_trigger_DOWN.sql
--
-- APPLY (chairman ceremony; this file is NOT worker/Adam-delegatable -- it creates triggers):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260907_feedback_immutability_trigger.sql" \
--     --prod-deploy --allow-any-path
--
-- VERIFY (run after apply):
--   SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.feedback'::regclass
--     AND tgname LIKE 'feedback_no_%'; -- expect 3 rows, tgenabled = 'A' (ALWAYS)
-- ============================================================================
