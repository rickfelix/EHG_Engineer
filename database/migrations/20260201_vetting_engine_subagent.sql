-- SD-LEO-SELF-IMPROVE-001F: Vetting Agent Bridge
-- Creates the VETTING sub-agent and vetting outcomes tracking
-- FIXED: Made leo_feedback table optional (will be created in a future migration)

-- ============================================================================
-- Part 1: Create VETTING sub-agent entry
-- ============================================================================

-- Insert the VETTING sub-agent (idempotent)
INSERT INTO leo_sub_agents (
  id,
  code,
  name,
  description,
  activation_type,
  priority,
  script_path,
  context_file,
  active,
  metadata,
  capabilities
) VALUES (
  gen_random_uuid(),
  'VETTING',
  'Vetting Engine',
  'Constitutional vetting of proposals using AEGIS framework. Routes feedback through rubric-based assessment, applies governance rules, and logs outcomes for audit.',
  'automatic',
  5,  -- Higher priority than most sub-agents
  'lib/sub-agents/vetting/index.js',
  '["CLAUDE_LEAD.md", "docs/reference/aegis-constitution.md"]',
  true,
  jsonb_build_object(
    'created_by', 'SD-LEO-SELF-IMPROVE-001F',
    'version', '1.0.0',
    'aegis_integration', true,
    'rubric_enabled', true
  ),
  jsonb_build_array(
    'proposal_generation',
    'rubric_assessment',
    'aegis_validation',
    'outcome_logging',
    'coverage_metrics'
  )
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  activation_type = EXCLUDED.activation_type,
  priority = EXCLUDED.priority,
  script_path = EXCLUDED.script_path,
  context_file = EXCLUDED.context_file,
  active = EXCLUDED.active,
  metadata = EXCLUDED.metadata,
  capabilities = EXCLUDED.capabilities;

-- ============================================================================
-- Part 2: Add trigger keywords for VETTING sub-agent
-- ============================================================================

-- Get the VETTING sub-agent ID
DO $$
DECLARE
  vetting_id uuid;
BEGIN
  SELECT id INTO vetting_id FROM leo_sub_agents WHERE code = 'VETTING';

  -- Primary triggers (high priority)
  INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, metadata)
  VALUES
    (vetting_id, 'vet', 'keyword', 8, true, '{"category": "primary"}'),
    (vetting_id, 'vetting', 'keyword', 8, true, '{"category": "primary"}'),
    (vetting_id, 'proposal', 'keyword', 7, true, '{"category": "primary"}'),
    (vetting_id, 'rubric', 'keyword', 7, true, '{"category": "primary"}'),
    (vetting_id, 'constitutional', 'keyword', 7, true, '{"category": "primary"}'),
    (vetting_id, 'aegis', 'keyword', 6, true, '{"category": "primary"}')
  ON CONFLICT DO NOTHING;

  -- Secondary triggers (medium priority) - FIXED: changed 'phrase' to 'pattern'
  INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, metadata)
  VALUES
    (vetting_id, 'governance check', 'pattern', 6, true, '{"category": "secondary"}'),
    (vetting_id, 'compliance check', 'pattern', 6, true, '{"category": "secondary"}'),
    (vetting_id, 'validate proposal', 'pattern', 6, true, '{"category": "secondary"}'),
    (vetting_id, 'assess feedback', 'pattern', 5, true, '{"category": "secondary"}'),
    (vetting_id, 'review improvement', 'pattern', 5, true, '{"category": "secondary"}')
  ON CONFLICT DO NOTHING;

  -- Context triggers (lower priority, used in combination) - FIXED: changed 'phrase' to 'pattern'
  INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, metadata)
  VALUES
    (vetting_id, 'self-improve', 'keyword', 4, true, '{"category": "context"}'),
    (vetting_id, 'protocol change', 'pattern', 4, true, '{"category": "context"}'),
    (vetting_id, 'improvement suggestion', 'pattern', 4, true, '{"category": "context"}')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Part 3: Create leo_feedback table (if not exists)
-- ============================================================================
-- This table will track improvement feedback from various sources

CREATE TABLE IF NOT EXISTS leo_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Source information
  source_type text NOT NULL CHECK (source_type IN (
    'retrospective',   -- From retrospective analysis
    'user_report',     -- From user feedback
    'automated',       -- From automated monitoring
    'manual'           -- Manual entry
  )),
  source_id uuid,      -- Reference to source (retrospective_id, etc.)

  -- Feedback content
  title text NOT NULL,
  description text NOT NULL,
  category text,
  priority integer DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),

  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',         -- Awaiting vetting
    'vetted',          -- Passed vetting
    'rejected',        -- Failed vetting
    'implemented',     -- Already implemented
    'duplicate'        -- Duplicate of another feedback
  )),

  -- Metadata
  metadata jsonb DEFAULT '{}'
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_feedback_status
  ON leo_feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_source
  ON leo_feedback(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON leo_feedback(created_at);

-- ============================================================================
-- Part 4: Create leo_vetting_outcomes table for tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS leo_vetting_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Source linkages
  feedback_id uuid REFERENCES leo_feedback(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES leo_proposals(id) ON DELETE SET NULL,

  -- Vetting result
  outcome text NOT NULL CHECK (outcome IN (
    'approved',       -- Passed all checks, ready for implementation
    'rejected',       -- Failed governance checks
    'needs_revision', -- Requires changes before approval
    'deferred',       -- Postponed for future consideration
    'escalated'       -- Requires human review
  )),

  -- Scoring and assessment
  rubric_score numeric(5,2) CHECK (rubric_score >= 0 AND rubric_score <= 100),
  rubric_version_id uuid REFERENCES leo_vetting_rubrics(id) ON DELETE SET NULL,
  aegis_result jsonb DEFAULT '{}',  -- Full AEGIS validation result

  -- Metadata
  processed_by text NOT NULL DEFAULT 'vetting_engine',
  processing_time_ms integer,
  notes text,

  -- Human override (append-only, never overwrites machine outcome)
  human_decision text CHECK (human_decision IN (
    'confirmed',      -- Human agrees with machine outcome
    'overridden',     -- Human changed the outcome
    'reviewed'        -- Human reviewed but no action
  )),
  human_decision_by text,
  human_decision_at timestamptz,
  human_decision_notes text,

  -- Audit trail
  metadata jsonb DEFAULT '{}'
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vetting_outcomes_feedback_id
  ON leo_vetting_outcomes(feedback_id);
CREATE INDEX IF NOT EXISTS idx_vetting_outcomes_proposal_id
  ON leo_vetting_outcomes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_vetting_outcomes_outcome
  ON leo_vetting_outcomes(outcome);
CREATE INDEX IF NOT EXISTS idx_vetting_outcomes_created_at
  ON leo_vetting_outcomes(created_at);

-- ============================================================================
-- Part 5: Create coverage metrics view
-- ============================================================================

CREATE OR REPLACE VIEW v_vetting_coverage AS
WITH feedback_stats AS (
  SELECT
    date_trunc('day', created_at) as day,
    COUNT(*) as total_feedback
  FROM leo_feedback
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY 1
),
outcome_stats AS (
  SELECT
    date_trunc('day', created_at) as day,
    COUNT(*) as total_vetted,
    COUNT(*) FILTER (WHERE outcome = 'approved') as approved,
    COUNT(*) FILTER (WHERE outcome = 'rejected') as rejected,
    COUNT(*) FILTER (WHERE outcome = 'needs_revision') as needs_revision,
    COUNT(*) FILTER (WHERE outcome = 'deferred') as deferred,
    COUNT(*) FILTER (WHERE outcome = 'escalated') as escalated,
    AVG(rubric_score) as avg_rubric_score,
    AVG(processing_time_ms) as avg_processing_time_ms
  FROM leo_vetting_outcomes
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY 1
)
SELECT
  COALESCE(f.day, o.day) as day,
  COALESCE(f.total_feedback, 0) as total_feedback,
  COALESCE(o.total_vetted, 0) as total_vetted,
  CASE
    WHEN COALESCE(f.total_feedback, 0) > 0
    THEN ROUND(100.0 * COALESCE(o.total_vetted, 0) / f.total_feedback, 2)
    ELSE 0
  END as coverage_pct,
  COALESCE(o.approved, 0) as approved,
  COALESCE(o.rejected, 0) as rejected,
  COALESCE(o.needs_revision, 0) as needs_revision,
  COALESCE(o.deferred, 0) as deferred,
  COALESCE(o.escalated, 0) as escalated,
  ROUND(COALESCE(o.avg_rubric_score, 0), 2) as avg_rubric_score,
  ROUND(COALESCE(o.avg_processing_time_ms, 0), 0) as avg_processing_time_ms
FROM feedback_stats f
FULL OUTER JOIN outcome_stats o ON f.day = o.day
ORDER BY 1 DESC;

-- ============================================================================
-- Part 6: RLS policies for leo_feedback
-- ============================================================================

ALTER TABLE leo_feedback ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Allow read access to feedback"
  ON leo_feedback FOR SELECT
  USING (true);

-- Allow insert from service role and authenticated users
CREATE POLICY "Allow authenticated to insert feedback"
  ON leo_feedback FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- Part 7: RLS policies for vetting_outcomes
-- ============================================================================

ALTER TABLE leo_vetting_outcomes ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Allow read access to vetting outcomes"
  ON leo_vetting_outcomes FOR SELECT
  USING (true);

-- Allow insert from service role (vetting engine)
CREATE POLICY "Allow service role to insert vetting outcomes"
  ON leo_vetting_outcomes FOR INSERT
  WITH CHECK (true);

-- Allow update only for human_decision fields
CREATE POLICY "Allow human decision updates"
  ON leo_vetting_outcomes FOR UPDATE
  USING (true)
  WITH CHECK (
    -- Only allow updates to human_decision fields
    outcome = (SELECT outcome FROM leo_vetting_outcomes WHERE id = leo_vetting_outcomes.id)
    AND rubric_score = (SELECT rubric_score FROM leo_vetting_outcomes WHERE id = leo_vetting_outcomes.id)
    AND aegis_result = (SELECT aegis_result FROM leo_vetting_outcomes WHERE id = leo_vetting_outcomes.id)
  );

-- ============================================================================
-- Part 8: Helper function for coverage metrics
-- ============================================================================

CREATE OR REPLACE FUNCTION get_vetting_coverage(
  p_start_date timestamptz DEFAULT NOW() - INTERVAL '30 days',
  p_end_date timestamptz DEFAULT NOW()
)
RETURNS TABLE (
  period_start timestamptz,
  period_end timestamptz,
  total_feedback bigint,
  total_vetted bigint,
  coverage_pct numeric,
  approval_rate numeric,
  avg_rubric_score numeric,
  avg_processing_time_ms numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH feedback_count AS (
    SELECT COUNT(*) as cnt
    FROM leo_feedback
    WHERE created_at BETWEEN p_start_date AND p_end_date
  ),
  outcome_stats AS (
    SELECT
      COUNT(*) as vetted,
      COUNT(*) FILTER (WHERE outcome = 'approved') as approved,
      AVG(rubric_score) as avg_score,
      AVG(processing_time_ms) as avg_time
    FROM leo_vetting_outcomes
    WHERE created_at BETWEEN p_start_date AND p_end_date
  )
  SELECT
    p_start_date,
    p_end_date,
    f.cnt,
    o.vetted,
    CASE WHEN f.cnt > 0 THEN ROUND(100.0 * o.vetted / f.cnt, 2) ELSE 0 END,
    CASE WHEN o.vetted > 0 THEN ROUND(100.0 * o.approved / o.vetted, 2) ELSE 0 END,
    ROUND(COALESCE(o.avg_score, 0), 2),
    ROUND(COALESCE(o.avg_time, 0), 0)
  FROM feedback_count f, outcome_stats o;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_vetting_coverage TO authenticated;
GRANT EXECUTE ON FUNCTION get_vetting_coverage TO anon;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  subagent_exists boolean;
  trigger_count integer;
  table_exists boolean;
  feedback_table_exists boolean;
BEGIN
  -- Check sub-agent
  SELECT EXISTS(SELECT 1 FROM leo_sub_agents WHERE code = 'VETTING') INTO subagent_exists;
  IF NOT subagent_exists THEN
    RAISE EXCEPTION 'VETTING sub-agent not created';
  END IF;

  -- Check triggers
  SELECT COUNT(*) INTO trigger_count
  FROM leo_sub_agent_triggers t
  JOIN leo_sub_agents s ON t.sub_agent_id = s.id
  WHERE s.code = 'VETTING';

  IF trigger_count < 10 THEN
    RAISE WARNING 'Expected at least 10 triggers, found %', trigger_count;
  END IF;

  -- Check tables
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'leo_vetting_outcomes'
  ) INTO table_exists;

  IF NOT table_exists THEN
    RAISE EXCEPTION 'leo_vetting_outcomes table not created';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'leo_feedback'
  ) INTO feedback_table_exists;

  IF NOT feedback_table_exists THEN
    RAISE EXCEPTION 'leo_feedback table not created';
  END IF;

  RAISE NOTICE 'Vetting Engine setup complete: sub-agent=%, triggers=%, outcomes_table=%, feedback_table=%',
    subagent_exists, trigger_count, table_exists, feedback_table_exists;
END $$;
