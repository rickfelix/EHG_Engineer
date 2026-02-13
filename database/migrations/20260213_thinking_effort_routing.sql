-- Migration: Thinking Effort Routing
-- SD-LEO-FIX-REPLACE-MODEL-SELECTION-001
--
-- Adds thinking_effort column to leo_sub_agents table
-- Populates from existing model_tier: haiku→low, sonnet→medium, opus→high
-- Sets all model_tier to 'opus' (single model strategy)

-- Step 1: Add thinking_effort column
ALTER TABLE leo_sub_agents
ADD COLUMN IF NOT EXISTS thinking_effort VARCHAR(20)
CHECK (thinking_effort IN ('low', 'medium', 'high'))
DEFAULT 'medium';

-- Step 2: Populate from existing model_tier mapping
UPDATE leo_sub_agents SET thinking_effort = 'low'
WHERE model_tier = 'haiku' AND thinking_effort IS NULL;

UPDATE leo_sub_agents SET thinking_effort = 'medium'
WHERE model_tier = 'sonnet' AND thinking_effort IS NULL;

UPDATE leo_sub_agents SET thinking_effort = 'high'
WHERE model_tier = 'opus' AND thinking_effort IS NULL;

-- Step 3: Set specific overrides per the routing plan
-- Low effort: operational tasks
UPDATE leo_sub_agents SET thinking_effort = 'low'
WHERE code IN ('DOCMON', 'RETRO', 'GITHUB', 'QUICKFIX');

-- Medium effort: moderate reasoning
UPDATE leo_sub_agents SET thinking_effort = 'medium'
WHERE code IN ('DESIGN', 'API', 'DEPENDENCY', 'VALIDATION', 'TESTING',
               'REGRESSION', 'UAT', 'STORIES', 'RISK', 'PERFORMANCE');

-- High effort: deep reasoning
UPDATE leo_sub_agents SET thinking_effort = 'high'
WHERE code IN ('RCA', 'SECURITY', 'DATABASE', 'ORCHESTRATOR_CHILD');

-- Step 4: Update all model_tier to opus (single model strategy)
UPDATE leo_sub_agents SET model_tier = 'opus'
WHERE active = true;

-- Step 5: Add thinking_budget_tokens to llm_models for documentation
ALTER TABLE llm_models
ADD COLUMN IF NOT EXISTS thinking_budget_tokens INTEGER;

-- Set budget tokens for reference
UPDATE llm_models SET thinking_budget_tokens = 1024
WHERE model_key LIKE '%opus%' AND leo_tier = 'haiku';

UPDATE llm_models SET thinking_budget_tokens = 4096
WHERE model_key LIKE '%opus%' AND leo_tier = 'sonnet';

UPDATE llm_models SET thinking_budget_tokens = 16384
WHERE model_key LIKE '%opus%' AND leo_tier = 'opus';

-- Verification query (run manually to confirm)
-- SELECT code, model_tier, thinking_effort FROM leo_sub_agents WHERE active = true ORDER BY code;
