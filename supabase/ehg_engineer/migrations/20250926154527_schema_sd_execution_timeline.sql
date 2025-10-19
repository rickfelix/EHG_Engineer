-- Strategic Directive Execution Timeline Tracking
-- Tracks phase transitions and time spent in each phase

CREATE TABLE IF NOT EXISTS sd_execution_timeline (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sd_id VARCHAR(255) NOT NULL REFERENCES strategic_directives_v2(id),
    phase VARCHAR(50) NOT NULL,
    phase_started_at TIMESTAMP NOT NULL,
    phase_completed_at TIMESTAMP,
    duration_hours DECIMAL(10, 2),
    duration_minutes INTEGER,
    agent_responsible VARCHAR(50),
    completion_status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed, skipped, failed
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX idx_sd_timeline_sd_id ON sd_execution_timeline(sd_id);
CREATE INDEX idx_sd_timeline_phase ON sd_execution_timeline(phase);
CREATE INDEX idx_sd_timeline_started ON sd_execution_timeline(phase_started_at);

-- View for active phase tracking
CREATE OR REPLACE VIEW sd_active_phases AS
SELECT
    sd_id,
    phase,
    phase_started_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - phase_started_at))/3600 AS hours_in_phase,
    agent_responsible
FROM sd_execution_timeline
WHERE phase_completed_at IS NULL
AND completion_status = 'in_progress';

-- View for phase duration analysis
CREATE OR REPLACE VIEW sd_phase_duration_analysis AS
SELECT
    sd_id,
    phase,
    phase_started_at,
    phase_completed_at,
    duration_hours,
    duration_minutes,
    CASE
        WHEN duration_hours < 1 THEN 'Very Fast (<1hr)'
        WHEN duration_hours <= 4 THEN 'Fast (1-4hrs)'
        WHEN duration_hours <= 24 THEN 'Normal (4-24hrs)'
        WHEN duration_hours <= 72 THEN 'Slow (1-3 days)'
        ELSE 'Very Slow (>3 days)'
    END AS speed_category
FROM sd_execution_timeline
WHERE phase_completed_at IS NOT NULL;

-- View for overall SD completion metrics
CREATE OR REPLACE VIEW sd_completion_metrics AS
SELECT
    s.id AS sd_id,
    s.title,
    s.priority,
    s.current_phase,
    MIN(t.phase_started_at) AS work_started_at,
    MAX(t.phase_completed_at) AS last_phase_completed_at,
    COUNT(DISTINCT t.phase) AS phases_completed,
    SUM(t.duration_hours) AS total_hours_spent,
    SUM(t.duration_minutes) AS total_minutes_spent,
    CASE
        WHEN s.status = 'completed' THEN
            EXTRACT(EPOCH FROM (MAX(t.phase_completed_at) - MIN(t.phase_started_at)))/3600
        ELSE
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(t.phase_started_at)))/3600
    END AS total_elapsed_hours
FROM strategic_directives_v2 s
LEFT JOIN sd_execution_timeline t ON s.id = t.sd_id
GROUP BY s.id, s.title, s.priority, s.current_phase, s.status;

-- Function to record phase transition
CREATE OR REPLACE FUNCTION record_phase_transition(
    p_sd_id VARCHAR,
    p_phase VARCHAR,
    p_agent VARCHAR DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_timeline_id UUID;
BEGIN
    -- Complete previous phase if exists
    UPDATE sd_execution_timeline
    SET
        phase_completed_at = CURRENT_TIMESTAMP,
        duration_hours = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - phase_started_at))/3600,
        duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - phase_started_at))/60,
        completion_status = 'completed',
        updated_at = CURRENT_TIMESTAMP
    WHERE sd_id = p_sd_id
    AND phase_completed_at IS NULL
    AND completion_status = 'in_progress';

    -- Insert new phase
    INSERT INTO sd_execution_timeline (
        sd_id,
        phase,
        phase_started_at,
        agent_responsible
    ) VALUES (
        p_sd_id,
        p_phase,
        CURRENT_TIMESTAMP,
        p_agent
    ) RETURNING id INTO v_timeline_id;

    RETURN v_timeline_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_timeline_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sd_timeline_updated_at
    BEFORE UPDATE ON sd_execution_timeline
    FOR EACH ROW
    EXECUTE FUNCTION update_timeline_updated_at();