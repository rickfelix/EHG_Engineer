#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-STAGE-ARCH-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-STAGE-ARCH-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Stage Architecture Remediation - Vision V2 Alignment'; // TODO: Replace with your PRD title

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
    priority: 'critical', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
## Stage Architecture Remediation - Vision V2 Alignment

This orchestrator SD addresses the "Schrödinger's Stage" crisis discovered in the triangulation assessment: 12 of 25 stages exist as duplicate files with conflicting purposes. The current codebase has 37+ stage files when Vision V2 specifies exactly 25.

**The Problem**: Multiple stages load unpredictably (Stage1DraftIdea.tsx vs Stage1Enhanced.tsx), hardcoded stage counts conflict (25 vs 40), and there's no Single Source of Truth (SSOT) for the venture workflow.

**The Solution**: Clean slate implementation with 11 child SDs that: (1) Audit and clean database, (2) Create SSOT in /src/config/venture-workflow.ts, (3) Delete 12 duplicate stage files, (4) Rebuild all 25 stages aligned with Vision V2, (5) Implement correct kill and promotion gates, (6) Add CI governance to prevent regression.

**Impact**: Unblocks Genesis Oath v3.1 implementation and establishes a maintainable, predictable stage architecture.
    `.trim(),

    business_context: `
## Business Justification

**User Pain Points**:
- Venture progress calculations are incorrect (showing 40 stages instead of 25)
- Stage crashes on certain routes (Stage 16-20 crash fixed in PR #81, but architecture remains fragile)
- Kill gates not enforced (ventures can proceed past failure points)
- Promotion gates not implemented (simulation-to-production elevation missing)

**Business Objectives**:
- Enable reliable venture validation workflow (25 stages, no duplicates)
- Implement Vision V2 gate logic (kill at 3,5,13,23; promote at 16,17,22)
- Provide accurate progress tracking for ventures
- Unblock Genesis Oath v3.1 (depends on clean stage architecture)

**Success Metrics**:
- 25 stage files (down from 37+)
- 0 hardcoded stage counts
- 4 kill gates enforced
- 3 promotion gates implemented
- 11/11 child SDs completed
    `.trim(),

    technical_context: `
## Technical Landscape

**Current State**:
- /src/components/stages/: 37+ files, 12 duplicates
- Hardcoded "40" in 9+ files
- No SSOT for stage definitions
- Kill/promotion gate logic missing or incorrect

**Target State**:
- /src/config/venture-workflow.ts: SSOT with all 25 stages
- /src/components/stages/v2/: 25 clean stage components
- Stage router for dynamic loading
- CI governance (npm run audit:stages)

**Integration Points**:
- Vision V2 files (GENESIS_RITUAL_SPECIFICATION.md, SIMULATION_CHAMBER_ARCHITECTURE.md)
- Database tables (venture_stages, workflow_stages)
- Workflow hooks (useWorkflowData, useWorkflowExecution)
- Progress displays (StageTimeline, ExecutionProgressChart)
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-P0',
        requirement: 'Audit & Clean Database',
        description: 'Remove orphaned database entries pointing to deleted stage files',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All orphaned venture_stages entries identified',
          'All orphaned workflow_stages entries identified',
          'Cleanup report generated',
          'No runtime errors from missing stage references'
        ]
      },
      {
        id: 'FR-P1',
        requirement: 'SSOT Foundation + Delete Legacy',
        description: 'Create Single Source of Truth and delete 12 duplicate stage files',
        priority: 'CRITICAL',
        acceptance_criteria: [
          '/src/config/venture-workflow.ts created with all 25 stages',
          '12 duplicate stage files deleted',
          'All imports updated to use SSOT constants',
          'No hardcoded stage counts remain (0 occurrences of "40")'
        ]
      },
      {
        id: 'FR-P2',
        requirement: 'Create V2 Stage Shells + Router',
        description: 'Create 25 empty stage components in /src/components/stages/v2/ with dynamic router',
        priority: 'CRITICAL',
        acceptance_criteria: [
          '25 stage component shells created (Stage01-Stage25)',
          'Stage router implemented for dynamic loading',
          'All stages compile without errors',
          'SSOT drives stage routing'
        ]
      },
      {
        id: 'FR-P3',
        requirement: 'Implement Safe Stages (1-10, 24-25)',
        description: 'Implement stages with no duplicate files (straightforward ports)',
        priority: 'HIGH',
        acceptance_criteria: [
          'Stages 1-10 render correctly',
          'Stages 24-25 render correctly',
          'Kill gates 3 and 5 enforce correctly',
          'No crashes on any safe stage'
        ]
      },
      {
        id: 'FR-P4',
        requirement: 'Rebuild Crisis Zone (11-23)',
        description: 'Implement stages that had duplicate files with correct Vision V2 naming',
        priority: 'HIGH',
        acceptance_criteria: [
          'Stages 11-23 render correctly',
          'Kill gates 13 and 23 enforce correctly',
          'Promotion gates 16, 17, 22 implement elevation semantics',
          'No crashes on any crisis zone stage'
        ]
      },
      {
        id: 'FR-P5',
        requirement: 'Governance & Polish',
        description: 'Add ESLint rules and complete documentation',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'ESLint rule warns at 500 LOC',
          'Component size audit report generated',
          'V2 architecture documented',
          'npm run audit:stages script works'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Stage load time',
        target_metric: '<500ms per stage render'
      },
      {
        type: 'reliability',
        requirement: 'Zero stage crashes',
        target_metric: '0 runtime errors from undefined property access'
      },
      {
        type: 'maintainability',
        requirement: 'Component size limits',
        target_metric: '≤600 LOC per stage component'
      },
      {
        type: 'testability',
        requirement: 'Stage test coverage',
        target_metric: '≥80% coverage on stage components'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'SSOT Architecture',
        description: 'All stage definitions must come from venture-workflow.ts',
        dependencies: ['TypeScript', 'React', 'Vite']
      },
      {
        id: 'TR-2',
        requirement: 'Dynamic Stage Loading',
        description: 'Stage router must support lazy loading for bundle optimization',
        dependencies: ['React.lazy', 'Suspense']
      },
      {
        id: 'TR-3',
        requirement: 'Gate Enforcement',
        description: 'Kill and promotion gates must block/allow stage transitions programmatically',
        dependencies: ['Database triggers', 'API validation']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview

### SSOT Layer (/src/config/)
- venture-workflow.ts: Canonical stage definitions, kill gates, promotion gates
- Exports: TOTAL_WORKFLOW_STAGES, WORKFLOW_STAGES, KILL_GATES, PROMOTION_GATES

### Component Layer (/src/components/stages/v2/)
- 25 stage components (Stage01-Stage25)
- Each component ≤600 LOC with single responsibility
- Imports stage metadata from SSOT

### Router Layer (/src/components/stages/v2/stage-router.ts)
- Dynamic stage loading with React.lazy
- Gate enforcement before transition
- Progress tracking integration

## Data Flow
1. User navigates to stage N
2. Stage router checks SSOT for stage metadata
3. Gate validation (kill/promotion) via API
4. Component lazy-loaded from /v2/
5. Stage data fetched from database
6. UI renders with progress context

## Integration Points
- Database: venture_stages, workflow_stages tables
- Hooks: useWorkflowData, useWorkflowExecution
- Progress UI: StageTimeline, ExecutionProgressChart
- Vision files: GENESIS_RITUAL_SPECIFICATION.md, SIMULATION_CHAMBER_ARCHITECTURE.md
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'venture_stages',
          columns: ['id', 'venture_id', 'stage_number', 'stage_data', 'status', 'created_at'],
          relationships: ['FK to ventures.id']
        },
        {
          name: 'workflow_stages',
          columns: ['id', 'workflow_id', 'stage_number', 'stage_name', 'phase', 'is_kill_gate', 'is_promotion_gate'],
          relationships: ['FK to workflows.id']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: '/api/ventures/:id/stages/:stageNumber',
        method: 'GET',
        description: 'Fetch stage data for a venture',
        request: { venture_id: 'uuid', stageNumber: 'number' },
        response: { stage_data: 'object', status: 'string', can_proceed: 'boolean' }
      },
      {
        endpoint: '/api/ventures/:id/stages/:stageNumber/transition',
        method: 'POST',
        description: 'Attempt to transition to next stage (enforces gates)',
        request: { venture_id: 'uuid', stageNumber: 'number' },
        response: { success: 'boolean', next_stage: 'number', blocked_by_gate: 'string?' }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'StageContainer',
        description: 'Wraps all stage components with consistent layout, progress bar, navigation',
        wireframe: 'Inherits from existing stage layout'
      },
      {
        component: 'GateIndicator',
        description: 'Visual indicator for kill/promotion gates with clear pass/fail state',
        wireframe: 'Kill gates: red warning; Promotion gates: gold elevation badge'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Foundation (P0-P2)
- P0: Audit database, identify orphans
- P1: Create SSOT, delete duplicates
- P2: Create V2 shells and router

## Phase 2: Stage Implementation (P3-P4)
- P3: Safe stages (1-10, 24-25) - no duplicates to resolve
- P4: Crisis zone (11-23) - duplicate resolution per Vision V2

## Phase 3: Hardening (P5-P9)
- P5: ESLint governance
- P6: EVA timeout fix
- P7: God component refactoring
- P8: Test suite creation
- P9: API error handling

## Phase 4: Completion (P10)
- Vision alignment review
- Next SD generation for Genesis Oath v3.1
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Vite',
      'Shadcn UI',
      'Supabase PostgreSQL'
      // Add specific technologies for this PRD
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'TODO: Internal dependency',
        status: 'completed', // completed, in_progress, blocked
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Stage count verification',
        description: 'Verify exactly 25 stage files exist in /src/components/stages/v2/',
        expected_result: '25 files matching Stage[01-25]*.tsx pattern',
        test_type: 'unit'
      },
      {
        id: 'TS-2',
        scenario: 'SSOT exports validation',
        description: 'Verify SSOT exports TOTAL_WORKFLOW_STAGES=25 and all stage definitions',
        expected_result: 'All 25 stages defined with correct metadata',
        test_type: 'unit'
      },
      {
        id: 'TS-3',
        scenario: 'Kill gate enforcement',
        description: 'Attempt to bypass kill gates at stages 3, 5, 13, 23',
        expected_result: 'Stage transition blocked when kill gate fails',
        test_type: 'integration'
      },
      {
        id: 'TS-4',
        scenario: 'Promotion gate elevation',
        description: 'Verify promotion gates at 16, 17, 22 trigger elevation flow',
        expected_result: 'Simulation promoted to production on gate pass',
        test_type: 'integration'
      },
      {
        id: 'TS-5',
        scenario: 'Full venture lifecycle',
        description: 'Navigate through all 25 stages without crashes',
        expected_result: 'All stages render, no undefined property errors',
        test_type: 'e2e'
      },
      {
        id: 'TS-6',
        scenario: 'No hardcoded stage counts',
        description: 'Grep codebase for hardcoded "40" stage references',
        expected_result: '0 occurrences found',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      'All 25 stages load and function correctly with Vision V2 names',
      'SSOT drives all stage displays and routing',
      'Zero hardcoded stage counts in codebase (no "40", "15", or magic numbers)',
      'All kill gates (3, 5, 13, 23) enforce correctly',
      'All promotion gates (16, 17, 22) enforce correctly',
      'All legacy/duplicate stage files deleted (12 files)',
      'CI governance prevents regression (npm run audit:stages)',
      'E2E test passes for full venture lifecycle 1-25',
      'All 11 child SDs completed',
      'Component test coverage ≥80%'
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
        risk: 'Breaking existing venture data',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Ventures in progress may lose stage data',
        mitigation: 'P0 audits and archives before deletion; test ventures can be deleted'
      },
      {
        category: 'Technical',
        risk: 'Import path conflicts',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Build failures during transition',
        mitigation: 'P1 updates all imports systematically; TypeScript catches missing refs'
      },
      {
        category: 'Scope',
        risk: 'Scope creep during stage implementation',
        severity: 'MEDIUM',
        probability: 'HIGH',
        impact: 'Timeline extension beyond 44 days',
        mitigation: 'Child SDs have clear boundaries; focus on shell then content'
      },
      {
        category: 'Integration',
        risk: 'Vision V2 spec ambiguity',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Wrong stage naming or gate logic',
        mitigation: 'GENESIS_RITUAL_SPECIFICATION.md is authoritative; P10 validates alignment'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must maintain backward compatibility with existing hooks',
        impact: 'useWorkflowData and useWorkflowExecution must continue to work'
      },
      {
        type: 'technical',
        constraint: 'Cannot break EHG app while remediation in progress',
        impact: 'Changes must be atomic and tested before merge'
      },
      {
        type: 'resource',
        constraint: 'Single Claude Code session for execution',
        impact: 'Context management critical; use /context-compact at 70%'
      }
    ],

    assumptions: [
      {
        assumption: 'GENESIS_RITUAL_SPECIFICATION.md is the authoritative source for stage names',
        validation_method: 'Confirmed in triangulation assessment 2025-12-29'
      },
      {
        assumption: 'Test ventures can be deleted without business impact',
        validation_method: 'No production ventures exist yet'
      },
      {
        assumption: 'Vision V2 gate logic is final (kill: 3,5,13,23; promote: 16,17,22)',
        validation_method: 'Cross-reference with SIMULATION_CHAMBER_ARCHITECTURE.md'
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
