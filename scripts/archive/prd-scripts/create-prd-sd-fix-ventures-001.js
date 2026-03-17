#!/usr/bin/env node

/**
 * PRD Creation Script for SD-FIX-VENTURES-001
 * Fix Ventures Navigation Errors
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SD_KEY = 'SD-FIX-VENTURES-001';
const PRD_TITLE = 'Fix Ventures Navigation Errors';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_KEY}`);
  console.log('='.repeat(70));

  // Fetch SD by sd_key (not id)
  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, category, priority, description, scope')
    .eq('sd_key', SD_KEY)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_KEY} not found in database`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // Build PRD data
  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_KEY}`;

  const prdData = {
    id: prdId,
    sd_id: sdData.id,  // Use the actual UUID
    directive_id: sdData.id,
    title: PRD_TITLE,
    version: '1.0',
    status: 'approved',
    category: sdData.category || 'Quality Assurance',
    priority: sdData.priority || 'high',

    executive_summary: `
      This PRD addresses navigation errors in the Ventures module of the EHG application.
      Users experience console errors when clicking sidebar items for "My Ventures" and "All Ventures".
      The fix involves correcting route configurations and sidebar click handlers to properly
      navigate to venture-related pages without errors.
    `.trim(),

    business_context: `
      The Ventures module is a core feature allowing users to browse, track, and manage ventures.
      Navigation errors prevent users from accessing this functionality, causing user frustration
      and blocking access to key business data. Fixing these errors restores full application usability.
    `.trim(),

    technical_context: `
      The EHG frontend uses React Router for navigation and a Shadcn-based sidebar component.
      The ventures module has routes defined but click handlers may have incorrect route paths
      or missing route definitions. The fix requires alignment between sidebar navigation
      configuration and the route definitions in the React Router setup.
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'My Ventures navigation must work without errors',
        description: 'Clicking "My Ventures" in sidebar navigates to the My Ventures page without console errors',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'No console errors when clicking My Ventures',
          'Page displays user-owned ventures correctly',
          'URL updates to /ventures/mine or similar'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'All Ventures navigation must work without errors',
        description: 'Clicking "All Ventures" in sidebar navigates to the All Ventures page without console errors',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'No console errors when clicking All Ventures',
          'Page displays all ventures with proper filtering',
          'URL updates to /ventures or /ventures/all'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Sidebar navigation state must update correctly',
        description: 'Active/selected state in sidebar reflects current page',
        priority: 'HIGH',
        acceptance_criteria: [
          'Clicked item shows as selected/active',
          'Other items show as inactive',
          'State persists on page refresh'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Navigation should be instant',
        target_metric: '<100ms route transition'
      },
      {
        type: 'reliability',
        requirement: 'No console errors during navigation',
        target_metric: 'Zero errors in browser console'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Fix route configuration for ventures pages',
        description: 'Ensure routes for /ventures, /ventures/mine exist in router config',
        dependencies: ['React Router configuration']
      },
      {
        id: 'TR-2',
        requirement: 'Fix sidebar click handler paths',
        description: 'Ensure sidebar navigation items use correct route paths',
        dependencies: ['Sidebar component configuration']
      }
    ],

    system_architecture: `
      ## Architecture Overview
      - React 18 frontend with Vite bundler
      - React Router v6 for client-side routing
      - Shadcn UI sidebar component with navigation items
      - Supabase backend for venture data

      ## Data Flow
      1. User clicks sidebar item
      2. Click handler triggers navigation
      3. React Router matches route
      4. Page component mounts and fetches data
      5. Data displayed to user

      ## Integration Points
      - Sidebar component -> React Router
      - Venture pages -> Supabase API for data
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'ventures (existing)',
          columns: ['id', 'name', 'current_workflow_stage', 'owner_id', 'created_at'],
          relationships: ['owner_id -> users.id']
        }
      ]
    },

    api_specifications: [],

    ui_ux_requirements: [
      {
        component: 'Sidebar Navigation',
        description: 'Fix click handlers for My Ventures and All Ventures items',
        wireframe: 'N/A - existing component'
      },
      {
        component: 'Ventures Pages',
        description: 'Ensure pages exist and are routable',
        wireframe: 'N/A - existing pages'
      }
    ],

    implementation_approach: `
      ## Phase 1: Diagnosis
      - Identify specific error messages in console
      - Trace click handler paths in sidebar configuration
      - Check route definitions in router config

      ## Phase 2: Fix Implementation
      - Update sidebar navigation paths if incorrect
      - Add missing route definitions if needed
      - Ensure page components exist at expected paths

      ## Phase 3: Verification
      - Test all sidebar navigation items
      - Verify no console errors
      - Test on clean browser session
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript',
      'Vite',
      'React Router v6',
      'Shadcn UI',
      'Supabase'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'Existing ventures pages',
        status: 'completed',
        blocker: false
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'My Ventures navigation test',
        description: 'Click My Ventures in sidebar and verify navigation',
        expected_result: 'Page loads without console errors',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'All Ventures navigation test',
        description: 'Click All Ventures in sidebar and verify navigation',
        expected_result: 'Page loads without console errors',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Console error check',
        description: 'Monitor console during all venture navigations',
        expected_result: 'No JavaScript errors in console',
        test_type: 'e2e'
      }
    ],

    acceptance_criteria: [
      'My Ventures page accessible via sidebar without errors',
      'All Ventures page accessible via sidebar without errors',
      'No console errors during navigation',
      'Active state in sidebar reflects current page'
    ],

    performance_requirements: {
      page_load_time: '<1s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'Root cause identified', checked: false },
      { text: 'Fix implemented', checked: false },
      { text: 'Manual testing completed', checked: false },
      { text: 'No console errors verified', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'No regression in other navigation', checked: false },
      { text: 'User acceptance testing passed', checked: false }
    ],

    progress: 20,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 20,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    risks: [
      {
        category: 'Technical',
        risk: 'Other navigation may be similarly affected',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'May need to fix additional routes',
        mitigation: 'Test all sidebar navigation items'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must not break existing navigation',
        impact: 'Changes must be tested thoroughly'
      }
    ],

    assumptions: [
      {
        assumption: 'Route paths in sidebar configuration are the issue',
        validation_method: 'Console error analysis'
      }
    ],

    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),

    metadata: {
      exploration_summary: [
        {
          file_path: 'src/components/sidebar/app-sidebar.tsx (EHG)',
          purpose: 'Identify sidebar navigation configuration',
          key_findings: 'Contains navigation items with route paths'
        },
        {
          file_path: 'src/routes/index.tsx (EHG)',
          purpose: 'Check route definitions',
          key_findings: 'Need to verify ventures routes exist'
        },
        {
          file_path: 'src/pages/ventures/ (EHG)',
          purpose: 'Verify page components exist',
          key_findings: 'Need to check MyVentures and AllVentures pages'
        }
      ]
    },

    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Check for existing PRD
  console.log('\n3️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.log(`⚠️  PRD ${prdId} already exists, updating...`);
    const { error: updateError } = await supabase
      .from('product_requirements_v2')
      .update(prdData)
      .eq('id', prdId);

    if (updateError) {
      console.error('❌ Failed to update PRD:', updateError.message);
      process.exit(1);
    }
    console.log('✅ PRD updated successfully!');
  } else {
    // Insert new PRD
    console.log('\n4️⃣  Inserting PRD into database...');

    const { data: insertedPRD, error: insertError } = await supabase
      .from('product_requirements_v2')
      .insert(prdData)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to insert PRD:', insertError.message);
      console.error('   Code:', insertError.code);
      process.exit(1);
    }

    console.log('\n✅ PRD created successfully!');
    console.log('='.repeat(70));
    console.log(`   PRD ID: ${insertedPRD.id}`);
    console.log(`   SD ID: ${insertedPRD.sd_id}`);
    console.log(`   Status: ${insertedPRD.status}`);
  }

  console.log('\n📝 Next Steps:');
  console.log('   Run PLAN-TO-EXEC handoff:');
  console.log(`   node scripts/handoff.js execute PLAN-TO-EXEC ${SD_KEY}`);
}

createPRD().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
