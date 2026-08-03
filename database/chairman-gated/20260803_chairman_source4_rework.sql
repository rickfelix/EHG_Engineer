-- SD-LEO-INFRA-CHAIRMAN-DECISION-VIEW-001 — Source-4 rework of chairman_all_decision_signals
--
-- ============================ STAGED. NOT APPLIED. ============================
-- CREATE OR REPLACE VIEW is TIER-2 under scripts/lib/migration-tier-classifier.mjs, so the
-- classifier will never auto-apply it. There is NO @approved-by attestation on this file and this
-- directory is outside every auto-scanned migration path. The builder STAGES; the chairman applies.
--
-- ===================== READ THIS BEFORE YOU APPLY ANYTHING =====================
-- THE TARGET IS chairman_all_decision_signals, NOT chairman_unified_decisions.
--
-- As of 2026-08-03, chairman_unified_decisions is a 21-line THIN WRAPPER that selects from
-- chairman_all_decision_signals and filters out: details->>'source_decision_type'='session_question'
-- (236 of 658 rows), three flag_review categories (harness_backlog, fleet_dormancy,
-- process_enforcement), and demo/test ventures. The seven-source UNION moved DOWN into
-- chairman_all_decision_signals (introduced by 20260802_bound_anon_feedback_ingress.sql).
--
-- CONSEQUENCE, AND IT IS DESTRUCTIVE: the sibling proposal
-- database/migrations/20260725_chairman_queue_truthful_render_PROPOSED.sql instructs the applier to
-- "replace ONLY the Source 4 branch of chairman_unified_decisions from
-- 20260611_chairman_decision_queue.sql, preserving every other branch verbatim". Following that
-- instruction TODAY would CREATE OR REPLACE the wrapper back into the old seven-branch UNION and
-- DESTROY all three filters, flooding the chairman queue. Do not apply that file as written.
--
-- ============================= WHAT WAS WRONG ==============================
-- Measured live via pg_views on 2026-08-03. All three defects present verbatim:
--   title       concat('Stage ', cd.lifecycle_stage, ' Chairman Approval') -- cd.summary is
--               referenced NOWHERE in the entire view, though it is populated on 388 of 400
--               sampled rows. This is why rows read as "subjectless" to the chairman: they are
--               subjectless AS RENDERED, not as stored.
--   decided_at  cd.created_at AS decided_at -- so decided_at === created_at to the millisecond on
--               every row, not because decisions were instant but because the view says so.
--   priority    'critical'::text hardcoded -- a non-blocking framing flag renders as a critical
--               gate. QF-20260725-450 measured 114 such rows on 2026-07-25.
--
-- ========================== WHAT IS DELIBERATELY NOT CHANGED ==========================
-- decision_type STAYS 'chairman_approval'. It is the ROUTING KEY, not a label, and it is
-- load-bearing in four verified consumers:
--   lib/chairman/decision-queue.mjs:185-210  routeDecision switches on it; the default branch
--                                            returns "unknown decision_type" -> UNDECIDABLE rows.
--   lib/chairman/chairman-actionable.mjs:20  CONSOLE_ACTIONABLE_TYPES gates console actionability.
--   lib/chairman/decision-layman.mjs:25      GROUPABLE_TYPES.
--   lib/chairman/decision-layman.mjs:60      dead-venture drop.
-- The SD text asks for rows to "stop being blanket-relabeled as chairman_approval". Doing that
-- literally would make 658 rows undecidable AND non-actionable. The real subtype reaches the human
-- through the TITLE instead, which is exactly where it is safe: visible to the chairman, invisible
-- to the router. A WHERE clause was also rejected -- it removes rows from the queue rather than
-- correcting their labels, trading mislabeled-but-visible for correctly-labeled-but-absent.
--
-- ============================ HONEST LIMITS ============================
-- updated_at IS A PROXY, NOT A DECISION TIMESTAMP. chairman_decisions has NO decided_at column
-- (36 columns; absent). updated_at moves on 604 of 658 rows and is a generic mutation stamp, so
-- projecting it unconditionally would repeat this SD's own defect one column over. It is therefore
-- projected ONLY where cd.decided_by IS NOT NULL AND status <> 'pending' -- 233 rows have a
-- recorded decider. Everywhere else decided_at is NULL, which is the honest answer.
-- FOLLOW-ON: add a real decided_at column (nullable ADD COLUMN = TIER-1) and populate it at the
-- point of decision; until then this projection is the best available approximation.
--
-- LANDING ORDER IS LOAD-BEARING. 20260802_chairman_queue_age_escalation_STAGED.sql documents that
-- Source 4's hardcoded priority='critical' makes age_escalated structurally FALSE at any age
-- (effective_rank = GREATEST(1, 1 - bump) yields 1 < 1). This migration changes exactly that input,
-- so the two interact. Decide the order deliberately; do not land both blind.
--
-- PROVENANCE: spliced programmatically from the LIVE pg_views definition, not hand-copied and not
-- taken from any repo file. Only the Source-4 branch was rewritten; every other branch is
-- byte-identical to live by construction. Rollback = re-run the pre-change live definition, which
-- is preserved alongside this file.
--
-- ROLLBACK: database/chairman-gated/20260803_source4_rework_ROLLBACK.sql
-- ============================================================================

CREATE OR REPLACE VIEW public.chairman_all_decision_signals AS
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
   FROM ((agent_messages am
     LEFT JOIN agent_registry ar ON ((ar.id = am.from_agent_id)))
     LEFT JOIN ventures v ON ((v.id = ar.venture_id)))
  WHERE (((am.message_type)::text = 'escalation'::text) AND ((am.status)::text = 'pending'::text))
UNION ALL
 SELECT vd.id,
    'gate_decision'::text AS decision_type,
    concat('Stage ', vd.stage, ' Gate Decision') AS title,
        CASE
            WHEN (vd.gate_type = 'hard_gate'::text) THEN 'critical'::text
            WHEN (vd.gate_type = 'advisory_checkpoint'::text) THEN 'high'::text
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
   FROM (venture_decisions vd
     LEFT JOIN ventures v ON ((v.id = vd.venture_id)))
  WHERE (vd.decision IS NULL)
UNION ALL
 SELECT vd.id,
    'gate_decision'::text AS decision_type,
    concat('Stage ', vd.stage, ' Gate Decision') AS title,
        CASE
            WHEN (vd.gate_type = 'hard_gate'::text) THEN 'critical'::text
            WHEN (vd.gate_type = 'advisory_checkpoint'::text) THEN 'high'::text
            ELSE 'normal'::text
        END AS priority,
        CASE
            WHEN (vd.decision = 'proceed'::text) THEN 'approved'::text
            WHEN (vd.decision = ANY (ARRAY['kill'::text, 'pause'::text])) THEN 'rejected'::text
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
   FROM (venture_decisions vd
     LEFT JOIN ventures v ON ((v.id = vd.venture_id)))
  WHERE (vd.decision IS NOT NULL)
UNION ALL
 SELECT cd.id,
    'chairman_approval'::text AS decision_type,
    concat(cd.decision_type, ': ', COALESCE(left(cd.summary, 120), '(no summary)')) AS title,
    CASE WHEN COALESCE(cd.blocking, false) THEN 'critical'::text ELSE 'medium'::text END AS priority,
        CASE
            WHEN (cd.status = 'pending'::text) THEN 'pending'::text
            WHEN ((cd.decision)::text = 'proceed'::text) THEN 'approved'::text
            WHEN ((cd.decision)::text = ANY (ARRAY[('kill'::character varying)::text, ('pause'::character varying)::text])) THEN 'rejected'::text
            WHEN ((cd.decision)::text = 'pivot'::text) THEN 'pivot'::text
            WHEN ((cd.decision)::text = 'fix'::text) THEN 'fix'::text
            WHEN ((cd.decision)::text = 'override'::text) THEN 'override'::text
            ELSE 'decided'::text
        END AS status,
    cd.venture_id,
    cd.lifecycle_stage AS stage,
    NULL::text AS gate_type,
    cd.recommendation,
    NULL::timestamp with time zone AS response_deadline,
    cd.created_at,
    CASE WHEN cd.decided_by IS NOT NULL AND cd.status <> 'pending'::text THEN cd.updated_at ELSE NULL::timestamp with time zone END AS decided_at,
    cd.decided_by_user_id AS decided_by,
    NULL::text AS requestor_name,
    v.name AS venture_name,
    jsonb_build_object('health_score', cd.health_score, 'override_reason', cd.override_reason, 'risks_acknowledged', cd.risks_acknowledged, 'quick_fixes_applied', cd.quick_fixes_applied, 'source_decision_type', cd.decision_type) AS details,
    COALESCE(cd.blocking, false) AS blocking
   FROM (chairman_decisions cd
     LEFT JOIN ventures v ON ((v.id = cd.venture_id)))
UNION ALL
 SELECT f.id,
    'flag_review'::text AS decision_type,
    (f.title)::text AS title,
        CASE
            WHEN ((f.severity)::text = 'critical'::text) THEN 'critical'::text
            ELSE 'high'::text
        END AS priority,
    'pending'::text AS status,
    f.venture_id,
    NULL::integer AS stage,
    NULL::text AS gate_type,
    NULLIF((f.metadata ->> 'recommendation'::text), ''::text) AS recommendation,
    NULL::timestamp with time zone AS response_deadline,
    f.created_at,
    NULL::timestamp with time zone AS decided_at,
    NULL::uuid AS decided_by,
    NULL::text AS requestor_name,
    v.name AS venture_name,
    jsonb_build_object('id', f.id, 'category', f.category, 'severity', f.severity, 'body', "left"(COALESCE(f.description, ''::text), 280)) AS details,
    ((f.severity)::text = 'critical'::text) AS blocking
   FROM (feedback f
     LEFT JOIN ventures v ON ((v.id = f.venture_id)))
  WHERE (((f.severity)::text = ANY (ARRAY['critical'::text, 'high'::text])) AND (f.resolved_at IS NULL) AND ((COALESCE(f.status, 'new'::character varying))::text <> ALL (ARRAY['resolved'::text, 'wont_fix'::text])))
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
    jsonb_build_object('flag_key', ff.flag_key, 'display_name', ff.display_name, 'description', ff.description, 'risk_tier', (ff.risk_tier)::text) AS details,
    false AS blocking
   FROM leo_feature_flags ff
  WHERE ((ff.is_enabled = false) AND ((ff.lifecycle_state)::text = 'draft'::text) AND (ff.created_at < (now() - '7 days'::interval)))
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
  WHERE (ogl.status = 'pending_chairman_acceptance'::text);
