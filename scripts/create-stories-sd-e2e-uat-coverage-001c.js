#!/usr/bin/env node

/**
 * Create User Stories for SD-E2E-UAT-COVERAGE-001C
 * Security & Integration: CSRF, RBAC, Concurrency (Phase 3)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-E2E-UAT-COVERAGE-001C';

async function createStories() {
  console.log(`\n📝 Creating User Stories for ${SD_ID}`);
  console.log('='.repeat(70));

  // Verify SD exists
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sd) {
    console.error(`❌ SD ${SD_ID} not found`);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sd.title}`);

  // Verify PRD exists
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, title')
    .eq('sd_id', SD_ID)
    .single();

  if (prdError || !prd) {
    console.error(`❌ PRD for ${SD_ID} not found`);
    process.exit(1);
  }

  console.log(`✅ Found PRD: ${prd.title}`);

  const stories = [
    {
      story_key: 'E2E-COV-001C:US-001',
      sd_id: SD_ID,
      prd_id: prd.id,
      title: 'CSRF Token Validation Tests',
      user_role: 'QA Engineer',
      user_want: 'verify that all form submissions require valid CSRF tokens',
      user_benefit: 'cross-site request forgery attacks are prevented',
      priority: 'critical',
      story_points: 8,
      status: 'ready',
      acceptance_criteria: [
        { id: 'AC-001-1', scenario: 'Missing CSRF token', given: 'Form submitted without CSRF token', when: 'Server receives request', then: 'Request is rejected with 403 Forbidden' },
        { id: 'AC-001-2', scenario: 'Invalid CSRF token', given: 'Form submitted with tampered token', when: 'Server validates token', then: 'Request is rejected with 403 Forbidden' },
        { id: 'AC-001-3', scenario: 'Valid CSRF token', given: 'Form submitted with valid token', when: 'Server validates token', then: 'Request is processed normally' }
      ],
      definition_of_done: [
        'E2E tests intercept and modify CSRF tokens',
        'All major forms tested for CSRF protection',
        'Tests verify proper error responses'
      ],
      implementation_context: 'Use Playwright to intercept form submissions and modify/remove CSRF tokens. Test venture creation, settings, and admin forms.',
      e2e_test_path: 'tests/e2e/security/csrf-validation.spec.ts',
      e2e_test_status: 'not_created'
    },
    {
      story_key: 'E2E-COV-001C:US-002',
      sd_id: SD_ID,
      prd_id: prd.id,
      title: 'RBAC Permission Boundary Tests',
      user_role: 'QA Engineer',
      user_want: 'verify that role-based access controls are properly enforced',
      user_benefit: 'users cannot access resources beyond their permission level',
      priority: 'critical',
      story_points: 8,
      status: 'ready',
      acceptance_criteria: [
        { id: 'AC-002-1', scenario: 'Admin access', given: 'User has admin role', when: 'Accessing admin-only page', then: 'Access is granted' },
        { id: 'AC-002-2', scenario: 'Regular user denied admin', given: 'User has regular role', when: 'Accessing admin-only page', then: 'Access is denied with 403' },
        { id: 'AC-002-3', scenario: 'Cross-user data access', given: 'User A is authenticated', when: 'Accessing User B resources', then: 'Access is denied' }
      ],
      definition_of_done: [
        'E2E tests authenticate as different roles',
        'Permission boundaries tested for all protected routes',
        'Cross-user data access properly blocked'
      ],
      implementation_context: 'Create test users with different roles. Verify UI elements hidden/shown based on role. Test API endpoints with wrong permissions.',
      e2e_test_path: 'tests/e2e/security/rbac-permissions.spec.ts',
      e2e_test_status: 'not_created'
    },
    {
      story_key: 'E2E-COV-001C:US-003',
      sd_id: SD_ID,
      prd_id: prd.id,
      title: 'Concurrent User Scenario Tests',
      user_role: 'QA Engineer',
      user_want: 'verify system handles concurrent operations correctly',
      user_benefit: 'race conditions do not cause data corruption or inconsistency',
      priority: 'high',
      story_points: 5,
      status: 'ready',
      acceptance_criteria: [
        { id: 'AC-003-1', scenario: 'Concurrent edits', given: 'Two users edit same resource', when: 'Both submit changes', then: 'System handles conflict gracefully' },
        { id: 'AC-003-2', scenario: 'Rapid submissions', given: 'User double-clicks submit', when: 'Two requests sent rapidly', then: 'Only one operation succeeds' },
        { id: 'AC-003-3', scenario: 'Stale data update', given: 'User has outdated data', when: 'Submitting update', then: 'Conflict is detected and handled' }
      ],
      definition_of_done: [
        'E2E tests simulate concurrent user sessions',
        'Race condition scenarios tested',
        'Proper optimistic locking verified'
      ],
      implementation_context: 'Use multiple browser contexts in Playwright to simulate concurrent users. Test critical operations like venture creation and updates.',
      e2e_test_path: 'tests/e2e/concurrency/concurrent-operations.spec.ts',
      e2e_test_status: 'not_created'
    }
  ];

  console.log(`\n📋 Creating ${stories.length} user stories...`);

  let created = 0;
  let skipped = 0;

  for (const story of stories) {
    const { data: existing } = await supabase
      .from('user_stories')
      .select('story_key')
      .eq('story_key', story.story_key)
      .single();

    if (existing) {
      console.log(`   ⏭️  ${story.story_key} already exists, skipping`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from('user_stories').insert(story);

    if (error) {
      console.error(`   ❌ Failed to create ${story.story_key}: ${error.message}`);
    } else {
      console.log(`   ✅ Created ${story.story_key}: ${story.title}`);
      created++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`📊 Summary: ${created} created, ${skipped} skipped`);
}

createStories().catch(console.error);
