-- ============================================================================
-- Migration: Add Causality Columns to system_events (Event Linking Pattern)
-- ============================================================================
-- Date: 2025-12-20
-- SD: SD-UNIFIED-PATH-1.1.1-PATCH
-- Purpose: Add Event Linking Pattern columns for immutable audit trail
--
-- Strategic Audit Requirement (Codex + Anti-Gravity):
--   Constraint 1: Immutability & Causality
--   - Original prediction events remain unchanged (immutable)
--   - Outcome events link to predictions via parent_event_id
--   - Actor identification enables accountability audit
--
-- New Columns:
--   - parent_event_id: UUID FK to system_events(id) for event linking
--   - actor_type: 'human' | 'agent' | 'system' for accountability
--   - actor_role: Specific role identifier (CEO, VP_IDEATION, HUMAN_OVERRIDE, etc.)
--
-- Safety:
--   - Idempotent (IF NOT EXISTS pattern simulated via exception handling)
--   - All columns nullable (no data migration needed)
--
-- Execution: psql or Supabase dashboard
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) Add parent_event_id column for Event Linking
-- ============================================================================
-- Purpose: Links outcome events to prediction events without mutating originals
-- Pattern: Outcome event references prediction event, calibration computed on outcome

DO $$
BEGIN
  -- Add parent_event_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'system_events'
    AND column_name = 'parent_event_id'
  ) THEN
    ALTER TABLE public.system_events
    ADD COLUMN parent_event_id UUID REFERENCES public.system_events(id);

    COMMENT ON COLUMN public.system_events.parent_event_id IS
      'Links outcome events to prediction events (Event Linking Pattern). '
      'Enables causality chain without mutating original events. '
      'Added by SD-UNIFIED-PATH-1.1.1-PATCH.';
  END IF;
END $$;

-- ============================================================================
-- 2) Add actor_type column for accountability
-- ============================================================================
-- Purpose: Identifies whether action was taken by human, agent, or system
-- Values: 'human' (Chairman override), 'agent' (CEO/VP), 'system' (automated)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'system_events'
    AND column_name = 'actor_type'
  ) THEN
    ALTER TABLE public.system_events
    ADD COLUMN actor_type VARCHAR(20)
    CHECK (actor_type IN ('human', 'agent', 'system'));

    COMMENT ON COLUMN public.system_events.actor_type IS
      'Accountability: who initiated this event. '
      'Values: human (Chairman/user override), agent (CEO/VP/worker), system (automated trigger). '
      'Added by SD-UNIFIED-PATH-1.1.1-PATCH.';
  END IF;
END $$;

-- ============================================================================
-- 3) Add actor_role column for specific role identification
-- ============================================================================
-- Purpose: More granular than actor_type - identifies specific role
-- Examples: 'CEO', 'VP_IDEATION', 'VP_VALIDATION', 'ANALYST', 'HUMAN_OVERRIDE', 'SCHEDULER'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'system_events'
    AND column_name = 'actor_role'
  ) THEN
    ALTER TABLE public.system_events
    ADD COLUMN actor_role VARCHAR(50);

    COMMENT ON COLUMN public.system_events.actor_role IS
      'Specific role of actor: CEO, VP_IDEATION, VP_VALIDATION, ANALYST, REVIEWER, '
      'HUMAN_OVERRIDE (Chairman), SCHEDULER (cron), TRIGGER (DB trigger). '
      'Added by SD-UNIFIED-PATH-1.1.1-PATCH.';
  END IF;
END $$;

-- ============================================================================
-- 4) Create index on parent_event_id for causality queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_system_events_parent_event_id
  ON public.system_events(parent_event_id)
  WHERE parent_event_id IS NOT NULL;

-- ============================================================================
-- 5) Create index on actor_type for accountability queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_system_events_actor_type
  ON public.system_events(actor_type)
  WHERE actor_type IS NOT NULL;

-- ============================================================================
-- 6) Update helper function to support new columns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_log_system_event(
  p_event_type VARCHAR(50),
  p_venture_id UUID DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL,
  p_agent_type VARCHAR(50) DEFAULT NULL,
  p_token_cost INTEGER DEFAULT 0,
  p_predicted_outcome JSONB DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb,
  -- SD-1.1.1-PATCH: New parameters for causality
  p_parent_event_id UUID DEFAULT NULL,
  p_actor_type VARCHAR(20) DEFAULT 'system',
  p_actor_role VARCHAR(50) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
  v_idempotency_key VARCHAR(100);
BEGIN
  -- Generate idempotency key
  v_idempotency_key := p_event_type || ':' ||
    COALESCE(p_venture_id::text, 'global') || ':' ||
    EXTRACT(EPOCH FROM NOW())::bigint::text;

  -- Insert event with causality columns
  INSERT INTO public.system_events (
    event_type, venture_id, correlation_id, idempotency_key,
    agent_id, agent_type, token_cost, predicted_outcome, payload,
    -- SD-1.1.1-PATCH: New columns
    parent_event_id, actor_type, actor_role
  ) VALUES (
    p_event_type, p_venture_id, p_correlation_id, v_idempotency_key,
    p_agent_id, p_agent_type, p_token_cost, p_predicted_outcome, p_payload,
    p_parent_event_id, p_actor_type, p_actor_role
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.fn_log_system_event IS
  'Helper function to log system events with automatic idempotency key generation. '
  'Supports Event Linking Pattern via parent_event_id parameter. '
  'Updated by SD-UNIFIED-PATH-1.1.1-PATCH.';

-- ============================================================================
-- 7) Create helper function for outcome event logging
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_log_outcome_event(
  p_parent_event_id UUID,
  p_actual_outcome JSONB,
  p_calibration_delta NUMERIC(5,2) DEFAULT NULL,
  p_actor_type VARCHAR(20) DEFAULT 'system',
  p_actor_role VARCHAR(50) DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
  v_parent_event RECORD;
  v_idempotency_key VARCHAR(100);
BEGIN
  -- Get parent event details
  SELECT event_type, venture_id, correlation_id, agent_id, agent_type
  INTO v_parent_event
  FROM public.system_events
  WHERE id = p_parent_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent event % not found', p_parent_event_id;
  END IF;

  -- Generate idempotency key for outcome
  v_idempotency_key := 'OUTCOME:' || p_parent_event_id::text || ':' ||
    EXTRACT(EPOCH FROM NOW())::bigint::text;

  -- Insert outcome event linked to parent
  INSERT INTO public.system_events (
    event_type, venture_id, correlation_id, idempotency_key,
    agent_id, agent_type,
    parent_event_id, actual_outcome, calibration_delta,
    actor_type, actor_role,
    payload, resolved_at
  ) VALUES (
    v_parent_event.event_type || '_OUTCOME',
    v_parent_event.venture_id,
    v_parent_event.correlation_id,
    v_idempotency_key,
    v_parent_event.agent_id,
    v_parent_event.agent_type,
    p_parent_event_id,
    p_actual_outcome,
    p_calibration_delta,
    p_actor_type,
    p_actor_role,
    CASE WHEN p_notes IS NOT NULL
      THEN jsonb_build_object('notes', p_notes)
      ELSE '{}'::jsonb
    END,
    NOW()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.fn_log_outcome_event IS
  'Helper function to log outcome events linked to prediction events. '
  'Implements Event Linking Pattern for Truth Layer calibration. '
  'Creates immutable audit trail - original predictions never modified. '
  'Created by SD-UNIFIED-PATH-1.1.1-PATCH.';

-- ============================================================================
-- 8) Create view for causality chain analysis
-- ============================================================================

CREATE OR REPLACE VIEW public.v_event_causality_chain AS
SELECT
  e.id,
  e.event_type,
  e.parent_event_id,
  e.actor_type,
  e.actor_role,
  e.predicted_outcome,
  e.actual_outcome,
  e.calibration_delta,
  e.venture_id,
  e.correlation_id,
  e.created_at,
  e.resolved_at,
  -- Depth in causality chain (0 = root event)
  COALESCE(
    (
      WITH RECURSIVE chain AS (
        SELECT id, parent_event_id, 0 as depth
        FROM public.system_events
        WHERE id = e.id
        UNION ALL
        SELECT se.id, se.parent_event_id, c.depth + 1
        FROM public.system_events se
        JOIN chain c ON se.id = c.parent_event_id
      )
      SELECT MAX(depth) FROM chain
    ),
    0
  ) as chain_depth,
  -- Is this an outcome event?
  CASE
    WHEN e.parent_event_id IS NOT NULL AND e.actual_outcome IS NOT NULL
    THEN true
    ELSE false
  END as is_outcome_event
FROM public.system_events e;

COMMENT ON VIEW public.v_event_causality_chain IS
  'View for analyzing event causality chains. '
  'Shows chain depth (0=root), parent linkage, and outcome status. '
  'Created by SD-UNIFIED-PATH-1.1.1-PATCH.';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- After running, verify with:
--
-- 1. Check new columns exist:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'system_events'
-- AND column_name IN ('parent_event_id', 'actor_type', 'actor_role');
--
-- 2. Check FK constraint:
-- SELECT conname, confrelid::regclass
-- FROM pg_constraint
-- WHERE conname LIKE '%parent_event%';
--
-- 3. Check indexes:
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'system_events'
-- AND indexname LIKE '%parent%' OR indexname LIKE '%actor%';
--
-- 4. Test outcome event logging:
-- DO $$
-- DECLARE
--   v_prediction_id UUID;
--   v_outcome_id UUID;
-- BEGIN
--   -- Create prediction event
--   v_prediction_id := fn_log_system_event(
--     'STAGE_TRANSITION',
--     NULL,
--     gen_random_uuid(),
--     NULL, NULL, 0,
--     '{"expected_state": "stage_2", "confidence": 0.85}'::jsonb,
--     '{}'::jsonb,
--     NULL,
--     'agent',
--     'CEO'
--   );
--
--   -- Create outcome event
--   v_outcome_id := fn_log_outcome_event(
--     v_prediction_id,
--     '{"actual_state": "stage_2", "success": true}'::jsonb,
--     0.0,
--     'system',
--     'VALIDATOR',
--     'Transition succeeded as predicted'
--   );
--
--   RAISE NOTICE 'Prediction: %, Outcome: %', v_prediction_id, v_outcome_id;
-- END $$;
--
-- 5. Query causality chain:
-- SELECT * FROM v_event_causality_chain
-- WHERE parent_event_id IS NOT NULL
-- ORDER BY created_at DESC LIMIT 5;
