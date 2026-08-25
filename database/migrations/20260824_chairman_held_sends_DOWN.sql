-- DOWN migration for 20260824_chairman_held_sends.sql
-- SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (FR-1) — drop the held-send lane, its resolver and its view.
-- @chairman-gated
--
-- ⚠ NO `-- @approved-by:` LINE — the chairman supplies it. APPLY IS NOT MINE.
-- ⚠ DO NOT run with --split-statements.  ⚠ NO EXPLICIT BEGIN/COMMIT.
--
-- THIS DOWN IS NOT UNCONDITIONALLY SAFE, AND IT DOES NOT PRETEND TO BE.
-- A row in this table is a chairman-facing decision that has been WITHHELD and not yet resolved.
-- Dropping the table while any such row is live DESTROYS the only durable record that the chairman
-- was owed that decision — the precise harm the UP migration exists to prevent. So this file ABORTS
-- FIRST with an actionable message rather than silently discarding them. Deciding what an
-- unresolved hold should become (release it? suppress it? escalate to the chairman by hand?) is a
-- judgement about live governance state, and rewriting or deleting those rows to make a rollback
-- succeed would destroy exactly the information needed to make that judgement.
--
-- ⚠ ROLL BACK THE CODE FIRST. If chairman-sms-gate still writes to chairman_held_sends when this
--   runs, the next held chairman decision throws on a missing relation — and because the gate's
--   consult block fails OPEN (index.js:435, "a gate bug must never block a chairman send"), the
--   send would proceed UNCONSULTED. That is fail-open on the chairman control surface: strictly
--   worse than the hold-forever bug this SD fixes. Revert the writer, then run this file.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $chsd_pre$
DECLARE
  v_live bigint;
  v_total bigint;
BEGIN
  IF to_regclass('public.chairman_held_sends') IS NULL THEN
    RAISE NOTICE 'chairman_held_sends does not exist — nothing to roll back';
    RETURN;
  END IF;

  SELECT count(*) FILTER (WHERE status IN ('held','releasing')), count(*)
    INTO v_live, v_total
  FROM public.chairman_held_sends;

  IF v_live > 0 THEN
    RAISE EXCEPTION 'DOWN aborted: % unresolved hold(s) (status held/releasing) out of % row(s) would be destroyed. Each is a chairman decision that was withheld and never delivered. Resolve them explicitly (see the reporting query at the bottom of this file), then re-run.', v_live, v_total;
  END IF;

  RAISE NOTICE 'chairman_held_sends DOWN pre-assert OK: 0 unresolved holds (% terminal row(s) will be dropped)', v_total;
END
$chsd_pre$;

DROP VIEW IF EXISTS public.v_chairman_held_sends_unreconcilable;

-- The resolver is dropped with the table because it was introduced by the same file. If a LATER SD
-- adopts fn_resolve_chairman_user_id() for its own identity resolution, this DROP becomes a
-- cross-SD regression — check for other callers before running.
DO $chsd_fn$
DECLARE
  v_other_callers text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_other_callers
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname <> 'fn_resolve_chairman_user_id'
    AND p.prosrc ILIKE '%fn_resolve_chairman_user_id%';
  IF v_other_callers IS NOT NULL THEN
    RAISE EXCEPTION 'DOWN aborted: fn_resolve_chairman_user_id() is called by other database object(s): % — dropping it would break them. Decide explicitly whether the function should outlive this SD.', v_other_callers;
  END IF;
END
$chsd_fn$;

DROP FUNCTION IF EXISTS public.fn_resolve_chairman_user_id();

DROP TABLE IF EXISTS public.chairman_held_sends;

DO $chsd_post$
BEGIN
  ASSERT to_regclass('public.chairman_held_sends') IS NULL,
    'DOWN post-assert failed: chairman_held_sends still exists';
  ASSERT to_regclass('public.v_chairman_held_sends_unreconcilable') IS NULL,
    'DOWN post-assert failed: v_chairman_held_sends_unreconcilable still exists';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_resolve_chairman_user_id'
  ), 'DOWN post-assert failed: fn_resolve_chairman_user_id still exists';
  RAISE NOTICE 'chairman_held_sends DOWN complete';
END
$chsd_post$;

-- REPORTING query for the abort path above — what is holding the rollback up:
--   SELECT id, decision_id, subject, held_at, hold_expires_at, hold_reason,
--          consult_correlation_id, attempts, last_error
--     FROM public.chairman_held_sends
--    WHERE status IN ('held','releasing')
--    ORDER BY held_at;
