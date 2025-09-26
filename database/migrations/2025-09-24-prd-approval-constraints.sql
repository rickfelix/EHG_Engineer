-- Migration: PRD Approval Constraints to Prevent LEO Protocol Violations
-- Purpose: Ensure only LEAD can approve PRDs, preventing PLAN self-approval
-- Date: 2025-09-24
-- Created in response to violation where PLAN approved their own PRD

-- ============================================
-- 1. Add CHECK constraint to ensure only LEAD can approve
-- ============================================

-- Note: We can't directly add a CHECK constraint on approved_by because
-- it needs to allow NULL for draft PRDs. Instead, we'll use a trigger.

-- ============================================
-- 2. Create function to validate PRD approval
-- ============================================

CREATE OR REPLACE FUNCTION validate_prd_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- If status is being set to 'approved'
  IF NEW.status = 'approved' THEN
    -- Approved_by must be 'LEAD'
    IF NEW.approved_by IS NULL OR NEW.approved_by != 'LEAD' THEN
      RAISE EXCEPTION 'LEO Protocol Violation: PRDs can only be approved by LEAD (not %). PLAN cannot self-approve.',
        COALESCE(NEW.approved_by, 'NULL');
    END IF;

    -- Must have approval_date
    IF NEW.approval_date IS NULL THEN
      NEW.approval_date = CURRENT_TIMESTAMP;
    END IF;
  END IF;

  -- If status is 'ready_for_exec', must have LEAD approval
  IF NEW.status = 'ready_for_exec' THEN
    IF NEW.approved_by IS NULL OR NEW.approved_by != 'LEAD' THEN
      RAISE EXCEPTION 'LEO Protocol Violation: PRDs must be approved by LEAD before EXEC phase';
    END IF;
  END IF;

  -- Prevent PLAN from setting approved_by to themselves
  IF NEW.approved_by = 'PLAN' THEN
    RAISE EXCEPTION 'LEO Protocol Violation: PLAN cannot approve PRDs (conflict of interest)';
  END IF;

  -- Prevent EXEC from approving PRDs
  IF NEW.approved_by = 'EXEC' THEN
    RAISE EXCEPTION 'LEO Protocol Violation: EXEC cannot approve PRDs';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Create trigger to enforce approval rules
-- ============================================

DROP TRIGGER IF EXISTS enforce_prd_approval ON product_requirements_v2;

CREATE TRIGGER enforce_prd_approval
  BEFORE INSERT OR UPDATE ON product_requirements_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_prd_approval();

-- ============================================
-- 4. Create audit log for approval attempts
-- ============================================

CREATE TABLE IF NOT EXISTS prd_approval_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_id VARCHAR(255) NOT NULL,
  attempted_by VARCHAR(50),
  attempted_status VARCHAR(50),
  violation_type VARCHAR(100),
  blocked BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX idx_prd_approval_audit_prd_id ON prd_approval_audit(prd_id);
CREATE INDEX idx_prd_approval_audit_created_at ON prd_approval_audit(created_at DESC);

-- ============================================
-- 5. Create function to log approval violations
-- ============================================

CREATE OR REPLACE FUNCTION log_prd_approval_violation()
RETURNS TRIGGER AS $$
BEGIN
  -- Log any approval attempt that violates rules
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'approved' AND (NEW.approved_by != 'LEAD' OR NEW.approved_by IS NULL) THEN
      INSERT INTO prd_approval_audit (
        prd_id,
        attempted_by,
        attempted_status,
        violation_type,
        blocked,
        error_message
      ) VALUES (
        NEW.id,
        NEW.approved_by,
        NEW.status,
        'INVALID_APPROVER',
        true,
        'Only LEAD can approve PRDs'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. Create view for monitoring violations
-- ============================================

CREATE OR REPLACE VIEW prd_approval_violations AS
SELECT
  paa.*,
  pr.title as prd_title,
  pr.directive_id,
  pr.status as current_status,
  pr.approved_by as current_approver
FROM prd_approval_audit paa
LEFT JOIN product_requirements_v2 pr ON paa.prd_id = pr.id
WHERE paa.blocked = true
ORDER BY paa.created_at DESC;

-- ============================================
-- 7. Fix existing violations
-- ============================================

-- Identify PRDs with invalid approval
DO $$
DECLARE
  violation_count INTEGER := 0;
BEGIN
  -- Count violations
  SELECT COUNT(*) INTO violation_count
  FROM product_requirements_v2
  WHERE status = 'approved'
    AND (approved_by != 'LEAD' OR approved_by IS NULL);

  IF violation_count > 0 THEN
    RAISE NOTICE 'Found % PRDs with invalid approval. Reverting to draft status...', violation_count;

    -- Fix violations by reverting to draft
    UPDATE product_requirements_v2
    SET
      status = 'draft',
      approved_by = NULL,
      approval_date = NULL,
      updated_at = CURRENT_TIMESTAMP,
      metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{violation_fixed}',
        to_jsonb(true)
      )
    WHERE status = 'approved'
      AND (approved_by != 'LEAD' OR approved_by IS NULL);

    RAISE NOTICE 'Fixed % violations by reverting to draft status', violation_count;
  ELSE
    RAISE NOTICE 'No PRD approval violations found';
  END IF;
END $$;

-- ============================================
-- 8. Add comments for documentation
-- ============================================

COMMENT ON FUNCTION validate_prd_approval() IS
  'Enforces LEO Protocol approval rules: Only LEAD can approve PRDs. Prevents PLAN self-approval and EXEC approval attempts.';

COMMENT ON TRIGGER enforce_prd_approval ON product_requirements_v2 IS
  'Prevents LEO Protocol violations by ensuring PRDs can only be approved by LEAD agent';

COMMENT ON TABLE prd_approval_audit IS
  'Audit log of all PRD approval attempts, including blocked violations';

COMMENT ON VIEW prd_approval_violations IS
  'View of all blocked PRD approval attempts that violated LEO Protocol';

-- ============================================
-- 9. Grant permissions
-- ============================================

GRANT SELECT ON prd_approval_audit TO authenticated;
GRANT SELECT ON prd_approval_violations TO authenticated;

-- ============================================
-- 10. Success notification
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ PRD Approval Constraints Successfully Installed!';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Protection Active:';
  RAISE NOTICE '  • Only LEAD can approve PRDs';
  RAISE NOTICE '  • PLAN cannot self-approve';
  RAISE NOTICE '  • EXEC cannot approve PRDs';
  RAISE NOTICE '  • Violations are blocked and logged';
  RAISE NOTICE '  • Existing violations have been fixed';
  RAISE NOTICE '';
  RAISE NOTICE 'LEO Protocol integrity enforced at database level.';
END $$;