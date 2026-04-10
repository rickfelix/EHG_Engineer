-- Add C1 vertical-slice advisory columns to strategic_directives_v2
-- These are non-breaking additions (DEFAULT false NOT NULL means existing rows are valid immediately)
ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS non_vertical BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS non_vertical_justification TEXT;

-- Partial index for fast LEAD review of flagged children per parent
CREATE INDEX IF NOT EXISTS idx_sds_non_vertical
  ON strategic_directives_v2(parent_sd_id)
  WHERE non_vertical = true;

-- Add helpful column comments
COMMENT ON COLUMN strategic_directives_v2.non_vertical IS
  'C1 advisory flag: TRUE if this SD is a horizontal-layer slice (DB-only, logic-only, or UI-only) rather than an end-to-end vertical slice. Set by create-orchestrator-from-plan.js heuristic. LEAD reviews flagged children at LEAD_APPROVAL.';

COMMENT ON COLUMN strategic_directives_v2.non_vertical_justification IS
  'C1: LEAD or chairman rationale when approving a non-vertical child SD (e.g., "Schema migration must precede backend logic, intentional split"). Required when non_vertical=true and SD reaches PLAN-TO-EXEC handoff.';

-- Rollback (in case of failure):
-- DROP INDEX IF EXISTS idx_sds_non_vertical;
-- ALTER TABLE strategic_directives_v2
--   DROP COLUMN IF EXISTS non_vertical_justification,
--   DROP COLUMN IF EXISTS non_vertical;
