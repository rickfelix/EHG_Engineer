#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  // Get SD UUID
  const { data: sdData } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id')
    .eq('id', 'SD-A11Y-ONBOARDING-001')
    .single();

  if (!sdData) {
    console.error('SD not found');
    process.exit(1);
  }

  const prdData = {
    id: 'PRD-A11Y-ONBOARDING-001',
    sd_id: 'SD-A11Y-ONBOARDING-001',
    sd_uuid: sdData.uuid_id,
    title: 'Fix Pre-Existing Accessibility Errors in Onboarding Flow',
    version: '1.0',
    status: 'approved',
    category: 'Tech Debt',
    priority: 'high',

    executive_summary: 'Fix 2 ARIA errors in getting-started page',
    business_context: 'Unblock CI/CD pipeline',
    technical_context: 'Remove aria-pressed, add aria-checked to radio roles',

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Remove aria-pressed from radio role',
        description: 'Remove unsupported aria-pressed attribute from radio role element',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Line 286: aria-pressed attribute removed',
          'ESLint passes without aria-pressed error'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Add aria-checked to radio role',
        description: 'Add required aria-checked attribute to radio role element',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Line 287: aria-checked attribute added',
          'ESLint passes without aria-checked error'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Verify keyboard navigation',
        description: 'Test keyboard navigation (Tab, Space, Arrow keys) to ensure no regressions',
        priority: 'HIGH',
        acceptance_criteria: [
          'Tab key cycles through radio options',
          'Arrow keys navigate between options',
          'Space/Enter selects option'
        ]
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'ARIA Compliance: Radio role attributes',
        test_type: 'unit',
        description: 'Verify radio role elements have aria-checked and no aria-pressed',
        expected_result: 'ESLint passes with 0 jsx-a11y errors for getting-started page'
      }
    ],

    acceptance_criteria: [
      'ESLint passes with 0 accessibility errors',
      'CI/CD pipeline green',
      'Keyboard navigation functional'
    ]
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

  console.log('✅ PRD created!');
  console.log('   ID:', data[0].id);
  console.log('   Status:', data[0].status);
}

createPRD().catch(console.error);
