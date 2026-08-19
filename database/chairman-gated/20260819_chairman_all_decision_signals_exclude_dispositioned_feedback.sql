-- 20260819_chairman_all_decision_signals_exclude_dispositioned_feedback.sql
-- QF-20260728-996 (ceremony lane — chairman-gated VIEW DDL; NOT auto-applied; apply only on chairman A)
-- @approved-by: codestreetlabs@gmail.com (chairman ruling 1A at terminal 2026-08-19T16:07Z; scribe adam-08049808)
--
-- DEFECT (measured 2026-08-19 vs live pg_get_viewdef): the feedback branch of
-- public.chairman_all_decision_signals (consumed by chairman_unified_decisions → chairman_pending_decisions)
-- excludes only status IN ('resolved','wont_fix'). A feedback row the chairman already dispositioned as
-- in_progress (or triaged as duplicate/invalid) keeps surfacing as a flag_review 'pending decision', ageing on
-- created_at — the specimen was a 15-day 'critical block' that was in fact in progress (QF-20260728-996).
-- FIX: extend the exclusion list to ('resolved','wont_fix','in_progress','duplicate','invalid').
--   'backlog' (194 rows) and 'new' remain visible on purpose — backlog is a deferral the queue should still age.
-- POSTURE PRESERVED: owner postgres, security_invoker=on (20260602_fix_security_definer_views_and_rls_recurrence).
-- The full body below is the LIVE definition (pg_get_viewdef 2026-08-19) with ONLY the predicate changed — a
-- CREATE OR REPLACE that keeps every column in place (no drop/recreate; dependent views untouched).
-- Rollback: re-run this file with the original two-element exclusion list.
-- Idempotent: safe to re-run.

BEGIN;

CREATE OR REPLACE VIEW public.chairman_all_decision_signals
WITH (security_invoker = on) AS
 SELECT am.id,
    'escalation'::text AS decision_type,
    am.subject AS title,
    COALESCE(am.priority, 'normal'::character varying)::text AS priority,
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
  WHERE am.message_type::text = 'escalation'::text AND am.status::text = 'pending'::text
UNION ALL
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
    vd.gate_type = 'hard_gate'::text AS blocking
   FROM venture_decisions vd
     LEFT JOIN ventures v ON v.id = vd.venture_id
  WHERE vd.decision IS NULL
UNION ALL
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
            WHEN vd.decision = 'pause'::text THEN 'held'::text
            WHEN vd.decision = ANY (ARRAY['kill'::text, 'reject'::text, 'cancel'::text]) THEN 'rejected'::text
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
    vd.gate_type = 'hard_gate'::text AS blocking
   FROM venture_decisions vd
     LEFT JOIN ventures v ON v.id = vd.venture_id
  WHERE vd.decision IS NOT NULL
UNION ALL
 SELECT cd.id,
    'chairman_approval'::text AS decision_type,
    concat(cd.decision_type, ': ', COALESCE("left"(cd.summary, 120), '(no summary)'::text),
        CASE
            WHEN ((cd.brief_data -> 'hold'::text) ->> 'ratified'::text) = 'true'::text THEN concat(' — HELD until: ', COALESCE(NULLIF((cd.brief_data -> 'hold'::text) ->> 'unpark_trigger'::text, ''::text), 'trigger NOT RECORDED'::text))
            ELSE ''::text
        END) AS title,
        CASE
            WHEN ((cd.brief_data -> 'hold'::text) ->> 'ratified'::text) = 'true'::text THEN 'normal'::text
            WHEN COALESCE(cd.blocking, false) THEN 'critical'::text
            ELSE 'medium'::text
        END AS priority,
        CASE
            WHEN ((cd.brief_data -> 'hold'::text) ->> 'ratified'::text) = 'true'::text THEN 'held'::text
            WHEN cd.status = 'pending'::text THEN 'pending'::text
            WHEN cd.decision::text = 'proceed'::text THEN 'approved'::text
            WHEN cd.decision::text = 'pause'::text THEN 'held'::text
            WHEN cd.decision::text = ANY (ARRAY['kill'::character varying::text, 'reject'::character varying::text, 'cancel'::character varying::text]) THEN 'rejected'::text
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
        CASE
            WHEN cd.decided_by IS NOT NULL AND cd.status <> 'pending'::text THEN cd.updated_at
            ELSE NULL::timestamp with time zone
        END AS decided_at,
    cd.decided_by_user_id AS decided_by,
    NULL::text AS requestor_name,
    v.name AS venture_name,
    jsonb_build_object('health_score', cd.health_score, 'override_reason', cd.override_reason, 'risks_acknowledged', cd.risks_acknowledged, 'quick_fixes_applied', cd.quick_fixes_applied, 'source_decision_type', cd.decision_type, 'decided_by_label', cd.decided_by) AS details,
    COALESCE(cd.blocking, false) AS blocking
   FROM chairman_decisions cd
     LEFT JOIN ventures v ON v.id = cd.venture_id
UNION ALL
 SELECT f.id,
    'flag_review'::text AS decision_type,
    f.title::text AS title,
        CASE
            WHEN f.severity::text = 'critical'::text THEN 'critical'::text
            ELSE 'high'::text
        END AS priority,
    'pending'::text AS status,
    f.venture_id,
    NULL::integer AS stage,
    NULL::text AS gate_type,
    NULLIF(f.metadata ->> 'recommendation'::text, ''::text) AS recommendation,
    NULL::timestamp with time zone AS response_deadline,
    f.created_at,
    NULL::timestamp with time zone AS decided_at,
    NULL::uuid AS decided_by,
    NULL::text AS requestor_name,
    v.name AS venture_name,
    jsonb_build_object('id', f.id, 'category', f.category, 'severity', f.severity, 'body', "left"(COALESCE(f.description, ''::text), 280)) AS details,
    f.severity::text = 'critical'::text AS blocking
   FROM feedback f
     LEFT JOIN ventures v ON v.id = f.venture_id
  WHERE (f.severity::text = ANY (ARRAY['critical'::text, 'high'::text])) AND f.resolved_at IS NULL AND (COALESCE(f.status, 'new'::character varying)::text <> ALL (ARRAY['resolved'::text, 'wont_fix'::text, 'in_progress'::text, 'duplicate'::text, 'invalid'::text]))
UNION ALL
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
  WHERE ff.is_enabled = false AND ff.lifecycle_state::text = 'draft'::text AND ff.created_at < (now() - '7 days'::interval)
UNION ALL
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

-- POSTCONDITION (read-only; aborts the transaction if the predicate did not land)
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_viewdef('public.chairman_all_decision_signals'::regclass, true) INTO def;
  IF position('''in_progress''::text' IN def) = 0 THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: in_progress not in chairman_all_decision_signals feedback predicate';
  END IF;
END $$;

COMMIT;
