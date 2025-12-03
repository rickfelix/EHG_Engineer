-- SD Orchestration Baseline System
-- Purpose: Track execution baselines, burn rate, and forecasting for Strategic Directives
-- Created: 2025-12-03
-- Part of: LEAD role SD prioritization and orchestration

-- ============================================================================
-- TABLE: sd_execution_baselines
-- Purpose: Point-in-time snapshots of execution plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_execution_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_name TEXT NOT NULL,                          -- e.g., "2025-12-03 Initial Plan"
  baseline_type TEXT DEFAULT 'standard',                -- 'initial', 'rebaseline', 'emergency'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'system',
  approved_by TEXT,                                     -- LEAD approval required for rebaseline
  approved_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT FALSE,                      -- Only one active baseline at a time
  superseded_by UUID REFERENCES sd_execution_baselines(id),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb                    -- Extensible metadata
);

-- Ensure only one active baseline
CREATE UNIQUE INDEX IF NOT EXISTS idx_sd_baselines_single_active
ON sd_execution_baselines (is_active) WHERE is_active = TRUE;

-- ============================================================================
-- TABLE: sd_baseline_items
-- Purpose: Individual SD assignments within a baseline
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_baseline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id UUID NOT NULL REFERENCES sd_execution_baselines(id) ON DELETE CASCADE,
  sd_id TEXT NOT NULL,                                  -- References strategic_directives_v2.legacy_id
  sequence_rank INTEGER NOT NULL,                       -- Execution order within baseline
  track TEXT CHECK (track IN ('A', 'B', 'C', 'STANDALONE', 'DEFERRED')),
  track_name TEXT,                                      -- Human-readable: 'Infrastructure/Safety', 'Feature/Stages', etc.
  estimated_effort_hours NUMERIC(6,2),                  -- Planning estimate
  planned_start_date DATE,
  planned_end_date DATE,
  dependencies_snapshot JSONB,                          -- Snapshot of deps at baseline time
  dependency_health_score NUMERIC(3,2),                 -- 0.00 to 1.00 readiness score
  is_ready BOOLEAN DEFAULT FALSE,                       -- All deps satisfied at baseline time
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(baseline_id, sd_id),
  UNIQUE(baseline_id, sequence_rank)
);

CREATE INDEX IF NOT EXISTS idx_baseline_items_baseline ON sd_baseline_items(baseline_id);
CREATE INDEX IF NOT EXISTS idx_baseline_items_sd ON sd_baseline_items(sd_id);
CREATE INDEX IF NOT EXISTS idx_baseline_items_track ON sd_baseline_items(track);

-- ============================================================================
-- TABLE: sd_execution_actuals
-- Purpose: Track actual execution metrics for variance analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_execution_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT NOT NULL,                                  -- References strategic_directives_v2.legacy_id
  baseline_id UUID REFERENCES sd_execution_baselines(id),
  actual_start_date TIMESTAMPTZ,
  actual_end_date TIMESTAMPTZ,
  actual_effort_hours NUMERIC(6,2),                     -- Derived from sessions or manual entry
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked', 'deferred')),
  blockers JSONB DEFAULT '[]'::jsonb,                   -- Array of blocker descriptions
  blocked_by_sd_ids TEXT[],                             -- Which SDs are blocking this one
  blocked_since TIMESTAMPTZ,                            -- When blocking started
  completion_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(sd_id, baseline_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_actuals_sd ON sd_execution_actuals(sd_id);
CREATE INDEX IF NOT EXISTS idx_execution_actuals_status ON sd_execution_actuals(status);
CREATE INDEX IF NOT EXISTS idx_execution_actuals_baseline ON sd_execution_actuals(baseline_id);

-- ============================================================================
-- TABLE: sd_session_activity
-- Purpose: Track SD activity per session for continuity detection
-- Extends existing working_sd_sessions with more granular tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_session_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,                             -- Unique session identifier
  sd_id TEXT NOT NULL,                                  -- Which SD was worked on
  activity_type TEXT CHECK (activity_type IN ('started', 'continued', 'completed', 'blocked', 'switched')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  commits_made INTEGER DEFAULT 0,                       -- Git commits referencing this SD
  files_modified INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_activity_session ON sd_session_activity(session_id);
CREATE INDEX IF NOT EXISTS idx_session_activity_sd ON sd_session_activity(sd_id);
CREATE INDEX IF NOT EXISTS idx_session_activity_started ON sd_session_activity(started_at DESC);

-- ============================================================================
-- TABLE: sd_burn_rate_snapshots
-- Purpose: Periodic snapshots of velocity metrics for trending
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_burn_rate_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id UUID REFERENCES sd_execution_baselines(id),
  snapshot_date DATE NOT NULL,
  total_sds_planned INTEGER,
  total_sds_completed INTEGER,
  total_effort_planned_hours NUMERIC(8,2),
  total_effort_actual_hours NUMERIC(8,2),
  planned_velocity NUMERIC(6,2),                        -- SDs per week planned
  actual_velocity NUMERIC(6,2),                         -- SDs per week actual
  burn_rate_ratio NUMERIC(4,2),                         -- actual/planned (1.0 = on track)
  forecasted_completion_date DATE,
  confidence_level TEXT CHECK (confidence_level IN ('high', 'medium', 'low')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(baseline_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_burn_rate_baseline ON sd_burn_rate_snapshots(baseline_id);
CREATE INDEX IF NOT EXISTS idx_burn_rate_date ON sd_burn_rate_snapshots(snapshot_date DESC);

-- ============================================================================
-- TABLE: sd_conflict_matrix
-- Purpose: Track potential conflicts between SDs for parallel execution safety
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_conflict_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id_a TEXT NOT NULL,
  sd_id_b TEXT NOT NULL,
  conflict_type TEXT CHECK (conflict_type IN ('file_overlap', 'component_overlap', 'dependency_conflict', 'resource_conflict')),
  conflict_severity TEXT CHECK (conflict_severity IN ('blocking', 'warning', 'info')),
  affected_areas JSONB,                                 -- Files, components, or resources in conflict
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  UNIQUE(sd_id_a, sd_id_b, conflict_type),
  CHECK (sd_id_a < sd_id_b)                             -- Ensure consistent ordering
);

CREATE INDEX IF NOT EXISTS idx_conflict_matrix_sd_a ON sd_conflict_matrix(sd_id_a);
CREATE INDEX IF NOT EXISTS idx_conflict_matrix_sd_b ON sd_conflict_matrix(sd_id_b);

-- ============================================================================
-- VIEW: v_sd_execution_status
-- Purpose: Combined view of baseline plan vs actuals
-- ============================================================================
CREATE OR REPLACE VIEW v_sd_execution_status AS
SELECT
  bi.sd_id,
  sd.title,
  sd.priority,
  sd.status as sd_status,
  sd.progress_percentage,
  b.baseline_name,
  b.is_active as is_active_baseline,
  bi.sequence_rank,
  bi.track,
  bi.track_name,
  bi.estimated_effort_hours,
  bi.planned_start_date,
  bi.planned_end_date,
  bi.is_ready,
  bi.dependency_health_score,
  ea.actual_start_date,
  ea.actual_end_date,
  ea.actual_effort_hours,
  ea.status as execution_status,
  ea.blockers,
  ea.blocked_by_sd_ids,
  -- Variance calculations
  CASE
    WHEN bi.estimated_effort_hours > 0 AND ea.actual_effort_hours IS NOT NULL
    THEN ROUND((ea.actual_effort_hours / bi.estimated_effort_hours) * 100, 1)
    ELSE NULL
  END as effort_variance_pct,
  CASE
    WHEN bi.planned_end_date IS NOT NULL AND ea.actual_end_date IS NOT NULL
    THEN ea.actual_end_date::date - bi.planned_end_date
    ELSE NULL
  END as schedule_variance_days
FROM sd_baseline_items bi
JOIN sd_execution_baselines b ON bi.baseline_id = b.id
LEFT JOIN strategic_directives_v2 sd ON bi.sd_id = sd.legacy_id
LEFT JOIN sd_execution_actuals ea ON bi.sd_id = ea.sd_id AND bi.baseline_id = ea.baseline_id
ORDER BY bi.sequence_rank;

-- ============================================================================
-- VIEW: v_sd_next_candidates
-- Purpose: Identify which SDs are ready to work on next
-- ============================================================================
CREATE OR REPLACE VIEW v_sd_next_candidates AS
WITH active_baseline AS (
  SELECT id FROM sd_execution_baselines WHERE is_active = TRUE LIMIT 1
),
dependency_status AS (
  SELECT
    bi.sd_id,
    bi.sequence_rank,
    bi.track,
    bi.dependencies_snapshot,
    COALESCE(
      (
        SELECT COUNT(*) = 0
        FROM jsonb_array_elements_text(bi.dependencies_snapshot) dep
        WHERE NOT EXISTS (
          SELECT 1 FROM strategic_directives_v2 sd2
          WHERE sd2.legacy_id = split_part(dep, ' ', 1)
          AND sd2.status = 'completed'
        )
      ),
      TRUE
    ) as deps_satisfied
  FROM sd_baseline_items bi
  WHERE bi.baseline_id = (SELECT id FROM active_baseline)
)
SELECT
  bi.sd_id,
  sd.title,
  sd.priority,
  sd.status,
  sd.progress_percentage,
  bi.sequence_rank,
  bi.track,
  bi.track_name,
  bi.estimated_effort_hours,
  bi.dependency_health_score,
  ds.deps_satisfied,
  ea.status as execution_status,
  sd.is_working_on,
  CASE
    WHEN sd.is_working_on = TRUE THEN 1
    WHEN ea.status = 'in_progress' THEN 2
    WHEN ds.deps_satisfied AND sd.status IN ('draft', 'active') THEN 3
    WHEN sd.progress_percentage > 0 AND sd.progress_percentage < 100 THEN 4
    ELSE 5
  END as readiness_priority
FROM sd_baseline_items bi
JOIN strategic_directives_v2 sd ON bi.sd_id = sd.legacy_id
JOIN dependency_status ds ON bi.sd_id = ds.sd_id
LEFT JOIN sd_execution_actuals ea ON bi.sd_id = ea.sd_id
  AND ea.baseline_id = (SELECT id FROM active_baseline)
WHERE bi.baseline_id = (SELECT id FROM active_baseline)
  AND sd.status NOT IN ('completed', 'cancelled')
ORDER BY readiness_priority, bi.sequence_rank;

-- ============================================================================
-- FUNCTION: calculate_dependency_health_score
-- Purpose: Calculate readiness score based on dependency completion
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_dependency_health_score(p_sd_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_deps JSONB;
  v_total_deps INTEGER;
  v_completed_deps INTEGER;
  v_score NUMERIC;
BEGIN
  -- Get dependencies for this SD
  SELECT dependencies INTO v_deps
  FROM strategic_directives_v2
  WHERE legacy_id = p_sd_id;

  IF v_deps IS NULL OR jsonb_array_length(v_deps) = 0 THEN
    RETURN 1.00; -- No dependencies = fully ready
  END IF;

  v_total_deps := jsonb_array_length(v_deps);

  -- Count completed dependencies
  SELECT COUNT(*) INTO v_completed_deps
  FROM jsonb_array_elements_text(v_deps) dep
  WHERE EXISTS (
    SELECT 1 FROM strategic_directives_v2 sd2
    WHERE sd2.legacy_id = split_part(dep, ' ', 1)
    AND sd2.status = 'completed'
  );

  v_score := ROUND(v_completed_deps::NUMERIC / v_total_deps::NUMERIC, 2);

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: update_execution_actuals_timestamp
-- Purpose: Auto-update updated_at on changes
-- ============================================================================
CREATE OR REPLACE FUNCTION update_execution_actuals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_execution_actuals_updated
  BEFORE UPDATE ON sd_execution_actuals
  FOR EACH ROW
  EXECUTE FUNCTION update_execution_actuals_timestamp();

-- ============================================================================
-- RLS POLICIES
-- Enable RLS but allow anon access (internal tooling)
-- ============================================================================
ALTER TABLE sd_execution_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_baseline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_execution_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_session_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_burn_rate_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_conflict_matrix ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon (internal tooling)
CREATE POLICY "Allow all for anon" ON sd_execution_baselines FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON sd_baseline_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON sd_execution_actuals FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON sd_session_activity FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON sd_burn_rate_snapshots FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON sd_conflict_matrix FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE sd_execution_baselines IS 'Point-in-time snapshots of SD execution plans. Only one baseline can be active at a time. Rebaseline requires LEAD approval.';
COMMENT ON TABLE sd_baseline_items IS 'Individual SD assignments within a baseline, including track assignment, sequence, and effort estimates.';
COMMENT ON TABLE sd_execution_actuals IS 'Actual execution metrics for variance analysis against baseline plan.';
COMMENT ON TABLE sd_session_activity IS 'Granular tracking of SD work per session for continuity detection.';
COMMENT ON TABLE sd_burn_rate_snapshots IS 'Periodic snapshots of velocity metrics for trending and forecasting.';
COMMENT ON TABLE sd_conflict_matrix IS 'Potential conflicts between SDs that should not run in parallel.';
COMMENT ON VIEW v_sd_execution_status IS 'Combined view of baseline plan vs actual execution with variance calculations.';
COMMENT ON VIEW v_sd_next_candidates IS 'SDs ready to work on next, ordered by readiness and sequence rank.';
