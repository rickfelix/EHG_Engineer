-- ============================================================================
-- Migration: Create system_events table (6-Pillar DNA)
-- ============================================================================
-- Date: 2025-12-20
-- SD: SD-UNIFIED-PATH-1.1.1
-- Purpose: Create the "Black Box" audit table for all agent actions
--
-- 6-Pillar DNA:
--   Pillar 2 (Command Engine): event_type, correlation_id, idempotency_key
--   Pillar 4 (Crew Registry): agent_id, agent_type
--   Pillar 5 (Capital Ledger): token_cost, budget_remaining
--   Pillar 6 (Truth Layer): predicted_outcome, actual_outcome, calibration_delta
--
-- Safety:
--   - Idempotent (IF NOT EXISTS, DROP IF EXISTS)
--   - RLS enabled with service_role full access
--
-- Execution: psql or Supabase dashboard
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) Create the system_events table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_events (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- =========================================================================
  -- Pillar 2: Command Engine (Core Event Identity)
  -- =========================================================================
  event_type VARCHAR(50) NOT NULL,
    -- Examples: 'STAGE_TRANSITION', 'TOKEN_DEDUCTION', 'AGENT_ACTION',
    --           'HANDOFF_PROPOSED', 'HANDOFF_COMMITTED', 'DIRECTIVE_ISSUED'

  correlation_id UUID,
    -- Links related events across a single operation
    -- Example: All events from one stage transition share correlation_id

  idempotency_key VARCHAR(100) UNIQUE,
    -- Prevents duplicate event processing
    -- Format: "{event_type}:{venture_id}:{timestamp_ms}"

  -- =========================================================================
  -- Pillar 4: Crew Registry (Agent Identity)
  -- =========================================================================
  agent_id UUID,
    -- References agent_registry.id (FK added when agent_registry exists)

  agent_type VARCHAR(50),
    -- Agent role: 'CEO', 'VP_IDEATION', 'VP_VALIDATION', 'ANALYST', 'REVIEWER'
    -- Denormalized for query performance

  -- =========================================================================
  -- Pillar 5: Capital Ledger (Token Economics)
  -- =========================================================================
  token_cost INTEGER DEFAULT 0,
    -- Tokens consumed by this action
    -- Positive = consumption, Negative = refund (rare)

  budget_remaining INTEGER,
    -- Snapshot of venture token budget at event time
    -- Enables "budget timeline" reconstruction

  -- =========================================================================
  -- Pillar 6: Truth Layer (Assumption Calibration)
  -- =========================================================================
  predicted_outcome JSONB,
    -- What the agent expected to happen
    -- Schema: { "expected_state": "...", "confidence": 0.85, "assumptions": [...] }

  actual_outcome JSONB,
    -- What actually happened (populated after action completes)
    -- Schema: { "actual_state": "...", "success": true/false, "notes": "..." }

  calibration_delta NUMERIC(5,2),
    -- Variance between predicted and actual (-1.0 to 1.0)
    -- -1.0 = completely wrong, 0 = perfect prediction, 1.0 = exceeded expectations
    -- NULL until actual_outcome is populated

  -- =========================================================================
  -- Context & Metadata
  -- =========================================================================
  venture_id UUID,
    -- References ventures.id (FK added if ventures table exists)

  stage_id INTEGER,
    -- The lifecycle stage this event relates to (1-25)

  payload JSONB DEFAULT '{}'::jsonb,
    -- Flexible event-specific data
    -- Schema varies by event_type

  -- =========================================================================
  -- Timestamps
  -- =========================================================================
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Optional: When actual_outcome was populated
  resolved_at TIMESTAMPTZ
);

-- ============================================================================
-- 2) Create indexes for common query patterns
-- ============================================================================

-- Query by correlation (find all events in a transaction)
CREATE INDEX IF NOT EXISTS idx_system_events_correlation_id
  ON public.system_events(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Query by venture (venture-scoped audit trail)
CREATE INDEX IF NOT EXISTS idx_system_events_venture_id
  ON public.system_events(venture_id)
  WHERE venture_id IS NOT NULL;

-- Query by event type (event stream filtering)
CREATE INDEX IF NOT EXISTS idx_system_events_event_type
  ON public.system_events(event_type);

-- Query by time (recent events, time-series analysis)
CREATE INDEX IF NOT EXISTS idx_system_events_created_at
  ON public.system_events(created_at DESC);

-- Query by agent (agent activity tracking)
CREATE INDEX IF NOT EXISTS idx_system_events_agent_id
  ON public.system_events(agent_id)
  WHERE agent_id IS NOT NULL;

-- Compound index for venture + time (common dashboard query)
CREATE INDEX IF NOT EXISTS idx_system_events_venture_time
  ON public.system_events(venture_id, created_at DESC)
  WHERE venture_id IS NOT NULL;

-- ============================================================================
-- 3) Enable Row Level Security
-- ============================================================================

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS system_events_service_role_all ON public.system_events;
DROP POLICY IF EXISTS system_events_anon_select ON public.system_events;
DROP POLICY IF EXISTS system_events_authenticated_select ON public.system_events;

-- Service role has full access (for agent operations)
CREATE POLICY system_events_service_role_all
  ON public.system_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read events (for UI/dashboards)
CREATE POLICY system_events_authenticated_select
  ON public.system_events
  FOR SELECT
  TO authenticated
  USING (true);

-- Anon can read events (for public dashboards, if needed)
CREATE POLICY system_events_anon_select
  ON public.system_events
  FOR SELECT
  TO anon
  USING (true);

-- ============================================================================
-- 4) Add table and column comments
-- ============================================================================

COMMENT ON TABLE public.system_events IS
  'Black Box audit log for all agent actions, state transitions, and resource consumption.
   Supports all 6 Pillars: Command Engine (events), Crew Registry (agents),
   Capital Ledger (tokens), Truth Layer (calibration). Created by SD-UNIFIED-PATH-1.1.1.';

COMMENT ON COLUMN public.system_events.event_type IS
  'Event category. Values: STAGE_TRANSITION, TOKEN_DEDUCTION, AGENT_ACTION, HANDOFF_PROPOSED, HANDOFF_COMMITTED, DIRECTIVE_ISSUED';

COMMENT ON COLUMN public.system_events.correlation_id IS
  'Links related events in a single operation. All events from one stage transition share this ID.';

COMMENT ON COLUMN public.system_events.idempotency_key IS
  'Unique key to prevent duplicate event processing. Format: {event_type}:{venture_id}:{timestamp_ms}';

COMMENT ON COLUMN public.system_events.agent_id IS
  'Reference to agent_registry.id. The agent that triggered this event.';

COMMENT ON COLUMN public.system_events.agent_type IS
  'Denormalized agent role for query performance. Values: CEO, VP_IDEATION, VP_VALIDATION, ANALYST, REVIEWER';

COMMENT ON COLUMN public.system_events.token_cost IS
  'Tokens consumed by this action. Positive = consumption, Negative = refund.';

COMMENT ON COLUMN public.system_events.budget_remaining IS
  'Snapshot of venture token budget at event time. Enables budget timeline reconstruction.';

COMMENT ON COLUMN public.system_events.predicted_outcome IS
  'What the agent expected. Schema: { expected_state, confidence, assumptions[] }';

COMMENT ON COLUMN public.system_events.actual_outcome IS
  'What actually happened. Schema: { actual_state, success, notes }';

COMMENT ON COLUMN public.system_events.calibration_delta IS
  'Variance between predicted and actual (-1.0 to 1.0). NULL until actual_outcome populated.';

-- ============================================================================
-- 5) Create helper function for event insertion
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_log_system_event(
  p_event_type VARCHAR(50),
  p_venture_id UUID DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL,
  p_agent_type VARCHAR(50) DEFAULT NULL,
  p_token_cost INTEGER DEFAULT 0,
  p_predicted_outcome JSONB DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
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

  -- Insert event
  INSERT INTO public.system_events (
    event_type, venture_id, correlation_id, idempotency_key,
    agent_id, agent_type, token_cost, predicted_outcome, payload
  ) VALUES (
    p_event_type, p_venture_id, p_correlation_id, v_idempotency_key,
    p_agent_id, p_agent_type, p_token_cost, p_predicted_outcome, p_payload
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.fn_log_system_event IS
  'Helper function to log system events with automatic idempotency key generation.
   Returns event ID or NULL if duplicate (idempotent).';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- After running, verify with:
--
-- 1. Check table exists:
-- SELECT COUNT(*) FROM public.system_events;
--
-- 2. Check columns:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'system_events' ORDER BY ordinal_position;
--
-- 3. Test insert via helper function:
-- SELECT fn_log_system_event('TEST_EVENT', NULL, gen_random_uuid());
--
-- 4. Verify RLS:
-- SELECT * FROM pg_policies WHERE tablename = 'system_events';
