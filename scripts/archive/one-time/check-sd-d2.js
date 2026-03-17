#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const sdId = 'SD-VISION-TRANSITION-001D2';

  console.log('🔍 Checking SD-D2 State...\n');

  // Get SD details
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('📋 SD-D2 Details:');
  console.log('   ID:', sd.id);
  console.log('   UUID:', sd.uuid_id);
  console.log('   Title:', sd.title);
  console.log('   Description:', sd.description?.substring(0, 200) + '...');
  console.log('   Status:', sd.status);
  console.log('   Current Phase:', sd.current_phase);
  console.log('   Progress:', sd.progress + '%');
  console.log('   SD Type:', sd.sd_type);
  console.log('   Priority:', sd.priority);
  console.log('   Parent ID:', sd.parent_sd_id);
  console.log('   Strategic Objectives:', JSON.stringify(sd.strategic_objectives, null, 2)?.substring(0, 300));
  console.log('   Success Metrics:', JSON.stringify(sd.success_metrics, null, 2)?.substring(0, 300));

  // Check for existing PRD
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('prd_id, title, status')
    .eq('sd_id', sdId)
    .limit(1);

  console.log('\n📄 Existing PRD:', prd?.length > 0 ? prd[0] : 'None');

  // Check for existing handoffs
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, status, created_at')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n🔄 Handoffs:', handoffs?.length > 0 ? handoffs : 'None');

  // Check parent status
  if (sd.parent_sd_id) {
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, current_phase')
      .eq('id', sd.parent_sd_id)
      .single();

    console.log('\n👨‍👧 Parent SD:', parent);
  }

  // Check sibling status (other children of same parent)
  if (sd.parent_sd_id) {
    const { data: siblings } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, current_phase, progress')
      .eq('parent_sd_id', sd.parent_sd_id)
      .order('id');

    console.log('\n👨‍👧‍👦 Siblings:');
    siblings?.forEach(s => {
      const icon = s.status === 'completed' ? '✅' : (s.status === 'active' ? '🔄' : '⏳');
      console.log(`   ${icon} ${s.id}: ${s.status} (${s.current_phase}) - ${s.progress}%`);
    });
  }
}

main();
