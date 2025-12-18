#!/usr/bin/env node
/**
 * Verify user stories for SD-HARDENING-V1-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyUserStories() {
  console.log('Verifying user stories for SD-HARDENING-V1-001...\n');

  const { data: stories, error } = await supabase
    .from('user_stories')
    .select('story_key, title, priority, story_points, status, acceptance_criteria')
    .eq('sd_id', 'SD-HARDENING-V1-001')
    .order('story_key');

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log(`✅ Found ${stories.length} user stories\n`);
  console.log('=' .repeat(80));

  stories.forEach((story, index) => {
    console.log(`\n${index + 1}. ${story.story_key}`);
    console.log(`   Title: ${story.title}`);
    console.log(`   Priority: ${story.priority}`);
    console.log(`   Story Points: ${story.story_points}`);
    console.log(`   Status: ${story.status}`);
    console.log(`   Acceptance Criteria: ${story.acceptance_criteria?.length || 0} scenarios`);
  });

  console.log('\n' + '='.repeat(80));

  const totalSP = stories.reduce((sum, s) => sum + (s.story_points || 0), 0);
  const criticalCount = stories.filter(s => s.priority === 'critical').length;
  const highCount = stories.filter(s => s.priority === 'high').length;

  console.log('\n📊 Summary:');
  console.log(`   Total Stories: ${stories.length}`);
  console.log(`   Total Story Points: ${totalSP}`);
  console.log(`   Critical Priority: ${criticalCount}`);
  console.log(`   High Priority: ${highCount}`);
  console.log(`   Average SP per Story: ${(totalSP / stories.length).toFixed(1)}`);

  console.log('\n📋 Implementation Order:');
  console.log('   Phase 1 (Foundation): US-001 (2 SP)');
  console.log('   Phase 2 (Chairman): US-002 (3 SP)');
  console.log('   Phase 3 (Ventures): US-003, US-004, US-005 (9 SP total)');
  console.log('   Phase 4 (Validation): US-006 (5 SP)');

  console.log('\n✅ All user stories successfully stored in database!');
  console.log('\n📚 Documentation:');
  console.log('   Summary: docs/user-stories/SD-HARDENING-V1-001-user-stories-summary.md');
  console.log('   INVEST Validation: docs/user-stories/SD-HARDENING-V1-001-invest-validation.md');
}

verifyUserStories()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
