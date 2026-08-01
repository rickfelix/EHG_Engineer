-- Migration: refresh v_patterns_with_decay so its column list matches issue_patterns again
-- Date: 2026-08-01
-- SD: SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 (FR-5)
--
-- THE DEFECT. context-builder.js asks this view for metadata and dedup_fingerprint and gets
-- PostgREST 42703, so the learning read path silently falls back and surfaces almost nothing.
--
-- THE MECHANISM, and it is the interesting part. 20260207_fix_v_patterns_with_decay_scalar_bug.sql
-- defines this view with `SELECT p.*`. Postgres does NOT store the star — it EXPANDS it to an
-- explicit column list at CREATE OR REPLACE time and freezes that list. Five days later,
-- 20260212_learning_pipeline_data_quality.sql added dedup_fingerprint to issue_patterns. The view
-- had already been frozen without it. Two later migrations touched this view but only via
-- ALTER VIEW ... SET (security_invoker=on), which does not re-expand the star, so the list has been
-- stale since 2026-02-07. A view written with `p.*` therefore looks self-maintaining in source and
-- is not.
--
-- MEASURED, not inferred. Probing each column on the table and on the view:
--   metadata, dedup_fingerprint, data_quality_status, content_embedding, embedding_updated_at,
--   auto_block_on_match  ->  ok on issue_patterns, 42703 on the view. SIX, not one.
-- Two controls confirm the probe discriminates: pattern_id reads ok on BOTH, and a deliberately
-- nonexistent column returns 42703 on BOTH. A single-column patch for dedup_fingerprint would
-- have re-raised 42703 immediately, because context-builder requests metadata in the same select.
--
-- THE FIX. Re-run the identical definition. Because the source uses p.*, replaying it re-expands
-- against today's issue_patterns and picks up all six. No column is enumerated here on purpose:
-- enumerating would freeze a NEW list and reintroduce exactly this drift on the next ALTER TABLE.

CREATE OR REPLACE VIEW v_patterns_with_decay AS
SELECT
    p.*,
    EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)) AS days_since_update,

    -- Severity weight calculation
    CASE LOWER(COALESCE(p.severity, 'unknown'))
        WHEN 'critical' THEN 10
        WHEN 'high' THEN 5
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 1
        ELSE 1  -- unknown/null defaults to low
    END AS severity_weight,

    -- Composite score: severity_weight*20 + occurrence_count*5 + actionability_bonus
    (
        CASE LOWER(COALESCE(p.severity, 'unknown'))
            WHEN 'critical' THEN 10
            WHEN 'high' THEN 5
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 1
        END * 20
        + (COALESCE(p.occurrence_count, 1) * 5)
        + CASE
            WHEN p.proven_solutions IS NOT NULL
                 AND jsonb_typeof(p.proven_solutions) = 'array'
                 AND jsonb_array_length(p.proven_solutions) > 0
            THEN 15
            ELSE 0
          END
    ) AS composite_score,

    -- Legacy decay_adjusted_confidence (kept for backward compatibility)
    ROUND(
        (50 + (COALESCE(p.occurrence_count, 1) * 5)) *
        EXP(-0.023 * EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)))
    )::INTEGER AS decay_adjusted_confidence,

    -- Recency status
    CASE
        WHEN EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)) > 60 THEN 'stale'
        WHEN EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)) > 30 THEN 'aging'
        ELSE 'fresh'
    END AS recency_status,

    -- Minimum occurrence threshold bypass for critical/high severity
    CASE LOWER(COALESCE(p.severity, 'unknown'))
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 1
        ELSE 3
    END AS min_occurrence_threshold,

    -- Flag: Does this pattern meet its severity-adjusted threshold?
    CASE
        WHEN LOWER(COALESCE(p.severity, 'unknown')) IN ('critical', 'high') THEN true
        WHEN COALESCE(p.occurrence_count, 1) >= 3 THEN true
        ELSE false
    END AS meets_threshold

FROM issue_patterns p
WHERE p.status = 'active';

-- Preserved from 20260211/20260602: a bare CREATE OR REPLACE VIEW does drop security_invoker --
-- verified empirically against a disposable scratch view, not taken from documentation.
--
-- CORRECTED AFTER SECURITY REVIEW: an earlier draft of this comment said omitting the line would
-- "silently revert" the protection. That overstates it. The leo_enforce_view_security_invoker
-- event trigger from 20260602 is live and fires synchronously within the same DDL command, so in
-- THIS database the omission would be caught loudly with no exposure window. The line stays as
-- defence-in-depth for a replay into an environment without that trigger -- which is a real
-- reason, and a smaller one than the comment originally claimed.
ALTER VIEW v_patterns_with_decay SET (security_invoker = on);

COMMENT ON VIEW v_patterns_with_decay IS
'Patterns with severity-weighted composite scoring. Critical/high severity patterns surface with 1 occurrence.
Composite score = severity_weight*20 + occurrence_count*5 + actionability_bonus.
Severity weights: critical=10, high=5, medium=2, low=1.
Guards jsonb_array_length() with jsonb_typeof() to prevent scalar crashes.
WRITTEN WITH p.* ON PURPOSE: an explicit column list freezes and drifts the moment a column is
added to issue_patterns, which is how six columns went missing between 2026-02-07 and 2026-08-01.
Replay this migration after any ALTER TABLE issue_patterns ADD COLUMN.';

-- VERIFICATION (run after applying; all six must return rows rather than 42703):
--   SELECT metadata, dedup_fingerprint, data_quality_status,
--          content_embedding, embedding_updated_at, auto_block_on_match
--   FROM v_patterns_with_decay LIMIT 1;
-- CONTROL — this must still raise 42703, proving the check can detect a genuinely absent column:
--   SELECT zzz_nonexistent FROM v_patterns_with_decay LIMIT 1;
