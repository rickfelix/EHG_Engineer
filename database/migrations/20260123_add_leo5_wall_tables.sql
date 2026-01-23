-- LEO 5.0 Wall Management Tables
-- Supports impenetrable phase boundaries via blockedBy constraints
-- Part of SD-LEO-INFRA-LEO-TASK-SYSTEM-001 Phase 2

-- Wall states table: tracks wall status for each SD
CREATE TABLE IF NOT EXISTS sd_wall_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id) ON DELETE CASCADE,
    wall_name TEXT NOT NULL,
    phase TEXT NOT NULL,
    track TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'blocked', 'ready', 'passed', 'invalidated')),
    blocked_by TEXT[] DEFAULT '{}',
    passed_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    invalidated_reason TEXT,
    validation_score INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sd_id, wall_name)
);

-- Gate results table: tracks individual gate outcomes
CREATE TABLE IF NOT EXISTS sd_gate_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id) ON DELETE CASCADE,
    gate_id TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL', 'SKIP', 'PENDING')),
    score INTEGER,
    max_score INTEGER,
    issues JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    retry_count INTEGER DEFAULT 0,
    UNIQUE(sd_id, gate_id)
);

-- Kickback tracking table: tracks phase kickbacks for failure recovery
CREATE TABLE IF NOT EXISTS sd_kickbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id) ON DELETE CASCADE,
    from_phase TEXT NOT NULL,
    to_phase TEXT NOT NULL,
    wall_name TEXT NOT NULL,
    failure_reason TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    resolution_status TEXT DEFAULT 'pending' CHECK (resolution_status IN ('pending', 'in_progress', 'resolved', 'escalated')),
    resolved_at TIMESTAMPTZ,
    escalated_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wall_states_sd_id ON sd_wall_states(sd_id);
CREATE INDEX IF NOT EXISTS idx_wall_states_status ON sd_wall_states(status);
CREATE INDEX IF NOT EXISTS idx_gate_results_sd_id ON sd_gate_results(sd_id);
CREATE INDEX IF NOT EXISTS idx_gate_results_result ON sd_gate_results(result);
CREATE INDEX IF NOT EXISTS idx_kickbacks_sd_id ON sd_kickbacks(sd_id);
CREATE INDEX IF NOT EXISTS idx_kickbacks_status ON sd_kickbacks(resolution_status);

-- RLS policies
ALTER TABLE sd_wall_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_kickbacks ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY IF NOT EXISTS "Service role full access to sd_wall_states"
    ON sd_wall_states FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role full access to sd_gate_results"
    ON sd_gate_results FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role full access to sd_kickbacks"
    ON sd_kickbacks FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Trigger for updated_at on wall_states
CREATE OR REPLACE FUNCTION update_wall_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_wall_states_updated_at ON sd_wall_states;
CREATE TRIGGER trigger_update_wall_states_updated_at
    BEFORE UPDATE ON sd_wall_states
    FOR EACH ROW
    EXECUTE FUNCTION update_wall_states_updated_at();

-- View for wall status overview
CREATE OR REPLACE VIEW v_sd_wall_overview AS
SELECT
    ws.sd_id,
    sd.id AS sd_key,
    sd.title AS sd_title,
    ws.track,
    ws.wall_name,
    ws.phase,
    ws.status,
    ws.blocked_by,
    COALESCE(
        (SELECT COUNT(*) FROM sd_gate_results gr
         WHERE gr.sd_id = ws.sd_id
         AND gr.gate_id = ANY(ws.blocked_by)
         AND gr.result = 'PASS'),
        0
    ) AS gates_passed,
    array_length(ws.blocked_by, 1) AS total_gates,
    ws.passed_at,
    ws.invalidated_at,
    ws.created_at
FROM sd_wall_states ws
JOIN strategic_directives_v2 sd ON sd.uuid_id = ws.sd_id
ORDER BY ws.created_at DESC;

COMMENT ON TABLE sd_wall_states IS 'LEO 5.0 Wall states - tracks phase boundary status for Strategic Directives';
COMMENT ON TABLE sd_gate_results IS 'LEO 5.0 Gate results - tracks individual gate validation outcomes';
COMMENT ON TABLE sd_kickbacks IS 'LEO 5.0 Kickback tracking - manages phase kickbacks for failure recovery';
COMMENT ON VIEW v_sd_wall_overview IS 'LEO 5.0 Wall overview - aggregated view of SD wall status with gate progress';
