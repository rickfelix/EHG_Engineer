-- Fable-suitability map — durable, gradeable ranked codebase-region suitability scores.
-- SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-A (child A of the Fable-suitability orchestrator).
-- Chairman-directed pre-Fable infrastructure; provenance = Solomon Mode-B activation prep.
--
-- WHY: the Fable-suitability map ranks codebase regions for Fable's (expensive) attention
-- on Impact x Opportunity x Reasoning-Depth. This is its DURABLE, GRADEABLE store. The
-- table is HISTORY-PRESERVING by design: every (region_key, repo, score_version) is a
-- distinct row so Solomon's section-11 advice-outcome ledger can later JOIN a prediction
-- made at score_version=N against an outcome that lands LATER. A latest-only key would
-- destroy the historical prediction row and make the map ungradeable — defeating its whole
-- justification (RISK 3b2d91f1 R1). Within a version, a re-score UPDATES in place (LIVING:
-- last_scored_at / refloated_at / recurrence_weight climb); a version bump INSERTS.
--
-- GOVERNANCE — WHO IS STOPPED BY WHAT (mirrors the ratified STAGED chairman-gated pattern):
--   * anon / ordinary authenticated users are stopped at the RLS LAYER: no write policy
--     exists for them and SELECT is chairman-only (fn_is_chairman()) — suitability rankings
--     are a GOVERNED-decision-audience artifact, not open data.
--   * service_role BYPASSES RLS (rolbypassrls=true): the machine writer (child B via
--     lib/fable-suitability/map-writer.mjs) and Solomon's reader (child C) both run as
--     service_role, so the barrier for THAT principal is APPLICATION-CODE DISCIPLINE — the
--     writer only ever upserts this table, and region_key is CHECK-constrained so a
--     drifting/path-derived key is rejected at write time (keeps the ledger JOIN stable).
--   * a human CHAIRMAN (fn_is_chairman()) may read; no principal gets a permissive
--     FOR SELECT USING(true) that would leak the rankings.
--
-- STAGED — NOT YET APPROVED FOR APPLY. requires-chairman-apply. Do NOT auto-apply on merge;
-- no @approved-by. APPLY RUNBOOK (chairman ceremony): (1) chairman approval; (2) apply via
-- the standard path with an @approved-by attestation commit; (3) run
-- `npm run schema:snapshot:lint` and commit the regenerated snapshot in the same PR;
-- (4) verify with a real select. The writer's typed CEREMONY_PENDING (42P01) flips to live
-- automatically on apply — no code change. NOTE: this table yields zero value until child C
-- wires the Solomon Mode-B read — the orchestrator must not silently drop child C.

CREATE TABLE IF NOT EXISTS fable_suitability_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Falsifiability keys (RISK R1). region_key is a DETERMINISTIC function of stable inputs
  -- only — canonical repo id + a declared coarse structural boundary, normalized (lowercase,
  -- forward-slash). The CHECK rejects a path-derived / backslash / absolute-path key so
  -- child B physically cannot emit a key that would fork the section-11 ledger JOIN.
  region_key TEXT NOT NULL
    CONSTRAINT fable_region_key_shape
    CHECK (region_key ~ '^[a-z0-9][a-z0-9._/-]{0,199}$' AND region_key !~ '(\\|:| |//|^/|/$)'),
  repo TEXT NOT NULL,
  score_version INTEGER NOT NULL,

  duty_cluster TEXT NOT NULL
    CHECK (duty_cluster IN ('architecture-refactor', 'dedup', 'flaky-RCA', 'harness-depth')),

  -- Axes 1-5. composite = product (populated by child B).
  axis_impact INTEGER CHECK (axis_impact BETWEEN 1 AND 5),
  axis_opportunity INTEGER CHECK (axis_opportunity BETWEEN 1 AND 5),
  axis_reasoning_depth INTEGER CHECK (axis_reasoning_depth BETWEEN 1 AND 5),
  composite_score INTEGER,

  -- Auditability: per-axis inputs + rationale (documented shape, app-validated before insert).
  evidence JSONB NOT NULL,

  -- LIVING re-float signals.
  recurrence_weight NUMERIC,
  trigger_reason TEXT,
  status TEXT NOT NULL DEFAULT 'scored',

  last_scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refloated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- HISTORY-PRESERVING: one row per region per repo per score_version. A version bump
  -- appends (preserving the prediction the ledger will grade); same version upserts in place.
  CONSTRAINT fable_suitability_map_versioned UNIQUE (region_key, repo, score_version)
);

CREATE INDEX IF NOT EXISTS idx_fable_suitability_cluster ON fable_suitability_map (duty_cluster, composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_fable_suitability_region ON fable_suitability_map (region_key, repo, score_version DESC);

-- Latest-per-region read surface (child C / reader consume this, not the raw history).
CREATE OR REPLACE VIEW v_fable_suitability_map_current AS
SELECT DISTINCT ON (region_key, repo) *
FROM fable_suitability_map
ORDER BY region_key, repo, score_version DESC;

COMMENT ON COLUMN fable_suitability_map.region_key IS
  'Deterministic region identity: canonical repo id + declared coarse structural boundary, normalized (lowercase/forward-slash). CHECK-enforced so child B cannot emit a drifting/path-derived key — stability is required for the section-11 advice-outcome ledger JOIN.';
COMMENT ON COLUMN fable_suitability_map.evidence IS
  'Documented shape (validated pre-insert): { evidence_schema_version, axes:{impact/opportunity/reasoning_depth:{score,inputs,rationale}}, recurrence:{weight,count,source_ids}, scored_by, computed_at }. issue_patterns referenced by ID; no embedded file/log dumps. evidence_schema_version is distinct from the row score_version.';

-- RLS + policy in the SAME migration (SPINE-001-B recurrence guard).
ALTER TABLE fable_suitability_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fable_suitability_chairman_select ON fable_suitability_map;
CREATE POLICY fable_suitability_chairman_select ON fable_suitability_map
  FOR SELECT USING (fn_is_chairman());

-- Deliberately NO write policy and NO permissive USING(true): only service_role
-- (rolbypassrls) writes/reads for the machine pipeline; humans read chairman-only.

COMMENT ON TABLE fable_suitability_map IS
  'History-preserving Fable-suitability rankings (SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-A). One row per (region_key, repo, score_version); v_fable_suitability_map_current exposes latest-per-region. Gradeable by Solomon section-11 via the (region_key, score_version) keys.';
