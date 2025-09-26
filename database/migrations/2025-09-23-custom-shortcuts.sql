-- Migration: Custom Shortcuts Support
-- SD-002 Sprint 2: Story 2 - Quick Actions
-- Adds user customization support to navigation shortcuts

-- Add user customization columns to navigation_shortcuts table
ALTER TABLE navigation_shortcuts
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create user preferences table for shortcut customization
CREATE TABLE IF NOT EXISTS user_shortcut_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  shortcut_key VARCHAR(10) NOT NULL, -- '1', '2', '3', etc.
  target_path VARCHAR(255) NOT NULL,
  label VARCHAR(100) NOT NULL,
  icon VARCHAR(50),
  is_enabled BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, shortcut_key)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_navigation_shortcuts_user_id ON navigation_shortcuts(user_id);
CREATE INDEX IF NOT EXISTS idx_navigation_shortcuts_enabled ON navigation_shortcuts(is_enabled);
CREATE INDEX IF NOT EXISTS idx_user_shortcut_preferences_user_id ON user_shortcut_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_shortcut_preferences_enabled ON user_shortcut_preferences(is_enabled);

-- Insert default shortcuts for new users
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
CREATE OR REPLACE FUNCTION get_user_shortcuts(p_user_id UUID)
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
  -- First, try to get user custom shortcuts
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

  -- If no custom shortcuts, fall back to defaults
  IF NOT FOUND THEN
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
  END IF;
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

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_shortcut_preferences_updated_at
BEFORE UPDATE ON user_shortcut_preferences
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add telemetry support for shortcut customization
INSERT INTO navigation_telemetry (event_type, user_id, session_id, path, metadata, client_timestamp)
SELECT
  'shortcut_migration',
  NULL,
  'system',
  '/migration',
  '{"migration": "custom_shortcuts", "version": "2025-09-23"}'::jsonb,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_telemetry
  WHERE event_type = 'shortcut_migration'
  AND metadata->>'migration' = 'custom_shortcuts'
);

COMMENT ON TABLE user_shortcut_preferences IS 'User-customized keyboard shortcuts for navigation';
COMMENT ON FUNCTION get_user_shortcuts(UUID) IS 'Returns user shortcuts with fallback to system defaults';
COMMENT ON FUNCTION save_user_shortcut(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, INTEGER) IS 'Saves or updates a user shortcut preference';
COMMENT ON FUNCTION reset_user_shortcuts(UUID) IS 'Resets user shortcuts to system defaults';