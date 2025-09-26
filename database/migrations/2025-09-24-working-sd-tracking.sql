-- Working SD Tracking
-- Tracks which Strategic Directive is currently being worked on
-- Date: 2025-09-24

-- ============================================================================
-- WORKING SD TRACKING
-- ============================================================================

-- 1. Add working_on field to strategic_directives_v2
-- This marks which SD is currently being actively worked on
ALTER TABLE strategic_directives_v2 
ADD COLUMN IF NOT EXISTS is_working_on BOOLEAN DEFAULT FALSE;

-- Add index for quick lookup
CREATE INDEX IF NOT EXISTS idx_sd_working_on 
ON strategic_directives_v2(is_working_on) 
WHERE is_working_on = TRUE;

-- 2. Create a working session tracking table
-- This tracks the history of which SDs were worked on and when
CREATE TABLE IF NOT EXISTS working_sd_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT REFERENCES strategic_directives_v2(id),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    agent_type TEXT CHECK (agent_type IN ('LEAD', 'PLAN', 'EXEC')),
    user_id TEXT,
    session_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Function to set the working SD (ensures only one at a time)
CREATE OR REPLACE FUNCTION set_working_sd(p_sd_id TEXT)
RETURNS JSONB AS $$
DECLARE
    v_previous_sd TEXT;
    v_result JSONB;
BEGIN
    -- Find currently working SD
    SELECT id INTO v_previous_sd
    FROM strategic_directives_v2
    WHERE is_working_on = TRUE
    LIMIT 1;
    
    -- Clear all working flags
    UPDATE strategic_directives_v2
    SET is_working_on = FALSE,
        updated_at = NOW()
    WHERE is_working_on = TRUE;
    
    -- Set new working SD
    IF p_sd_id IS NOT NULL THEN
        UPDATE strategic_directives_v2
        SET is_working_on = TRUE,
            updated_at = NOW()
        WHERE id = p_sd_id;
        
        -- End previous session if exists
        IF v_previous_sd IS NOT NULL THEN
            UPDATE working_sd_sessions
            SET ended_at = NOW()
            WHERE sd_id = v_previous_sd
            AND ended_at IS NULL;
        END IF;
        
        -- Start new session
        INSERT INTO working_sd_sessions (sd_id)
        VALUES (p_sd_id);
    END IF;
    
    -- Return result
    SELECT jsonb_build_object(
        'success', true,
        'previous_sd', v_previous_sd,
        'current_sd', p_sd_id,
        'timestamp', NOW()
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to get the current working SD
CREATE OR REPLACE FUNCTION get_working_sd()
RETURNS TABLE (
    id TEXT,
    title TEXT,
    status TEXT,
    priority TEXT,
    started_at TIMESTAMPTZ,
    session_duration INTERVAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sd.id,
        sd.title,
        sd.status,
        sd.priority,
        ws.started_at,
        NOW() - ws.started_at as session_duration
    FROM strategic_directives_v2 sd
    LEFT JOIN working_sd_sessions ws ON sd.id = ws.sd_id
    WHERE sd.is_working_on = TRUE
    AND ws.ended_at IS NULL
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 5. View for working SD with full context
CREATE OR REPLACE VIEW v_current_working_sd AS
SELECT 
    sd.id,
    sd.title,
    sd.description,
    sd.status,
    sd.priority,
    sd.target_application,
    ws.started_at as work_started_at,
    NOW() - ws.started_at as current_session_duration,
    (
        SELECT COUNT(*) 
        FROM prds 
        WHERE sd_id = sd.id
    ) as prd_count,
    (
        SELECT COUNT(*) 
        FROM sd_backlog_map 
        WHERE sd_id = sd.id
    ) as backlog_count,
    ARRAY['LEAD', 'PLAN', 'EXEC'] as involved_agents -- Placeholder for agent involvement
FROM strategic_directives_v2 sd
LEFT JOIN working_sd_sessions ws 
    ON sd.id = ws.sd_id 
    AND ws.ended_at IS NULL
WHERE sd.is_working_on = TRUE;

-- 6. Trigger to broadcast working SD changes
CREATE OR REPLACE FUNCTION notify_working_sd_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_working_on = TRUE THEN
        PERFORM pg_notify(
            'working_sd_changed',
            json_build_object(
                'sd_id', NEW.id,
                'title', NEW.title,
                'action', 'started'
            )::text
        );
    ELSIF OLD.is_working_on = TRUE AND NEW.is_working_on = FALSE THEN
        PERFORM pg_notify(
            'working_sd_changed',
            json_build_object(
                'sd_id', OLD.id,
                'title', OLD.title,
                'action', 'stopped'
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_notify_working_sd
AFTER UPDATE OF is_working_on ON strategic_directives_v2
FOR EACH ROW
WHEN (OLD.is_working_on IS DISTINCT FROM NEW.is_working_on)
EXECUTE FUNCTION notify_working_sd_change();

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_working_sessions_sd ON working_sd_sessions(sd_id);
CREATE INDEX IF NOT EXISTS idx_working_sessions_active 
ON working_sd_sessions(sd_id, started_at) 
WHERE ended_at IS NULL;

-- ============================================================================
-- INITIAL SETUP
-- ============================================================================

-- Clear any existing working flags (start fresh)
UPDATE strategic_directives_v2 SET is_working_on = FALSE WHERE is_working_on = TRUE;

-- Grant necessary permissions (adjust as needed)
GRANT EXECUTE ON FUNCTION set_working_sd(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_working_sd() TO authenticated;
GRANT SELECT ON v_current_working_sd TO authenticated;
GRANT SELECT, INSERT, UPDATE ON working_sd_sessions TO authenticated;