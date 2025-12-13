-- ============================================================================
-- VISION V2 RESET AND SEED MIGRATION
-- ============================================================================
-- File: 20251213_vision_v2_reset_and_seed.sql
-- Purpose: Archive existing SDs/PRDs and seed Vision V2 Chairman's OS directives
--
-- LEO Protocol Compliance: v4.3.3
-- SD Quality Rubric: 35% description, 30% objectives, 25% metrics, 10% risk
--
-- Vision Specification References:
--   - docs/vision/specs/01-database-schema.md (Database Schema)
--   - docs/vision/specs/02-api-contracts.md (API Contracts)
--   - docs/vision/specs/03-ui-components.md (UI Components)
--   - docs/vision/specs/04-eva-orchestration.md (EVA Orchestration)
--   - docs/vision/specs/06-hierarchical-agent-architecture.md (Agent Hierarchy)
--
-- Execution: psql -h <host> -U <user> -d <database> -f 20251213_vision_v2_reset_and_seed.sql
-- Rollback: SELECT governance_archive.restore_all_from_archive();
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 0: Pre-flight Checks
-- ============================================================================

DO $$
BEGIN
    -- Verify we're on the correct database (Supabase uses 'postgres' as database name)
    IF current_database() NOT LIKE '%ehg%' AND current_database() NOT LIKE '%engineer%' AND current_database() != 'postgres' THEN
        RAISE EXCEPTION 'Safety check failed: Expected EHG or postgres database, got %', current_database();
    END IF;

    -- Log migration start
    RAISE NOTICE 'Starting Vision V2 Reset and Seed Migration at %', NOW();
    RAISE NOTICE 'Database: %', current_database();
END $$;

-- ============================================================================
-- PART 1: Create Archive Schema
-- ============================================================================

-- Create governance_archive schema for soft-delete preservation
CREATE SCHEMA IF NOT EXISTS governance_archive;

COMMENT ON SCHEMA governance_archive IS
'Archive schema for Vision V2 migration. Contains pre-migration SDs and PRDs.
Created: 2025-12-13. Retention: 1 year. Query via governance_archive.* tables.';

-- ============================================================================
-- PART 2: Create Archive Tables (Mirror Structure)
-- ============================================================================

-- Archive table for strategic_directives
CREATE TABLE IF NOT EXISTS governance_archive.strategic_directives (
    LIKE public.strategic_directives_v2 INCLUDING ALL
);

-- Archive table for product_requirements
CREATE TABLE IF NOT EXISTS governance_archive.product_requirements (
    LIKE public.product_requirements_v2 INCLUDING ALL
);

-- Archive table for sd_phase_tracking
CREATE TABLE IF NOT EXISTS governance_archive.sd_phase_tracking (
    LIKE public.sd_phase_tracking INCLUDING ALL
);

-- ============================================================================
-- PART 3: Create Restore Functions
-- ============================================================================

-- Function to restore a single SD from archive
-- NOTE: This uses a workaround to avoid column mismatch (archive has extra columns)
-- It drops the archive columns from the query dynamically
CREATE OR REPLACE FUNCTION governance_archive.restore_sd_from_archive(p_sd_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_restored BOOLEAN := FALSE;
    v_columns TEXT;
BEGIN
    -- Get column list from target table (excludes archive-specific columns)
    SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'strategic_directives_v2';

    -- Restore the SD using dynamic SQL
    EXECUTE format(
        'INSERT INTO public.strategic_directives_v2 (%s)
         SELECT %s FROM governance_archive.strategic_directives
         WHERE id = $1 OR legacy_id = $1
         ON CONFLICT (id) DO NOTHING',
        v_columns, v_columns
    ) USING p_sd_id;

    IF FOUND THEN
        -- Get PRD columns
        SELECT string_agg(quote_ident(column_name), ', ')
        INTO v_columns
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_requirements_v2';

        -- Restore associated PRDs using dynamic SQL
        EXECUTE format(
            'INSERT INTO public.product_requirements_v2 (%s)
             SELECT %s FROM governance_archive.product_requirements
             WHERE sd_id = $1 OR sd_id IN (
                 SELECT id FROM governance_archive.strategic_directives WHERE legacy_id = $1
             )
             ON CONFLICT (id) DO NOTHING',
            v_columns, v_columns
        ) USING p_sd_id;

        v_restored := TRUE;
        RAISE NOTICE 'Restored SD % from archive', p_sd_id;
    ELSE
        RAISE WARNING 'SD % not found in archive', p_sd_id;
    END IF;

    RETURN v_restored;
END;
$$ LANGUAGE plpgsql;

-- Function to restore ALL from archive (full rollback)
-- Uses dynamic SQL to handle column mismatch between archive and public tables
CREATE OR REPLACE FUNCTION governance_archive.restore_all_from_archive()
RETURNS TABLE(sds_restored INT, prds_restored INT, progress_restored INT) AS $$
DECLARE
    v_sds INT := 0;
    v_prds INT := 0;
    v_progress INT := 0;
    v_columns TEXT;
BEGIN
    -- Get SD column list from target table
    SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'strategic_directives_v2';

    -- Restore all SDs using dynamic SQL
    EXECUTE format(
        'INSERT INTO public.strategic_directives_v2 (%s)
         SELECT %s FROM governance_archive.strategic_directives
         ON CONFLICT (id) DO NOTHING',
        v_columns, v_columns
    );
    GET DIAGNOSTICS v_sds = ROW_COUNT;

    -- Get PRD column list from target table
    SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_requirements_v2';

    -- Restore all PRDs using dynamic SQL
    EXECUTE format(
        'INSERT INTO public.product_requirements_v2 (%s)
         SELECT %s FROM governance_archive.product_requirements
         ON CONFLICT (id) DO NOTHING',
        v_columns, v_columns
    );
    GET DIAGNOSTICS v_prds = ROW_COUNT;

    -- Phase tracking restore skipped (can be added if needed)
    v_progress := 0;

    RAISE NOTICE 'Full restore complete: % SDs, % PRDs, % progress records', v_sds, v_prds, v_progress;

    RETURN QUERY SELECT v_sds, v_prds, v_progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 4: Archive Existing Data
-- ============================================================================

-- Archive all existing strategic_directives
INSERT INTO governance_archive.strategic_directives
SELECT *
FROM public.strategic_directives_v2
WHERE id NOT LIKE 'SD-VISION-V2-%';

-- Archive all existing product_requirements
INSERT INTO governance_archive.product_requirements
SELECT *
FROM public.product_requirements_v2
WHERE sd_id NOT LIKE 'SD-VISION-V2-%'
  AND sd_id NOT IN (SELECT id FROM public.strategic_directives_v2 WHERE id LIKE 'SD-VISION-V2-%');

-- Archive all existing sd_phase_tracking
INSERT INTO governance_archive.sd_phase_tracking
SELECT *
FROM public.sd_phase_tracking
WHERE sd_id NOT LIKE 'SD-VISION-V2-%';

-- Log archive counts
DO $$
DECLARE
    v_sd_count INT;
    v_prd_count INT;
    v_progress_count INT;
BEGIN
    SELECT COUNT(*) INTO v_sd_count FROM governance_archive.strategic_directives;
    SELECT COUNT(*) INTO v_prd_count FROM governance_archive.product_requirements;
    SELECT COUNT(*) INTO v_progress_count FROM governance_archive.sd_phase_tracking;

    RAISE NOTICE 'Archived: % SDs, % PRDs, % progress records', v_sd_count, v_prd_count, v_progress_count;
END $$;

-- ============================================================================
-- PART 5: Delete Archived Data from Main Tables
-- ============================================================================

-- ============================================================================
-- COMPREHENSIVE FK CLEANUP (49 tables reference strategic_directives_v2)
-- Delete from all referencing tables first, in dependency order
-- ============================================================================

-- 1. Self-referencing: Clear parent_sd_id references first
UPDATE public.strategic_directives_v2
SET parent_sd_id = NULL
WHERE id NOT LIKE 'SD-VISION-V2-%';

-- 2. Tables with FK to strategic_directives_v2 (alphabetical for maintainability)
DELETE FROM public.agent_artifacts WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.agent_learning_outcomes WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.agent_task_contracts WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.documentation_inventory WHERE related_sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.documentation_violations WHERE related_sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.exec_handoff_preparations WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.exec_implementation_sessions WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.exec_quality_checkpoints WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.exec_sub_agent_activations WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.execution_sequences_v2 WHERE directive_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.governance_proposals WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.hap_blocks_v2 WHERE strategic_directive_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.issue_patterns WHERE first_seen_sd_id NOT LIKE 'SD-VISION-V2-%' OR last_seen_sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.lead_evaluations WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.leo_codebase_validations WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.leo_handoff_executions WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.leo_protocol_file_audit WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.leo_subagent_handoffs WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.plan_quality_gates WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.plan_sub_agent_executions WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.plan_technical_validations WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.prd_research_audit_log WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.quick_fixes WHERE escalated_to_sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.retrospectives WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.risk_assessments WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.root_cause_reports WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_backlog_map WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_business_evaluations WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_capabilities WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_contract_exceptions WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_contract_violations WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_data_contracts WHERE parent_sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_exec_file_operations WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_phase_handoffs WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_phase_tracking WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_scope_deliverables WHERE sd_id NOT LIKE 'SD-VISION-V2-%' OR checkpoint_sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_testing_status WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.sd_ux_contracts WHERE parent_sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.subagent_activations WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.subagent_requirements WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.tech_stack_references WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.test_plans WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.test_runs WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.user_stories WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.venture_stage_work WHERE sd_id NOT LIKE 'SD-VISION-V2-%';
DELETE FROM public.working_sd_sessions WHERE sd_id NOT LIKE 'SD-VISION-V2-%';

-- 3. Delete PRDs (has its own FK dependencies)
DELETE FROM public.leo_codebase_validations WHERE prd_id IN (
  SELECT id FROM public.product_requirements_v2 WHERE sd_id NOT LIKE 'SD-VISION-V2-%'
);
DELETE FROM public.leo_subagent_handoffs WHERE prd_id IN (
  SELECT id FROM public.product_requirements_v2 WHERE sd_id NOT LIKE 'SD-VISION-V2-%'
);
DELETE FROM public.product_requirements_v2 WHERE sd_id NOT LIKE 'SD-VISION-V2-%';

-- 4. Finally delete SDs (preserve any existing Vision V2 SDs)
DELETE FROM public.strategic_directives_v2
WHERE id NOT LIKE 'SD-VISION-V2-%';

-- Log deletion counts
DO $$
DECLARE
    v_remaining INT;
BEGIN
    SELECT COUNT(*) INTO v_remaining FROM public.strategic_directives_v2;
    RAISE NOTICE 'Main tables cleared. Remaining SDs: %', v_remaining;
END $$;

-- ============================================================================
-- PART 6: Seed Vision V2 Strategic Directives
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SD-VISION-V2-000: Parent Orchestrator
-- ----------------------------------------------------------------------------
INSERT INTO public.strategic_directives_v2 (
    id,
    sd_key,
    title,
    description,
    rationale,
    scope,
    strategic_objectives,
    success_metrics,
    key_principles,
    status,
    current_phase,
    category,
    priority,
    parent_sd_id,
    target_application,
    sequence_rank,
    risks,
    dependencies,
    success_criteria,
    implementation_guidelines,
    metadata,
    created_at,
    updated_at
) VALUES (
    'SD-VISION-V2-000',
    'vision-v2-chairman-os',
    'Vision V2: Chairman''s Operating System Foundation',
    E'## Description\n\nThis parent orchestrator coordinates the complete migration from LEO Protocol v4.3.3 to the Vision V2 "Chairman''s Operating System" - a fractal hierarchical agent architecture where:\n\n- **Chairman (L1)**: Rick - strategic decisions, venture portfolio oversight\n- **EVA (L2)**: AI COO - orchestrates venture CEOs, manages token budgets\n- **Venture CEOs (L2)**: AI executives - autonomous venture operations\n- **VPs (L3)**: Specialized domain leads (Strategy, Product, Tech, Growth)\n- **Crews (L4)**: Execution teams (Market Research, Dev, QA, etc.)\n\n### Vision Document References\n- [Database Schema](/docs/vision/specs/01-database-schema.md)\n- [API Contracts](/docs/vision/specs/02-api-contracts.md)\n- [UI Components](/docs/vision/specs/03-ui-components.md)\n- [EVA Orchestration](/docs/vision/specs/04-eva-orchestration.md)\n- [Agent Hierarchy](/docs/vision/specs/06-hierarchical-agent-architecture.md)\n\n### Architecture Principle: Governance Wrapper\nThe 25-stage venture workflow is SACRED and FIXED. This migration builds a governance plane ON TOP of the execution plane using the Strangler Pattern. CEO Runtime operates as OBSERVER-COMMITTER, never LOGIC-OWNER.\n\n### Child SD Execution Order\n1. SD-001: Database Schema Foundation (Week 1-2)\n2. SD-002: API Contracts (Week 2-3)\n3. SD-003: EVA Orchestration Layer (Week 3-5) [parallel with SD-004]\n4. SD-004: Agent Registry & Hierarchy (Week 3-5) [parallel with SD-003]\n5. SD-005: Venture CEO Runtime & Factory (Week 5-7)\n6. SD-006: Chairman''s Dashboard UI (Week 7-8.5)\n7. SD-007: Integration Verification (Week 8-9)\n8. SD-008: Technical Debt Cleanup (Week 9-11)',
    'The current LEO Protocol has reached its architectural ceiling at ~5-7 concurrent ventures. Vision V2 enables:\n\n1. **Scalability**: Fractal hierarchy supports unlimited ventures\n2. **Autonomy**: CEOs operate independently with EVA oversight\n3. **Efficiency**: Token budgets and circuit breakers prevent runaway costs\n4. **Visibility**: Chairman sees portfolio health, not implementation details\n5. **Resilience**: Circuit breakers halt anomalies before damage',
    E'## In Scope\n- Agent hierarchy implementation (4 levels)\n- EVA orchestration layer\n- Chairman''s Dashboard UI\n- Token budget system\n- Circuit breaker protection\n- Database schema for governance\n- API contracts for Chairman operations\n- Integration with existing 25-stage workflow (READ-ONLY)\n\n## Out of Scope\n- Modifying 25-stage venture workflow\n- Changes to existing stage transitions\n- Alterations to venture_stage_work table schema\n- crewAI agent implementations (Phase 2)\n- Multi-tenant deployment (Phase 3)',
    '[{"objective": "Implement 4-level agent hierarchy with LTREE paths", "key_results": ["agent_registry table deployed", "Chairman and EVA bootstrap complete", "3 test ventures instantiated"]}, {"objective": "Deploy EVA orchestration with circuit breakers", "key_results": ["Token budget enforcement active", "Circuit breakers trigger at 85% soft cap", "Morning briefing generation working"]}, {"objective": "Deliver Chairman Dashboard UI", "key_results": ["BriefingDashboard component live", "DecisionStack with swipe actions", "Portfolio health visualization"]}, {"objective": "Verify 25-stage workflow insulation", "key_results": ["Zero writes to venture_stage_work from CEO Runtime", "All stage transitions via existing functions", "E2E tests pass with governance layer"]}]'::jsonb,
    '[{"metric": "Child SD Completion Rate", "target": "100%", "measurement": "8/8 child SDs completed"}, {"metric": "25-Stage Workflow Integrity", "target": "100%", "measurement": "Zero schema changes to venture_stage_work"}, {"metric": "E2E Test Pass Rate", "target": ">95%", "measurement": "Integration test suite"}, {"metric": "Token Budget Compliance", "target": "100%", "measurement": "No hard cap breaches"}]'::jsonb,
    '[{"principle": "25-stage workflow is SACRED", "description": "Governance wrapper only - no direct modifications"}, {"principle": "Database-first architecture", "description": "Schema drives implementation"}, {"principle": "Progressive disclosure in UI", "description": "Glass cockpit philosophy"}, {"principle": "Circuit breakers for cost protection", "description": "Token budgets with hard caps"}, {"principle": "Strangler Pattern for migration safety", "description": "Parallel structure with bridge layer"}]'::jsonb,
    'draft',
    'LEAD_APPROVAL',
    'infrastructure',
    'critical',
    NULL,
    'EHG_Engineer',
    0,
    '[{"risk": "25-stage workflow disruption", "severity": "high", "mitigation": "OBSERVER-COMMITTER pattern, extensive E2E tests"}, {"risk": "Token budget overruns", "severity": "medium", "mitigation": "Circuit breakers at 85%/100% caps"}, {"risk": "Schema migration failures", "severity": "high", "mitigation": "Archive schema enables full rollback"}, {"risk": "Dependency delays", "severity": "medium", "mitigation": "Parallel execution of SD-003/SD-004"}]'::jsonb,
    '[]'::jsonb,
    '[{"criterion": "All 8 child SDs completed successfully", "measure": "SD status = completed"}, {"criterion": "Chairman can issue directive and see result in briefing", "measure": "E2E test"}, {"criterion": "EVA routes tasks to appropriate CEO", "measure": "Integration test"}, {"criterion": "Circuit breaker triggers on burn rate violation", "measure": "Load test"}, {"criterion": "25-stage workflow unchanged and functional", "measure": "Zero schema changes"}]'::jsonb,
    '[{"guideline": "Deploy governance schema tables first", "rationale": "Foundation for all other components"}, {"guideline": "Implement RLS with fn_is_chairman()", "rationale": "Security boundary for Chairman operations"}, {"guideline": "Use OBSERVER-COMMITTER pattern for CEO Runtime", "rationale": "Preserves 25-stage workflow integrity"}]'::jsonb,
    '{
        "vision_spec_references": {
            "primary": [
                {"spec": "01-database-schema.md", "path": "docs/vision/specs/01-database-schema.md", "sections": ["all"]},
                {"spec": "02-api-contracts.md", "path": "docs/vision/specs/02-api-contracts.md", "sections": ["all"]},
                {"spec": "03-ui-components.md", "path": "docs/vision/specs/03-ui-components.md", "sections": ["all"]},
                {"spec": "04-eva-orchestration.md", "path": "docs/vision/specs/04-eva-orchestration.md", "sections": ["all"]},
                {"spec": "06-hierarchical-agent-architecture.md", "path": "docs/vision/specs/06-hierarchical-agent-architecture.md", "sections": ["all"]}
            ],
            "philosophy": [
                {"spec": "VISION_V2_GLASS_COCKPIT.md", "path": "VISION_V2_GLASS_COCKPIT.md"},
                {"spec": "00_VISION_V2_CHAIRMAN_OS.md", "path": "docs/vision/00_VISION_V2_CHAIRMAN_OS.md"}
            ]
        },
        "implementation_guidance": {
            "critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION",
            "creation_mode": "CREATE_FROM_NEW",
            "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new. Do not modify existing files - create fresh implementations per the vision specs."
        },
        "prd_requirements": {
            "must_reference_specs": true,
            "required_spec_sections_in_technical_context": true,
            "exec_must_consult_specs_before_implementation": true
        },
        "governance": {
            "25_stage_workflow_policy": "READ_ONLY_OBSERVER_COMMITTER",
            "strangler_pattern": true
        }
    }'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- SD-VISION-V2-001: Database Schema Foundation
-- ----------------------------------------------------------------------------
INSERT INTO public.strategic_directives_v2 (
    id,
    sd_key,
    title,
    description,
    rationale,
    scope,
    strategic_objectives,
    success_metrics,
    key_principles,
    status,
    current_phase,
    category,
    priority,
    parent_sd_id,
    target_application,
    sequence_rank,
    risks,
    dependencies,
    success_criteria,
    implementation_guidelines,
    metadata,
    created_at,
    updated_at
) VALUES (
    'SD-VISION-V2-001',
    'vision-v2-database-schema',
    'Vision V2: Database Schema Foundation',
    E'## Description\n\nImplement the complete database schema foundation for Vision V2 Chairman''s Operating System as specified in [01-database-schema.md](/docs/vision/specs/01-database-schema.md).\n\n### Tables to Create\n- `chairman_directives` - High-level strategic commands from Chairman\n- `directive_delegations` - EVA''s task assignments to CEOs\n- `agent_task_contracts` - Atomic work units for crews\n- `venture_token_ledger` - Token budget tracking per venture\n- `assumption_sets` - Versioned assumption bundles for ventures\n- `chairman_decisions` - Decision audit trail\n- `circuit_breaker_events` - Cost protection event log\n- `chairman_alerts` - Escalation queue for Chairman attention\n\n### Security Implementation\n- `fn_is_chairman()` helper function for RLS policies\n- Row Level Security on all governance tables\n- Chairman-only access to sensitive operations\n\n### CRITICAL CONSTRAINT\nThis SD creates NEW tables only. It does NOT modify:\n- `ventures` table (except adding `ceo_agent_id` column)\n- `venture_stage_work` table\n- Any existing stage-related triggers or functions',
    'Database schema is the foundation of the entire Vision V2 architecture. Without proper tables, RLS policies, and helper functions, subsequent SDs cannot proceed. This is the critical path item.',
    E'## In Scope\n- 15+ new governance tables per spec Section 0-5\n- `fn_is_chairman()` security helper\n- RLS policies for Chairman access control\n- Indexes for query optimization\n- Foreign key relationships\n\n## Out of Scope\n- API endpoints (SD-002)\n- Application code (SD-003+)\n- Modifications to 25-stage workflow tables',
    '[{"objective": "Deploy all governance schema tables", "key_results": ["15+ tables created per spec", "All FKs and indexes in place", "No errors on migration run"]}, {"objective": "Implement Chairman security model", "key_results": ["fn_is_chairman() function deployed", "RLS policies active on all governance tables", "Non-Chairman access blocked"]}]',
    '[{"metric": "Table Creation Success", "target": "100%", "measurement": "All tables exist in database"}, {"metric": "RLS Policy Coverage", "target": "100%", "measurement": "Every governance table has RLS"}, {"metric": "Migration Rollback Test", "target": "Pass", "measurement": "Can rollback without data loss"}]',
    '[{"principle": "Database-first architecture", "description": "Schema defines implementation"}, {"principle": "Security by default with RLS", "description": "All tables protected"}, {"principle": "No modifications to existing workflow tables", "description": "25-stage workflow is sacred"}]'::jsonb,
    'draft',
    'LEAD_APPROVAL',
    'database',
    'critical',
    'SD-VISION-V2-000',
    'EHG_Engineer',
    1,
    '[{"risk": "Schema conflicts", "severity": "high", "mitigation": "Run in transaction, test in staging first"}, {"risk": "RLS blocks legitimate access", "severity": "medium", "mitigation": "Comprehensive test suite for access patterns"}, {"risk": "Performance impact", "severity": "medium", "mitigation": "Add indexes per spec"}]'::jsonb,
    '[]'::jsonb,
    '[{"criterion": "All tables from spec Sections 0-5 created", "measure": "SQL verification"}, {"criterion": "fn_is_chairman() returns true only for Chairman user", "measure": "Unit test"}, {"criterion": "RLS blocks non-Chairman on governance tables", "measure": "Security test"}, {"criterion": "Migration can be rolled back cleanly", "measure": "Rollback test"}]'::jsonb,
    '[{"guideline": "Create migration file following naming convention", "rationale": "Consistency"}, {"guideline": "Implement tables in dependency order", "rationale": "FK constraints"}, {"guideline": "Apply RLS policies", "rationale": "Security"}]'::jsonb,
    '{
        "vision_spec_references": {
            "primary": [{"spec": "01-database-schema.md", "path": "docs/vision/specs/01-database-schema.md", "sections": ["0-5"]}],
            "must_read_before_prd": ["docs/vision/specs/01-database-schema.md"],
            "must_read_before_exec": ["docs/vision/specs/01-database-schema.md"]
        },
        "implementation_guidance": {
            "critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION",
            "creation_mode": "CREATE_FROM_NEW",
            "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new. Do not modify existing files - create fresh implementations per the vision specs."
        },
        "prd_requirements": {
            "technical_context_must_cite": ["01-database-schema.md Sections 0-5"],
            "implementation_approach_must_reference": ["table creation order from spec", "RLS policy patterns from spec"]
        }
    }'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- SD-VISION-V2-002: API Contracts
-- ----------------------------------------------------------------------------
INSERT INTO public.strategic_directives_v2 (
    id,
    sd_key,
    title,
    description,
    rationale,
    scope,
    strategic_objectives,
    success_metrics,
    key_principles,
    status,
    current_phase,
    category,
    priority,
    parent_sd_id,
    target_application,
    sequence_rank,
    risks,
    dependencies,
    success_criteria,
    implementation_guidelines,
    metadata,
    created_at,
    updated_at
) VALUES (
    'SD-VISION-V2-002',
    'vision-v2-api-contracts',
    'Vision V2: API Contracts for Chairman Operations',
    E'## Description\n\nImplement the API contracts for Chairman operations as specified in [02-api-contracts.md](/docs/vision/specs/02-api-contracts.md).\n\n### Endpoints to Implement\n1. `GET /api/ventures` - List ventures with 25-stage breakdown\n2. `GET /api/ventures/:id` - Venture detail with stage timeline\n3. `GET /api/chairman/briefing` - Morning briefing JSON\n4. `GET /api/chairman/decisions` - Pending decision stack\n5. `POST /api/chairman/decide` - Execute Chairman decision\n6. `GET /api/chairman/portfolio` - Portfolio health summary\n\n### Response Contracts\nAll responses must match TypeScript interfaces in spec:\n- `VentureListResponse`\n- `VentureDetailResponse`\n- `BriefingResponse`\n- `DecisionStackResponse`\n- `PortfolioHealthResponse`\n\n### Authentication\nChairman endpoints require authentication via existing Supabase auth. RLS handles authorization.',
    'API contracts define the interface between UI and backend. Clear contracts enable parallel development of UI (SD-006) while backend work progresses. This follows contract-first API design principles.',
    E'## In Scope\n- 6 API endpoints per spec\n- Request/response validation\n- Error handling patterns\n- OpenAPI documentation\n\n## Out of Scope\n- UI implementation (SD-006)\n- EVA logic (SD-003)\n- Agent runtime (SD-005)',
    '[{"objective": "Deploy all Chairman API endpoints", "key_results": ["6 endpoints live", "All return correct response shape", "Error responses follow standard format"]}, {"objective": "Document API contracts", "key_results": ["OpenAPI spec generated", "TypeScript types exported", "Example requests documented"]}]',
    '[{"metric": "Endpoint Availability", "target": "100%", "measurement": "All 6 endpoints respond"}, {"metric": "Response Schema Compliance", "target": "100%", "measurement": "Responses match TypeScript interfaces"}, {"metric": "API Documentation Coverage", "target": "100%", "measurement": "All endpoints documented in OpenAPI"}]',
    '[{"principle": "Contract-first API design", "description": "Define interfaces before implementation"}, {"principle": "Consistent error responses", "description": "Standard error format"}, {"principle": "Authentication via Supabase", "description": "Use existing auth"}]'::jsonb,
    'draft',
    'LEAD_APPROVAL',
    'feature',
    'critical',
    'SD-VISION-V2-000',
    'EHG_Engineer',
    2,
    '[{"risk": "Contract changes mid-development", "severity": "medium", "mitigation": "Lock contracts before SD-006 starts"}, {"risk": "Performance issues with large datasets", "severity": "medium", "mitigation": "Implement pagination from start"}]'::jsonb,
    '[{"dependency": "SD-VISION-V2-001", "type": "technical", "status": "pending"}]'::jsonb,
    '[{"criterion": "All 6 endpoints deployed and responding", "measure": "API test"}, {"criterion": "Response shapes match spec interfaces", "measure": "Type check"}, {"criterion": "OpenAPI documentation generated", "measure": "Spec file exists"}, {"criterion": "Error responses follow standard format", "measure": "Unit test"}]'::jsonb,
    '[{"guideline": "Create route handlers in Express/Next.js API routes", "rationale": "Standard pattern"}, {"guideline": "Implement response transformers", "rationale": "Match spec shapes"}, {"guideline": "Generate OpenAPI spec", "rationale": "Documentation"}]'::jsonb,
    '{"vision_spec_references": {"primary": [{"spec": "02-api-contracts.md", "path": "docs/vision/specs/02-api-contracts.md", "sections": ["all"]}], "must_read_before_prd": ["docs/vision/specs/02-api-contracts.md"], "must_read_before_exec": ["docs/vision/specs/02-api-contracts.md"]}, "implementation_guidance": {"critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION", "creation_mode": "CREATE_FROM_NEW", "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new. Do not modify existing files - create fresh implementations per the vision specs."}, "prd_requirements": {"technical_context_must_cite": ["02-api-contracts.md endpoint definitions", "TypeScript interfaces from spec"], "implementation_approach_must_reference": ["response shapes from spec", "error handling patterns from spec"]}}'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- SD-VISION-V2-003: EVA Orchestration Layer
-- ----------------------------------------------------------------------------
INSERT INTO public.strategic_directives_v2 (
    id, sd_key, title, description, rationale, scope, strategic_objectives, success_metrics,
    key_principles, status, current_phase, category, priority,
    parent_sd_id, target_application, sequence_rank,
    risks, dependencies, success_criteria, implementation_guidelines, metadata, created_at, updated_at
) VALUES (
    'SD-VISION-V2-003',
    'vision-v2-eva-orchestration',
    'Vision V2: EVA Orchestration Layer',
    E'## Description\n\nImplement the EVA orchestration layer as specified in [04-eva-orchestration.md](/docs/vision/specs/04-eva-orchestration.md).\n\nEVA is the AI COO - the orchestrator between Chairman and Venture CEOs.\n\n### Core Responsibilities\n1. **Command Interpretation** - Parse Chairman natural language directives\n2. **Task Contract Lifecycle** - Manage pending → claimed → completed flow\n3. **Morning Briefing Generation** - `fn_chairman_briefing()` function\n4. **Token Budget Enforcement** - Soft cap 85%, hard cap 100%\n5. **Circuit Breaker System** - Burn rate anomaly detection\n6. **Flat Mode Crew Dispatch** - Direct crew management for simple tasks\n\n### EVA Modes\n- **Delegated Mode**: Routes to Venture CEOs\n- **Flat Mode**: Direct crew dispatch for simple operations\n\n### Token Budget System\n- Each venture has monthly token allocation\n- EVA tracks usage via `venture_token_ledger`\n- Soft cap (85%): Warning to Chairman\n- Hard cap (100%): Pause venture operations',
    'EVA is the bridge between human intent (Chairman) and AI execution (CEOs/Crews). Without EVA, Chairman would need to micromanage every agent. EVA enables the "Glass Cockpit" experience.',
    E'## In Scope\n- Command interpretation engine\n- Task contract state machine\n- fn_chairman_briefing() implementation\n- Token budget tracking\n- Circuit breaker logic\n- Flat mode dispatch\n\n## Out of Scope\n- Venture CEO Runtime (SD-005)\n- crewAI agent implementations\n- UI components (SD-006)',
    '[{"objective": "Implement EVA command interpretation", "key_results": ["Natural language parsing", "Intent classification", "Parameter extraction"]}, {"objective": "Deploy token budget system", "key_results": ["venture_token_ledger tracking", "Soft cap alerts at 85%", "Hard cap enforcement at 100%"]}, {"objective": "Build circuit breaker protection", "key_results": ["Burn rate monitoring", "Anomaly detection", "Auto-pause on breach"]}]',
    '[{"metric": "Command Recognition Accuracy", "target": ">90%", "measurement": "Test suite of common commands"}, {"metric": "Token Budget Enforcement", "target": "100%", "measurement": "No ventures exceed hard cap"}, {"metric": "Circuit Breaker Response Time", "target": "<1min", "measurement": "Time from anomaly to pause"}]',
    '[{"principle": "EVA is orchestrator, not executor", "description": "Routes tasks, doesnt execute them"}, {"principle": "Token budgets are venture-level", "description": "Track per venture"}, {"principle": "Circuit breakers fail-safe", "description": "Pause on breach, dont continue"}]'::jsonb,
    'draft',
    'LEAD_APPROVAL',
    'feature',
    'critical',
    'SD-VISION-V2-000',
    'EHG_Engineer',
    3,
    '[{"risk": "Command misinterpretation", "severity": "medium", "mitigation": "Confirmation for destructive actions"}, {"risk": "Token tracking drift", "severity": "high", "mitigation": "Reconciliation job daily"}, {"risk": "Circuit breaker false positives", "severity": "low", "mitigation": "Tunable thresholds"}]'::jsonb,
    '[{"dependency": "SD-VISION-V2-002", "type": "technical", "status": "pending"}]'::jsonb,
    '[{"criterion": "EVA parses Chairman directives correctly", "measure": "Test suite"}, {"criterion": "Task contracts transition through lifecycle states", "measure": "State machine test"}, {"criterion": "fn_chairman_briefing() returns valid briefing JSON", "measure": "DB function test"}, {"criterion": "Token budget caps trigger correctly", "measure": "Integration test"}]'::jsonb,
    '[{"guideline": "Build command parser with intent classification", "rationale": "NL understanding"}, {"guideline": "Implement task contract state machine", "rationale": "Lifecycle management"}, {"guideline": "Create fn_chairman_briefing() database function", "rationale": "Morning briefing source"}]'::jsonb,
    '{"vision_spec_references": {"primary": [{"spec": "04-eva-orchestration.md", "path": "docs/vision/specs/04-eva-orchestration.md", "sections": ["all"]}], "must_read_before_prd": ["docs/vision/specs/04-eva-orchestration.md"], "must_read_before_exec": ["docs/vision/specs/04-eva-orchestration.md", "VISION_V2_GLASS_COCKPIT.md"]}, "implementation_guidance": {"critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION", "creation_mode": "CREATE_FROM_NEW", "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new. Do not modify existing files - create fresh implementations per the vision specs."}, "prd_requirements": {"technical_context_must_cite": ["EVA modes from spec", "Token budget thresholds", "Circuit breaker rules"]}}'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- SD-VISION-V2-004: Agent Registry & Hierarchy
-- ----------------------------------------------------------------------------
INSERT INTO public.strategic_directives_v2 (
    id, sd_key, title, description, rationale, scope, strategic_objectives, success_metrics,
    key_principles, status, current_phase, category, priority,
    parent_sd_id, target_application, sequence_rank,
    risks, dependencies, success_criteria, implementation_guidelines, metadata, created_at, updated_at
) VALUES (
    'SD-VISION-V2-004',
    'vision-v2-agent-registry',
    'Vision V2: Agent Registry & Hierarchy',
    E'## Description\n\nImplement the agent registry and hierarchical management system as specified in [06-hierarchical-agent-architecture.md](/docs/vision/specs/06-hierarchical-agent-architecture.md).\n\n### Tables to Create\n- `agent_registry` - Central agent catalog with LTREE hierarchy_path\n- `agent_relationships` - from_agent, to_agent, relationship_type\n- `agent_memory_stores` - Persistent context for CEO/VP agents\n- `tool_registry` - Shared tool catalog\n- `tool_access_grants` - Per-agent tool permissions\n- `agent_messages` - Cross-agent communication protocol\n\n### Well-Known Agent IDs\n- Chairman: `00000000-0000-0000-0000-000000000001`\n- EVA: `00000000-0000-0000-0000-000000000002`\n\n### Hierarchy Structure (LTREE)\n```\nchairman\nchairman.eva\nchairman.eva.{venture_slug}_ceo\nchairman.eva.{venture_slug}_ceo.vp_strategy\nchairman.eva.{venture_slug}_ceo.vp_strategy.market_research_crew\n```\n\n### Tool Access Model\nTools are registered globally, then granted to specific agents. Grants cascade down hierarchy (CEO grant implies VP and Crew access).',
    'The agent registry is the backbone of the hierarchical architecture. Without a proper registry with LTREE paths, we cannot implement proper delegation, escalation, or tool access control.',
    E'## In Scope\n- 6 agent management tables\n- LTREE hierarchy implementation\n- Bootstrap Chairman and EVA agents\n- Tool registry with seed data\n- Message protocol definition\n\n## Out of Scope\n- Venture CEO runtime (SD-005)\n- crewAI agent code\n- UI for agent management',
    '[{"objective": "Deploy agent registry with LTREE", "key_results": ["agent_registry table live", "LTREE extension enabled", "Hierarchy queries working"]}, {"objective": "Bootstrap well-known agents", "key_results": ["Chairman agent created", "EVA agent created", "Relationship established"]}, {"objective": "Implement tool access system", "key_results": ["tool_registry populated", "Grant cascade working", "Permission checks functional"]}]',
    '[{"metric": "Agent Registry Tables", "target": "6/6", "measurement": "All tables created"}, {"metric": "LTREE Query Performance", "target": "<50ms", "measurement": "Hierarchy traversal queries"}, {"metric": "Tool Grant Cascade", "target": "100%", "measurement": "Child agents inherit parent grants"}]',
    '[{"principle": "LTREE for hierarchy", "description": "Efficient path-based queries"}, {"principle": "Well-known IDs for system agents", "description": "Chairman and EVA have fixed UUIDs"}, {"principle": "Tool grants cascade down", "description": "CEO grant implies VP and Crew access"}]'::jsonb,
    'draft',
    'LEAD_APPROVAL',
    'infrastructure',
    'high',
    'SD-VISION-V2-000',
    'EHG_Engineer',
    4,
    '[{"risk": "LTREE extension missing", "severity": "high", "mitigation": "Include extension creation in migration"}, {"risk": "Hierarchy corruption", "severity": "high", "mitigation": "Validate paths on insert/update"}, {"risk": "Tool grant conflicts", "severity": "medium", "mitigation": "Clear override rules"}]'::jsonb,
    '[{"dependency": "SD-VISION-V2-002", "type": "technical", "status": "pending"}]'::jsonb,
    '[{"criterion": "agent_registry table created with LTREE column", "measure": "SQL check"}, {"criterion": "Chairman and EVA agents bootstrapped with well-known IDs", "measure": "Query check"}, {"criterion": "agent_relationships table links Chairman to EVA", "measure": "FK check"}, {"criterion": "tool_access_grants cascades to children", "measure": "Integration test"}]'::jsonb,
    '[{"guideline": "Enable LTREE extension", "rationale": "Required for hierarchy"}, {"guideline": "Create agent registry tables", "rationale": "Foundation"}, {"guideline": "Bootstrap Chairman and EVA", "rationale": "Well-known agents"}]'::jsonb,
    '{"vision_spec_references": {"primary": [{"spec": "06-hierarchical-agent-architecture.md", "path": "docs/vision/specs/06-hierarchical-agent-architecture.md", "sections": ["1-5"]}], "must_read_before_prd": ["docs/vision/specs/06-hierarchical-agent-architecture.md"], "must_read_before_exec": ["docs/vision/specs/06-hierarchical-agent-architecture.md"]}, "implementation_guidance": {"critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION", "creation_mode": "CREATE_FROM_NEW", "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new. Do not modify existing files - create fresh implementations per the vision specs."}, "prd_requirements": {"technical_context_must_cite": ["LTREE hierarchy structure from spec", "Well-known agent IDs", "Tool access model"]}}'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- SD-VISION-V2-005: Venture CEO Runtime & Factory
-- ----------------------------------------------------------------------------
INSERT INTO public.strategic_directives_v2 (
    id, sd_key, title, description, rationale, scope, strategic_objectives, success_metrics,
    key_principles, status, current_phase, category, priority,
    parent_sd_id, target_application, sequence_rank,
    risks, dependencies, success_criteria, implementation_guidelines, metadata, created_at, updated_at
) VALUES (
    'SD-VISION-V2-005',
    'vision-v2-ceo-runtime',
    'Vision V2: Venture CEO Runtime & Factory',
    E'## Description\n\nImplement the Venture CEO Runtime and Factory as specified in [06-hierarchical-agent-architecture.md](/docs/vision/specs/06-hierarchical-agent-architecture.md) Sections 6-10.\n\n### VentureFactory.instantiateVenture()\nFactory function that creates:\n- 1x Venture CEO agent\n- 4x VP agents (Strategy, Product, Tech, Growth)\n- 14x Crew agents (Market Research, Dev, QA, etc.)\n\n### CEO Runtime Loop\n1. Consume messages from inbox\n2. Classify message type\n3. Route to appropriate handler\n4. Execute handler\n5. Send response/delegate\n\n### Handoff Protocol\n- VP proposes → CEO reviews → CEO commits\n- No VP can directly modify venture state\n\n### EVA Delegated Mode\nEVA routes Chairman tasks to appropriate CEO based on venture context.\n\n## ⚠️ MANDATORY 25-STAGE INSULATION REQUIREMENTS\n\n```\nCEO Runtime operates as OBSERVER-COMMITTER, not LOGIC-OWNER:\n\n1. READ-ONLY queries to venture_stage_work (never direct writes)\n2. Stage transitions ONLY via fn_advance_venture_stage()\n3. Respects existing gate types (auto/advisory/hard)\n4. No direct crew dispatch - delegates to VPs only\n5. Existing stage triggers, functions, policies UNCHANGED\n```\n\nViolation of these constraints will result in IMMEDIATE SD rejection.',
    'The CEO Runtime is where autonomous venture operations happen. Without this, Chairman must manually orchestrate every venture. The Factory enables rapid venture spin-up with consistent structure.',
    E'## In Scope\n- VentureFactory.instantiateVenture() function\n- Standard venture template (CEO + 4 VPs + 14 crews)\n- CEO runtime loop implementation\n- Inbox consumer and handler engine\n- Handoff protocol (VP → CEO commit)\n- EVA delegated mode routing\n- Test venture "TestCo" instantiation\n\n## Out of Scope\n- Direct venture_stage_work modifications\n- New stage transition logic\n- UI components\n\n## EXPLICITLY FORBIDDEN\n- Any INSERT/UPDATE/DELETE on venture_stage_work\n- Bypassing fn_advance_venture_stage()\n- Ignoring gate types\n- Adding columns to existing stage tables',
    '[{"objective": "Implement VentureFactory", "key_results": ["instantiateVenture() creates full hierarchy", "19 agents per venture (1 CEO + 4 VPs + 14 crews)", "Tool grants propagate correctly"]}, {"objective": "Deploy CEO Runtime", "key_results": ["Inbox consumer processes messages", "Handler registry by type", "Handoff protocol enforced"]}, {"objective": "Verify 25-stage insulation", "key_results": ["Zero direct writes to venture_stage_work", "All transitions via fn_advance_venture_stage()", "Gate types respected"]}]',
    '[{"metric": "Venture Instantiation Success", "target": "100%", "measurement": "TestCo created with full hierarchy"}, {"metric": "25-Stage Integrity", "target": "100%", "measurement": "Zero schema changes to venture_stage_work"}, {"metric": "Gate Compliance", "target": "100%", "measurement": "All gate types respected in E2E test"}]',
    '[{"principle": "OBSERVER-COMMITTER pattern for CEO", "description": "CEO observes state but only commits via existing functions"}, {"principle": "VPs propose, CEO commits", "description": "Hierarchy of approval"}, {"principle": "25-stage workflow is READ-ONLY", "description": "No modifications to existing stage logic"}]'::jsonb,
    'draft',
    'LEAD_APPROVAL',
    'feature',
    'high',
    'SD-VISION-V2-000',
    'EHG_Engineer',
    5,
    '[{"risk": "25-stage workflow violation", "severity": "critical", "mitigation": "E2E tests verify no direct writes"}, {"risk": "CEO runaway loops", "severity": "high", "mitigation": "Deadline watchdog, iteration limits"}, {"risk": "Handoff deadlocks", "severity": "medium", "mitigation": "Timeout with escalation to EVA"}]'::jsonb,
    '[{"dependency": "SD-VISION-V2-003", "type": "technical", "status": "pending"}, {"dependency": "SD-VISION-V2-004", "type": "technical", "status": "pending"}]'::jsonb,
    '[{"criterion": "VentureFactory.instantiateVenture() creates CEO + 4 VPs + 14 crews", "measure": "Unit test"}, {"criterion": "CEO runtime consumes messages and routes to handlers", "measure": "Integration test"}, {"criterion": "VP handoff protocol enforced", "measure": "E2E test"}, {"criterion": "Zero direct writes to venture_stage_work verified", "measure": "Code audit"}, {"criterion": "TestCo venture instantiated successfully", "measure": "Smoke test"}]'::jsonb,
    '[{"guideline": "Create VentureFactory class", "rationale": "Encapsulate venture creation"}, {"guideline": "Build CEO runtime loop", "rationale": "Core execution engine"}, {"guideline": "Extensive E2E testing for 25-stage insulation", "rationale": "Critical safety requirement"}]'::jsonb,
    '{"vision_spec_references": {"primary": [{"spec": "06-hierarchical-agent-architecture.md", "path": "docs/vision/specs/06-hierarchical-agent-architecture.md", "sections": ["6-10"]}], "must_read_before_prd": ["docs/vision/specs/06-hierarchical-agent-architecture.md"], "must_read_before_exec": ["docs/vision/specs/06-hierarchical-agent-architecture.md", "VISION_V2_GLASS_COCKPIT.md"]}, "implementation_guidance": {"critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION", "creation_mode": "CREATE_FROM_NEW", "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new. Do not modify existing files - create fresh implementations per the vision specs."}, "prd_requirements": {"technical_context_must_cite": ["CEO Runtime loop from spec", "Handoff protocol from spec", "25-stage insulation requirements"]}, "governance": {"25_stage_insulation": {"policy": "OBSERVER_COMMITTER_ONLY", "forbidden": ["direct venture_stage_work writes", "bypass fn_advance_venture_stage", "ignore gate types"], "mandatory_tests": ["E2E verify no direct writes", "gate validation triggers fire"]}}}'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- SD-VISION-V2-006: Chairman's Dashboard UI
-- ----------------------------------------------------------------------------
INSERT INTO public.strategic_directives_v2 (
    id, sd_key, title, description, rationale, scope, strategic_objectives, success_metrics,
    key_principles, status, current_phase, category, priority,
    parent_sd_id, target_application, sequence_rank,
    risks, dependencies, success_criteria, implementation_guidelines, metadata, created_at, updated_at
) VALUES (
    'SD-VISION-V2-006',
    'vision-v2-chairman-dashboard',
    'Vision V2: Chairman''s Dashboard UI',
    E'## Description\n\nImplement the Chairman''s Dashboard UI components as specified in [03-ui-components.md](/docs/vision/specs/03-ui-components.md).\n\n### Target Application: EHG (not EHG_Engineer)\n\n### Routes\n- `/chairman` - Main dashboard with briefing\n- `/chairman/decisions` - Decision stack view\n- `/chairman/portfolio` - Portfolio health view\n\n### Components\n1. **BriefingDashboard** - Morning briefing display\n   - EVA greeting\n   - System status (nominal/warning/critical)\n   - Priority updates list\n   - Quick actions\n\n2. **DecisionStack** - Pending decisions\n   - Card stack with swipe actions\n   - Approve (right) / Reject (left) / Modify (up)\n   - Decision context expansion\n\n3. **PortfolioSummary** - Venture health overview\n   - Active/Paused/Killed counts\n   - Stage distribution chart\n   - Token budget progress bars\n\n4. **TokenBudgetBar** - Per-venture budget visualization\n   - Progress bar with soft/hard cap markers\n   - Color coding (green/yellow/red)\n\n### Design Philosophy: Glass Cockpit\n- Progressive disclosure\n- "Captain Picard on Bridge" feel\n- Minimal chrome, maximum information density',
    'The UI is how Chairman (Rick) interacts with the system. Without the dashboard, all backend work is invisible. The UI must feel like a "Glass Cockpit" - calm, omniscient, decision-focused.',
    E'## In Scope\n- /chairman route and sub-routes\n- BriefingDashboard component\n- DecisionStack with swipe actions\n- PortfolioSummary visualization\n- TokenBudgetBar component\n- Mobile responsive design\n\n## Out of Scope\n- Venture detail UI (existing)\n- Agent management UI\n- crewAI visualization',
    '[{"objective": "Deploy Chairman routes", "key_results": ["/chairman route live", "/chairman/decisions accessible", "/chairman/portfolio working"]}, {"objective": "Implement core components", "key_results": ["BriefingDashboard renders briefing", "DecisionStack has swipe actions", "PortfolioSummary shows health"]}, {"objective": "Achieve Glass Cockpit feel", "key_results": ["Progressive disclosure working", "Minimal chrome design", "Mobile responsive"]}]',
    '[{"metric": "Route Availability", "target": "100%", "measurement": "All 3 routes respond"}, {"metric": "Component Render Success", "target": "100%", "measurement": "No console errors on load"}, {"metric": "Mobile Responsiveness", "target": "100%", "measurement": "Works on 375px width"}]',
    '[{"principle": "Progressive disclosure", "description": "Show more detail on demand"}, {"principle": "Glass Cockpit aesthetic", "description": "Calm, minimal, decision-focused"}, {"principle": "Mobile-first responsive", "description": "Works on all screen sizes"}]'::jsonb,
    'draft',
    'LEAD_APPROVAL',
    'feature',
    'high',
    'SD-VISION-V2-000',
    'EHG',
    6,
    '[{"risk": "API contract mismatch", "severity": "medium", "mitigation": "TypeScript interfaces from SD-002"}, {"risk": "Swipe gesture issues", "severity": "low", "mitigation": "Fallback buttons for accessibility"}, {"risk": "Performance with large portfolios", "severity": "medium", "mitigation": "Virtualized lists"}]'::jsonb,
    '[{"dependency": "SD-VISION-V2-005", "type": "technical", "status": "pending"}]'::jsonb,
    '[{"criterion": "/chairman renders BriefingDashboard", "measure": "UI test"}, {"criterion": "DecisionStack displays pending decisions with swipe actions", "measure": "Interaction test"}, {"criterion": "PortfolioSummary shows venture health overview", "measure": "Visual test"}, {"criterion": "Mobile responsive at 375px width", "measure": "Responsive test"}]'::jsonb,
    '[{"guideline": "Create /chairman routes in EHG app", "rationale": "Entry points"}, {"guideline": "Build BriefingDashboard component", "rationale": "Core UI"}, {"guideline": "Apply responsive design", "rationale": "Mobile support"}]'::jsonb,
    '{"vision_spec_references": {"primary": [{"spec": "03-ui-components.md", "path": "docs/vision/specs/03-ui-components.md", "sections": ["all"]}], "philosophy": [{"spec": "VISION_V2_GLASS_COCKPIT.md", "path": "VISION_V2_GLASS_COCKPIT.md"}], "must_read_before_prd": ["docs/vision/specs/03-ui-components.md", "VISION_V2_GLASS_COCKPIT.md"], "must_read_before_exec": ["docs/vision/specs/03-ui-components.md", "VISION_V2_GLASS_COCKPIT.md"]}, "implementation_guidance": {"critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION", "creation_mode": "CREATE_FROM_NEW", "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new. Do not modify existing files - create fresh implementations per the vision specs."}, "prd_requirements": {"technical_context_must_cite": ["Component hierarchy from spec", "Design philosophy from Glass Cockpit doc", "Progressive disclosure pattern"]}}'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- SD-VISION-V2-007: Integration Verification
-- ----------------------------------------------------------------------------
INSERT INTO public.strategic_directives_v2 (
    id, sd_key, title, description, rationale, scope, strategic_objectives, success_metrics,
    key_principles, status, current_phase, category, priority,
    parent_sd_id, target_application, sequence_rank,
    risks, dependencies, success_criteria, implementation_guidelines, metadata, created_at, updated_at
) VALUES (
    'SD-VISION-V2-007',
    'vision-v2-integration-verification',
    'Vision V2: Integration Verification',
    E'## Description\n\nEnd-to-end integration verification of the complete Vision V2 system.\n\n### Full Flow Test\n```\nChairman (directive)\n    ↓\nEVA (interpretation)\n    ↓\nVenture CEO (delegation)\n    ↓\nVP (task assignment)\n    ↓\nCrew (artifact creation)\n    ↓\nBriefing (result visible)\n```\n\n### Test Scenarios\n1. **Happy Path**: Chairman → Briefing full flow\n2. **Circuit Breaker**: Trigger on burn rate violation\n3. **Token Budget**: Soft cap warning, hard cap pause\n4. **RLS Security**: Non-Chairman access blocked\n5. **25-Stage Integrity**: No workflow modifications\n\n### Deliverables\n- E2E test suite\n- Performance benchmarks\n- Security verification report\n- UI smoke test results\n- Integration verification report',
    'Integration verification ensures all components work together. Individual SDs may pass but integration can still fail. This dedicated verification SD catches integration issues before technical debt cleanup.',
    E'## In Scope\n- Full flow E2E tests\n- Circuit breaker trigger tests\n- RLS security verification\n- UI smoke tests\n- Performance benchmarks\n- Verification report generation\n\n## Out of Scope\n- Bug fixes (create new SDs)\n- Performance optimization (future SD)\n- UI polish (future SD)',
    '[{"objective": "Verify full flow integration", "key_results": ["Chairman → Briefing test passes", "All intermediate steps logged", "Artifacts created correctly"]}, {"objective": "Verify safety systems", "key_results": ["Circuit breaker triggers", "Token budget enforced", "RLS blocks unauthorized"]}, {"objective": "Document verification results", "key_results": ["E2E test report", "Security audit", "Performance baseline"]}]',
    '[{"metric": "E2E Test Pass Rate", "target": ">95%", "measurement": "Test suite results"}, {"metric": "Security Verification", "target": "100%", "measurement": "RLS audit pass"}, {"metric": "Full Flow Completion", "target": "100%", "measurement": "Chairman → Briefing works"}]',
    '[{"principle": "Test before cleanup", "description": "Verify integration works before removing legacy"}, {"principle": "Document everything", "description": "Create reports and evidence"}, {"principle": "Create SDs for discovered issues", "description": "Dont fix inline, track properly"}]'::jsonb,
    'draft',
    'LEAD_APPROVAL',
    'security',
    'critical',
    'SD-VISION-V2-000',
    'EHG_Engineer',
    7,
    '[{"risk": "Integration failures", "severity": "high", "mitigation": "Detailed failure logging"}, {"risk": "Test environment issues", "severity": "medium", "mitigation": "Use staging environment"}, {"risk": "Security gaps", "severity": "critical", "mitigation": "External security review"}]'::jsonb,
    '[{"dependency": "SD-VISION-V2-006", "type": "technical", "status": "pending"}]'::jsonb,
    '[{"criterion": "Full flow test passes: Chairman to Briefing", "measure": "E2E test"}, {"criterion": "Circuit breaker triggers on burn rate violation", "measure": "Load test"}, {"criterion": "RLS blocks non-Chairman access", "measure": "Security test"}, {"criterion": "Verification report generated", "measure": "Doc exists"}]'::jsonb,
    '[{"guideline": "Create E2E test suite with Playwright", "rationale": "Automated verification"}, {"guideline": "Write RLS verification queries", "rationale": "Security audit"}, {"guideline": "Generate verification report", "rationale": "Documentation"}]'::jsonb,
    '{"vision_spec_references": {"primary": [{"spec": "all-vision-specs", "path": "docs/vision/specs/", "purpose": "verify implementation matches specs"}], "must_read_before_exec": ["docs/vision/specs/01-database-schema.md", "docs/vision/specs/02-api-contracts.md", "docs/vision/specs/03-ui-components.md", "docs/vision/specs/04-eva-orchestration.md", "docs/vision/specs/06-hierarchical-agent-architecture.md"]}, "implementation_guidance": {"critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION", "creation_mode": "CREATE_FROM_NEW", "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new. Do not modify existing files - create fresh implementations per the vision specs."}, "verification_requirements": {"must_validate_against_specs": true, "spec_compliance_checklist_required": true}}'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- SD-VISION-V2-008: Technical Debt Cleanup
-- ----------------------------------------------------------------------------
INSERT INTO public.strategic_directives_v2 (
    id, sd_key, title, description, rationale, scope, strategic_objectives, success_metrics,
    key_principles, status, current_phase, category, priority,
    parent_sd_id, target_application, sequence_rank,
    risks, dependencies, success_criteria, implementation_guidelines, metadata, created_at, updated_at
) VALUES (
    'SD-VISION-V2-008',
    'vision-v2-tech-debt-cleanup',
    'Vision V2: Technical Debt Cleanup',
    E'## Description\n\nLegacy code removal and bridge layer sunset planning after Vision V2 integration is verified.\n\n### From Cursor Assessment\n- Remove legacy 52-stage code remnants (consolidated to 25 in recent refactor)\n- Consolidate stale/duplicate routes\n- Delete orphaned components from previous iterations\n- Clean up unused database objects\n\n### From OpenAI Codex Assessment\n- Document gaps for Phase 2 (legal/IP workflow, customer discovery)\n- Flag security/privacy separation concerns for future SDs\n\n### Bridge Layer Sunset\n- Define `HybridOrchestrator` deprecation criteria\n- Set sunset date (90 days after all ventures migrated)\n- Create migration checklist for remaining legacy ventures\n- Document dual-system maintenance procedures until sunset\n\n### Archive Cleanup\n- Define retention policy for `governance_archive` schema\n- Create cleanup scripts for orphaned FK references\n- Document archive query patterns for historical lookups',
    'Technical debt accumulates during rapid development. After verifying the new system works (SD-007), we can safely remove legacy code. This prevents confusion and reduces maintenance burden.',
    E'## In Scope\n- Legacy 52-stage code removal\n- Duplicate route consolidation\n- Orphaned component deletion\n- Bridge layer sunset planning\n- Archive retention policy\n- Phase 2 gap documentation\n\n## Out of Scope\n- Phase 2 implementation\n- New feature development\n- Performance optimization',
    '[{"objective": "Remove legacy code", "key_results": ["Zero 52-stage references", "No duplicate routes", "Orphaned components deleted"]}, {"objective": "Plan bridge sunset", "key_results": ["Deprecation criteria defined", "Sunset date set", "Migration checklist created"]}, {"objective": "Define archive policy", "key_results": ["Retention period defined", "Cleanup scripts written", "Query patterns documented"]}]'::jsonb,
    '[{"metric": "Legacy Code References", "target": "0", "measurement": "Grep for 52-stage patterns"}, {"metric": "Duplicate Routes", "target": "0", "measurement": "Route audit"}, {"metric": "Bundle Size Reduction", "target": ">5%", "measurement": "Build output comparison"}]'::jsonb,
    '[{"principle": "Clean up only after verification", "description": "Never delete code until new system is proven"}, {"principle": "Document before deleting", "description": "Record what was removed and why"}, {"principle": "Sunset with clear criteria", "description": "Define specific conditions for deprecation"}]'::jsonb,
    'draft',
    'LEAD_APPROVAL',
    'infrastructure',
    'high',
    'SD-VISION-V2-000',
    'EHG_Engineer',
    8,
    '[{"risk": "Accidental deletion of needed code", "severity": "high", "mitigation": "Review before delete, git history"}, {"risk": "Breaking legacy ventures", "severity": "medium", "mitigation": "Migration before sunset"}, {"risk": "Archive bloat", "severity": "low", "mitigation": "Defined retention policy"}]'::jsonb,
    '["SD-VISION-V2-007"]'::jsonb,
    '[{"criterion": "Zero references to 52-stage workflow", "measure": "Grep returns empty"}, {"criterion": "Route audit complete", "measure": "No duplicate/stale routes"}, {"criterion": "Orphaned components removed", "measure": "Bundle size reduced >5%"}, {"criterion": "Bridge sunset documented", "measure": "Criteria and date defined"}, {"criterion": "Archive policy defined", "measure": "1 year retention documented"}, {"criterion": "Phase 2 backlog created", "measure": "Technical debt items logged"}]'::jsonb,
    '[{"guideline": "Grep codebase for 52-stage references first", "rationale": "Identify scope before deletion"}, {"guideline": "Audit routes for duplicates", "rationale": "Prevent confusion from stale endpoints"}, {"guideline": "Create deletion PRs with review", "rationale": "Peer review prevents accidents"}, {"guideline": "Document bridge sunset criteria", "rationale": "Clear conditions for deprecation"}]'::jsonb,
    '{"vision_spec_references": {"phase2_gaps": ["legal/IP workflow", "customer discovery"], "archive_retention": {"schema": "governance_archive", "policy": "1 year"}}, "implementation_guidance": {"critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION", "creation_mode": "CREATE_FROM_NEW", "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new. Do not modify existing files - create fresh implementations per the vision specs."}, "cleanup_targets": {"legacy_patterns": ["52-stage references"], "bridge_sunset": {"criteria": "all ventures migrated", "grace_period_days": 90}}}'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- ============================================================================
-- PART 7: Create Phase Progress Records
-- ============================================================================

-- Insert phase tracking for all Vision V2 SDs
INSERT INTO public.sd_phase_tracking (sd_id, phase_name, progress, is_complete, started_at)
SELECT
    id,
    'LEAD_APPROVAL',
    0,
    false,
    NOW()
FROM public.strategic_directives_v2
WHERE id LIKE 'SD-VISION-V2-%'
ON CONFLICT (sd_id, phase_name) DO NOTHING;

-- ============================================================================
-- PART 8: Verification Queries
-- ============================================================================

DO $$
DECLARE
    v_sd_count INT;
    v_parent_count INT;
    v_child_count INT;
    v_progress_count INT;
    v_archive_sd_count INT;
BEGIN
    -- Count seeded SDs
    SELECT COUNT(*) INTO v_sd_count
    FROM public.strategic_directives_v2
    WHERE id LIKE 'SD-VISION-V2-%';

    -- Count parent SDs
    SELECT COUNT(*) INTO v_parent_count
    FROM public.strategic_directives_v2
    WHERE id LIKE 'SD-VISION-V2-%' AND relationship_type = 'parent';

    -- Count child SDs
    SELECT COUNT(*) INTO v_child_count
    FROM public.strategic_directives_v2
    WHERE id LIKE 'SD-VISION-V2-%' AND relationship_type = 'child';

    -- Count phase progress records
    SELECT COUNT(*) INTO v_progress_count
    FROM public.sd_phase_tracking
    WHERE sd_id LIKE 'SD-VISION-V2-%';

    -- Count archived SDs
    SELECT COUNT(*) INTO v_archive_sd_count
    FROM governance_archive.strategic_directives;

    -- Verify counts
    IF v_sd_count != 9 THEN
        RAISE WARNING 'Expected 9 Vision V2 SDs, found %', v_sd_count;
    END IF;

    IF v_parent_count != 1 THEN
        RAISE WARNING 'Expected 1 parent SD, found %', v_parent_count;
    END IF;

    IF v_child_count != 8 THEN
        RAISE WARNING 'Expected 8 child SDs, found %', v_child_count;
    END IF;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'VISION V2 MIGRATION VERIFICATION';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Vision V2 SDs created: %', v_sd_count;
    RAISE NOTICE '  - Parent orchestrator: %', v_parent_count;
    RAISE NOTICE '  - Child SDs: %', v_child_count;
    RAISE NOTICE 'Phase progress records: %', v_progress_count;
    RAISE NOTICE 'Archived SDs: %', v_archive_sd_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration completed successfully at %', NOW();
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'ROLLBACK AVAILABLE:';
    RAISE NOTICE '  SELECT * FROM governance_archive.restore_all_from_archive();';
    RAISE NOTICE '';
    RAISE NOTICE 'RESTORE SINGLE SD:';
    RAISE NOTICE '  SELECT governance_archive.restore_sd_from_archive(''SD-XXX-YYY'');';
END $$;

-- ============================================================================
-- PART 9: Add Vision V2 Protocol Sections to CLAUDE Files
-- ============================================================================

-- Insert Vision V2 LEAD section
INSERT INTO public.leo_protocol_sections (
    protocol_id,
    section_type,
    title,
    content,
    order_index,
    context_tier,
    target_file,
    metadata
) VALUES (
    'leo-v4-3-3-ui-parity',
    'vision_v2_lead',
    'Vision V2 SD Handling (SD-VISION-V2-*)',
    E'### MANDATORY: Vision Spec Reference Check\n\n**For ALL SDs with ID matching `SD-VISION-V2-*`:**\n\nBefore LEAD approval, you MUST:\n\n1. **Read the SD''s metadata.vision_spec_references** field\n2. **Read ALL files listed in `must_read_before_prd`**\n3. **Verify scope aligns with referenced spec sections**\n\n```bash\n# Query SD metadata for vision references\npsql -c "SELECT metadata->''vision_spec_references'' FROM strategic_directives WHERE id = ''SD-VISION-V2-XXX'';"\n```\n\n### Vision Document Locations\n\n| Spec | Path | Content |\n|------|------|--------|\n| Database Schema | `docs/vision/specs/01-database-schema.md` | Tables, RLS, functions |\n| API Contracts | `docs/vision/specs/02-api-contracts.md` | Endpoints, TypeScript interfaces |\n| UI Components | `docs/vision/specs/03-ui-components.md` | React components, layouts |\n| EVA Orchestration | `docs/vision/specs/04-eva-orchestration.md` | EVA modes, token budgets |\n| Agent Hierarchy | `docs/vision/specs/06-hierarchical-agent-architecture.md` | LTREE, CEOs, VPs |\n| Glass Cockpit | `VISION_V2_GLASS_COCKPIT.md` | Design philosophy |\n\n### LEAD Approval Gate for Vision V2 SDs\n\n**Additional questions for Vision V2 SDs:**\n\n1. **Spec Alignment**: Does the SD scope match the referenced spec sections?\n2. **25-Stage Insulation**: If SD touches agents/CEOs, does it maintain READ-ONLY access to venture_stage_work?\n3. **Vision Document Traceability**: Are specific spec sections cited in the SD description?\n\n### Anti-Pattern: Approving Without Reading Specs\n\n**❌ Don''t do this:**\n> "SD-VISION-V2-003 looks good, approved."\n\n**✅ Do this instead:**\n> "Let me read `docs/vision/specs/04-eva-orchestration.md` first to verify the SD scope matches the spec..."\n> [After reading]\n> "SD-VISION-V2-003 scope aligns with spec Section 3 (Token Budget System). Approved."',
    999,
    'PHASE_LEAD',
    'CLAUDE_LEAD.md',
    '{"added_for": "Vision V2 transition", "added_date": "2025-12-13"}'::jsonb
) ON CONFLICT DO NOTHING;

-- Insert Vision V2 PLAN section
INSERT INTO public.leo_protocol_sections (
    protocol_id,
    section_type,
    title,
    content,
    order_index,
    context_tier,
    target_file,
    metadata
) VALUES (
    'leo-v4-3-3-ui-parity',
    'vision_v2_plan',
    'Vision V2 PRD Requirements (SD-VISION-V2-*)',
    E'### MANDATORY: Vision Spec Integration in PRDs\n\n**For ALL PRDs for SDs matching `SD-VISION-V2-*`:**\n\nBefore creating a PRD, you MUST:\n\n1. **Query SD metadata for vision spec references**\n2. **Read ALL files listed in `must_read_before_prd`**\n3. **Include vision spec citations in PRD sections**\n\n```bash\n# Get vision spec references from SD metadata\npsql -c "SELECT metadata->''vision_spec_references''->''must_read_before_prd'' FROM strategic_directives WHERE id = ''SD-VISION-V2-XXX'';"\n```\n\n### PRD Section Requirements for Vision V2\n\n| PRD Section | Vision Spec Requirement |\n|-------------|------------------------|\n| `technical_context` | MUST cite specific spec sections that define the implementation |\n| `implementation_approach` | MUST reference spec patterns/examples |\n| `acceptance_criteria` | MUST include "Matches spec Section X" criteria |\n| `metadata` | MUST include `vision_spec_references` from parent SD |\n\n### PRD Template Addition for Vision V2\n\nAdd this to PRD''s `technical_context`:\n\n```markdown\n### Vision Specification References\n\nThis PRD implements requirements from:\n- **Primary Spec**: [spec-name.md](path/to/spec) - Sections X, Y, Z\n- **Design Philosophy**: [VISION_V2_GLASS_COCKPIT.md](VISION_V2_GLASS_COCKPIT.md)\n\nKey spec requirements addressed:\n1. [Requirement from spec Section X]\n2. [Requirement from spec Section Y]\n```\n\n### PRD Validation Gate for Vision V2\n\n**Before PLAN → EXEC handoff, verify:**\n\n- [ ] PRD `technical_context` cites vision spec sections\n- [ ] PRD `implementation_approach` references spec patterns\n- [ ] PRD `acceptance_criteria` includes spec compliance checks\n- [ ] PRD `metadata.vision_spec_references` populated from SD',
    999,
    'PHASE_PLAN',
    'CLAUDE_PLAN.md',
    '{"added_for": "Vision V2 transition", "added_date": "2025-12-13"}'::jsonb
) ON CONFLICT DO NOTHING;

-- Insert Vision V2 EXEC section
INSERT INTO public.leo_protocol_sections (
    protocol_id,
    section_type,
    title,
    content,
    order_index,
    context_tier,
    target_file,
    metadata
) VALUES (
    'leo-v4-3-3-ui-parity',
    'vision_v2_exec',
    'Vision V2 Implementation Requirements (SD-VISION-V2-*)',
    E'### MANDATORY: Vision Spec Consultation Before Implementation\n\n**For ALL implementations of SDs matching `SD-VISION-V2-*`:**\n\nBefore writing any code, you MUST:\n\n1. **Query SD metadata for vision spec references**\n2. **Read ALL files listed in `must_read_before_exec`**\n3. **Follow patterns and structures defined in specs**\n\n```bash\n# Get vision spec references from SD metadata\npsql -c "SELECT metadata->''vision_spec_references''->''must_read_before_exec'' FROM strategic_directives WHERE id = ''SD-VISION-V2-XXX'';"\n```\n\n### Implementation Requirements for Vision V2\n\n| Requirement | Description |\n|-------------|-------------|\n| **Spec Compliance** | Code MUST match spec definitions exactly (table names, column types, API shapes) |\n| **25-Stage Insulation** | CEO Runtime MUST be OBSERVER-COMMITTER only - no direct venture_stage_work writes |\n| **Glass Cockpit Design** | UI MUST follow progressive disclosure, minimal chrome philosophy |\n| **Token Budget Enforcement** | All agent operations MUST respect venture token budgets |\n\n### 25-Stage Insulation Checklist (SD-VISION-V2-005 CRITICAL)\n\n**Before marking SD-VISION-V2-005 complete:**\n\n- [ ] Zero direct INSERT/UPDATE/DELETE on `venture_stage_work`\n- [ ] All stage transitions via `fn_advance_venture_stage()` only\n- [ ] Gate types (auto/advisory/hard) respected\n- [ ] E2E test verifies no direct writes to stage tables\n- [ ] No new columns added to existing stage tables\n\n### Anti-Pattern: Implementing Without Reading Specs\n\n**❌ Don''t do this:**\n> "I''ll create the token budget table with columns that make sense..."\n\n**✅ Do this instead:**\n> "Let me read `docs/vision/specs/01-database-schema.md` Section 3 to get the exact table definition..."\n> [After reading]\n> "Creating `venture_token_ledger` with columns: id, venture_id, month, allocated_tokens, used_tokens, soft_cap_pct, hard_cap_pct as specified in spec."',
    999,
    'PHASE_EXEC',
    'CLAUDE_EXEC.md',
    '{"added_for": "Vision V2 transition", "added_date": "2025-12-13"}'::jsonb
) ON CONFLICT DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE 'Vision V2 protocol sections added. Run: node scripts/generate-claude-md-from-db.js to regenerate CLAUDE files.';
END $$;

-- ============================================================================
-- PART 10: Summary Output
-- ============================================================================

-- Display created SDs
SELECT
    id,
    title,
    relationship_type,
    priority,
    sequence_rank,
    status
FROM public.strategic_directives_v2
WHERE id LIKE 'SD-VISION-V2-%'
ORDER BY sequence_rank;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
