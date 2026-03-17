#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-DOCS-OVERHAUL-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-DOCS-OVERHAUL-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Documentation Cleanup & Completion'; // TODO: Replace with your PRD title

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
    category: 'documentation',
    priority: 'medium', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      This PRD covers the comprehensive documentation overhaul for the EHG platform following
      the major branch cleanup effort. The work includes updating stale README files, creating
      contribution guidelines, establishing developer onboarding documentation, and generating
      API documentation via OpenAPI specification.

      This documentation effort is critical for team scaling and onboarding new developers.
      Current README references Lovable (outdated), CONTRIBUTING.md is missing, and there is
      no centralized developer guide or API documentation.
    `.trim(),

    business_context: `
      Developer Experience:
      - New team members struggle with onboarding due to scattered documentation
      - README.md contains outdated references causing confusion
      - No contribution guidelines leads to inconsistent PR practices

      Business Objectives:
      - Reduce developer onboarding time from days to hours
      - Establish clear contribution standards
      - Enable external API consumers with proper documentation
    `.trim(),

    technical_context: `
      Current State:
      - ehg/README.md references Lovable (deprecated build system)
      - No CONTRIBUTING.md exists in either repository
      - API endpoints exist but lack OpenAPI documentation
      - v2 stage architecture undocumented

      Integration Points:
      - README must align with current Vite build system
      - OpenAPI spec must cover all /api/* endpoints
      - Documentation must reference database as source of truth
    `.trim(),

    // Requirements (JSONB arrays)
    // CRITICAL: Minimum 3 functional requirements required by database constraint
    // PRD validation will FAIL if fewer than 3 requirements are provided
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Update README.md to remove stale references',
        description: 'Update ehg/README.md to remove Lovable references, reflect current Vite build system, and document actual project structure',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'No references to Lovable in README.md',
          'Build instructions reference Vite commands',
          'Project structure section is accurate',
          'Quick start guide works for new developers'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Create CONTRIBUTING.md with contribution guidelines',
        description: 'Create CONTRIBUTING.md in ehg repo root with branch naming, commit message format, PR process, and code review guidelines',
        priority: 'HIGH',
        acceptance_criteria: [
          'CONTRIBUTING.md exists at ../ehg/CONTRIBUTING.md',
          'Includes branch naming conventions',
          'Includes commit message format (Co-Authored-By footer)',
          'Includes PR template and review process',
          'References LEO Protocol for SD-based work'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Create developer onboarding guide',
        description: 'Create comprehensive onboarding documentation covering local setup, architecture overview, common tasks, and troubleshooting',
        priority: 'HIGH',
        acceptance_criteria: [
          'Onboarding guide created at docs/ONBOARDING.md',
          'Covers local environment setup (Node, npm, env vars)',
          'Explains v2 stage architecture',
          'Documents common development workflows',
          'Includes troubleshooting section'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Generate OpenAPI specification for API endpoints',
        description: 'Generate OpenAPI 3.0 specification documenting all /api/* endpoints with request/response schemas',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'OpenAPI spec file exists at docs/api/openapi.yaml',
          'All existing API endpoints documented',
          'Request/response schemas defined',
          'Authentication requirements noted'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'usability',
        requirement: 'Documentation must be accessible to new developers',
        target_metric: 'New developer can set up local environment in <1 hour'
      },
      {
        type: 'maintainability',
        requirement: 'Documentation must be easy to keep up-to-date',
        target_metric: 'Single source of truth, no duplicate information'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Documentation format standards',
        description: 'All documentation in Markdown format with consistent heading structure',
        dependencies: ['GitHub markdown renderer']
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Documentation Architecture
      - README.md: Entry point for new developers
      - CONTRIBUTING.md: Guidelines for contributors
      - docs/ONBOARDING.md: Detailed setup and architecture guide
      - docs/api/openapi.yaml: API reference documentation

      ## Information Flow
      README → CONTRIBUTING → ONBOARDING → API Docs

      ## Integration Points
      - GitHub for rendering markdown
      - OpenAPI for API documentation generation
    `.trim(),

    data_model: {
      tables: []  // No database changes for documentation SD
    },

    api_specifications: [],  // Documenting existing APIs, not creating new ones

    ui_ux_requirements: [],  // No UI changes for documentation SD

    // Implementation
    implementation_approach: `
      ## Phase 1: README Update
      - Audit current README.md for stale references
      - Update build instructions for Vite
      - Add accurate project structure

      ## Phase 2: Contribution Guidelines
      - Create CONTRIBUTING.md with branch/commit conventions
      - Document PR process and review guidelines

      ## Phase 3: Developer Onboarding
      - Create comprehensive onboarding guide
      - Document v2 architecture and patterns

      ## Phase 4: API Documentation
      - Audit existing API endpoints
      - Generate OpenAPI specification
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
        scenario: 'README Lovable reference check',
        description: 'Verify no Lovable references remain in README.md',
        expected_result: 'grep -i lovable README.md returns no results',
        test_type: 'manual'
      },
      {
        id: 'TS-2',
        scenario: 'CONTRIBUTING.md exists',
        description: 'Verify CONTRIBUTING.md is present in repo root',
        expected_result: 'File exists at ../ehg/CONTRIBUTING.md',
        test_type: 'manual'
      },
      {
        id: 'TS-3',
        scenario: 'OpenAPI spec validity',
        description: 'Verify OpenAPI spec is valid YAML',
        expected_result: 'OpenAPI spec validates without errors',
        test_type: 'manual'
      }
    ],

    acceptance_criteria: [
      'README.md updated with no Lovable references',
      'CONTRIBUTING.md exists with contribution guidelines',
      'Developer onboarding guide created',
      'OpenAPI specification generated for API endpoints'
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
        risk: 'Documentation may become stale quickly',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'New developers receive outdated information',
        mitigation: 'Add "Last Updated" timestamps and review schedule'
      }
    ],

    constraints: [
      {
        type: 'process',
        constraint: 'Documentation must align with database-first principle',
        impact: 'Cannot document features that bypass database'
      }
    ],

    assumptions: [
      {
        assumption: 'Current API endpoints will remain stable',
        validation_method: 'Review with team before generating OpenAPI spec'
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
      // REQUIRED: exploration_summary - Documents files explored during PLAN phase
      exploration_summary: [
        {
          file_path: '../ehg/README.md',
          purpose: 'Audit current README for stale references',
          key_findings: 'Contains Lovable references, needs Vite build instructions update'
        },
        {
          file_path: '../ehg/src/pages/api/',
          purpose: 'Identify existing API endpoints for OpenAPI documentation',
          key_findings: '4 API endpoint files exist, need documentation'
        },
        {
          file_path: './docs/',
          purpose: 'Review existing documentation structure',
          key_findings: 'Good architecture docs exist, missing CONTRIBUTING and onboarding guide'
        },
        {
          file_path: '../ehg/src/components/stages/v2/',
          purpose: 'Understand v2 architecture for onboarding documentation',
          key_findings: 'v2 stages use consistent patterns, needs documentation'
        }
      ],
      estimated_hours: 8,
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
