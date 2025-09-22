#!/usr/bin/env node

/**
 * End-to-End Test for STORY Sub-Agent
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const API_URL = 'http://localhost:3000';

async function testStoryAgent() {
  console.log('=== E2E Test: STORY Sub-Agent ===\n');

  // Check if agent is enabled
  console.log('Feature Flags:');
  console.log('  FEATURE_STORY_AGENT:', process.env.FEATURE_STORY_AGENT);
  console.log('  FEATURE_AUTO_STORIES:', process.env.FEATURE_AUTO_STORIES);
  console.log('  FEATURE_STORY_UI:', process.env.FEATURE_STORY_UI);
  console.log('  FEATURE_STORY_GATES:', process.env.FEATURE_STORY_GATES);

  if (process.env.FEATURE_STORY_AGENT !== 'true') {
    console.log('\n⚠️ STORY_AGENT is not enabled!');
    return;
  }

  // Step 1: Check current story count
  console.log('\n1. Current State:');
  const { data: beforeStories } = await supabase
    .from('v_story_verification_status')
    .select('story_key')
    .eq('sd_key', 'SD-2025-09-EMB');

  console.log('  Stories before:', beforeStories?.length || 0);

  // Step 2: Trigger story generation via API (simulating agent behavior)
  console.log('\n2. Triggering Story Generation:');
  console.log('  Endpoint: POST /api/stories/generate');
  console.log('  Mode: upsert (idempotent)');

  const startTime = Date.now();

  try {
    const response = await axios.post(
      `${API_URL}/api/stories/generate`,
      {
        sd_key: 'SD-2025-09-EMB',
        prd_id: 'PRD-EMB-001',
        mode: 'upsert'
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );

    const elapsed = Date.now() - startTime;
    console.log('  Response time:', elapsed, 'ms');
    console.log('  Status:', response.data.status);
    console.log('  Stories generated:', response.data.stories_generated);
    console.log('  Stories created:', response.data.stories_created);

    // Check idempotency
    if (response.data.stories_created === 0 && response.data.stories_generated > 0) {
      console.log('  ✅ Idempotency working (no new stories on re-run)');
    }
  } catch (error) {
    console.log('  ❌ Error:', error.message);
  }

  // Step 3: Check for duplicates
  console.log('\n3. Duplicate Check:');
  const { data: afterStories } = await supabase
    .from('sd_backlog_map')
    .select('story_key')
    .eq('sd_id', 'SD-2025-09-EMB')
    .not('story_key', 'is', null);

  const storyKeys = new Set(afterStories?.map(s => s.story_key));
  const duplicates = afterStories?.length - storyKeys.size;

  console.log('  Total story records:', afterStories?.length || 0);
  console.log('  Unique story keys:', storyKeys.size);
  console.log('  Duplicates:', duplicates || 0);

  if (duplicates === 0) {
    console.log('  ✅ No duplicates (UNIQUE constraint working)');
  } else {
    console.log('  ❌ Duplicates found!');
  }

  // Step 4: Simulate webhook update
  console.log('\n4. Simulating Webhook Update:');

  const testResults = [
    { story_key: 'SD-2025-09-EMB:US-e8336f7b', status: 'passing' },
    { story_key: 'SD-2025-09-EMB:US-64f4d37b', status: 'passing' },
    { story_key: 'SD-2025-09-EMB:US-e92fdabc', status: 'passing' }
  ];

  for (const test of testResults) {
    await supabase
      .from('sd_backlog_map')
      .update({
        verification_status: test.status,
        last_verified_at: new Date().toISOString(),
        coverage_pct: 90,
        verification_source: {
          test_run: 'e2e-test',
          build_id: 'staging-build-002',
          timestamp: new Date().toISOString()
        }
      })
      .eq('story_key', test.story_key);
  }

  console.log('  Updated 3 stories to passing');

  // Step 5: Check release gate
  console.log('\n5. Release Gate Check:');
  const { data: gate } = await supabase
    .from('v_sd_release_gate')
    .select('*')
    .eq('sd_key', 'SD-2025-09-EMB')
    .single();

  if (gate) {
    console.log('  Ready:', gate.ready ? '✅' : '❌');
    console.log('  Passing:', gate.passing_count, '/', gate.total_stories);
    console.log('  Percentage:', gate.passing_pct + '%');
    console.log('  Target:', gate.coverage_target + '%');
  }

  // Step 6: Performance check
  console.log('\n6. Performance Check:');
  const perfStart = Date.now();

  await axios.get(`${API_URL}/api/stories?sd_key=SD-2025-09-EMB&limit=20`);

  const perfElapsed = Date.now() - perfStart;
  console.log('  GET /api/stories response time:', perfElapsed, 'ms');
  console.log('  Target P95: ≤ 200ms');
  console.log('  Result:', perfElapsed <= 200 ? '✅ PASS' : '❌ FAIL');

  // Final SQL queries
  console.log('\n7. SQL Verification Queries:\n');
  console.log('Run these in Supabase SQL Editor:');
  console.log(`
-- Story statuses
SELECT story_key, status,
       verification_source->>'build_id' as build_id,
       last_verified_at
FROM v_story_verification_status
WHERE sd_key='SD-2025-09-EMB'
ORDER BY sequence_no;

-- Release gate
SELECT ready, passing_count, total_stories,
       failing_count, not_run_count, passing_pct
FROM v_sd_release_gate
WHERE sd_key='SD-2025-09-EMB';
  `);

  console.log('\n=== E2E Test Complete ===');
}

// Run the test
testStoryAgent().catch(console.error);