#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-VS-CHAIRMAN-SETTINGS-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-VS-CHAIRMAN-SETTINGS-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Chairman Settings Configuration System'; // TODO: Replace with your PRD title

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
    category: 'database_schema',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      Database schema + UI for configurable venture selection parameters.

      Currently, Chairman Settings are stored in localStorage which creates several problems:
      1. Settings are lost when browser data is cleared
      2. Multi-user access is impossible - each browser has isolated settings
      3. No audit trail of configuration changes

      This PRD implements a chairman_settings table in PostgreSQL, updates the useChairmanConfig hook
      to read/write from the database instead of localStorage, and adds RLS policies for proper
      multi-tenant security.
    `.trim(),

    business_context: `
      User Pain Points:
      - Settings lost on browser clear (user reports)
      - No way to share settings across team members
      - No visibility into who changed what settings

      Business Objectives:
      - Enable persistent, server-side configuration storage
      - Support multi-user environments with proper isolation
      - Provide audit capability for compliance

      Success Metrics:
      - 100% of chairman settings persist to database
      - RLS policies enforced on all CRUD operations
      - Default settings applied when no override exists
    `.trim(),

    technical_context: `
      Existing Systems:
      - useChairmanConfig hook (lib/hooks/useChairmanConfig.ts) - reads from localStorage
      - ChairmanSettings UI component (7-tab interface already exists)
      - Supabase PostgreSQL database with RLS enabled

      Architecture Patterns:
      - React Query for data fetching and caching
      - Supabase client for database operations
      - RLS policies for row-level security

      Integration Points:
      - Venture scoring system reads chairman settings for weights
      - Pattern matching uses pattern_threshold setting
      - Glide path dashboard uses exploit/explore ratios
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create chairman_settings database table',
        description: 'PostgreSQL table with all configurable parameters: risk_tolerance, pattern_threshold, time_to_revenue_max, capital_cap, feedback_speed, growth_curve, exploit_ratio, explore_ratio, new_pattern_budget, require_dogfooding, kill_gate_mode',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Table exists in database with all columns',
          'Foreign key to companies table for company_id',
          'Default row exists with sensible defaults',
          'Constraints validate value ranges'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Update useChairmanConfig hook to use database',
        description: 'Refactor hook to read from and write to chairman_settings table instead of localStorage. Use React Query for caching.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Hook reads settings from database on mount',
          'Hook writes settings to database on update',
          'Loading state handled properly',
          'Error state handled with fallback to defaults'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Implement RLS policies for multi-tenant security',
        description: 'Row Level Security policies to ensure users can only access their company settings',
        priority: 'HIGH',
        acceptance_criteria: [
          'SELECT policy allows authenticated users to read own company settings',
          'UPDATE policy allows only company admins to modify settings',
          'INSERT policy for creating new settings',
          'Cross-company access blocked (verified by E2E test)'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Settings inheritance (default → override)',
        description: 'When no venture-specific override exists, fall back to company default, then system default',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'System defaults defined in migration',
          'Company defaults override system defaults',
          'Venture-specific overrides are optional',
          'UI shows inherited values with override option'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'LocalStorage migration script',
        description: 'One-time migration to copy existing localStorage settings to database',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Script reads localStorage and inserts to database',
          'Idempotent (can run multiple times safely)',
          'Logs migration results'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Settings load time under 500ms',
        target_metric: '<500ms for initial settings load'
      },
      {
        type: 'security',
        requirement: 'RLS enforces company isolation',
        target_metric: '100% of cross-company access attempts blocked'
      },
      {
        type: 'reliability',
        requirement: 'Graceful fallback to defaults on error',
        target_metric: 'System operates with sensible defaults if database unavailable'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Supabase PostgreSQL integration',
        description: 'Use Supabase client for database operations with proper typing',
        dependencies: ['@supabase/supabase-js', 'react-query']
      },
      {
        id: 'TR-2',
        requirement: 'TypeScript type safety',
        description: 'Generate types from database schema using supabase-cli',
        dependencies: ['supabase CLI']
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview
      - Database: PostgreSQL chairman_settings table with RLS
      - Hook: useChairmanConfig reads/writes via Supabase client
      - UI: Existing 7-tab ChairmanSettings component (no changes needed)
      - Cache: React Query manages data caching and refetching

      ## Data Flow
      1. Page loads → useChairmanConfig hook fires
      2. Hook checks React Query cache → if stale, fetches from DB
      3. Supabase client executes SELECT with RLS enforcement
      4. Data returns to hook → UI renders with current values
      5. User changes setting → hook calls updateSettings mutation
      6. Mutation writes to DB → cache invalidated → UI re-renders

      ## Integration Points
      - Venture Scoring: Reads scoring weights from chairman_settings
      - Pattern Matching: Uses pattern_threshold for filtering
      - Glide Path: Uses exploit/explore ratio for portfolio display
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'chairman_settings',
          columns: [
            'id UUID PRIMARY KEY',
            'company_id UUID FK companies(id)',
            'venture_id UUID FK ventures(id) NULLABLE',
            'risk_tolerance INTEGER DEFAULT 35',
            'pattern_threshold INTEGER DEFAULT 75',
            'time_to_revenue_max INTEGER DEFAULT 21',
            'capital_cap INTEGER DEFAULT 2000',
            'feedback_speed INTEGER DEFAULT 8',
            'growth_curve VARCHAR(20) DEFAULT linear',
            'exploit_ratio INTEGER DEFAULT 75',
            'explore_ratio INTEGER DEFAULT 25',
            'new_pattern_budget INTEGER DEFAULT 5000',
            'require_dogfooding BOOLEAN DEFAULT true',
            'kill_gate_mode VARCHAR(20) DEFAULT standard',
            'created_at TIMESTAMPTZ',
            'updated_at TIMESTAMPTZ'
          ],
          relationships: ['FK companies(id)', 'FK ventures(id) NULLABLE']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'Supabase RPC: get_chairman_settings',
        method: 'SELECT',
        description: 'Fetch settings for current company (with venture override if applicable)',
        request: { company_id: 'UUID', venture_id: 'UUID optional' },
        response: { settings: 'ChairmanSettings object' }
      },
      {
        endpoint: 'Supabase RPC: upsert_chairman_settings',
        method: 'UPSERT',
        description: 'Create or update settings for company/venture',
        request: { company_id: 'UUID', settings: 'Partial ChairmanSettings' },
        response: { success: 'boolean' }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'ChairmanSettings (existing)',
        description: 'No UI changes required - existing 7-tab interface will work with new hook',
        wireframe: 'N/A - using existing component'
      },
      {
        component: 'useChairmanConfig hook',
        description: 'Add loading and error states for database operations',
        wireframe: 'N/A'
      }
    ],

    // Implementation
    implementation_approach: `
      ## Phase 1: Database Schema (1-2 hours)
      - Create migration file for chairman_settings table
      - Define all columns with proper defaults
      - Add foreign keys and constraints
      - Create RLS policies
      - Insert default settings row
      - Run migration and verify

      ## Phase 2: Hook Refactoring (2-3 hours)
      - Update useChairmanConfig to use React Query
      - Add Supabase client calls for read/write
      - Implement loading/error states
      - Add fallback to defaults on error
      - Test with network delay simulation

      ## Phase 3: Testing & Migration (1-2 hours)
      - Write E2E test for RLS policy enforcement
      - Create localStorage migration script
      - Test migration with sample data
      - Verify existing UI still works
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Vite',
      'Shadcn UI',
      'Supabase PostgreSQL',
      'React Query (TanStack Query)',
      '@supabase/supabase-js'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'companies table (for FK)',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'ventures table (for optional FK)',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'Existing ChairmanSettings UI component',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Settings persist after browser refresh',
        description: 'User changes a setting, refreshes page, and sees the updated value',
        expected_result: 'Setting value persists from database',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'RLS blocks cross-company access',
        description: 'User from Company A cannot read settings from Company B',
        expected_result: 'Empty result set returned (not error)',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Default values applied when no settings exist',
        description: 'New company with no settings row sees system defaults',
        expected_result: 'All default values loaded correctly',
        test_type: 'integration'
      },
      {
        id: 'TS-4',
        scenario: 'Graceful fallback on database error',
        description: 'Database unavailable returns sensible defaults',
        expected_result: 'Application continues to function with defaults',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      'chairman_settings table exists with all 11 settings columns',
      'RLS policies enforce company isolation',
      'useChairmanConfig hook reads from database',
      'Settings persist across browser refresh',
      'Default values applied when no settings exist',
      'Existing ChairmanSettings UI works without changes',
      'E2E test for RLS passes'
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
        risk: 'LocalStorage migration may lose existing settings',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Users would need to reconfigure settings manually',
        mitigation: 'Create one-time migration script with rollback capability'
      },
      {
        category: 'Technical',
        risk: 'React Query cache may serve stale data',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'User sees outdated settings until next refetch',
        mitigation: 'Configure appropriate staleTime and refetch on focus'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must maintain backward compatibility with existing UI',
        impact: 'Hook interface cannot change (return type must stay same)'
      },
      {
        type: 'technical',
        constraint: 'RLS requires authenticated user context',
        impact: 'Settings cannot be loaded before auth completes'
      }
    ],

    assumptions: [
      {
        assumption: 'companies table already exists with company_id',
        validation_method: 'Check database schema'
      },
      {
        assumption: 'All current users have a company_id associated',
        validation_method: 'Query user_company_access table'
      },
      {
        assumption: 'ChairmanSettings UI component does not need modification',
        validation_method: 'Review component props and data flow'
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
