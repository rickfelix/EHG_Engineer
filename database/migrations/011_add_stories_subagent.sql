-- =====================================================
-- Add STORIES Sub-Agent to leo_sub_agents Table
-- Part of BMAD Enhancement Implementation
-- =====================================================

-- Insert STORIES sub-agent
INSERT INTO leo_sub_agents (
  code,
  name,
  description,
  activation_type,
  priority,
  active
) VALUES (
  'STORIES',
  'User Story Context Engineering Sub-Agent',
  E'**BMAD Enhancement**: Hyper-detailed implementation context for user stories.\n\n**Purpose**: Reduce EXEC agent confusion by front-loading implementation details.\n\n**Context Engineering Fields**:\n1. implementation_context - Detailed implementation guidance (architecture patterns, component locations, integration points)\n2. architecture_references - Links to existing patterns, components, and documentation\n3. example_code_patterns - Code snippets and patterns to follow\n4. testing_scenarios - Test cases with expected inputs/outputs\n\n**Process**: Analyzes codebase, identifies patterns, generates comprehensive context for each user story.\n\n**Activation**: PLAN_PRD phase (after PRD creation, before EXEC)\n**Blocking**: No (enhancement only, doesn\'t block workflow)',
  'automatic',
  50, -- Medium priority, runs during PLAN phase
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  priority = EXCLUDED.priority,
  active = EXCLUDED.active;

-- Add triggers for STORIES sub-agent
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id,
  trigger_type,
  trigger_phrase,
  trigger_context,
  priority
)
SELECT
  id,
  'keyword',
  unnest(ARRAY[
    'user story', 'user stories', 'acceptance criteria',
    'implementation', 'context', 'guidance'
  ]),
  'title,description',
  50
FROM leo_sub_agents WHERE code = 'STORIES'
ON CONFLICT DO NOTHING;

-- Phase triggers
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id,
  trigger_type,
  trigger_phrase,
  trigger_context,
  priority
)
SELECT
  id,
  'keyword',
  'PLAN_PRD',
  'phase',
  50
FROM leo_sub_agents WHERE code = 'STORIES'
ON CONFLICT DO NOTHING;

-- Verification
DO $$
DECLARE
  stories_count INTEGER;
  trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO stories_count
  FROM leo_sub_agents
  WHERE code = 'STORIES' AND active = true;

  SELECT COUNT(*) INTO trigger_count
  FROM leo_sub_agent_triggers t
  JOIN leo_sub_agents sa ON t.sub_agent_id = sa.id
  WHERE sa.code = 'STORIES';

  IF stories_count = 1 THEN
    RAISE NOTICE '✅ STORIES sub-agent added successfully';
  ELSE
    RAISE WARNING '⚠️ STORIES sub-agent not found or not active';
  END IF;

  IF trigger_count > 0 THEN
    RAISE NOTICE '✅ % triggers added for STORIES sub-agent', trigger_count;
  ELSE
    RAISE WARNING '⚠️ No triggers found for STORIES sub-agent';
  END IF;
END $$;
