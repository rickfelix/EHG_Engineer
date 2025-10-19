-- Vision QA Testing Schema
-- For storing test sessions, results, and bug reports

-- Vision QA test sessions
CREATE TABLE IF NOT EXISTS vision_qa_sessions (
    id VARCHAR(100) PRIMARY KEY,
    application_id VARCHAR(50) REFERENCES managed_applications(id),
    test_goal TEXT NOT NULL,
    status VARCHAR(20) CHECK (status IN ('running', 'passed', 'failed', 'error', 'cancelled')),
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Test metrics
    iterations INTEGER DEFAULT 0,
    total_cost DECIMAL(10, 4) DEFAULT 0,
    goal_achieved BOOLEAN DEFAULT FALSE,
    bugs_found INTEGER DEFAULT 0,
    
    -- Configuration
    config JSONB,
    
    -- Results
    report TEXT, -- Full markdown/html report
    summary JSONB, -- Structured summary data
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vision QA bug reports
CREATE TABLE IF NOT EXISTS vision_qa_bugs (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES vision_qa_sessions(id) ON DELETE CASCADE,
    
    -- Bug details
    bug_type VARCHAR(50),
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT,
    
    -- Context
    page_url TEXT,
    iteration INTEGER,
    screenshot_path TEXT,
    
    -- Detection info
    detected_by VARCHAR(50), -- 'ai_vision', 'console_error', 'network_error', etc.
    confidence DECIMAL(3, 2), -- 0.00 to 1.00
    
    -- Status
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'fixed', 'wontfix', 'duplicate')),
    
    -- Timestamps
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Vision QA test actions
CREATE TABLE IF NOT EXISTS vision_qa_actions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES vision_qa_sessions(id) ON DELETE CASCADE,
    
    -- Action details
    iteration INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'click', 'type', 'scroll', 'navigate', etc.
    selector TEXT,
    value TEXT,
    description TEXT,
    
    -- Execution details
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    duration_ms INTEGER,
    
    -- AI decision context
    confidence DECIMAL(3, 2),
    reasoning TEXT,
    
    -- Timestamps
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vision QA observations
CREATE TABLE IF NOT EXISTS vision_qa_observations (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES vision_qa_sessions(id) ON DELETE CASCADE,
    
    -- Observation details
    iteration INTEGER NOT NULL,
    page_url TEXT,
    page_title TEXT,
    screenshot_path TEXT,
    
    -- AI analysis
    page_description TEXT,
    detected_elements JSONB,
    accessibility_snapshot JSONB,
    
    -- Cost tracking
    api_provider VARCHAR(50),
    api_cost DECIMAL(10, 6),
    
    -- Timestamps
    observed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vision QA consensus runs (for reliability testing)
CREATE TABLE IF NOT EXISTS vision_qa_consensus (
    id SERIAL PRIMARY KEY,
    application_id VARCHAR(50) REFERENCES managed_applications(id),
    test_goal TEXT NOT NULL,
    
    -- Consensus details
    total_runs INTEGER NOT NULL,
    agreed_runs INTEGER NOT NULL,
    agreement_rate DECIMAL(3, 2), -- 0.00 to 1.00
    is_reliable BOOLEAN,
    
    -- Aggregated results
    consensus_result JSONB,
    individual_runs JSONB, -- Array of run summaries
    
    -- Common findings
    common_bugs JSONB,
    average_iterations DECIMAL(10, 2),
    average_cost DECIMAL(10, 4),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vision QA test templates (reusable test scenarios)
CREATE TABLE IF NOT EXISTS vision_qa_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    
    -- Template configuration
    test_goal TEXT NOT NULL,
    starting_url TEXT,
    expected_outcome TEXT,
    
    -- Settings
    max_iterations INTEGER DEFAULT 50,
    cost_limit DECIMAL(10, 2) DEFAULT 5.00,
    confidence_threshold DECIMAL(3, 2) DEFAULT 0.85,
    consensus_runs INTEGER DEFAULT 3,
    
    -- Optional selectors/hints
    key_selectors JSONB, -- Known important selectors
    expected_elements JSONB, -- Elements that should be present
    
    -- Usage tracking
    times_used INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    success_rate DECIMAL(3, 2), -- Historical success rate
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_vision_qa_sessions_app ON vision_qa_sessions(application_id);
CREATE INDEX idx_vision_qa_sessions_status ON vision_qa_sessions(status);
CREATE INDEX idx_vision_qa_bugs_session ON vision_qa_bugs(session_id);
CREATE INDEX idx_vision_qa_bugs_severity ON vision_qa_bugs(severity);
CREATE INDEX idx_vision_qa_actions_session ON vision_qa_actions(session_id);
CREATE INDEX idx_vision_qa_observations_session ON vision_qa_observations(session_id);
CREATE INDEX idx_vision_qa_consensus_app ON vision_qa_consensus(application_id);

-- View for test session summaries
CREATE OR REPLACE VIEW vision_qa_session_summaries AS
SELECT 
    vqs.id,
    vqs.application_id,
    ma.name as app_name,
    vqs.test_goal,
    vqs.status,
    vqs.iterations,
    vqs.total_cost,
    vqs.bugs_found,
    vqs.goal_achieved,
    vqs.started_at,
    vqs.completed_at,
    EXTRACT(EPOCH FROM (vqs.completed_at - vqs.started_at)) as duration_seconds,
    COUNT(DISTINCT vqb.id) as unique_bugs,
    COUNT(DISTINCT vqa.id) as total_actions
FROM vision_qa_sessions vqs
LEFT JOIN managed_applications ma ON vqs.application_id = ma.id
LEFT JOIN vision_qa_bugs vqb ON vqs.id = vqb.session_id
LEFT JOIN vision_qa_actions vqa ON vqs.id = vqa.session_id
GROUP BY vqs.id, ma.name;

-- View for bug statistics by application
CREATE OR REPLACE VIEW vision_qa_bug_stats AS
SELECT 
    ma.id as application_id,
    ma.name as app_name,
    COUNT(DISTINCT vqb.id) as total_bugs,
    COUNT(DISTINCT vqb.id) FILTER (WHERE vqb.severity = 'critical') as critical_bugs,
    COUNT(DISTINCT vqb.id) FILTER (WHERE vqb.severity = 'high') as high_bugs,
    COUNT(DISTINCT vqb.id) FILTER (WHERE vqb.status = 'fixed') as fixed_bugs,
    AVG(vqb.confidence) as avg_detection_confidence,
    COUNT(DISTINCT vqb.bug_type) as unique_bug_types
FROM managed_applications ma
LEFT JOIN vision_qa_sessions vqs ON ma.id = vqs.application_id
LEFT JOIN vision_qa_bugs vqb ON vqs.id = vqb.session_id
GROUP BY ma.id, ma.name;