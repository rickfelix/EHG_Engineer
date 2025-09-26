-- Sub-Agent Activation Tracking Schema
-- Prevents repetition of SD-001 sub-agent activation failures

-- Track sub-agent activation for each SD
CREATE TABLE IF NOT EXISTS subagent_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    activating_agent TEXT NOT NULL CHECK (activating_agent IN ('LEAD', 'PLAN', 'EXEC')),
    phase TEXT NOT NULL CHECK (phase IN ('planning', 'implementation', 'verification')),
    subagent_code TEXT NOT NULL,
    subagent_name TEXT NOT NULL,
    activation_trigger TEXT NOT NULL, -- What triggered this activation
    activation_context JSONB DEFAULT '{}', -- Additional context
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'activated', 'completed', 'failed', 'skipped')),
    execution_notes TEXT,
    execution_results JSONB,
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track mandatory sub-agent requirements by SD phase
CREATE TABLE IF NOT EXISTS subagent_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    phase TEXT NOT NULL CHECK (phase IN ('planning', 'implementation', 'verification')),
    required_subagents TEXT[] NOT NULL DEFAULT '{}', -- Array of required sub-agent codes
    optional_subagents TEXT[] DEFAULT '{}', -- Array of optional sub-agent codes
    requirements_met BOOLEAN DEFAULT FALSE,
    checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sd_id, phase)
);

-- Pre-populate requirements based on SD characteristics
-- This table acts as a checklist for each SD phase
INSERT INTO subagent_requirements (sd_id, phase, required_subagents, optional_subagents)
SELECT
    id as sd_id,
    'planning' as phase,
    CASE
        WHEN target_application = 'EHG' THEN
            ARRAY['VALIDATION', 'DATABASE', 'DESIGN', 'SECURITY'] -- Business app SDs
        ELSE
            ARRAY['VALIDATION', 'DATABASE', 'SECURITY'] -- Engineering platform SDs
    END as required_subagents,
    ARRAY['TESTING', 'PERFORMANCE'] as optional_subagents
FROM strategic_directives_v2
WHERE id NOT IN (SELECT sd_id FROM subagent_requirements WHERE phase = 'planning')
ON CONFLICT (sd_id, phase) DO NOTHING;

INSERT INTO subagent_requirements (sd_id, phase, required_subagents, optional_subagents)
SELECT
    id as sd_id,
    'implementation' as phase,
    CASE
        WHEN target_application = 'EHG' THEN
            ARRAY['DATABASE', 'TESTING', 'SECURITY', 'DESIGN'] -- Business app implementations
        ELSE
            ARRAY['DATABASE', 'TESTING', 'SECURITY'] -- Engineering implementations
    END as required_subagents,
    ARRAY['PERFORMANCE', 'VALIDATION'] as optional_subagents
FROM strategic_directives_v2
WHERE id NOT IN (SELECT sd_id FROM subagent_requirements WHERE phase = 'implementation')
ON CONFLICT (sd_id, phase) DO NOTHING;

INSERT INTO subagent_requirements (sd_id, phase, required_subagents, optional_subagents)
SELECT
    id as sd_id,
    'verification' as phase,
    ARRAY['TESTING', 'VALIDATION'] as required_subagents, -- Always required for verification
    ARRAY['PERFORMANCE', 'SECURITY'] as optional_subagents
FROM strategic_directives_v2
WHERE id NOT IN (SELECT sd_id FROM subagent_requirements WHERE phase = 'verification')
ON CONFLICT (sd_id, phase) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subagent_activations_sd_id ON subagent_activations(sd_id);
CREATE INDEX IF NOT EXISTS idx_subagent_activations_agent_phase ON subagent_activations(activating_agent, phase);
CREATE INDEX IF NOT EXISTS idx_subagent_activations_status ON subagent_activations(status);
CREATE INDEX IF NOT EXISTS idx_subagent_activations_subagent ON subagent_activations(subagent_code);
CREATE INDEX IF NOT EXISTS idx_subagent_requirements_sd_phase ON subagent_requirements(sd_id, phase);

-- Function to check if all required sub-agents have been activated for a phase
CREATE OR REPLACE FUNCTION check_subagent_requirements(p_sd_id TEXT, p_phase TEXT)
RETURNS TABLE (
    requirements_met BOOLEAN,
    missing_subagents TEXT[],
    activated_subagents TEXT[],
    total_required INTEGER,
    total_activated INTEGER
) AS $$
DECLARE
    required_agents TEXT[];
    activated_agents TEXT[];
    missing_agents TEXT[];
BEGIN
    -- Get required sub-agents for this SD and phase
    SELECT required_subagents INTO required_agents
    FROM subagent_requirements
    WHERE sd_id = p_sd_id AND phase = p_phase;

    IF required_agents IS NULL THEN
        required_agents := '{}';
    END IF;

    -- Get activated sub-agents for this SD and phase
    SELECT ARRAY_AGG(DISTINCT subagent_code) INTO activated_agents
    FROM subagent_activations
    WHERE sd_id = p_sd_id
    AND phase = p_phase
    AND status IN ('activated', 'completed');

    IF activated_agents IS NULL THEN
        activated_agents := '{}';
    END IF;

    -- Find missing sub-agents
    SELECT ARRAY_AGG(agent) INTO missing_agents
    FROM UNNEST(required_agents) AS agent
    WHERE agent != ALL(activated_agents);

    IF missing_agents IS NULL THEN
        missing_agents := '{}';
    END IF;

    -- Return results
    RETURN QUERY SELECT
        (ARRAY_LENGTH(missing_agents, 1) IS NULL OR ARRAY_LENGTH(missing_agents, 1) = 0) as requirements_met,
        missing_agents,
        activated_agents,
        COALESCE(ARRAY_LENGTH(required_agents, 1), 0) as total_required,
        COALESCE(ARRAY_LENGTH(activated_agents, 1), 0) as total_activated;
END;
$$ LANGUAGE plpgsql;

-- Function to record sub-agent activation
CREATE OR REPLACE FUNCTION record_subagent_activation(
    p_sd_id TEXT,
    p_activating_agent TEXT,
    p_phase TEXT,
    p_subagent_code TEXT,
    p_subagent_name TEXT,
    p_activation_trigger TEXT,
    p_activation_context JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    activation_id UUID;
BEGIN
    INSERT INTO subagent_activations (
        sd_id, activating_agent, phase, subagent_code, subagent_name,
        activation_trigger, activation_context, status
    ) VALUES (
        p_sd_id, p_activating_agent, p_phase, p_subagent_code, p_subagent_name,
        p_activation_trigger, p_activation_context, 'activated'
    ) RETURNING id INTO activation_id;

    -- Update requirements check
    UPDATE subagent_requirements
    SET
        requirements_met = (
            SELECT (check_subagent_requirements(p_sd_id, p_phase)).requirements_met
        ),
        checked_at = NOW(),
        updated_at = NOW()
    WHERE sd_id = p_sd_id AND phase = p_phase;

    RETURN activation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get activation summary for an SD
CREATE OR REPLACE FUNCTION get_sd_activation_summary(p_sd_id TEXT)
RETURNS TABLE (
    phase TEXT,
    total_required INTEGER,
    total_activated INTEGER,
    requirements_met BOOLEAN,
    missing_subagents TEXT[],
    completion_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.phase,
        COALESCE(ARRAY_LENGTH(r.required_subagents, 1), 0) as total_required,
        COALESCE(
            (SELECT COUNT(DISTINCT subagent_code)::INTEGER
             FROM subagent_activations
             WHERE sd_id = p_sd_id
             AND phase = r.phase
             AND status IN ('activated', 'completed')),
            0
        ) as total_activated,
        r.requirements_met,
        COALESCE(
            (SELECT (check_subagent_requirements(p_sd_id, r.phase)).missing_subagents),
            '{}'::TEXT[]
        ) as missing_subagents,
        CASE
            WHEN COALESCE(ARRAY_LENGTH(r.required_subagents, 1), 0) = 0 THEN 100.0
            ELSE ROUND(
                COALESCE(
                    (SELECT COUNT(DISTINCT subagent_code)::NUMERIC
                     FROM subagent_activations
                     WHERE sd_id = p_sd_id
                     AND phase = r.phase
                     AND status IN ('activated', 'completed')),
                    0
                ) * 100.0 / ARRAY_LENGTH(r.required_subagents, 1), 2
            )
        END as completion_percentage
    FROM subagent_requirements r
    WHERE r.sd_id = p_sd_id
    ORDER BY
        CASE r.phase
            WHEN 'planning' THEN 1
            WHEN 'implementation' THEN 2
            WHEN 'verification' THEN 3
        END;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update requirements when activations change
CREATE OR REPLACE FUNCTION update_subagent_requirements_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE subagent_requirements
    SET
        requirements_met = (
            SELECT (check_subagent_requirements(NEW.sd_id, NEW.phase)).requirements_met
        ),
        checked_at = NOW(),
        updated_at = NOW()
    WHERE sd_id = NEW.sd_id AND phase = NEW.phase;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_subagent_requirements
    AFTER INSERT OR UPDATE ON subagent_activations
    FOR EACH ROW
    EXECUTE FUNCTION update_subagent_requirements_trigger();

-- Record SD-001 retrospective finding as an activation tracking event
INSERT INTO subagent_activations (
    sd_id, activating_agent, phase, subagent_code, subagent_name,
    activation_trigger, activation_context, status, execution_notes
) VALUES
    ('SD-001', 'PLAN', 'planning', 'VALIDATION', 'Validation Sub-Agent',
     'retrospective_analysis', '{"failure_type": "not_activated"}', 'failed',
     'PLAN agent failed to activate VALIDATION sub-agent during PRD creation'),
    ('SD-001', 'PLAN', 'planning', 'DATABASE', 'Database Sub-Agent',
     'retrospective_analysis', '{"failure_type": "not_activated"}', 'failed',
     'PLAN agent failed to activate DATABASE sub-agent during PRD creation'),
    ('SD-001', 'PLAN', 'planning', 'SECURITY', 'Security Sub-Agent',
     'retrospective_analysis', '{"failure_type": "not_activated"}', 'failed',
     'PLAN agent failed to activate SECURITY sub-agent during PRD creation'),
    ('SD-001', 'PLAN', 'planning', 'DESIGN', 'Design Sub-Agent',
     'retrospective_analysis', '{"failure_type": "not_activated"}', 'failed',
     'PLAN agent failed to activate DESIGN sub-agent during PRD creation'),
    ('SD-001', 'EXEC', 'implementation', 'DATABASE', 'Database Sub-Agent',
     'user_prompt', '{"eventually_activated": true}', 'completed',
     'Eventually activated after user prompted about database sub-agent usage'),
    ('SD-001', 'EXEC', 'implementation', 'TESTING', 'Testing Sub-Agent',
     'user_prompt', '{"eventually_activated": true}', 'completed',
     'Eventually activated after user requested familiarity with sub-agents'),
    ('SD-001', 'EXEC', 'implementation', 'PERFORMANCE', 'Performance Sub-Agent',
     'user_prompt', '{"eventually_activated": true}', 'completed',
     'Eventually activated after user requested familiarity with sub-agents'),
    ('SD-001', 'EXEC', 'implementation', 'DESIGN', 'Design Sub-Agent',
     'user_prompt', '{"eventually_activated": true}', 'completed',
     'Eventually activated after user requested familiarity with sub-agents');

-- View to easily see activation compliance
CREATE OR REPLACE VIEW v_subagent_compliance AS
SELECT
    sd.id as sd_id,
    sd.title as sd_title,
    sd.target_application,
    sd.status as sd_status,
    r.phase,
    r.required_subagents,
    r.requirements_met,
    r.checked_at,
    COALESCE(
        (SELECT COUNT(DISTINCT subagent_code)
         FROM subagent_activations a
         WHERE a.sd_id = sd.id
         AND a.phase = r.phase
         AND a.status IN ('activated', 'completed')),
        0
    ) as activated_count,
    COALESCE(ARRAY_LENGTH(r.required_subagents, 1), 0) as required_count,
    CASE
        WHEN COALESCE(ARRAY_LENGTH(r.required_subagents, 1), 0) = 0 THEN 100.0
        ELSE ROUND(
            COALESCE(
                (SELECT COUNT(DISTINCT subagent_code)::NUMERIC
                 FROM subagent_activations a
                 WHERE a.sd_id = sd.id
                 AND a.phase = r.phase
                 AND a.status IN ('activated', 'completed')),
                0
            ) * 100.0 / ARRAY_LENGTH(r.required_subagents, 1), 1
        )
    END as compliance_percentage
FROM strategic_directives_v2 sd
LEFT JOIN subagent_requirements r ON sd.id = r.sd_id
ORDER BY sd.id,
    CASE r.phase
        WHEN 'planning' THEN 1
        WHEN 'implementation' THEN 2
        WHEN 'verification' THEN 3
    END;