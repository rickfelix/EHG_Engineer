-- DOWN migration for 20260611_chairman_decision_queue.sql
-- Restores the pre-migration definitions VERBATIM (live defs verified via
-- pg_get_viewdef 2026-06-11; textual source: 20260327 migration + 20260602
-- security_invoker re-assert + 20260327 grants).
--
-- DROP + recreate is required (not CREATE OR REPLACE) because the UP migration
-- appended trailing columns, which CREATE OR REPLACE cannot remove.

-- ============================================================
-- Step 1: restore chairman_decisions.venture_id NOT NULL (guarded)
-- ============================================================
DO $$
DECLARE
  v_null_rows integer;
BEGIN
  SELECT count(*) INTO v_null_rows FROM chairman_decisions WHERE venture_id IS NULL;
  IF v_null_rows > 0 THEN
    RAISE EXCEPTION 'DOWN blocked: % chairman_decisions rows have venture_id IS NULL (session_question proxy rows). Delete or re-home them before restoring NOT NULL.', v_null_rows;
  END IF;
  ALTER TABLE chairman_decisions ALTER COLUMN venture_id SET NOT NULL;
END $$;

-- ============================================================
-- Step 2: drop the extended views (dependent first)
-- ============================================================
DROP VIEW IF EXISTS chairman_pending_decisions;

DROP VIEW IF EXISTS chairman_unified_decisions;

-- ============================================================
-- Step 3: recreate chairman_unified_decisions (pre-migration definition)
-- ============================================================
CREATE OR REPLACE VIEW chairman_unified_decisions WITH (security_invoker = on) AS
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
  -- Source 4: Chairman decisions (handle decision='pending' -> status='pending')
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

-- ============================================================
-- Step 4: recreate chairman_pending_decisions (pre-migration definition)
-- ============================================================
CREATE OR REPLACE VIEW chairman_pending_decisions WITH (security_invoker = on) AS
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

-- ============================================================
-- Step 5: restore grants (DROP discarded the ACLs; 20260327 set)
-- ============================================================
GRANT SELECT ON chairman_unified_decisions TO authenticated;

GRANT SELECT ON chairman_unified_decisions TO service_role;

GRANT SELECT ON chairman_pending_decisions TO authenticated;

GRANT SELECT ON chairman_pending_decisions TO service_role;
