-- ROLLBACK for 20260817_chairman_all_decision_signals_merged.sql (QF-20260816-456)
--
-- Restores the pre-merge live definition VERBATIM, captured via
-- pg_get_viewdef('public.chairman_all_decision_signals', true) over the pooler on 2026-08-16,
-- immediately before the merge was authored (7,304 chars — matches both rivals' own captured
-- starting point). This is the original 3-lies-plus-parked-as-rejected view: decision_type
-- hardcoded, title hardcoded to "Stage N Chairman Approval", priority hardcoded to 'critical',
-- decided_at/decided_by unconditional NULL/created_at, and no security_invoker clause.
--
-- NOTE: this DOWN file intentionally does NOT restate `WITH (security_invoker = on)` — the
-- pre-merge live view had no explicit reloption in its own CREATE OR REPLACE history, yet
-- pg_class.reloptions measured {security_invoker=on} live regardless (set by some prior,
-- undocumented statement). If this rollback is ever run, immediately re-check
-- `SELECT reloptions FROM pg_class WHERE oid = 'public.chairman_all_decision_signals'::regclass`
-- and re-apply `ALTER VIEW public.chairman_all_decision_signals SET (security_invoker = on);`
-- if it came back empty — do not assume CREATE OR REPLACE preserved it silently.

BEGIN;

CREATE OR REPLACE VIEW public.chairman_all_decision_signals AS
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
    vd.gate_type = 'hard_gate'::text AS blocking
   FROM venture_decisions vd
     LEFT JOIN ventures v ON v.id = vd.venture_id
  WHERE vd.decision IS NOT NULL
UNION ALL
 SELECT cd.id,
    'chairman_approval'::text AS decision_type,
    concat('Stage ', cd.lifecycle_stage, ' Chairman Approval') AS title,
    'critical'::text AS priority,
        CASE
            WHEN cd.status = 'pending'::text THEN 'pending'::text
            WHEN cd.decision::text = 'proceed'::text THEN 'approved'::text
            WHEN cd.decision::text = ANY (ARRAY['kill'::character varying::text, 'pause'::character varying::text]) THEN 'rejected'::text
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
    jsonb_build_object('health_score', cd.health_score, 'override_reason', cd.override_reason, 'risks_acknowledged', cd.risks_acknowledged, 'quick_fixes_applied', cd.quick_fixes_applied, 'source_decision_type', cd.decision_type) AS details,
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
  WHERE (f.severity::text = ANY (ARRAY['critical'::text, 'high'::text])) AND f.resolved_at IS NULL AND (COALESCE(f.status, 'new'::character varying)::text <> ALL (ARRAY['resolved'::text, 'wont_fix'::text]))
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
