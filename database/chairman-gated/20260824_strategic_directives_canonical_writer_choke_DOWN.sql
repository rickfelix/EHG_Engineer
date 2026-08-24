-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — ROLLBACK (MODE 1)
-- Companion to 20260824_strategic_directives_canonical_writer_choke.sql
--
-- @approved-by: PENDING — INTENTIONALLY BLANK.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHEN TO RUN THIS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- MODE 1, post-apply operational backout: the migration applied cleanly, and afterwards a writer is
-- being rejected in production that should not have been (incomplete allowlist coverage, an
-- unenumerated caller, an unexpected cascade). This gives that situation a documented, fast backout
-- that does NOT require re-reviewing the SD.
--
-- This is NOT the recovery path for a migration that failed PARTWAY through — that is MODE 2, and it
-- needs no rollback at all: every statement in the UP file is existence-guarded, so the UP file is
-- simply re-runnable from the top. See the UP file's header for the pre-re-attempt verification query.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. It does NOT drop strategic_directives_v2.lifecycle_write_token. The column is RETAINED on
--    purpose. Every JS and RPC writer that was amended to send the stamp keeps sending it; with the
--    guard gone the column is simply an ordinary unvalidated column, so those writers continue to
--    succeed untouched and no writer-side revert is needed. Dropping the column instead would break
--    every stamped writer the instant this runs — the exact opposite of a safe backout. No data is
--    lost by retaining it: the column is structurally NULL at rest by design.
--
-- 2. It does NOT revert the amended function bodies (auto_transition_status, complete_orchestrator_sd,
--    fn_atomic_lead_to_plan_transition, fn_atomic_exec_to_plan_transition, and the 4 cascade
--    functions). If a regression is ever traced to one of those bodies rather than to the guard, that
--    is an ordinary `git revert` of the function, restoring from
--    database/evidence/canonical-writer-choke/<name>.before.sql — not part of this file.
--
--    auto_transition_status is a DELIBERATE EXCEPTION to "their only change is an extra column
--    assignment, which is inert once the guard is gone": it ALSO carries an IS DISTINCT FROM guard
--    fixing an independent bug (a metadata-only write could silently revert a row's status; see the
--    UP file's section 4 comment). That fix is intentionally KEPT after this rollback — it is not
--    coupled to the choke trigger's presence and remains correct with the guard gone. Reverting it
--    too would silently reintroduce the metadata-only-revert bug alongside backing out the choke.
--
-- 3. It does NOT revert FR-7's dead-code deletions or FR-8's scanner/test restructuring. Both are
--    correct independent of the guard: the deleted code was dead regardless of the trigger, and
--    neither the advisory scanner nor the restructured test asserts anything about the trigger's
--    existence.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- MANDATORY POST-ROLLBACK VERIFICATION — run it, do not assume
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- After this file applies, execute ONE real canonical writer's UPDATE against the reverted schema —
-- e.g. `node scripts/handoff.js execute LEAD-TO-PLAN <scratch-SD>` — and confirm it SUCCEEDS with the
-- guard absent. That is what proves the stamp-setting code introduced no coupling to the trigger's
-- presence. A rollback that is only verified by "the DROPs ran without error" has not been verified.
--
-- APPLY (chairman ceremony; two separate invocations):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260824_strategic_directives_canonical_writer_choke_DOWN.sql" \
--     --prod-deploy --allow-any-path
--
-- ...with `SET lock_timeout = '3s';` established in the applying session first. DROP TRIGGER takes
-- the same ACCESS EXCLUSIVE lock CREATE TRIGGER does, and the same "no lock_timeout on
-- service_role/postgres" finding applies to backing out as to applying.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS aaa_enforce_canonical_lifecycle_write ON public.strategic_directives_v2;
DROP TRIGGER IF EXISTS zzz_enforce_canonical_lifecycle_write_final ON public.strategic_directives_v2;
DROP FUNCTION IF EXISTS public.enforce_canonical_lifecycle_write();
DROP FUNCTION IF EXISTS public.sd_canonical_writer_policy(text);

DO $verify_down$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'strategic_directives_v2'
       AND NOT t.tgisinternal
       AND t.tgname IN ('aaa_enforce_canonical_lifecycle_write',
                        'zzz_enforce_canonical_lifecycle_write_final')
  ) THEN
    RAISE EXCEPTION 'canonical-writer choke DOWN: a guard trigger survived the DROP — the backout did not take';
  END IF;

  -- The column MUST still be here. Its survival is the property that keeps every stamped writer
  -- working post-rollback, so its absence is a failure of this backout, not a tidier outcome.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'strategic_directives_v2'
       AND column_name = 'lifecycle_write_token'
  ) THEN
    RAISE EXCEPTION 'canonical-writer choke DOWN: lifecycle_write_token was dropped. Every stamped writer now fails on an unknown column. Restore it: ALTER TABLE public.strategic_directives_v2 ADD COLUMN lifecycle_write_token TEXT;';
  END IF;
END
$verify_down$;
