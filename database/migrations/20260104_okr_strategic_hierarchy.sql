-- Migration: OKR Strategic Hierarchy
-- Purpose: Create Vision → Objectives → Key Results → SD alignment structure
-- Author: Claude (SD-OKR-HIERARCHY-001)
-- Date: 2026-01-04

-- ============================================================================
-- 1. STRATEGIC VISION TABLE
-- ============================================================================
-- Top-level vision that rarely changes (2-5 year horizon)

CREATE TABLE IF NOT EXISTS strategic_vision (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,              -- "EHG-2028", "SOLARA-2026"
    title TEXT NOT NULL,                    -- "EHG Holding Company Vision"
    statement TEXT NOT NULL,                -- Full vision statement
    time_horizon_start DATE,                -- 2026-01-01
    time_horizon_end DATE,                  -- 2028-12-31
    is_active BOOLEAN DEFAULT TRUE,
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE strategic_vision IS 'Top-level organizational vision (2-5 year horizon)';
COMMENT ON COLUMN strategic_vision.code IS 'Unique identifier like EHG-2028';
COMMENT ON COLUMN strategic_vision.statement IS 'Full vision statement text';

-- ============================================================================
-- 2. OBJECTIVES TABLE
-- ============================================================================
-- Qualitative, inspirational goals (what we want to achieve)

CREATE TABLE IF NOT EXISTS objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vision_id UUID REFERENCES strategic_vision(id) ON DELETE SET NULL,
    code TEXT UNIQUE NOT NULL,              -- "O1-AUTONOMY", "O2-EFFICIENCY"
    title TEXT NOT NULL,                    -- "EVA operates autonomously"
    description TEXT,                       -- Detailed description
    owner TEXT,                             -- "EVA Team", "Chairman"
    cadence TEXT DEFAULT 'quarterly' CHECK (cadence IN ('quarterly', 'annual', 'ongoing')),
    period TEXT,                            -- "2026-Q1", "2026-H1", "2026"
    sequence INT DEFAULT 1,                 -- Display order
    is_active BOOLEAN DEFAULT TRUE,
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_objectives_vision_id ON objectives(vision_id);
CREATE INDEX IF NOT EXISTS idx_objectives_is_active ON objectives(is_active);

COMMENT ON TABLE objectives IS 'Qualitative goals (the O in OKRs)';
COMMENT ON COLUMN objectives.code IS 'Unique code like O1-AUTONOMY';
COMMENT ON COLUMN objectives.cadence IS 'How often this objective is reviewed';

-- ============================================================================
-- 3. KEY RESULTS TABLE
-- ============================================================================
-- Quantitative, measurable outcomes (how we know we achieved the objective)

CREATE TABLE IF NOT EXISTS key_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID REFERENCES objectives(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,              -- "KR1.1-QUALITY-GATE"
    title TEXT NOT NULL,                    -- "Quality gate pass rate ≥85%"
    description TEXT,

    -- Metrics
    metric_type TEXT CHECK (metric_type IN ('percentage', 'number', 'currency', 'duration', 'boolean', 'stage')),
    baseline_value NUMERIC,                 -- Starting point (e.g., 72)
    current_value NUMERIC,                  -- Current value (e.g., 75)
    target_value NUMERIC NOT NULL,          -- Goal (e.g., 85)
    unit TEXT,                              -- "%", "hours", "users", "$", "stage"
    direction TEXT DEFAULT 'increase' CHECK (direction IN ('increase', 'decrease', 'maintain')),

    -- Status tracking
    confidence NUMERIC CHECK (confidence BETWEEN 0 AND 1),  -- 0.7 = 70% confident we'll hit target
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'on_track', 'at_risk', 'off_track', 'achieved', 'missed')),

    -- Metadata
    sequence INT DEFAULT 1,                 -- Display order within objective
    is_active BOOLEAN DEFAULT TRUE,
    last_updated_by TEXT,
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_results_objective_id ON key_results(objective_id);
CREATE INDEX IF NOT EXISTS idx_key_results_status ON key_results(status);
CREATE INDEX IF NOT EXISTS idx_key_results_is_active ON key_results(is_active);

COMMENT ON TABLE key_results IS 'Measurable outcomes (the KR in OKRs)';
COMMENT ON COLUMN key_results.baseline_value IS 'Starting value when KR was created';
COMMENT ON COLUMN key_results.current_value IS 'Current measured value';
COMMENT ON COLUMN key_results.confidence IS 'Subjective confidence (0-1) of hitting target';
COMMENT ON COLUMN key_results.direction IS 'Whether we want this metric to go up, down, or stay stable';

-- ============================================================================
-- 4. SD-TO-KEY-RESULT ALIGNMENT TABLE
-- ============================================================================
-- Many-to-many relationship between SDs and Key Results
-- NOTE: sd_id is VARCHAR to match strategic_directives_v2.id column type

CREATE TABLE IF NOT EXISTS sd_key_result_alignment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    key_result_id UUID REFERENCES key_results(id) ON DELETE CASCADE,

    -- Contribution details
    contribution_type TEXT DEFAULT 'supporting' CHECK (contribution_type IN ('direct', 'enabling', 'supporting')),
    contribution_weight NUMERIC DEFAULT 1.0 CHECK (contribution_weight > 0),
    contribution_note TEXT,                 -- "Enables automated quality checks"

    -- AI-generated alignment (for provenance)
    aligned_by TEXT DEFAULT 'manual' CHECK (aligned_by IN ('manual', 'ai_suggested', 'ai_auto')),
    alignment_confidence NUMERIC CHECK (alignment_confidence BETWEEN 0 AND 1),

    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(sd_id, key_result_id)
);

CREATE INDEX IF NOT EXISTS idx_sd_kr_alignment_sd_id ON sd_key_result_alignment(sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_kr_alignment_kr_id ON sd_key_result_alignment(key_result_id);

COMMENT ON TABLE sd_key_result_alignment IS 'Links Strategic Directives to Key Results';
COMMENT ON COLUMN sd_key_result_alignment.contribution_type IS 'direct=moves KR directly, enabling=unblocks work, supporting=helps indirectly';
COMMENT ON COLUMN sd_key_result_alignment.aligned_by IS 'Who/what created this alignment';

-- ============================================================================
-- 5. KEY RESULT PROGRESS SNAPSHOTS
-- ============================================================================
-- Historical tracking of KR values over time

CREATE TABLE IF NOT EXISTS kr_progress_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_result_id UUID REFERENCES key_results(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    value NUMERIC NOT NULL,
    notes TEXT,
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(key_result_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_kr_snapshots_kr_id ON kr_progress_snapshots(key_result_id);
CREATE INDEX IF NOT EXISTS idx_kr_snapshots_date ON kr_progress_snapshots(snapshot_date);

COMMENT ON TABLE kr_progress_snapshots IS 'Historical tracking of Key Result values';

-- ============================================================================
-- 6. VIEWS FOR SD:NEXT INTEGRATION
-- ============================================================================

-- View: Full OKR hierarchy
CREATE OR REPLACE VIEW v_okr_hierarchy AS
SELECT
    v.id as vision_id,
    v.code as vision_code,
    v.title as vision_title,
    v.statement as vision_statement,
    o.id as objective_id,
    o.code as objective_code,
    o.title as objective_title,
    o.sequence as objective_sequence,
    kr.id as key_result_id,
    kr.code as kr_code,
    kr.title as kr_title,
    kr.metric_type,
    kr.baseline_value,
    kr.current_value,
    kr.target_value,
    kr.unit,
    kr.direction,
    kr.status,
    kr.confidence,
    kr.sequence as kr_sequence,
    -- Calculate progress percentage
    CASE
        WHEN kr.direction = 'decrease' THEN
            ROUND(((kr.baseline_value - kr.current_value) / NULLIF(kr.baseline_value - kr.target_value, 0)) * 100, 1)
        ELSE
            ROUND(((kr.current_value - COALESCE(kr.baseline_value, 0)) / NULLIF(kr.target_value - COALESCE(kr.baseline_value, 0), 0)) * 100, 1)
    END as progress_pct
FROM strategic_vision v
LEFT JOIN objectives o ON o.vision_id = v.id AND o.is_active = TRUE
LEFT JOIN key_results kr ON kr.objective_id = o.id AND kr.is_active = TRUE
WHERE v.is_active = TRUE
ORDER BY o.sequence, kr.sequence;

-- View: SD with OKR context (for sd:next)
CREATE OR REPLACE VIEW v_sd_okr_context AS
SELECT
    sd.id as sd_uuid,
    sd.legacy_id,
    sd.title as sd_title,
    sd.status,
    sd.progress_percentage,
    sd.is_working_on,
    COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
            'kr_code', kr.code,
            'kr_title', kr.title,
            'kr_status', kr.status,
            'objective_code', o.code,
            'objective_title', o.title,
            'contribution_type', ska.contribution_type,
            'contribution_note', ska.contribution_note,
            'kr_progress_pct', CASE
                WHEN kr.direction = 'decrease' THEN
                    ROUND(((kr.baseline_value - kr.current_value) / NULLIF(kr.baseline_value - kr.target_value, 0)) * 100, 1)
                ELSE
                    ROUND(((kr.current_value - COALESCE(kr.baseline_value, 0)) / NULLIF(kr.target_value - COALESCE(kr.baseline_value, 0), 0)) * 100, 1)
            END
        )) FILTER (WHERE kr.id IS NOT NULL),
        '[]'::jsonb
    ) as aligned_krs,
    COUNT(DISTINCT kr.id) as aligned_kr_count
FROM strategic_directives_v2 sd
LEFT JOIN sd_key_result_alignment ska ON sd.id = ska.sd_id
LEFT JOIN key_results kr ON ska.key_result_id = kr.id AND kr.is_active = TRUE
LEFT JOIN objectives o ON kr.objective_id = o.id AND o.is_active = TRUE
WHERE sd.is_active = TRUE
GROUP BY sd.id, sd.legacy_id, sd.title, sd.status, sd.progress_percentage, sd.is_working_on;

-- View: OKR scorecard (aggregated for display)
CREATE OR REPLACE VIEW v_okr_scorecard AS
SELECT
    o.id as objective_id,
    o.code as objective_code,
    o.title as objective_title,
    o.sequence,
    COUNT(kr.id) as total_krs,
    COUNT(CASE WHEN kr.status = 'achieved' THEN 1 END) as achieved_krs,
    COUNT(CASE WHEN kr.status = 'on_track' THEN 1 END) as on_track_krs,
    COUNT(CASE WHEN kr.status IN ('at_risk', 'off_track') THEN 1 END) as at_risk_krs,
    ROUND(AVG(
        CASE
            WHEN kr.direction = 'decrease' THEN
                ((kr.baseline_value - kr.current_value) / NULLIF(kr.baseline_value - kr.target_value, 0)) * 100
            ELSE
                ((kr.current_value - COALESCE(kr.baseline_value, 0)) / NULLIF(kr.target_value - COALESCE(kr.baseline_value, 0), 0)) * 100
        END
    ), 1) as avg_progress_pct,
    -- Generate 5-dot progress indicator: [●●●○○]
    CONCAT(
        '[',
        REPEAT('●', LEAST(5, GREATEST(0, FLOOR(
            AVG(
                CASE
                    WHEN kr.direction = 'decrease' THEN
                        ((kr.baseline_value - kr.current_value) / NULLIF(kr.baseline_value - kr.target_value, 0))
                    ELSE
                        ((kr.current_value - COALESCE(kr.baseline_value, 0)) / NULLIF(kr.target_value - COALESCE(kr.baseline_value, 0), 0))
                END
            ) * 5
        )::INT))),
        REPEAT('○', 5 - LEAST(5, GREATEST(0, FLOOR(
            AVG(
                CASE
                    WHEN kr.direction = 'decrease' THEN
                        ((kr.baseline_value - kr.current_value) / NULLIF(kr.baseline_value - kr.target_value, 0))
                    ELSE
                        ((kr.current_value - COALESCE(kr.baseline_value, 0)) / NULLIF(kr.target_value - COALESCE(kr.baseline_value, 0), 0))
                END
            ) * 5
        )::INT))),
        ']'
    ) as progress_dots
FROM objectives o
LEFT JOIN key_results kr ON kr.objective_id = o.id AND kr.is_active = TRUE
WHERE o.is_active = TRUE
GROUP BY o.id, o.code, o.title, o.sequence
ORDER BY o.sequence;

-- View: Key Results with SD count
CREATE OR REPLACE VIEW v_key_results_with_sds AS
SELECT
    kr.*,
    o.code as objective_code,
    o.title as objective_title,
    COUNT(DISTINCT ska.sd_id) as aligned_sd_count,
    COUNT(DISTINCT CASE WHEN sd.status = 'completed' THEN ska.sd_id END) as completed_sd_count,
    COUNT(DISTINCT CASE WHEN sd.status IN ('active', 'in_progress', 'exec_active') THEN ska.sd_id END) as active_sd_count
FROM key_results kr
JOIN objectives o ON kr.objective_id = o.id
LEFT JOIN sd_key_result_alignment ska ON ska.key_result_id = kr.id
LEFT JOIN strategic_directives_v2 sd ON ska.sd_id = sd.id AND sd.is_active = TRUE
WHERE kr.is_active = TRUE
GROUP BY kr.id, o.code, o.title;

-- ============================================================================
-- 7. FUNCTIONS FOR OKR MANAGEMENT
-- ============================================================================

-- Function: Update KR status based on current value
CREATE OR REPLACE FUNCTION update_kr_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate progress
    DECLARE
        progress_pct NUMERIC;
    BEGIN
        IF NEW.direction = 'decrease' THEN
            progress_pct := ((NEW.baseline_value - NEW.current_value) / NULLIF(NEW.baseline_value - NEW.target_value, 0)) * 100;
        ELSE
            progress_pct := ((NEW.current_value - COALESCE(NEW.baseline_value, 0)) / NULLIF(NEW.target_value - COALESCE(NEW.baseline_value, 0), 0)) * 100;
        END IF;

        -- Auto-update status based on progress (can be overridden manually)
        IF progress_pct >= 100 THEN
            NEW.status := 'achieved';
        ELSIF progress_pct >= 70 THEN
            NEW.status := 'on_track';
        ELSIF progress_pct >= 40 THEN
            NEW.status := 'at_risk';
        ELSE
            NEW.status := 'off_track';
        END IF;
    END;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_kr_status'
    ) THEN
        CREATE TRIGGER trigger_update_kr_status
            BEFORE UPDATE OF current_value ON key_results
            FOR EACH ROW
            EXECUTE FUNCTION update_kr_status();
    END IF;
END;
$$;

-- Function: Get unaligned SDs (for enforcement warnings)
CREATE OR REPLACE FUNCTION get_unaligned_sds()
RETURNS TABLE (
    sd_id VARCHAR(50),
    legacy_id VARCHAR(50),
    title VARCHAR(500),
    status VARCHAR(50),
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sd.id,
        sd.legacy_id,
        sd.title,
        sd.status,
        sd.created_at
    FROM strategic_directives_v2 sd
    LEFT JOIN sd_key_result_alignment ska ON sd.id = ska.sd_id
    WHERE sd.is_active = TRUE
      AND sd.status NOT IN ('completed', 'cancelled', 'deferred')
      AND ska.id IS NULL
    ORDER BY sd.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. RLS POLICIES (Chairman can read/write, service_role can write)
-- ============================================================================

ALTER TABLE strategic_vision ENABLE ROW LEVEL SECURITY;
ALTER TABLE objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_key_result_alignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE kr_progress_snapshots ENABLE ROW LEVEL SECURITY;

-- Chairman can do everything
CREATE POLICY "Chairman full access on strategic_vision" ON strategic_vision
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'email' = 'rick@emeraldholdingsgroup.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'rick@emeraldholdingsgroup.com');

CREATE POLICY "Chairman full access on objectives" ON objectives
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'email' = 'rick@emeraldholdingsgroup.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'rick@emeraldholdingsgroup.com');

CREATE POLICY "Chairman full access on key_results" ON key_results
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'email' = 'rick@emeraldholdingsgroup.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'rick@emeraldholdingsgroup.com');

CREATE POLICY "Chairman full access on sd_key_result_alignment" ON sd_key_result_alignment
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'email' = 'rick@emeraldholdingsgroup.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'rick@emeraldholdingsgroup.com');

CREATE POLICY "Chairman full access on kr_progress_snapshots" ON kr_progress_snapshots
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'email' = 'rick@emeraldholdingsgroup.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'rick@emeraldholdingsgroup.com');

-- Service role bypass (for EVA agents)
CREATE POLICY "Service role bypass on strategic_vision" ON strategic_vision
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Service role bypass on objectives" ON objectives
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Service role bypass on key_results" ON key_results
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Service role bypass on sd_key_result_alignment" ON sd_key_result_alignment
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Service role bypass on kr_progress_snapshots" ON kr_progress_snapshots
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

-- ============================================================================
-- 9. GRANTS
-- ============================================================================

GRANT SELECT ON strategic_vision TO authenticated;
GRANT SELECT ON objectives TO authenticated;
GRANT SELECT ON key_results TO authenticated;
GRANT SELECT ON sd_key_result_alignment TO authenticated;
GRANT SELECT ON kr_progress_snapshots TO authenticated;
GRANT SELECT ON v_okr_hierarchy TO authenticated;
GRANT SELECT ON v_sd_okr_context TO authenticated;
GRANT SELECT ON v_okr_scorecard TO authenticated;
GRANT SELECT ON v_key_results_with_sds TO authenticated;

GRANT ALL ON strategic_vision TO service_role;
GRANT ALL ON objectives TO service_role;
GRANT ALL ON key_results TO service_role;
GRANT ALL ON sd_key_result_alignment TO service_role;
GRANT ALL ON kr_progress_snapshots TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Run seed script: node scripts/seed-okrs.js
-- 2. Run AI alignment: node scripts/align-sds-to-krs.js
-- 3. Update sd:next to use v_okr_scorecard and v_sd_okr_context
