#!/usr/bin/env node

/**
 * Create Foundation V3 Strategic Directives
 *
 * Creates parent SD (SD-FOUNDATION-V3-000) and 8 child SDs based on
 * the Joint Chiefs analysis (Opus + Codex + Anti-Gravity consensus).
 *
 * Phase 1: Stabilization (001, 002)
 * Phase 2: Reactivation (003, 004)
 * Phase 3: Capability (005, 006)
 * Phase 4: Quality (007, 008)
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
// SD ID Schema Cleanup: Removed uuid_id generation - column is deprecated

const SDS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // PARENT SD
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'SD-FOUNDATION-V3-000',
    sd_key: 'SD-FOUNDATION-V3-000',
    title: 'Foundation V3: Vision V2 Stabilization & Completion',
    description: `Post-Vision V2 foundation work to stabilize the Chairman's Operating System.

Addresses the "Split Brain" issue identified by joint analysis (Opus, Codex, Anti-Gravity):
- Schema/App contract drift (code queries wrong columns)
- Legacy Stage26-52 code ("Haunted House")
- Broken integration tests
- Incomplete EVA directive execution

This parent SD orchestrates 4 phases of stabilization before any new feature development.`,
    rationale: `Three independent analyses (Claude Opus 4.5, OpenAI Codex, Google Anti-Gravity)
all identified critical stabilization work needed before Vision V2 can be considered complete.
The system has a "Split Brain" - the engine (Vision V2 specs) is disconnected from the
drivetrain (app code) and haunted by legacy ghosts (Stage26-52).`,
    scope: `IN SCOPE:
- Data integrity fixes (UUID/VARCHAR reconciliation)
- Legacy code cleanup (Stage26-52 deletion)
- QA system resurrection
- Contract reconciliation (DB ↔ App alignment)
- EVA directive execution engine
- 25-stage crew mapping completion
- E2E test suite creation
- Four Buckets decision evidence wiring

OUT OF SCOPE:
- New features beyond stabilization
- Blueprint generation pipeline
- Multi-venture scaling`,
    category: 'infrastructure',
    sd_type: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: null,
    strategic_intent: 'Stabilize the Vision V2 Chairman\'s Operating System foundation before expanding features',
    strategic_objectives: JSON.stringify([
      'Eliminate schema/code contract drift',
      'Remove all legacy Stage26-52 code',
      'Restore integration test functionality',
      'Enable EVA directive execution',
      'Complete 25-stage crew mappings'
    ]),
    success_criteria: JSON.stringify([
      'All Vision V2 tables use consistent ID format',
      'No Stage26-52 code remains in codebase',
      'npm run test:integration passes',
      'Schema/App contract matrix documented and enforced',
      'EVA can execute directives through agent hierarchy',
      'All 25 stages have crew mappings'
    ]),
    key_changes: JSON.stringify([
      'strategic_directives_v2 ID format standardization',
      'Stage26-52 component deletion',
      'Integration test runner fixes',
      'API endpoint column name alignment',
      'EVA directive execution pipeline',
      'STAGE_CREW_MAP expansion'
    ]),
    key_principles: JSON.stringify([
      'Stabilization before expansion',
      'Database-first approach',
      'Contract matrix as source of truth',
      'Test coverage before features',
      'LEO Protocol compliance'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      analysis_sources: ['Claude Opus 4.5', 'OpenAI Codex', 'Google Anti-Gravity'],
      analysis_date: '2025-12-17',
      total_child_sds: 8,
      estimated_duration: '4 weeks (4 phases)'
    })
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: STABILIZATION (Immediate)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'SD-FOUNDATION-V3-001',
    sd_key: 'SD-FOUNDATION-V3-001',
    title: 'Data Integrity & Schema Remediation',
    description: `Fix UUID/VARCHAR ID mismatch in strategic_directives_v2 and establish
canonical column names for all Vision V2 tables.

PROBLEM 1: API code queries 'current_stage' but DB uses 'current_lifecycle_stage'.
PROBLEM 2: SDs have both 'id' (VARCHAR) and 'uuid_id' (UUID) causing join failures.

This SD creates the canonical contract matrix and aligns all code to match.`,
    rationale: 'Both Claude and Codex identified ID format mismatch as a critical data integrity issue that could cause silent data corruption.',
    scope: `IN SCOPE:
- Fix strategic_directives_v2 dual-ID issue
- Create contract matrix document
- Audit all .from() calls in API code
- Smoke tests for data access

OUT OF SCOPE:
- App code column name changes (covered in SD-004)`,
    category: 'infrastructure',
    sd_type: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG_Engineer',
    parent_sd_id: 'SD-FOUNDATION-V3-000',
    strategic_intent: 'Establish single source of truth for data identifiers',
    strategic_objectives: JSON.stringify([
      'Standardize strategic_directives_v2 ID format',
      'Document canonical column names',
      'Verify data access correctness'
    ]),
    success_criteria: JSON.stringify([
      'strategic_directives_v2 uses single consistent ID format',
      'All API endpoints use canonical column names',
      'Contract matrix document created listing all canonical names',
      'Smoke tests verify correct data access'
    ]),
    key_changes: JSON.stringify([
      'strategic_directives_v2 ID column consolidation',
      'Contract matrix document creation',
      'Data access smoke tests'
    ]),
    key_principles: JSON.stringify([
      'Single source of truth',
      'Database-first',
      'Document before change'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 1,
      phase_name: 'Stabilization',
      source: 'Claude Opus 4.5 + Codex',
      estimated_effort: '1-2 days'
    })
  },
  {
    id: 'SD-FOUNDATION-V3-002',
    sd_key: 'SD-FOUNDATION-V3-002',
    title: 'Legacy Protocol Cleanup (The Exorcism)',
    description: `Remove all Stage26-Stage52 components and routes from the codebase.
The 25-stage protocol is canonical; legacy 52-stage code creates confusion.

FILES TO DELETE: src/components/stages/Stage26*.tsx through Stage52*.tsx

This is the "Exorcism" - removing the ghosts of the old 52-stage model.`,
    rationale: 'Anti-Gravity identified Stage26-52 files as "zombie code" that could be accidentally imported, polluting the verified 25-stage workflow.',
    scope: `IN SCOPE:
- Delete src/components/stages/Stage26...Stage52 components
- Remove Ghost Town routes for stages 26-52
- Update all imports (grep check)
- Verify build compiles

OUT OF SCOPE:
- Legacy chairman components (separate SD)
- 25-stage implementation changes`,
    category: 'infrastructure',
    sd_type: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: 'SD-FOUNDATION-V3-000',
    strategic_intent: 'Enforce 25-stage protocol by removing legacy 52-stage artifacts',
    strategic_objectives: JSON.stringify([
      'Remove all Stage26-52 component files',
      'Remove legacy routes',
      'Update import references',
      'Verify build integrity'
    ]),
    success_criteria: JSON.stringify([
      'src/components/stages/ contains ONLY Stage1-Stage25 components',
      'No "Ghost Town" routes exist for stages 26-52',
      'All imports updated (grep check passes)',
      'Build compiles successfully'
    ]),
    key_changes: JSON.stringify([
      'Stage26*.tsx through Stage52*.tsx deletion',
      'Legacy route removal',
      'Import statement updates'
    ]),
    key_principles: JSON.stringify([
      'Delete aggressively',
      'Verify before commit',
      '25-stage is canonical'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 1,
      phase_name: 'Stabilization',
      source: 'Google Anti-Gravity',
      codename: 'The Exorcism',
      estimated_effort: 'Quick win (1-2 hours)'
    })
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: REACTIVATION (Next Week)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'SD-FOUNDATION-V3-003',
    sd_key: 'SD-FOUNDATION-V3-003',
    title: 'QA System Resurrection',
    description: `Fix broken integration test runner. Current errors:
- docFindings.map is not a function
- testFindings.map is not a function
- hub.getAllFindings is not a function

Without working tests, we are "flying blind" on regressions.
The "Russian Judge" (QA system) must be reactivated.`,
    rationale: 'Anti-Gravity verified that integration tests are failing with specific type errors found in docs/integration-test-results.json.',
    scope: `IN SCOPE:
- Fix docFindings.map error in test runner
- Fix hub.getAllFindings error
- Add regression tests for schema/app alignment
- Document test coverage baseline

OUT OF SCOPE:
- E2E test creation (separate SD)
- New test frameworks`,
    category: 'infrastructure',
    sd_type: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG_Engineer',
    parent_sd_id: 'SD-FOUNDATION-V3-000',
    strategic_intent: 'Restore automated quality verification capability',
    strategic_objectives: JSON.stringify([
      'Fix type errors in test runner',
      'Enable CI/CD test gate',
      'Document baseline coverage'
    ]),
    success_criteria: JSON.stringify([
      'npm run test:integration passes',
      'Test runner produces typed findings (no .map errors)',
      'CI/CD gate can be enabled',
      'Test coverage baseline documented'
    ]),
    key_changes: JSON.stringify([
      'Test runner type fixes',
      'Findings normalization',
      'Hub API corrections'
    ]),
    key_principles: JSON.stringify([
      'Tests must pass before features',
      'Type safety mandatory',
      'Document baseline state'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 2,
      phase_name: 'Reactivation',
      source: 'Google Anti-Gravity',
      codename: 'Russian Judge Resurrection',
      estimated_effort: '1 day'
    })
  },
  {
    id: 'SD-FOUNDATION-V3-004',
    sd_key: 'SD-FOUNDATION-V3-004',
    title: 'Contract Reconciliation (DB ↔ App)',
    description: `Create canonical mapping for all Vision V2 tables/columns/views.
Update all API endpoints, state machines, and UI hooks to match.

KEY MISMATCHES TO FIX:
- current_lifecycle_stage (DB) vs current_stage (App)
- chairman_decisions shape differences
- venture_stage_work.lifecycle_stage vs stage_id

This SD enforces the contract matrix created in SD-001.`,
    rationale: 'Codex found specific column mismatches causing the "Split Brain" issue where app code queries wrong columns.',
    scope: `IN SCOPE:
- Publish contract matrix document
- Audit all .from() calls in app code
- Fix evaStateMachines.ts field names
- Fix useChairmanDashboardData.ts queries
- Add smoke tests for critical paths

OUT OF SCOPE:
- Database schema changes (prefer code alignment)`,
    category: 'infrastructure',
    sd_type: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: 'SD-FOUNDATION-V3-000',
    strategic_intent: 'Align application code with canonical database schema',
    strategic_objectives: JSON.stringify([
      'Document canonical field/table names',
      'Align all API queries to match schema',
      'Fix state machine field usage',
      'Verify with smoke tests'
    ]),
    success_criteria: JSON.stringify([
      'Contract matrix document published',
      'All .from() calls audited and aligned',
      'evaStateMachines.ts uses correct field names',
      'useChairmanDashboardData.ts uses correct queries',
      'Smoke tests for critical data paths'
    ]),
    key_changes: JSON.stringify([
      'API endpoint query updates',
      'evaStateMachines.ts field corrections',
      'useChairmanDashboardData.ts query fixes',
      'Contract matrix publication'
    ]),
    key_principles: JSON.stringify([
      'Database schema is canonical',
      'Code adapts to schema',
      'Document before change',
      'Smoke test after change'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 2,
      phase_name: 'Reactivation',
      source: 'OpenAI Codex',
      estimated_effort: 'Multi-day'
    })
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: CAPABILITY (Following Week)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'SD-FOUNDATION-V3-005',
    sd_key: 'SD-FOUNDATION-V3-005',
    title: 'EVA Directive Execution Engine',
    description: `Implement the backend handler for chairman directives.
Currently POST /api/v2/chairman/directive creates a row and returns
acknowledgment, but does NOT execute the directive through the agent hierarchy.

PIPELINE: Directive → Interpretation → Delegation → Task Contracts → Results

This transforms the Chairman's OS from "read-only dashboard" to "operating system".`,
    rationale: 'Claude identified this as the highest-priority feature gap because EVA directive execution enables all downstream autonomous operations.',
    scope: `IN SCOPE:
- Directive interpretation logic
- Agent delegation routing
- Task contract dispatch
- Result aggregation
- Error handling

OUT OF SCOPE:
- Agent runtime implementation
- Crew-level execution
- Blueprint generation`,
    category: 'feature',
    sd_type: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: 'SD-FOUNDATION-V3-000',
    strategic_intent: 'Enable EVA to execute chairman directives through the agent hierarchy',
    strategic_objectives: JSON.stringify([
      'Implement directive interpretation',
      'Route directives to appropriate agents',
      'Dispatch via task contracts',
      'Aggregate and return results'
    ]),
    success_criteria: JSON.stringify([
      'Directives routed to appropriate agents based on content',
      'Acknowledgment system returns execution tracking ID',
      'Task queue integration dispatches work',
      'Results visible in chairman briefing',
      'Error cases handled gracefully'
    ]),
    key_changes: JSON.stringify([
      'Directive interpretation service',
      'Agent routing logic',
      'Task contract integration',
      'Result aggregation pipeline'
    ]),
    key_principles: JSON.stringify([
      'EVA as orchestrator not executor',
      'Delegate to appropriate agent level',
      'Track execution progress',
      'Fail gracefully with visibility'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 3,
      phase_name: 'Capability',
      source: 'Claude Opus 4.5',
      estimated_effort: 'Multi-day',
      dependency: 'SD-FOUNDATION-V3-004 (contract reconciliation)'
    })
  },
  {
    id: 'SD-FOUNDATION-V3-006',
    sd_key: 'SD-FOUNDATION-V3-006',
    title: '25-Stage Crew Mapping Completion',
    description: `Extend STAGE_CREW_MAP in evaTaskContracts.ts to support all 25 stages.
Currently only stages 1-6 are mapped - system stalls after stage 6.

The mappings should be driven from lifecycle_stage_config (no hardcoding).`,
    rationale: 'Codex found that STAGE_CREW_MAP only covers stages 1-6, creating a critical gap for the 25-stage system.',
    scope: `IN SCOPE:
- Extend STAGE_CREW_MAP for stages 7-25
- Drive mappings from lifecycle_stage_config
- Add integration test for stage 7+ dispatch

OUT OF SCOPE:
- New crew types
- Agent runtime changes`,
    category: 'feature',
    sd_type: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: 'SD-FOUNDATION-V3-000',
    strategic_intent: 'Enable full 25-stage venture lifecycle execution',
    strategic_objectives: JSON.stringify([
      'Map all 25 stages to appropriate crews',
      'Remove hardcoded stage values',
      'Verify dispatch functionality'
    ]),
    success_criteria: JSON.stringify([
      'All 25 stages have crew mappings',
      'Mappings driven from lifecycle_stage_config (no hardcoding)',
      'Dispatch functional for all stages',
      'Integration test verifies stage 7+ dispatch'
    ]),
    key_changes: JSON.stringify([
      'STAGE_CREW_MAP extension to 25 stages',
      'lifecycle_stage_config integration',
      'Integration test addition'
    ]),
    key_principles: JSON.stringify([
      'Configuration over hardcoding',
      'Database-driven mappings',
      'Test coverage for new functionality'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 3,
      phase_name: 'Capability',
      source: 'OpenAI Codex',
      estimated_effort: '1-2 days',
      dependency: 'SD-FOUNDATION-V3-004 (contract reconciliation)'
    })
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: QUALITY (Future)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'SD-FOUNDATION-V3-007',
    sd_key: 'SD-FOUNDATION-V3-007',
    title: 'Chairman Dashboard E2E Test Suite',
    description: `Create comprehensive Playwright E2E tests for the Chairman's Glass Cockpit.
Cover the full user journey: create venture → decision → advance → evidence.

This provides regression protection for the Chairman's primary interaction surface.`,
    rationale: 'All three analyses (Claude, Codex, Anti-Gravity) identified the need for E2E test coverage to prevent regressions.',
    scope: `IN SCOPE:
- Briefing view E2E test
- Decision workflow E2E test
- Portfolio view E2E test
- Auth flow tests
- CI/CD integration

OUT OF SCOPE:
- Unit tests
- API contract tests
- Performance tests`,
    category: 'quality',
    sd_type: 'infrastructure',
    priority: 'medium',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: 'SD-FOUNDATION-V3-000',
    strategic_intent: 'Establish automated regression protection for Chairman UI',
    strategic_objectives: JSON.stringify([
      'Cover critical user journeys',
      'Enable CI/CD test gate',
      'Prevent UI regressions'
    ]),
    success_criteria: JSON.stringify([
      'Briefing view E2E test passes',
      'Decision workflow E2E test passes',
      'Portfolio view E2E test passes',
      'Auth flow tested',
      'CI/CD integration enabled'
    ]),
    key_changes: JSON.stringify([
      'Playwright E2E test suite',
      'Test fixtures for chairman auth',
      'CI/CD pipeline integration'
    ]),
    key_principles: JSON.stringify([
      'Test critical paths first',
      'Stable selectors (data-testid)',
      'Isolated test state',
      'CI/CD gate enforcement'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 4,
      phase_name: 'Quality',
      source: 'All Three Analyses',
      estimated_effort: 'Multi-day',
      dependency: 'SD-FOUNDATION-V3-003 (QA resurrection)'
    })
  },
  {
    id: 'SD-FOUNDATION-V3-008',
    sd_key: 'SD-FOUNDATION-V3-008',
    title: 'Four Buckets Decision Evidence End-to-End',
    description: `Wire chairman decision evidence from real data sources:
- venture_artifacts.epistemic_* fields
- assumption_sets table
- venture_token_ledger

Remove all placeholder/mock evidence from production endpoints.

This provides real provenance for chairman decisions.`,
    rationale: 'Codex found that Four Buckets is not wired to decision evidence, breaking the provenance chain for chairman decisions.',
    scope: `IN SCOPE:
- Wire venture_artifacts.epistemic_* to evidence
- Integrate assumption_sets data
- Pull from venture_token_ledger
- Remove placeholder data

OUT OF SCOPE:
- New Four Buckets fields
- UI changes to Four Buckets display`,
    category: 'feature',
    sd_type: 'infrastructure',
    priority: 'medium',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: 'SD-FOUNDATION-V3-000',
    strategic_intent: 'Enable data-driven chairman decisions with full provenance',
    strategic_objectives: JSON.stringify([
      'Wire real Four Buckets data to decisions',
      'Remove all placeholder evidence',
      'Enable decision audit trail'
    ]),
    success_criteria: JSON.stringify([
      'Decision evidence pulled from real Four Buckets data',
      'Facts/Assumptions/Simulations/Unknowns visible in decision UI',
      'No placeholder data in production',
      'Evidence traceable to source artifacts'
    ]),
    key_changes: JSON.stringify([
      'Decision evidence API integration',
      'venture_artifacts.epistemic_* wiring',
      'assumption_sets integration',
      'Placeholder removal'
    ]),
    key_principles: JSON.stringify([
      'Real data only',
      'Traceable provenance',
      'Four Buckets as source of truth'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 4,
      phase_name: 'Quality',
      source: 'OpenAI Codex',
      estimated_effort: 'Multi-day',
      dependency: 'SD-FOUNDATION-V3-004 (contract reconciliation)'
    })
  }
];

async function createFoundationV3SDs() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  FOUNDATION V3: Creating Strategic Directives');
  console.log('  Joint Chiefs Analysis Implementation');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const sd of SDS) {
    try {
      // Check if SD already exists
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', sd.id)
        .single();

      if (existing) {
        // Update existing SD
        const { error } = await supabase
          .from('strategic_directives_v2')
          .update({
            ...sd,
            updated_at: new Date().toISOString()
          })
          .eq('id', sd.id);

        if (error) throw error;
        console.log(`📝 Updated: ${sd.id} - ${sd.title}`);
        updated++;
      } else {
        // Create new SD
        const { error } = await supabase
          .from('strategic_directives_v2')
          .insert({
            ...sd,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
        console.log(`✅ Created: ${sd.id} - ${sd.title}`);
        created++;
      }
    } catch (error) {
      console.error(`❌ Error with ${sd.id}: ${error.message}`);
      errors++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`  Summary: ${created} created, ${updated} updated, ${errors} errors`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Display hierarchy
  console.log('SD Hierarchy:');
  console.log('└── SD-FOUNDATION-V3-000 (Parent: Foundation V3)');
  console.log('    ├── Phase 1: Stabilization');
  console.log('    │   ├── SD-FOUNDATION-V3-001 (Data Integrity)');
  console.log('    │   └── SD-FOUNDATION-V3-002 (Legacy Cleanup)');
  console.log('    ├── Phase 2: Reactivation');
  console.log('    │   ├── SD-FOUNDATION-V3-003 (QA Resurrection)');
  console.log('    │   └── SD-FOUNDATION-V3-004 (Contract Reconciliation)');
  console.log('    ├── Phase 3: Capability');
  console.log('    │   ├── SD-FOUNDATION-V3-005 (EVA Directives)');
  console.log('    │   └── SD-FOUNDATION-V3-006 (Crew Mapping)');
  console.log('    └── Phase 4: Quality');
  console.log('        ├── SD-FOUNDATION-V3-007 (E2E Tests)');
  console.log('        └── SD-FOUNDATION-V3-008 (Four Buckets)');
  console.log('');

  if (errors === 0) {
    console.log('🎉 All SDs created successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Review SDs in database');
    console.log('2. Move parent SD to LEAD phase for approval');
    console.log('3. Begin Phase 1 implementation');
  }
}

// Run
createFoundationV3SDs().catch(console.error);
