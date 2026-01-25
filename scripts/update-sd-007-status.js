#!/usr/bin/env node

/**
 * Update PRD and User Story statuses for SD-FOUNDATION-V3-007
 * Mark PRD as verification and all user stories as completed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function update() {
  const sdId = 'SD-FOUNDATION-V3-007';

  console.log('Updating statuses for', sdId);

  // Get SD UUID
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
    .single();

  if (sdError || !sd) {
    console.error('SD not found:', sdError?.message);
    return;
  }

  console.log('SD UUID:', sd.id);

  // Update PRD status to 'verification'
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .update({ status: 'verification' })
    .eq('sd_id', sd.id)
    .select()
    .single();

  if (prdError) {
    console.log('PRD update error:', prdError.message);
  } else {
    console.log('✅ PRD status updated to verification:', prd.id);
  }

  // Mark all user stories as completed
  const { data: stories, error: storiesError } = await supabase
    .from('user_stories')
    .update({ status: 'completed' })
    .eq('sd_id', sd.id)
    .select('id, story_key, status');

  if (storiesError) {
    console.log('Stories update error:', storiesError.message);
  } else {
    console.log(`✅ Updated ${stories?.length || 0} user stories to completed`);
    stories?.forEach(s => console.log(`   - ${s.story_key}: ${s.status}`));
  }
}

update().catch(console.error);
