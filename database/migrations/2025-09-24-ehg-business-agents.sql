-- EHG Business Agents Schema
-- For SD-001: CrewAI-Style Agents Dashboard
-- Target Database: liapbndqlqxdcgpwntbv (EHG Business Application)

-- Business Agent Definitions
CREATE TABLE IF NOT EXISTS business_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('report_generator', 'data_processor', 'workflow_automator', 'customer_support', 'document_processor', 'notification', 'analytics', 'other')),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'working', 'blocked', 'error', 'offline')),
    configuration JSONB DEFAULT '{}',
    capabilities JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Task Queue
CREATE TABLE IF NOT EXISTS agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES business_agents(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
    task_data JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    result JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Performance Metrics
CREATE TABLE IF NOT EXISTS agent_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES business_agents(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    metric_value NUMERIC,
    metric_data JSONB,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Execution Logs
CREATE TABLE IF NOT EXISTS agent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES business_agents(id) ON DELETE CASCADE,
    task_id UUID REFERENCES agent_tasks(id) ON DELETE CASCADE,
    log_level TEXT NOT NULL CHECK (log_level IN ('debug', 'info', 'warning', 'error', 'critical')),
    message TEXT NOT NULL,
    context JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Control Commands
CREATE TABLE IF NOT EXISTS agent_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES business_agents(id) ON DELETE CASCADE,
    command TEXT NOT NULL CHECK (command IN ('start', 'stop', 'restart', 'configure', 'reset')),
    parameters JSONB,
    executed_by TEXT,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    result TEXT,
    success BOOLEAN DEFAULT FALSE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_business_agents_status ON business_agents(status);
CREATE INDEX IF NOT EXISTS idx_business_agents_type ON business_agents(type);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_id ON agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_priority ON agent_tasks(priority DESC);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_id ON agent_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_period ON agent_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_id ON agent_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_task_id ON agent_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_level ON agent_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_agent_controls_agent_id ON agent_controls(agent_id);

-- Real-time update triggers
CREATE OR REPLACE FUNCTION update_agent_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_business_agents_timestamp
    BEFORE UPDATE ON business_agents
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_timestamp();

CREATE TRIGGER update_agent_tasks_timestamp
    BEFORE UPDATE ON agent_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_timestamp();

-- Function to get agent statistics
CREATE OR REPLACE FUNCTION get_agent_stats(p_agent_id UUID)
RETURNS TABLE (
    total_tasks INTEGER,
    completed_tasks INTEGER,
    failed_tasks INTEGER,
    success_rate NUMERIC,
    avg_completion_time INTERVAL,
    current_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_tasks,
        COUNT(*) FILTER (WHERE status = 'completed')::INTEGER as completed_tasks,
        COUNT(*) FILTER (WHERE status = 'failed')::INTEGER as failed_tasks,
        CASE
            WHEN COUNT(*) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*) * 100, 2)
            ELSE 0
        END as success_rate,
        AVG(completed_at - started_at) FILTER (WHERE completed_at IS NOT NULL) as avg_completion_time,
        (SELECT status FROM business_agents WHERE id = p_agent_id) as current_status
    FROM agent_tasks
    WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Insert sample business agents for testing
INSERT INTO business_agents (name, type, description, status) VALUES
    ('Report Generator Alpha', 'report_generator', 'Generates daily business reports', 'idle'),
    ('Data Processor Beta', 'data_processor', 'Processes incoming data streams', 'idle'),
    ('Workflow Automator Gamma', 'workflow_automator', 'Automates business workflows', 'idle'),
    ('Customer Support Delta', 'customer_support', 'Handles customer inquiries', 'idle'),
    ('Document Processor Epsilon', 'document_processor', 'Processes and extracts document data', 'idle')
ON CONFLICT DO NOTHING;