#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-E2E-VENTURE-LAUNCH-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-E2E-VENTURE-LAUNCH-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Comprehensive E2E & UAT Suite for Venture Launch Protocol'; // TODO: Replace with your PRD title

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
    category: 'quality',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
This PRD defines a comprehensive E2E and UAT testing suite for the Venture Launch Protocol (SD-VENTURE-LAUNCH-PROTOCOL-001). The suite validates the entire venture launch lifecycle from pre-evaluation through post-launch monitoring.

The orchestrator coordinates four testing domains: Protocol Validation (Domain A), Pre-Launch Smoke Tests (Domain B), EHG Module Integration (Domain C), and Post-Launch UAT Framework (Domain D). Each domain is implemented as a child SD.

This testing infrastructure is critical for ensuring ventures can launch safely with consistent quality, proper evaluation, and continuous validation through calibration cycles.
    `.trim(),

    business_context: `
## Business Value
- **Risk Reduction**: Automated testing catches issues before venture launch
- **Quality Consistency**: Standardized smoke test template ensures uniform quality bar
- **Calibration Loop**: Post-launch UAT enables prediction accuracy improvement
- **Dogfooding Validation**: Tests verify EHG modules work correctly together

## Success Impact
- Zero critical defects in launched ventures
- 90%+ prediction accuracy for venture evaluations
- <5 min smoke test execution time
- 30/60/90 day review automation operational
    `.trim(),

    technical_context: `
## Existing Infrastructure
- 140+ E2E tests in ../ehg/tests/e2e/
- Playwright test framework with auth fixtures
- Test Management System (completed)
- CI/CD pipeline with GitHub Actions

## Integration Points
- EVAL-MATRIX-001: Four-Plane Evaluation Matrix (in progress)
- vision-v2-ceo-runtime: Venture CEO Runtime (completed)
- EVAL-MATRIX-001-B: Attention Queue Dashboard (in progress)
- SD-VENTURE-LAUNCH-PROTOCOL-001: Venture Launch Protocol (this SD's consumer)
    `.trim(),

    // Requirements (JSONB arrays)
    // CRITICAL: Minimum 3 functional requirements required by database constraint
    // PRD validation will FAIL if fewer than 3 requirements are provided
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Domain A: Protocol Validation Test Suite',
        description: 'E2E tests validating Four-Plane Evaluation Matrix, capability tracking, checklist progression, and portfolio classification',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All 4 planes of evaluation matrix tested (scoring, thresholds, persistence)',
          'Capability contribution CRUD operations tested',
          'Checklist phase progression (A→E) validated',
          'Portfolio quadrant classification verified'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Domain B: Pre-Launch Smoke Test Template',
        description: 'Reusable smoke test template that defines minimum quality bar for any venture launch',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Smoke test template created and documented',
          'Core functionality, auth, performance, accessibility, security baselines covered',
          'Template execution time under 5 minutes',
          'NameForge and Discovery Engine both pass smoke tests'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Domain C: Module Integration Test Suite',
        description: 'Tests verifying dogfooding flow between EHG modules (NameForge, ContentForge, Financial Engine, LaunchPad)',
        priority: 'HIGH',
        acceptance_criteria: [
          'Full dogfooding flow tested end-to-end',
          'Cross-module data consistency verified',
          'Error handling between modules tested',
          'Module handoff points validated'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Domain D: Post-Launch UAT Framework',
        description: 'UAT framework for validating live ventures with scenario templates, calibration hooks, and 30/60/90 day review automation',
        priority: 'HIGH',
        acceptance_criteria: [
          'UAT scenario templates created for venture types',
          'Calibration data collection hooks operational',
          '30/60/90 day review automation implemented',
          'At least one venture completes 90-day review'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'CI/CD Integration',
        description: 'GitHub Actions workflow enforcing test gates before venture launches',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'CI workflow created for launch gate',
          'Test evidence auto-captured',
          'Quality gate blocks launch on failure',
          'Dashboard integration shows test status'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Test suite execution time',
        target_metric: 'Smoke tests <5min, full suite <30min'
      },
      {
        type: 'reliability',
        requirement: 'Test stability',
        target_metric: '<2% flake rate, no false positives'
      },
      {
        type: 'maintainability',
        requirement: 'Test code quality',
        target_metric: 'Page object pattern, shared fixtures, documented'
      },
      {
        type: 'scalability',
        requirement: 'Support multiple ventures',
        target_metric: 'Template-based approach supports N ventures'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Playwright E2E Framework',
        description: 'Use existing Playwright setup with shared auth fixtures',
        dependencies: ['@playwright/test', 'playwright-auth-fixture']
      },
      {
        id: 'TR-2',
        requirement: 'Test Management Integration',
        description: 'Register tests with Test Management System for tracking',
        dependencies: ['Test Management System', 'test-scanner']
      },
      {
        id: 'TR-3',
        requirement: 'GitHub Actions CI/CD',
        description: 'Workflow for launch gate enforcement',
        dependencies: ['GitHub Actions', 'ehg-app workflow']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
Orchestrator SD coordinating 4 child test domains:

\`\`\`
SD-E2E-VENTURE-LAUNCH-001 (Orchestrator)
├── 001A: Protocol Validation    → tests/e2e/venture-launch/protocol-validation.spec.ts
├── 001B: Smoke Tests           → tests/e2e/templates/venture-smoke.template.ts
├── 001C: Module Integration    → tests/e2e/venture-launch/module-integration.spec.ts
└── 001D: UAT Framework         → UAT scenario templates + calibration hooks
\`\`\`

## Data Flow
1. Venture enters launch protocol
2. Protocol validation tests run (Domain A)
3. Pre-launch smoke tests execute (Domain B)
4. Module integration verified (Domain C)
5. Launch proceeds if all pass
6. Post-launch UAT kicks in (Domain D)
7. 30/60/90 day calibration reviews

## Integration Points
- EVAL-MATRIX-001: Four-Plane scoring APIs
- Test Management System: Test registration & results
- GitHub Actions: CI/CD enforcement
- Attention Queue Dashboard: Test status display
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'TODO_table_name',
          columns: ['id', 'name', 'created_at'],
          relationships: ['TODO: Foreign keys']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: '/api/TODO',
        method: 'GET',
        description: 'TODO: Endpoint description',
        request: {},
        response: {}
      }
    ],

    ui_ux_requirements: [
      {
        component: 'TODO: Component name',
        description: 'TODO: UI/UX requirements',
        wireframe: 'TODO: Link to wireframe'
      }
    ],

    // Implementation
    implementation_approach: `
## Orchestrator Execution Strategy

This is an orchestrator SD - implementation is driven by completing child SDs.

### Phase 1: Child SD Initialization
1. Create PRDs for all 4 child SDs (001A, 001B, 001C, 001D)
2. Establish test directory structure in EHG repo
3. Define shared fixtures and page objects

### Phase 2: Child SD Execution (Parallel)
Execute child SDs in parallel where possible:
- **001A** (Protocol Validation): Depends on EVAL-MATRIX-001
- **001B** (Smoke Tests): Independent, can start immediately
- **001C** (Module Integration): Independent, can start immediately
- **001D** (UAT Framework): Can start after 001A/B patterns established

### Phase 3: Integration & Validation
1. Integrate all domains into launch gate workflow
2. Run full suite against NameForge (pilot venture 1)
3. Run full suite against Discovery Engine (pilot venture 2)
4. Complete first 90-day UAT calibration cycle

### Orchestrator Completion
Orchestrator completes when all 4 child SDs are completed and validated.
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
        name: 'EVAL-MATRIX-001 (Four-Plane Evaluation Matrix)',
        status: 'in_progress',
        blocker: true,
        notes: 'Domain A tests depend on evaluation matrix UI existing'
      },
      {
        type: 'internal',
        name: 'Test Management System',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'Playwright E2E Infrastructure',
        status: 'completed',
        blocker: false
      },
      {
        type: 'child_sd',
        name: 'SD-E2E-VENTURE-LAUNCH-001A (Protocol Validation)',
        status: 'draft',
        blocker: false
      },
      {
        type: 'child_sd',
        name: 'SD-E2E-VENTURE-LAUNCH-001B (Smoke Tests)',
        status: 'draft',
        blocker: false
      },
      {
        type: 'child_sd',
        name: 'SD-E2E-VENTURE-LAUNCH-001C (Module Integration)',
        status: 'draft',
        blocker: false
      },
      {
        type: 'child_sd',
        name: 'SD-E2E-VENTURE-LAUNCH-001D (UAT Framework)',
        status: 'draft',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Four-Plane Evaluation Complete Flow',
        description: 'Test venture progresses through all 4 planes of evaluation matrix',
        expected_result: 'Venture scores calculated, thresholds enforced, portfolio quadrant assigned',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'Pre-Launch Smoke Test Suite',
        description: 'Execute smoke test template against test venture',
        expected_result: 'All baselines pass: auth, perf, a11y, security, mobile',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Dogfooding Module Integration',
        description: 'Test data flows between NameForge, ContentForge, Financial Engine, LaunchPad',
        expected_result: 'Venture data consistent across all modules, handoffs work',
        test_type: 'integration'
      },
      {
        id: 'TS-4',
        scenario: 'Post-Launch UAT Execution',
        description: 'Execute UAT scenario template on launched venture',
        expected_result: 'UAT pass/fail recorded, calibration data captured',
        test_type: 'e2e'
      },
      {
        id: 'TS-5',
        scenario: 'CI/CD Launch Gate',
        description: 'PR triggers launch gate workflow in GitHub Actions',
        expected_result: 'Tests run, results captured, gate blocks/passes appropriately',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'All 4 child SDs (001A, 001B, 001C, 001D) completed',
      'NameForge venture passes all test domains',
      'Discovery Engine venture passes all test domains',
      'CI/CD launch gate workflow operational',
      'At least one 90-day calibration review completed',
      'Test evidence captured in Test Management System',
      '<2% test flake rate achieved'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created for orchestrator', checked: true },
      { text: 'Child SD PRDs created (001A, 001B, 001C, 001D)', checked: false },
      { text: 'Test directory structure defined', checked: false },
      { text: 'Shared fixtures architecture planned', checked: false },
      { text: 'CI/CD workflow design documented', checked: false },
      { text: 'Child SD dependencies mapped', checked: false }
    ],

    exec_checklist: [
      { text: 'Child SD 001A (Protocol Validation) completed', checked: false },
      { text: 'Child SD 001B (Smoke Tests) completed', checked: false },
      { text: 'Child SD 001C (Module Integration) completed', checked: false },
      { text: 'Child SD 001D (UAT Framework) completed', checked: false },
      { text: 'Launch gate workflow integrated', checked: false },
      { text: 'NameForge pilot validation passed', checked: false },
      { text: 'Discovery Engine pilot validation passed', checked: false }
    ],

    validation_checklist: [
      { text: 'All child SDs completed and merged', checked: false },
      { text: 'Full test suite runs <30 min', checked: false },
      { text: 'Flake rate <2%', checked: false },
      { text: 'At least one 90-day UAT review completed', checked: false },
      { text: 'Test evidence in Test Management System', checked: false }
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
        risk: 'EVAL-MATRIX-001 dependency delays Domain A',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Cannot test Four-Plane Matrix until it exists',
        mitigation: 'Start with Domains B, C which are independent'
      },
      {
        category: 'Technical',
        risk: 'Test flakiness blocks launches',
        severity: 'HIGH',
        probability: 'MEDIUM',
        impact: 'Ventures blocked from launching due to flaky tests',
        mitigation: 'Implement retry logic, quarantine flaky tests, <2% flake target'
      },
      {
        category: 'Process',
        risk: 'UAT scope creep',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'UAT becomes too heavy for practical use',
        mitigation: 'Define clear UAT boundaries per venture type upfront'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use existing Playwright infrastructure',
        impact: 'Limited to Playwright capabilities, existing auth fixtures'
      },
      {
        type: 'dependency',
        constraint: 'EVAL-MATRIX-001 must reach testable state',
        impact: 'Domain A tests blocked until matrix UI exists'
      }
    ],

    assumptions: [
      {
        assumption: 'Existing 140 E2E tests provide foundation for patterns',
        validation_method: 'Review existing tests for reusable patterns'
      },
      {
        assumption: 'Test Management System can handle launch gate integration',
        validation_method: 'Verify TMS APIs support required operations'
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
      exploration_summary: [
        {
          file_path: '../ehg/tests/e2e/',
          purpose: 'Review existing E2E test structure and patterns',
          key_findings: '140 E2E tests exist, organized by feature, use Playwright with shared auth fixtures'
        },
        {
          file_path: './scripts/sd-next.js',
          purpose: 'Understand SD queue and dependency tracking',
          key_findings: 'Child SDs work after parent enters EXEC phase, orchestrator completion driven by children'
        },
        {
          file_path: 'SD-VENTURE-LAUNCH-PROTOCOL-001 scope',
          purpose: 'Understand Venture Launch Protocol requirements',
          key_findings: 'Five phases (A-E), Four-Plane Matrix evaluation, capability contribution tracking, dogfooding requirement'
        },
        {
          file_path: 'brainstorm/topic-3-deep-research-prompt.md',
          purpose: 'Understand capability vs success balance research',
          key_findings: 'Four-Plane model, calibration reviews, portfolio visualization needs'
        }
      ],
      child_sds: [
        'SD-E2E-VENTURE-LAUNCH-001A',
        'SD-E2E-VENTURE-LAUNCH-001B',
        'SD-E2E-VENTURE-LAUNCH-001C',
        'SD-E2E-VENTURE-LAUNCH-001D'
      ],
      orchestrator_type: 'test_suite',
      estimated_hours: 40
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
  // STEP 6: Auto-invoke PLAN phase sub-agents (Gap #1 Fix)
  // -------------------------------------------------------------------------

  console.log('\n6️⃣  Auto-invoking PLAN phase sub-agents...');

  try {
    // Dynamic import to avoid circular dependencies
    const { orchestrate } = await import('./orchestrate-phase-subagents.js');
    const orchestrationResult = await orchestrate('PLAN_PRD', SD_ID, { autoRemediate: true });

    if (orchestrationResult.status === 'PASS' || orchestrationResult.status === 'COMPLETE') {
      console.log(`   ✅ Sub-agents completed: ${orchestrationResult.executed?.join(', ') || 'All required'}`);
    } else if (orchestrationResult.status === 'PARTIAL') {
      console.log(`   ⚠️  Some sub-agents had issues: ${JSON.stringify(orchestrationResult.summary)}`);
    } else {
      console.log(`   ⚠️  Sub-agent orchestration status: ${orchestrationResult.status}`);
      console.log('   You may need to run sub-agents manually for full compliance');
    }
  } catch (orchestrationError) {
    console.warn('   ⚠️  Sub-agent auto-invocation failed:', orchestrationError.message);
    console.log('   Sub-agents can be run manually later with:');
    console.log(`      node scripts/orchestrate-phase-subagents.js PLAN_PRD ${SD_ID}`);
  }

  // -------------------------------------------------------------------------
  // STEP 7: Success Summary
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
  console.log('   2. Verify sub-agent results in database (auto-invoked above)');
  console.log('   3. Mark plan_checklist items as complete');
  console.log('   4. Create PLAN→EXEC handoff when ready');
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
