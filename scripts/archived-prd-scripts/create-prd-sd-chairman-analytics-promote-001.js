#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-CHAIRMAN-ANALYTICS-PROMOTE-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-CHAIRMAN-ANALYTICS-PROMOTE-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Promote Chairman Analytics to Complete Status - Technical Implementation'; // TODO: Replace with your PRD title

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

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.uuid_id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    id: prdId,
    sd_uuid: sdData.uuid_id,        // CRITICAL: Required for handoff validation
    directive_id: SD_ID,             // Backward compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'ux_improvement',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      Update nav_routes.maturity field from "draft" to "complete" for /chairman-analytics route.

      The Chairman Decision Analytics dashboard is fully functional (1060 LOC, 6 components, 5 APIs, 4 tables from SD-RECONNECT-011) but currently hidden from users due to maturity filter. Navigation entry exists in database but marked as "draft" status, requiring users to manually enable "Show Draft" preference to discover the feature.

      This PRD defines the simple database field update to promote the navigation link to "complete" status, making the analytics dashboard discoverable to all users immediately.
    `.trim(),

    business_context: `
      **User Pain Point**: Users cannot discover Chairman Decision Analytics dashboard without manual configuration. Feature is production-ready but effectively invisible.

      **Business Value**: Unlocks high-value analytics capabilities (decision history, confidence scoring, threshold calibration, feature flags) for all chairman users.

      **Success Metrics**: 10x increase in /chairman-analytics page views within 2 weeks, 20% chairman user adoption within first week.
    `.trim(),

    technical_context: `
      **Existing Infrastructure**: Complete Chairman Analytics dashboard implemented in SD-RECONNECT-011 (commit 0f00c85). All components, APIs, and database tables functional.

      **Navigation System**: Database-driven navigation (nav_routes table) with maturity-based filtering. Supports draft, development, complete statuses.

      **Current State**: nav_routes record exists (id: 1b66d7bb-0623-43bb-8d5c-be687ee9ea3a) with maturity="draft", is_enabled=true.
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Update nav_routes.maturity field to complete',
        description: 'Update the maturity field from "draft" to "complete" for the /chairman-analytics route in the nav_routes table',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'nav_routes.maturity = "complete" WHERE path = "/chairman-analytics"',
          'Navigation link visible in sidebar without "Show Draft" enabled',
          'Link functions correctly (routing, highlighting, keyboard navigation)',
          'NEW badge still displays as configured'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Verify navigation visibility',
        description: 'Confirm navigation link appears for all users with default preferences',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Link visible in AI & Automation section',
          'Link appears for chairman persona',
          'Maturity filter working correctly',
          'No regression in other navigation links'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Maintain navigation functionality',
        description: 'Ensure existing navigation behavior remains intact after maturity update',
        priority: 'HIGH',
        acceptance_criteria: [
          'All other navigation links still visible',
          'Persona filtering works correctly',
          'Maturity filter behavior unchanged for other routes',
          'Navigation real-time updates working'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Database update completes instantly',
        target_metric: '<100ms for UPDATE query'
      },
      {
        type: 'reliability',
        requirement: 'Rollback capability',
        target_metric: 'Can revert maturity field to draft instantly if needed'
      },
      {
        type: 'usability',
        requirement: 'Zero user configuration required',
        target_metric: 'Link visible immediately after update with default preferences'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Database UPDATE operation on nav_routes table',
        description: 'Execute UPDATE query on EHG application database (liapbndqlqxdcgpwntbv) to change maturity field',
        dependencies: ['Supabase client access', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
      },
      {
        id: 'TR-2',
        requirement: 'Verification script',
        description: 'Script to verify navigation link visibility after update',
        dependencies: ['useNavigation hook', 'nav_routes query']
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview
      Single database field update in nav_routes table. No code changes, no new components.

      ## Data Flow
      1. Execute UPDATE query: UPDATE nav_routes SET maturity = 'complete' WHERE path = '/chairman-analytics'
      2. useNavigation hook retrieves updated routes from database
      3. Maturity filter includes 'complete' status by default
      4. Navigation sidebar displays link in AI & Automation section

      ## Integration Points
      - Supabase nav_routes table (EHG database: liapbndqlqxdcgpwntbv)
      - useNavigation hook (src/hooks/useNavigation.ts)
      - navigationService (src/services/navigationService.ts)
      - ModernNavigationSidebar component (src/components/navigation/ModernNavigationSidebar.tsx)
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'nav_routes',
          columns: ['id', 'path', 'title', 'maturity', 'is_enabled', 'section', 'icon_key', 'static_badge', 'personas'],
          relationships: ['None required for this change'],
          changes: [
            {
              type: 'UPDATE',
              field: 'maturity',
              from: 'draft',
              to: 'complete',
              where: 'path = /chairman-analytics'
            }
          ]
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'Supabase Query',
        method: 'UPDATE',
        description: 'Direct database UPDATE via Supabase client',
        request: {
          table: 'nav_routes',
          operation: 'update',
          data: { maturity: 'complete', updated_at: 'NOW()' },
          filter: { path: '/chairman-analytics' }
        },
        response: {
          status: 200,
          data: { maturity: 'complete' }
        }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'No UI changes required',
        description: 'Database-only change. Navigation system automatically reflects updated maturity status.',
        wireframe: 'N/A - No UI modifications'
      }
    ],

    // Implementation
    implementation_approach: `
      ## Single-Step Implementation

      Execute UPDATE query on EHG database (liapbndqlqxdcgpwntbv):

      \`\`\`sql
      UPDATE nav_routes
      SET maturity = 'complete', updated_at = NOW()
      WHERE path = '/chairman-analytics';
      \`\`\`

      ## Verification
      1. Query nav_routes table to confirm maturity = 'complete'
      2. Test navigation visibility in UI (hard refresh browser)
      3. Verify link appears in AI & Automation section
      4. Test keyboard navigation (Tab + Enter)
      5. Confirm NEW badge still displays

      ## Rollback Plan
      If issues arise, instantly revert:
      \`\`\`sql
      UPDATE nav_routes
      SET maturity = 'draft', updated_at = NOW()
      WHERE path = '/chairman-analytics';
      \`\`\`
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
        scenario: 'Navigation link visibility (Tier-1 smoke test)',
        description: 'Verify /chairman-analytics link appears in navigation sidebar after maturity update',
        expected_result: 'Link visible in AI & Automation section for chairman persona without enabling Show Draft',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'Navigation link functionality',
        description: 'Verify link routes correctly to /chairman-analytics page',
        expected_result: 'Clicking link navigates to Decision Analytics Dashboard',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Maturity filter behavior',
        description: 'Verify maturity filter working correctly after update',
        expected_result: 'Link visible with default preferences, no other navigation links affected',
        test_type: 'e2e'
      },
      {
        id: 'TS-4',
        scenario: 'Database verification',
        description: 'Query nav_routes table to confirm field update',
        expected_result: 'maturity = "complete" WHERE path = "/chairman-analytics"',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'nav_routes.maturity = "complete" for /chairman-analytics (verified via query)',
      'Navigation link visible without Show Draft enabled',
      'Link routes correctly to Chairman Analytics dashboard',
      'NEW badge displays as configured',
      'Keyboard navigation works (Tab + Enter)',
      'No regression in other navigation links',
      'E2E navigation test passes (Tier-1 smoke)',
      'Rollback capability verified'
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
        risk: 'TODO: Potential risk',
        severity: 'MEDIUM', // LOW, MEDIUM, HIGH, CRITICAL
        probability: 'MEDIUM', // LOW, MEDIUM, HIGH
        impact: 'TODO: Impact if risk occurs',
        mitigation: 'TODO: How to prevent/handle'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'TODO: Technical constraint',
        impact: 'TODO: How this limits the solution'
      }
    ],

    assumptions: [
      {
        assumption: 'TODO: What we\'re assuming',
        validation_method: 'TODO: How to validate this assumption'
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
  console.log(`   SD UUID: ${insertedPRD.sd_uuid}`);
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
