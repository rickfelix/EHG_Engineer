-- Navigation Shortcuts Database Schema
-- SD-002 Sprint 3: Database Integration for AI Navigation
-- Provides user-customizable keyboard shortcuts with persistence

-- Main navigation shortcuts table (system defaults)
CREATE TABLE IF NOT EXISTS navigation_shortcuts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(10) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    target_path VARCHAR(255) NOT NULL,
    icon VARCHAR(50),
    user_id UUID, -- References auth.users(id) when user-specific
    is_custom BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User shortcut preferences (custom overrides)
CREATE TABLE IF NOT EXISTS user_shortcut_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References auth.users(id)
    shortcut_key VARCHAR(10) NOT NULL CHECK (shortcut_key ~ '^[1-9]$'),
    target_path VARCHAR(255) NOT NULL,
    label VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    is_enabled BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, shortcut_key)
);

-- Navigation telemetry for usage tracking
CREATE TABLE IF NOT EXISTS navigation_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    user_id UUID, -- References auth.users(id)
    session_id VARCHAR(100),
    path VARCHAR(255),
    shortcut_key VARCHAR(10),
    metadata JSONB DEFAULT '{}'::jsonb,
    client_timestamp TIMESTAMP WITH TIME ZONE,
    server_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_navigation_shortcuts_key ON navigation_shortcuts(key);
CREATE INDEX IF NOT EXISTS idx_navigation_shortcuts_user_id ON navigation_shortcuts(user_id);
CREATE INDEX IF NOT EXISTS idx_navigation_shortcuts_enabled ON navigation_shortcuts(is_enabled);
CREATE INDEX IF NOT EXISTS idx_user_shortcut_preferences_user_id ON user_shortcut_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_shortcut_preferences_enabled ON user_shortcut_preferences(is_enabled);
CREATE INDEX IF NOT EXISTS idx_navigation_telemetry_user_id ON navigation_telemetry(user_id);
CREATE INDEX IF NOT EXISTS idx_navigation_telemetry_event_type ON navigation_telemetry(event_type);
CREATE INDEX IF NOT EXISTS idx_navigation_telemetry_timestamp ON navigation_telemetry(server_timestamp);

-- Insert default shortcuts (1-9)
INSERT INTO navigation_shortcuts (key, label, target_path, icon, is_custom, display_order) VALUES
('1', 'Dashboard', '/dashboard', 'home', false, 1),
('2', 'Strategic Directives', '/strategic-directives', 'target', false, 2),
('3', 'PRDs', '/prds', 'file-text', false, 3),
('4', 'Backlog', '/backlog', 'list', false, 4),
('5', 'Stories', '/stories', 'book', false, 5),
('6', 'Reports', '/reports', 'bar-chart', false, 6),
('7', 'Analytics', '/analytics', 'trending-up', false, 7),
('8', 'Settings', '/settings', 'settings', false, 8),
('9', 'Profile', '/profile', 'user', false, 9)
ON CONFLICT (key) DO NOTHING;

-- Function to get user shortcuts with fallback to defaults
CREATE OR REPLACE FUNCTION get_user_shortcuts(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    shortcut_key VARCHAR(10),
    label VARCHAR(100),
    target_path VARCHAR(255),
    icon VARCHAR(50),
    is_enabled BOOLEAN,
    display_order INTEGER,
    is_custom BOOLEAN
) AS $$
BEGIN
    -- If user_id provided, check for custom shortcuts first
    IF p_user_id IS NOT NULL THEN
        RETURN QUERY
        SELECT
            usp.shortcut_key,
            usp.label,
            usp.target_path,
            usp.icon,
            usp.is_enabled,
            usp.display_order,
            true as is_custom
        FROM user_shortcut_preferences usp
        WHERE usp.user_id = p_user_id
          AND usp.is_enabled = true
        ORDER BY usp.display_order, usp.shortcut_key;

        -- If custom shortcuts found, return them
        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Fallback to default shortcuts
    RETURN QUERY
    SELECT
        ns.key::VARCHAR(10),
        ns.label,
        ns.target_path,
        ns.icon,
        ns.is_enabled,
        ns.display_order,
        false as is_custom
    FROM navigation_shortcuts ns
    WHERE ns.is_enabled = true
      AND ns.user_id IS NULL -- Default shortcuts
    ORDER BY ns.display_order, ns.key;
END;
$$ LANGUAGE plpgsql;

-- Function to save user shortcut customization
CREATE OR REPLACE FUNCTION save_user_shortcut(
    p_user_id UUID,
    p_shortcut_key VARCHAR(10),
    p_target_path VARCHAR(255),
    p_label VARCHAR(100),
    p_icon VARCHAR(50) DEFAULT NULL,
    p_display_order INTEGER DEFAULT 0
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Validate shortcut key (1-9)
    IF p_shortcut_key !~ '^[1-9]$' THEN
        RAISE EXCEPTION 'Invalid shortcut key: must be 1-9';
    END IF;

    -- Validate path
    IF p_target_path IS NULL OR p_target_path = '' OR p_target_path !~ '^/.*' THEN
        RAISE EXCEPTION 'Invalid target path: must start with /';
    END IF;

    -- Insert or update user preference
    INSERT INTO user_shortcut_preferences (
        user_id, shortcut_key, target_path, label, icon, display_order, updated_at
    ) VALUES (
        p_user_id, p_shortcut_key, p_target_path, p_label, p_icon, p_display_order, NOW()
    )
    ON CONFLICT (user_id, shortcut_key)
    DO UPDATE SET
        target_path = EXCLUDED.target_path,
        label = EXCLUDED.label,
        icon = EXCLUDED.icon,
        display_order = EXCLUDED.display_order,
        updated_at = NOW();

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Function to reset shortcuts to defaults
CREATE OR REPLACE FUNCTION reset_user_shortcuts(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    DELETE FROM user_shortcut_preferences WHERE user_id = p_user_id;
    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Function to record navigation telemetry
CREATE OR REPLACE FUNCTION record_navigation_telemetry(
    p_event_type VARCHAR(50),
    p_user_id UUID DEFAULT NULL,
    p_session_id VARCHAR(100) DEFAULT NULL,
    p_path VARCHAR(255) DEFAULT NULL,
    p_shortcut_key VARCHAR(10) DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_client_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    telemetry_id UUID;
BEGIN
    INSERT INTO navigation_telemetry (
        event_type, user_id, session_id, path, shortcut_key, metadata, client_timestamp
    ) VALUES (
        p_event_type, p_user_id, p_session_id, p_path, p_shortcut_key, p_metadata, p_client_timestamp
    ) RETURNING id INTO telemetry_id;

    RETURN telemetry_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to user_shortcut_preferences
DROP TRIGGER IF EXISTS update_user_shortcut_preferences_updated_at ON user_shortcut_preferences;
CREATE TRIGGER update_user_shortcut_preferences_updated_at
    BEFORE UPDATE ON user_shortcut_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to navigation_shortcuts
DROP TRIGGER IF EXISTS update_navigation_shortcuts_updated_at ON navigation_shortcuts;
CREATE TRIGGER update_navigation_shortcuts_updated_at
    BEFORE UPDATE ON navigation_shortcuts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add initial telemetry entry to mark schema creation
INSERT INTO navigation_telemetry (event_type, session_id, path, metadata, client_timestamp)
SELECT
    'schema_migration',
    'system',
    '/migration',
    '{"schema": "014_navigation_shortcuts", "version": "1.0", "sprint": "SD-002-Sprint3"}'::jsonb,
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM navigation_telemetry
    WHERE event_type = 'schema_migration'
    AND metadata->>'schema' = '014_navigation_shortcuts'
);

-- Comments for documentation
COMMENT ON TABLE navigation_shortcuts IS 'System default navigation shortcuts (Cmd+1-9)';
COMMENT ON TABLE user_shortcut_preferences IS 'User-customized shortcut overrides';
COMMENT ON TABLE navigation_telemetry IS 'Navigation usage tracking and analytics';
COMMENT ON FUNCTION get_user_shortcuts(UUID) IS 'Returns user shortcuts with fallback to defaults';
COMMENT ON FUNCTION save_user_shortcut(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, INTEGER) IS 'Saves or updates user shortcut preference';
COMMENT ON FUNCTION reset_user_shortcuts(UUID) IS 'Resets user shortcuts to system defaults';
COMMENT ON FUNCTION record_navigation_telemetry(VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, TIMESTAMP) IS 'Records navigation usage for analytics';