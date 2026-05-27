-- SD-LEO-INFRA-UNIFY-VENTURE-NON-001 / Child A.1
-- Add 'draft_seed' to eva_vision_documents.status CHECK constraint.
-- draft_seed = archived stub L2 docs from the Stage-1 venture-seed writer
-- (preserved for future /brainstorm --seed-from=draft_seed pre-loading per
-- SD scope Child D).
-- Idempotent: re-run via DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.

ALTER TABLE eva_vision_documents DROP CONSTRAINT IF EXISTS eva_vision_documents_status_check;
ALTER TABLE eva_vision_documents ADD CONSTRAINT eva_vision_documents_status_check
  CHECK (status IN ('draft', 'active', 'superseded', 'archived', 'draft_seed'));

COMMENT ON CONSTRAINT eva_vision_documents_status_check ON eva_vision_documents IS
  'Status values for L0/L1/L2 vision docs. draft_seed (added 2026-05-27 per SD-LEO-INFRA-UNIFY-VENTURE-NON-001 Child A.1): archived stub L2 docs from Stage-1 venture-seed writer, preserved for future /brainstorm --seed-from=draft_seed pre-loading.';
