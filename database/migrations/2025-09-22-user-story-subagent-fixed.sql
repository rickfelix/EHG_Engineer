-- Create User Story Sub-Agent for LEO Protocol
-- Fixed version: removed updated_at, fixed sub-agent insertion

-- Add User Story Sub-Agent
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
  'User Story Sub-Agent',
  'STORIES',
  'Automatically generates user stories from PRD acceptance criteria when PLAN creates or updates PRDs',
  'automatic',
  6, -- After other sub-agents
  '/mnt/c/_EHG/EHG_Engineer/lib/agents/story-sub-agent.js',
  'scripts/generate-stories-from-prd.js',
  true,
  NOW()
) ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  activation_type = EXCLUDED.activation_type,
  priority = EXCLUDED.priority,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

-- Wait a moment to ensure the sub-agent is created
DO $$ BEGIN PERFORM pg_sleep(0.1); END $$;

-- Add triggers for User Story Sub-Agent
INSERT INTO leo_sub_agent_triggers (
  id,
  sub_agent_id,
  trigger_phrase,
  trigger_type,
  priority,
  active,
  created_at
) VALUES
-- Trigger when PRD is created
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'STORIES' LIMIT 1),
  'PRD created',
  'event',
  0,
  true,
  NOW()
),
-- Trigger when PRD is updated
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'STORIES' LIMIT 1),
  'PRD updated',
  'event',
  0,
  true,
  NOW()
),
-- Trigger on acceptance criteria keyword
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'STORIES' LIMIT 1),
  'acceptance criteria',
  'keyword',
  0,
  true,
  NOW()
),
-- Trigger on user story keyword
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'STORIES' LIMIT 1),
  'user stories',
  'keyword',
  0,
  true,
  NOW()
),
-- Trigger on story generation request
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'STORIES' LIMIT 1),
  'generate stories',
  'keyword',
  0,
  true,
  NOW()
) ON CONFLICT DO NOTHING;

-- Verify sub-agent creation
SELECT
  sa.name,
  sa.code,
  sa.description,
  sa.activation_type,
  sa.priority,
  COUNT(t.id) as trigger_count
FROM leo_sub_agents sa
LEFT JOIN leo_sub_agent_triggers t ON t.sub_agent_id = sa.id
WHERE sa.code = 'STORIES'
GROUP BY sa.id, sa.name, sa.code, sa.description, sa.activation_type, sa.priority;