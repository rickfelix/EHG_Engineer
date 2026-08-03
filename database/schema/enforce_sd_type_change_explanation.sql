-- ============================================================================
-- SUPERSEDED — DO NOT APPLY. This file is kept for history only.
-- SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001 (FR-2)
--
-- THE LIVE DEFINITION IS:
--   database/migrations/20260202_sd_type_change_governance_fixed.sql
--
-- Both files define enforce_sd_type_change_explanation() and
-- trg_enforce_sd_type_change_explanation, but they DIFFER in one way that
-- matters: the migration writes sd_type mutations to audit_log with old_value
-- and new_value populated (:115-129, :158, :188); THIS FILE WRITES NOTHING.
-- Those writes are 172 of the 388 rows in the whole table that carry an
-- old_value — 0.167% of audit_log is the entire mutation record, and this
-- function's live twin produces a large share of it.
--
-- So applying this file would CREATE OR REPLACE the live function with a
-- non-auditing one, silently ending sd_type mutation auditing. Nothing would
-- detect it: no test asserts the trigger writes, and the rows simply stop
-- appearing. database/schema/ is not scanned by the pending-migration checker
-- (it reads database/migrations, database/manual-updates, supabase/migrations),
-- so this file is applied only by a human copying it — which is exactly the
-- path a guard has to cover.
--
-- The guard below makes that mistake loud instead of silent. Remove it only
-- together with the duplicate definition itself.
-- ============================================================================
DO $supersede$
BEGIN
  RAISE EXCEPTION USING
    MESSAGE = 'SUPERSEDED FILE — applying this would disable sd_type audit logging.',
    DETAIL  = 'enforce_sd_type_change_explanation() is defined here WITHOUT the audit_log writes '
              || 'that the live version has. Replacing the live function would silently stop '
              || 'recording sd_type mutations (old_value/new_value), and nothing detects the loss.',
    HINT    = 'Apply database/migrations/20260202_sd_type_change_governance_fixed.sql instead.';
END
$supersede$;

-- ---------------------------------------------------------------------------
-- Historical content below this line. Unreachable: the guard above aborts.
-- ---------------------------------------------------------------------------

-- Enforce SD Type Change Explanation Requirement
-- Created: 2025-12-30
-- Purpose: Requires governance_metadata.type_reclassification when sd_type is changed
--
-- This trigger ensures audit trail and accountability for SD classification changes.

-- Function to validate sd_type changes have explanation
CREATE OR REPLACE FUNCTION enforce_sd_type_change_explanation()
RETURNS TRIGGER AS $$
DECLARE
  reclassification_info JSONB;
  has_reason BOOLEAN;
  has_from BOOLEAN;
  has_to BOOLEAN;
BEGIN
  -- Only check if sd_type is actually changing
  IF OLD.sd_type IS DISTINCT FROM NEW.sd_type THEN

    -- Extract reclassification info from governance_metadata
    reclassification_info := NEW.governance_metadata->'type_reclassification';

    -- Validate required fields exist
    has_reason := reclassification_info->>'reason' IS NOT NULL
                  AND length(reclassification_info->>'reason') > 10;
    has_from := reclassification_info->>'from' IS NOT NULL;
    has_to := reclassification_info->>'to' IS NOT NULL;

    -- Check that the from/to values match the actual change
    IF has_from AND has_to THEN
      IF reclassification_info->>'from' != OLD.sd_type OR
         reclassification_info->>'to' != NEW.sd_type THEN
        RAISE EXCEPTION 'SD_TYPE_CHANGE_MISMATCH: governance_metadata.type_reclassification.from/to must match actual sd_type change. Expected from=% to=%, got from=% to=%',
          OLD.sd_type, NEW.sd_type,
          reclassification_info->>'from', reclassification_info->>'to';
      END IF;
    END IF;

    -- Require all fields
    IF NOT (has_reason AND has_from AND has_to) THEN
      RAISE EXCEPTION E'SD_TYPE_CHANGE_REQUIRES_EXPLANATION: Cannot change sd_type from "%" to "%" without explanation.\n\nRequired: Set governance_metadata.type_reclassification with:\n  - from: "%" (original type)\n  - to: "%" (new type)\n  - reason: "<explanation with >10 characters>"\n  - date: "<ISO date>"\n  - approved_by: "<approver>"\n\nExample:\nUPDATE strategic_directives_v2 \nSET sd_type = ''%'',\n    governance_metadata = jsonb_set(\n      COALESCE(governance_metadata, ''{}''::jsonb),\n      ''{type_reclassification}'',\n      ''{"from": "%", "to": "%", "reason": "Actual work was infrastructure/tooling, not customer-facing features", "date": "%", "approved_by": "Chairman"}''::jsonb\n    )\nWHERE id = ''<SD-ID>'';',
        OLD.sd_type, NEW.sd_type,
        OLD.sd_type, NEW.sd_type,
        NEW.sd_type, OLD.sd_type, NEW.sd_type,
        to_char(CURRENT_DATE, 'YYYY-MM-DD');
    END IF;

    -- Auto-populate date if not provided
    IF reclassification_info->>'date' IS NULL THEN
      NEW.governance_metadata := jsonb_set(
        NEW.governance_metadata,
        '{type_reclassification,date}',
        to_jsonb(to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on strategic_directives_v2
DROP TRIGGER IF EXISTS trg_enforce_sd_type_change_explanation ON strategic_directives_v2;

CREATE TRIGGER trg_enforce_sd_type_change_explanation
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_sd_type_change_explanation();

-- Add comment for documentation
COMMENT ON FUNCTION enforce_sd_type_change_explanation() IS
  'Enforces that any change to sd_type must include an explanation in governance_metadata.type_reclassification. Required fields: from, to, reason (>10 chars). Auto-populates date if missing.';

COMMENT ON TRIGGER trg_enforce_sd_type_change_explanation ON strategic_directives_v2 IS
  'Governance trigger: Blocks sd_type changes without proper explanation in governance_metadata.';
