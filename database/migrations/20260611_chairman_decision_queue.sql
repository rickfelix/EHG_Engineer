-- @approved-by: codestreetlabs@gmail.com
-- approval context: chairman top-3 strategic pick 2026-06-10 (SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-001)
-- Migration: Chairman Decision Queue — extend the unified decision union-view stack
-- SD: SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-001
-- Date: 2026-06-11
--
-- WHAT THIS DOES
--   1. CREATE OR REPLACE chairman_unified_decisions:
--      - The 4 existing branches (agent_messages escalations, venture_decisions
--        pending, venture_decisions decided, chairman_decisions) are kept
--        BYTE-COMPATIBLE: their 16 output columns carry the exact same
--        expressions/types as the live definition (source: 20260327 migration,
--        verified against pg_get_viewdef on the live DB 2026-06-11).
--      - Adds 3 new UNION ALL branches (governance sources):
--          (a) feedback           -> decision_type 'flag_review'
--          (b) leo_feature_flags  -> decision_type 'flag_enablement'
--          (c) okr_generation_log -> decision_type 'okr_acceptance'
--      - Adds ONE trailing column `blocking boolean` to every branch (trailing
--        column addition is the CREATE OR REPLACE-safe shape; the existing 16
--        columns are unchanged). Needed by the pending view's ordering.
--   2. CREATE OR REPLACE chairman_pending_decisions:
--      - pending filter + ordering = blocking DESC, effective priority class,
--        created_at ASC. AGE ESCALATION: a row pending > 72h sorts ONE priority
--        class higher (computed `effective_priority`; `age_escalated` marker).
--      - CONSTITUTIONAL: nothing here decides anything. Age escalation changes
--        VISIBILITY (sort order) only. Defaults/recommendations are display-only.
--   3. ALTER chairman_decisions.venture_id DROP NOT NULL — required by FR-4
--      (recordPendingDecision proxy for ventureless session questions, e.g.
--      coordinator operator-question escalations). Non-breaking for existing
--      writers (they always supply venture_id).
--
-- POSTURE: both views carry security_invoker=on on the live DB (20260602
-- re-assert). Re-asserted here via WITH (security_invoker = on) so CREATE OR
-- REPLACE does not drop the option. No new grants (CREATE OR REPLACE preserves
-- existing ACLs).
--
-- Source-table columns verified live 2026-06-11 (information_schema.columns):
--   feedback: id uuid, title varchar NOT NULL, description text, severity varchar,
--             status varchar default 'new', category varchar, metadata jsonb,
--             resolved_at timestamptz, venture_id uuid, created_at timestamptz
--   leo_feature_flags: id uuid, flag_key text NOT NULL, display_name text NOT NULL,
--             description text, is_enabled bool NOT NULL, lifecycle_state
--             feature_flag_lifecycle_state NOT NULL, risk_tier enum, created_at timestamptz NOT NULL
--   okr_generation_log: id uuid, generation_date date NOT NULL, period text NOT NULL,
--             status text default 'completed', total_krs_generated int NOT NULL,
--             created_at timestamptz
--
-- Rollback: database/migrations/20260611_chairman_decision_queue_DOWN.sql

-- ============================================================
-- Step 1: chairman_decisions.venture_id nullable (FR-4 proxy rows)
-- ============================================================
ALTER TABLE chairman_decisions ALTER COLUMN venture_id DROP NOT NULL;

-- ============================================================
-- Step 2: chairman_unified_decisions — 4 existing branches verbatim
--         + trailing `blocking` column + 3 new governance branches
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
    jsonb_build_object('message_type', am.message_type, 'body', am.body, 'from_agent_id', am.from_agent_id) AS details,
    false AS blocking
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
    jsonb_build_object('notes', vd.notes, 'current_stage', v.current_lifecycle_stage, 'health_score', v.health_score) AS details,
    (vd.gate_type = 'hard_gate'::text) AS blocking
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
    jsonb_build_object('notes', vd.notes, 'decision', vd.decision, 'current_stage', v.current_lifecycle_stage, 'health_score', v.health_score) AS details,
    (vd.gate_type = 'hard_gate'::text) AS blocking
  FROM venture_decisions vd
    LEFT JOIN ventures v ON v.id = vd.venture_id
  WHERE vd.decision IS NOT NULL

UNION ALL
  -- Source 4: Chairman decisions (decision='pending' -> status='pending')
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
    jsonb_build_object('health_score', cd.health_score, 'override_reason', cd.override_reason, 'risks_acknowledged', cd.risks_acknowledged, 'quick_fixes_applied', cd.quick_fixes_applied) AS details,
    COALESCE(cd.blocking, false) AS blocking
  FROM chairman_decisions cd
    LEFT JOIN ventures v ON v.id = cd.venture_id

UNION ALL
  -- Source 5 (NEW): Unresolved critical/high feedback -> flag_review
  SELECT f.id,
    'flag_review'::text AS decision_type,
    (f.title)::text AS title,
    CASE
      WHEN f.severity::text = 'critical'::text THEN 'critical'::text
      ELSE 'high'::text
    END AS priority,
    'pending'::text AS status,
    f.venture_id,
    NULL::integer AS stage,
    NULL::text AS gate_type,
    NULLIF(f.metadata ->> 'recommendation', '') AS recommendation,
    NULL::timestamp with time zone AS response_deadline,
    f.created_at,
    NULL::timestamp with time zone AS decided_at,
    NULL::uuid AS decided_by,
    NULL::text AS requestor_name,
    v.name AS venture_name,
    jsonb_build_object('id', f.id, 'category', f.category, 'severity', f.severity, 'body', left(COALESCE(f.description, ''::text), 280)) AS details,
    (f.severity::text = 'critical'::text) AS blocking
  FROM feedback f
    LEFT JOIN ventures v ON v.id = f.venture_id
  WHERE f.severity::text = ANY (ARRAY['critical'::text, 'high'::text])
    AND f.resolved_at IS NULL
    AND COALESCE(f.status, 'new'::character varying)::text <> ALL (ARRAY['resolved'::text, 'wont_fix'::text])

UNION ALL
  -- Source 6 (NEW): Draft feature flags idle > 7 days -> flag_enablement
  SELECT ff.id,
    'flag_enablement'::text AS decision_type,
    concat('Feature flag: ', ff.flag_key) AS title,
    'normal'::text AS priority,
    'pending'::text AS status,
    NULL::uuid AS venture_id,
    NULL::integer AS stage,
    NULL::text AS gate_type,
    'Review for enablement or kill'::text AS recommendation,
    NULL::timestamp with time zone AS response_deadline,
    ff.created_at,
    NULL::timestamp with time zone AS decided_at,
    NULL::uuid AS decided_by,
    NULL::text AS requestor_name,
    NULL::character varying(255) AS venture_name,
    jsonb_build_object('flag_key', ff.flag_key, 'display_name', ff.display_name, 'description', ff.description, 'risk_tier', ff.risk_tier::text) AS details,
    false AS blocking
  FROM leo_feature_flags ff
  WHERE ff.is_enabled = false
    AND ff.lifecycle_state::text = 'draft'::text
    AND ff.created_at < (now() - interval '7 days')

UNION ALL
  -- Source 7 (NEW): OKR generations awaiting chairman acceptance -> okr_acceptance
  SELECT ogl.id,
    'okr_acceptance'::text AS decision_type,
    concat('Accept OKR generation — ', ogl.period, ' (', ogl.generation_date, ')') AS title,
    'high'::text AS priority,
    'pending'::text AS status,
    NULL::uuid AS venture_id,
    NULL::integer AS stage,
    NULL::text AS gate_type,
    'Review and accept or reject this OKR generation'::text AS recommendation,
    NULL::timestamp with time zone AS response_deadline,
    ogl.created_at,
    NULL::timestamp with time zone AS decided_at,
    NULL::uuid AS decided_by,
    NULL::text AS requestor_name,
    NULL::character varying(255) AS venture_name,
    jsonb_build_object('generation_id', ogl.id, 'period', ogl.period, 'generation_date', ogl.generation_date, 'total_krs_generated', ogl.total_krs_generated) AS details,
    false AS blocking
  FROM okr_generation_log ogl
  WHERE ogl.status = 'pending_chairman_acceptance'::text;

-- ============================================================
-- Step 3: chairman_pending_decisions — pending filter + ordering:
--         blocking DESC, effective priority class (72h age escalation,
--         visibility only), created_at ASC
-- ============================================================
CREATE OR REPLACE VIEW chairman_pending_decisions WITH (security_invoker = on) AS
  SELECT id,
    decision_type,
    title,
    priority,
    status,
    venture_id,
    stage,
    gate_type,
    recommendation,
    response_deadline,
    created_at,
    decided_at,
    decided_by,
    requestor_name,
    venture_name,
    details,
    blocking,
    CASE effective_rank
      WHEN 1 THEN 'critical'::text
      WHEN 2 THEN 'high'::text
      WHEN 3 THEN 'normal'::text
      ELSE 'low'::text
    END AS effective_priority,
    (effective_rank < priority_rank) AS age_escalated
  FROM (
    SELECT u.*,
      CASE u.priority
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END AS priority_rank,
      GREATEST(1,
        CASE u.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END
        - CASE WHEN (now() - u.created_at) > interval '72 hours' THEN 1 ELSE 0 END
      ) AS effective_rank
    FROM chairman_unified_decisions u
    WHERE u.status = 'pending'::text
  ) ranked
  ORDER BY blocking DESC, effective_rank, created_at ASC;

-- No new grants: CREATE OR REPLACE preserves the existing ACLs
-- (SELECT to authenticated + service_role, per 20260327) and the
-- WITH (security_invoker = on) clause preserves the invoker posture (20260602).
