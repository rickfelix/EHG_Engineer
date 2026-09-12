-- SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001 — exclude snoozed critical/high feedback rows from the
-- chairman decision queue.
--
-- ============================ STAGED. NOT APPLIED. ============================
-- CREATE OR REPLACE VIEW is TIER-2 under scripts/lib/migration-tier-classifier.mjs — never
-- auto-applied. No @approved-by attestation. The builder stages; the chairman applies.
--
-- @approved-by: codestreetlabs@gmail.com
--
-- ============================ WHAT'S BROKEN ============================
-- Found as out-of-scope finding F3 during PLAN-phase prospective TESTING review of
-- SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C (evidence rows 2de37d89-7fb2-4ab3-a37e-8d7b8c531376,
-- 7e94571a-f8dd-48b4-859c-9c94cf1eb6db). public.chairman_all_decision_signals's `flag_review`
-- branch (feeds the chairman decision queue for `feedback` rows) filters on severity, resolved_at
-- and status, but never consults `snoozed_until` at all.
--
-- CORRECTED CAUSE (LEAD-phase RISK/DOCMON sub-agent review, 2026-09-12, TWO CORRECTION PASSES --
-- the first pass fixed this section but left the same stale story standing in THE ONE CHANGE
-- section below and in the VERIFY block at file end; both are fixed in this second pass too):
-- the original F3 finding named `/inbox snooze` (lib/quality/snooze-manager.js) as THE writer.
-- That path cannot write via the /inbox skill in production -- snoozeFeedback() writes
-- status='snoozed' and unsnoozeFeedback()/wakeExpiredSnoozes() write status='open', and
-- public.feedback_status_check permits ONLY
-- (new, triaged, in_progress, resolved, wont_fix, duplicate, invalid, backlog, shipped) -- verified
-- live against pg_constraint; neither 'snoozed' nor 'open' is in that list. Precise statement of
-- the caller situation (an earlier draft of this note overclaimed "zero callers in the repo",
-- which is not quite right): there is no JS/library caller of snoozeFeedback/unsnoozeFeedback/
-- wakeExpiredSnoozes -- the sole call sites are the `/inbox snooze` / `/inbox unsnooze` /
-- `/inbox snoozed` skill script (.claude/skills/inbox.md) itself, and its writes are the ones
-- rejected by feedback_status_check. wakeExpiredSnoozes() (the "background sweep" that would
-- clear expired snoozes) has no caller anywhere, skill or code -- it never runs, period, not just
-- "may not have run yet".
--
-- There are TWO real, live writers of `snoozed_until`, and they matter differently to this branch:
-- (1) lib/quality/assist-engine.js's this_week/next_week decision branch (~L768, reached via
--     `/leo assist` Phase 2 interactive scheduling) sets status='backlog' (a permitted value)
--     alongside snoozed_until, with NO severity restriction -- this is the writer that actually
--     drives the bug this migration fixes, because a critical/high feedback row scheduled
--     this_week/next_week keeps its severity and would otherwise still surface in flag_review.
-- (2) scripts/chairman-decisions.mjs's recordDeferral() (chairman `defer --review-in`, per
--     lib/chairman/decision-queue.mjs:170) inserts a NEW audit-log feedback row with
--     severity='low' HARDCODED and status='new' -- this path can never produce a critical/high
--     row and is therefore irrelevant to this branch's population, REGARDLESS of snoozed_until.
--     It is named here only because it is the source of today's one live example row (see below).
--
-- Confirmed live: whole-table non-null snoozed_until count is exactly 1 row today, and that row
-- is a writer-(2) chairman-deferral audit row (severity='low') -- already excluded from this
-- branch by the existing severity filter, with or without this migration. So the CURRENT
-- affected-row delta from applying this migration is 0 today, not "404-408 currently-snoozeable"
-- (that number is this branch's total ELIGIBLE population -- critical/high, unresolved,
-- non-terminal-status -- not a count of rows actually snoozed today via writer (1)). The gap is
-- still genuinely load-bearing going forward: any critical/high row a chairman/operator schedules
-- via `/leo assist` this_week/next_week (writer (1)) is silently still queued for immediate
-- chairman attention despite being explicitly deferred to a later date, and the fix (checking
-- snoozed_until directly, since nothing ever clears it once set) is correct and unchanged by this
-- correction -- only the WHY, not the WHAT, was wrong. Pre-existing gap, not a regression from
-- -001-C (status is never touched by either writer above, so this branch's visibility is
-- byte-identical pre/post -001-C).
--
-- ============================ PROVENANCE ============================
-- Base = pg_get_viewdef('public.chairman_all_decision_signals', true) read live via
-- SUPABASE_POOLER_URL on 2026-09-12 (this SD's claim time). Every branch except `flag_review`'s
-- WHERE clause is carried forward BYTE-IDENTICAL from that live read -- confirmed against
-- 20260817_chairman_all_decision_signals_merged.sql's own committed text for the other 6 branches
-- (escalation, gate_decision x2, chairman_approval, flag_enablement, okr_acceptance: unchanged).
-- NOTE: the live `flag_review` WHERE clause's status-exclusion list is
-- (resolved, wont_fix, in_progress, duplicate, invalid) -- five values -- which is WIDER than
-- 20260817_chairman_all_decision_signals_merged.sql's own committed text for that branch (which
-- shows only resolved, wont_fix). The live view has evidently been re-applied at least once since
-- 2026-08-17 by a ceremony whose SQL text was never separately committed to this directory (or
-- was applied via a variant of that file not preserved verbatim here) -- this migration does not
-- attempt to reconstruct or explain that history; it captures CURRENT LIVE STATE as its base,
-- per this repo's own established convention for these merges (see that file's own PROVENANCE
-- note for the same "read live, don't retype by hand" discipline). Investigating that gap is out
-- of scope for this SD.
--
-- ============================ THE ONE CHANGE ============================
-- `flag_review` branch WHERE clause gains one clause:
--   AND (f.snoozed_until IS NULL OR f.snoozed_until <= now())
-- lib/quality/assist-engine.js's this_week/next_week branch (~L768) sets snoozed_until to a
-- future timestamp when a row is scheduled via `/leo assist`; nothing ever clears it back to
-- NULL once its date passes -- the only sweep that would (wakeExpiredSnoozes(),
-- lib/quality/snooze-manager.js:178) has zero callers anywhere in the repo and never runs. So
-- this is NOT a hedge against a lagging background job -- checking the timestamp directly
-- (rather than `snoozed_until IS NULL`) is the ONLY mechanism by which a row can ever re-surface
-- after its scheduled date arrives; a bare NULL check would hide such a row FOREVER.
--
-- security_invoker = on is preserved unchanged (same reasoning as 20260817's merge: relying on
-- CREATE OR REPLACE to retain reloptions implicitly is not worth gambling on; explicit beats
-- implicit for an RLS-bypass-relevant reloption).
--
-- ROLLBACK: database/chairman-gated/20260912_chairman_all_decision_signals_snoozed_exclusion_DOWN.sql
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
  WHERE (f.severity::text = ANY (ARRAY['critical'::text, 'high'::text])) AND f.resolved_at IS NULL AND (COALESCE(f.status, 'new'::character varying)::text <> ALL (ARRAY['resolved'::text, 'wont_fix'::text, 'in_progress'::text, 'duplicate'::text, 'invalid'::text])) AND (f.snoozed_until IS NULL OR f.snoozed_until <= now())
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

-- ==================== VERIFY (run immediately after apply) ====================
-- NOTE: live-measured 2026-09-12, the pre-apply count of currently-snoozed critical/high rows is
-- 0 (the only non-null snoozed_until row in the whole table is a severity='low' chairman-deferral
-- audit row, already outside this branch's severity filter regardless of this migration -- see
-- WHAT'S BROKEN above). A "should be > 0 pre-apply" check would FAIL today through no fault of the
-- migration. Verify with a synthetic probe row instead, inside a transaction you roll back:
--
-- 1. Confirm the reloption survived:
--    SELECT reloptions FROM pg_class WHERE oid = 'public.chairman_all_decision_signals'::regclass;
--    -- expect {security_invoker=on}
-- 2. BEGIN; insert a throwaway critical-severity feedback row with
--    snoozed_until = now() + interval '1 day'; confirm its id is ABSENT from
--    `SELECT id FROM chairman_all_decision_signals WHERE decision_type = 'flag_review'`.
-- 3. UPDATE that same row's snoozed_until = now() - interval '1 hour' (simulating an expired,
--    never-swept snooze); confirm its id is now PRESENT in the same query (no dependency on any
--    sweep having run -- see THE ONE CHANGE above).
-- 4. ROLLBACK the transaction from steps 2-3 (never COMMIT a synthetic probe row).
-- 5. Confirm a real, non-snoozed critical/high feedback row (snoozed_until IS NULL) still appears
--    in the view post-apply, unchanged (no over-exclusion of the existing population).
-- ================================================================================
