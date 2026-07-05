-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001
-- Adversarial-review follow-up: the application-level "already ran this period" check in
-- runRotation() is a check-then-insert with no DB-level guard, so two concurrent invocations
-- could both pass the check and insert duplicate rotation runs for the same month. This unique
-- index converts that race from a silent duplicate into a loud, catchable constraint violation --
-- matching this SD's own "loud by construction" philosophy.

-- date_trunc(text, timestamptz) is STABLE (session-timezone dependent), not IMMUTABLE, so it
-- cannot be used directly in an index expression. `ran_at AT TIME ZONE 'UTC'` converts to a
-- fixed-zone plain timestamp first, which IS immutable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_matrix_rotation_runs_month
  ON coverage_matrix_rotation_runs (date_trunc('month', ran_at AT TIME ZONE 'UTC'));
