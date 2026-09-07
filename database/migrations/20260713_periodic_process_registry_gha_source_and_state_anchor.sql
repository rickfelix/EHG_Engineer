-- =============================================================================
-- Migration: periodic_process_registry -- widen liveness_source CHECK + add
--            last_state_changed_at anchor column
-- SD: SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-1)
-- Date: 2026-07-13
-- @approved-by: chairman-ratified build-vs-run D-set (D4)
-- @approved-by: codestreetlabs@gmail.com
--   (chairman verbal approval, 2026-07-13 ~06:25 ET, Adam session d02c9e34 — D4 apply-ceremony)
--
-- Two additive changes, bundled in one migration per this SD's own PRD (TR-2):
--
-- 1. Widen the liveness_source CHECK constraint to allow 'github_actions_api',
--    the new source FR-2's GitHub Actions API resolver stamps gha_cron:* rows
--    with. A CHECK widen cannot use the ADD COLUMN IF NOT EXISTS shape of the
--    two prior additive migrations on this table (20260704b_/20260711_) -- it
--    requires DROP CONSTRAINT + ADD CONSTRAINT on the existing column.
--
-- 2. Add last_state_changed_at timestamptz -- a durable latch-on-transition
--    timestamp required by FR-5. PRE-EXEC CORRECTION (TESTING sub-agent
--    FINDING-B, HIGH): periodic_process_registry.last_state is overwritten by
--    scripts/periodic-liveness-watcher.mjs every 15-min cycle regardless of
--    whether the state actually changed, and updated_at is bumped every cycle
--    too -- neither can answer "how long has this row been in its current
--    state," which FR-5's ">7 continuous days UNVERIFIED" escalation needs.
--    This column is set by the watcher ONLY on a genuine last_state
--    transition (mirroring the exact per-episode-transition discipline the
--    existing last_state column already uses, PR #5562 adversarial-review
--    finding on the prior SD) -- never reaffirmed on a same-state cycle.
-- =============================================================================

ALTER TABLE public.periodic_process_registry
  DROP CONSTRAINT periodic_process_registry_liveness_source_check;

ALTER TABLE public.periodic_process_registry
  ADD CONSTRAINT periodic_process_registry_liveness_source_check
  CHECK (liveness_source = ANY (ARRAY[
    'claude_sessions_heartbeat'::text,
    'eva_scheduler_heartbeat'::text,
    'self_stamped'::text,
    'github_actions_api'::text
  ]));

ALTER TABLE public.periodic_process_registry
  ADD COLUMN IF NOT EXISTS last_state_changed_at timestamptz;

COMMENT ON COLUMN public.periodic_process_registry.last_state_changed_at IS
'Timestamp of the most recent GENUINE last_state transition (previous last_state !=
new state), written by scripts/periodic-liveness-watcher.mjs. NOT bumped on a
same-state reaffirming cycle -- mirrors the last_state column''s own per-episode
dedup discipline (PR #5562). Used by FR-5 to measure ">7 continuous days
UNVERIFIED" without conflating it with updated_at (bumped every cycle
unconditionally).';

-- ---------------------------------------------------------------------------
-- Self-verification.
-- ---------------------------------------------------------------------------
DO $verify$
BEGIN
  ASSERT (
    SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid = 'public.periodic_process_registry'::regclass
      AND conname = 'periodic_process_registry_liveness_source_check'
  ) LIKE '%github_actions_api%', 'liveness_source CHECK did not widen to include github_actions_api';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'periodic_process_registry' AND column_name = 'last_state_changed_at'
  ), 'periodic_process_registry.last_state_changed_at column did not land';
END
$verify$;
