#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-LEO-PROTOCOL-V435-001 with your SD ID (e.g., SD-AUTH-001)
 *   3. Fill in PRD details
 *   4. Run: node scripts/create-prd-sd-XXX.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

const SD_ID = 'SD-LEO-PROTOCOL-V435-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'LEO Protocol v4.3.5 - SD Type-Aware Compliance Enhancements'; // TODO: Replace with your PRD title

// ============================================================================
// Supabase Client Setup
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// Main Function
// ============================================================================

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // -------------------------------------------------------------------------
  // STEP 1: Fetch Strategic Directive UUID (CRITICAL for handoff validation)
  // -------------------------------------------------------------------------

  console.log('\n1️⃣  Fetching Strategic Directive...');

  // SD ID Schema Cleanup: Use SD.id directly (uuid_id is deprecated)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
    // sd_id is now the canonical FK to strategic_directives_v2.id
    id: prdId,
    sd_id: SD_ID,                   // FK to strategic_directives_v2.id (canonical)
    directive_id: SD_ID,            // Backward compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'infrastructure',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
Genesis V31 compliance audit revealed 6 critical gaps where LEO Protocol validation was not SD type-aware. This SD implements type-specific handling for handoffs, PRD approval, deliverables, error handling, progress calculation, and documentation to ensure all 9 SD types (feature, infrastructure, documentation, database, security, bugfix, refactor, performance, orchestrator) are properly validated.

The root causes include: orchestrator type missing from migration 20251211 handoff types, HandoffRecorder.createArtifact() lacking silent error logging, PRD approval using uniform thresholds instead of type-specific ones, no deliverables planning gate before EXEC, refactor intensity overrides being dead code, and missing type-specific documentation templates.

Expected impact: LEO Protocol compliance rate increases from 60% to 95%, new SDs have 0 compliance issues, all silent failures are logged with recovery paths.
    `.trim(),

    business_context: `
**User Pain Points:**
- Genesis V31 SDs had 10 compliance issues (6 missing handoffs, 4 PRD status issues)
- Infrastructure SDs incorrectly validated with feature SD requirements
- Silent failures in handoff creation went undetected

**Business Objectives:**
- Ensure all 9 SD types have consistent, type-appropriate validation
- Reduce SD completion time by eliminating false compliance failures
- Improve error recovery with actionable logging

**Success Metrics:**
- Handoff compliance rate: 60% → 95%
- PRD approval: type-specific thresholds for all 9 types
- Deliverables gate: 100% enforcement for required types
- Error recovery: All createArtifact errors logged with recovery paths
    `.trim(),

    technical_context: `
**Existing Systems:**
- sd_type_validation_profiles table: Defines 9 SD types with phase weights
- HandoffRecorder.js: Creates handoff artifacts in sd_phase_handoffs
- orchestrate-phase-subagents.js: Selects sub-agents by SD type
- handoff.js: Defines SD_TYPE workflows (lines 24-88)

**Architecture Patterns:**
- Database-driven configuration (sd_type_validation_profiles)
- Modular handoff executors in scripts/modules/handoff/executors/
- ValidationOrchestrator for gate scoring

**Integration Points:**
- phase-preflight.js: Discovery gate validation
- handoff.js: Phase transition execution
- CLAUDE_PLAN.md: Documentation templates
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Type-aware handoff chain validation',
        description: 'Implement handoff validation in HandoffRecorder.js that checks SD type against required_handoff_types from sd_type_validation_profiles. Add orchestrator type to migration.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'HandoffRecorder validates handoffs against sd_type_validation_profiles.required_handoff_types',
          'Orchestrator type added to migration 20251211 with required_handoff_types',
          'Feature SDs require 4 handoffs, infrastructure 3, docs 2, orchestrator 1'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Type-specific PRD quality thresholds',
        description: 'Add prd_quality_threshold column to sd_type_validation_profiles and update approve_prd() function to use type-specific thresholds.',
        priority: 'HIGH',
        acceptance_criteria: [
          'prd_quality_threshold column exists in sd_type_validation_profiles',
          'approve_prd() queries threshold by SD type',
          'Documentation SDs use 50%, features 60%, security 65%'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Deliverables planning gate',
        description: 'Add validation gate before PLAN-TO-EXEC that blocks transition if SD type requires deliverables but none are defined. Create implicit deliverables for non-code SDs.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Gate blocks PLAN-TO-EXEC if requires_deliverables=true and 0 deliverables',
          'Implicit deliverables created for docs, infrastructure, orchestrator types',
          'Gate is skippable for bugfix, qa types'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Silent error logging for handoff creation',
        description: 'Implement error logging in HandoffRecorder.createArtifact() that catches failures, logs them with actionable recovery paths, and allows graceful degradation.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'createArtifact() catches all exceptions and logs to console with recovery steps',
          'Errors logged to handoff_error_log table (if exists) or console',
          'Recovery workflow documented in error message'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Activate refactor intensity overrides',
        description: 'Enable the dead code in getSDWorkflow() that applies intensity_level overrides for refactor SDs (cosmetic/structural/architectural).',
        priority: 'LOW',
        acceptance_criteria: [
          'getSDWorkflow() applies intensity_level for refactor SDs',
          'Cosmetic refactors skip E2E, structural requires E2E, architectural requires full validation',
          'Unit tests cover all 3 intensity levels'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'Type-specific documentation templates',
        description: 'Add documentation sections to CLAUDE_PLAN.md for all 9 SD types. Create template generation in generate-claude-md-from-db.js.',
        priority: 'LOW',
        acceptance_criteria: [
          'CLAUDE_PLAN.md has section for each of 9 SD types',
          'Templates include type-specific validation requirements',
          'generate-claude-md-from-db.js generates type documentation from database'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Validation lookup must not add latency',
        target_metric: '<50ms overhead for type profile lookup (cached)'
      },
      {
        type: 'reliability',
        requirement: 'Backward compatibility with existing SDs',
        target_metric: '100% of existing SDs continue to validate correctly'
      },
      {
        type: 'maintainability',
        requirement: 'Database-driven configuration over hardcoded logic',
        target_metric: 'All type-specific rules in sd_type_validation_profiles'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Database migration for orchestrator handoff types',
        description: 'Add orchestrator to sd_type_validation_profiles with required_handoff_types array',
        dependencies: ['Supabase CLI', 'migration 20251211 as baseline']
      },
      {
        id: 'TR-2',
        requirement: 'Type profile caching in HandoffRecorder',
        description: 'Cache sd_type_validation_profiles on first lookup to avoid repeated DB queries',
        dependencies: ['@supabase/supabase-js']
      },
      {
        id: 'TR-3',
        requirement: 'Error logging infrastructure',
        description: 'Console logging with structured format for error recovery paths',
        dependencies: ['Node.js console, optional handoff_error_log table']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
Type-aware validation uses a layered approach:
1. **Database Layer**: sd_type_validation_profiles stores type-specific rules
2. **Validation Layer**: HandoffRecorder queries profiles and validates
3. **Executor Layer**: Phase-specific executors apply type rules
4. **Documentation Layer**: CLAUDE_PLAN.md provides type templates

## Data Flow
1. SD created with sd_type
2. HandoffRecorder queries sd_type_validation_profiles for type config
3. Validation gates check required_handoff_types, requires_deliverables, etc.
4. Handoff approved/rejected based on type-specific rules
5. Errors logged with recovery paths if validation fails

## Integration Points
- phase-preflight.js: Reads exploration_summary, triggers discovery gate
- handoff.js: Orchestrates phase transitions, invokes executors
- PlanToLeadExecutor.js: Applies type-specific retrospective thresholds
- generate-claude-md-from-db.js: Generates documentation templates
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'sd_type_validation_profiles',
          columns: ['sd_type', 'required_handoff_types', 'prd_quality_threshold', 'requires_deliverables', 'requires_e2e_tests'],
          relationships: ['sd_type references strategic_directives_v2.sd_type']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'N/A - Script-based validation',
        method: 'N/A',
        description: 'This SD modifies validation scripts, not APIs',
        request: {},
        response: {}
      }
    ],

    ui_ux_requirements: [
      {
        component: 'N/A - Backend/Script changes',
        description: 'No UI changes - all changes are in validation scripts',
        wireframe: 'N/A'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Database Migration (Fix 1)
1. Create migration for orchestrator handoff types
2. Add required_handoff_types to orchestrator in sd_type_validation_profiles
3. Verify all 9 types have complete configuration

## Phase 2: Core Validation (Fixes 1, 2, 3, 4)
1. Update HandoffRecorder.js with type-aware validation
2. Implement error logging with recovery paths in createArtifact()
3. Add prd_quality_threshold lookup in approve_prd()
4. Create deliverables planning gate in PLAN-TO-EXEC executor

## Phase 3: Progress & Documentation (Fixes 5, 6)
1. Activate refactor intensity overrides in getSDWorkflow()
2. Add type-specific sections to CLAUDE_PLAN.md
3. Update generate-claude-md-from-db.js for template generation

## Phase 4: Testing & Verification
1. Write unit tests for all type-specific validation paths
2. Manual testing with sample SDs of each type
3. Run compliance audit to verify 0 issues
    `.trim(),

    technology_stack: [
      'Node.js 22',
      'Supabase PostgreSQL',
      'JavaScript ES Modules',
      '@supabase/supabase-js'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'Migration 20251211_required_handoff_types.sql',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'sd_type_validation_profiles table',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Feature SD requires all 4 handoffs',
        description: 'Create feature SD, attempt PLAN-TO-LEAD without EXEC-TO-PLAN',
        expected_result: 'Handoff blocked with clear error message',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Infrastructure SD skips EXEC-TO-PLAN',
        description: 'Create infrastructure SD, go directly to PLAN-TO-LEAD',
        expected_result: 'Handoff succeeds (EXEC-TO-PLAN optional for infra)',
        test_type: 'integration'
      },
      {
        id: 'TS-3',
        scenario: 'Documentation SD uses 50% PRD threshold',
        description: 'Approve PRD for documentation SD with 55% quality score',
        expected_result: 'PRD approved (threshold is 50% for docs)',
        test_type: 'unit'
      },
      {
        id: 'TS-4',
        scenario: 'Deliverables gate blocks feature SD',
        description: 'Attempt PLAN-TO-EXEC for feature SD with 0 deliverables',
        expected_result: 'Handoff blocked - deliverables required',
        test_type: 'integration'
      },
      {
        id: 'TS-5',
        scenario: 'Error recovery logging works',
        description: 'Trigger createArtifact error, check console output',
        expected_result: 'Error logged with recovery steps',
        test_type: 'unit'
      },
      {
        id: 'TS-6',
        scenario: 'Refactor intensity applies correct validation',
        description: 'Create cosmetic refactor SD, check validation requirements',
        expected_result: 'E2E tests skipped for cosmetic intensity',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      'All 9 SD types have defined handoff requirements in sd_type_validation_profiles',
      'HandoffRecorder validates handoffs against type-specific required_handoff_types',
      'PRD approval uses type-specific quality thresholds from database',
      'Deliverables gate blocks EXEC for types where requires_deliverables=true',
      'Silent failures logged with actionable recovery paths',
      'Refactor intensity overrides active in getSDWorkflow()',
      'CLAUDE_PLAN.md has documentation templates for all 9 SD types',
      'Compliance audit shows 0 issues for new test SDs',
      'All existing SDs continue to validate correctly (backward compatible)'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: false },
      { text: 'Technical architecture defined', checked: false },
      { text: 'Implementation approach documented', checked: false },
      { text: 'Test scenarios defined', checked: false },
      { text: 'Acceptance criteria established', checked: false },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Database schema reviewed (DATABASE sub-agent)', checked: false },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: false }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'Core functionality implemented', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false },
      { text: 'Performance requirements validated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'User acceptance testing passed', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ],

    // Progress Tracking
    progress: 10, // 0-100
    phase: 'planning', // planning, design, implementation, verification, approval
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks & Constraints
    risks: [
      {
        category: 'Technical',
        risk: 'Breaking existing SD workflows',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Existing SDs may fail validation after changes',
        mitigation: 'Add backward-compatible defaults; test with existing SDs before deployment'
      },
      {
        category: 'Technical',
        risk: 'Complex type-specific logic',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Harder to maintain and debug',
        mitigation: 'Use database-driven configuration; avoid hardcoding type rules in scripts'
      },
      {
        category: 'Technical',
        risk: 'Missing edge cases',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Some SD type combinations may not validate correctly',
        mitigation: 'Comprehensive test coverage for all 9 types'
      },
      {
        category: 'Performance',
        risk: 'Validation latency regression',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Handoff execution takes longer',
        mitigation: 'Cache type profiles; avoid repeated DB queries'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must maintain backward compatibility with all existing SDs',
        impact: 'Cannot change validation behavior for completed SDs'
      },
      {
        type: 'technical',
        constraint: 'sd_type_validation_profiles table structure is fixed',
        impact: 'New columns must be added via migration'
      }
    ],

    assumptions: [
      {
        assumption: 'All 9 SD types are known and stable',
        validation_method: 'Query sd_type_validation_profiles for all type entries'
      },
      {
        assumption: 'HandoffRecorder.js is the single point of handoff creation',
        validation_method: 'Search codebase for other handoff creation patterns'
      }
    ],

    // Stakeholders & Timeline
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks

    // Metadata (for custom fields that don't fit schema)
    metadata: {
      // Store custom fields here that aren't in the official schema
      // Examples:
      // ui_components: [...],
      // success_metrics: [...],
      // database_changes: {...},
      // estimated_hours: 40,
      // etc.
    },

    // Audit Trail
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Validate PRD Data (CRITICAL - catches schema mismatches)
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    console.error('   Fix the errors above before inserting to database');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // -------------------------------------------------------------------------
  // STEP 4: Check if PRD already exists
  // -------------------------------------------------------------------------

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Options:');
    console.log('   1. Delete the existing PRD first');
    console.log('   2. Use an UPDATE script instead');
    console.log('   3. Change the SD_ID to create a different PRD');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Insert PRD into database
  // -------------------------------------------------------------------------

  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 6: Success!
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id || insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Update TODO items in PRD (executive_summary, requirements, etc.)');
  console.log('   2. Run STORIES sub-agent: node scripts/create-user-stories-[sd-id].mjs');
  console.log('   3. Run DATABASE sub-agent: node scripts/database-architect-schema-review.js');
  console.log('   4. Run SECURITY sub-agent: node scripts/security-architect-assessment.js');
  console.log('   5. Mark plan_checklist items as complete');
  console.log('   6. Create PLAN→EXEC handoff when ready');
  console.log('');
}

// ============================================================================
// Execute
// ============================================================================

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
