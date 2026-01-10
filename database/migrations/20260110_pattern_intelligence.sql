-- Migration: Pattern Intelligence Enhancements
-- Date: 2026-01-10
-- Description: Adds evidence decay, duplicate detection support, and trend auto-calculation

-- ============================================================
-- TIER 1: Evidence Decay View
-- ============================================================
-- Calculates recency-adjusted confidence for patterns
-- Decay formula: base_confidence * exp(-0.023 * days_since_update)
-- This gives ~50% decay after 30 days

CREATE OR REPLACE VIEW v_patterns_with_decay AS
SELECT
    p.*,
    EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)) AS days_since_update,
    ROUND(
        (50 + (p.occurrence_count * 5)) *
        EXP(-0.023 * EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)))
    )::INTEGER AS decay_adjusted_confidence,
    CASE
        WHEN EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)) > 60 THEN 'stale'
        WHEN EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)) > 30 THEN 'aging'
        ELSE 'fresh'
    END AS recency_status
FROM issue_patterns p
WHERE p.status = 'active';

COMMENT ON VIEW v_patterns_with_decay IS 'Patterns with recency-adjusted confidence scores. Stale patterns (60+ days) rank lower.';

-- ============================================================
-- TIER 3: Pattern Occurrences Table (for Trend Calculation)
-- ============================================================
-- Tracks each time a pattern is observed for trend analysis

CREATE TABLE IF NOT EXISTS pattern_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id VARCHAR(20) REFERENCES issue_patterns(pattern_id) ON DELETE CASCADE,
    sd_id VARCHAR REFERENCES strategic_directives_v2(id),
    occurred_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT, -- 'retrospective', 'manual', 'sub_agent'
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_pattern_occurrences_pattern ON pattern_occurrences(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_occurrences_date ON pattern_occurrences(occurred_at DESC);

COMMENT ON TABLE pattern_occurrences IS 'Tracks individual pattern occurrences for trend calculation.';

-- ============================================================
-- TIER 3: Trend Calculation Function
-- ============================================================
-- Compares recent occurrences (7 days) vs historical (30 days)
-- Updates the trend field on issue_patterns

CREATE OR REPLACE FUNCTION calculate_pattern_trends()
RETURNS TABLE(pattern_id VARCHAR, old_trend VARCHAR, new_trend VARCHAR, recent_count BIGINT, historical_avg NUMERIC)
LANGUAGE plpgsql
AS $$
DECLARE
    rec RECORD;
    recent_7d BIGINT;
    prev_30d BIGINT;
    avg_weekly NUMERIC;
BEGIN
    FOR rec IN SELECT ip.pattern_id, ip.trend FROM issue_patterns ip WHERE ip.status = 'active'
    LOOP
        -- Count occurrences in last 7 days
        SELECT COUNT(*) INTO recent_7d
        FROM pattern_occurrences po
        WHERE po.pattern_id = rec.pattern_id
          AND po.occurred_at > NOW() - INTERVAL '7 days';

        -- Count occurrences in previous 30 days (excluding last 7)
        SELECT COUNT(*) INTO prev_30d
        FROM pattern_occurrences po
        WHERE po.pattern_id = rec.pattern_id
          AND po.occurred_at BETWEEN NOW() - INTERVAL '37 days' AND NOW() - INTERVAL '7 days';

        -- Calculate weekly average from previous period
        avg_weekly := prev_30d / 4.0; -- 30 days = ~4 weeks

        -- Determine trend
        IF recent_7d > avg_weekly * 1.5 THEN
            -- 50% more than average = increasing
            UPDATE issue_patterns SET trend = 'increasing', updated_at = NOW()
            WHERE issue_patterns.pattern_id = rec.pattern_id AND (trend IS DISTINCT FROM 'increasing');

            IF rec.trend IS DISTINCT FROM 'increasing' THEN
                pattern_id := rec.pattern_id;
                old_trend := rec.trend;
                new_trend := 'increasing';
                recent_count := recent_7d;
                historical_avg := avg_weekly;
                RETURN NEXT;
            END IF;
        ELSIF recent_7d < avg_weekly * 0.5 OR (recent_7d = 0 AND prev_30d > 0) THEN
            -- 50% less than average or no recent = decreasing
            UPDATE issue_patterns SET trend = 'decreasing', updated_at = NOW()
            WHERE issue_patterns.pattern_id = rec.pattern_id AND (trend IS DISTINCT FROM 'decreasing');

            IF rec.trend IS DISTINCT FROM 'decreasing' THEN
                pattern_id := rec.pattern_id;
                old_trend := rec.trend;
                new_trend := 'decreasing';
                recent_count := recent_7d;
                historical_avg := avg_weekly;
                RETURN NEXT;
            END IF;
        ELSE
            -- Within normal range = stable
            UPDATE issue_patterns SET trend = 'stable', updated_at = NOW()
            WHERE issue_patterns.pattern_id = rec.pattern_id AND (trend IS DISTINCT FROM 'stable');

            IF rec.trend IS DISTINCT FROM 'stable' THEN
                pattern_id := rec.pattern_id;
                old_trend := rec.trend;
                new_trend := 'stable';
                recent_count := recent_7d;
                historical_avg := avg_weekly;
                RETURN NEXT;
            END IF;
        END IF;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION calculate_pattern_trends() IS 'Recalculates trend field for all active patterns based on occurrence history. Run weekly.';

-- ============================================================
-- TIER 3: Helper to Record Pattern Occurrence
-- ============================================================

CREATE OR REPLACE FUNCTION record_pattern_occurrence(
    p_pattern_id VARCHAR,
    p_sd_id VARCHAR DEFAULT NULL,
    p_source TEXT DEFAULT 'manual',
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO pattern_occurrences (pattern_id, sd_id, source, notes)
    VALUES (p_pattern_id, p_sd_id, p_source, p_notes)
    RETURNING id INTO new_id;

    -- Also increment occurrence_count on the pattern
    UPDATE issue_patterns
    SET occurrence_count = occurrence_count + 1,
        last_seen_sd_id = COALESCE(p_sd_id, last_seen_sd_id),
        updated_at = NOW()
    WHERE pattern_id = p_pattern_id;

    RETURN new_id;
END;
$$;

COMMENT ON FUNCTION record_pattern_occurrence IS 'Records a pattern occurrence and updates the pattern metadata.';
