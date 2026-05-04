-- SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001 — PR1 of 5 (index, separate file)
-- Adds partial index on (category, status) for triage CLI list queries.
--
-- MUST be a separate file because CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction (PostgreSQL constraint). The previous migration applies all
-- ALTER TABLE statements transactionally; this one runs outside that boundary.
--
-- Validated by DATABASE sub-agent run b2db4da3:
--   - Partial filter scopes to ~17% of feedback rows (excludes 671/843 ci_failure rows)
--   - Column ordering (category, status) matches the triage CLI predicate
--     category='corrective_finding' AND status='new'
--   - CONCURRENTLY required for prod safety (no exclusive lock)
--
-- Apply: supabase db query --linked --file database/migrations/20260504_feedback_corrective_index.sql
-- Rollback: DROP INDEX IF EXISTS idx_feedback_category_status;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feedback_category_status
  ON feedback (category, status)
  WHERE category IN ('corrective_finding', 'harness_backlog');

COMMENT ON INDEX idx_feedback_category_status IS
  'Triage-list optimization. Partial filter excludes high-volume ci_failure / auto_capture rows. Used by corrective-triage CLI list and harness-backlog queries.';
