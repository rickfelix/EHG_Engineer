-- Migration: Create leo_settings table for global defaults
-- Part of: SD-LEO-INFRA-DEPRECATE-UAT-DEFECTS-001 (AUTO-PROCEED and Chaining Settings Enhancement)
-- Date: 2026-01-31
--
-- Purpose:
-- Provides global default settings for AUTO-PROCEED and Orchestrator Chaining.
-- Uses singleton pattern (single row with id=1) to ensure exactly one source of truth.
--
-- Precedence hierarchy:
-- 1. CLI flags (--auto-proceed, --no-auto-proceed) - highest
-- 2. Environment variable (AUTO_PROCEED=true|false)
-- 3. Session metadata (claude_sessions.metadata.auto_proceed)
-- 4. Global defaults (this table) ← NEW
-- 5. Hard-coded fallback (auto_proceed=true, chain_orchestrators=false)

-- Create the singleton settings table
CREATE TABLE IF NOT EXISTS leo_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  auto_proceed BOOLEAN NOT NULL DEFAULT TRUE,
  chain_orchestrators BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT leo_settings_singleton CHECK (id = 1)
);

-- Add table comment
COMMENT ON TABLE leo_settings IS 'Singleton table for LEO Protocol global defaults. Only one row (id=1) should exist.';

-- Add column comments
COMMENT ON COLUMN leo_settings.id IS 'Always 1 (singleton constraint)';
COMMENT ON COLUMN leo_settings.auto_proceed IS 'Global default for AUTO-PROCEED mode. When true, phase transitions execute automatically.';
COMMENT ON COLUMN leo_settings.chain_orchestrators IS 'Global default for orchestrator chaining. When true, auto-continues to next orchestrator after completion.';
COMMENT ON COLUMN leo_settings.updated_at IS 'Timestamp of last update';
COMMENT ON COLUMN leo_settings.updated_by IS 'Identifier of who/what made the last update (session_id, user, etc.)';

-- Ensure exactly one row exists with default values
INSERT INTO leo_settings (id, auto_proceed, chain_orchestrators)
VALUES (1, TRUE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE leo_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow read for all, write for service role only
CREATE POLICY "leo_settings_anon_read" ON leo_settings
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "leo_settings_authenticated_read" ON leo_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "leo_settings_service_all" ON leo_settings
  FOR ALL
  TO service_role
  USING (true);

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_leo_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leo_settings_updated_at
  BEFORE UPDATE ON leo_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_leo_settings_timestamp();

-- Helper function to get global defaults
CREATE OR REPLACE FUNCTION get_leo_global_defaults()
RETURNS TABLE (
  auto_proceed BOOLEAN,
  chain_orchestrators BOOLEAN,
  updated_at TIMESTAMPTZ,
  updated_by TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ls.auto_proceed,
    ls.chain_orchestrators,
    ls.updated_at,
    ls.updated_by
  FROM leo_settings ls
  WHERE ls.id = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to update global defaults
CREATE OR REPLACE FUNCTION set_leo_global_defaults(
  p_auto_proceed BOOLEAN DEFAULT NULL,
  p_chain_orchestrators BOOLEAN DEFAULT NULL,
  p_updated_by TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  auto_proceed BOOLEAN,
  chain_orchestrators BOOLEAN,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_auto_proceed BOOLEAN;
  v_chain_orchestrators BOOLEAN;
  v_updated_at TIMESTAMPTZ;
BEGIN
  -- Update only the fields that are provided (non-null)
  UPDATE leo_settings
  SET
    auto_proceed = COALESCE(p_auto_proceed, leo_settings.auto_proceed),
    chain_orchestrators = COALESCE(p_chain_orchestrators, leo_settings.chain_orchestrators),
    updated_by = COALESCE(p_updated_by, leo_settings.updated_by)
  WHERE id = 1
  RETURNING
    leo_settings.auto_proceed,
    leo_settings.chain_orchestrators,
    leo_settings.updated_at
  INTO v_auto_proceed, v_chain_orchestrators, v_updated_at;

  RETURN QUERY SELECT TRUE, v_auto_proceed, v_chain_orchestrators, v_updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_leo_global_defaults() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_leo_global_defaults(BOOLEAN, BOOLEAN, TEXT) TO service_role;
