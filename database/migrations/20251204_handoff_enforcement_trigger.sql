-- Handoff Enforcement Trigger
-- Prevents direct inserts into sd_phase_handoffs that bypass the validation system
-- Part of LEO Protocol LLM Hallucination Prevention

-- 1. Create audit log table for all handoff attempts
CREATE TABLE IF NOT EXISTS handoff_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempted_by TEXT,
    sd_id TEXT,
    handoff_type TEXT,
    from_phase TEXT,
    to_phase TEXT,
    blocked BOOLEAN DEFAULT false,
    block_reason TEXT,
    request_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying audit log
CREATE INDEX IF NOT EXISTS idx_handoff_audit_created
    ON handoff_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_handoff_audit_blocked
    ON handoff_audit_log(blocked) WHERE blocked = true;
CREATE INDEX IF NOT EXISTS idx_handoff_audit_sd
    ON handoff_audit_log(sd_id);

-- 2. Create the enforcement function
CREATE OR REPLACE FUNCTION enforce_handoff_system()
RETURNS TRIGGER AS $$
DECLARE
    v_allowed_creators TEXT[] := ARRAY[
        'UNIFIED-HANDOFF-SYSTEM',
        'SYSTEM_MIGRATION',      -- For data migrations
        'ADMIN_OVERRIDE'         -- Emergency override (requires human action)
    ];
BEGIN
    -- Log the attempt (always, regardless of outcome)
    INSERT INTO handoff_audit_log (
        attempted_by,
        sd_id,
        handoff_type,
        from_phase,
        to_phase,
        blocked,
        block_reason,
        request_metadata
    ) VALUES (
        COALESCE(NEW.created_by, 'NULL'),
        NEW.sd_id,
        NEW.handoff_type,
        NEW.from_phase,
        NEW.to_phase,
        NOT (COALESCE(NEW.created_by, '') = ANY(v_allowed_creators)),
        CASE
            WHEN COALESCE(NEW.created_by, '') = ANY(v_allowed_creators) THEN NULL
            ELSE format('Invalid created_by: %s. Must use handoff.js script.', COALESCE(NEW.created_by, 'NULL'))
        END,
        jsonb_build_object(
            'trigger_time', NOW(),
            'status', NEW.status,
            'validation_score', NEW.validation_score
        )
    );

    -- Check if creator is allowed
    IF COALESCE(NEW.created_by, '') = ANY(v_allowed_creators) THEN
        -- Allowed - proceed with insert
        RETURN NEW;
    END IF;

    -- Not allowed - raise exception with helpful message
    RAISE EXCEPTION 'HANDOFF_BYPASS_BLOCKED: Direct handoff creation is not allowed.

To create a handoff, run:
  node scripts/handoff.js execute <TYPE> <SD-ID>

Where TYPE is one of:
  - LEAD-TO-PLAN
  - PLAN-TO-EXEC
  - EXEC-TO-PLAN
  - PLAN-TO-LEAD

Example:
  node scripts/handoff.js execute PLAN-TO-EXEC SD-EXAMPLE-001

Attempted created_by: %', COALESCE(NEW.created_by, 'NULL');
END;
$$ LANGUAGE plpgsql;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS enforce_handoff_creation ON sd_phase_handoffs;

CREATE TRIGGER enforce_handoff_creation
    BEFORE INSERT ON sd_phase_handoffs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_handoff_system();

-- 4. Add RLS to audit log (read-only for authenticated users)
ALTER TABLE handoff_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to handoff_audit_log"
    ON handoff_audit_log FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can view handoff_audit_log"
    ON handoff_audit_log FOR SELECT
    TO authenticated
    USING (true);

-- 5. Add comments
COMMENT ON TABLE handoff_audit_log IS 'Audit trail for all handoff creation attempts, including blocked bypasses';
COMMENT ON FUNCTION enforce_handoff_system() IS 'Trigger function that enforces handoff creation via the official handoff.js script';
COMMENT ON TRIGGER enforce_handoff_creation ON sd_phase_handoffs IS 'Blocks direct inserts to sd_phase_handoffs that bypass validation';

-- 6. Grant permissions
GRANT SELECT ON handoff_audit_log TO authenticated;
GRANT ALL ON handoff_audit_log TO service_role;
