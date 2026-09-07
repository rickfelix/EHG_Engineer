-- SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B FR-1 — rollback for
-- 20260906_strategic_directives_worktree_commit_pin.sql.
--
-- @approved-by: <PENDING -- rollback carries the same ceremony as the UP migration>
--
-- Safe: worktree_commit_pin is additive-only and no other migration or code path depends on its
-- existence -- scripts/sd-start.js's writer catches the resulting error and logs a warning,
-- non-fatally (same fail-soft pattern as lib/fleet/qf-metadata-merge.mjs's 42703 handling for
-- quick_fixes.metadata). worktree_path itself is entirely untouched by this rollback.

ALTER TABLE strategic_directives_v2 DROP CONSTRAINT IF EXISTS ck_strategic_directives_worktree_commit_pin_provenance;
ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS worktree_commit_pin;
