-- requires-chairman-apply
-- @approved-by: codestreetlabs@gmail.com
-- @approval-record: Chairman verbal at terminal 2026-08-24T12:43Z — "A on all" (11-item ceremony sitting, Adam 0549d739, branch ceremony/20260824-sitting)
-- SD-LEO-FIX-SMS-OUTBOUND-WORKER-002 (escalated from QF-20260728-870, FR-3).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, CHAIRMAN-GATED. DO NOT RUN THIS FILE without chairman sign-off. No @approved-by tag is
-- present -- one is added at apply time via the standard 3-factor ceremony
-- (node scripts/apply-migration.js --prod-deploy --issue-token <token>).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE GAP THIS CLOSES: database/migrations/20260718_sms_outbound_obligations_STAGED.sql was
-- edited AFTER the real apply to describe a status CHECK admitting 'owed_escalate' and a
-- prior_provider_message_ids column, but the migration that actually ran
-- (20260718_sms_outbound_obligations_APPROVED.sql, sha256-matched in schema_migrations_applied,
-- applied_at 2026-07-19T13:39:00Z) has neither -- confirmed by diffing the two files directly.
-- lib/chairman/sms-outbound-worker.js escalate() writes status='owed_escalate' and the worker
-- reads/writes prior_provider_message_ids; against the LIVE table both fail: the CHECK rejects
-- 'owed_escalate' outright, and the column simply doesn't exist. This migration makes the live
-- schema match what the code and the (already-drifted) STAGED file both assume.
--
-- WHY A SEPARATE FILE, NOT AN EDIT TO THE 20260718 FILES: migrations in this repo are
-- append-only (matches the belt_capacity_verdicts / solomon_ledger family this session has
-- touched) -- 20260718_sms_outbound_obligations_APPROVED.sql is the historical record of what
-- was actually applied and must not be rewritten in place.
--
-- WHY THIS SD'S OWN COMPLETION DOES NOT WAIT ON THIS FILE BEING APPLIED (TR-2): a worker cannot
-- itself run a chairman-gated apply. Gating LEAD-FINAL-APPROVAL on the chairman having applied
-- this file would repeat the exact phantom-completion pattern
-- (SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A) that produced this bug in the first place -- the
-- worker-side fix (7 discard sites + this staged migration) ships on its own merits; the apply is
-- a separate chairman action tracked via the handoff package (see FR-5 / worker-signal.cjs
-- feedback).
--
-- SEC-L1/L2 convention (bounded lock wait, own transaction, trailing PostgREST reload) matching
-- every sibling chairman-gated migration this session.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ============================================================
-- 0. PRE-FLIGHT GUARD: refuse to run against a table state this migration did not expect.
-- ============================================================
DO $preflight$
BEGIN
  IF to_regclass('public.sms_outbound_obligations') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: public.sms_outbound_obligations does not exist -- apply database/migrations/20260718_sms_outbound_obligations_APPROVED.sql first';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sms_outbound_obligations' AND column_name = 'prior_provider_message_ids'
  ) THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: public.sms_outbound_obligations.prior_provider_message_ids already exists -- this migration has already applied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sms_outbound_obligations'::regclass
      AND conname = 'sms_outbound_obligations_status_check'
      AND pg_get_constraintdef(oid) LIKE '%owed_escalate%'
  ) THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: sms_outbound_obligations_status_check already admits owed_escalate -- this migration has already applied';
  END IF;
END
$preflight$;

-- ============================================================
-- 1. prior_provider_message_ids (Solomon Pin #2). Additive, defaulted -- every existing row
--    backfills to '{}', meaning "no prior SID recorded", which is true for every row written
--    before this column existed.
-- ============================================================
ALTER TABLE public.sms_outbound_obligations
  ADD COLUMN IF NOT EXISTS prior_provider_message_ids TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.sms_outbound_obligations.prior_provider_message_ids IS
  'SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A (Solomon Pin #2): prior Twilio SID(s) from earlier send attempts on this obligation, preserved across a resend. A late-arriving delivery callback for a PRIOR SID still resolves against this row (matched via containment) instead of silently no-op''ing once provider_message_id is overwritten by the newest attempt.';

-- ============================================================
-- 2. Widen the status CHECK to also admit 'owed_escalate' (Solomon Pin #3). Postgres has no
--    ALTER CONSTRAINT to widen a CHECK in place -- drop and recreate under the SAME
--    auto-generated name so nothing downstream that references the name needs to change.
-- ============================================================
ALTER TABLE public.sms_outbound_obligations
  DROP CONSTRAINT IF EXISTS sms_outbound_obligations_status_check;

ALTER TABLE public.sms_outbound_obligations
  ADD CONSTRAINT sms_outbound_obligations_status_check
  CHECK (status IN ('owed','sending','sent','delivered','undelivered','failed','canceled','owed_escalate'));

COMMENT ON COLUMN public.sms_outbound_obligations.status IS
  'owed_escalate (SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A Solomon Pin #3): a sent-no-callback row whose provider-status-check itself failed or returned an inconclusive answer. Distinct from failed/undelivered (which ARE provider-confirmed) -- escalate rather than guess, never silently closed.';

-- ============================================================
-- 3. Self-verify in-transaction rather than exiting green on a partial apply.
-- ============================================================
DO $verify$
DECLARE
  v_count int;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sms_outbound_obligations'
        AND column_name = 'prior_provider_message_ids' AND data_type = 'ARRAY' AND is_nullable = 'NO') <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: prior_provider_message_ids is not TEXT[] NOT NULL';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.sms_outbound_obligations'::regclass
    AND conname = 'sms_outbound_obligations_status_check'
    AND pg_get_constraintdef(oid) LIKE '%owed%'
    AND pg_get_constraintdef(oid) LIKE '%owed_escalate%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: sms_outbound_obligations_status_check does not admit both the original statuses and owed_escalate';
  END IF;

  -- Every pre-existing row backfilled prior_provider_message_ids='{}' and no row was rewritten
  -- to a status value that did not already exist.
  IF EXISTS (SELECT 1 FROM public.sms_outbound_obligations WHERE prior_provider_message_ids IS NULL) THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: a row has prior_provider_message_ids IS NULL after a NOT NULL DEFAULT ''{}'' backfill -- should be structurally impossible';
  END IF;

  RAISE NOTICE 'sms_outbound_obligations owed_escalate/prior_provider_message_ids drift-fix verified: column added, CHECK widened, all rows backfilled';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
