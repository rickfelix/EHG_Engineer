-- Seed: OIV Integration Contracts
-- Date: 2026-01-30
-- SD: SD-LEO-INFRA-OIV-001
-- Purpose: Initial contracts for known integration points and the 3 known failure cases
--
-- This script is IDEMPOTENT - can be run multiple times without creating duplicates

-- ============================================================================
-- Known Failure Case #1: Visual Polish Gate
-- Built at lib/agents/design-sub-agent/ but executor resolves from lib/sub-agents/
-- ============================================================================

INSERT INTO leo_integration_contracts (
  contract_key,
  description,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  export_type,
  import_chain,
  checkpoint_level,
  verification_mode,
  sd_type_scope,
  gate_name,
  weight,
  created_by
) VALUES (
  'sub-agent-design-visual-polish',
  'Verifies Visual Polish Gate is callable via DESIGN sub-agent. Known failure: executor resolves from lib/sub-agents/ (line 178) but code built at lib/agents/design-sub-agent/',
  'sub_agent',
  'DESIGN',
  'lib/sub-agents/design.js',
  'execute',
  'named',
  '[
    {"from": "lib/sub-agent-executor/executor.js", "line": 178, "importPath": "./sub-agents/design"},
    {"from": "lib/sub-agents/design.js", "exports": ["execute"]}
  ]'::jsonb,
  'L3_EXPORT_EXISTS',
  'static',
  ARRAY['feature', 'enhancement', 'security']::TEXT[],
  'EXEC-TO-PLAN',
  0.100,
  'SD-LEO-INFRA-OIV-001'
)
ON CONFLICT (contract_key) DO UPDATE SET
  description = EXCLUDED.description,
  import_chain = EXCLUDED.import_chain,
  updated_at = NOW();

-- ============================================================================
-- Known Failure Case #2: Phase 0 Engine
-- Exports startPhase0() but /leo create doesn't call it
-- ============================================================================

INSERT INTO leo_integration_contracts (
  contract_key,
  description,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  export_type,
  import_chain,
  checkpoint_level,
  verification_mode,
  sd_type_scope,
  gate_name,
  weight,
  created_by
) VALUES (
  'workflow-leo-create-phase0',
  'Verifies Phase 0 Engine startPhase0() is called by /leo create command. Known failure: function exported but never imported.',
  'workflow',
  'leo-create',
  'lib/leo/phase0-engine.js',
  'startPhase0',
  'named',
  '[
    {"from": "scripts/commands/leo/create.js", "imports": ["phase0-engine"]},
    {"from": "lib/leo/phase0-engine.js", "exports": ["startPhase0"]}
  ]'::jsonb,
  'L3_EXPORT_EXISTS',
  'static',
  ARRAY['feature', 'workflow']::TEXT[],
  'LEAD-TO-PLAN',
  0.100,
  'SD-LEO-INFRA-OIV-001'
)
ON CONFLICT (contract_key) DO UPDATE SET
  description = EXCLUDED.description,
  import_chain = EXCLUDED.import_chain,
  updated_at = NOW();

-- ============================================================================
-- Known Failure Case #3: Style Tagger
-- Has suggestPersonality() but add-prd-to-database.js doesn't import it
-- ============================================================================

INSERT INTO leo_integration_contracts (
  contract_key,
  description,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  export_type,
  import_chain,
  checkpoint_level,
  verification_mode,
  sd_type_scope,
  gate_name,
  weight,
  created_by
) VALUES (
  'prd-hook-style-tagger',
  'Verifies Style Tagger suggestPersonality() is called by add-prd-to-database.js. Known failure: function exists but never imported.',
  'prd_hook',
  'add-prd-to-database',
  'lib/prd/style-tagger.js',
  'suggestPersonality',
  'named',
  '[
    {"from": "scripts/add-prd-to-database.js", "imports": ["style-tagger"]},
    {"from": "lib/prd/style-tagger.js", "exports": ["suggestPersonality"]}
  ]'::jsonb,
  'L3_EXPORT_EXISTS',
  'static',
  ARRAY['feature', 'enhancement']::TEXT[],
  'PLAN-TO-EXEC',
  0.100,
  'SD-LEO-INFRA-OIV-001'
)
ON CONFLICT (contract_key) DO UPDATE SET
  description = EXCLUDED.description,
  import_chain = EXCLUDED.import_chain,
  updated_at = NOW();

-- ============================================================================
-- Sub-Agent Contracts: Standard sub-agents that should always be callable
-- ============================================================================

INSERT INTO leo_integration_contracts (
  contract_key,
  description,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  export_type,
  checkpoint_level,
  verification_mode,
  sd_type_scope,
  gate_name,
  weight,
  created_by
) VALUES
-- TESTING sub-agent
(
  'sub-agent-testing',
  'Verifies TESTING sub-agent is callable via executor',
  'sub_agent',
  'TESTING',
  'lib/sub-agents/testing.js',
  'execute',
  'named',
  'L3_EXPORT_EXISTS',
  'static',
  ARRAY['feature', 'enhancement', 'bugfix', 'security']::TEXT[],
  'EXEC-TO-PLAN',
  0.050,
  'SD-LEO-INFRA-OIV-001'
),
-- DATABASE sub-agent
(
  'sub-agent-database',
  'Verifies DATABASE sub-agent is callable via executor',
  'sub_agent',
  'DATABASE',
  'lib/sub-agents/database.js',
  'execute',
  'named',
  'L3_EXPORT_EXISTS',
  'static',
  ARRAY['feature', 'database', 'security']::TEXT[],
  'EXEC-TO-PLAN',
  0.050,
  'SD-LEO-INFRA-OIV-001'
),
-- SECURITY sub-agent
(
  'sub-agent-security',
  'Verifies SECURITY sub-agent is callable via executor',
  'sub_agent',
  'SECURITY',
  'lib/sub-agents/security.js',
  'execute',
  'named',
  'L3_EXPORT_EXISTS',
  'static',
  ARRAY['feature', 'security', 'api']::TEXT[],
  'EXEC-TO-PLAN',
  0.050,
  'SD-LEO-INFRA-OIV-001'
),
-- GITHUB sub-agent
(
  'sub-agent-github',
  'Verifies GITHUB sub-agent is callable via executor',
  'sub_agent',
  'GITHUB',
  'lib/sub-agents/github.js',
  'execute',
  'named',
  'L3_EXPORT_EXISTS',
  'static',
  ARRAY['feature', 'enhancement', 'bugfix', 'refactor']::TEXT[],
  'EXEC-TO-PLAN',
  0.050,
  'SD-LEO-INFRA-OIV-001'
)
ON CONFLICT (contract_key) DO NOTHING;

-- ============================================================================
-- Synergy Remediation Contracts (SD-LEO-ORCH-SYNERGY-REMEDIATION-001)
-- Added: 2026-01-30
-- Purpose: Verify fixed integrations from synergy remediation are protected
-- ============================================================================

-- Phase 0 Integration Gate (fixed in SD-LEO-FIX-PHASE0-INTEGRATION-001)
-- Verifies checkGate is imported and callable in leo-create-sd.js
INSERT INTO leo_integration_contracts (
  contract_key,
  description,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  export_type,
  import_chain,
  checkpoint_level,
  verification_mode,
  sd_type_scope,
  gate_name,
  weight,
  created_by
) VALUES (
  'synergy-phase0-gate-integration',
  'Verifies Phase 0 checkGate() is imported and called by leo-create-sd.js for feature/enhancement SDs.',
  'workflow',
  'leo-create-sd',
  'scripts/modules/phase-0/leo-integration.js',
  'checkGate',
  'named',
  '[
    {"from": "scripts/leo-create-sd.js", "importPath": "./modules/phase-0/leo-integration.js"},
    {"from": "scripts/modules/phase-0/leo-integration.js", "exports": ["checkGate", "getArtifacts", "getStatus"]}
  ]'::jsonb,
  'L3_EXPORT_EXISTS',
  'static',
  ARRAY['feature', 'enhancement']::TEXT[],
  'LEAD-TO-PLAN',
  0.100,
  'SD-LEO-FIX-OIV-CONTRACTS-001'
)
ON CONFLICT (contract_key) DO UPDATE SET
  description = EXCLUDED.description,
  import_chain = EXCLUDED.import_chain,
  updated_at = NOW();

-- Performance Agent Phases 6-8 (fixed in SD-LEO-FIX-PERFORMANCE-PHASES-001)
-- Verifies Phases 6, 7, 8 are documented in performance-agent.md
INSERT INTO leo_integration_contracts (
  contract_key,
  description,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  export_type,
  checkpoint_level,
  verification_mode,
  sd_type_scope,
  gate_name,
  weight,
  created_by
) VALUES (
  'synergy-performance-phases-6-8',
  'Verifies Performance Agent has Phases 6-8 (Waterfall Detection, Barrel Import Audit, Server Cache Check) documented.',
  'sub_agent',
  'PERFORMANCE',
  '.claude/agents/performance-agent.md',
  'Phase 6',
  'content',
  'L1_FILE_EXISTS',
  'static',
  ARRAY['feature', 'performance', 'enhancement']::TEXT[],
  'EXEC-TO-PLAN',
  0.050,
  'SD-LEO-FIX-OIV-CONTRACTS-001'
)
ON CONFLICT (contract_key) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

-- Design Tokens Configuration (fixed in SD-LEO-FIX-DESIGN-TOKENS-001)
-- Verifies three-tier design tokens config exists
INSERT INTO leo_integration_contracts (
  contract_key,
  description,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  export_type,
  checkpoint_level,
  verification_mode,
  sd_type_scope,
  gate_name,
  weight,
  created_by
) VALUES (
  'synergy-design-tokens-config',
  'Verifies ehg-design-tokens.json exists with three-tier hierarchy (brand, semantic, component).',
  'config',
  'design-system',
  'config/ehg-design-tokens.json',
  'brand',
  'json_key',
  'L1_FILE_EXISTS',
  'static',
  ARRAY['feature', 'enhancement', 'infrastructure']::TEXT[],
  'PLAN-TO-EXEC',
  0.050,
  'SD-LEO-FIX-OIV-CONTRACTS-001'
)
ON CONFLICT (contract_key) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================================
-- Validation Query
-- ============================================================================

DO $$
DECLARE
  contract_count INTEGER;
  known_failures INTEGER;
BEGIN
  SELECT COUNT(*) INTO contract_count FROM leo_integration_contracts WHERE is_active = TRUE;
  SELECT COUNT(*) INTO known_failures FROM leo_integration_contracts
    WHERE contract_key IN ('sub-agent-design-visual-polish', 'workflow-leo-create-phase0', 'prd-hook-style-tagger');

  RAISE NOTICE 'OIV Contracts seeded: % total, % known failure cases', contract_count, known_failures;

  IF known_failures < 3 THEN
    RAISE WARNING 'Expected 3 known failure contracts, found %', known_failures;
  END IF;
END $$;
