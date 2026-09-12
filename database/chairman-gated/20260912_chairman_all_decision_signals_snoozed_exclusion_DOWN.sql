-- ROLLBACK for 20260912_chairman_all_decision_signals_snoozed_exclusion.sql
-- (SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001)
--
-- Restores the pre-change live definition verbatim (captured 2026-09-12 immediately before this
-- SD's migration was authored): identical to the paired UP file except the `flag_review` branch's
-- WHERE clause drops the `AND (f.snoozed_until IS NULL OR f.snoozed_until <= now())` clause,
-- restoring the prior behavior where a snoozed critical/high feedback row still surfaces in the
-- chairman decision queue.

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

COMMIT;
