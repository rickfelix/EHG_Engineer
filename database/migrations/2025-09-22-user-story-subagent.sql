-- Create User Story Sub-Agent for LEO Protocol
-- This sub-agent is activated when PLAN creates PRDs to automatically generate stories

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
  created_at,
  updated_at
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
  NOW(),
  NOW()
) ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  activation_type = EXCLUDED.activation_type,
  priority = EXCLUDED.priority,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active,
  updated_at = NOW();

-- Add triggers for User Story Sub-Agent
INSERT INTO leo_sub_agent_triggers (
  id,
  sub_agent_id,
  trigger_phrase,
  trigger_type,
  active,
  created_at
) VALUES
-- Trigger when PRD is created
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'STORIES'),
  'PRD created',
  'event',
  true,
  NOW()
),
-- Trigger when PRD is updated
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'STORIES'),
  'PRD updated',
  'event',
  true,
  NOW()
),
-- Trigger on acceptance criteria keyword
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'STORIES'),
  'acceptance criteria',
  'keyword',
  true,
  NOW()
),
-- Trigger on user story keyword
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'STORIES'),
  'user stories',
  'keyword',
  true,
  NOW()
),
-- Trigger on story generation request
(
  gen_random_uuid(),
  (SELECT id FROM leo_sub_agents WHERE code = 'STORIES'),
  'generate stories',
  'keyword',
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