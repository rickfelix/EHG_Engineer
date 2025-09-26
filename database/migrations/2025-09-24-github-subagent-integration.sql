-- Migration: GitHub Sub-Agent Integration for LEO Protocol
-- Purpose: Register GitHub sub-agent for automated PR, release, and deployment management
-- Date: 2025-09-24
-- LEO Protocol: v4.2.0

-- ============================================
-- 1. Register GitHub Sub-Agent
-- ============================================

-- Insert GitHub sub-agent into leo_sub_agents table
INSERT INTO leo_sub_agents (
  id,
  name,
  code,
  description,
  activation_type,
  priority,
  script_path,
  context_file,
  created_at,
  updated_at,
  active
) VALUES (
  gen_random_uuid(),
  'GitHub Operations Sub-Agent',
  'GITHUB',
  'Manages GitHub operations including PR creation, releases, deployments, and code review integration. Automates git workflow throughout LEO Protocol phases.',
  'automatic',
  90, -- High priority for deployment operations
  'scripts/github-deployment-subagent.js',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  true
) ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  priority = EXCLUDED.priority,
  script_path = EXCLUDED.script_path,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================
-- 2. Create GitHub Operations Tracking Table
-- ============================================

CREATE TABLE IF NOT EXISTS github_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(255),
  prd_id VARCHAR(255),
  operation_type VARCHAR(50) NOT NULL, -- 'pr_create', 'pr_merge', 'release', 'deploy', 'review'

  -- GitHub-specific data
  pr_number INTEGER,
  pr_url TEXT,
  pr_title TEXT,
  pr_status VARCHAR(50), -- 'open', 'closed', 'merged'

  release_tag VARCHAR(100),
  release_url TEXT,
  release_notes TEXT,

  commit_hash VARCHAR(255),
  branch_name VARCHAR(255),
  base_branch VARCHAR(255) DEFAULT 'main',

  -- Review data
  review_requested_from TEXT[],
  review_status VARCHAR(50), -- 'pending', 'approved', 'changes_requested'
  review_comments INTEGER DEFAULT 0,

  -- Deployment data
  deployment_id VARCHAR(255),
  deployment_status VARCHAR(50), -- 'pending', 'in_progress', 'success', 'failed'
  deployment_environment VARCHAR(50), -- 'staging', 'production'
  deployment_url TEXT,

  -- LEO Protocol linkage
  leo_phase VARCHAR(50), -- 'EXEC', 'PLAN_VERIFICATION', 'LEAD_APPROVAL'
  triggered_by VARCHAR(50), -- 'EXEC', 'PLAN', 'LEAD', 'manual'

  -- Metadata
  metadata JSONB DEFAULT '{}',
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_github_ops_sd_id ON github_operations(sd_id);
CREATE INDEX idx_github_ops_prd_id ON github_operations(prd_id);
CREATE INDEX idx_github_ops_pr_number ON github_operations(pr_number);
CREATE INDEX idx_github_ops_operation_type ON github_operations(operation_type);
CREATE INDEX idx_github_ops_created_at ON github_operations(created_at DESC);

-- ============================================
-- 3. Add GitHub Sub-Agent Triggers
-- ============================================

-- Get the GitHub sub-agent ID
DO $$
DECLARE
  github_agent_id UUID;
BEGIN
  SELECT id INTO github_agent_id FROM leo_sub_agents WHERE code = 'GITHUB';

  -- Add triggers for GitHub operations
  INSERT INTO leo_sub_agent_triggers (
    sub_agent_id,
    trigger_phrase,
    trigger_type,
    priority,
    active
  ) VALUES
    -- PR-related triggers
    (github_agent_id, 'EXEC_IMPLEMENTATION_COMPLETE', 'keyword', 100, true),
    (github_agent_id, 'create pull request', 'keyword', 95, true),
    (github_agent_id, 'gh pr create', 'keyword', 95, true),
    (github_agent_id, 'PR_REVIEW_REQUESTED', 'keyword', 90, true),

    -- Release triggers
    (github_agent_id, 'LEAD_APPROVAL_COMPLETE', 'keyword', 100, true),
    (github_agent_id, 'create release', 'keyword', 95, true),
    (github_agent_id, 'gh release create', 'keyword', 95, true),
    (github_agent_id, 'DEPLOY_TO_PRODUCTION', 'keyword', 100, true),

    -- Verification triggers
    (github_agent_id, 'PLAN_VERIFICATION_PASS', 'keyword', 85, true),
    (github_agent_id, 'update pr status', 'keyword', 80, true),
    (github_agent_id, 'merge pull request', 'keyword', 90, true),

    -- Manual triggers
    (github_agent_id, 'github deploy', 'keyword', 85, true),
    (github_agent_id, 'github status', 'keyword', 70, true),
    (github_agent_id, 'check pr', 'keyword', 75, true)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================
-- 4. Create Functions for GitHub Operations
-- ============================================

-- Function to create a PR after EXEC implementation
CREATE OR REPLACE FUNCTION create_pr_for_implementation(
  p_sd_id VARCHAR,
  p_prd_id VARCHAR,
  p_title TEXT,
  p_description TEXT
)
RETURNS TABLE(
  pr_number INTEGER,
  pr_url TEXT,
  operation_id UUID
) AS $$
DECLARE
  v_operation_id UUID;
  v_pr_number INTEGER;
BEGIN
  -- Generate PR number (in real implementation, this comes from GitHub API)
  v_pr_number := COALESCE(
    (SELECT MAX(pr_number) + 1 FROM github_operations),
    1000
  );

  -- Insert operation record
  INSERT INTO github_operations (
    sd_id,
    prd_id,
    operation_type,
    pr_number,
    pr_title,
    pr_status,
    leo_phase,
    triggered_by,
    metadata
  ) VALUES (
    p_sd_id,
    p_prd_id,
    'pr_create',
    v_pr_number,
    p_title,
    'open',
    'EXEC',
    'EXEC',
    jsonb_build_object(
      'description', p_description,
      'created_via', 'LEO Protocol GitHub Sub-Agent'
    )
  ) RETURNING id INTO v_operation_id;

  -- Return PR details
  RETURN QUERY SELECT
    v_pr_number,
    'https://github.com/org/repo/pull/' || v_pr_number::TEXT,
    v_operation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create release after LEAD approval
CREATE OR REPLACE FUNCTION create_release_for_approval(
  p_sd_id VARCHAR,
  p_tag VARCHAR,
  p_notes TEXT
)
RETURNS TABLE(
  release_tag VARCHAR,
  release_url TEXT,
  operation_id UUID
) AS $$
DECLARE
  v_operation_id UUID;
BEGIN
  -- Insert release operation
  INSERT INTO github_operations (
    sd_id,
    operation_type,
    release_tag,
    release_notes,
    leo_phase,
    triggered_by,
    deployment_status
  ) VALUES (
    p_sd_id,
    'release',
    p_tag,
    p_notes,
    'LEAD_APPROVAL',
    'LEAD',
    'pending'
  ) RETURNING id INTO v_operation_id;

  -- Return release details
  RETURN QUERY SELECT
    p_tag,
    'https://github.com/org/repo/releases/tag/' || p_tag,
    v_operation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. Create View for Active GitHub Operations
-- ============================================

CREATE OR REPLACE VIEW active_github_operations AS
SELECT
  go.*,
  sd.title as sd_title,
  sd.status as sd_status,
  prd.title as prd_title,
  CASE
    WHEN go.operation_type = 'pr_create' AND go.pr_status = 'open' THEN 'Awaiting Review'
    WHEN go.operation_type = 'release' AND go.deployment_status = 'pending' THEN 'Ready to Deploy'
    WHEN go.operation_type = 'deploy' AND go.deployment_status = 'in_progress' THEN 'Deploying'
    ELSE 'Completed'
  END as operation_status
FROM github_operations go
LEFT JOIN strategic_directives_v2 sd ON go.sd_id = sd.id
LEFT JOIN product_requirements_v2 prd ON go.prd_id = prd.id
WHERE go.completed_at IS NULL
  OR go.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY go.created_at DESC;

-- ============================================
-- 6. Add RLS Policies
-- ============================================

ALTER TABLE github_operations ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read GitHub operations
CREATE POLICY "Allow read access to GitHub operations" ON github_operations
  FOR SELECT
  USING (true);

-- Only allow inserts from authenticated users with proper context
CREATE POLICY "Allow insert GitHub operations" ON github_operations
  FOR INSERT
  WITH CHECK (
    sd_id IS NOT NULL OR prd_id IS NOT NULL
  );

-- ============================================
-- 7. Add Comments
-- ============================================

COMMENT ON TABLE github_operations IS 'Tracks all GitHub operations initiated by the LEO Protocol GitHub Sub-Agent';
COMMENT ON COLUMN github_operations.operation_type IS 'Type of GitHub operation: pr_create, pr_merge, release, deploy, review';
COMMENT ON COLUMN github_operations.leo_phase IS 'LEO Protocol phase that triggered this operation';
COMMENT ON COLUMN github_operations.deployment_status IS 'Status of deployment: pending, in_progress, success, failed';

-- ============================================
-- 8. Grant Permissions
-- ============================================

GRANT ALL ON github_operations TO authenticated;
GRANT ALL ON active_github_operations TO authenticated;

-- ============================================
-- 9. Success Message
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'GitHub Sub-Agent successfully registered in LEO Protocol';
  RAISE NOTICE 'Code: GITHUB, Priority: 90';
  RAISE NOTICE 'Triggers registered for PR creation, releases, and deployments';
END $$;