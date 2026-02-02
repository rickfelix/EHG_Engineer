-- Migration: Severity-Weighted Pattern Prioritization
-- Date: 2026-02-02
-- SD: SD-LEO-ENH-SEVERITY-WEIGHTED-PATTERN-001
-- Description: Adds severity weighting to pattern prioritization in /learn process
--              Critical/high severity patterns surface even with single occurrence

-- ============================================================
-- Update v_patterns_with_decay view with severity weighting
-- ============================================================
-- Severity weights: critical=10, high=5, medium=2, low=1, unknown=1
-- Composite score: severity_weight*20 + occurrence_count*5 + actionability_bonus
-- This ensures critical issues rank higher than frequent low-severity issues

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
    -- actionability_bonus: 15 if proven_solutions exists, 0 otherwise
    (
        CASE LOWER(COALESCE(p.severity, 'unknown'))
            WHEN 'critical' THEN 10
            WHEN 'high' THEN 5
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 1
        END * 20
        + (COALESCE(p.occurrence_count, 1) * 5)
        + CASE WHEN p.proven_solutions IS NOT NULL AND jsonb_array_length(p.proven_solutions) > 0 THEN 15 ELSE 0 END
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
    -- Critical: always surface (threshold = 1)
    -- High: surface with 1-2 occurrences (threshold = 1)
    -- Medium/Low: require 3+ occurrences (threshold = 3)
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

COMMENT ON VIEW v_patterns_with_decay IS
'Patterns with severity-weighted composite scoring. Critical/high severity patterns surface with 1 occurrence.
Composite score = severity_weight*20 + occurrence_count*5 + actionability_bonus.
Severity weights: critical=10, high=5, medium=2, low=1.';

-- ============================================================
-- Verification query (run after migration)
-- ============================================================
-- SELECT
--     pattern_id,
--     severity,
--     occurrence_count,
--     severity_weight,
--     composite_score,
--     min_occurrence_threshold,
--     meets_threshold
-- FROM v_patterns_with_decay
-- ORDER BY composite_score DESC
-- LIMIT 10;
