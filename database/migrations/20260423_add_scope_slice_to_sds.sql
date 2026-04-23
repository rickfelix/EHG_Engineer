-- Migration: Add scope_slice JSONB column to strategic_directives_v2
-- SD: SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A
-- Purpose: Child SDs can declare the slice of their parent orchestrator arch plan
--          they claim, so scope-completion-gate filters parent deliverables before scoring.
-- Shape:   {stages?: number[], deliverable_globs?: string[]}
-- Safety:  Nullable, no default — metadata-only ADD COLUMN on PostgreSQL 11+ (confirmed by DATABASE sub-agent).
--          Wrapped with lock_timeout=5s to avoid queuing behind long-running reads on pooler connections.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS scope_slice JSONB;

COMMENT ON COLUMN strategic_directives_v2.scope_slice IS
  'Optional slice of parent orchestrator scope this child claims. Shape: {stages?: number[], deliverable_globs?: string[]}. When set, scope-completion-gate filters parent arch plan deliverables through this slice before scoring. When NULL, gate scores the full parent deliverable set (pre-SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A behavior).';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (commented — uncomment and run to revert):
--
-- BEGIN;
-- SET LOCAL lock_timeout = '5s';
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS scope_slice;
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────
