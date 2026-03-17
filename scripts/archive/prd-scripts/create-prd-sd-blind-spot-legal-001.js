#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-BLIND-SPOT-LEGAL-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-BLIND-SPOT-LEGAL-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Legal/Compliance Foundation'; // TODO: Replace with your PRD title

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
      ORCHESTRATOR PRD: This SD coordinates three child SDs that establish the Legal/Compliance Foundation for EHG's multi-venture portfolio.

      Child SDs:
      - SD-LEGAL-STRUCTURE-001: Series LLC Formation (documentation - Delaware Series LLC setup)
      - SD-LEGAL-TEMPLATES-001: Master Legal Templates (ToS, Privacy Policy, DPA templates in database)
      - SD-COMPLIANCE-GDPR-001: GDPR Compliance Patterns (feature - consent, deletion, export)

      This orchestrator completes when all 3 children reach COMPLETED status. No direct implementation.
    `.trim(),

    business_context: `
      Building 10-32 ventures requires robust legal infrastructure without per-venture attorney fees:
      - Series LLC provides liability segregation with single Delaware filing
      - Master templates enable rapid venture launch with consistent legal coverage
      - GDPR compliance is table-stakes for EU market access

      Success enables scaling from 1 to 32+ ventures with minimal legal overhead.
    `.trim(),

    technical_context: `
      Existing infrastructure provides 85% foundation:
      - PolicyManagement.tsx: CRUD for governance policies with status workflow
      - DocumentList/Upload: Document management with "Legal" category
      - security_policies table: Schema pattern for legal_templates
      - EVAComplianceDashboard: GDPR report generation exists

      Gaps: legal-specific templates, approval hierarchies, consent components
    `.trim(),

    // Requirements (JSONB arrays)
    // CRITICAL: Minimum 3 functional requirements required by database constraint
    // PRD validation will FAIL if fewer than 3 requirements are provided
    functional_requirements: [
      {
        id: 'FR-ORCH-1',
        requirement: 'Coordinate SD-LEGAL-STRUCTURE-001 completion',
        description: 'Child SD delivers Series LLC documentation, operating agreement template, and banking setup checklist',
        priority: 'HIGH',
        acceptance_criteria: [
          'SD-LEGAL-STRUCTURE-001 status = completed',
          'LLC formation documentation created',
          'legal_processes table exists to track formation status'
        ]
      },
      {
        id: 'FR-ORCH-2',
        requirement: 'Coordinate SD-LEGAL-TEMPLATES-001 completion',
        description: 'Child SD delivers legal_templates table with ToS, Privacy Policy, DPA templates and Admin UI',
        priority: 'HIGH',
        acceptance_criteria: [
          'SD-LEGAL-TEMPLATES-001 status = completed',
          'legal_templates and venture_legal_overrides tables exist',
          'Admin UI at /admin/legal-templates functional'
        ]
      },
      {
        id: 'FR-ORCH-3',
        requirement: 'Coordinate SD-COMPLIANCE-GDPR-001 completion',
        description: 'Child SD delivers GDPR consent, data deletion, and export functionality with E2E tests',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'SD-COMPLIANCE-GDPR-001 status = completed',
          'CookieConsentBanner component functional',
          'Data deletion/export jobs operational',
          'E2E tests passing'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'scalability',
        requirement: 'Multi-venture legal template system',
        target_metric: 'Support 32+ ventures with per-venture overrides'
      },
      {
        type: 'compliance',
        requirement: 'GDPR Article 17 compliance (Right to Erasure)',
        target_metric: 'Data deletion within 72 hours of request'
      },
      {
        type: 'security',
        requirement: 'Legal documents protected by RLS',
        target_metric: 'All legal tables have venture-scoped RLS policies'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Extend existing policy management patterns',
        description: 'Reuse PolicyManagement.tsx and security_policies schema patterns',
        dependencies: ['PolicyManagement.tsx', 'security_policies table schema']
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview (Orchestrator)
      This orchestrator coordinates 3 child SDs. No direct implementation.

      ## Child SD Responsibilities
      - SD-LEGAL-STRUCTURE-001: Documentation only (LLC formation process)
      - SD-LEGAL-TEMPLATES-001: Database tables + Admin UI
      - SD-COMPLIANCE-GDPR-001: Full feature (UI + backend jobs + E2E)

      ## Dependency Order
      1. SD-LEGAL-STRUCTURE-001 (no dependencies)
      2. SD-LEGAL-TEMPLATES-001 (no dependencies)
      3. SD-COMPLIANCE-GDPR-001 (depends on legal_templates for consent_text_version)
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
      ## Phase 1: Foundation
      [TODO: Initial setup and core functionality]

      ## Phase 2: Feature Development
      [TODO: Main feature implementation]

      ## Phase 3: Testing & Deployment
      [TODO: Testing, validation, deployment]
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
        scenario: 'TODO: Test scenario name',
        description: 'TODO: What to test',
        expected_result: 'TODO: Expected outcome',
        test_type: 'unit' // unit, integration, e2e
      }
    ],

    acceptance_criteria: [
      'All 3 child SDs completed (status = completed)',
      'legal_templates and venture_legal_overrides tables exist with RLS',
      'GDPR consent banner functional across ventures',
      'Data deletion and export jobs operational',
      'E2E tests passing for GDPR flows'
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
        category: 'External',
        risk: 'LLC formation requires human action (Delaware filing)',
        severity: 'MEDIUM',
        probability: 'HIGH',
        impact: 'SD-LEGAL-STRUCTURE-001 blocked on human action',
        mitigation: 'Track process in database, document steps for self-service'
      },
      {
        category: 'Legal',
        risk: 'Templates require professional legal review',
        severity: 'MEDIUM',
        probability: 'HIGH',
        impact: 'Templates marked as draft until externally reviewed',
        mitigation: 'Clear draft/reviewed status workflow'
      }
    ],

    constraints: [
      {
        type: 'external',
        constraint: 'Legal formation requires external service (Delaware SoS)',
        impact: 'Cannot fully automate LLC creation'
      }
    ],

    assumptions: [
      {
        assumption: 'Series LLC is appropriate legal structure for multi-venture portfolio',
        validation_method: 'Confirmed by triangulation research with 3 AI models'
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
          file_path: '../ehg/src/components/agents/ComplianceTab/ComplianceTab.tsx',
          purpose: 'Existing compliance engine UI pattern',
          key_findings: 'CCE integration, violation management, event logging - reusable for legal docs'
        },
        {
          file_path: '../ehg/src/components/governance/PolicyManagement.tsx',
          purpose: 'Full CRUD for governance policies',
          key_findings: 'Multi-tab form, status workflow, compliance mapping - directly adaptable'
        },
        {
          file_path: '../ehg/app/api/policies/route.ts',
          purpose: 'Authenticated policy API endpoints',
          key_findings: 'GET/POST with pagination, category validation, version management'
        },
        {
          file_path: '../ehg/src/components/documents/DocumentList.tsx',
          purpose: 'Document management with Legal category',
          key_findings: 'Upload, categorization, versioning - directly usable for templates'
        },
        {
          file_path: '../ehg/supabase/migrations/20250829152544_d247b2dc-eb80-4738-af70-078656c1080a.sql',
          purpose: 'Security policies table schema',
          key_findings: 'Policy types, status workflow, RLS - pattern for legal_templates'
        }
      ],
      sd_type: 'orchestrator',
      child_sds: ['SD-LEGAL-STRUCTURE-001', 'SD-LEGAL-TEMPLATES-001', 'SD-COMPLIANCE-GDPR-001'],
      estimated_hours: 20
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
