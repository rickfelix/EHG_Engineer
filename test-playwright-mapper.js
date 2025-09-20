#!/usr/bin/env node

/**
 * Test Playwright Mapper - Simulates webhook posting
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Simulate Playwright test results
const mockTestResults = {
  test_run_id: `test-run-${Date.now()}`,
  build_id: 'staging-build-001',
  environment: 'staging',
  timestamp: new Date().toISOString(),
  tests: [
    {
      story_key: 'SD-2025-09-EMB:US-e8336f7b',
      status: 'passing',
      duration_ms: 1250
    },
    {
      story_key: 'SD-2025-09-EMB:US-64f4d37b',
      status: 'passing',
      duration_ms: 980
    },
    {
      story_key: 'SD-2025-09-EMB:US-e92fdabc',
      status: 'failing',
      duration_ms: 2100,
      error: 'Element not found'
    },
    {
      story_key: 'SD-2025-09-EMB:US-c6bae9eb',
      status: 'passing',
      duration_ms: 1500
    },
    {
      story_key: 'SD-2025-09-EMB:US-d5607de5',
      status: 'passing',
      duration_ms: 890
    }
  ]
};

async function simulateWebhook() {
  console.log('=== Simulating Playwright Webhook ===\n');
  console.log('Test Run ID:', mockTestResults.test_run_id);
  console.log('Build ID:', mockTestResults.build_id);
  console.log('Tests to update:', mockTestResults.tests.length);

  // Update each story's verification status
  for (const test of mockTestResults.tests) {
    console.log(`\nUpdating ${test.story_key}: ${test.status}`);

    const { error } = await supabase
      .from('sd_backlog_map')
      .update({
        verification_status: test.status,
        last_verified_at: new Date().toISOString(),
        coverage_pct: test.status === 'passing' ? 85 : 0,
        verification_source: {
          test_run_id: mockTestResults.test_run_id,
          build_id: mockTestResults.build_id,
          environment: mockTestResults.environment,
          duration_ms: test.duration_ms,
          error: test.error || null,
          timestamp: mockTestResults.timestamp
        }
      })
      .eq('story_key', test.story_key);

    if (error) {
      console.log(`  ❌ Error: ${error.message}`);
    } else {
      console.log(`  ✅ Updated successfully`);
    }
  }

  // Check the updated verification status
  console.log('\n=== Verification Status ===\n');
  const { data: stories } = await supabase
    .from('v_story_verification_status')
    .select('story_key, status, coverage_pct, last_verified_at')
    .eq('sd_key', 'SD-2025-09-EMB')
    .order('sequence_no');

  if (stories) {
    console.log('Story Status:');
    stories.forEach(s => {
      const status = s.status === 'passing' ? '✅' : s.status === 'failing' ? '❌' : '⏸️';
      console.log(`  ${status} ${s.story_key}: ${s.status} (${s.coverage_pct || 0}%)`);
    });
  }

  // Check release gate
  console.log('\n=== Release Gate ===\n');
  const { data: gate } = await supabase
    .from('v_sd_release_gate')
    .select('*')
    .eq('sd_key', 'SD-2025-09-EMB')
    .single();

  if (gate) {
    console.log('Gate Status:');
    console.log(`  Ready: ${gate.ready ? '✅ YES' : '❌ NO'}`);
    console.log(`  Total Stories: ${gate.total_stories}`);
    console.log(`  Passing: ${gate.passing_count} (${gate.passing_pct}%)`);
    console.log(`  Failing: ${gate.failing_count}`);
    console.log(`  Not Run: ${gate.not_run_count}`);
    console.log(`  Coverage Target: ${gate.coverage_target}%`);
  }

  // SQL verification queries
  console.log('\n=== SQL Verification Queries ===\n');
  console.log('Run these in Supabase to verify:');
  console.log(`
SELECT story_key, status, verification_source->>'build_id' as build_id, last_verified_at
FROM v_story_verification_status
WHERE sd_key='SD-2025-09-EMB'
ORDER BY sequence_no;

SELECT ready, passing_count, total_stories, passing_pct
FROM v_sd_release_gate
WHERE sd_key='SD-2025-09-EMB';
  `);
}

// Run the simulation
simulateWebhook().catch(console.error);