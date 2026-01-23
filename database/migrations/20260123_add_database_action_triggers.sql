-- Migration: Add action-oriented trigger keywords to DATABASE sub-agent
-- Purpose: Enable DATABASE sub-agent to detect and handle "apply migration" intent
-- Created: 2026-01-23
-- Related: Smart migration execution feature

-- Insert action trigger keywords for DATABASE sub-agent
INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_type, trigger_phrase, trigger_context, priority, metadata)
SELECT
  id,
  'keyword',
  unnest(ARRAY[
    'apply migration',
    'run migration',
    'execute migration',
    'apply supabase migration',
    'push migration',
    'migrate database',
    'apply the migration',
    'run the migration',
    'db push',
    'supabase db push',
    'apply schema',
    'run schema migration'
  ]),
  'action',
  90,  -- High priority for action triggers
  '{"action_type": "migration_execution", "requires_confirmation": true}'::jsonb
FROM leo_sub_agents
WHERE code = 'DATABASE'
ON CONFLICT (sub_agent_id, trigger_phrase, trigger_context) DO NOTHING;

-- Add comment explaining the feature
COMMENT ON TABLE leo_sub_agent_triggers IS
  'Stores trigger phrases for sub-agent activation.
   Action triggers (trigger_context=action) indicate execution intent vs passive detection.
   Updated 2026-01-23: Added migration execution action triggers for DATABASE sub-agent.';
