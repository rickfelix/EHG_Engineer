-- Migration: Feature Flag Governance (SD-LEO-SELF-IMPROVE-001K)
-- Description: Add governance columns to leo_feature_flags and create audit/approval tables
-- Author: Database Agent
-- Date: 2026-02-01

-- =====================================================
-- PART 1: Add governance columns to leo_feature_flags
-- =====================================================

-- Add lifecycle_state enum type
DO $$ BEGIN
  CREATE TYPE feature_flag_lifecycle_state AS ENUM (
    'draft',
    'enabled',
    'disabled',
    'expired',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add risk_tier enum type
DO $$ BEGIN
  CREATE TYPE feature_flag_risk_tier AS ENUM (
    'low',
    'medium',
    'high'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add governance columns to leo_feature_flags
ALTER TABLE leo_feature_flags
  ADD COLUMN IF NOT EXISTS lifecycle_state feature_flag_lifecycle_state DEFAULT 'enabled' NOT NULL,
  ADD COLUMN IF NOT EXISTS risk_tier feature_flag_risk_tier DEFAULT 'medium' NOT NULL,
  ADD COLUMN IF NOT EXISTS owner_type text,
  ADD COLUMN IF NOT EXISTS owner_id text,
  ADD COLUMN IF NOT EXISTS is_temporary boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS expiry_at timestamptz,
  ADD COLUMN IF NOT EXISTS row_version integer DEFAULT 1 NOT NULL;

-- Add check constraint for owner_type
ALTER TABLE leo_feature_flags
  DROP CONSTRAINT IF EXISTS chk_owner_type;

ALTER TABLE leo_feature_flags
  ADD CONSTRAINT chk_owner_type
  CHECK (owner_type IS NULL OR owner_type IN ('user', 'team'));

-- Add comment for documentation
COMMENT ON COLUMN leo_feature_flags.lifecycle_state IS 'Current lifecycle state of the feature flag';
COMMENT ON COLUMN leo_feature_flags.risk_tier IS 'Risk tier for governance and approval requirements';
COMMENT ON COLUMN leo_feature_flags.owner_type IS 'Type of owner: user or team';
COMMENT ON COLUMN leo_feature_flags.owner_id IS 'ID of the owner (user ID or team ID)';
COMMENT ON COLUMN leo_feature_flags.is_temporary IS 'Whether this flag is temporary and should expire';
COMMENT ON COLUMN leo_feature_flags.expiry_at IS 'Expiration timestamp for temporary flags';
COMMENT ON COLUMN leo_feature_flags.row_version IS 'Version number for optimistic locking';

-- Create index on lifecycle_state for filtering
CREATE INDEX IF NOT EXISTS idx_leo_feature_flags_lifecycle_state
  ON leo_feature_flags (lifecycle_state);

-- Create index on expiry_at for finding expiring flags
CREATE INDEX IF NOT EXISTS idx_leo_feature_flags_expiry_at
  ON leo_feature_flags (expiry_at)
  WHERE expiry_at IS NOT NULL;

-- =====================================================
-- PART 2: Create leo_feature_flag_audit table
-- =====================================================

CREATE TABLE IF NOT EXISTS leo_feature_flag_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL,
  action_type text NOT NULL,
  actor_id text,
  actor_type text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  correlation_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add check constraint for action_type
ALTER TABLE leo_feature_flag_audit
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE leo_feature_flag_audit
  ADD CONSTRAINT chk_action_type
  CHECK (action_type IN ('create', 'update', 'transition', 'approval', 'rollback', 'expire'));

-- Add check constraint for actor_type
ALTER TABLE leo_feature_flag_audit
  DROP CONSTRAINT IF EXISTS chk_actor_type;

ALTER TABLE leo_feature_flag_audit
  ADD CONSTRAINT chk_actor_type
  CHECK (actor_type IS NULL OR actor_type IN ('user', 'system', 'pipeline'));

-- Add comments for documentation
COMMENT ON TABLE leo_feature_flag_audit IS 'Immutable audit log for all feature flag changes';
COMMENT ON COLUMN leo_feature_flag_audit.flag_key IS 'Reference to leo_feature_flags.flag_key';
COMMENT ON COLUMN leo_feature_flag_audit.action_type IS 'Type of action: create, update, transition, approval, rollback, expire';
COMMENT ON COLUMN leo_feature_flag_audit.actor_id IS 'ID of the actor who performed the action';
COMMENT ON COLUMN leo_feature_flag_audit.actor_type IS 'Type of actor: user, system, pipeline';
COMMENT ON COLUMN leo_feature_flag_audit.before_state IS 'State before the change (JSONB snapshot)';
COMMENT ON COLUMN leo_feature_flag_audit.after_state IS 'State after the change (JSONB snapshot)';
COMMENT ON COLUMN leo_feature_flag_audit.reason IS 'Reason for the change (required for approvals)';
COMMENT ON COLUMN leo_feature_flag_audit.correlation_id IS 'UUID to correlate related audit entries';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leo_feature_flag_audit_flag_key
  ON leo_feature_flag_audit (flag_key);

CREATE INDEX IF NOT EXISTS idx_leo_feature_flag_audit_correlation_id
  ON leo_feature_flag_audit (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leo_feature_flag_audit_created_at
  ON leo_feature_flag_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leo_feature_flag_audit_action_type
  ON leo_feature_flag_audit (action_type);

-- =====================================================
-- PART 3: Create leo_feature_flag_approvals table
-- =====================================================

CREATE TABLE IF NOT EXISTS leo_feature_flag_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL,
  transition_type text,
  required_approvals integer NOT NULL,
  approvals_received integer DEFAULT 0 NOT NULL,
  approver_ids text[] DEFAULT '{}',
  requester_id text,
  status text DEFAULT 'pending' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  resolved_at timestamptz
);

-- Add check constraint for status
ALTER TABLE leo_feature_flag_approvals
  DROP CONSTRAINT IF EXISTS chk_approval_status;

ALTER TABLE leo_feature_flag_approvals
  ADD CONSTRAINT chk_approval_status
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- Add check constraint for approvals_received
ALTER TABLE leo_feature_flag_approvals
  DROP CONSTRAINT IF EXISTS chk_approvals_count;

ALTER TABLE leo_feature_flag_approvals
  ADD CONSTRAINT chk_approvals_count
  CHECK (approvals_received >= 0 AND approvals_received <= required_approvals);

-- Add comments for documentation
COMMENT ON TABLE leo_feature_flag_approvals IS 'Approval workflow tracking for feature flag state transitions';
COMMENT ON COLUMN leo_feature_flag_approvals.flag_key IS 'Reference to leo_feature_flags.flag_key';
COMMENT ON COLUMN leo_feature_flag_approvals.transition_type IS 'Type of transition requiring approval (e.g., enable, disable, expire)';
COMMENT ON COLUMN leo_feature_flag_approvals.required_approvals IS 'Number of approvals required';
COMMENT ON COLUMN leo_feature_flag_approvals.approvals_received IS 'Number of approvals received so far';
COMMENT ON COLUMN leo_feature_flag_approvals.approver_ids IS 'Array of user IDs who have approved';
COMMENT ON COLUMN leo_feature_flag_approvals.requester_id IS 'User ID who requested the change';
COMMENT ON COLUMN leo_feature_flag_approvals.status IS 'Status: pending, approved, rejected';
COMMENT ON COLUMN leo_feature_flag_approvals.resolved_at IS 'Timestamp when approval was finalized';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_leo_feature_flag_approvals_flag_key
  ON leo_feature_flag_approvals (flag_key);

CREATE INDEX IF NOT EXISTS idx_leo_feature_flag_approvals_status
  ON leo_feature_flag_approvals (status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_leo_feature_flag_approvals_created_at
  ON leo_feature_flag_approvals (created_at DESC);

-- =====================================================
-- PART 4: Create audit trigger for leo_feature_flags
-- =====================================================

-- Function to automatically create audit entries
CREATE OR REPLACE FUNCTION fn_audit_feature_flag_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO leo_feature_flag_audit (
      flag_key,
      action_type,
      actor_type,
      after_state,
      created_at
    ) VALUES (
      NEW.flag_key,
      'create',
      'system',
      to_jsonb(NEW),
      now()
    );
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Detect if this is a lifecycle state transition
    IF OLD.lifecycle_state IS DISTINCT FROM NEW.lifecycle_state THEN
      INSERT INTO leo_feature_flag_audit (
        flag_key,
        action_type,
        actor_type,
        before_state,
        after_state,
        created_at
      ) VALUES (
        NEW.flag_key,
        'transition',
        'system',
        jsonb_build_object(
          'lifecycle_state', OLD.lifecycle_state,
          'is_enabled', OLD.is_enabled,
          'updated_at', OLD.updated_at
        ),
        jsonb_build_object(
          'lifecycle_state', NEW.lifecycle_state,
          'is_enabled', NEW.is_enabled,
          'updated_at', NEW.updated_at
        ),
        now()
      );
    ELSE
      -- Regular update
      INSERT INTO leo_feature_flag_audit (
        flag_key,
        action_type,
        actor_type,
        before_state,
        after_state,
        created_at
      ) VALUES (
        NEW.flag_key,
        'update',
        'system',
        to_jsonb(OLD),
        to_jsonb(NEW),
        now()
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_audit_feature_flag_changes ON leo_feature_flags;
CREATE TRIGGER trg_audit_feature_flag_changes
  AFTER INSERT OR UPDATE ON leo_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_feature_flag_changes();

-- =====================================================
-- PART 5: Create function to increment row_version
-- =====================================================

-- Function to automatically increment row_version on updates
CREATE OR REPLACE FUNCTION fn_increment_feature_flag_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.row_version = OLD.row_version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_increment_feature_flag_version ON leo_feature_flags;
CREATE TRIGGER trg_increment_feature_flag_version
  BEFORE UPDATE ON leo_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION fn_increment_feature_flag_version();

-- =====================================================
-- PART 6: Backfill existing flags with default values
-- =====================================================

-- Existing flags already have defaults via ALTER TABLE
-- This ensures consistency
UPDATE leo_feature_flags
SET
  lifecycle_state = COALESCE(lifecycle_state,
    CASE
      WHEN is_enabled THEN 'enabled'::feature_flag_lifecycle_state
      ELSE 'disabled'::feature_flag_lifecycle_state
    END
  ),
  risk_tier = COALESCE(risk_tier, 'medium'::feature_flag_risk_tier),
  is_temporary = COALESCE(is_temporary, false),
  row_version = COALESCE(row_version, 1)
WHERE lifecycle_state IS NULL
   OR risk_tier IS NULL
   OR is_temporary IS NULL
   OR row_version IS NULL;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify schema changes
DO $$
DECLARE
  v_flag_count int;
  v_audit_exists boolean;
  v_approval_exists boolean;
BEGIN
  -- Check that governance columns exist
  SELECT COUNT(*) INTO v_flag_count
  FROM information_schema.columns
  WHERE table_name = 'leo_feature_flags'
    AND column_name IN ('lifecycle_state', 'risk_tier', 'owner_type', 'owner_id', 'is_temporary', 'expiry_at', 'row_version');

  IF v_flag_count < 7 THEN
    RAISE EXCEPTION 'Missing governance columns in leo_feature_flags';
  END IF;

  -- Check that audit table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'leo_feature_flag_audit'
  ) INTO v_audit_exists;

  IF NOT v_audit_exists THEN
    RAISE EXCEPTION 'leo_feature_flag_audit table not created';
  END IF;

  -- Check that approvals table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'leo_feature_flag_approvals'
  ) INTO v_approval_exists;

  IF NOT v_approval_exists THEN
    RAISE EXCEPTION 'leo_feature_flag_approvals table not created';
  END IF;

  RAISE NOTICE 'Migration verification successful';
  RAISE NOTICE '- Governance columns added: %', v_flag_count;
  RAISE NOTICE '- Audit table created: %', v_audit_exists;
  RAISE NOTICE '- Approvals table created: %', v_approval_exists;
END $$;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
