-- Migration: Fix v_patterns_with_decay scalar bug
-- Date: 2026-02-07
-- SD: SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-011
-- Item: #1 - Fix jsonb_array_length() crash on non-array proven_solutions
--
-- Root Cause: The view uses jsonb_array_length(p.proven_solutions) which crashes
-- when proven_solutions is a scalar (string, object, number) instead of a JSON array.
-- Error: "cannot get array length of a scalar"
--
-- Fix: Guard with jsonb_typeof() = 'array' check before calling jsonb_array_length()

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
    -- actionability_bonus: 15 if proven_solutions is a non-empty array, 0 otherwise
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

COMMENT ON VIEW v_patterns_with_decay IS
'Patterns with severity-weighted composite scoring. Critical/high severity patterns surface with 1 occurrence.
Composite score = severity_weight*20 + occurrence_count*5 + actionability_bonus.
Severity weights: critical=10, high=5, medium=2, low=1.
Fix: Guards jsonb_array_length() with jsonb_typeof() check to prevent scalar crashes.';

-- Verification: This should not crash even if proven_solutions contains non-array values
-- SELECT pattern_id, severity, composite_score, proven_solutions,
--        jsonb_typeof(proven_solutions) as solutions_type
-- FROM v_patterns_with_decay
-- ORDER BY composite_score DESC
-- LIMIT 10;
