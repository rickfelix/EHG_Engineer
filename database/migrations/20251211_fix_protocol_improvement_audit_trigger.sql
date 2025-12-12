-- Migration: Fix protocol_improvement_audit trigger column references
-- Date: 2025-12-11
-- Issue: Trigger references non-existent columns (summary, approved_by, created_by, source_sd_id)
-- Root Cause: Trigger was created with column names that don't match protocol_improvement_queue schema
-- Fix: Update to use correct column names (description, reviewed_by, source_retro_id)
-- Evidence: RETRO sub-agent fails with "record 'new' has no field 'summary'"

-- =====================================================================================
-- FIX: Update trigger_protocol_improvement_audit to use correct column names
-- =====================================================================================

CREATE OR REPLACE FUNCTION trigger_protocol_improvement_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log status changes
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM log_protocol_improvement_action(
      CASE NEW.status
        WHEN 'APPROVED' THEN 'APPROVED'
        WHEN 'REJECTED' THEN 'REJECTED'
        WHEN 'APPLIED' THEN 'APPLIED'
        WHEN 'EXPIRED' THEN 'EXPIRED'
        ELSE 'CREATED'
      END,
      NEW.id,
      NEW.description,  -- FIX: was NEW.summary (doesn't exist)
      NEW.target_table,
      COALESCE(NEW.reviewed_by, 'system'),  -- FIX: was NEW.approved_by/NEW.created_by (don't exist)
      CASE
        WHEN NEW.reviewed_by IS NOT NULL THEN 'user'
        ELSE 'system'
      END,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'updated_at', NOW()
      )
    );
  END IF;

  -- Log new improvements
  IF TG_OP = 'INSERT' THEN
    PERFORM log_protocol_improvement_action(
      'CREATED',
      NEW.id,
      NEW.description,  -- FIX: was NEW.summary (doesn't exist)
      NEW.target_table,
      'system',  -- FIX: was COALESCE(NEW.created_by, 'system') - created_by doesn't exist
      'system',
      jsonb_build_object(
        'source_retro_id', NEW.source_retro_id,  -- FIX: was NEW.source_sd_id (doesn't exist)
        'improvement_type', NEW.improvement_type,
        'created_at', NOW()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================================
-- Grant necessary permissions
-- =====================================================================================
GRANT EXECUTE ON FUNCTION trigger_protocol_improvement_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_protocol_improvement_audit() TO service_role;

-- =====================================================================================
-- Verification comment
-- =====================================================================================
COMMENT ON FUNCTION trigger_protocol_improvement_audit() IS
'Audit trigger for protocol_improvement_queue table.
Fixed 2025-12-11: Updated column references to match actual table schema:
- summary → description
- approved_by → reviewed_by
- created_by → (removed, column does not exist)
- source_sd_id → source_retro_id';
