-- SD-LEO-INFRA-009-LEAF-IMPROVEMENT-001
-- C-009 leaf 1: improvement-ledger SSOT spine.
-- Six read-only views (one per improvement loop) + one unifying spine view.
-- NO new writers, NO schema mutation of source tables -- CREATE VIEW only.
--
-- Shared column vocabulary (frozen -- two sibling SDs, LEAF-FORMALIZE-001 and
-- LEAF-PER-001, are already drafted to build on this exact contract):
--   loop_id, cycle_id, stage, entered_at, stage_status, source_table
-- One row per (cycle_id, stage) actually reached -- not padded with NULLs.
--
-- Security: every view is WITH (security_invoker = true) so it runs as the
-- querying role and is subject to the RLS already enabled on all seven
-- source tables. REVOKE is the load-bearing control (all seven base tables
-- carry permissive `USING (true)` policies for authenticated, so RLS alone
-- would not block a plain authenticated reader) -- REVOKE SELECT FROM
-- anon/authenticated and grant only to service_role, the role this repo's
-- tooling actually queries with.

-- Drop-and-recreate (not ALTER) is required because CREATE OR REPLACE VIEW
-- cannot change an existing column's data type, and one iteration of this
-- migration needed a type fix (character varying -> text on stage_status).
-- Safe: nothing outside this migration depends on these views yet.
-- CASCADE on the six per-loop views also drops the dependent spine view;
-- both are recreated below.
DROP VIEW IF EXISTS v_improvement_ledger_loop_a_applied_rate CASCADE;
DROP VIEW IF EXISTS v_improvement_ledger_loop_b_signal_aggregation CASCADE;
DROP VIEW IF EXISTS v_improvement_ledger_loop_c_retro_learn CASCADE;
DROP VIEW IF EXISTS v_improvement_ledger_loop_d_convergence_clone CASCADE;
DROP VIEW IF EXISTS v_improvement_ledger_loop_e_role_self_review CASCADE;
DROP VIEW IF EXISTS v_improvement_ledger_loop_f_pat_registry CASCADE;

-- ============================================================
-- Loop A: ledger applied-rate (protocol_improvement_queue)
-- ============================================================
CREATE OR REPLACE VIEW v_improvement_ledger_loop_a_applied_rate WITH (security_invoker = true) AS
SELECT 'A_applied_rate'::text AS loop_id, id::text AS cycle_id, 'RECORD'::text AS stage,
       created_at AS entered_at, status AS stage_status, 'protocol_improvement_queue'::text AS source_table
FROM protocol_improvement_queue WHERE created_at IS NOT NULL
UNION ALL
SELECT 'A_applied_rate', id::text, 'DECIDE', reviewed_at, status, 'protocol_improvement_queue'
FROM protocol_improvement_queue WHERE reviewed_at IS NOT NULL
UNION ALL
-- ACT keyed on status (not applied_at IS NOT NULL): reviewed_fields_complete only
-- enforces reviewed_at for non-PENDING/SD_CREATED status, NOT applied_at for
-- APPLIED -- 11 of 82 live status='APPLIED' rows have a NULL applied_at, so an
-- applied_at-only filter silently undercounts this loop's own namesake metric.
-- entered_at falls back through the best available timestamp when applied_at
-- itself is one of the missing ones.
SELECT 'A_applied_rate', id::text, 'ACT', COALESCE(applied_at, reviewed_at, created_at), status, 'protocol_improvement_queue'
FROM protocol_improvement_queue WHERE status = 'APPLIED'
UNION ALL
SELECT 'A_applied_rate', id::text, 'VERIFY', effectiveness_measured_at, effectiveness_score::text, 'protocol_improvement_queue'
FROM protocol_improvement_queue WHERE effectiveness_measured_at IS NOT NULL
UNION ALL
-- PREVENT: pinned formula (verified against the live idx_protocol_improvement_rollback_expiry
-- partial index) -- superseded, or applied and past its rollback window with no rollback taken.
-- entered_at falls back to created_at (never null) so a future SUPERSEDED row
-- with both rollback_expires_at and applied_at NULL can't violate this file's
-- own no-NULL-entered_at invariant.
SELECT 'A_applied_rate', id::text, 'PREVENT', COALESCE(rollback_expires_at, applied_at, created_at), status, 'protocol_improvement_queue'
FROM protocol_improvement_queue
WHERE status = 'SUPERSEDED' OR (status = 'APPLIED' AND rollback_expires_at < now() AND rolled_back_at IS NULL);

-- ============================================================
-- Loop B: signal aggregation (session_coordination)
-- v1 intentionally covers RECORD/DECIDE/ACT only -- no reliable FK from
-- session_coordination to the promoted feedback row (dedup is by content
-- hash, not FK) and the table is ~24h-TTL ephemeral, so VERIFY/PREVENT are
-- not fabricated. Documented gap, not a defect.
-- ============================================================
CREATE OR REPLACE VIEW v_improvement_ledger_loop_b_signal_aggregation WITH (security_invoker = true) AS
SELECT 'B_signal_aggregation'::text AS loop_id, id::text AS cycle_id, 'RECORD'::text AS stage, created_at AS entered_at,
       COALESCE(payload->>'signal_type', 'unknown') AS stage_status, 'session_coordination'::text AS source_table
FROM session_coordination WHERE payload ? 'signal_type'
UNION ALL
SELECT 'B_signal_aggregation', id::text, 'DECIDE', read_at, 'read', 'session_coordination'
FROM session_coordination WHERE payload ? 'signal_type' AND read_at IS NOT NULL
UNION ALL
SELECT 'B_signal_aggregation', id::text, 'ACT', acknowledged_at, 'acknowledged', 'session_coordination'
FROM session_coordination WHERE payload ? 'signal_type' AND acknowledged_at IS NOT NULL;

-- ============================================================
-- Loop C: retro/learn (retrospectives)
-- SENSE/VERIFY/PREVENT intentionally not emitted here -- covered by loop A
-- and loop F's views, since retrospectives feeds both protocol_improvement_queue
-- and issue_patterns downstream. Overlap across loops is by design.
-- ============================================================
CREATE OR REPLACE VIEW v_improvement_ledger_loop_c_retro_learn WITH (security_invoker = true) AS
SELECT 'C_retro_learn'::text AS loop_id, id::text AS cycle_id, 'RECORD'::text AS stage, created_at AS entered_at, retro_type AS stage_status, 'retrospectives'::text AS source_table
FROM retrospectives WHERE created_at IS NOT NULL
UNION ALL
SELECT 'C_retro_learn', id::text, 'DECIDE', quality_validated_at, COALESCE(quality_validated_by, 'unknown'), 'retrospectives'
FROM retrospectives WHERE quality_validated_at IS NOT NULL
UNION ALL
SELECT 'C_retro_learn', id::text, 'ACT', learning_extracted_at, 'extracted', 'retrospectives'
FROM retrospectives WHERE learning_extracted_at IS NOT NULL;

-- ============================================================
-- Loop D: convergence-clone (convergence_ledger_runs + convergence_ledger_stages)
-- NOTE: convergence_ledger_stages.stage is an INTEGER (the 0-26 pipeline
-- stage), a different concept from this view's own text `stage` output
-- column (SENSE/RECORD/.../PREVENT) -- the source stage number is folded
-- into stage_status text only, never assigned to the output `stage` column.
-- convergence_ledger_stages has 0 live rows today; an empty result for the
-- stage-level rows is an honest reflection of current data, not a bug.
-- ============================================================
-- cycle_id is the run_id alone (NOT run_id:stage) on every branch, RECORD
-- through PREVENT alike -- cycle_id identifies the unit of work (the
-- convergence run), while the source table's own numbered pipeline stage
-- (0-26, a different concept from this view's own SENSE/RECORD/.../PREVENT
-- stage) is descriptive content folded into stage_status only. A run that
-- passes through several numbered pipeline stages legitimately produces
-- several RECORD rows sharing one cycle_id, distinguished by entered_at.
CREATE OR REPLACE VIEW v_improvement_ledger_loop_d_convergence_clone WITH (security_invoker = true) AS
SELECT 'D_convergence_clone'::text AS loop_id, run_id::text AS cycle_id, 'RECORD'::text AS stage,
       entered_at AS entered_at, ('stage ' || stage::text || ' - ' || stage_status) AS stage_status, 'convergence_ledger_stages'::text AS source_table
FROM convergence_ledger_stages WHERE entered_at IS NOT NULL
UNION ALL
SELECT 'D_convergence_clone', run_id::text, 'ACT', entered_at, stage_status, 'convergence_ledger_stages'
FROM convergence_ledger_stages WHERE fix_cycle_count > 0
UNION ALL
SELECT 'D_convergence_clone', run_id::text, 'VERIFY', entered_at, stage_status, 'convergence_ledger_stages'
FROM convergence_ledger_stages WHERE stage_status = 'clean' AND issues_resolved >= issues_found
UNION ALL
SELECT 'D_convergence_clone', run_id::text, 'PREVENT', ended_at, status, 'convergence_ledger_runs'
FROM convergence_ledger_runs WHERE ended_at IS NOT NULL AND status = 'clean';

-- ============================================================
-- Loop E: role self-review (feedback WHERE category='adam_self_assessment')
-- Filtered by category, not a hardcoded role name, so additional roles'
-- rows (once SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 ships more writers) appear
-- automatically without a view change.
-- KNOWN LIMITATION: all three stages reuse the feedback row's own created_at
-- as entered_at -- the source JSON (metadata.score) carries no separate
-- verified_at/escalated_at timestamps, so a VERIFY or PREVENT row will show
-- the same instant as its RECORD row rather than when verification/escalation
-- actually happened. Adding those timestamps would require a new column on
-- feedback, out of scope for a no-schema-mutation SD; this is the best
-- signal available from existing data, not a bug to silently paper over.
-- ============================================================
CREATE OR REPLACE VIEW v_improvement_ledger_loop_e_role_self_review WITH (security_invoker = true) AS
SELECT 'E_role_self_review'::text AS loop_id, id::text AS cycle_id, 'RECORD'::text AS stage, created_at AS entered_at,
       COALESCE(metadata->'score'->>'cycle', 'unknown') AS stage_status, 'feedback'::text AS source_table
FROM feedback WHERE category = 'adam_self_assessment'
UNION ALL
SELECT 'E_role_self_review', id::text, 'VERIFY', created_at,
       COALESCE(metadata->'score'->'verify_verdict'->>'valid', 'unknown'), 'feedback'
FROM feedback WHERE category = 'adam_self_assessment' AND metadata->'score'->'verify_verdict' IS NOT NULL
UNION ALL
SELECT 'E_role_self_review', id::text, 'PREVENT', created_at, 'escalated', 'feedback'
FROM feedback WHERE category = 'adam_self_assessment'
  AND metadata->'score'->'verify_verdict'->>'escalation' = 'true';

-- ============================================================
-- Loop F: PAT registry (issue_patterns)
-- PREVENT requires a populated prevention_checklist, not merely status='resolved'.
-- ============================================================
CREATE OR REPLACE VIEW v_improvement_ledger_loop_f_pat_registry WITH (security_invoker = true) AS
SELECT 'F_pat_registry'::text AS loop_id, pattern_id::text AS cycle_id, 'RECORD'::text AS stage, created_at AS entered_at, status::text AS stage_status, 'issue_patterns'::text AS source_table
FROM issue_patterns WHERE first_seen_sd_id IS NOT NULL AND created_at IS NOT NULL
UNION ALL
SELECT 'F_pat_registry', pattern_id::text, 'DECIDE', assignment_date, status, 'issue_patterns'
FROM issue_patterns WHERE status = 'assigned' AND assignment_date IS NOT NULL
UNION ALL
SELECT 'F_pat_registry', pattern_id::text, 'ACT', assignment_date, ('assigned to ' || COALESCE(assigned_sd_id, 'unknown')), 'issue_patterns'
FROM issue_patterns WHERE assignment_date IS NOT NULL
UNION ALL
SELECT 'F_pat_registry', pattern_id::text, 'VERIFY', resolution_date, status, 'issue_patterns'
FROM issue_patterns WHERE resolution_date IS NOT NULL
UNION ALL
SELECT 'F_pat_registry', pattern_id::text, 'PREVENT', resolution_date, 'resolved', 'issue_patterns'
FROM issue_patterns
WHERE status = 'resolved' AND resolution_date IS NOT NULL
  AND prevention_checklist IS NOT NULL
  AND (CASE WHEN jsonb_typeof(prevention_checklist) = 'array' THEN jsonb_array_length(prevention_checklist) ELSE 0 END) > 0;

-- ============================================================
-- Spine view: v_improvement_ledger -- the SSOT the SD is named for.
-- One stable place for the two dependent sibling SDs to query across all
-- six loops without needing to know all six per-loop view names.
-- ============================================================
CREATE OR REPLACE VIEW v_improvement_ledger WITH (security_invoker = true) AS
SELECT * FROM v_improvement_ledger_loop_a_applied_rate
UNION ALL
SELECT * FROM v_improvement_ledger_loop_b_signal_aggregation
UNION ALL
SELECT * FROM v_improvement_ledger_loop_c_retro_learn
UNION ALL
SELECT * FROM v_improvement_ledger_loop_d_convergence_clone
UNION ALL
SELECT * FROM v_improvement_ledger_loop_e_role_self_review
UNION ALL
SELECT * FROM v_improvement_ledger_loop_f_pat_registry;

-- ============================================================
-- RLS-safe grants (FR-9). REVOKE is the load-bearing control -- see header
-- note. Must be re-applied after any future DROP+CREATE (Supabase resets
-- grants to its default blanket anon/authenticated SELECT on view creation).
-- ============================================================
REVOKE ALL ON v_improvement_ledger_loop_a_applied_rate FROM PUBLIC, anon, authenticated;
REVOKE ALL ON v_improvement_ledger_loop_b_signal_aggregation FROM PUBLIC, anon, authenticated;
REVOKE ALL ON v_improvement_ledger_loop_c_retro_learn FROM PUBLIC, anon, authenticated;
REVOKE ALL ON v_improvement_ledger_loop_d_convergence_clone FROM PUBLIC, anon, authenticated;
REVOKE ALL ON v_improvement_ledger_loop_e_role_self_review FROM PUBLIC, anon, authenticated;
REVOKE ALL ON v_improvement_ledger_loop_f_pat_registry FROM PUBLIC, anon, authenticated;
REVOKE ALL ON v_improvement_ledger FROM PUBLIC, anon, authenticated;

GRANT SELECT ON v_improvement_ledger_loop_a_applied_rate TO service_role;
GRANT SELECT ON v_improvement_ledger_loop_b_signal_aggregation TO service_role;
GRANT SELECT ON v_improvement_ledger_loop_c_retro_learn TO service_role;
GRANT SELECT ON v_improvement_ledger_loop_d_convergence_clone TO service_role;
GRANT SELECT ON v_improvement_ledger_loop_e_role_self_review TO service_role;
GRANT SELECT ON v_improvement_ledger_loop_f_pat_registry TO service_role;
GRANT SELECT ON v_improvement_ledger TO service_role;
