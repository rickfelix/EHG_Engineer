-- venture_channel_publish_ledger: widen the outcome CHECK domain to add 'unmeasurable' —
-- SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 (FR-6).
--
-- WHY: this SD's outcome observer joins the ledger to campaign_content (via
-- correlation_id = idempotency_key) to recover a real platform post id before it can ever
-- observe a post's actual state. Some ledger rows will never have a joinable
-- campaign_content row (the publish failed before a post existed, or the join genuinely
-- has no counterpart) -- there is no traceable artifact to EVER determine a real outcome
-- for these rows. Forcing them to stay 'unknown' forever is the same lying-instrument
-- defect database/migrations/20260828_solomon_ledger_outcome_unmeasurable.sql already
-- exists to close for the sibling solomon_advice_outcome_ledger table; this migration
-- mirrors that exact precedent and pattern for this ledger.
--
-- Purely additive: widens an existing CHECK constraint (DROP + re-ADD with the superset
-- list). No column added, no existing row's value becomes invalid, no data rewritten.
-- Constraint name confirmed via live pg_constraint introspection (2026-09-12):
-- venture_channel_publish_ledger_outcome_check.
--
-- DEPLOYMENT ORDERING (TR-8): this migration must be applied BEFORE, or atomically with,
-- the JS allowlist widen in lib/marketing/autonomy-gate.js recordPublishOutcome(). If the
-- JS side ships first, every 'unmeasurable' write reaches the DB and fails this
-- constraint (23514) until this migration lands -- handled explicitly and non-silently in
-- code (TR-9: classified 'expected-pre-migration', never conflated with a genuine failure
-- or silently absorbed into a successful-looking classification count), mirroring
-- 20260828's own documented pre-apply degrade pattern.
--
-- caused_rework is NOT removed or altered by this migration -- it remains a valid value,
-- simply unexercised by any code path this SD adds (no rework signal exists anywhere in
-- the codebase today; confirmed independently by LEAD's direct read and TESTING's
-- re-verification of lib/marketing/ai/metrics-ingestor.js and variant-outcome-derivation.js).
--
-- requires-chairman-apply
--
-- No explicit transaction wrapper needed here — apply-migration.js wraps the whole file;
-- this migration is a single DROP+ADD pair with no dollar-quoted DO blocks other than the
-- pre/post asserts below, so either both statements land or neither does either way.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Pre-assert: the constraint is the one we think it is, and the new value is not already
-- present (idempotency guard against double-apply).
DO $vcplou_pre$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.venture_channel_publish_ledger'::regclass
    AND conname  = 'venture_channel_publish_ledger_outcome_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'aborted: venture_channel_publish_ledger_outcome_check not found — investigate before applying';
  END IF;
  IF position('unmeasurable' in v_def) > 0 THEN
    RAISE EXCEPTION 'aborted: venture_channel_publish_ledger_outcome_check already permits unmeasurable — already applied, nothing to do';
  END IF;

  RAISE NOTICE 'venture_channel_publish_ledger outcome widen pre-assert OK; current def: %', v_def;
END
$vcplou_pre$;

ALTER TABLE public.venture_channel_publish_ledger
  DROP CONSTRAINT IF EXISTS venture_channel_publish_ledger_outcome_check;

ALTER TABLE public.venture_channel_publish_ledger
  ADD CONSTRAINT venture_channel_publish_ledger_outcome_check
  CHECK (outcome IN (
    'unknown', 'shipped_clean', 'reverted', 'caused_rework',
    -- SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001: no traceable artifact exists (or ever
    -- will) to determine this row's real outcome -- distinct from 'unknown' (not yet
    -- determined, still on an active resolution path).
    'unmeasurable'
  ));

COMMENT ON COLUMN public.venture_channel_publish_ledger.outcome IS 'Set from the ACTUAL observed post/engagement result (lib/marketing/observer/observe-outcome.js), never self-reported at publish time. ''unmeasurable'' (SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001) means no traceable artifact will ever exist to determine a real outcome for this row (e.g. no joinable campaign_content row) -- distinct from ''unknown'' (not yet determined, still on an active resolution path). Excluded from evaluateGraduation''s streak window exactly like ''unknown'' (neither a clean win nor a streak-breaker).';

-- Post-assert: exercised, not merely read back — an insert-and-undo inside a
-- subtransaction proves the constraint actually admits the new value.
DO $vcplou_post$
DECLARE
  v_def  text;
  v_id   uuid;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.venture_channel_publish_ledger'::regclass
    AND conname  = 'venture_channel_publish_ledger_outcome_check';
  IF v_def IS NULL OR position('unmeasurable' in v_def) = 0 THEN
    RAISE EXCEPTION 'post-assert failed: widened constraint missing unmeasurable after ALTER (def: %)', COALESCE(v_def, '<missing>');
  END IF;

  SELECT id INTO v_id FROM venture_channel_publish_ledger LIMIT 1;
  IF v_id IS NOT NULL THEN
    BEGIN
      UPDATE venture_channel_publish_ledger SET outcome = 'unmeasurable' WHERE id = v_id;
      RAISE EXCEPTION 'vcplou_probe_ok';   -- forced abort of THIS subtransaction only
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'vcplou_probe_ok' THEN RAISE; END IF;
        RAISE NOTICE 'venture_channel_publish_ledger outcome widen: constraint verified by exercise (unmeasurable accepted, probe undone)';
    END;
  END IF;

  RAISE NOTICE 'venture_channel_publish_ledger outcome widen complete; new def: %', v_def;
END
$vcplou_post$;

-- VERIFY (run after apply; this file's existence is a lead, never proof a live object changed):
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.venture_channel_publish_ledger'::regclass
--      AND conname  = 'venture_channel_publish_ledger_outcome_check';
--
--   -- must be 0 (nothing invalidated):
--   SELECT count(*) FROM venture_channel_publish_ledger
--    WHERE outcome NOT IN ('unknown','shipped_clean','reverted','caused_rework','unmeasurable');
