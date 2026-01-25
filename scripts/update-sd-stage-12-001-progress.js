#!/usr/bin/env node

/**
 * Update SD-STAGE-12-001 Progress
 *
 * Marks all deliverables as 'completed' and all user stories as 'validated'
 * for SD-STAGE-12-001 since the work has been merged to main.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function updateProgress() {
  try {
    console.log('📊 Updating SD-STAGE-12-001 deliverables and user stories...\n');

    // 1. Update deliverables to 'completed' (correct column: completion_status)
    const { data: deliverables, error: delError } = await supabase
      .from('sd_scope_deliverables')
      .update({ completion_status: 'completed' })
      .eq('sd_id', 'SD-STAGE-12-001')
      .neq('completion_status', 'completed')
      .select();

    if (delError) {
      console.error('❌ Error updating deliverables:', delError);
    } else {
      console.log(`✅ Updated ${deliverables?.length || 0} deliverables to 'completed'`);
      if (deliverables && deliverables.length > 0) {
        deliverables.forEach(d => console.log(`   - ${d.deliverable_name}`));
      }
    }

    // 2. Update user stories to 'validated'
    const { data: stories, error: storiesError } = await supabase
      .from('user_stories')
      .update({ validation_status: 'validated' })
      .eq('sd_id', 'SD-STAGE-12-001')
      .neq('validation_status', 'validated')
      .select();

    if (storiesError) {
      console.error('❌ Error updating user stories:', storiesError);
    } else {
      console.log(`\n✅ Updated ${stories?.length || 0} user stories to 'validated'`);
      if (stories && stories.length > 0) {
        stories.forEach(s => console.log(`   - ${s.title}`));
      }
    }

    console.log('\n📈 Summary:');
    console.log(`   Deliverables updated: ${deliverables?.length || 0}`);
    console.log(`   User stories updated: ${stories?.length || 0}`);

    // 3. Query final progress to verify
    const { data: sdProgress, error: progressError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, progress_percentage')
      .eq('id', 'SD-STAGE-12-001')
      .single();

    if (progressError) {
      console.error('❌ Error fetching progress:', progressError);
    } else {
      console.log(`\n📊 Current overall progress: ${sdProgress.progress_percentage}%`);
      console.log(`   SD: ${sdProgress.id} - ${sdProgress.title}`);
    }

  } catch (_err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

updateProgress();
