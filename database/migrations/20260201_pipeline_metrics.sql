-- Migration: Pipeline Metrics for Self-Improvement Observability
-- SD: SD-LEO-SELF-IMPROVE-001M (Phase 7b: Control-Plane + Observability)
-- Purpose: Track MTTI (Mean Time To Intervention) and MTTR (Mean Time To Remediate)

-- ============================================================================
-- 1. PIPELINE_METRICS TABLE
-- Time-series metrics for self-improvement pipeline health
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  labels JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient time-range queries
CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_name_time
  ON pipeline_metrics(metric_name, recorded_at DESC);

-- Index for label-based filtering
CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_labels
  ON pipeline_metrics USING GIN(labels);

-- Retention policy: Keep metrics for 30 days
COMMENT ON TABLE pipeline_metrics IS
  'Time-series metrics for self-improvement pipeline. Retention: 30 days.';

-- ============================================================================
-- 2. RLS POLICIES
-- ============================================================================

ALTER TABLE pipeline_metrics ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access to pipeline_metrics"
  ON pipeline_metrics
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated users can read metrics
CREATE POLICY "Authenticated users can read pipeline_metrics"
  ON pipeline_metrics
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- 3. MTTI/MTTR TRACKING FUNCTIONS
-- ============================================================================

-- Function to record MTTI when proposal is created from feedback
CREATE OR REPLACE FUNCTION record_mtti_on_proposal_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_feedback_created_at TIMESTAMPTZ;
  v_mtti_hours NUMERIC;
BEGIN
  -- Only track if proposal has feedback origin
  IF NEW.feedback_id IS NOT NULL THEN
    -- Get feedback creation time
    SELECT created_at INTO v_feedback_created_at
    FROM feedback
    WHERE id = NEW.feedback_id;

    IF v_feedback_created_at IS NOT NULL THEN
      -- Calculate MTTI in hours
      v_mtti_hours := EXTRACT(EPOCH FROM (NEW.created_at - v_feedback_created_at)) / 3600;

      -- Record metric
      INSERT INTO pipeline_metrics (metric_name, metric_value, labels)
      VALUES (
        'mtti_hours',
        v_mtti_hours,
        jsonb_build_object(
          'proposal_id', NEW.id,
          'feedback_id', NEW.feedback_id,
          'source', 'proposal_creation'
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record MTTR when SD completes (with proposal origin)
CREATE OR REPLACE FUNCTION record_mttr_on_sd_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_proposal_created_at TIMESTAMPTZ;
  v_proposal_id UUID;
  v_mttr_hours NUMERIC;
BEGIN
  -- Only track when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Check if SD has proposal origin
    IF NEW.metadata->>'proposal_id' IS NOT NULL THEN
      v_proposal_id := (NEW.metadata->>'proposal_id')::UUID;

      -- Get proposal creation time
      SELECT created_at INTO v_proposal_created_at
      FROM leo_proposals
      WHERE id = v_proposal_id;

      IF v_proposal_created_at IS NOT NULL THEN
        -- Calculate MTTR in hours
        v_mttr_hours := EXTRACT(EPOCH FROM (NOW() - v_proposal_created_at)) / 3600;

        -- Record metric
        INSERT INTO pipeline_metrics (metric_name, metric_value, labels)
        VALUES (
          'mttr_hours',
          v_mttr_hours,
          jsonb_build_object(
            'sd_id', NEW.id,
            'proposal_id', v_proposal_id,
            'source', 'sd_completion'
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

-- Trigger for MTTI tracking on proposal creation
DROP TRIGGER IF EXISTS trg_record_mtti_on_proposal ON leo_proposals;
CREATE TRIGGER trg_record_mtti_on_proposal
  AFTER INSERT ON leo_proposals
  FOR EACH ROW
  EXECUTE FUNCTION record_mtti_on_proposal_creation();

-- Trigger for MTTR tracking on SD completion
DROP TRIGGER IF EXISTS trg_record_mttr_on_sd_completion ON strategic_directives_v2;
CREATE TRIGGER trg_record_mttr_on_sd_completion
  AFTER UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION record_mttr_on_sd_completion();

-- ============================================================================
-- 5. PIPELINE HEALTH VIEW
-- Aggregated metrics for /status command
-- ============================================================================

CREATE OR REPLACE VIEW v_pipeline_health AS
SELECT
  -- MTTI metrics
  (SELECT COALESCE(AVG(metric_value), 0)
   FROM pipeline_metrics
   WHERE metric_name = 'mtti_hours'
   AND recorded_at > NOW() - INTERVAL '7 days') AS avg_mtti_hours_7d,

  (SELECT COALESCE(AVG(metric_value), 0)
   FROM pipeline_metrics
   WHERE metric_name = 'mtti_hours'
   AND recorded_at > NOW() - INTERVAL '30 days') AS avg_mtti_hours_30d,

  -- MTTR metrics
  (SELECT COALESCE(AVG(metric_value), 0)
   FROM pipeline_metrics
   WHERE metric_name = 'mttr_hours'
   AND recorded_at > NOW() - INTERVAL '7 days') AS avg_mttr_hours_7d,

  (SELECT COALESCE(AVG(metric_value), 0)
   FROM pipeline_metrics
   WHERE metric_name = 'mttr_hours'
   AND recorded_at > NOW() - INTERVAL '30 days') AS avg_mttr_hours_30d,

  -- Pipeline activity
  (SELECT COUNT(*)
   FROM leo_proposals
   WHERE created_at > NOW() - INTERVAL '24 hours') AS proposals_24h,

  (SELECT COUNT(*)
   FROM strategic_directives_v2
   WHERE completion_date > NOW() - INTERVAL '24 hours') AS sds_completed_24h,

  (SELECT COUNT(*)
   FROM feedback
   WHERE created_at > NOW() - INTERVAL '24 hours') AS feedback_24h,

  -- Queue depths
  (SELECT COUNT(*)
   FROM leo_proposals
   WHERE status IN ('draft', 'submitted', 'pending_vetting')) AS pending_proposals,

  (SELECT COUNT(*)
   FROM strategic_directives_v2
   WHERE status = 'in_progress') AS active_sds,

  -- Last activity
  (SELECT MAX(recorded_at)
   FROM pipeline_metrics) AS last_metric_recorded,

  NOW() AS snapshot_at;

-- ============================================================================
-- 6. RETENTION CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_pipeline_metrics()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM pipeline_metrics
  WHERE recorded_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Log cleanup
  INSERT INTO pipeline_metrics (metric_name, metric_value, labels)
  VALUES (
    'metrics_cleanup',
    v_deleted,
    jsonb_build_object('retention_days', 30)
  );

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. VERIFICATION QUERIES
-- ============================================================================

-- Verify table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_metrics') THEN
    RAISE NOTICE '✅ pipeline_metrics table created successfully';
  ELSE
    RAISE EXCEPTION '❌ pipeline_metrics table creation failed';
  END IF;
END $$;

-- Verify view exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'v_pipeline_health') THEN
    RAISE NOTICE '✅ v_pipeline_health view created successfully';
  ELSE
    RAISE EXCEPTION '❌ v_pipeline_health view creation failed';
  END IF;
END $$;
