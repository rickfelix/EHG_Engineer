-- AI Navigation Patterns Schema
-- SD-002: AI Navigation Consolidated
-- Created: 2025-09-23
-- EXEC Agent Implementation

-- Navigation patterns table for ML training and prediction
CREATE TABLE IF NOT EXISTS navigation_patterns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    from_path VARCHAR(500) NOT NULL,
    to_path VARCHAR(500) NOT NULL,
    context JSONB DEFAULT '{}',
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INTEGER,
    prediction_used BOOLEAN DEFAULT false,
    prediction_accuracy FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexes for performance
    INDEX idx_nav_patterns_user (user_id),
    INDEX idx_nav_patterns_session (session_id),
    INDEX idx_nav_patterns_timestamp (timestamp DESC),
    INDEX idx_nav_patterns_paths (from_path, to_path)
);

-- Predictions cache for sub-200ms response time
CREATE TABLE IF NOT EXISTS navigation_predictions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    context_hash VARCHAR(64) NOT NULL,
    current_path VARCHAR(500) NOT NULL,
    predictions JSONB NOT NULL,
    confidence FLOAT NOT NULL,
    model_version VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    hit_count INTEGER DEFAULT 0,

    -- Unique constraint for cache key
    UNIQUE(user_id, context_hash),

    -- Indexes
    INDEX idx_nav_predictions_user (user_id),
    INDEX idx_nav_predictions_expires (expires_at),
    INDEX idx_nav_predictions_context (context_hash)
);

-- User navigation preferences and shortcuts
CREATE TABLE IF NOT EXISTS navigation_shortcuts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    shortcut_key VARCHAR(10) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    target_path VARCHAR(500),
    custom_label VARCHAR(100),
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Unique shortcut per user
    UNIQUE(user_id, shortcut_key),

    -- Index
    INDEX idx_nav_shortcuts_user (user_id)
);

-- Navigation telemetry for analytics
CREATE TABLE IF NOT EXISTS navigation_telemetry (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(100),
    session_id VARCHAR(100),
    path VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    client_timestamp TIMESTAMP NOT NULL,
    server_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexes for analytics queries
    INDEX idx_nav_telemetry_event (event_type),
    INDEX idx_nav_telemetry_user (user_id),
    INDEX idx_nav_telemetry_timestamp (server_timestamp DESC)
);

-- AI model training metadata
CREATE TABLE IF NOT EXISTS navigation_models (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    model_version VARCHAR(20) NOT NULL UNIQUE,
    model_type VARCHAR(50) NOT NULL,
    training_date TIMESTAMP NOT NULL,
    accuracy_score FLOAT NOT NULL,
    training_samples INTEGER NOT NULL,
    model_parameters JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT false,
    deployment_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Index
    INDEX idx_nav_models_active (is_active)
);

-- Feature flags for progressive rollout
CREATE TABLE IF NOT EXISTS navigation_features (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    feature_name VARCHAR(100) NOT NULL UNIQUE,
    is_enabled BOOLEAN DEFAULT false,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    configuration JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default feature flags
INSERT INTO navigation_features (feature_name, is_enabled, rollout_percentage, configuration) VALUES
    ('ai_navigation_enabled', false, 0, '{"description": "Master switch for AI navigation features"}'),
    ('predictive_routing', false, 0, '{"description": "Enable predictive route suggestions"}'),
    ('smart_search', false, 0, '{"description": "Enable NLP-powered search"}'),
    ('keyboard_shortcuts', false, 0, '{"description": "Enable customizable keyboard shortcuts"}'),
    ('analytics_dashboard', false, 0, '{"description": "Enable navigation analytics dashboard"}'),
    ('command_palette', false, 0, '{"description": "Enable Cmd+K command palette"}')
ON CONFLICT (feature_name) DO NOTHING;

-- Function to clean expired predictions
CREATE OR REPLACE FUNCTION clean_expired_predictions()
RETURNS void AS $$
BEGIN
    DELETE FROM navigation_predictions
    WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate navigation frequency
CREATE OR REPLACE FUNCTION get_navigation_frequency(
    p_user_id VARCHAR(100),
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    path_pair VARCHAR,
    frequency INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        CONCAT(from_path, ' -> ', to_path) as path_pair,
        COUNT(*)::INTEGER as frequency
    FROM navigation_patterns
    WHERE user_id = p_user_id
        AND timestamp > CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days
    GROUP BY from_path, to_path
    ORDER BY frequency DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Create update triggers for timestamps
CREATE TRIGGER update_navigation_shortcuts_updated_at
    BEFORE UPDATE ON navigation_shortcuts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_navigation_features_updated_at
    BEFORE UPDATE ON navigation_features
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust based on your user roles)
GRANT SELECT, INSERT ON navigation_patterns TO authenticated;
GRANT SELECT ON navigation_predictions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON navigation_shortcuts TO authenticated;
GRANT INSERT ON navigation_telemetry TO authenticated;
GRANT SELECT ON navigation_features TO authenticated;

-- Comments for documentation
COMMENT ON TABLE navigation_patterns IS 'Stores user navigation history for ML training and analysis';
COMMENT ON TABLE navigation_predictions IS 'Cache for AI navigation predictions to ensure <200ms response';
COMMENT ON TABLE navigation_shortcuts IS 'User-customizable keyboard shortcuts and quick actions';
COMMENT ON TABLE navigation_telemetry IS 'Navigation event tracking for analytics and monitoring';
COMMENT ON TABLE navigation_models IS 'ML model versioning and deployment tracking';
COMMENT ON TABLE navigation_features IS 'Feature flags for progressive rollout of AI navigation features';