-- LEO Protocol Infrastructure Fix
-- Creates missing tables and columns for proper phase tracking and progress calculation
-- Date: 2025-09-23

-- 1. Create sd_phase_tracking table for LEO Protocol workflow
CREATE TABLE IF NOT EXISTS sd_phase_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    phase_name TEXT NOT NULL CHECK (phase_name IN (
        'LEAD_APPROVAL',
        'PLAN_DESIGN',
        'EXEC_IMPLEMENTATION',
        'PLAN_VERIFICATION',
        'LEAD_FINAL_APPROVAL'
    )),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    is_complete BOOLEAN DEFAULT false,
    started_at TIMESTAMPTZ DEFAULT NULL,
    completed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique phase per SD
    UNIQUE(sd_id, phase_name)
);

-- 2. Add progress column to strategic_directives_v2 if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'progress'
    ) THEN
        ALTER TABLE strategic_directives_v2
        ADD COLUMN progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
    END IF;
END $$;

-- 3. Add completion_date column to strategic_directives_v2 if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'completion_date'
    ) THEN
        ALTER TABLE strategic_directives_v2
        ADD COLUMN completion_date TIMESTAMPTZ DEFAULT NULL;
    END IF;
END $$;

-- 4. Add current_phase column to strategic_directives_v2 if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'current_phase'
    ) THEN
        ALTER TABLE strategic_directives_v2
        ADD COLUMN current_phase TEXT DEFAULT 'LEAD_APPROVAL';
    END IF;
END $$;

-- 5. Add phase_progress column to strategic_directives_v2 if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'phase_progress'
    ) THEN
        ALTER TABLE strategic_directives_v2
        ADD COLUMN phase_progress INTEGER DEFAULT 0;
    END IF;
END $$;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sd_phase_tracking_sd_id ON sd_phase_tracking(sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_phase_tracking_phase_name ON sd_phase_tracking(phase_name);
CREATE INDEX IF NOT EXISTS idx_sd_phase_tracking_is_complete ON sd_phase_tracking(is_complete);
CREATE INDEX IF NOT EXISTS idx_strategic_directives_progress ON strategic_directives_v2(progress);
CREATE INDEX IF NOT EXISTS idx_strategic_directives_current_phase ON strategic_directives_v2(current_phase);

-- 7. Create function to calculate SD progress from phases
CREATE OR REPLACE FUNCTION calculate_sd_progress(p_sd_id TEXT)
RETURNS INTEGER AS $$
DECLARE
    phase_count INTEGER;
    completed_phases INTEGER;
    total_progress INTEGER;
    calculated_progress INTEGER;
BEGIN
    -- Count total phases for this SD
    SELECT COUNT(*) INTO phase_count
    FROM sd_phase_tracking
    WHERE sd_id = p_sd_id;

    -- If no phases exist, return 0
    IF phase_count = 0 THEN
        RETURN 0;
    END IF;

    -- Calculate progress from completed phases
    SELECT COUNT(*) INTO completed_phases
    FROM sd_phase_tracking
    WHERE sd_id = p_sd_id AND is_complete = true;

    -- Calculate weighted progress (completed phases + partial progress of current phase)
    SELECT COALESCE(SUM(progress), 0) INTO total_progress
    FROM sd_phase_tracking
    WHERE sd_id = p_sd_id;

    -- Average progress across all phases
    calculated_progress := total_progress / phase_count;

    RETURN GREATEST(0, LEAST(100, calculated_progress));
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger to auto-update SD progress when phases change
CREATE OR REPLACE FUNCTION update_sd_progress_from_phases()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the SD's progress and current phase
    UPDATE strategic_directives_v2
    SET
        progress = calculate_sd_progress(NEW.sd_id),
        current_phase = (
            SELECT phase_name
            FROM sd_phase_tracking
            WHERE sd_id = NEW.sd_id AND is_complete = false
            ORDER BY
                CASE phase_name
                    WHEN 'LEAD_APPROVAL' THEN 1
                    WHEN 'PLAN_DESIGN' THEN 2
                    WHEN 'EXEC_IMPLEMENTATION' THEN 3
                    WHEN 'PLAN_VERIFICATION' THEN 4
                    WHEN 'LEAD_FINAL_APPROVAL' THEN 5
                END
            LIMIT 1
        ),
        updated_at = NOW()
    WHERE id = NEW.sd_id;

    -- Mark as completed if all phases are complete
    UPDATE strategic_directives_v2
    SET
        status = 'completed',
        completion_date = NOW()
    WHERE id = NEW.sd_id
    AND NOT EXISTS (
        SELECT 1 FROM sd_phase_tracking
        WHERE sd_id = NEW.sd_id AND is_complete = false
    )
    AND status != 'completed';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create the trigger
DROP TRIGGER IF EXISTS trigger_update_sd_progress ON sd_phase_tracking;
CREATE TRIGGER trigger_update_sd_progress
    AFTER INSERT OR UPDATE ON sd_phase_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_sd_progress_from_phases();

-- 10. Create view for SD dashboard with proper phase tracking
CREATE OR REPLACE VIEW v_sd_dashboard AS
SELECT
    sd.*,
    pt.phase_counts,
    pt.completed_phases,
    pt.current_phase_detail
FROM strategic_directives_v2 sd
LEFT JOIN (
    SELECT
        sd_id,
        COUNT(*) as phase_counts,
        COUNT(*) FILTER (WHERE is_complete = true) as completed_phases,
        json_agg(
            json_build_object(
                'phase_name', phase_name,
                'progress', progress,
                'is_complete', is_complete,
                'started_at', started_at,
                'completed_at', completed_at
            ) ORDER BY
            CASE phase_name
                WHEN 'LEAD_APPROVAL' THEN 1
                WHEN 'PLAN_DESIGN' THEN 2
                WHEN 'EXEC_IMPLEMENTATION' THEN 3
                WHEN 'PLAN_VERIFICATION' THEN 4
                WHEN 'LEAD_FINAL_APPROVAL' THEN 5
            END
        ) as current_phase_detail
    FROM sd_phase_tracking
    GROUP BY sd_id
) pt ON sd.id = pt.sd_id;

-- 11. Add RLS policies for sd_phase_tracking (if RLS is enabled)
ALTER TABLE sd_phase_tracking ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read phase tracking
CREATE POLICY IF NOT EXISTS "sd_phase_tracking_select" ON sd_phase_tracking
    FOR SELECT TO authenticated
    USING (true);

-- Allow service role to manage phase tracking
CREATE POLICY IF NOT EXISTS "sd_phase_tracking_all" ON sd_phase_tracking
    FOR ALL TO service_role
    USING (true);

COMMENT ON TABLE sd_phase_tracking IS 'Tracks LEO Protocol phase completion for strategic directives';
COMMENT ON FUNCTION calculate_sd_progress IS 'Calculates overall SD progress from phase tracking data';
COMMENT ON VIEW v_sd_dashboard IS 'Dashboard view with aggregated phase tracking information';