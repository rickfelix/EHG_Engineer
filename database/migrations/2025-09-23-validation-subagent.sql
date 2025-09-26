-- Add Codebase Validation Sub-Agent for LEO Protocol
-- This sub-agent performs comprehensive codebase conflict analysis
-- before any SD/PRD implementation to prevent duplicate work

-- Add VALIDATION Sub-Agent
INSERT INTO leo_sub_agents (
  id,
  name,
  code,
  description,
  activation_type,
  priority,
  context_file,
  script_path,
  active,
  created_at
) VALUES (
  gen_random_uuid(),
  'Validation Sub-Agent',
  'VALIDATION',
  'Analyzes codebase for existing implementations and conflicts before SD/PRD execution',
  'automatic',
  0, -- Highest priority - runs before all other sub-agents
  NULL,
  'scripts/lead-codebase-validation.js',
  true,
  NOW()
) ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  activation_type = EXCLUDED.activation_type,
  priority = EXCLUDED.priority,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

-- Add triggers for Validation Sub-Agent
INSERT INTO leo_sub_agent_triggers (
  id,
  sub_agent_id,
  trigger_phrase,
  trigger_type,
  active,
  created_at
) VALUES
-- Trigger on existing implementation check
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'VALIDATION'),
  'existing implementation',
  'keyword',
  true,
  NOW()
),
-- Trigger on duplicate detection
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'VALIDATION'),
  'duplicate',
  'keyword',
  true,
  NOW()
),
-- Trigger on conflict check
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'VALIDATION'),
  'conflict',
  'keyword',
  true,
  NOW()
),
-- Trigger on already implemented check
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'VALIDATION'),
  'already implemented',
  'keyword',
  true,
  NOW()
),
-- Trigger on codebase check
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'VALIDATION'),
  'codebase check',
  'keyword',
  true,
  NOW()
) ON CONFLICT DO NOTHING;

-- Create validation results table
CREATE TABLE IF NOT EXISTS leo_codebase_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT REFERENCES strategic_directives_v2(id),
  prd_id TEXT REFERENCES product_requirements_v2(id),
  validation_timestamp TIMESTAMP DEFAULT NOW(),
  codebase_analysis JSONB NOT NULL,
  human_review_required BOOLEAN DEFAULT FALSE,
  human_review_reasons TEXT[],
  approval_recommendation TEXT CHECK (approval_recommendation IN ('APPROVED', 'CONDITIONAL', 'BLOCKED')),
  recommended_actions TEXT[],
  evidence_collected JSONB,
  validated_by TEXT DEFAULT 'LEAD',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create mandatory validation tracking table
CREATE TABLE IF NOT EXISTS leo_mandatory_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT,
  prd_id TEXT,
  phase TEXT CHECK (phase IN ('LEAD_TO_PLAN', 'PLAN_TO_EXEC', 'EXEC_TO_VERIFICATION', 'FINAL_APPROVAL')),
  sub_agent_code TEXT REFERENCES leo_sub_agents(code),
  status TEXT CHECK (status IN ('pending', 'passed', 'failed', 'skipped')),
  results JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_codebase_validations_sd_id ON leo_codebase_validations(sd_id);
CREATE INDEX IF NOT EXISTS idx_codebase_validations_prd_id ON leo_codebase_validations(prd_id);
CREATE INDEX IF NOT EXISTS idx_codebase_validations_timestamp ON leo_codebase_validations(validation_timestamp);
CREATE INDEX IF NOT EXISTS idx_mandatory_validations_phase ON leo_mandatory_validations(phase);
CREATE INDEX IF NOT EXISTS idx_mandatory_validations_status ON leo_mandatory_validations(status);

-- Update sub-agent priorities to ensure VALIDATION runs first
UPDATE leo_sub_agents SET priority = priority + 1 WHERE code != 'VALIDATION' AND priority >= 0;

-- Verify sub-agent creation
SELECT
  sa.name,
  sa.code,
  sa.description,
  sa.activation_type,
  sa.priority,
  sa.script_path,
  COUNT(t.id) as trigger_count
FROM leo_sub_agents sa
LEFT JOIN leo_sub_agent_triggers t ON t.sub_agent_id = sa.id
WHERE sa.code = 'VALIDATION'
GROUP BY sa.id, sa.name, sa.code, sa.description, sa.activation_type, sa.priority, sa.script_path;