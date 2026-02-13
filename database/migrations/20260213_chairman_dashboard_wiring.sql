-- Migration: Chairman Dashboard Wiring - Governance Plane
-- SD: SD-EVA-FEAT-DASHBOARD-WIRING-001
-- Purpose: RPC functions, views, and indexes for DecisionsInbox + EscalationPanel wiring

-- ============================================================
-- Step 1: Add decided_by column to chairman_decisions
-- ============================================================
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS decided_by TEXT;

-- Index for decided_by queries
CREATE INDEX IF NOT EXISTS idx_chairman_decisions_decided_by
  ON chairman_decisions (decided_by)
  WHERE decided_by IS NOT NULL;

-- ============================================================
-- Step 2: View for DecisionsInbox (pending decisions with venture context)
-- ============================================================
CREATE OR REPLACE VIEW v_chairman_pending_decisions AS
SELECT
  cd.id,
  cd.venture_id,
  v.name AS venture_name,
  cd.lifecycle_stage,
  lsc.stage_name,
  cd.health_score,
  cd.recommendation,
  cd.decision,
  cd.status,
  cd.summary,
  cd.brief_data,
  cd.override_reason,
  cd.risks_acknowledged,
  cd.quick_fixes_applied,
  cd.created_at,
  cd.updated_at,
  cd.decided_by,
  cd.rationale,
  -- Stale-context indicator: true if venture was updated after decision was created
  CASE
    WHEN v.updated_at > cd.created_at THEN true
    ELSE false
  END AS is_stale_context,
  v.updated_at AS venture_updated_at
FROM chairman_decisions cd
JOIN ventures v ON v.id = cd.venture_id
LEFT JOIN lifecycle_stage_config lsc ON lsc.stage_number = cd.lifecycle_stage
ORDER BY
  CASE cd.status WHEN 'pending' THEN 0 ELSE 1 END,
  cd.created_at DESC;

-- ============================================================
-- Step 3: Atomic approve/reject RPC with stale-context protection
-- ============================================================
CREATE OR REPLACE FUNCTION fn_chairman_decide(
  p_decision_id UUID,
  p_action TEXT,       -- 'approved' or 'rejected'
  p_decided_by TEXT,
  p_rationale TEXT DEFAULT NULL,
  p_force_stale BOOLEAN DEFAULT FALSE  -- override stale-context check
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_decision RECORD;
  v_venture RECORD;
  v_rows_updated INT;
BEGIN
  -- Validate action
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid action. Must be approved or rejected.',
      'code', 'INVALID_ACTION'
    );
  END IF;

  -- Fetch the decision with FOR UPDATE lock (prevents race conditions)
  SELECT cd.*, v.updated_at AS venture_updated_at, v.name AS venture_name
  INTO v_decision
  FROM chairman_decisions cd
  JOIN ventures v ON v.id = cd.venture_id
  WHERE cd.id = p_decision_id
  FOR UPDATE OF cd;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Decision not found.',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Double-decide prevention: only pending decisions can be decided
  IF v_decision.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Decision already %s by %s at %s.',
        v_decision.status,
        COALESCE(v_decision.decided_by, 'unknown'),
        v_decision.updated_at
      ),
      'code', 'ALREADY_DECIDED',
      'current_status', v_decision.status,
      'decided_by', v_decision.decided_by,
      'decided_at', v_decision.updated_at
    );
  END IF;

  -- Stale-context check: reject if venture was modified after decision was created
  IF NOT p_force_stale AND v_decision.venture_updated_at > v_decision.created_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Venture "%s" state has changed since this decision was created. Review updated state before deciding.', v_decision.venture_name),
      'code', 'STALE_CONTEXT',
      'decision_created_at', v_decision.created_at,
      'venture_updated_at', v_decision.venture_updated_at,
      'venture_name', v_decision.venture_name
    );
  END IF;

  -- Perform the atomic update
  UPDATE chairman_decisions
  SET
    status = p_action,
    decided_by = p_decided_by,
    rationale = COALESCE(p_rationale, rationale)
  WHERE id = p_decision_id
    AND status = 'pending';  -- Second safety check

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    -- Race condition: another session decided first
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Decision was modified by another session.',
      'code', 'CONCURRENT_MODIFICATION'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'action', p_action,
    'decided_by', p_decided_by,
    'venture_name', v_decision.venture_name
  );
END;
$$;

-- ============================================================
-- Step 4: Stale-context check function (callable independently)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_check_decision_staleness(p_decision_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_decision RECORD;
BEGIN
  SELECT cd.id, cd.status, cd.created_at,
         v.updated_at AS venture_updated_at, v.name AS venture_name
  INTO v_decision
  FROM chairman_decisions cd
  JOIN ventures v ON v.id = cd.venture_id
  WHERE cd.id = p_decision_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'error', 'Decision not found');
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'decision_id', v_decision.id,
    'status', v_decision.status,
    'is_stale', v_decision.venture_updated_at > v_decision.created_at,
    'decision_created_at', v_decision.created_at,
    'venture_updated_at', v_decision.venture_updated_at,
    'venture_name', v_decision.venture_name
  );
END;
$$;

-- ============================================================
-- Step 5: View for EscalationPanel (DFE escalation events)
-- ============================================================
CREATE OR REPLACE VIEW v_chairman_escalation_events AS
SELECT
  el.id,
  el.event_type,
  el.trigger_source,
  el.venture_id,
  v.name AS venture_name,
  el.correlation_id,
  el.status,
  el.error_message,
  el.metadata,
  el.created_at,
  -- Extract severity from metadata if present
  el.metadata->>'severity' AS severity,
  -- Extract escalation reason from metadata if present
  el.metadata->>'reason' AS escalation_reason
FROM eva_event_log el
LEFT JOIN ventures v ON v.id = el.venture_id
WHERE el.event_type LIKE 'dfe.%'
ORDER BY el.created_at DESC;

-- ============================================================
-- Step 6: Composite index for escalation event type + time queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_eva_event_log_dfe_events
  ON eva_event_log (event_type, created_at DESC)
  WHERE event_type LIKE 'dfe.%';

-- ============================================================
-- Step 7: Enable Realtime on eva_event_log for live updates
-- ============================================================
DO $$
BEGIN
  -- Only add if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'eva_event_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE eva_event_log;
  END IF;
END $$;

-- ============================================================
-- Step 8: Grant execute on RPC functions
-- ============================================================
GRANT EXECUTE ON FUNCTION fn_chairman_decide TO authenticated;
GRANT EXECUTE ON FUNCTION fn_chairman_decide TO service_role;
GRANT EXECUTE ON FUNCTION fn_check_decision_staleness TO authenticated;
GRANT EXECUTE ON FUNCTION fn_check_decision_staleness TO service_role;
