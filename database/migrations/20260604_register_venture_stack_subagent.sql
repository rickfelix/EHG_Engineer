-- Migration: Register VENTURE_STACK Sub-Agent
-- Created: 2026-06-04
-- SD: SD-LEO-INFRA-WIRE-PRE-BUILD-001 (FR-1) — wire the pre-build panel enrichment rail live
--
-- VENTURE_STACK is the panel's DETERMINISTIC compliance dimension: it ensures each
-- venture-build leaf positively specifies the EHG venture stack (Clerk auth, Replit
-- Postgres, Replit hosting/Secrets) and contains no forbidden tech (Supabase,
-- Replit-Auth, CLI-as-product). Unlike DATABASE/SECURITY (LLM sub-agents), it reuses
-- the canonical policy SSOT (lib/eva/standards/venture-stack-policy.js) + the
-- negation-aware scanner, so it runs headlessly and is fully unit-testable.
--
-- Implementation: lib/sub-agents/venture-stack.js (wraps runVentureStackAgent).
-- code is an open enum (UNIQUE, no CHECK) — no schema change required.

BEGIN;

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, context_file, active, metadata)
VALUES (
  'f1e2d3c4-5b6a-4c7d-8e9f-0a1b2c3d4e5f'::uuid,
  'Venture Stack Compliance Sub-Agent',
  'VENTURE_STACK',
  'Deterministic compliance checker for venture-build leaves: ensures the leaf PRD positively specifies the EHG venture stack (Clerk, Replit Postgres, Replit hosting) and contains no forbidden tech (Supabase, Replit-Auth, CLI-as-product). Reuses lib/eva/standards/venture-stack-policy.js (SSOT) + the negation-aware scanner; runs headlessly. FAIL (blocking) on forbidden tech present; missing REQUIRED tech is advisory.',
  'automatic',
  80,
  'lib/sub-agents/venture-stack.js',
  NULL,
  true,
  jsonb_build_object(
    'version', '1.0.0',
    'category', 'compliance',
    'deterministic', true,
    'applicable_sd_types', ARRAY['venture-build-leaf'],
    'policy_ssot', 'lib/eva/standards/venture-stack-policy.js',
    'panel_dimension', 'compliance',
    'registered_by', 'SD-LEO-INFRA-WIRE-PRE-BUILD-001'
  )
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  activation_type = EXCLUDED.activation_type,
  priority = EXCLUDED.priority,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active,
  metadata = EXCLUDED.metadata;

COMMIT;

DO $$
DECLARE
  agent_count INT;
BEGIN
  SELECT COUNT(*) INTO agent_count FROM leo_sub_agents WHERE code = 'VENTURE_STACK' AND active = true;
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'VENTURE_STACK Sub-Agent registered (active rows: %)', agent_count;
  RAISE NOTICE 'Implementation: lib/sub-agents/venture-stack.js (deterministic)';
  RAISE NOTICE 'Priority: 80 | activation: automatic | SD-LEO-INFRA-WIRE-PRE-BUILD-001';
  RAISE NOTICE '============================================================';
END $$;
