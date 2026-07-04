-- Migration: Widen feedback.source_application varchar(50) -> varchar(255)
-- SD: SD-LEO-INFRA-UNIVERSAL-VENTURE-TELEMETRY-001 (RCA follow-up, TS-7)
-- Purpose: record_venture_error() (20260704d) and the pre-existing service-role
--          captureError() writer (lib/factory/feedback-writer.js) both denormalize
--          the full ventures.name into feedback.source_application, but that column
--          was varchar(50) while ventures.name is varchar(255) — any venture name
--          over 50 chars raised PG 22001 "value too long", silently dropping
--          feedback-writer.js rows (logged + swallowed) and hard-failing the new RPC
--          (surfaced by TS-7's "TS-fixture-other-<uuid>" fixture name, 53 chars).
--          9 live ventures already exceed 30 chars. Widening (not truncating) preserves
--          the exact-name correlation lib/factory/daily-digest.js and
--          lib/quality/burst-detector.js depend on (.eq('source_application', venture.name)).
--          Bound to varchar(255) (matching ventures.name), not text, so this stays a
--          deliberate width match rather than an unbounded column.
-- Date: 2026-07-04
--
-- v_feedback_with_sensemaking is the only view depending on feedback.source_application
-- (verified via pg_depend) — must be dropped and recreated around the ALTER COLUMN.

BEGIN;

DROP VIEW IF EXISTS public.v_feedback_with_sensemaking;

ALTER TABLE public.feedback
  ALTER COLUMN source_application TYPE varchar(255);

CREATE VIEW public.v_feedback_with_sensemaking AS
 SELECT f.id,
    f.type,
    f.source_application,
    f.source_type,
    f.source_id,
    f.title,
    f.description,
    f.status,
    f.priority,
    f.sd_id,
    f.user_id,
    f.session_id,
    f.page_url,
    f.command,
    f.environment,
    f.severity,
    f.category,
    f.error_message,
    f.stack_trace,
    f.error_hash,
    f.occurrence_count,
    f.first_seen,
    f.last_seen,
    f.resolution_type,
    f.value_estimate,
    f.effort_estimate,
    f.votes,
    f.use_case,
    f.original_type,
    f.converted_at,
    f.conversion_reason,
    f.triaged_at,
    f.triaged_by,
    f.snoozed_until,
    f.ignore_pattern,
    f.ai_triage_suggestion,
    f.assigned_to,
    f.resolution_sd_id,
    f.resolution_notes,
    f.created_at,
    f.updated_at,
    f.resolved_at,
    f.cluster_processed_at,
    f.quick_fix_id,
    f.strategic_directive_id,
    f.duplicate_of_id,
    f.ai_triage_confidence,
    f.ai_triage_classification,
    f.ai_triage_source,
    f.rubric_score,
    f.quality_assessment,
    f.metadata,
    sa.id AS sensemaking_analysis_id,
    sa.disposition AS sensemaking_disposition,
    sa.disposition_at AS sensemaking_disposition_at,
    sa.overall_confidence AS sensemaking_confidence,
    sa.status AS sensemaking_status
   FROM feedback f
     LEFT JOIN sensemaking_analyses sa ON (f.metadata ->> 'sensemaking_correlation_id'::text) = sa.correlation_id;

-- Restore the pre-existing ACL (verified via pg_class.relacl before the drop:
-- postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm --
-- a blanket "GRANT ALL ON ALL TABLES/VIEWS IN SCHEMA public" pattern, not a
-- hand-curated per-object grant).
GRANT ALL ON public.v_feedback_with_sensemaking TO anon, authenticated, service_role;

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed — narrows back to varchar(50); will fail if any
-- row's source_application already exceeds 50 chars post-widening):
-- ============================================================
-- BEGIN;
-- DROP VIEW IF EXISTS public.v_feedback_with_sensemaking;
-- ALTER TABLE public.feedback ALTER COLUMN source_application TYPE varchar(50);
-- CREATE VIEW public.v_feedback_with_sensemaking AS <same SELECT as above>;
-- GRANT ALL ON public.v_feedback_with_sensemaking TO anon, authenticated, service_role;
-- COMMIT;
