-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001
-- Durable coverage-matrix artifact: surface x checker(s) claiming coverage x last-verified-at.
-- Surface list is mechanically regenerated (see scripts/coverage-matrix-regenerate.mjs) so a
-- new surface auto-appears as checker_ids=[] instead of being silently unwatched.

CREATE TABLE IF NOT EXISTS coverage_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surface_class TEXT NOT NULL CHECK (surface_class IN (
    'db_table', 'message_lane', 'application', 'work_item_type',
    'institutional_memory', 'periodic_process', 'external_channel'
  )),
  surface_key TEXT NOT NULL,
  checker_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'unchecked' CHECK (status IN (
    'unchecked', 'covered', 'stale', 'pending_dependency'
  )),
  is_active BOOLEAN NOT NULL DEFAULT true,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (surface_class, surface_key)
);

CREATE INDEX IF NOT EXISTS idx_coverage_matrix_status ON coverage_matrix (status);
CREATE INDEX IF NOT EXISTS idx_coverage_matrix_surface_class ON coverage_matrix (surface_class);

COMMENT ON TABLE coverage_matrix IS
  'SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001: mechanically-regenerated surface x checker registry. checker_ids=[] on a row is the intended, loud-by-construction default for an unwatched surface -- never treat an empty array as an error condition.';

-- Tracks the last time the monthly referent-audit rotation ran, so a cold start (no prior row)
-- treats the entire current coverage_matrix as the delta rather than crashing.
CREATE TABLE IF NOT EXISTS coverage_matrix_rotation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delta_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_verified_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  coverage_question_feedback_ids JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE coverage_matrix_rotation_runs IS
  'SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001: audit trail of monthly referent-audit rotation runs, one row per run.';
