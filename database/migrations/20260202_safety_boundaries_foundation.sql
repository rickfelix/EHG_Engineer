-- Migration: Safety Boundaries Foundation
-- SD: SD-LEO-SELF-IMPROVE-002A
-- Description: Creates unified system_settings, auto_apply_allowlist/denylist,
--              enforcement trigger, and helper functions for AUTO-tier safety boundaries
-- Date: 2026-02-02

-- ============================================================================
-- PHASE 1: Create system_settings table (FR-1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'system',
    CONSTRAINT valid_setting_keys CHECK (
        key IN ('AUTO_FREEZE', 'HARD_HALT_STATUS', 'AUTO_RATE_LIMIT')
    )
);

-- Add comment for documentation
COMMENT ON TABLE system_settings IS 'Unified source of truth for AUTO safety state and rate limits. Replaces split-brain freeze logic.';

-- Seed default values (idempotent upsert)
INSERT INTO system_settings (key, value_json, updated_by)
VALUES
    ('AUTO_FREEZE', '{"enabled": false, "reason": null, "since": null}'::jsonb, 'migration'),
    ('HARD_HALT_STATUS', '{"enabled": false, "reason": null, "since": null}'::jsonb, 'migration'),
    ('AUTO_RATE_LIMIT', '{"window_seconds": 3600, "max_applied": 50}'::jsonb, 'migration')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PHASE 2: Create auto_apply_allowlist table (FR-2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auto_apply_allowlist (
    table_name TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'migration'
);

COMMENT ON TABLE auto_apply_allowlist IS 'Tables that AUTO-tier is permitted to modify. Default-deny: unlisted tables are blocked.';

-- Seed 6 safe tables (idempotent)
INSERT INTO auto_apply_allowlist (table_name)
VALUES
    ('leo_proposals'),
    ('leo_feedback'),
    ('protocol_improvement_queue'),
    ('self_audit_findings'),
    ('leo_vetting_outcomes'),
    ('improvement_quality_assessments')
ON CONFLICT (table_name) DO NOTHING;

-- ============================================================================
-- PHASE 3: Create auto_apply_denylist table (FR-3)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auto_apply_denylist (
    table_name TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'migration'
);

COMMENT ON TABLE auto_apply_denylist IS 'Tables that AUTO-tier must NEVER modify. Includes governance, safety, and critical system tables.';

-- Seed 15+ protected tables (idempotent)
INSERT INTO auto_apply_denylist (table_name)
VALUES
    ('protocol_constitution'),
    ('aegis_rules'),
    ('aegis_constitutions'),
    ('auto_apply_allowlist'),
    ('auto_apply_denylist'),
    ('system_settings'),
    ('strategic_directives_v2'),
    ('retrospectives'),
    ('sd_phase_handoffs'),
    ('ventures'),
    ('venture_stages'),
    ('investment_decisions'),
    ('nav_routes'),
    ('nav_preferences'),
    ('leo_scoring_rubrics'),
    ('leo_vetting_rubrics'),
    ('users'),
    ('audit_log')
ON CONFLICT (table_name) DO NOTHING;

-- ============================================================================
-- PHASE 4: Create helper functions (FR-5)
-- ============================================================================

-- is_auto_frozen(): Check if AUTO applies are frozen
CREATE OR REPLACE FUNCTION is_auto_frozen()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
    SELECT COALESCE(
        (SELECT (value_json->>'enabled')::boolean
         FROM system_settings
         WHERE key = 'AUTO_FREEZE'),
        false
    );
$$;

COMMENT ON FUNCTION is_auto_frozen() IS 'Returns true if AUTO-tier applies are currently frozen.';

-- set_auto_freeze(): Enable or disable AUTO freeze
CREATE OR REPLACE FUNCTION set_auto_freeze(
    p_enabled BOOLEAN,
    p_reason TEXT DEFAULT NULL,
    p_actor TEXT DEFAULT 'system'
)
RETURNS VOID
LANGUAGE PLPGSQL
AS $$
BEGIN
    UPDATE system_settings
    SET
        value_json = jsonb_build_object(
            'enabled', p_enabled,
            'reason', CASE WHEN p_enabled THEN p_reason ELSE NULL END,
            'since', CASE WHEN p_enabled THEN NOW()::text ELSE NULL END
        ),
        updated_at = NOW(),
        updated_by = p_actor
    WHERE key = 'AUTO_FREEZE';
END;
$$;

COMMENT ON FUNCTION set_auto_freeze(BOOLEAN, TEXT, TEXT) IS 'Enable or disable AUTO freeze with reason and actor tracking.';

-- get_auto_freeze_status(): Get full freeze status as JSON
CREATE OR REPLACE FUNCTION get_auto_freeze_status()
RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
    SELECT value_json || jsonb_build_object('updated_at', updated_at, 'updated_by', updated_by)
    FROM system_settings
    WHERE key = 'AUTO_FREEZE';
$$;

COMMENT ON FUNCTION get_auto_freeze_status() IS 'Returns full AUTO_FREEZE status including audit fields.';

-- ============================================================================
-- PHASE 5: Create enforcement trigger (FR-4)
-- ============================================================================

-- The enforcement trigger function
-- This attaches to protocol_improvement_queue to block AUTO-tier applies
CREATE OR REPLACE FUNCTION enforce_auto_apply_boundaries()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
DECLARE
    v_target_table TEXT;
    v_tier TEXT;
    v_is_frozen BOOLEAN;
    v_on_allowlist BOOLEAN;
    v_on_denylist BOOLEAN;
BEGIN
    -- Only check on status transitions to 'APPLIED' for AUTO tier
    -- The tier and target_table should be in the record or session context

    -- Get tier from the record (assumes column exists on protocol_improvement_queue)
    v_tier := COALESCE(NEW.apply_tier, current_setting('app.apply_tier', true));

    -- Only enforce for AUTO tier
    IF v_tier IS NULL OR v_tier != 'AUTO' THEN
        RETURN NEW;
    END IF;

    -- Get target table from record or session
    v_target_table := COALESCE(NEW.target_table, current_setting('app.target_table', true));

    -- If no target table specified, allow (non-table-modifying operation)
    IF v_target_table IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if AUTO is frozen
    v_is_frozen := is_auto_frozen();
    IF v_is_frozen THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'AUTO_FREEZE is enabled. AUTO-tier applies are blocked.',
            HINT = 'Disable AUTO_FREEZE using set_auto_freeze(false, null, ''actor'') to resume.';
    END IF;

    -- Check denylist first (explicit block)
    SELECT EXISTS(SELECT 1 FROM auto_apply_denylist WHERE table_name = v_target_table)
    INTO v_on_denylist;

    IF v_on_denylist THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format('Table "%s" is on denylist. AUTO-tier modification not permitted.', v_target_table),
            HINT = 'This table requires manual approval for modifications.';
    END IF;

    -- Check allowlist (default-deny)
    SELECT EXISTS(SELECT 1 FROM auto_apply_allowlist WHERE table_name = v_target_table)
    INTO v_on_allowlist;

    IF NOT v_on_allowlist THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format('Table "%s" is not on allowlist. AUTO-tier modification not permitted.', v_target_table),
            HINT = 'Add table to auto_apply_allowlist to enable AUTO-tier modifications.';
    END IF;

    -- All checks passed
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_auto_apply_boundaries() IS 'Trigger function that enforces AUTO-tier safety boundaries: freeze, denylist, and allowlist checks.';

-- ============================================================================
-- PHASE 6: Attach trigger to protocol_improvement_queue (if table exists)
-- ============================================================================

-- First, ensure the table has the required columns
DO $$
BEGIN
    -- Add apply_tier column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'protocol_improvement_queue'
        AND column_name = 'apply_tier'
    ) THEN
        ALTER TABLE protocol_improvement_queue
        ADD COLUMN apply_tier TEXT DEFAULT NULL;
    END IF;

    -- Add target_table column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'protocol_improvement_queue'
        AND column_name = 'target_table'
    ) THEN
        ALTER TABLE protocol_improvement_queue
        ADD COLUMN target_table TEXT DEFAULT NULL;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        -- Table doesn't exist yet, skip
        NULL;
END;
$$;

-- Create or replace the trigger
DROP TRIGGER IF EXISTS trg_enforce_auto_apply_boundaries ON protocol_improvement_queue;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'protocol_improvement_queue') THEN
        CREATE TRIGGER trg_enforce_auto_apply_boundaries
            BEFORE INSERT OR UPDATE ON protocol_improvement_queue
            FOR EACH ROW
            WHEN (NEW.status = 'APPLIED' OR NEW.status = 'applied')
            EXECUTE FUNCTION enforce_auto_apply_boundaries();
    END IF;
END;
$$;

-- ============================================================================
-- PHASE 7: Row-level security (TR-3)
-- ============================================================================

-- Enable RLS on safety tables
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_apply_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_apply_denylist ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read
CREATE POLICY IF NOT EXISTS "Allow read access to system_settings"
    ON system_settings FOR SELECT
    USING (true);

CREATE POLICY IF NOT EXISTS "Allow read access to auto_apply_allowlist"
    ON auto_apply_allowlist FOR SELECT
    USING (true);

CREATE POLICY IF NOT EXISTS "Allow read access to auto_apply_denylist"
    ON auto_apply_denylist FOR SELECT
    USING (true);

-- Policy: Only service role can write
CREATE POLICY IF NOT EXISTS "Service role can modify system_settings"
    ON system_settings FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "Service role can modify auto_apply_allowlist"
    ON auto_apply_allowlist FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "Service role can modify auto_apply_denylist"
    ON auto_apply_denylist FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- PHASE 8: Rate limit helper function (TR-4)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_auto_apply_count_in_window()
RETURNS INTEGER
LANGUAGE SQL
STABLE
AS $$
    WITH rate_config AS (
        SELECT
            (value_json->>'window_seconds')::integer as window_seconds,
            (value_json->>'max_applied')::integer as max_applied
        FROM system_settings
        WHERE key = 'AUTO_RATE_LIMIT'
    )
    SELECT COUNT(*)::integer
    FROM protocol_improvement_queue piq, rate_config rc
    WHERE piq.apply_tier = 'AUTO'
      AND piq.status IN ('APPLIED', 'applied')
      AND piq.applied_at > NOW() - (rc.window_seconds || ' seconds')::interval;
$$;

CREATE OR REPLACE FUNCTION is_auto_rate_limited()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
    WITH rate_config AS (
        SELECT
            (value_json->>'max_applied')::integer as max_applied
        FROM system_settings
        WHERE key = 'AUTO_RATE_LIMIT'
    )
    SELECT get_auto_apply_count_in_window() >= rc.max_applied
    FROM rate_config rc;
$$;

COMMENT ON FUNCTION get_auto_apply_count_in_window() IS 'Returns count of APPLIED AUTO-tier changes within the rate limit window.';
COMMENT ON FUNCTION is_auto_rate_limited() IS 'Returns true if AUTO-tier has reached the rate limit.';

-- ============================================================================
-- VERIFICATION QUERIES (for testing)
-- ============================================================================

-- Verify tables created
DO $$
BEGIN
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_settings'),
        'system_settings table not created';
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auto_apply_allowlist'),
        'auto_apply_allowlist table not created';
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auto_apply_denylist'),
        'auto_apply_denylist table not created';

    RAISE NOTICE 'All safety boundary tables created successfully';
END;
$$;

-- Verify seed data
DO $$
DECLARE
    v_settings_count INTEGER;
    v_allowlist_count INTEGER;
    v_denylist_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_settings_count FROM system_settings;
    SELECT COUNT(*) INTO v_allowlist_count FROM auto_apply_allowlist;
    SELECT COUNT(*) INTO v_denylist_count FROM auto_apply_denylist;

    ASSERT v_settings_count = 3, format('Expected 3 settings, got %s', v_settings_count);
    ASSERT v_allowlist_count >= 6, format('Expected >= 6 allowlist entries, got %s', v_allowlist_count);
    ASSERT v_denylist_count >= 15, format('Expected >= 15 denylist entries, got %s', v_denylist_count);

    RAISE NOTICE 'Seed data verified: % settings, % allowlist, % denylist',
        v_settings_count, v_allowlist_count, v_denylist_count;
END;
$$;

-- Verify functions exist
DO $$
BEGIN
    ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_auto_frozen'),
        'is_auto_frozen function not created';
    ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_auto_freeze'),
        'set_auto_freeze function not created';
    ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_auto_apply_boundaries'),
        'enforce_auto_apply_boundaries function not created';

    RAISE NOTICE 'All safety boundary functions created successfully';
END;
$$;
