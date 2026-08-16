-- @approved-by: codestreetlabs@gmail.com
-- (approval transcribed by Adam per chairman ruling 2026-08-07; chairman 'run it' on Group 3 at terminal, 2026-08-16 ceremony)
-- QF-20260816-456 — MERGE of two rival chairman-gated views of chairman_all_decision_signals
-- into ONE, ahead of the 2026-08-17 chairman ceremony. Supersedes both:
--   database/chairman-gated/20260803_chairman_queue_truthful_render.sql   ("File A")
--   database/chairman-gated/20260803_chairman_source4_rework.sql          ("File B")
--
-- ============================ STAGED. NOT APPLIED. ============================
-- CREATE OR REPLACE VIEW is TIER-2 under scripts/lib/migration-tier-classifier.mjs — never
-- auto-applied. No @approved-by attestation. The builder stages; the chairman applies.
--
-- TARGET CONFIRMED: chairman_all_decision_signals, NOT chairman_unified_decisions (a 21-line
-- thin wrapper over this view — see File B's header for the destructive-if-confused warning
-- against database/migrations/20260725_chairman_queue_truthful_render_PROPOSED.sql, which still
-- applies here unchanged).
--
-- PROVENANCE: base = pg_get_viewdef('public.chairman_all_decision_signals', true) read live via
-- the pooler on 2026-08-16 (7,304 chars — byte-identical to both File A's and File B's own
-- captured-live starting point, confirming neither rival has been applied). Branches 1, 2, 5, 6, 7
-- are carried forward UNCHANGED from that live read. Only branches 3 and 4 (the two
-- venture_decisions/chairman_decisions branches touching "decided" semantics) differ, and are
-- spliced from the two rivals' already-reviewed SQL rather than retyped — retyping a 7-branch
-- UNION by hand to change two of them is how a branch silently disappears (File A's own stated
-- risk, and the reason this migration is built the same way its rivals were).
--
-- ========================== WHY A MERGE, NOT A PICK ==========================
-- File A and File B fix ALMOST ENTIRELY NON-OVERLAPPING defects in the SAME branch (4,
-- chairman_decisions). Measured by diffing both against the live branch:
--   File A fixes: title (HELD-until rendering off brief_data->'hold'), status (adds 'held' for a
--     ratified park AND for decision='pause' — in BOTH branch 3 and branch 4; live buckets 'pause'
--     into 'rejected' in both), priority (softens a ratified hold to 'normal').
--     File A does NOT touch decided_at/decided_by — both stay unconditional/NULL, i.e. still lies.
--   File B fixes: decided_at (conditional, real, off cd.updated_at), decided_by (real, off
--     cd.decided_by_user_id), priority (blocking-based instead of unconditional 'critical'),
--     WITH (security_invoker = on) stated explicitly.
--     File B does NOT add a 'held' status anywhere — decision='pause' still renders 'rejected' in
--     File B's branch 4, and File B's branch 3 is untouched from live (same bug, unaddressed).
-- A chairman reading this queue needs BOTH: a decision that was actually decided must show who and
-- when (File B), and a decision that was deliberately parked must not read as rejected (File A).
-- Shipping either alone leaves the other's defect live. Hence: merge, not pick.
--
-- ============================ PER-BRANCH MERGE DECISIONS ============================
-- Branch 3 (venture_decisions, decision IS NOT NULL): adopt File A's status CASE verbatim — pause
--   separated from kill/reject/cancel into 'held'. File B did not touch this branch (out of its
--   SD's scope, not a deliberate keep); the bug is the identical pattern File B's own header names
--   as the (branch-4) defect it exists to fix, so leaving it unfixed here would be inconsistent
--   only by omission, not by design.
-- Branch 4 (chairman_decisions):
--   decision_type: STAYS 'chairman_approval' (File B's explicit, verified choice). Re-verified live
--     on 2026-08-16 against all four cited consumers — still real, still load-bearing:
--       lib/chairman/decision-queue.mjs:186        routeDecision switches on it
--       lib/chairman/chairman-actionable.mjs:24     CONSOLE_ACTIONABLE_TYPES
--       lib/chairman/decision-layman.mjs:26         GROUPABLE_TYPES
--       lib/chairman/decision-layman.mjs:113        dead-venture drop
--     Changing this column would make every one of those mis-route or drop the row. The real
--     subtype still reaches the human through the title (File B's mechanism), extended below.
--   title: File B's real-subtype + summary rendering, with File A's HELD-until suffix appended.
--     File A's stage-suffix/initcap formatting is dropped in favor of B's richer content (the real
--     cd.decision_type plus actual summary text says more than "Stage N Chairman Approval" ever
--     did); the HELD-suffix is kept because it is what makes a bare status='held' legible instead
--     of just cryptic.
--   priority: File B's blocking-based baseline, with File A's ratified-hold override on top — a
--     row the chairman already parked must not permanently read 'critical' just because
--     blocking=true; that is the same "already-decided row reads critical forever" defect class
--     File B's own header measured at 114 rows (QF-20260725-450) reappearing one column over if the
--     override is dropped.
--   status: File A's full CASE ladder verbatim (ratified-hold -> held; pending; proceed ->
--     approved; pause -> held, separated from kill/reject/cancel -> rejected; pivot/fix/override;
--     else decided). This is a strict superset of File B's, which has no 'held' branch at all.
--   decided_at / decided_by: File B's fix verbatim, unchanged by the status merge above — the
--     decided_at CASE reads the pre-existing cd.decided_by (text) column as its gate, independent
--     of both the derived view-status column and the decided_by (uuid) output column, so it
--     composes safely with every change above.
--   Everything else in branch 4 (venture_id, stage, gate_type, recommendation, response_deadline,
--     created_at, requestor_name, venture_name, details, blocking) is identical across live/A/B —
--     carried forward unchanged.
--
-- ======================== brief_data->'hold' MECHANISM — VERIFIED REAL ========================
-- Not a File-A invention: scripts/apply-chairman-decision-captures.mjs:146 reads
-- row.brief_data?.hold?.ratified live in production, and :157 writes unpark_trigger under the same
-- key. Confirmed live on 2026-08-16 against a real ratified-hold row
-- (id=3aa84300-0f0b-4a91-bebe-a24768c94320): brief_data->'hold' = {"ratified": true,
-- "unpark_trigger": "Sessions+Roadmap live in EHG, or explicit chairman direction", ...}.
--
-- ============================ security_invoker = on ============================
-- STATED EXPLICITLY, MUST NOT BE DROPPED — carrying File B's rationale forward unchanged: relying
-- on CREATE OR REPLACE to retain reloptions implicitly would be gambling on a semantic not worth
-- gambling on; if ever lost, the view would run DEFINER and silently bypass RLS for every querying
-- user. This is NOT a new behavior change — verified live on 2026-08-16 that pg_class.reloptions
-- for this view is ALREADY {security_invoker=on} today, so this migration preserves current
-- production behavior rather than introducing it.
--
-- READER-ACCESS CHECK (the explicit precondition for touching this reloption at all): the chairman
-- dashboard's decide flow queries Postgres RPCs/views directly from the browser as the
-- `authenticated` role (docs/governance/chairman-decision-surfaces.md, "Architecture note" —
-- ehg/src/components/chairman-v3/decisions/DecisionActions.tsx +
-- ehg/src/hooks/usePendingGateDecision.ts), not service_role. Verified live on 2026-08-16 via
-- information_schema.role_table_grants + pg_policies: `authenticated` holds SELECT grant AND a
-- permissive USING(true)-shaped RLS policy on EVERY base table this view reads (agent_messages,
-- agent_registry, chairman_decisions, feedback, leo_feature_flags, okr_generation_log,
-- venture_decisions, ventures). A non-service reader does not lose access under invoker semantics —
-- confirmed, not assumed.
--
-- ==================== QF-20260816-988 — decided_at/decided_by column mismatch ====================
-- Coordinator AC (bug_016, A3 ultrareview via Adam, 2026-08-16): the gate above checks
-- cd.decided_by (text), while the decided_by OUTPUT column projects cd.decided_by_user_id (uuid) —
-- a DIFFERENT column. Result: a row decided by a system/agent actor (adam, testing_agent,
-- monitoring_agent — measured 180 of 249 gate-passing rows) OR by the chairman via a free-text
-- label rather than a linked uuid (measured ~69 of 249: chairman, chairman-cli,
-- codestreetlabs@gmail.com, etc.) gets a real decided_at timestamp while decided_by silently reads
-- NULL — "decided at X by nobody".
--
-- REJECTED FIX: gate AND project the SAME column (decided_by_user_id for both). Measured live:
-- only 14 of 249 gate-passing rows have decided_by_user_id set. This would suppress decided_at for
-- 235 rows outright, including ~69 that a real human chairman genuinely decided — a much larger
-- regression than the defect it fixes.
--
-- APPLIED FIX (the directive's own sanctioned alternative — "surface decided_by text as a label
-- alongside"): decided_at's gate and decided_by's projection are UNCHANGED from the original merge
-- (still broad, still honest about which 249 rows have SOME recorded decider); details now also
-- carries decided_by_label := cd.decided_by (the raw text), so a row with decided_by NULL is no
-- longer silently unexplained — a consumer reading details.decided_by_label sees "adam" /
-- "chairman-cli" / etc. even when no linkable uuid exists. Column type stays uuid|NULL on the
-- union-typed output (text cannot be projected there without breaking the UNION — confirmed by the
-- superseded File B's own test comment: "UNION types uuid and text cannot be matched").
--
-- ROLLBACK: database/chairman-gated/20260817_chairman_all_decision_signals_merged_DOWN.sql
-- CONTROL QUERY (run immediately after apply): database/chairman-gated/20260817_chairman_all_decision_signals_merged_CONTROL.sql
-- ============================================================================

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
    concat(cd.decision_type, ': ', COALESCE(left(cd.summary, 120), '(no summary)'),
      CASE WHEN cd.brief_data->'hold'->>'ratified' = 'true'
           THEN concat(' — HELD until: ', COALESCE(NULLIF(cd.brief_data->'hold'->>'unpark_trigger', ''), 'trigger NOT RECORDED'))
           ELSE '' END) AS title,
    CASE WHEN cd.brief_data->'hold'->>'ratified' = 'true' THEN 'normal'::text
         WHEN COALESCE(cd.blocking, false) THEN 'critical'::text
         ELSE 'medium'::text END AS priority,
        CASE
            WHEN cd.brief_data->'hold'->>'ratified' = 'true' THEN 'held'::text
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
    CASE WHEN cd.decided_by IS NOT NULL AND cd.status <> 'pending'::text THEN cd.updated_at ELSE NULL::timestamp with time zone END AS decided_at,
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

-- ==================== ANCHOR-FINDING QUERIES (for the CONTROL file) ====================
-- If the anchor row ids hardcoded in the CONTROL file no longer exist at ceremony time, re-run
-- these against chairman_decisions (NOT the view) to pick fresh ones:
--
--   -- a ratified-hold row (expect view status='held' regardless of raw decision/status):
--   SELECT id, decision, status, brief_data->'hold' AS hold
--   FROM chairman_decisions WHERE brief_data->'hold'->>'ratified' = 'true' LIMIT 1;
--
--   -- a decided row with a real decider recorded (expect view decided_by = decided_by_user_id):
--   SELECT id, decided_by_user_id, status, decision
--   FROM chairman_decisions WHERE decided_by_user_id IS NOT NULL AND status <> 'pending' LIMIT 1;
