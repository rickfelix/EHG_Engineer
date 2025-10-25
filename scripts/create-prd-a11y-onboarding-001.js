#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  // Get SD UUID first
  const { data: sdData } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id')
    .eq('id', 'SD-A11Y-ONBOARDING-001')
    .single();

  if (!sdData) {
    console.error('SD not found');
    process.exit(1);
  }

  console.log('Creating PRD for SD-A11Y-ONBOARDING-001...');
  console.log('SD UUID:', sdData.uuid_id);

  const prdData = {
    id: 'PRD-A11Y-ONBOARDING-001',
    sd_id: 'SD-A11Y-ONBOARDING-001',
    sd_uuid: sdData.uuid_id,
    directive_id: 'SD-A11Y-ONBOARDING-001',
    title: 'Fix Pre-Existing Accessibility Errors in Onboarding Flow',
    version: '1.0',
    status: 'approved',
    category: 'Tech Debt',
    priority: 'high',
    phase: 'PLAN',
    progress: 0,

    executive_summary: 'Fix 2 ARIA errors (lines 275, 287) in app/(onboarding)/getting-started/page.tsx blocking CI/CD',
    business_context: 'Unblock CI/CD pipeline blocked by pre-existing accessibility errors revealed when eslint-plugin-jsx-a11y was properly installed',
    technical_context: 'Remove aria-pressed from radio role (L275), add aria-checked to radio role (L287). No database changes required.',

    functional_requirements: [
      {
        id: 'FR-001',
        requirement: 'Remove aria-pressed from radio role element (Line 275)',
        description: 'The aria-pressed attribute is not supported by elements with role="radio" per WCAG 2.1 AA guidelines. Must be removed to pass accessibility linting.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Line 275: aria-pressed attribute removed from radio role element',
          'ESLint jsx-a11y plugin passes without aria-pressed error'
        ]
      },
      {
        id: 'FR-002',
        requirement: 'Add aria-checked to radio role element (Line 287)',
        description: 'Elements with role="radio" must have the aria-checked attribute per WCAG 2.1 AA guidelines. Required for screen reader accessibility.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Line 287: aria-checked attribute added to radio role element',
          'ESLint jsx-a11y plugin passes without aria-checked error',
          'Screen reader correctly announces radio button state'
        ]
      }
    ],

    test_scenarios: {
      manual_tests: ['Keyboard navigation (Tab, Space, Arrow keys)', 'Screen reader test', 'Visual regression check'],
      ci_validation: 'GitHub Actions must pass all checks'
    },

    acceptance_criteria: [
      'Line 275: aria-pressed removed from radio role element',
      'Line 287: aria-checked added to radio role element',
      'ESLint passes with 0 accessibility errors',
      'CI/CD pipeline green (all GitHub Actions checks pass)',
      'Keyboard navigation functional (Tab, Space, Arrow keys)',
      'No visual or functional regressions in onboarding flow'
    ],

    implementation_approach: 'Direct file edit: app/(onboarding)/getting-started/page.tsx. Line 275: Remove aria-pressed. Line 287: Add aria-checked. Minimal surgical changes only.',

    metadata: {
      estimated_hours: 1,
      complexity: 'low',
      file_count: 1,
      lines_changed: 2,
      database_changes: false,
      api_changes: false,
      blocking_pr: 15,
      discovered_during: 'SD-VWC-INTUITIVE-FLOW-001'
    }
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert([prdData])
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }

  console.log('✅ PRD created successfully!');
  console.log('   ID:', data[0].id);
  console.log('   Status:', data[0].status);
  console.log('\n📋 Summary:');
  console.log('   - 2 functional requirements (ARIA fixes)');
  console.log('   - 5 acceptance criteria');
  console.log('   - Est. 1 hour implementation');
  console.log('\n✅ Ready for PLAN→EXEC handoff');
}

createPRD().catch(console.error);
