-- Cross-SD Backlog Utilization System
-- Enables PLAN agents to utilize and complete backlog items from other SDs
-- Prevents duplicate work and enables intelligent cross-SD collaboration

-- Drop existing objects if they exist
DROP TABLE IF EXISTS backlog_item_completion CASCADE;
DROP TABLE IF EXISTS cross_sd_utilization CASCADE;
DROP VIEW IF EXISTS v_backlog_completion_status CASCADE;
DROP VIEW IF EXISTS v_cross_sd_utilization_matrix CASCADE;

-- Table to track backlog item completion across all SDs
CREATE TABLE backlog_item_completion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backlog_id TEXT NOT NULL,
  source_sd_id TEXT NOT NULL,              -- Original SD that owned the item
  completed_by_sd_id TEXT NOT NULL,        -- SD that actually completed it
  completed_by_prd_id TEXT,                -- PRD that implemented it
  completion_type TEXT CHECK (completion_type IN (
    'DIRECT',           -- Completed as originally intended
    'SHARED',          -- Completed as shared component
    'PARTIAL',         -- Partially completed
    'REFERENCE',       -- Referenced/reused existing implementation
    'SUPERSEDED'       -- Replaced by better implementation
  )),
  completion_status TEXT CHECK (completion_status IN (
    'IN_PROGRESS',
    'COMPLETED',
    'VERIFIED',
    'FAILED'
  )) DEFAULT 'IN_PROGRESS',
  completion_date TIMESTAMP DEFAULT NOW(),

  -- Implementation details
  implementation_details JSONB DEFAULT '{}'::jsonb,
  code_location TEXT[],                    -- File paths where implemented
  test_coverage_pct INTEGER,
  documentation_url TEXT,

  -- Verification
  verified BOOLEAN DEFAULT FALSE,
  verified_by TEXT,
  verified_at TIMESTAMP,
  verification_notes TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT DEFAULT 'PLAN',

  -- Ensure each backlog item is only marked complete once per SD
  CONSTRAINT unique_backlog_completion UNIQUE (backlog_id, completed_by_sd_id)
);

-- Table to track cross-SD utilization requests and approvals
CREATE TABLE cross_sd_utilization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request details
  requesting_sd_id TEXT NOT NULL,          -- SD wanting to use the item
  requesting_prd_id TEXT,                   -- PRD making the request
  source_sd_id TEXT NOT NULL,              -- SD that owns the item
  backlog_id TEXT NOT NULL,

  -- Utilization type
  utilization_type TEXT CHECK (utilization_type IN (
    'REFERENCE',        -- Just reference existing work
    'IMPLEMENT',        -- Implement on behalf of source SD
    'ENHANCE',          -- Build on top of existing
    'DUPLICATE',        -- Duplicate implementation (requires justification)
    'MERGE'            -- Merge duplicate items
  )) NOT NULL,

  -- Approval workflow
  approval_status TEXT CHECK (approval_status IN (
    'PENDING',
    'AUTO_APPROVED',    -- Automatically approved based on rules
    'APPROVED',         -- Manually approved
    'DENIED',           -- Request denied
    'EXPIRED'          -- Request expired
  )) DEFAULT 'PENDING',

  approved_by TEXT,
  approved_at TIMESTAMP,
  denial_reason TEXT,

  -- Request metadata
  justification TEXT,
  estimated_benefit TEXT,                  -- Why this benefits both SDs
  risk_assessment TEXT CHECK (risk_assessment IN ('LOW', 'MEDIUM', 'HIGH')),
  request_metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  requested_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),

  -- Prevent duplicate requests
  CONSTRAINT unique_utilization_request UNIQUE (requesting_sd_id, source_sd_id, backlog_id)
);

-- Add completion tracking columns to sd_backlog_map
ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS completion_status TEXT DEFAULT 'NOT_STARTED'
  CHECK (completion_status IN (
    'NOT_STARTED',
    'IN_PROGRESS',
    'COMPLETED',
    'UTILIZED_ELSEWHERE',
    'DEFERRED',
    'CANCELLED'
  )),
ADD COLUMN IF NOT EXISTS completed_by_sd TEXT,
ADD COLUMN IF NOT EXISTS completed_by_prd TEXT,
ADD COLUMN IF NOT EXISTS completion_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS completion_reference TEXT,  -- Link to implementation
ADD COLUMN IF NOT EXISTS utilized_from_sd TEXT,      -- If item was taken from another SD
ADD COLUMN IF NOT EXISTS completion_notes TEXT;

-- View to show completion status across all backlog items
CREATE VIEW v_backlog_completion_status AS
WITH completion_summary AS (
  SELECT
    b.backlog_id,
    b.sd_id,
    b.backlog_title,
    b.stage_number,
    b.priority,
    b.completion_status,
    c.completed_by_sd_id,
    c.completed_by_prd_id,
    c.completion_type,
    c.completion_date,
    c.verified,
    s.sd_key,
    s.title as sd_title
  FROM sd_backlog_map b
  LEFT JOIN backlog_item_completion c ON c.backlog_id = b.backlog_id
  LEFT JOIN strategic_directives_v2 s ON s.id = b.sd_id
)
SELECT
  backlog_id,
  backlog_title,
  sd_key,
  sd_title,
  stage_number,
  priority,
  COALESCE(completion_status, 'NOT_STARTED') as status,
  completed_by_sd_id,
  completed_by_prd_id,
  completion_type,
  completion_date,
  verified,
  CASE
    WHEN completed_by_sd_id IS NOT NULL AND completed_by_sd_id != sd_id THEN 'CROSS_SD'
    WHEN completed_by_sd_id = sd_id THEN 'SAME_SD'
    ELSE 'PENDING'
  END as utilization_type
FROM completion_summary
ORDER BY
  CASE
    WHEN completion_status = 'COMPLETED' THEN 1
    WHEN completion_status = 'IN_PROGRESS' THEN 2
    ELSE 3
  END,
  stage_number,
  priority;

-- View to show cross-SD utilization patterns
CREATE VIEW v_cross_sd_utilization_matrix AS
WITH utilization_stats AS (
  SELECT
    source_sd_id,
    requesting_sd_id,
    COUNT(*) as total_requests,
    COUNT(CASE WHEN approval_status IN ('APPROVED', 'AUTO_APPROVED') THEN 1 END) as approved_requests,
    COUNT(CASE WHEN utilization_type = 'REFERENCE' THEN 1 END) as reference_count,
    COUNT(CASE WHEN utilization_type = 'IMPLEMENT' THEN 1 END) as implement_count,
    COUNT(CASE WHEN utilization_type = 'ENHANCE' THEN 1 END) as enhance_count
  FROM cross_sd_utilization
  GROUP BY source_sd_id, requesting_sd_id
)
SELECT
  s1.sd_key as source_sd,
  s2.sd_key as requesting_sd,
  u.total_requests,
  u.approved_requests,
  u.reference_count,
  u.implement_count,
  u.enhance_count,
  ROUND((u.approved_requests::NUMERIC / NULLIF(u.total_requests, 0)) * 100, 1) as approval_rate
FROM utilization_stats u
JOIN strategic_directives_v2 s1 ON s1.id = u.source_sd_id
JOIN strategic_directives_v2 s2 ON s2.id = u.requesting_sd_id
ORDER BY u.total_requests DESC;

-- Function to check if a backlog item can be utilized
CREATE OR REPLACE FUNCTION can_utilize_backlog_item(
  p_requesting_sd TEXT,
  p_source_sd TEXT,
  p_backlog_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_completion_status TEXT;
  v_existing_request RECORD;
  v_can_utilize BOOLEAN := TRUE;
  v_reason TEXT;
BEGIN
  -- Check if item is already completed
  SELECT completion_status INTO v_completion_status
  FROM sd_backlog_map
  WHERE backlog_id = p_backlog_id AND sd_id = p_source_sd;

  IF v_completion_status = 'COMPLETED' THEN
    v_can_utilize := TRUE;
    v_reason := 'Item already completed - can reference';
  ELSIF v_completion_status = 'IN_PROGRESS' THEN
    v_can_utilize := FALSE;
    v_reason := 'Item currently in progress by source SD';
  END IF;

  -- Check for existing utilization requests
  SELECT * INTO v_existing_request
  FROM cross_sd_utilization
  WHERE requesting_sd_id = p_requesting_sd
    AND source_sd_id = p_source_sd
    AND backlog_id = p_backlog_id
    AND approval_status IN ('PENDING', 'APPROVED', 'AUTO_APPROVED');

  IF v_existing_request.id IS NOT NULL THEN
    v_can_utilize := FALSE;
    v_reason := 'Existing ' || v_existing_request.approval_status || ' request';
  END IF;

  v_result := jsonb_build_object(
    'can_utilize', v_can_utilize,
    'reason', v_reason,
    'completion_status', v_completion_status,
    'existing_request_id', v_existing_request.id
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to request cross-SD utilization
CREATE OR REPLACE FUNCTION request_cross_sd_utilization(
  p_requesting_sd TEXT,
  p_source_sd TEXT,
  p_backlog_id TEXT,
  p_utilization_type TEXT,
  p_justification TEXT
) RETURNS UUID AS $$
DECLARE
  v_request_id UUID;
  v_risk_assessment TEXT;
  v_auto_approve BOOLEAN := FALSE;
BEGIN
  -- Check if utilization is allowed
  IF NOT (can_utilize_backlog_item(p_requesting_sd, p_source_sd, p_backlog_id)->>'can_utilize')::BOOLEAN THEN
    RAISE EXCEPTION 'Cannot utilize this backlog item: %',
      can_utilize_backlog_item(p_requesting_sd, p_source_sd, p_backlog_id)->>'reason';
  END IF;

  -- Determine risk assessment
  v_risk_assessment := CASE
    WHEN p_utilization_type = 'REFERENCE' THEN 'LOW'
    WHEN p_utilization_type = 'ENHANCE' THEN 'MEDIUM'
    ELSE 'HIGH'
  END;

  -- Auto-approve low-risk references
  IF p_utilization_type = 'REFERENCE' THEN
    v_auto_approve := TRUE;
  END IF;

  -- Create utilization request
  INSERT INTO cross_sd_utilization (
    requesting_sd_id,
    source_sd_id,
    backlog_id,
    utilization_type,
    justification,
    risk_assessment,
    approval_status,
    approved_by,
    approved_at
  ) VALUES (
    p_requesting_sd,
    p_source_sd,
    p_backlog_id,
    p_utilization_type,
    p_justification,
    v_risk_assessment,
    CASE WHEN v_auto_approve THEN 'AUTO_APPROVED' ELSE 'PENDING' END,
    CASE WHEN v_auto_approve THEN 'SYSTEM' ELSE NULL END,
    CASE WHEN v_auto_approve THEN NOW() ELSE NULL END
  ) RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark backlog item as completed
CREATE OR REPLACE FUNCTION mark_backlog_item_completed(
  p_backlog_id TEXT,
  p_source_sd TEXT,
  p_completed_by_sd TEXT,
  p_completed_by_prd TEXT,
  p_completion_type TEXT,
  p_implementation_details JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_completion_id UUID;
BEGIN
  -- Insert completion record
  INSERT INTO backlog_item_completion (
    backlog_id,
    source_sd_id,
    completed_by_sd_id,
    completed_by_prd_id,
    completion_type,
    completion_status,
    implementation_details
  ) VALUES (
    p_backlog_id,
    p_source_sd,
    p_completed_by_sd,
    p_completed_by_prd,
    p_completion_type,
    'COMPLETED',
    p_implementation_details
  ) RETURNING id INTO v_completion_id;

  -- Update backlog item status
  UPDATE sd_backlog_map
  SET
    completion_status = CASE
      WHEN sd_id = p_completed_by_sd THEN 'COMPLETED'
      ELSE 'UTILIZED_ELSEWHERE'
    END,
    completed_by_sd = p_completed_by_sd,
    completed_by_prd = p_completed_by_prd,
    completion_date = NOW()
  WHERE backlog_id = p_backlog_id
    AND sd_id IN (p_source_sd, p_completed_by_sd);

  RETURN v_completion_id;
END;
$$ LANGUAGE plpgsql;

-- Function to find duplicate or similar backlog items
CREATE OR REPLACE FUNCTION find_similar_backlog_items(
  p_backlog_id TEXT,
  p_similarity_threshold NUMERIC DEFAULT 50
) RETURNS TABLE (
  backlog_id TEXT,
  sd_id TEXT,
  backlog_title TEXT,
  similarity_score NUMERIC,
  completion_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH target_item AS (
    SELECT backlog_title, item_description
    FROM sd_backlog_map
    WHERE backlog_id = p_backlog_id
    LIMIT 1
  )
  SELECT
    b.backlog_id,
    b.sd_id,
    b.backlog_title,
    calculate_keyword_similarity(
      t.backlog_title || ' ' || COALESCE(t.item_description, ''),
      b.backlog_title || ' ' || COALESCE(b.item_description, '')
    ) as similarity_score,
    b.completion_status
  FROM sd_backlog_map b, target_item t
  WHERE b.backlog_id != p_backlog_id
    AND calculate_keyword_similarity(
      t.backlog_title || ' ' || COALESCE(t.item_description, ''),
      b.backlog_title || ' ' || COALESCE(b.item_description, '')
    ) >= p_similarity_threshold
  ORDER BY similarity_score DESC;
END;
$$ LANGUAGE plpgsql;

-- Indexes for performance
CREATE INDEX idx_completion_backlog_id ON backlog_item_completion(backlog_id);
CREATE INDEX idx_completion_sd_id ON backlog_item_completion(completed_by_sd_id);
CREATE INDEX idx_completion_status ON backlog_item_completion(completion_status);
CREATE INDEX idx_completion_date ON backlog_item_completion(completion_date DESC);

CREATE INDEX idx_utilization_requesting ON cross_sd_utilization(requesting_sd_id);
CREATE INDEX idx_utilization_source ON cross_sd_utilization(source_sd_id);
CREATE INDEX idx_utilization_status ON cross_sd_utilization(approval_status);
CREATE INDEX idx_utilization_backlog ON cross_sd_utilization(backlog_id);

CREATE INDEX idx_backlog_completion_status ON sd_backlog_map(completion_status);
CREATE INDEX idx_backlog_completed_by ON sd_backlog_map(completed_by_sd);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON backlog_item_completion TO authenticated;
GRANT SELECT, INSERT, UPDATE ON cross_sd_utilization TO authenticated;
GRANT SELECT ON v_backlog_completion_status TO authenticated;
GRANT SELECT ON v_cross_sd_utilization_matrix TO authenticated;

-- Comments
COMMENT ON TABLE backlog_item_completion IS 'Tracks completion of backlog items across all SDs';
COMMENT ON TABLE cross_sd_utilization IS 'Manages cross-SD utilization requests and approvals';
COMMENT ON VIEW v_backlog_completion_status IS 'Shows completion status of all backlog items';
COMMENT ON VIEW v_cross_sd_utilization_matrix IS 'Shows utilization patterns between SDs';
COMMENT ON FUNCTION can_utilize_backlog_item IS 'Checks if a backlog item can be utilized by another SD';
COMMENT ON FUNCTION request_cross_sd_utilization IS 'Creates a cross-SD utilization request';
COMMENT ON FUNCTION mark_backlog_item_completed IS 'Marks a backlog item as completed';
COMMENT ON FUNCTION find_similar_backlog_items IS 'Finds similar or duplicate backlog items';