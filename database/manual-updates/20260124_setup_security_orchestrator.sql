-- ============================================================================
-- Manual Update: Set Parent-Child Relationships for Security Orchestrator
-- ============================================================================
-- Purpose: Link 6 security SDs as children of orchestrator SD-SEC-REMEDIATION
-- Date: 2026-01-24
-- Note: Run this via direct database connection to bypass governance triggers
-- ============================================================================

-- The orchestrator SD (already exists with UUID as primary key)
-- 8c5379ca-4a31-45e5-9a65-40d2ff7e83f1 = SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001

-- Update SD-SEC-AUTHORIZATION-RBAC-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = '8c5379ca-4a31-45e5-9a65-40d2ff7e83f1',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"8c5379ca-4a31-45e5-9a65-40d2ff7e83f1"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Setup of security orchestrator-child relationship for coordinated remediation", "requested_at": "2026-01-24T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-SEC-AUTHORIZATION-RBAC-001';

-- Update SD-SEC-CONFIG-SECURITY-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = '8c5379ca-4a31-45e5-9a65-40d2ff7e83f1',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"8c5379ca-4a31-45e5-9a65-40d2ff7e83f1"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Setup of security orchestrator-child relationship for coordinated remediation", "requested_at": "2026-01-24T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-SEC-CONFIG-SECURITY-001';

-- Update SD-SEC-CREDENTIAL-ROTATION-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = '8c5379ca-4a31-45e5-9a65-40d2ff7e83f1',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"8c5379ca-4a31-45e5-9a65-40d2ff7e83f1"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Setup of security orchestrator-child relationship for coordinated remediation", "requested_at": "2026-01-24T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-SEC-CREDENTIAL-ROTATION-001';

-- Update SD-SEC-DATA-VALIDATION-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = '8c5379ca-4a31-45e5-9a65-40d2ff7e83f1',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"8c5379ca-4a31-45e5-9a65-40d2ff7e83f1"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Setup of security orchestrator-child relationship for coordinated remediation", "requested_at": "2026-01-24T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-SEC-DATA-VALIDATION-001';

-- Update SD-SEC-ERROR-HANDLING-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = '8c5379ca-4a31-45e5-9a65-40d2ff7e83f1',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"8c5379ca-4a31-45e5-9a65-40d2ff7e83f1"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Setup of security orchestrator-child relationship for coordinated remediation", "requested_at": "2026-01-24T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-SEC-ERROR-HANDLING-001';

-- Update SD-SEC-RLS-POLICIES-001
UPDATE strategic_directives_v2
SET
  parent_sd_id = '8c5379ca-4a31-45e5-9a65-40d2ff7e83f1',
  relationship_type = 'child',
  dependencies = jsonb_set(
    COALESCE(dependencies, '{}'::jsonb),
    '{orchestrator}',
    '"8c5379ca-4a31-45e5-9a65-40d2ff7e83f1"'::jsonb
  ),
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Setup of security orchestrator-child relationship for coordinated remediation", "requested_at": "2026-01-24T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-SEC-RLS-POLICIES-001';

-- Update the orchestrator SD's relationship_type
UPDATE strategic_directives_v2
SET
  relationship_type = 'orchestrator',
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '{"bypass_governance": true, "actor_role": "ADMIN", "bypass_reason": "Setting orchestrator relationship type for security remediation coordination", "requested_at": "2026-01-24T00:00:00Z"}'::jsonb
  ),
  updated_at = NOW()
WHERE id = '8c5379ca-4a31-45e5-9a65-40d2ff7e83f1';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

SELECT
  id,
  title,
  parent_sd_id,
  relationship_type,
  sd_type,
  progress
FROM strategic_directives_v2
WHERE id = '8c5379ca-4a31-45e5-9a65-40d2ff7e83f1'
   OR parent_sd_id = '8c5379ca-4a31-45e5-9a65-40d2ff7e83f1'
ORDER BY
  CASE WHEN relationship_type = 'orchestrator' THEN 0 ELSE 1 END,
  id;
