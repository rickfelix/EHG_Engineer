#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-VS-PATTERN-UNLOCK-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-VS-PATTERN-UNLOCK-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Priority Pattern Library Expansion'; // TODO: Replace with your PRD title

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
    category: 'product_feature',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      This SD expands the scaffold_patterns table with 4 critical patterns needed for venture selection:
      StripeService (billing/subscriptions), RBACMiddleware (roles/permissions), useCRUD (standardized Supabase binding),
      and BackgroundJob (queue/retry logic). Each pattern includes template_code, variables, dependencies, and usage examples.

      These patterns unlock new venture opportunities that require billing, authorization, CRUD operations,
      and background processing capabilities - core infrastructure for most SaaS applications.
    `.trim(),

    business_context: `
      The venture selection framework evaluates opportunities based on pattern matching. Currently 45 patterns exist,
      but 4 critical patterns are missing: StripeService, RBACMiddleware, useCRUD, and BackgroundJob.

      Without these patterns, ventures requiring billing, authorization, or background processing score poorly
      even when they're excellent opportunities. Adding these patterns expands the viable venture space.
    `.trim(),

    technical_context: `
      Patterns are stored in scaffold_patterns table with: pattern_key, name, description, category, template_code,
      variables, dependencies, usage_examples, tags, and metadata. Each pattern must follow the established schema
      and provide working template code that can be scaffolded into new projects.
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Add StripeService pattern',
        description: 'Pattern for billing, subscriptions, metering, and webhooks integration with Stripe',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Pattern exists in scaffold_patterns with pattern_key: stripe_service',
          'Template code includes Stripe client initialization, subscription management, webhook handling',
          'Variables defined for API keys, webhook secret, price IDs',
          'Dependencies include @stripe/stripe-js, stripe'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Add RBACMiddleware pattern',
        description: 'Pattern for roles, permissions, organization membership, and row-level policies',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Pattern exists in scaffold_patterns with pattern_key: rbac_middleware',
          'Template code includes role checking, permission validation, org context',
          'Variables defined for role hierarchy, default permissions',
          'Dependencies include Supabase RLS policy templates'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Add useCRUD Hook pattern',
        description: 'Standardized React hook for Supabase table binding with React Query',
        priority: 'HIGH',
        acceptance_criteria: [
          'Pattern exists in scaffold_patterns with pattern_key: use_crud_hook',
          'Template code includes create, read, update, delete operations',
          'Variables defined for table name, primary key, columns',
          'Dependencies include @tanstack/react-query, @supabase/supabase-js'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Add BackgroundJob pattern',
        description: 'Pattern for queue processing, retry logic, idempotency, and status tracking',
        priority: 'HIGH',
        acceptance_criteria: [
          'Pattern exists in scaffold_patterns with pattern_key: background_job',
          'Template code includes job queue, retry with exponential backoff, status UI',
          'Variables defined for max retries, backoff multiplier, job types',
          'Dependencies include job queue tables and status tracking components'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'quality',
        requirement: 'Pattern code must be production-ready',
        target_metric: 'All template code passes TypeScript strict mode'
      },
      {
        type: 'maintainability',
        requirement: 'Patterns follow established conventions',
        target_metric: 'Consistent structure with existing 45 patterns'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Insert patterns into scaffold_patterns table',
        description: 'Use Supabase client to insert 4 new pattern records',
        dependencies: ['scaffold_patterns table', '@supabase/supabase-js']
      },
      {
        id: 'TR-2',
        requirement: 'Each pattern must have complete schema fields',
        description: 'pattern_key, name, description, category, template_code, variables, dependencies, usage_examples',
        dependencies: []
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview
      This SD adds 4 pattern records to the existing scaffold_patterns table.
      No new tables or architecture changes required.

      ## Data Flow
      1. Pattern definitions created as JSON objects
      2. Inserted into scaffold_patterns via Supabase client
      3. Patterns available for venture scoring and scaffolding

      ## Integration Points
      - scaffold_patterns table (existing)
      - Venture scoring engine (reads patterns)
      - Scaffold generator (uses pattern templates)
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'scaffold_patterns',
          columns: ['id', 'pattern_key', 'name', 'description', 'category', 'template_code', 'variables', 'dependencies', 'usage_examples', 'tags', 'metadata'],
          relationships: ['None - standalone table']
        }
      ]
    },

    api_specifications: [],

    ui_ux_requirements: [],

    // Implementation
    implementation_approach: `
      ## Phase 1: Pattern Definitions
      Create JSON definitions for each of the 4 patterns with complete schema fields

      ## Phase 2: Database Insert
      Run script to insert patterns into scaffold_patterns table via Supabase

      ## Phase 3: Verification
      Query database to verify all 4 patterns exist with correct data
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
        scenario: 'StripeService pattern exists',
        description: 'Query scaffold_patterns for pattern_key = stripe_service',
        expected_result: 'Pattern found with complete template_code and variables',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'RBACMiddleware pattern exists',
        description: 'Query scaffold_patterns for pattern_key = rbac_middleware',
        expected_result: 'Pattern found with complete template_code and variables',
        test_type: 'integration'
      },
      {
        id: 'TS-3',
        scenario: 'useCRUD Hook pattern exists',
        description: 'Query scaffold_patterns for pattern_key = use_crud_hook',
        expected_result: 'Pattern found with complete template_code and variables',
        test_type: 'integration'
      },
      {
        id: 'TS-4',
        scenario: 'BackgroundJob pattern exists',
        description: 'Query scaffold_patterns for pattern_key = background_job',
        expected_result: 'Pattern found with complete template_code and variables',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'All 4 patterns exist in scaffold_patterns table',
      'Each pattern has valid template_code field',
      'Each pattern has documented variables and dependencies',
      'Total pattern count increased from 45 to 49'
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
        risk: 'Pattern complexity may require multiple iterations',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Minor delay in pattern completion',
        mitigation: 'Start with minimal viable patterns, iterate based on feedback'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must follow existing scaffold_patterns schema',
        impact: 'Pattern structure predetermined by existing table'
      }
    ],

    assumptions: [
      {
        assumption: 'scaffold_patterns table exists with documented schema',
        validation_method: 'Query database to confirm table structure'
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
      // Minimum 3 files required for GATE_EXPLORATION_AUDIT to pass (PLAN→EXEC handoff)
      // Format: Array of objects with file_path, purpose, key_findings
      exploration_summary: [
        {
          file_path: 'database/schema/scaffold_patterns.sql',
          purpose: 'Understand existing pattern table schema',
          key_findings: 'Table has pattern_key, name, description, category, template_code, variables, dependencies, usage_examples, tags, metadata columns'
        },
        {
          file_path: 'docs/prompts/triangulation-venture-selection-unified.md',
          purpose: 'Understand pattern requirements from research',
          key_findings: 'Identified 4 critical patterns: StripeService, RBACMiddleware, useCRUD, BackgroundJob'
        },
        {
          file_path: 'scripts/create-sd-venture-selection-001.js',
          purpose: 'Review SD creation for child SDs',
          key_findings: 'Child SD definitions include pattern descriptions and scope'
        }
      ],
      // Other optional metadata:
      // ui_components: [...],
      // success_metrics: [...],
      // database_changes: {...},
      // estimated_hours: 40,
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
