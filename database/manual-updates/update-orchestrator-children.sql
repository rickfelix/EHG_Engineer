-- ============================================================================
-- Manual Update: Set Parent-Child Relationships for Orchestrator SD
-- ============================================================================
-- Purpose: Link 5 refactor SDs as children of orchestrator SD-LEO-REFACTOR-LARGE-FILES-001
-- Date: 2026-01-20
-- Note: Run this in Supabase SQL Editor with elevated privileges
-- ============================================================================

-- Update SD-LEO-REFACTOR-HANDOFF-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = 'SD-LEO-REFACTOR-LARGE-FILES-001',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"SD-LEO-REFACTOR-LARGE-FILES-001"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Manual setup of orchestrator-child relationship", "requested_at": "2026-01-20T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-LEO-REFACTOR-HANDOFF-001';

-- Update SD-LEO-REFACTOR-PRD-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = 'SD-LEO-REFACTOR-LARGE-FILES-001',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"SD-LEO-REFACTOR-LARGE-FILES-001"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Manual setup of orchestrator-child relationship", "requested_at": "2026-01-20T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-LEO-REFACTOR-PRD-001';

-- Update SD-LEO-REFACTOR-ORCH-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = 'SD-LEO-REFACTOR-LARGE-FILES-001',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"SD-LEO-REFACTOR-LARGE-FILES-001"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Manual setup of orchestrator-child relationship", "requested_at": "2026-01-20T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-LEO-REFACTOR-ORCH-001';

-- Update SD-LEO-REFACTOR-QUEUE-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = 'SD-LEO-REFACTOR-LARGE-FILES-001',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"SD-LEO-REFACTOR-LARGE-FILES-001"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Manual setup of orchestrator-child relationship", "requested_at": "2026-01-20T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-LEO-REFACTOR-QUEUE-001';

-- Update SD-LEO-REFACTOR-LEARN-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = 'SD-LEO-REFACTOR-LARGE-FILES-001',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"SD-LEO-REFACTOR-LARGE-FILES-001"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Manual setup of orchestrator-child relationship", "requested_at": "2026-01-20T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-LEO-REFACTOR-LEARN-001';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

SELECT
  id,
  title,
  parent_sd_id,
  relationship_type,
  dependencies->'orchestrator' as orchestrator_ref
FROM strategic_directives_v2
WHERE id = 'SD-LEO-REFACTOR-LARGE-FILES-001'
   OR parent_sd_id = 'SD-LEO-REFACTOR-LARGE-FILES-001'
ORDER BY
  CASE WHEN relationship_type = 'parent' THEN 0 ELSE 1 END,
  id;
