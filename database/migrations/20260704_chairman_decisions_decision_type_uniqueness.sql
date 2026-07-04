-- =============================================================================
-- Migration: chairman_decisions — widen uniqueness to include decision_type
-- SD: SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001
-- Date: 2026-07-04
--
-- Provenance note: this migration documents a schema change already applied
-- live during this SD's EXEC phase (via a database-agent sub-agent run) but
-- never committed as a migration file -- an independent testing-agent
-- verification pass caught the gap (repo/DB drift: reproducible-from-repo
-- invariant broken). This file makes the live change reproducible. All
-- statements are idempotent (guarded DROP + recreate) so re-running this file
-- against the already-patched live DB is a safe no-op.
--
-- Purpose:
--   SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 (FR-1) requires a NEW
--   decision_type='product_review' chairman_decisions row to coexist with the
--   pre-existing decision_type='stage_gate' (kill-gate) row at the SAME
--   (venture_id, lifecycle_stage=23) -- two independently-tracked verdicts,
--   never merged into one. Two live uniqueness objects blocked this:
--
--   1. uq_chairman_decision_attempt: UNIQUE (venture_id, lifecycle_stage,
--      attempt_number). attempt_number defaults to a hardcoded 1 -- grep
--      across lib/ finds ZERO call sites that ever set it explicitly. So
--      inserting a SECOND decision_type at a stage that already has one
--      collides on (venture_id, lifecycle_stage, attempt_number=1) even
--      though the decision_type differs.
--
--   2. idx_chairman_decisions_unique_pending: a STANDALONE partial unique
--      INDEX (invisible to a pg_constraint-only query --
--      `UNIQUE (venture_id, lifecycle_stage) WHERE status='pending'`),
--      discovered empirically (a real rolled-back insert 23505'd on THIS
--      object before ever reaching object #1). This is the one that fires
--      FIRST for the pending-decision case, so widening only object #1 would
--      have left the SD still blocked.
--
--   Both widenings are strictly additive (superset of key columns) --
--   existing data trivially satisfies the wider keys, no backfill needed.
--   decision_type is NOT NULL on this table, so there is no NULL-distinctness
--   surprise. Neither change affects any OTHER stage: every stage that (until
--   now) only ever minted ONE decision_type per venture+stage continues to
--   behave identically, since the wider key is still unique per that single
--   decision_type value.
--
-- Verified live (both by the original database-agent apply run and again
-- independently by a testing-agent real-DB integration pass,
-- tests/integration/eva/chairman-product-review-gate-realdb.test.js):
--   - a 'stage_gate' pending decision and a 'product_review' pending decision
--     now coexist at the same (venture_id, lifecycle_stage=23)
--   - a SECOND pending decision of the SAME decision_type at the same stage
--     still correctly 23505s (idx_chairman_decisions_unique_pending still
--     enforces one-pending-per-type)
--   - a duplicate (venture_id, lifecycle_stage, decision_type,
--     attempt_number) insert still correctly 23505s
--     (uq_chairman_decision_attempt still enforces per-type attempt history)
--   - approving one decision_type's row does not mutate the other's
--     status/decision columns
--
-- One documented code dependency (fixed in lockstep by the original
-- database-agent run, already live, no action needed here):
--   scripts/backfill-chairman-decisions-missing-rows.mjs used PostgREST
--   onConflict: 'venture_id,lifecycle_stage,attempt_number' -- updated to
--   'venture_id,lifecycle_stage,decision_type,attempt_number' to match the
--   widened key (a stale onConflict target 42P10s against a non-matching
--   unique index).
--
-- Rollback (only if this SD is fully reverted -- would re-block
-- FR-1's two-decision-type-per-stage design):
--   ALTER TABLE chairman_decisions DROP CONSTRAINT uq_chairman_decision_attempt;
--   ALTER TABLE chairman_decisions ADD CONSTRAINT uq_chairman_decision_attempt
--     UNIQUE (venture_id, lifecycle_stage, attempt_number);
--   DROP INDEX idx_chairman_decisions_unique_pending;
--   CREATE UNIQUE INDEX idx_chairman_decisions_unique_pending
--     ON chairman_decisions (venture_id, lifecycle_stage) WHERE (status = 'pending');
-- =============================================================================

BEGIN;

ALTER TABLE chairman_decisions DROP CONSTRAINT IF EXISTS uq_chairman_decision_attempt;
ALTER TABLE chairman_decisions
  ADD CONSTRAINT uq_chairman_decision_attempt
  UNIQUE (venture_id, lifecycle_stage, decision_type, attempt_number);

DROP INDEX IF EXISTS idx_chairman_decisions_unique_pending;
CREATE UNIQUE INDEX idx_chairman_decisions_unique_pending
  ON chairman_decisions (venture_id, lifecycle_stage, decision_type)
  WHERE (status = 'pending');

DO $$
DECLARE
  v_constraint_def text;
  v_index_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_constraint_def
  FROM pg_constraint WHERE conname = 'uq_chairman_decision_attempt';

  SELECT indexdef INTO v_index_def
  FROM pg_indexes WHERE indexname = 'idx_chairman_decisions_unique_pending';

  IF v_constraint_def IS NULL OR v_constraint_def NOT LIKE '%decision_type%' THEN
    RAISE EXCEPTION 'uq_chairman_decision_attempt did not widen as expected: %', v_constraint_def;
  END IF;

  IF v_index_def IS NULL OR v_index_def NOT LIKE '%decision_type%' THEN
    RAISE EXCEPTION 'idx_chairman_decisions_unique_pending did not widen as expected: %', v_index_def;
  END IF;

  RAISE NOTICE 'chairman_decisions uniqueness widened OK: constraint=%, index=%', v_constraint_def, v_index_def;
END $$;

COMMIT;
