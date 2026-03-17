#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-ROUTE-AUDIT-PARENT with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-ROUTE-AUDIT-PARENT'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'EHG Route Assessment - Comprehensive Platform Audit'; // TODO: Replace with your PRD title

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
    category: 'audit',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      Orchestrate a comprehensive assessment of all EHG platform routes across 7 navigation sections
      and the complete 25-stage venture workflow. This audit evaluates 127+ frontend routes and 47+ API
      endpoints using sub-agents (DESIGN, SECURITY, PERFORMANCE, TESTING, DATABASE) to identify issues
      categorized by severity (P0-P3).

      The audit is structured as a parent-child hierarchy with 34 child SDs covering section assessments
      (CMD, Ventures, Analytics, GTM, AI, Settings, Admin), workflow deep analysis (25 stages), and
      final report generation. Each child SD follows the full LEO Protocol (LEAD→PLAN→EXEC).

      Output: A comprehensive report at docs/reports/ROUTE_AUDIT_REPORT_YYYY-MM-DD.md with findings,
      severity classifications, and corrective SD recommendations for remediation work.
    `.trim(),

    business_context: `
      User pain points: Inconsistent UX across routes, unknown accessibility gaps, unvalidated
      security posture, and performance issues affecting user satisfaction.

      Business objectives: Establish platform-wide quality baseline, identify technical debt,
      and create actionable remediation plan to improve user experience.

      Success metrics: 100% route coverage, all P0/P1 issues identified, comprehensive report
      generated with corrective SDs ready for prioritization.
    `.trim(),

    technical_context: `
      Existing systems: React 18 frontend with TypeScript, Shadcn UI components, Supabase PostgreSQL
      backend, 25-stage venture workflow with kill gates and elevation points.

      Architecture patterns: App router structure with 7 navigation sections, shared components,
      Zustand state management, React Query for data fetching.

      Integration points: Supabase Auth, RLS policies, API routes, WebSocket real-time updates.
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Section Route Assessment',
        description: 'Assess all routes in 7 navigation sections (CMD, Ventures, Analytics, GTM, AI, Settings, Admin)',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Each section SD completes LEAD→PLAN→EXEC cycle',
          'All routes in section receive design, accessibility, performance, security evaluation',
          'Issues logged with P0-P3 severity classification'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Workflow Deep Assessment',
        description: 'Deep analysis of 25-stage venture workflow including kill gates and elevation points',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All 25 stage SDs complete assessment',
          'Kill gates (3, 5, 11, 16) receive extra scrutiny',
          'Elevation points (16, 17, 22) validated for data handoff integrity'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Sub-Agent Execution',
        description: 'Invoke DESIGN, SECURITY, PERFORMANCE sub-agents per route assessment',
        priority: 'HIGH',
        acceptance_criteria: [
          'DESIGN sub-agent evaluates UI consistency and WCAG compliance',
          'SECURITY sub-agent validates auth requirements and data exposure',
          'PERFORMANCE sub-agent measures load times and bundle impact'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Comprehensive Report Generation',
        description: 'Generate detailed audit report with findings and corrective SD recommendations',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Report includes all route assessments aggregated by section',
          'Issues categorized P0 (Critical), P1 (High), P2 (Medium), P3 (Low)',
          'Corrective SDs drafted for P0/P1 issues',
          'Report saved to docs/reports/ROUTE_AUDIT_REPORT_YYYY-MM-DD.md'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'coverage',
        requirement: '100% route coverage',
        target_metric: 'All 127+ frontend routes assessed'
      },
      {
        type: 'coverage',
        requirement: 'API endpoint coverage',
        target_metric: 'All 47+ API endpoints security reviewed'
      },
      {
        type: 'quality',
        requirement: 'Gate compliance',
        target_metric: '≥85% gate pass rate for all child SDs'
      },
      {
        type: 'documentation',
        requirement: 'Detailed findings',
        target_metric: 'Each issue has description, severity, location, and remediation suggestion'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'LEO Protocol Compliance',
        description: 'All 35 SDs follow LEAD→PLAN→EXEC phase workflow with proper handoffs',
        dependencies: ['handoff.js', 'phase-preflight.js']
      },
      {
        id: 'TR-2',
        requirement: 'Database Recording',
        description: 'All findings recorded in database for persistence and reporting',
        dependencies: ['Supabase', 'strategic_directives_v2', 'sd_phase_handoffs']
      },
      {
        id: 'TR-3',
        requirement: 'Orchestrator Pattern',
        description: 'Parent SD orchestrates children, completes only after all children finish',
        dependencies: ['Parent-child SD relationships via parent_sd_id']
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview
      Orchestrator pattern with parent SD coordinating 34 child SDs:
      - Parent: SD-ROUTE-AUDIT-PARENT (this SD)
      - Section Children (7): CMD, Ventures, Analytics, GTM, AI, Settings, Admin
      - Workflow Parent: SD-ROUTE-AUDIT-WORKFLOW
      - Stage Grandchildren (25): STAGE-01 through STAGE-25
      - Report: SD-ROUTE-AUDIT-REPORT (depends on all above)

      ## Data Flow
      1. Parent enters EXEC → Children become workable
      2. Section SDs assess their routes → Record findings
      3. Workflow SD orchestrates 25 stage assessments
      4. Report SD aggregates all findings → Generate markdown report
      5. Parent completes when all children complete

      ## Integration Points
      - strategic_directives_v2: SD status and progress tracking
      - sd_phase_handoffs: Phase transition records
      - product_requirements_v2: PRD storage
      - File system: Report output to docs/reports/
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'strategic_directives_v2',
          columns: ['id', 'sd_key', 'title', 'status', 'current_phase', 'parent_sd_id', 'completion_percentage'],
          relationships: ['parent_sd_id → strategic_directives_v2.id']
        },
        {
          name: 'sd_phase_handoffs',
          columns: ['id', 'sd_id', 'handoff_type', 'from_phase', 'to_phase', 'validation_score'],
          relationships: ['sd_id → strategic_directives_v2.id']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'handoff.js',
        method: 'CLI',
        description: 'Execute phase transitions (LEAD-TO-PLAN, PLAN-TO-EXEC, etc.)',
        request: { sdId: 'string', handoffType: 'string' },
        response: { success: 'boolean', score: 'number' }
      },
      {
        endpoint: 'phase-preflight.js',
        method: 'CLI',
        description: 'Run preflight checks before phase transition',
        request: { phase: 'string', sdId: 'string' },
        response: { ready: 'boolean', issues: 'array' }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'Route Assessment',
        description: 'Each route evaluated for design consistency, accessibility, performance',
        wireframe: 'N/A - Assessment process, not UI implementation'
      },
      {
        component: 'Report Output',
        description: 'Markdown report with findings organized by section and severity',
        wireframe: 'docs/reports/ROUTE_AUDIT_REPORT_YYYY-MM-DD.md'
      }
    ],

    // Implementation
    implementation_approach: `
      ## Phase 1: Parent Setup (This PRD)
      - Create parent PRD with orchestration requirements
      - Execute PLAN-TO-EXEC handoff to enter orchestration mode
      - Parent enters WAITING state while children work

      ## Phase 2: Section Assessments (7 SDs)
      - Critical sections first (Ventures, Admin)
      - Then High priority (CMD, Analytics, AI)
      - Then Medium priority (GTM, Settings)
      - Each follows full LEO Protocol

      ## Phase 3: Workflow Deep Assessment (25 Stages)
      - Sequential execution (stages depend on previous)
      - Extra scrutiny on kill gates (3, 5, 11, 16)
      - Validate elevation points (16, 17, 22)

      ## Phase 4: Report Generation
      - Aggregate all child findings
      - Categorize by severity (P0-P3)
      - Draft corrective SDs for P0/P1 issues
      - Save report to docs/reports/

      ## Phase 5: Parent Completion
      - Verify all 34 children complete
      - Execute EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL
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
        scenario: 'Child SD Completion Tracking',
        description: 'Verify parent tracks child SD completion correctly',
        expected_result: 'Parent completion_percentage reflects child progress (34 children = 100%)',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Handoff Validation Gates',
        description: 'All child SDs pass ≥85% on phase handoffs',
        expected_result: 'No child SD proceeds with <85% gate score',
        test_type: 'integration'
      },
      {
        id: 'TS-3',
        scenario: 'Report Generation Completeness',
        description: 'Final report includes all section and stage findings',
        expected_result: 'Report file exists with 7 sections + 25 stages documented',
        test_type: 'e2e'
      },
      {
        id: 'TS-4',
        scenario: 'Issue Severity Classification',
        description: 'All identified issues have proper P0-P3 classification',
        expected_result: 'Each issue in report has severity, description, location, recommendation',
        test_type: 'e2e'
      }
    ],

    acceptance_criteria: [
      'All 34 child SDs complete LEAD→PLAN→EXEC cycle',
      'All phase handoffs achieve ≥85% gate score',
      '127+ frontend routes assessed with sub-agent evaluations',
      '47+ API endpoints reviewed for security and performance',
      '25 workflow stages receive deep analysis',
      'Comprehensive report generated at docs/reports/',
      'P0/P1 issues have corrective SD recommendations drafted'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to orchestration specs', checked: true },
      { text: 'Child SD hierarchy defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'N/A - STORIES sub-agent (orchestrator SD)', checked: true },
      { text: 'N/A - DATABASE sub-agent (orchestrator SD)', checked: true },
      { text: 'N/A - SECURITY sub-agent (orchestrator SD)', checked: true }
    ],

    exec_checklist: [
      { text: 'Parent SD enters orchestration mode', checked: false },
      { text: 'Section SDs complete (7 total)', checked: false },
      { text: 'Workflow SD and 25 stages complete', checked: false },
      { text: 'Report SD generates comprehensive audit', checked: false },
      { text: 'All child SDs pass ≥85% gates', checked: false },
      { text: 'All issues classified P0-P3', checked: false },
      { text: 'Corrective SDs drafted for P0/P1', checked: false }
    ],

    validation_checklist: [
      { text: 'All 34 child SDs complete', checked: false },
      { text: 'All routes assessed (127+ frontend, 47+ API)', checked: false },
      { text: 'Report generated at docs/reports/', checked: false },
      { text: 'P0/P1 issues have remediation recommendations', checked: false },
      { text: 'Parent SD completion approved', checked: false }
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
        category: 'Scale',
        risk: 'Large scope (35 SDs) may cause context overflow',
        severity: 'HIGH',
        probability: 'MEDIUM',
        impact: 'Work loss if context exceeds capacity mid-assessment',
        mitigation: 'Use context-compact proactively at 70%, batch parallel work'
      },
      {
        category: 'Process',
        risk: 'Gate failures block child SD progress',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Child SD cannot proceed, delays parent completion',
        mitigation: 'Fix root cause immediately, re-run gate validation'
      },
      {
        category: 'Dependency',
        risk: 'Sequential stage dependency chain breaks',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Workflow assessment cannot complete',
        mitigation: 'Process stages in strict order, validate each before proceeding'
      },
      {
        category: 'Quality',
        risk: 'Sub-agent results incomplete or missing',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Assessment quality degraded',
        mitigation: 'Re-execute sub-agent before marking assessment complete'
      }
    ],

    constraints: [
      {
        type: 'process',
        constraint: 'LEO Protocol compliance required',
        impact: 'All SDs must follow LEAD→PLAN→EXEC with proper handoffs'
      },
      {
        type: 'dependency',
        constraint: 'Stage SDs are sequential',
        impact: 'Cannot parallelize workflow assessment'
      },
      {
        type: 'quality',
        constraint: 'Gate threshold ≥85%',
        impact: 'Cannot proceed with failing gates'
      }
    ],

    assumptions: [
      {
        assumption: 'All routes are accessible and functioning',
        validation_method: 'Navigate to each route before assessment'
      },
      {
        assumption: 'Sub-agents available and operational',
        validation_method: 'Run sub-agent preflight check'
      },
      {
        assumption: 'Database has capacity for all assessment records',
        validation_method: 'Monitor table sizes during assessment'
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
