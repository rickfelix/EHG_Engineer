#!/usr/bin/env node

/**
 * Check database constraints for LEO Protocol compliance
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('Checking schema constraints...\n');

  // 1. Check handoff_type constraint
  console.log('1. Handoff types (from existing records):');
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type')
    .limit(20);

  const types = [...new Set(handoffs?.map(h => h.handoff_type))];
  console.log('   Valid types:', types.join(', '));

  // 2. Check user_stories columns
  console.log('\n2. User stories schema:');
  const { data: userStory } = await supabase
    .from('user_stories')
    .select('*')
    .limit(1)
    .single();

  if (userStory) {
    console.log('   Columns:', Object.keys(userStory).join(', '));
    console.log('   Sample user_role:', userStory.user_role);
    console.log('   Sample status:', userStory.status);
  }

  // 3. Check sd_scope_deliverables columns
  console.log('\n3. Deliverables schema:');
  const { data: del } = await supabase
    .from('sd_scope_deliverables')
    .select('*')
    .limit(1)
    .single();

  if (del) {
    console.log('   Columns:', Object.keys(del).join(', '));
    console.log('   Sample completion_status:', del.completion_status);
  }

  // 4. Check retrospectives learning_category
  console.log('\n4. Retrospectives sample:');
  const { data: retro } = await supabase
    .from('retrospectives')
    .select('learning_category, retro_type')
    .limit(5);

  if (retro) {
    console.log('   Learning categories:', [...new Set(retro.map(r => r.learning_category))].join(', '));
    console.log('   Retro types:', [...new Set(retro.map(r => r.retro_type))].join(', '));
  }

  // 5. Check what deliverables exist for this SD
  console.log('\n5. Current SD deliverables:');
  const { data: sdDels } = await supabase
    .from('sd_scope_deliverables')
    .select('deliverable_name, completion_status')
    .eq('sd_id', 'SD-BLUEPRINT-ENGINE-001');

  if (sdDels) {
    sdDels.forEach(d => console.log(`   - ${d.deliverable_name}: ${d.completion_status}`));
  }

  console.log('\n');
}

check().catch(console.error);
