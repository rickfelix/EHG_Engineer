-- Migration: Fix chairman_unified_decisions and chairman_pending_decisions views
-- Issue: Status CASE mapping in chairman_decisions branch doesn't handle decision='pending'
--        It falls to ELSE 'decided' which gets excluded from the pending view.
--        The S19 and S16 API Linter records (status=pending, decision=pending) are invisible.
-- Date: 2026-03-27

-- Step 1: Drop dependent view first, then parent
DROP VIEW IF EXISTS chairman_pending_decisions CASCADE;

DROP VIEW IF EXISTS chairman_unified_decisions CASCADE;

-- Step 2: Recreate unified view with fixed chairman_decisions CASE mapping
CREATE OR REPLACE VIEW chairman_unified_decisions AS
  -- Source 1: Agent escalations (pending only)
  SELECT am.id,
    'escalation'::text AS decision_type,
    am.subject AS title,
    (COALESCE(am.priority, 'normal'::character varying))::text AS priority,
    'pending'::text AS status,
    ar.venture_id,
    NULL::integer AS stage,
    NULL::text AS gate_type,
    NULL::text AS recommendation,
    am.response_deadline,
    am.created_at,
    NULL::timestamp with time zone AS decided_at,
    NULL::uuid AS decided_by,
    ar.display_name AS requestor_name,
    v.name AS venture_name,
    jsonb_build_object('message_type', am.message_type, 'body', am.body, 'from_agent_id', am.from_agent_id) AS details
  FROM agent_messages am
    LEFT JOIN agent_registry ar ON ar.id = am.from_agent_id
    LEFT JOIN ventures v ON v.id = ar.venture_id
  WHERE am.message_type::text = 'escalation'::text
    AND am.status::text = 'pending'::text

UNION ALL
  -- Source 2: Venture gate decisions (pending - no decision yet)
  SELECT vd.id,
    'gate_decision'::text AS decision_type,
    concat('Stage ', vd.stage, ' Gate Decision') AS title,
    CASE
      WHEN vd.gate_type = 'hard_gate'::text THEN 'critical'::text
      WHEN vd.gate_type = 'advisory_checkpoint'::text THEN 'high'::text
      ELSE 'normal'::text
    END AS priority,
    'pending'::text AS status,
    vd.venture_id,
    vd.stage,
    vd.gate_type,
    vd.recommendation,
    NULL::timestamp with time zone AS response_deadline,
    vd.created_at,
    NULL::timestamp with time zone AS decided_at,
    NULL::uuid AS decided_by,
    NULL::text AS requestor_name,
    v.name AS venture_name,
    jsonb_build_object('notes', vd.notes, 'current_stage', v.current_lifecycle_stage, 'health_score', v.health_score) AS details
  FROM venture_decisions vd
    LEFT JOIN ventures v ON v.id = vd.venture_id
  WHERE vd.decision IS NULL

UNION ALL
  -- Source 3: Venture gate decisions (decided)
  SELECT vd.id,
    'gate_decision'::text AS decision_type,
    concat('Stage ', vd.stage, ' Gate Decision') AS title,
    CASE
      WHEN vd.gate_type = 'hard_gate'::text THEN 'critical'::text
      WHEN vd.gate_type = 'advisory_checkpoint'::text THEN 'high'::text
      ELSE 'normal'::text
    END AS priority,
    CASE
      WHEN vd.decision = 'proceed'::text THEN 'approved'::text
      WHEN vd.decision = ANY (ARRAY['kill'::text, 'pause'::text]) THEN 'rejected'::text
      ELSE 'decided'::text
    END AS status,
    vd.venture_id,
    vd.stage,
    vd.gate_type,
    vd.recommendation,
    NULL::timestamp with time zone AS response_deadline,
    vd.created_at,
    vd.decided_at,
    vd.decided_by,
    NULL::text AS requestor_name,
    v.name AS venture_name,
    jsonb_build_object('notes', vd.notes, 'decision', vd.decision, 'current_stage', v.current_lifecycle_stage, 'health_score', v.health_score) AS details
  FROM venture_decisions vd
    LEFT JOIN ventures v ON v.id = vd.venture_id
  WHERE vd.decision IS NOT NULL

UNION ALL
  -- Source 4: Chairman decisions (FIX: handle decision='pending' -> status='pending')
  SELECT cd.id,
    'chairman_approval'::text AS decision_type,
    concat('Stage ', cd.lifecycle_stage, ' Chairman Approval') AS title,
    'critical'::text AS priority,
    CASE
      WHEN cd.status = 'pending'::text THEN 'pending'::text
      WHEN cd.decision::text = 'proceed'::text THEN 'approved'::text
      WHEN cd.decision::text = ANY (ARRAY['kill'::character varying, 'pause'::character varying]::text[]) THEN 'rejected'::text
      WHEN cd.decision::text = 'pivot'::text THEN 'pivot'::text
      WHEN cd.decision::text = 'fix'::text THEN 'fix'::text
      WHEN cd.decision::text = 'override'::text THEN 'override'::text
      ELSE 'decided'::text
    END AS status,
    cd.venture_id,
    cd.lifecycle_stage AS stage,
    NULL::text AS gate_type,
    cd.recommendation,
    NULL::timestamp with time zone AS response_deadline,
    cd.created_at,
    cd.created_at AS decided_at,
    NULL::uuid AS decided_by,
    NULL::text AS requestor_name,
    v.name AS venture_name,
    jsonb_build_object('health_score', cd.health_score, 'override_reason', cd.override_reason, 'risks_acknowledged', cd.risks_acknowledged, 'quick_fixes_applied', cd.quick_fixes_applied) AS details
  FROM chairman_decisions cd
    LEFT JOIN ventures v ON v.id = cd.venture_id;

-- Step 3: Recreate pending view with priority ordering
CREATE OR REPLACE VIEW chairman_pending_decisions AS
  SELECT * FROM chairman_unified_decisions
  WHERE status = 'pending'
  ORDER BY
    CASE priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
      ELSE 5
    END, created_at;

-- Step 4: Grant access
GRANT SELECT ON chairman_unified_decisions TO authenticated;

GRANT SELECT ON chairman_unified_decisions TO service_role;

GRANT SELECT ON chairman_pending_decisions TO authenticated;

GRANT SELECT ON chairman_pending_decisions TO service_role;

-- Rollback:
-- DROP VIEW IF EXISTS chairman_pending_decisions CASCADE;
-- DROP VIEW IF EXISTS chairman_unified_decisions CASCADE;
-- Then recreate original views from git history
