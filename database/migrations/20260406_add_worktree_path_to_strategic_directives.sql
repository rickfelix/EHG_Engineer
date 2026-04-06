-- SD-LEO-INFRA-FAIL-CLOSED-CLAIM-001 (US-003)
-- Add worktree_path column to strategic_directives_v2 for claim-validity-gate enforcement.
-- Populated by scripts/sd-start.js, consumed by lib/claim-validity-gate.js.

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS worktree_path TEXT NULL;

COMMENT ON COLUMN strategic_directives_v2.worktree_path IS
'Absolute path to the SD''s git worktree. Populated by sd-start.js on claim acquisition. Consumed by lib/claim-validity-gate.js to enforce that handoff and related operations run from inside the worktree. Added by SD-LEO-INFRA-FAIL-CLOSED-CLAIM-001.';

-- Rollback:
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS worktree_path;
