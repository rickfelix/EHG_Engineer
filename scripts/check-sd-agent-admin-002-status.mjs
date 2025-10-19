import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkSDStatus() {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-AGENT-ADMIN-002')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n📋 SD-AGENT-ADMIN-002 Status Check');
  console.log('═'.repeat(60));
  console.log(`SD Key: ${sd.sd_key}`);
  console.log(`Title: ${sd.title}`);
  console.log(`Status: ${sd.status}`);
  console.log(`Progress: ${sd.progress}%`);
  console.log(`Priority: ${sd.priority}`);
  console.log(`Current Phase: ${sd.current_phase}`);
  console.log(`Created: ${new Date(sd.created_at).toLocaleDateString()}`);
  console.log(`Updated: ${new Date(sd.updated_at).toLocaleDateString()}`);

  console.log('\n📊 Completion Status:');
  if (sd.status === 'completed') {
    console.log('✅ SD is marked as COMPLETED');
  } else if (sd.status === 'closed') {
    console.log('✅ SD is marked as CLOSED');
  } else {
    console.log(`⚠️  SD status is: ${sd.status.toUpperCase()}`);
    console.log(`   (Expected: "completed" or "closed")`);
  }

  if (sd.progress === 100) {
    console.log('✅ Progress is at 100%');
  } else {
    console.log(`⚠️  Progress is at ${sd.progress}%`);
  }

  console.log('\n🔍 Related Data:');

  // Check for PRD
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, status, metadata')
    .eq('directive_id', sd.id)
    .single();

  if (prd) {
    console.log(`✅ PRD exists (Status: ${prd.status})`);
    if (prd.metadata?.testing) {
      console.log(`   - E2E Tests: ${prd.metadata.testing.tier2_e2e_tests?.count || 0} tests`);
      console.log(`   - User Stories: ${prd.metadata.testing.user_stories?.total || 0} stories`);
      console.log(`   - Coverage: ${prd.metadata.testing.tier2_e2e_tests?.coverage || 'N/A'}`);
    }
  }

  // Check for retrospective
  const { data: retro } = await supabase
    .from('retrospectives')
    .select('id, quality_score, key_learnings, what_went_well')
    .eq('sd_id', sd.id)
    .single();

  if (retro) {
    console.log(`✅ Retrospective exists (Quality: ${retro.quality_score}/100)`);
    console.log(`   - Key Learnings: ${retro.key_learnings?.length || 0}`);
    console.log(`   - Successes: ${retro.what_went_well?.length || 0}`);
  }

  // Check user stories
  const { data: stories, count: storyCount } = await supabase
    .from('sd_backlog_map')
    .select('*', { count: 'exact' })
    .eq('sd_id', sd.id);

  if (storyCount > 0) {
    console.log(`✅ User Stories: ${storyCount} stories in backlog`);
  }

  console.log('\n🎯 Recommendation:');
  if (sd.status === 'completed' && sd.progress === 100) {
    console.log('✅ SD is properly completed and can be closed');
    console.log('   Status: READY FOR ARCHIVAL');
  } else if (sd.status === 'closed') {
    console.log('✅ SD is already closed');
  } else {
    console.log('⚠️  SD needs status update to "completed"');
    console.log(`   Current: ${sd.status}, Progress: ${sd.progress}%`);
  }
}

checkSDStatus().catch(console.error);
